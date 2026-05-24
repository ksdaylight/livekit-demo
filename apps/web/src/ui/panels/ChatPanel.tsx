import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessagePayload, JoinMeetingResponse } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

export function ChatPanel({ join }: { join: JoinMeetingResponse }) {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [status, setStatus] = useState('连接中');
  const [muted, setMuted] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
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
        setMessages(message.messages ?? []);
        setMuted(!!message.allMuted || (message.mutedParticipantIds ?? []).includes(join.identity));
      }
      if (message.type === 'chat.message') setMessages((items) => [...items, message.message]);
      if (message.type === 'chat.moderation') setMuted(!!message.allMuted || (message.mutedParticipantIds ?? []).includes(join.identity));
      if (message.type === 'system.error') setStatus(message.message);
    };
    return () => socket.close();
  }, [join]);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const content = String(form.get('content') ?? '').trim();
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
