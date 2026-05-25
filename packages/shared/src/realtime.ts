import { z } from 'zod';

// 所有业务 WebSocket 连接都使用相同的查询参数认证，避免每条通道重复设计凭据格式。
export const wsAuthQuerySchema = z.object({
  identity: z.string().min(1),
  participantKey: z.string().min(16),
});

// 聊天通道客户端消息。当前只允许发送普通文本，长度上限用于防止刷屏和超大 payload。
export const chatClientMessageSchema = z.object({
  type: z.literal('chat.send'),
  content: z.string().trim().min(1).max(500),
});

// 白板笔迹采用归一化坐标点，由前端根据画布尺寸转换；点数上限限制单次绘制的负载。
export const whiteboardStrokePayloadSchema = z.object({
  id: z.string().min(1),
  color: z.string().min(1).default('#ff5f57'),
  width: z.number().min(1).max(32),
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(1).max(320),
  createdAt: z.number().optional(),
});

// 白板图片事件只保存对象引用和布局信息，实际文件由 MinIO 提供下载。
export const whiteboardImagePayloadSchema = z.object({
  id: z.string().min(1),
  imageId: z.string().min(1),
  imageUrl: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().min(32),
  height: z.number().min(32),
  createdAt: z.number().optional(),
});

// 白板客户端消息使用 discriminated union，服务端可以按 type 精确分发和校验 payload。
export const whiteboardClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('whiteboard.stroke.add'), stroke: whiteboardStrokePayloadSchema }),
  z.object({ type: z.literal('whiteboard.image.add'), image: whiteboardImagePayloadSchema }),
  z.object({ type: z.literal('whiteboard.stroke.undo'), strokeId: z.string().min(1) }),
  z.object({ type: z.literal('whiteboard.image.undo'), imageId: z.string().min(1) }),
]);

// 文件通道目前只需要客户端确认收取，真正的上传走 HTTP multipart 接口。
export const fileClientMessageSchema = z.object({
  type: z.literal('file.ack'),
  fileId: z.string().min(1),
});

// 客户端消息类型由 Schema 推导，保证网关解析结果和业务服务使用同一套字段定义。
export type ChatClientMessage = z.infer<typeof chatClientMessageSchema>;
export type WhiteboardClientMessage = z.infer<typeof whiteboardClientMessageSchema>;
export type FileClientMessage = z.infer<typeof fileClientMessageSchema>;

// 聊天消息广播载荷。createdAt 使用 ISO 字符串，方便前端直接渲染和排序。
export interface ChatMessagePayload {
  messageId: string;
  roomCode: string;
  senderIdentity: string;
  senderDisplayName: string;
  content: string;
  createdAt: string;
}

// 文件消息广播载荷。target 为 null 表示群发，非 null 表示只发给指定参与者。
export interface FileMessagePayload {
  fileId: string;
  roomCode: string;
  senderIdentity: string;
  senderDisplayName: string;
  targetIdentity: string | null;
  targetDisplayName: string | null;
  fileName: string;
  fileSize: number;
  contentType: string;
  createdAt: string;
}

// 媒体控制广播载荷，前端据此禁用本地麦克风、摄像头或屏幕共享按钮。
export interface MediaControlPayload {
  identity: string;
  displayName: string;
  audioLocked: boolean;
  videoLocked: boolean;
  screenLocked: boolean;
}

// 白板事件的统一广播格式。payload 保持 unknown，具体结构由 type 决定。
export interface WhiteboardEventPayload {
  eventId: string;
  type: 'stroke_add' | 'image_add' | 'stroke_undo' | 'image_undo' | 'board_clear';
  authorIdentity: string;
  authorDisplayName: string;
  payload: unknown;
  createdAt: string;
}

// 服务端发给浏览器的所有业务 WebSocket 消息。snapshot 用于连接建立后的全量同步，
// event/message/control 用于后续增量广播，system.error 用于向客户端报告可恢复错误。
export type ServerWsMessage =
  | { type: 'chat.snapshot'; messages: ChatMessagePayload[]; allMuted: boolean; mutedParticipantIds: string[] }
  | { type: 'chat.message'; message: ChatMessagePayload }
  | { type: 'chat.moderation'; allMuted: boolean; mutedParticipantIds: string[] }
  | { type: 'file.snapshot'; messages: FileMessagePayload[] }
  | { type: 'file.message'; message: FileMessagePayload }
  | { type: 'whiteboard.snapshot'; events: WhiteboardEventPayload[] }
  | { type: 'whiteboard.event'; event: WhiteboardEventPayload }
  | { type: 'whiteboard.clear'; event: WhiteboardEventPayload }
  | { type: 'media.snapshot'; participants: MediaControlPayload[] }
  | { type: 'media.control'; participant: MediaControlPayload }
  | { type: 'system.error'; message: string };
