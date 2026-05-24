import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from 'react';
import type { JoinMeetingResponse, WhiteboardEventPayload } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

interface Stroke {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

interface BoardImage {
  id: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function WhiteboardPanel({ join }: { join: JoinMeetingResponse }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const [events, setEvents] = useState<WhiteboardEventPayload[]>([]);
  const [status, setStatus] = useState('连接中');
  const [color, setColor] = useState('#ff5f57');

  useEffect(() => {
    const socket = new WebSocket(
      wsUrl(`/ws/v1/rooms/${join.roomCode}/whiteboard`, {
        identity: join.identity,
        participantKey: join.participantKey,
      }),
    );
    socketRef.current = socket;
    socket.onopen = () => setStatus('已连接');
    socket.onclose = () => setStatus('已断开');
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'whiteboard.snapshot') setEvents(message.events ?? []);
      if (message.type === 'whiteboard.event') setEvents((items) => [...items, message.event]);
      if (message.type === 'whiteboard.clear') setEvents((items) => [...items, message.event]);
      if (message.type === 'system.error') setStatus(message.message);
    };
    return () => socket.close();
  }, [join]);

  useEffect(() => {
    redraw(canvasRef.current, events);
  }, [events]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = {
      id: `stroke-${Date.now()}`,
      color,
      width: 4,
      points: [point(event)],
    };
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = drawingRef.current;
    if (!stroke) return;
    stroke.points.push(point(event));
    redraw(canvasRef.current, events, stroke);
  }

  function up() {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    socketRef.current?.send(JSON.stringify({ type: 'whiteboard.stroke.add', stroke }));
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('identity', join.identity);
    form.append('participantKey', join.participantKey);
    form.append('file', file);
    const response = await fetch(`/api/v1/meetings/${join.roomCode}/whiteboard/images`, { method: 'POST', body: form });
    if (!response.ok) {
      setStatus(await response.text());
      return;
    }
    const result = await response.json();
    socketRef.current?.send(
      JSON.stringify({
        type: 'whiteboard.image.add',
        image: {
          id: `image-${Date.now()}`,
          imageId: result.imageId,
          imageUrl: result.imageUrl,
          x: 40,
          y: 40,
          width: 240,
          height: 160,
        },
      }),
    );
    event.target.value = '';
  }

  return (
    <section className="panel whiteboard-panel">
      <h3>白板 <span>{status}</span></h3>
      <div className="whiteboard-tools">
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <input type="file" accept="image/*" onChange={upload} />
      </div>
      <canvas
        ref={canvasRef}
        width={760}
        height={360}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </section>
  );
}

function redraw(canvas: HTMLCanvasElement | null, events: WhiteboardEventPayload[], current?: Stroke) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(15,23,42,.08)';
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const removed = new Set<string>();
  for (const event of events) {
    if (event.type === 'board_clear') {
      removed.clear();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      continue;
    }
    if (event.type === 'stroke_undo') removed.add((event.payload as any).strokeId);
    if (event.type === 'image_undo') removed.add((event.payload as any).imageId);
  }

  for (const event of events) {
    if (event.type === 'stroke_add') {
      const stroke = event.payload as Stroke;
      if (!removed.has(stroke.id)) drawStroke(ctx, stroke);
    }
    if (event.type === 'image_add') {
      const image = event.payload as BoardImage;
      if (!removed.has(image.id)) drawImage(ctx, image);
    }
  }
  if (current) drawStroke(ctx, current);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
}

function drawImage(ctx: CanvasRenderingContext2D, image: BoardImage) {
  const img = new Image();
  img.onload = () => ctx.drawImage(img, image.x, image.y, image.width, image.height);
  img.src = image.imageUrl;
}
