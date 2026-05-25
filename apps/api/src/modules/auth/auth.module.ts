import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  // JwtModule 不在这里写死 secret，而是由 AuthService/JwtAuthGuard 从 ConfigService 动态读取。
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // 导出 JwtAuthGuard，其他模块可以用 @UseGuards(JwtAuthGuard) 保护接口。
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
