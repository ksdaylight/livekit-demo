import { BadRequestException, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'stream';
import { FileService } from './file.service';

@Controller('meetings/:roomCode/files')
// 文件 HTTP 控制器：上传和下载使用 HTTP，文件消息同步使用 FileGateway 的 WebSocket。
export class FileController {
  constructor(private readonly files: FileService) {}

  @Post()
  async upload(@Param('roomCode') roomCode: string, @Req() request: FastifyRequest) {
    // request.file() 由 Fastify multipart 插件提供，一次只处理一个上传文件。
    const data = await request.file();
    if (!data) throw new BadRequestException('缺少上传文件');
    const fields = data.fields as Record<string, any>;
    // identity/participantKey/targetIdentity 作为 multipart 字段提交，文件本体在 data 中。
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
    // 下载响应保留原 content-type，并使用 attachment 触发浏览器下载。
    reply.header('content-type', file.contentType);
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    return reply.send(object.Body as Readable);
  }
}
