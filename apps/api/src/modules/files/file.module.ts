import { Module } from '@nestjs/common';
import { ParticipantModule } from '../participants/participant.module';
import { StorageModule } from '../storage/storage.module';
import { FileController } from './file.controller';
import { FileGateway } from './file.gateway';
import { FileService } from './file.service';

@Module({
  // 文件模块需要参与者校验和对象存储能力。
  imports: [ParticipantModule, StorageModule],
  controllers: [FileController],
  providers: [FileService, FileGateway],
})
export class FileModule {}
