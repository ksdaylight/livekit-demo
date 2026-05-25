import type { JoinMeetingResponse } from '@rtclive/shared';

// 会议加入态只放 sessionStorage：刷新页面可以恢复会议页，关闭标签页后自动清理。
const KEY = 'rtclive:join';

// 保存加入会议后 API 返回的完整上下文，包括 LiveKit token 和 participantKey。
export function saveJoin(join: JoinMeetingResponse) {
  sessionStorage.setItem(KEY, JSON.stringify(join));
}

// 从当前标签页会话中恢复会议上下文；数据损坏时返回 null，让 App 回到入口页。
export function readJoin(): JoinMeetingResponse | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JoinMeetingResponse;
  } catch {
    return null;
  }
}

// 离开会议、会议解散或被踢出后清理加入态。
export function clearJoin() {
  sessionStorage.removeItem(KEY);
}
