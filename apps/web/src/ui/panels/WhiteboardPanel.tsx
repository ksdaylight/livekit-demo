import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from 'react';
import type { JoinMeetingResponse, WhiteboardEventPayload } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

interface Stroke {
  /** 客户端生成的笔迹 id，用于后续撤销。 */
  id: string;
  /** 画笔颜色。 */
  color: string;
  /** 画笔宽度，单位是 canvas 像素。 */
  width: number;
  /** 当前实现存储 canvas 内坐标；后续可改成归一化坐标支持多尺寸同步。 */
  points: Array<{ x: number; y: number }>;
}

interface BoardImage {
  /** 客户端生成的画布元素 id，用于撤销。 */
  id: string;
  /** 后端返回的图片公开地址。 */
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// 白板面板采用事件流模型：服务端保存 stroke/image/undo/clear 事件，客户端按顺序重绘 canvas。
export function WhiteboardPanel({ join }: { join: JoinMeetingResponse }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  // 当前正在绘制的笔迹暂存在 ref 中，避免 pointermove 高频触发 React 重渲染。
  const drawingRef = useRef<Stroke | null>(null);
  const [events, setEvents] = useState<WhiteboardEventPayload[]>([]);
  const [status, setStatus] = useState('连接中');
  const [color, setColor] = useState('#ff5f57');

  useEffect(() => {
    // 连接白板通道后服务端会返回历史事件快照。
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
      // 增量事件直接追加；重绘函数会根据事件列表计算最终画布。
      if (message.type === 'whiteboard.event') setEvents((items) => [...items, message.event]);
      if (message.type === 'whiteboard.clear') setEvents((items) => [...items, message.event]);
      if (message.type === 'system.error') setStatus(message.message);
    };
    return () => socket.close();
  }, [join]);

  useEffect(() => {
    // 任意事件变化后全量重绘 canvas，逻辑简单且对当前事件规模足够快。
    redraw(canvasRef.current, events);
  }, [events]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    // pointer 坐标转换成 canvas 元素内部坐标。
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    // pointer down 开始一条新笔迹，id 使用时间戳即可满足本地唯一性。
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
    // 绘制中的笔迹不进 events，作为 current 临时叠加绘制。
    redraw(canvasRef.current, events, stroke);
  }

  function up() {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    // 完成绘制后把笔迹作为事件发给服务端，由服务端广播给所有客户端。
    socketRef.current?.send(JSON.stringify({ type: 'whiteboard.stroke.add', stroke }));
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    // 图片文件先走 HTTP 上传到对象存储，随后再把 image.add 事件广播到白板通道。
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
  // 每次从白底开始重绘，避免撤销/清空时需要复杂的增量擦除逻辑。
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(15,23,42,.08)';
  // 绘制浅色网格，帮助用户判断白板空间和图片/笔迹位置。
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

  // 第一轮扫描撤销/清空事件，得到需要忽略的笔迹和图片 id。
  const removed = new Set<string>();
  for (const event of events) {
    if (event.type === 'board_clear') {
      // 清空事件后之前的撤销状态也不再影响后续新内容。
      removed.clear();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      continue;
    }
    if (event.type === 'stroke_undo') removed.add((event.payload as any).strokeId);
    if (event.type === 'image_undo') removed.add((event.payload as any).imageId);
  }

  // 第二轮按事件顺序重放可见内容。
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
  // 当前正在绘制的笔迹只在本地预览，等待 pointerup 后才广播。
  if (current) drawStroke(ctx, current);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
  // 使用圆角线帽/连接，手写线条会更自然。
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
  // 图片异步加载完成后绘制到 canvas；事件本身仍然保留在 events 中，后续重绘会再次加载。
  const img = new Image();
  img.onload = () => ctx.drawImage(img, image.x, image.y, image.width, image.height);
  img.src = image.imageUrl;
}
