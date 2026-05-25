import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { authLoginSchema, authRefreshSchema, authRegisterSchema } from '@rtclive/shared';
import { CurrentUser, RequestUser } from '../../shared/auth-user.decorator';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
// 账号接口只负责 HTTP 形态和参数校验，密码哈希、token 轮换等逻辑在 AuthService 内。
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  // 注册成功后直接返回用户信息和双 token，前端可立即进入登录态。
  register(@Body(new ZodValidationPipe(authRegisterSchema)) body: any) {
    return this.auth.register(body);
  }

  @Post('login')
  // 登录使用邮箱和密码，错误信息保持模糊，避免泄露邮箱是否存在。
  login(@Body(new ZodValidationPipe(authLoginSchema)) body: any) {
    return this.auth.login(body);
  }

  @Post('refresh')
  // refresh 会撤销旧 refresh token 并签发新 token，降低长期 token 泄露后的风险窗口。
  refresh(@Body(new ZodValidationPipe(authRefreshSchema)) body: any) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  // 登出只需要撤销 refresh token；access token 等待短 TTL 自然过期。
  logout(@Body(new ZodValidationPipe(authRefreshSchema)) body: any) {
    return this.auth.logout(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  // 用于前端刷新页面后恢复当前用户信息。
  me(@CurrentUser() user: RequestUser) {
    return { user };
  }
}
