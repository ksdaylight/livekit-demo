import { ChangeEvent, useEffect, useRef, useState } from 'react';
import type { FileMessagePayload, JoinMeetingResponse, MediaControlPayload } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

const DANMAKU_ROWS = 7;

interface DanmakuItem {
  id: string;
  text: string;
  top: number;
}

// 文件面板：HTTP 负责上传/下载，WebSocket 负责文件消息通知和可见文件快照。
export function FilePanel({ join, participants }: { join: JoinMeetingResponse; participants: MediaControlPayload[] }) {
  const [files, setFiles] = useState<FileMessagePayload[]>([]);
  const [status, setStatus] = useState('连接中');
  const [targetIdentity, setTargetIdentity] = useState('');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [danmaku, setDanmaku] = useState<DanmakuItem[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const fileIdsRef = useRef(new Set<string>());
  const openRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const targets = participants.filter((participant) => participant.identity !== join.identity);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [files, open]);

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
      if (message.type === 'file.snapshot') {
        fileIdsRef.current = new Set((message.messages ?? []).map((item: FileMessagePayload) => item.fileId));
        setFiles(sortFiles(message.messages ?? []));
      }
      // file.message 可能是自己上传后的 ack，也可能是别人发来的文件通知；按 fileId 去重后追加。
      if (message.type === 'file.message') addFile(message.message, true);
      if (message.type === 'system.error') setStatus(message.message);
    };
    return () => socket.close();
  }, [join]);

  function addFile(message: FileMessagePayload, incoming: boolean) {
    if (!message?.fileId || fileIdsRef.current.has(message.fileId)) return;
    fileIdsRef.current.add(message.fileId);
    setFiles((items) => sortFiles([...items, message]));
    if (incoming) addDanmaku(`${message.senderDisplayName || message.senderIdentity} 上传了文件：${message.fileName}`);
    if (incoming && message.senderIdentity !== join.identity && !openRef.current) {
      setUnread((count) => count + 1);
    }
  }

  function addDanmaku(text: string) {
    const item = {
      id: `file-danmaku-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      top: Math.floor(Math.random() * DANMAKU_ROWS) * 46,
    };
    setDanmaku((items) => [...items, item]);
  }

  function removeDanmaku(id: string) {
    setDanmaku((items) => items.filter((item) => item.id !== id));
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('上传中');
    const form = new FormData();
    // identity/participantKey 随 multipart 一起提交，API 会据此校验上传权限。
    form.append('identity', join.identity);
    form.append('participantKey', join.participantKey);
    if (targetIdentity) form.append('targetIdentity', targetIdentity);
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
    <>
      <div className="file-danmaku-layer">
        {danmaku.map((item) => (
          <div
            className="file-danmaku-item"
            key={item.id}
            style={{ top: item.top }}
            onAnimationEnd={() => removeDanmaku(item.id)}
          >
            {item.text}
          </div>
        ))}
      </div>

      <button className="file-transfer-widget-btn" type="button" onClick={() => setOpen(true)}>
        文件
        {unread > 0 && <span className="file-transfer-unread-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="file-transfer-modal" role="dialog" aria-modal="true">
          <button className="file-transfer-backdrop" type="button" aria-label="关闭文件传输" onClick={() => setOpen(false)} />
          <section className="file-transfer-panel">
            <div className="file-transfer-toolbar">
              <div className="file-transfer-title">
                <strong>会议文件传输</strong>
                <span className="file-transfer-status">{status}</span>
              </div>
              <div className="file-transfer-controls">
                <label className="file-transfer-target">
                  <span>接收人</span>
                  <select value={targetIdentity} onChange={(event) => setTargetIdentity(event.target.value)}>
                    <option value="">发送给所有人</option>
                    {targets.map((participant) => (
                      <option key={participant.identity} value={participant.identity}>
                        {participant.displayName || participant.identity}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="file-transfer-upload-btn">
                  选择文件
                  <input type="file" onChange={upload} />
                </label>
                <button className="file-transfer-close-btn" type="button" onClick={() => setOpen(false)}>关闭</button>
              </div>
            </div>
            {/* 下载链接仍然走 API 鉴权，不直接使用对象存储公开 URL。 */}
            <div className="file-transfer-list" ref={listRef}>
              {!files.length && <div className="file-transfer-empty">当前还没有文件消息</div>}
              {files.map((file) => (
                <div className={`file-transfer-item ${file.targetIdentity ? 'direct' : 'broadcast'}`} key={file.fileId}>
                  <div className="file-transfer-item-top">
                    <div className="file-transfer-item-title">{file.fileName}</div>
                    <div className="file-transfer-item-meta">{buildMetaText(file)}</div>
                  </div>
                  <a
                    className="file-transfer-item-download"
                    href={`/api/v1/meetings/${join.roomCode}/files/${file.fileId}/download?identity=${encodeURIComponent(join.identity)}&participantKey=${encodeURIComponent(join.participantKey)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    下载文件
                  </a>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function sortFiles(files: FileMessagePayload[]) {
  return [...files].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function buildMetaText(file: FileMessagePayload) {
  const direction = file.targetIdentity
    ? `定向 ${file.senderDisplayName} -> ${file.targetDisplayName || file.targetIdentity}`
    : `全体 ${file.senderDisplayName}`;
  return `${direction} | ${formatFileSize(file.fileSize)} | ${formatTime(file.createdAt)}`;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
