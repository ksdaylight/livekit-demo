import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { authLoginSchema, authRefreshSchema, authRegisterSchema } from '@rtclive/shared';
import { CurrentUser, RequestUser } from '../../shared/auth-user.decorator';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body(new ZodValidationPipe(authRegisterSchema)) body: any) {
    return this.auth.register(body);
  }

  @Post('login')
  login(@Body(new ZodValidationPipe(authLoginSchema)) body: any) {
    return this.auth.login(body);
  }

  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(authRefreshSchema)) body: any) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  logout(@Body(new ZodValidationPipe(authRefreshSchema)) body: any) {
    return this.auth.logout(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return { user };
  }
}
