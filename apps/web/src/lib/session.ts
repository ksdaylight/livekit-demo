import type { JoinMeetingResponse } from '@rtclive/shared';

const KEY = 'rtclive:join';

export function saveJoin(join: JoinMeetingResponse) {
  sessionStorage.setItem(KEY, JSON.stringify(join));
}

export function readJoin(): JoinMeetingResponse | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JoinMeetingResponse;
  } catch {
    return null;
  }
}

export function clearJoin() {
  sessionStorage.removeItem(KEY);
}
