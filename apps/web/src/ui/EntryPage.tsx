import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, readTokens, writeTokens } from '../lib/api';
import { saveJoin } from '../lib/session';

// 入口页承载三个主要流程：主持人登录/注册、创建会议、访客加入会议。
export function EntryPage({ onJoined }: { onJoined: () => void }) {
  // mode 控制同一个表单在登录和注册之间切换。
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authMessage, setAuthMessage] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const hasToken = !!readTokens()?.accessToken;
  // 活动会议列表每 10 秒刷新一次，方便访客看到最新房间。
  const activeRooms = useQuery({ queryKey: ['activeRooms'], queryFn: api.activeMeetings, refetchInterval: 10_000 });
  // 历史会议只有登录主持人才需要拉取。
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
      // 注册成功会直接写入 token；登录模式不提交 displayName。
      if (mode === 'register') await api.register(payload);
      else await api.login({ email: payload.email, password: payload.password });
      setAuthMessage('登录成功，可以创建会议。');
      // 登录态变化后刷新主持人历史列表。
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
      // 创建会议成功后服务端会同时让主持人加入会议，并返回 LiveKit/participantKey 上下文。
      const join = await api.createMeeting({
        roomCode: String(form.get('roomCode') ?? ''),
        title: String(form.get('title') ?? ''),
        password: String(form.get('password') ?? '') || undefined,
      });
      saveJoin(join);
      // 保存 join 后切到会议页，App 会从 sessionStorage 读取上下文。
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
      // 访客加入会议不需要登录，只需要会议号、昵称和可选密码。
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
      {/* 首屏说明当前系统能力；不承担路由逻辑。 */}
      <section className="hero">
        <p className="eyebrow">rtcLive TS</p>
        <h1>生产化 LiveKit 会议系统</h1>
        <p>主持人登录创建会议，访客通过会议号加入。聊天、白板、文件和主持人控制都已迁移到 TypeScript 架构。</p>
      </section>

      <div className="entry-grid">
        {/* 主持人账号区：创建会议前必须先登录。 */}
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

        {/* 创建会议区：只有登录主持人可以提交。 */}
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

        {/* 加入会议区：面向访客，返回 guest 角色的加入上下文。 */}
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

        {/* 活动会议列表：公开展示当前可加入的会议。 */}
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
          /* 主持人的历史会议列表，用于验收会议生命周期状态。 */
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
