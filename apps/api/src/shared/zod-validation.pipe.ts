import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

// Nest 管道：把 @rtclive/shared 中的 Zod Schema 接到控制器入参上。
// 这样前后端表单和 API 校验可以共享同一份字段规则。
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // 保留 Zod issues，前端调试或后续做字段级错误展示时可以直接使用。
      throw new BadRequestException({
        message: '请求参数校验失败',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
