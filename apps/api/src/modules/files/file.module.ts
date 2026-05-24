import { Module } from '@nestjs/common';
import { ParticipantModule } from '../participants/participant.module';
import { StorageModule } from '../storage/storage.module';
import { FileController } from './file.controller';
import { FileGateway } from './file.gateway';
import { FileService } from './file.service';

@Module({
  imports: [ParticipantModule, StorageModule],
  controllers: [FileController],
  providers: [FileService, FileGateway],
})
export class FileModule {}
