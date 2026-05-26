import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { readAuthorizationHeader, resolveAccessTokenUser } from './access-token-user';

@Injectable()
// HTTP 登录态守卫。通过 Authorization: Bearer <accessToken> 验证用户并写入 request.user。
export class JwtAuthGuard implements CanActivate {
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
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少登录凭证');
    }

    // 控制器通过 @CurrentUser() 读取该对象。
    request.user = await resolveAccessTokenUser(
      header.slice(7),
      this.jwt,
      this.config,
      this.prisma,
    );
    return true;
  }
}
