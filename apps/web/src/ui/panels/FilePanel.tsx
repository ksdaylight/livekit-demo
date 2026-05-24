import { ChangeEvent, useEffect, useRef, useState } from 'react';
import type { FileMessagePayload, JoinMeetingResponse } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

export function FilePanel({ join }: { join: JoinMeetingResponse }) {
  const [files, setFiles] = useState<FileMessagePayload[]>([]);
  const [status, setStatus] = useState('连接中');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(
      wsUrl(`/ws/v1/rooms/${join.roomCode}/files`, {
        identity: join.identity,
        participantKey: join.participantKey,
      }),
    );
    socketRef.current = socket;
    socket.onopen = () => setStatus('已连接');
    socket.onclose = () => setStatus('已断开');
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'file.snapshot') setFiles(message.messages ?? []);
      if (message.type === 'file.message') setFiles((items) => [...items.filter((item) => item.fileId !== message.message.fileId), message.message]);
      if (message.type === 'system.error') setStatus(message.message);
    };
    return () => socket.close();
  }, [join]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('上传中');
    const form = new FormData();
    form.append('identity', join.identity);
    form.append('participantKey', join.participantKey);
    form.append('file', file);
    const response = await fetch(`/api/v1/meetings/${join.roomCode}/files`, { method: 'POST', body: form });
    if (!response.ok) {
      setStatus(await response.text());
      return;
    }
    const result = await response.json();
    socketRef.current?.send(JSON.stringify({ type: 'file.ack', fileId: result.fileId }));
    setStatus('已发送');
    event.target.value = '';
  }

  return (
    <section className="panel">
      <h3>文件 <span>{status}</span></h3>
      <input type="file" onChange={upload} />
      <div className="scroll-list">
        {files.map((file) => (
          <a
            key={file.fileId}
            className="file-row"
            href={`/api/v1/meetings/${join.roomCode}/files/${file.fileId}/download?identity=${encodeURIComponent(join.identity)}&participantKey=${encodeURIComponent(join.participantKey)}`}
            target="_blank"
          >
            <strong>{file.fileName}</strong>
            <span>{file.senderDisplayName} · {(file.fileSize / 1024).toFixed(1)} KB</span>
          </a>
        ))}
      </div>
    </section>
  );
}
