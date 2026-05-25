import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';

@Catch()
// 全局异常过滤器：统一 HTTP 错误响应结构，避免不同异常返回形态不一致。
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Nest 的 getResponse 可能是字符串或对象，这里统一补齐 statusCode。
      const payload =
        typeof body === 'object'
          ? { statusCode: status, ...(body as Record<string, unknown>) }
          : { statusCode: status, message: body };
      return response.status(status).send(payload);
    }

    // 非预期异常不把内部堆栈暴露给浏览器。
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '服务器内部错误',
    });
  }
}
