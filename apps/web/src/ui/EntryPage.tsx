import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@rtclive/shared';
import { api, readTokens, writeTokens } from '../lib/api';
import { saveJoin } from '../lib/session';

// 入口页承载三个主要流程：主持人登录/注册、创建会议、访客加入会议。
export function EntryPage({ onJoined }: { onJoined: () => void }) {
  const queryClient = useQueryClient();
  // mode 控制同一个表单在登录和注册之间切换。
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(() => !readTokens()?.accessToken);
  const [authMessage, setAuthMessage] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [historyMessage, setHistoryMessage] = useState('');
  const isAuthed = !!authUser;
  // 活动会议列表每 10 秒刷新一次，方便访客看到最新房间。
  const activeRooms = useQuery({
    queryKey: ['activeRooms'],
    queryFn: api.activeMeetings,
    refetchInterval: 10_000,
  });
  // 历史会议只有登录主持人才需要拉取。
  const history = useQuery({ queryKey: ['history'], queryFn: api.history, enabled: isAuthed });

  useEffect(() => {
    let mounted = true;

    async function syncAuth() {
      if (!readTokens()?.accessToken) {
        if (mounted) {
          setAuthUser(null);
          setAuthReady(true);
        }
        queryClient.removeQueries({ queryKey: ['history'] });
        return;
      }

      try {
        const result = await api.me();
        if (mounted) {
          setAuthUser(result.user);
          setAuthReady(true);
        }
      } catch {
        writeTokens(null);
        queryClient.removeQueries({ queryKey: ['history'] });
        if (mounted) {
          setAuthUser(null);
          setAuthReady(true);
        }
      }
    }

    const handleSync = () => void syncAuth();
    void syncAuth();
    window.addEventListener('focus', handleSync);
    window.addEventListener('pageshow', handleSync);
    return () => {
      mounted = false;
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('pageshow', handleSync);
    };
  }, [queryClient]);

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
      const result =
        mode === 'register'
          ? await api.register(payload)
          : await api.login({ email: payload.email, password: payload.password });
      setAuthUser(result.user);
      setAuthReady(true);
      setAuthMessage('登录成功，可以创建会议。');
      // 登录态变化后刷新主持人历史列表。
      await queryClient.invalidateQueries({ queryKey: ['history'] });
    } catch (error: any) {
      setAuthMessage(error.message || '登录失败');
    }
  }

  function handleLogout() {
    writeTokens(null);
    setAuthUser(null);
    setAuthMessage('已退出登录。');
    queryClient.removeQueries({ queryKey: ['history'] });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const roomCode = String(form.get('roomCode') ?? '').toUpperCase();
      const title = String(form.get('title') ?? '').trim() || `会议 ${roomCode}`;
      // 创建会议成功后服务端会同时让主持人加入会议，并返回 LiveKit/participantKey 上下文。
      const join = await api.createMeeting({
        roomCode,
        title,
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

  async function handleHistoryRejoin(roomCode: string) {
    if (!authUser) return;
    setHistoryMessage('');
    try {
      const join = await api.join(roomCode, { displayName: authUser.displayName });
      saveJoin(join);
      onJoined();
    } catch (error: any) {
      setHistoryMessage(error.message || '重新进入失败');
    }
  }

  return (
    <main className="entry-page">
      <div className="entry-shell">
        <section className="entry-card">
          <div className="entry-card-head">
            <h1>创建会议</h1>
            <p>输入 4 位会议号，可设置可选密码。TS 版保留主持人账号体系，创建前需要先登录。</p>
          </div>

          {!authReady ? (
            <div className="entry-form auth-form">
              <p className="hint">正在确认登录状态...</p>
            </div>
          ) : authUser ? (
            <div className="entry-form auth-form">
              <div className="entry-list-head">
                <h2>已登录</h2>
                <button type="button" className="entry-secondary-btn" onClick={handleLogout}>
                  退出登录
                </button>
              </div>
              <div className="entry-room-item">
                <div className="entry-room-top">
                  <strong>{authUser.displayName}</strong>
                  <span className="entry-room-meta">主持人账号</span>
                </div>
                <div className="entry-room-meta">{authUser.email}</div>
              </div>
              {authMessage && <p className="message">{authMessage}</p>}
            </div>
          ) : (
            <form onSubmit={handleAuth} className="entry-form auth-form">
              <div className="entry-list-head">
                <h2>{mode === 'login' ? '主持人登录' : '主持人注册'}</h2>
                <button
                  type="button"
                  className="entry-secondary-btn"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                >
                  切换到{mode === 'login' ? '注册' : '登录'}
                </button>
              </div>
              {mode === 'register' && (
                <label className="entry-field">
                  <span>主持人昵称</span>
                  <input
                    name="displayName"
                    maxLength={20}
                    placeholder="请输入主持人昵称"
                    required
                  />
                </label>
              )}
              <label className="entry-field">
                <span>邮箱</span>
                <input name="email" type="email" placeholder="请输入邮箱" required />
              </label>
              <label className="entry-field">
                <span>密码</span>
                <input name="password" type="password" placeholder="至少 8 位" required />
              </label>
              <button className="entry-primary-btn">
                {mode === 'login' ? '登录' : '注册并登录'}
              </button>
              {authMessage && <p className="message">{authMessage}</p>}
            </form>
          )}

          <form onSubmit={handleCreate} className="entry-form">
            <label className="entry-field">
              <span>会议号</span>
              <input name="roomCode" maxLength={4} placeholder="例如 A1B2" required />
            </label>
            <label className="entry-field">
              <span>会议标题（可选）</span>
              <input name="title" maxLength={80} placeholder="不填则使用会议号" />
            </label>
            <label className="entry-field">
              <span>会议密码（可选）</span>
              <input name="password" type="password" maxLength={32} placeholder="不填则不设密码" />
            </label>
            <button className="entry-primary-btn" disabled={!isAuthed}>
              创建并进入会议
            </button>
            {!isAuthed && <p className="hint">请先登录主持人账号。</p>}
            {createMessage && <p className="message">{createMessage}</p>}
          </form>
        </section>

        <section className="entry-card">
          <div className="entry-card-head">
            <h1>参会</h1>
            <p>输入已有会议号和昵称，或从进行中的会议室列表里选择。</p>
          </div>

          <form onSubmit={handleJoin} className="entry-form">
            <label className="entry-field">
              <span>会议号</span>
              <input name="roomCode" maxLength={4} placeholder="请输入会议号" required />
            </label>
            <label className="entry-field">
              <span>昵称</span>
              <input name="displayName" maxLength={20} placeholder="请输入你的昵称" required />
            </label>
            <label className="entry-field">
              <span>会议密码</span>
              <input
                name="password"
                type="password"
                maxLength={32}
                placeholder="有密码的会议请输入密码"
              />
            </label>
            <button className="entry-primary-btn">进入会议</button>
            {joinMessage && <p className="message">{joinMessage}</p>}
          </form>

          <div className="entry-list-wrap">
            <div className="entry-list-head">
              <h2>进行中的会议室</h2>
              <button
                type="button"
                className="entry-secondary-btn"
                onClick={() => activeRooms.refetch()}
              >
                刷新
              </button>
            </div>
            <div className="entry-room-list">
              {(activeRooms.data ?? []).map((room) => (
                <div className="entry-room-item" key={room.roomCode}>
                  <div className="entry-room-top">
                    <div className="entry-room-name">{room.roomCode}</div>
                    <span className="entry-room-meta">{room.participantCount} 人</span>
                  </div>
                  <div className="entry-room-meta">
                    管理员：{room.hostDisplayName} | {room.title}
                  </div>
                  {room.passwordProtected && (
                    <div className="entry-room-lock">该会议已设置密码</div>
                  )}
                </div>
              ))}
              {!activeRooms.data?.length && (
                <div className="entry-empty">当前没有正在进行中的会议室</div>
              )}
            </div>
          </div>
        </section>

        {isAuthed && (
          <section className="entry-card entry-history-card">
            <div className="entry-list-head">
              <h2>我的会议历史</h2>
            </div>
            {historyMessage && <p className="message">{historyMessage}</p>}
            <div className="entry-room-list">
              {(history.data ?? []).map((room) => (
                <div className="entry-room-item" key={`${room.roomCode}-${room.createdAt}`}>
                  <div className="entry-room-top">
                    <div className="entry-room-name">{room.roomCode}</div>
                    <span className="entry-room-meta">{room.status}</span>
                  </div>
                  <div className="entry-room-meta">
                    {room.title} | {new Date(room.createdAt).toLocaleString()}
                  </div>
                  {room.status === 'active' && (
                    <button
                      type="button"
                      className="entry-secondary-btn"
                      onClick={() => handleHistoryRejoin(room.roomCode)}
                    >
                      重新进入/管理
                    </button>
                  )}
                </div>
              ))}
              {!history.data?.length && <div className="entry-empty">还没有历史会议</div>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
