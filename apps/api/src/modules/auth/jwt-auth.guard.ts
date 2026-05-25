import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
// HTTP 登录态守卫。通过 Authorization: Bearer <accessToken> 验证用户并写入 request.user。
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少登录凭证');
    }

    try {
      // access token 只保存 user id，真正的用户状态仍然回查数据库，支持停用账号即时生效。
      const payload = await this.jwt.verifyAsync<{ sub: string }>(header.slice(7), {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('账号不可用');
      }
      // 控制器通过 @CurrentUser() 读取该对象。
      request.user = { id: user.id, email: user.email, displayName: user.displayName };
      return true;
    } catch {
      throw new UnauthorizedException('登录凭证无效或已过期');
    }
  }
}
