import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../../shared/auth-user.decorator';

export function readAuthorizationHeader(headers: Record<string, string | string[] | undefined>) {
  const header = headers.authorization;
  return Array.isArray(header) ? header[0] : header;
}

export async function resolveAccessTokenUser(
  token: string,
  jwt: JwtService,
  config: ConfigService,
  prisma: PrismaService,
): Promise<RequestUser> {
  try {
    // access token 只保存 user id，真正的用户状态仍然回查数据库，支持停用账号即时生效。
    const payload = await jwt.verifyAsync<{ sub: string }>(token, {
      secret: config.get<string>('JWT_ACCESS_SECRET'),
    });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('账号不可用');
    }
    return { id: user.id, email: user.email, displayName: user.displayName };
  } catch {
    throw new UnauthorizedException('登录凭证无效或已过期');
  }
}
