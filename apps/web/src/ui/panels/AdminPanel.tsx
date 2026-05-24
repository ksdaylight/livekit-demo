import { FormEvent, useState } from 'react';
import type { JoinMeetingResponse } from '@rtclive/shared';
import { api } from '../../lib/api';

export function AdminPanel({ join, onDissolved }: { join: JoinMeetingResponse; onDissolved: () => void }) {
  const [message, setMessage] = useState('');

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setMessage('');
    try {
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
        <button onClick={() => call('all-chat-mute', { muted: true })}>全员禁言</button>
        <button onClick={() => call('all-chat-mute', { muted: false })}>解除全员禁言</button>
        <button onClick={() => call('whiteboard-clear')}>清空白板</button>
        <button className="danger" onClick={async () => { await api.dissolve(join); onDissolved(); }}>解散会议</button>
      </div>
      <form className="stack compact" onSubmit={lock}>
        <input name="targetIdentity" placeholder="目标 identity" />
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
