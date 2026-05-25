import { ChangeEvent, useEffect, useRef, useState } from 'react';
import type { FileMessagePayload, JoinMeetingResponse } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

// 文件面板：HTTP 负责上传/下载，WebSocket 负责文件消息通知和可见文件快照。
export function FilePanel({ join }: { join: JoinMeetingResponse }) {
  const [files, setFiles] = useState<FileMessagePayload[]>([]);
  const [status, setStatus] = useState('连接中');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 文件通道连接后服务端只返回当前参与者可见的文件列表。
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
      // file.message 可能是自己上传后的 ack，也可能是别人发来的文件通知；按 fileId 去重后追加。
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
    // identity/participantKey 随 multipart 一起提交，API 会据此校验上传权限。
    form.append('identity', join.identity);
    form.append('participantKey', join.participantKey);
    form.append('file', file);
    const response = await fetch(`/api/v1/meetings/${join.roomCode}/files`, { method: 'POST', body: form });
    if (!response.ok) {
      setStatus(await response.text());
      return;
    }
    const result = await response.json();
    // 上传成功后发送 ack，让文件 WebSocket 网关按可见性规则广播这条文件消息。
    socketRef.current?.send(JSON.stringify({ type: 'file.ack', fileId: result.fileId }));
    setStatus('已发送');
    event.target.value = '';
  }

  return (
    <section className="panel">
      <h3>文件 <span>{status}</span></h3>
      <input type="file" onChange={upload} />
      {/* 下载链接仍然走 API 鉴权，不直接使用对象存储公开 URL。 */}
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
