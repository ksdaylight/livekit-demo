import { BadRequestException, Controller, Param, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { WhiteboardService } from './whiteboard.service';

@Controller('meetings/:roomCode/whiteboard/images')
export class WhiteboardController {
  constructor(private readonly whiteboard: WhiteboardService) {}

  @Post()
  async upload(@Param('roomCode') roomCode: string, @Req() request: FastifyRequest) {
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
