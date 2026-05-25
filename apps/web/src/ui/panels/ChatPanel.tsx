import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessagePayload, JoinMeetingResponse } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

// 聊天面板使用独立 WebSocket 通道，避免聊天消息和 LiveKit 媒体信令互相耦合。
export function ChatPanel({ join }: { join: JoinMeetingResponse }) {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [status, setStatus] = useState('连接中');
  // muted 同时受全员禁言和单人禁言影响，收到 moderation 快照后统一计算。
  const [muted, setMuted] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

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
        setMessages(message.messages ?? []);
        setMuted(!!message.allMuted || (message.mutedParticipantIds ?? []).includes(join.identity));
      }
      // chat.message 是增量消息，直接追加到当前列表。
      if (message.type === 'chat.message') setMessages((items) => [...items, message.message]);
      // 禁言状态变化时服务端广播完整 moderation 状态，前端只需要重新计算当前用户是否可发送。
      if (message.type === 'chat.moderation') setMuted(!!message.allMuted || (message.mutedParticipantIds ?? []).includes(join.identity));
      if (message.type === 'system.error') setStatus(message.message);
    };
    return () => socket.close();
  }, [join]);

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
    <section className="panel">
      <h3>聊天 <span>{status}</span></h3>
      <div className="scroll-list chat-list">
        {messages.map((message) => (
          <div className={message.senderIdentity === join.identity ? 'bubble self' : 'bubble'} key={message.messageId}>
            <strong>{message.senderDisplayName}</strong>
            <p>{message.content}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="inline-form">
        <input name="content" placeholder={muted ? '你当前无法发送消息' : '输入聊天内容'} maxLength={500} disabled={muted} />
        <button disabled={muted}>发送</button>
      </form>
    </section>
  );
}
