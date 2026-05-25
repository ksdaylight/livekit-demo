import { z } from 'zod';

// 会议号在系统内统一为 4 位大写字母/数字；transform 保证前端输入小写时也能正常匹配。
export const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{4}$/, '会议号必须是 4 位字母或数字')
  .transform((value) => value.toUpperCase());

// 用户对外展示的昵称。长度限制主要用于保护会议顶部栏、参与者列表等紧凑 UI。
export const displayNameSchema = z.string().trim().min(1, '请输入昵称').max(20, '昵称不能超过20个字符');
// 会议密码允许为空；为空时会议无需密码加入，非空时由 API 负责哈希后存储。
export const meetingPasswordSchema = z.string().trim().max(32, '会议密码不能超过32个字符').optional();
// 邮箱统一转小写，避免同一个邮箱因为大小写不同被注册成多个账号。
export const emailSchema = z.string().trim().email('请输入有效邮箱').toLowerCase();
// Argon2 会处理实际哈希强度；这里限制最大长度，避免超长输入造成不必要的计算开销。
export const passwordSchema = z.string().min(8, '密码至少 8 位').max(72, '密码不能超过72个字符');

// 注册接口输入：账号体系只收邮箱、密码和展示名，角色由后端根据创建/加入会议决定。
export const authRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

// 登录接口输入：登录时密码只要求非空，复杂度校验只在注册/改密时执行。
export const authLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码'),
});

// 刷新 access token 时只需要 refresh token；token 有效性和撤销状态由 API 查询数据库判断。
export const authRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// 创建会议时由主持人指定会议号、标题和可选密码；会议号会被标准化为大写。
export const createMeetingSchema = z.object({
  roomCode: roomCodeSchema,
  title: z.string().trim().min(1, '请输入会议标题').max(80, '会议标题不能超过80个字符'),
  password: meetingPasswordSchema,
});

// 游客加入会议只需要昵称和可选会议密码；主持人身份由登录态和会议 hostId 决定。
export const joinMeetingSchema = z.object({
  displayName: displayNameSchema,
  password: meetingPasswordSchema,
});

// 会议内操作的通用凭据。identity 是 LiveKit/WebSocket 侧身份，participantKey 是加入会议后下发的短期密钥。
export const participantCredentialSchema = z.object({
  identity: z.string().trim().min(1),
  participantKey: z.string().trim().min(16),
});

// 离会只需要证明当前参与者身份，不需要额外业务字段。
export const leaveMeetingSchema = participantCredentialSchema;

// 主持人修改会议密码；空值表示清除密码，后端会同时校验调用者是否为主持人。
export const updateMeetingPasswordSchema = participantCredentialSchema.extend({
  password: meetingPasswordSchema,
});

// 踢人操作需要调用者凭据和目标参与者 identity；权限判断集中在 API 服务层。
export const kickParticipantSchema = participantCredentialSchema.extend({
  targetIdentity: z.string().trim().min(1),
});

// 单人禁言/解除禁言。muted=true 表示该参与者不能继续发送聊天消息。
export const updateChatMuteSchema = participantCredentialSchema.extend({
  targetIdentity: z.string().trim().min(1),
  muted: z.boolean(),
});

// 全员禁言只影响 guest 发送聊天；主持人仍可发消息并执行管理操作。
export const updateAllChatMuteSchema = participantCredentialSchema.extend({
  muted: z.boolean(),
});

// 可被主持人锁定的媒体类型，分别对应麦克风、摄像头和屏幕共享。
export const mediaTypeSchema = z.enum(['audio', 'video', 'screen']);

// 媒体锁用于主持人强制关闭某个参与者的音频、视频或屏幕共享权限。
export const updateMediaLockSchema = participantCredentialSchema.extend({
  targetIdentity: z.string().trim().min(1),
  mediaType: mediaTypeSchema,
  locked: z.boolean(),
});

// 清空白板是主持人级操作；具体权限由后端服务根据 participantCredential 判断。
export const clearWhiteboardSchema = participantCredentialSchema;

// 下面的类型全部由 Zod Schema 推导，保证前端表单、API 入参和测试使用同一份约束。
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

// 登录/刷新成功后返回给浏览器的双 token；refresh token 会在服务端存哈希用于撤销。
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// 登录态用户的最小公开信息。密码哈希、状态等敏感字段不会出现在响应里。
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

// 加入会议成功后的完整上下文，前端依赖它建立 LiveKit 连接和三条业务 WebSocket。
export interface JoinMeetingResponse {
  /** 标准化后的 4 位会议号。 */
  roomCode: string;
  /** 会议标题，用于顶部栏和会议列表展示。 */
  title: string;
  /** 当前参与者在会议内的唯一身份，也是 LiveKit token 的 subject。 */
  identity: string;
  /** 当前参与者展示名。 */
  displayName: string;
  /** 参与者后续调用会议内接口/WebSocket 时使用的短期凭据。 */
  participantKey: string;
  /** host 可以执行管理操作，guest 只能参与会议互动。 */
  role: 'host' | 'guest';
  /** 浏览器使用的 LiveKit 信令地址；same-origin 表示走当前站点 /rtc 代理。 */
  livekitUrl: string;
  /** LiveKit 房间加入 token，由 API 使用服务端密钥签发。 */
  livekitToken: string;
  /** 用于前端提示会议当前是否受密码保护。 */
  roomPasswordProtected: boolean;
}

// 公开会议列表条目，只暴露仍在进行中的会议和非敏感统计信息。
export interface ActiveMeetingSummary {
  roomCode: string;
  title: string;
  passwordProtected: boolean;
  participantCount: number;
  hostDisplayName: string;
  createdAt: string;
}

// 主持人历史会议条目，在活动会议摘要基础上增加生命周期状态和解散时间。
export interface HostMeetingHistoryItem extends ActiveMeetingSummary {
  status: 'active' | 'dissolved' | 'expired';
  dissolvedAt: string | null;
}

// 管理面板中的参与者摘要，包含角色、媒体锁状态和离会状态。
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
