import { BadRequestException, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'stream';
import { FileService } from './file.service';

@Controller('meetings/:roomCode/files')
export class FileController {
  constructor(private readonly files: FileService) {}

  @Post()
  async upload(@Param('roomCode') roomCode: string, @Req() request: FastifyRequest) {
    const data = await request.file();
    if (!data) throw new BadRequestException('缺少上传文件');
    const fields = data.fields as Record<string, any>;
    const buffer = await data.toBuffer();
    return this.files.upload({
      roomCode,
      identity: fields.identity?.value,
      participantKey: fields.participantKey?.value,
      targetIdentity: fields.targetIdentity?.value,
      fileName: data.filename,
      contentType: data.mimetype,
      buffer,
    });
  }

  @Get(':fileId/download')
  async download(
    @Param('roomCode') roomCode: string,
    @Param('fileId') fileId: string,
    @Query('identity') identity: string,
    @Query('participantKey') participantKey: string,
    @Res() reply: FastifyReply,
  ) {
    const { file, object } = await this.files.download(roomCode, identity, participantKey, fileId);
    reply.header('content-type', file.contentType);
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    return reply.send(object.Body as Readable);
  }
}
