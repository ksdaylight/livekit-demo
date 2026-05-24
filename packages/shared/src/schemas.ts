import { z } from 'zod';

export const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{4}$/, '会议号必须是 4 位字母或数字')
  .transform((value) => value.toUpperCase());

export const displayNameSchema = z.string().trim().min(1, '请输入昵称').max(20, '昵称不能超过20个字符');
export const meetingPasswordSchema = z.string().trim().max(32, '会议密码不能超过32个字符').optional();
export const emailSchema = z.string().trim().email('请输入有效邮箱').toLowerCase();
export const passwordSchema = z.string().min(8, '密码至少 8 位').max(72, '密码不能超过72个字符');

export const authRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const authLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码'),
});

export const authRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const createMeetingSchema = z.object({
  roomCode: roomCodeSchema,
  title: z.string().trim().min(1, '请输入会议标题').max(80, '会议标题不能超过80个字符'),
  password: meetingPasswordSchema,
});

export const joinMeetingSchema = z.object({
  displayName: displayNameSchema,
  password: meetingPasswordSchema,
});

export const participantCredentialSchema = z.object({
  identity: z.string().trim().min(1),
  participantKey: z.string().trim().min(16),
});

export const leaveMeetingSchema = participantCredentialSchema;

export const updateMeetingPasswordSchema = participantCredentialSchema.extend({
  password: meetingPasswordSchema,
});

export const kickParticipantSchema = participantCredentialSchema.extend({
  targetIdentity: z.string().trim().min(1),
});

export const updateChatMuteSchema = participantCredentialSchema.extend({
  targetIdentity: z.string().trim().min(1),
  muted: z.boolean(),
});

export const updateAllChatMuteSchema = participantCredentialSchema.extend({
  muted: z.boolean(),
});

export const mediaTypeSchema = z.enum(['audio', 'video', 'screen']);

export const updateMediaLockSchema = participantCredentialSchema.extend({
  targetIdentity: z.string().trim().min(1),
  mediaType: mediaTypeSchema,
  locked: z.boolean(),
});

export const clearWhiteboardSchema = participantCredentialSchema;

export type AuthRegisterInput = z.infer<typeof authRegisterSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type AuthRefreshInput = z.infer<typeof authRefreshSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type JoinMeetingInput = z.infer<typeof joinMeetingSchema>;
export type LeaveMeetingInput = z.infer<typeof leaveMeetingSchema>;
export type UpdateMeetingPasswordInput = z.infer<typeof updateMeetingPasswordSchema>;
export type KickParticipantInput = z.infer<typeof kickParticipantSchema>;
export type UpdateChatMuteInput = z.infer<typeof updateChatMuteSchema>;
export type UpdateAllChatMuteInput = z.infer<typeof updateAllChatMuteSchema>;
export type UpdateMediaLockInput = z.infer<typeof updateMediaLockSchema>;
export type ClearWhiteboardInput = z.infer<typeof clearWhiteboardSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface JoinMeetingResponse {
  roomCode: string;
  title: string;
  identity: string;
  displayName: string;
  participantKey: string;
  role: 'host' | 'guest';
  livekitUrl: string;
  livekitToken: string;
  roomPasswordProtected: boolean;
}

export interface ActiveMeetingSummary {
  roomCode: string;
  title: string;
  passwordProtected: boolean;
  participantCount: number;
  hostDisplayName: string;
  createdAt: string;
}

export interface HostMeetingHistoryItem extends ActiveMeetingSummary {
  status: 'active' | 'dissolved' | 'expired';
  dissolvedAt: string | null;
}

export interface ParticipantSummary {
  identity: string;
  displayName: string;
  role: 'host' | 'guest';
  audioLocked: boolean;
  videoLocked: boolean;
  screenLocked: boolean;
  joinedAt: string;
  leftAt: string | null;
}
