import type {
  ActiveMeetingSummary,
  AuthLoginInput,
  AuthRegisterInput,
  AuthTokens,
  AuthUser,
  CreateMeetingInput,
  HostMeetingHistoryItem,
  JoinMeetingInput,
  JoinMeetingResponse,
} from '@rtclive/shared';

// 浏览器本地保存登录 token。加入会议的 participantKey 另存在 sessionStorage，二者生命周期不同。
const TOKEN_KEY = 'rtclive:tokens';

// 从 localStorage 恢复登录 token；解析失败时返回 null，避免损坏数据让页面崩溃。
export function readTokens(): AuthTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

// 写入或清除登录 token。传 null 表示退出登录/清空本机登录态。
export function writeTokens(tokens: AuthTokens | null) {
  if (!tokens) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

// 统一的 fetch 封装：处理 JSON 请求头、可选 Bearer token、错误消息提取和响应 JSON 解析。
async function request<T>(url: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(init.headers);
  // FormData 由浏览器自动生成 multipart boundary，不能手动设置 content-type。
  if (!(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (auth) {
    const token = readTokens()?.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      // 后端统一返回 message 字段；如果不是 JSON，再退回读取文本。
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// 页面层只通过 api 对象访问后端，避免各组件重复拼 URL 和处理 token。
export const api = {
  async register(input: AuthRegisterInput) {
    const result = await request<{ user: AuthUser; tokens: AuthTokens }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    // 注册成功即登录，把双 token 持久化到 localStorage。
    writeTokens(result.tokens);
    return result;
  },
  async login(input: AuthLoginInput) {
    const result = await request<{ user: AuthUser; tokens: AuthTokens }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    // 登录成功后保存 token，后续创建会议/历史接口会自动带 Authorization。
    writeTokens(result.tokens);
    return result;
  },
  me() {
    return request<{ user: AuthUser }>('/api/v1/auth/me', {}, true);
  },
  createMeeting(input: CreateMeetingInput) {
    return request<JoinMeetingResponse>(
      '/api/v1/meetings',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  },
  activeMeetings() {
    return request<ActiveMeetingSummary[]>('/api/v1/meetings/active');
  },
  history() {
    return request<HostMeetingHistoryItem[]>('/api/v1/host/meetings/history', {}, true);
  },
  join(roomCode: string, input: JoinMeetingInput) {
    return request<JoinMeetingResponse>(`/api/v1/meetings/${roomCode}/join`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  leave(join: JoinMeetingResponse) {
    // 游客没有登录态，离会用会议内 identity + participantKey 证明身份。
    return request(`/api/v1/meetings/${join.roomCode}/leave`, {
      method: 'POST',
      body: JSON.stringify({ identity: join.identity, participantKey: join.participantKey }),
    });
  },
  dissolve(join: JoinMeetingResponse) {
    // 解散会议是主持人会议内操作，同样使用 participantKey 由后端校验 host 身份。
    return request(`/api/v1/meetings/${join.roomCode}/dissolve`, {
      method: 'POST',
      body: JSON.stringify({ identity: join.identity, participantKey: join.participantKey }),
    });
  },
  admin(roomCode: string, action: string, payload: unknown) {
    // 管理接口 action 由 AdminPanel 控制，payload 会补上主持人的会议内凭据。
    return request(`/api/v1/meetings/${roomCode}/admin/${action}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
