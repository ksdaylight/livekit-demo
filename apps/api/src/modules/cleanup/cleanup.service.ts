import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireOldMeetings() {
    const retentionDays = Number(this.config.get('RETENTION_DAYS') ?? 30);
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
