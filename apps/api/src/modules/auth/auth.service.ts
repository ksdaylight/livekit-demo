import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { AuthLoginInput, AuthRegisterInput, AuthTokens, AuthUser } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
// 账号服务：负责用户注册登录、access token 签发、refresh token 存储/轮换/撤销。
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: AuthRegisterInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('邮箱已注册');
    }

    // 密码使用 Argon2id 哈希，数据库只保存哈希结果。
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
      },
    });
    return { user: this.toAuthUser(user), tokens: await this.issueTokens(user.id, user.email) };
  }

  async login(input: AuthLoginInput): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    // verify 会根据哈希中保存的参数校验密码，不需要单独保存 salt。
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    return { user: this.toAuthUser(user), tokens: await this.issueTokens(user.id, user.email) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('刷新凭证无效');
    }
    // refresh token 单次使用：刷新成功后立即撤销旧 token，再签发新的双 token。
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
    return this.issueTokens(user.id, user.email);
  }

  async logout(refreshToken: string) {
    // updateMany 让重复登出保持幂等：token 不存在或已撤销时也返回 ok。
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  private async issueTokens(userId: string, email: string): Promise<AuthTokens> {
    // access token 短期有效，不入库；服务端只用 JWT secret 校验。
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    // refresh token 使用高熵随机值，返回明文给客户端，服务端只保存 sha256 哈希。
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    return { accessToken, refreshToken };
  }

  private refreshTtlMs() {
    const raw = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';
    // 当前配置只解析 Nd 格式，未识别时回落到 7 天，避免配置错误导致 token 永不过期。
    const days = /^(\d+)d$/.exec(raw)?.[1];
    if (days) return Number(days) * 24 * 60 * 60 * 1000;
    return 7 * 24 * 60 * 60 * 1000;
  }

  private hashToken(token: string) {
    // refresh token 类似密码，数据库不保存可直接使用的明文凭据。
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthUser(user: { id: string; email: string; displayName: string }): AuthUser {
    // 响应对象只包含公开字段，避免误把 passwordHash/status 等内部字段返回给前端。
    return { id: user.id, email: user.email, displayName: user.displayName };
  }
}
