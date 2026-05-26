import { FormEvent, useState } from 'react';
import type { JoinMeetingResponse, MediaControlPayload } from '@rtclive/shared';
import { api } from '../../lib/api';

// 主持人控制面板负责会议级操作；单个参与者操作同时出现在视频卡片上。
export function AdminPanel({
  join,
  participants,
  onDissolved,
}: {
  join: JoinMeetingResponse;
  participants: MediaControlPayload[];
  onDissolved: () => void;
}) {
  const [message, setMessage] = useState('');
  const targets = participants.filter((participant) => participant.identity !== join.identity);

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setMessage('');
    try {
      // 所有管理接口都补上主持人的会议内凭据，后端会用 requireHost 做最终权限校验。
      await api.admin(join.roomCode, action, {
        identity: join.identity,
        participantKey: join.participantKey,
        ...payload,
      });
      setMessage('操作成功');
    } catch (error: any) {
      setMessage(error.message || '操作失败');
    }
  }

  async function lock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // 媒体锁只更新一个媒体类型，服务端会保留其他媒体类型的锁定状态。
    await call('media-lock', {
      targetIdentity: String(form.get('targetIdentity') ?? ''),
      mediaType: String(form.get('mediaType') ?? 'audio'),
      locked: form.get('locked') === 'on',
    });
  }

  return (
    <section className="panel admin-panel">
      <h3>主持人控制</h3>
      <div className="admin-actions">
        {/* 禁言/白板/解散是会议级操作，不需要额外目标参与者。 */}
        <button onClick={() => call('all-chat-mute', { muted: true })}>全员禁言</button>
        <button onClick={() => call('all-chat-mute', { muted: false })}>解除全员禁言</button>
        <button onClick={() => call('whiteboard-clear')}>清空白板</button>
        <button className="danger" onClick={async () => { await api.dissolve(join); onDissolved(); }}>解散会议</button>
      </div>
      {/* 媒体控制目前按 identity 定向，适合验收阶段手动测试主持人控制能力。 */}
      <form className="stack compact" onSubmit={lock}>
        <select name="targetIdentity" required>
          <option value="">选择参会者</option>
          {targets.map((participant) => (
            <option key={participant.identity} value={participant.identity}>
              {participant.displayName || participant.identity}
            </option>
          ))}
        </select>
        <select name="mediaType">
          <option value="audio">麦克风</option>
          <option value="video">摄像头</option>
          <option value="screen">屏幕共享</option>
        </select>
        <label className="checkbox"><input name="locked" type="checkbox" /> 锁定</label>
        <button>应用媒体控制</button>
      </form>
      {message && <p className="message">{message}</p>}
    </section>
  );
}
