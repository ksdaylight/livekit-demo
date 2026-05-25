import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// JWT Guard 写入 request.user 后，控制器只暴露这几个安全字段。
export interface RequestUser {
  id: string;
  email: string;
  displayName: string;
}

// 控制器参数装饰器，避免每个接口手动从 request 上读取 user。
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
  return request.user;
});
