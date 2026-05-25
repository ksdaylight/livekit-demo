import { BadRequestException, Controller, Param, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { WhiteboardService } from './whiteboard.service';

@Controller('meetings/:roomCode/whiteboard/images')
// 白板图片上传接口。上传成功后返回 imageId/imageUrl，再由 WebSocket 广播 image.add 事件。
export class WhiteboardController {
  constructor(private readonly whiteboard: WhiteboardService) {}

  @Post()
  async upload(@Param('roomCode') roomCode: string, @Req() request: FastifyRequest) {
    // 白板图片同样走 multipart，避免把大图塞进 WebSocket 消息。
    const data = await request.file();
    if (!data) throw new BadRequestException('缺少白板图片');
    const fields = data.fields as Record<string, any>;
    return this.whiteboard.uploadImage({
      roomCode,
      identity: fields.identity?.value,
      participantKey: fields.participantKey?.value,
      fileName: data.filename,
      contentType: data.mimetype,
      buffer: await data.toBuffer(),
    });
  }
}
