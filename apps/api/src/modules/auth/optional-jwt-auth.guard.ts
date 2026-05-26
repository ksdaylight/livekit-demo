import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { readAuthorizationHeader, resolveAccessTokenUser } from './access-token-user';

@Injectable()
// 可选登录态守卫：没有 Authorization 时允许匿名访问，有 token 时校验并写入 request.user。
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined>; user?: unknown }>();
    const header = readAuthorizationHeader(request.headers);
    if (!header) {
      return true;
    }
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('登录凭证无效或已过期');
    }

    request.user = await resolveAccessTokenUser(
      header.slice(7),
      this.jwt,
      this.config,
      this.prisma,
    );
    return true;
  }
}
