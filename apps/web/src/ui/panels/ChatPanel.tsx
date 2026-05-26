import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessagePayload, JoinMeetingResponse } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

const DANMAKU_STORAGE_KEY = 'rtclive:chat-danmaku';
const DANMAKU_ROWS = 8;

interface DanmakuItem {
  id: string;
  text: string;
  top: number;
}

// 聊天面板使用独立 WebSocket 通道，避免聊天消息和 LiveKit 媒体信令互相耦合。
export function ChatPanel({ join }: { join: JoinMeetingResponse }) {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [status, setStatus] = useState('连接中');
  // muted 同时受全员禁言和单人禁言影响，收到 moderation 快照后统一计算。
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [danmakuEnabled, setDanmakuEnabled] = useState(() => localStorage.getItem(DANMAKU_STORAGE_KEY) !== '0');
  const [danmaku, setDanmaku] = useState<DanmakuItem[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const messageIdsRef = useRef(new Set<string>());
  const openRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    // 建连时把会议内身份放到 query，服务端会先校验 participantKey 再发送快照。
    const socket = new WebSocket(
      wsUrl(`/ws/v1/rooms/${join.roomCode}/chat`, {
        identity: join.identity,
        participantKey: join.participantKey,
      }),
    );
    socketRef.current = socket;
    socket.onopen = () => setStatus('已连接');
    socket.onclose = () => setStatus('已断开');
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'chat.snapshot') {
        // snapshot 是连接建立后的全量状态：历史消息 + 当前禁言配置。
        messageIdsRef.current = new Set((message.messages ?? []).map((item: ChatMessagePayload) => item.messageId));
        setMessages(sortMessages(message.messages ?? []));
        setMuted(!!message.allMuted || (message.mutedParticipantIds ?? []).includes(join.identity));
      }
      // chat.message 是增量消息，直接追加到当前列表。
      if (message.type === 'chat.message') addMessage(message.message, true);
      // 禁言状态变化时服务端广播完整 moderation 状态，前端只需要重新计算当前用户是否可发送。
      if (message.type === 'chat.moderation') setMuted(!!message.allMuted || (message.mutedParticipantIds ?? []).includes(join.identity));
      if (message.type === 'system.error') setStatus(message.message);
    };
    return () => socket.close();
  }, [join]);

  function addMessage(message: ChatMessagePayload, incoming: boolean) {
    if (!message?.messageId || messageIdsRef.current.has(message.messageId)) return;
    messageIdsRef.current.add(message.messageId);
    setMessages((items) => sortMessages([...items, message]));
    if (incoming) {
      addDanmaku(`${message.senderDisplayName || message.senderIdentity}: ${message.content}`);
    }
    if (incoming && message.senderIdentity !== join.identity && !openRef.current) {
      setUnread((count) => count + 1);
    }
  }

  function addDanmaku(text: string) {
    if (!danmakuEnabled) return;
    const item = {
      id: `chat-danmaku-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      top: Math.floor(Math.random() * DANMAKU_ROWS) * 40,
    };
    setDanmaku((items) => [...items, item]);
  }

  function removeDanmaku(id: string) {
    setDanmaku((items) => items.filter((item) => item.id !== id));
  }

  function toggleDanmaku(enabled: boolean) {
    setDanmakuEnabled(enabled);
    localStorage.setItem(DANMAKU_STORAGE_KEY, enabled ? '1' : '0');
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const content = String(form.get('content') ?? '').trim();
    // 前端禁用只是体验保护，服务端 ChatService 仍会做最终禁言校验。
    if (!content || muted) return;
    socketRef.current?.send(JSON.stringify({ type: 'chat.send', content }));
    event.currentTarget.reset();
  }

  return (
    <>
      <div className="chat-danmaku-layer">
        {danmaku.map((item) => (
          <div
            className="chat-danmaku-item"
            key={item.id}
            style={{ top: item.top }}
            onAnimationEnd={() => removeDanmaku(item.id)}
          >
            {item.text}
          </div>
        ))}
      </div>

      <button className="chat-widget-btn" type="button" onClick={() => setOpen(true)}>
        聊天
        {unread > 0 && <span className="chat-unread-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="chat-modal" role="dialog" aria-modal="true">
          <button className="chat-backdrop" type="button" aria-label="关闭聊天" onClick={() => setOpen(false)} />
          <section className="chat-panel">
            <div className="chat-toolbar">
              <div className="chat-title">
                <strong>会议聊天</strong>
                <span className="chat-status">{status}</span>
              </div>
              <div className="chat-toolbar-actions">
                <label className="chat-danmaku-toggle">
                  <input
                    type="checkbox"
                    checked={danmakuEnabled}
                    onChange={(event) => toggleDanmaku(event.target.checked)}
                  />
                  <span>显示弹幕</span>
                </label>
                <button className="chat-close-btn" type="button" onClick={() => setOpen(false)}>关闭</button>
              </div>
            </div>

            <div className="chat-messages" ref={listRef}>
              {!messages.length && <div className="chat-empty">当前还没有聊天消息</div>}
              {messages.map((message) => {
                const isSelf = message.senderIdentity === join.identity;
                return (
                  <div className={`chat-message-row ${isSelf ? 'self' : 'other'}`} key={message.messageId}>
                    <div className={`chat-message-item ${isSelf ? 'self' : 'other'}`}>
                      <div className="chat-message-head">
                        <span className="chat-message-sender">{message.senderDisplayName || message.senderIdentity}</span>
                        <span className="chat-message-time">{formatTime(message.createdAt, true)}</span>
                      </div>
                      <div className="chat-message-content">{message.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={send} className="chat-input-area">
              <textarea
                name="content"
                placeholder={muted ? '你当前无法发送消息' : '请输入聊天内容'}
                maxLength={500}
                disabled={muted}
              />
              <div className="chat-input-actions">
                <span className={`chat-mute-tip ${muted ? '' : 'hidden'}`}>你当前无法发送消息</span>
                <button className="chat-send-btn" disabled={muted}>发送</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function sortMessages(messages: ChatMessagePayload[]) {
  return [...messages].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function formatTime(value: string, withSeconds = false) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
  });
}
