import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  // Prisma 是全局模块，业务模块无需重复 imports 也能注入 PrismaService。
  exports: [PrismaService],
})
export class PrismaModule {}
