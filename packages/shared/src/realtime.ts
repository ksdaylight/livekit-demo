import { z } from 'zod';

export const wsAuthQuerySchema = z.object({
  identity: z.string().min(1),
  participantKey: z.string().min(16),
});

export const chatClientMessageSchema = z.object({
  type: z.literal('chat.send'),
  content: z.string().trim().min(1).max(500),
});

export const whiteboardStrokePayloadSchema = z.object({
  id: z.string().min(1),
  color: z.string().min(1).default('#ff5f57'),
  width: z.number().min(1).max(32),
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(1).max(320),
  createdAt: z.number().optional(),
});

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

export const whiteboardClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('whiteboard.stroke.add'), stroke: whiteboardStrokePayloadSchema }),
  z.object({ type: z.literal('whiteboard.image.add'), image: whiteboardImagePayloadSchema }),
  z.object({ type: z.literal('whiteboard.stroke.undo'), strokeId: z.string().min(1) }),
  z.object({ type: z.literal('whiteboard.image.undo'), imageId: z.string().min(1) }),
]);

export const fileClientMessageSchema = z.object({
  type: z.literal('file.ack'),
  fileId: z.string().min(1),
});

export type ChatClientMessage = z.infer<typeof chatClientMessageSchema>;
export type WhiteboardClientMessage = z.infer<typeof whiteboardClientMessageSchema>;
export type FileClientMessage = z.infer<typeof fileClientMessageSchema>;

export interface ChatMessagePayload {
  messageId: string;
  roomCode: string;
  senderIdentity: string;
  senderDisplayName: string;
  content: string;
  createdAt: string;
}

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

export interface MediaControlPayload {
  identity: string;
  displayName: string;
  audioLocked: boolean;
  videoLocked: boolean;
  screenLocked: boolean;
}

export interface WhiteboardEventPayload {
  eventId: string;
  type: 'stroke_add' | 'image_add' | 'stroke_undo' | 'image_undo' | 'board_clear';
  authorIdentity: string;
  authorDisplayName: string;
  payload: unknown;
  createdAt: string;
}

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
