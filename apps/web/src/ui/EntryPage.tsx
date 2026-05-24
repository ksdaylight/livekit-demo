import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, readTokens, writeTokens } from '../lib/api';
import { saveJoin } from '../lib/session';

export function EntryPage({ onJoined }: { onJoined: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authMessage, setAuthMessage] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const hasToken = !!readTokens()?.accessToken;
  const activeRooms = useQuery({ queryKey: ['activeRooms'], queryFn: api.activeMeetings, refetchInterval: 10_000 });
  const history = useQuery({ queryKey: ['history'], queryFn: api.history, enabled: hasToken });

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        displayName: String(form.get('displayName') ?? ''),
      };
      if (mode === 'register') await api.register(payload);
      else await api.login({ email: payload.email, password: payload.password });
      setAuthMessage('登录成功，可以创建会议。');
      await history.refetch();
    } catch (error: any) {
      setAuthMessage(error.message || '登录失败');
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const join = await api.createMeeting({
        roomCode: String(form.get('roomCode') ?? ''),
        title: String(form.get('title') ?? ''),
        password: String(form.get('password') ?? '') || undefined,
      });
      saveJoin(join);
      onJoined();
    } catch (error: any) {
      setCreateMessage(error.message || '创建失败');
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const join = await api.join(String(form.get('roomCode') ?? '').toUpperCase(), {
        displayName: String(form.get('displayName') ?? ''),
        password: String(form.get('password') ?? '') || undefined,
      });
      saveJoin(join);
      onJoined();
    } catch (error: any) {
      setJoinMessage(error.message || '加入失败');
    }
  }

  return (
    <main className="entry-page">
      <section className="hero">
        <p className="eyebrow">rtcLive TS</p>
        <h1>生产化 LiveKit 会议系统</h1>
        <p>主持人登录创建会议，访客通过会议号加入。聊天、白板、文件和主持人控制都已迁移到 TypeScript 架构。</p>
      </section>

      <div className="entry-grid">
        <section className="card">
          <div className="card-head">
            <h2>{mode === 'login' ? '主持人登录' : '主持人注册'}</h2>
            <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              切换到{mode === 'login' ? '注册' : '登录'}
            </button>
          </div>
          <form onSubmit={handleAuth} className="stack">
            {mode === 'register' && <input name="displayName" placeholder="主持人昵称" maxLength={20} required />}
            <input name="email" placeholder="邮箱" type="email" required />
            <input name="password" placeholder="密码，至少 8 位" type="password" required />
            <button className="primary">{mode === 'login' ? '登录' : '注册并登录'}</button>
            {hasToken && (
              <button type="button" className="ghost" onClick={() => { writeTokens(null); location.reload(); }}>
                清除当前登录
              </button>
            )}
            {authMessage && <p className="message">{authMessage}</p>}
          </form>
        </section>

        <section className="card">
          <h2>创建会议</h2>
          <form onSubmit={handleCreate} className="stack">
            <input name="roomCode" placeholder="4 位会议号，例如 A1B2" maxLength={4} required />
            <input name="title" placeholder="会议标题" maxLength={80} required />
            <input name="password" placeholder="会议密码（可选）" maxLength={32} type="password" />
            <button className="primary" disabled={!hasToken}>创建并进入</button>
            {!hasToken && <p className="hint">请先登录主持人账号。</p>}
            {createMessage && <p className="message">{createMessage}</p>}
          </form>
        </section>

        <section className="card">
          <h2>加入会议</h2>
          <form onSubmit={handleJoin} className="stack">
            <input name="roomCode" placeholder="会议号" maxLength={4} required />
            <input name="displayName" placeholder="你的昵称" maxLength={20} required />
            <input name="password" placeholder="会议密码（如有）" maxLength={32} type="password" />
            <button className="primary">进入会议</button>
            {joinMessage && <p className="message">{joinMessage}</p>}
          </form>
        </section>

        <section className="card wide">
          <div className="card-head">
            <h2>进行中的会议</h2>
            <button type="button" className="ghost" onClick={() => activeRooms.refetch()}>刷新</button>
          </div>
          <div className="room-list">
            {(activeRooms.data ?? []).map((room) => (
              <div className="room-row" key={room.roomCode}>
                <strong>{room.roomCode}</strong>
                <span>{room.title}</span>
                <span>{room.participantCount} 人</span>
                <span>{room.passwordProtected ? '有密码' : '无密码'}</span>
              </div>
            ))}
            {!activeRooms.data?.length && <p className="hint">当前没有进行中的会议。</p>}
          </div>
        </section>

        {hasToken && (
          <section className="card wide">
            <h2>我的会议历史</h2>
            <div className="room-list">
              {(history.data ?? []).map((room) => (
                <div className="room-row" key={`${room.roomCode}-${room.createdAt}`}>
                  <strong>{room.roomCode}</strong>
                  <span>{room.title}</span>
                  <span>{room.status}</span>
                  <span>{new Date(room.createdAt).toLocaleString()}</span>
                </div>
              ))}
              {!history.data?.length && <p className="hint">还没有历史会议。</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
