import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
// 清理任务服务。当前只标记超出保留期的已结束会议，未来可扩展为删除对象存储文件。
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireOldMeetings() {
    const retentionDays = Number(this.config.get('RETENTION_DAYS') ?? 30);
    // cutoff 之前已经解散或过期的会议会再次标记为 expired，便于后续统一清理。
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.meeting.updateMany({
      where: {
        status: { in: ['dissolved', 'expired'] },
        OR: [{ dissolvedAt: { lt: cutoff } }, { expiredAt: { lt: cutoff } }],
      },
      data: { status: 'expired' },
    });
    this.logger.log(`cleanup marked ${result.count} meetings as expired`);
  }
}
