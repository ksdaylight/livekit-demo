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

const TOKEN_KEY = 'rtclive:tokens';

export function readTokens(): AuthTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: AuthTokens | null) {
  if (!tokens) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

async function request<T>(url: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (auth) {
    const token = readTokens()?.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
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

export const api = {
  async register(input: AuthRegisterInput) {
    const result = await request<{ user: AuthUser; tokens: AuthTokens }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    writeTokens(result.tokens);
    return result;
  },
  async login(input: AuthLoginInput) {
    const result = await request<{ user: AuthUser; tokens: AuthTokens }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
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
    return request(`/api/v1/meetings/${join.roomCode}/leave`, {
      method: 'POST',
      body: JSON.stringify({ identity: join.identity, participantKey: join.participantKey }),
    });
  },
  dissolve(join: JoinMeetingResponse) {
    return request(`/api/v1/meetings/${join.roomCode}/dissolve`, {
      method: 'POST',
      body: JSON.stringify({ identity: join.identity, participantKey: join.participantKey }),
    });
  },
  admin(roomCode: string, action: string, payload: unknown) {
    return request(`/api/v1/meetings/${roomCode}/admin/${action}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
