import {
  ChangeEvent,
  PointerEvent,
  useEffect,
  useRef,
  useState,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { JoinMeetingResponse, WhiteboardEventPayload } from '@rtclive/shared';
import { wsUrl } from '../../lib/ws';

const DEFAULT_COLOR = '#ff5f57';
const DEFAULT_WIDTH = 4;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.2;
const STROKE_POINT_THRESHOLD = 2;
const EXPORT_PADDING = 48;
const MAX_IMAGE_EDGE = 720;

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  /** 客户端生成的笔迹 id，用于后续撤销。 */
  id: string;
  /** 画笔颜色。 */
  color: string;
  /** 画笔宽度，单位是白板世界坐标。 */
  width: number;
  createdAt?: number;
  points: Point[];
}

interface BoardImage {
  /** 客户端生成的画布元素 id，用于撤销。 */
  id: string;
  /** 后端返回的对象存储图片 id。 */
  imageId?: string;
  /** 后端返回的图片公开地址。 */
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt?: number;
}

interface PendingImage {
  id: string;
  file: File;
  width: number;
  height: number;
  createdAt: number;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface VisibleBoard {
  strokes: Stroke[];
  images: BoardImage[];
}

// 白板面板采用事件流模型：服务端保存 stroke/image/undo/clear 事件，客户端按顺序重绘 canvas。
export function WhiteboardPanel({ join }: { join: JoinMeetingResponse }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const eventsRef = useRef<WhiteboardEventPayload[]>([]);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const pendingImageRef = useRef<PendingImage | null>(null);
  const hoverWorldPointRef = useRef<Point | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const spacePressedRef = useRef(false);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const [events, setEvents] = useState<WhiteboardEventPayload[]>([]);
  const [status, setStatus] = useState('连接中');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [camera, setCameraState] = useState<Camera>(cameraRef.current);
  const [pendingImage, setPendingImageState] = useState<PendingImage | null>(null);
  const [isPanning, setIsPanning] = useState(false);

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
    const resize = () => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;
      const rect = stage.getBoundingClientRect();
      const nextWidth = Math.max(320, Math.floor(rect.width));
      const nextHeight = Math.max(220, Math.floor(rect.height));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      redrawCurrent();
    };

    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (stageRef.current && observer) observer.observe(stageRef.current);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    eventsRef.current = events;
    redrawCurrent();
  }, [events]);

  useEffect(() => {
    cameraRef.current = camera;
    redrawCurrent();
  }, [camera]);

  useEffect(() => {
    pendingImageRef.current = pendingImage;
    redrawCurrent();
  }, [pendingImage]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void prepareImage(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [join]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return;
      spacePressedRef.current = true;
      event.preventDefault();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spacePressedRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  function redrawCurrent(current = drawingRef.current) {
    redraw(
      canvasRef.current,
      eventsRef.current,
      current,
      cameraRef.current,
      pendingImageRef.current,
      hoverWorldPointRef.current,
      imageCacheRef.current,
      () => redrawCurrent(current),
    );
  }

  function updateCamera(updater: (previous: Camera) => Camera) {
    const next = updater(cameraRef.current);
    cameraRef.current = next;
    setCameraState(next);
  }

  function updatePendingImage(next: PendingImage | null) {
    pendingImageRef.current = next;
    setPendingImageState(next);
  }

  function screenToWorld(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    return {
      x: (clientX - rect.left - camera.x) / camera.zoom,
      y: (clientY - rect.top - camera.y) / camera.zoom,
    };
  }

  function shouldStartPan(event: PointerEvent<HTMLCanvasElement>) {
    return event.button === 1 || event.button === 2 || (event.button === 0 && spacePressedRef.current);
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (shouldStartPan(event)) {
      event.preventDefault();
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0 || drawingRef.current) return;
    const point = screenToWorld(event.clientX, event.clientY);
    if (!point) return;

    if (pendingImageRef.current) {
      event.preventDefault();
      void placePendingImage(point);
      return;
    }

    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    drawingRef.current = {
      id: `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      color,
      width,
      createdAt: Date.now(),
      points: [point],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    redrawCurrent();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      const dx = event.clientX - panRef.current.x;
      const dy = event.clientY - panRef.current.y;
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      updateCamera((previous) => ({ ...previous, x: previous.x + dx, y: previous.y + dy }));
      return;
    }

    const point = screenToWorld(event.clientX, event.clientY);
    hoverWorldPointRef.current = point;
    if (pendingImageRef.current) redrawCurrent();

    const stroke = drawingRef.current;
    if (!stroke || !point) return;
    const lastPoint = stroke.points[stroke.points.length - 1];
    const dx = point.x - lastPoint.x;
    const dy = point.y - lastPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) < STROKE_POINT_THRESHOLD) return;
    stroke.points.push(point);
    redrawCurrent(stroke);
  }

  function up(event: PointerEvent<HTMLCanvasElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      stopPan(event.currentTarget, event.pointerId);
      return;
    }

    const stroke = drawingRef.current;
    if (!stroke) return;
    const point = screenToWorld(event.clientX, event.clientY);
    if (point) stroke.points.push(point);
    drawingRef.current = null;
    releasePointerCapture(event.currentTarget, event.pointerId);
    if (!stroke.points.length) {
      redrawCurrent(null);
      return;
    }
    socketRef.current?.send(JSON.stringify({ type: 'whiteboard.stroke.add', stroke }));
    redrawCurrent(null);
  }

  function cancel(event: PointerEvent<HTMLCanvasElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      stopPan(event.currentTarget, event.pointerId);
      return;
    }
    drawingRef.current = null;
    releasePointerCapture(event.currentTarget, event.pointerId);
    redrawCurrent(null);
  }

  function stopPan(canvas: HTMLCanvasElement, pointerId: number) {
    panRef.current = null;
    setIsPanning(false);
    releasePointerCapture(canvas, pointerId);
  }

  function wheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAt(event.clientX, event.clientY, factor);
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const current = cameraRef.current;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - current.x) / current.zoom;
    const worldY = (screenY - current.y) / current.zoom;
    const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    updateCamera(() => ({
      zoom,
      x: screenX - worldX * zoom,
      y: screenY - worldY * zoom,
    }));
  }

  function zoomAroundCenter(factor: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function resetView() {
    updateCamera(() => ({ x: 0, y: 0, zoom: 1 }));
  }

  async function prepareImage(file: File) {
    try {
      setStatus('选择图片放置位置');
      const size = await readImageSize(file);
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(size.width, size.height));
      updatePendingImage({
        id: `image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        width: Math.max(32, Math.round(size.width * scale)),
        height: Math.max(32, Math.round(size.height * scale)),
        createdAt: Date.now(),
      });
    } catch (error: any) {
      setStatus(error.message || '图片读取失败');
    }
  }

  async function placePendingImage(center: Point) {
    const pending = pendingImageRef.current;
    if (!pending) return;
    updatePendingImage(null);
    setStatus('白板图片上传中');

    const form = new FormData();
    // 图片文件先走 HTTP 上传到对象存储，随后再把 image.add 事件广播到白板通道。
    form.append('identity', join.identity);
    form.append('participantKey', join.participantKey);
    form.append('file', pending.file);
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
          id: pending.id,
          imageId: result.imageId,
          imageUrl: result.imageUrl,
          x: center.x - pending.width / 2,
          y: center.y - pending.height / 2,
          width: pending.width,
          height: pending.height,
          createdAt: pending.createdAt,
        },
      }),
    );
    setStatus('白板已同步');
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await prepareImage(file);
    event.target.value = '';
  }

  function undoOwn() {
    const target = findOwnUndoTarget(events, join.identity);
    if (!target) return;
    socketRef.current?.send(
      JSON.stringify(
        target.type === 'stroke'
          ? { type: 'whiteboard.stroke.undo', strokeId: target.id }
          : { type: 'whiteboard.image.undo', imageId: target.id },
      ),
    );
  }

  async function downloadSnapshot() {
    try {
      const board = buildVisibleBoard(eventsRef.current);
      const bounds = getExportBounds(board);
      const canvas = document.createElement('canvas');
      if (!bounds) {
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        triggerDownload(canvas, `whiteboard-${join.roomCode}-${Date.now()}.png`);
        return;
      }

      canvas.width = Math.max(800, Math.ceil(bounds.maxX - bounds.minX + EXPORT_PADDING * 2));
      canvas.height = Math.max(600, Math.ceil(bounds.maxY - bounds.minY + EXPORT_PADDING * 2));
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(EXPORT_PADDING - bounds.minX, EXPORT_PADDING - bounds.minY);
      for (const image of board.images) {
        await drawExportImage(context, image);
      }
      board.strokes.forEach((stroke) => drawStroke(context, stroke, { x: 0, y: 0, zoom: 1 }, true));
      triggerDownload(canvas, `whiteboard-${join.roomCode}-${Date.now()}.png`);
    } catch (error: any) {
      setStatus(error.message || '下载快照失败');
    }
  }

  const undoTarget = findOwnUndoTarget(events, join.identity);

  return (
    <section className="panel whiteboard-panel">
      <div className="whiteboard-toolbar">
        <div className="whiteboard-title">
          <strong>公共白板</strong>
          <span className="whiteboard-status">{status}</span>
          <span className="whiteboard-status">支持 Ctrl + V 粘贴图片/截图</span>
          {pendingImage && <span className="whiteboard-status pending">点击白板放置图片</span>}
        </div>
        <div className="whiteboard-controls">
          <label className="whiteboard-control">
            <span>颜色</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <label className="whiteboard-control">
            <span>笔粗</span>
            <select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
              <option value={2}>2px</option>
              <option value={4}>4px</option>
              <option value={6}>6px</option>
              <option value={8}>8px</option>
            </select>
          </label>
          <div className="whiteboard-zoom-group">
            <button className="whiteboard-btn" type="button" onClick={() => zoomAroundCenter(1 / ZOOM_STEP)}>-</button>
            <span className="whiteboard-zoom-label">{Math.round(camera.zoom * 100)}%</span>
            <button className="whiteboard-btn" type="button" onClick={() => zoomAroundCenter(ZOOM_STEP)}>+</button>
            <button className="whiteboard-btn" type="button" onClick={resetView}>重置视图</button>
          </div>
          <button className="whiteboard-btn" type="button" onClick={undoOwn} disabled={!undoTarget}>撤销我的上一步</button>
          <button className="whiteboard-btn" type="button" onClick={downloadSnapshot}>下载快照</button>
          <label className="whiteboard-upload-btn">
            插入图片
            <input type="file" accept="image/*" onChange={upload} />
          </label>
        </div>
      </div>
      <div className="whiteboard-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className={`${isPanning ? 'panning' : ''} ${pendingImage ? 'placing-image' : ''}`}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onWheel={wheel}
        />
      </div>
    </section>
  );
}

function redraw(
  canvas: HTMLCanvasElement | null,
  events: WhiteboardEventPayload[],
  current: Stroke | null,
  camera: Camera,
  pendingImage: PendingImage | null,
  hoverWorldPoint: Point | null,
  imageCache: Map<string, HTMLImageElement>,
  onImageLoaded: () => void,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const board = buildVisibleBoard(events);
  // 每次从白底开始重绘，避免撤销/清空时需要复杂的增量擦除逻辑。
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, canvas, camera);
  board.images.forEach((image) => drawBoardImage(ctx, image, camera, imageCache, onImageLoaded));
  if (pendingImage) drawPendingImage(ctx, canvas, pendingImage, camera, hoverWorldPoint);
  board.strokes.forEach((stroke) => drawStroke(ctx, stroke, camera, false));
  if (current) drawStroke(ctx, current, camera, false);
}

function buildVisibleBoard(events: WhiteboardEventPayload[]): VisibleBoard {
  const effectiveEvents = events.slice(lastClearIndex(events) + 1);
  const removed = new Set<string>();
  for (const event of effectiveEvents) {
    if (event.type === 'stroke_undo') removed.add((event.payload as any).strokeId);
    if (event.type === 'image_undo') removed.add((event.payload as any).imageId);
  }

  const strokes: Stroke[] = [];
  const images: BoardImage[] = [];
  for (const event of effectiveEvents) {
    if (event.type === 'stroke_add') {
      const stroke = event.payload as Stroke;
      if (!removed.has(stroke.id)) strokes.push(stroke);
    }
    if (event.type === 'image_add') {
      const image = event.payload as BoardImage;
      if (!removed.has(image.id)) images.push(image);
    }
  }
  return { strokes, images };
}

function drawGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, camera: Camera) {
  const spacing = 80 * camera.zoom;
  if (spacing < 12) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
  ctx.lineWidth = 1;
  const offsetX = modulo(camera.x, spacing);
  const offsetY = modulo(camera.y, spacing);
  for (let x = offsetX; x <= canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = offsetY; y <= canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, camera: Camera, worldSpace: boolean) {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.strokeStyle = stroke.color || DEFAULT_COLOR;
  ctx.fillStyle = stroke.color || DEFAULT_COLOR;
  ctx.lineWidth = worldSpace ? stroke.width : stroke.width * camera.zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const first = worldSpace ? stroke.points[0] : worldToScreen(stroke.points[0], camera);
  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, Math.max(1, ctx.lineWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  stroke.points.slice(1).forEach((point) => {
    const next = worldSpace ? point : worldToScreen(point, camera);
    ctx.lineTo(next.x, next.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawBoardImage(
  ctx: CanvasRenderingContext2D,
  image: BoardImage,
  camera: Camera,
  imageCache: Map<string, HTMLImageElement>,
  onImageLoaded: () => void,
) {
  const element = getCachedImage(image.imageUrl, imageCache, onImageLoaded);
  if (!element.complete || !element.naturalWidth) return;
  const target = {
    x: image.x * camera.zoom + camera.x,
    y: image.y * camera.zoom + camera.y,
    width: image.width * camera.zoom,
    height: image.height * camera.zoom,
  };
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
  ctx.shadowBlur = 12;
  ctx.drawImage(element, target.x, target.y, target.width, target.height);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = Math.max(1, camera.zoom);
  ctx.strokeRect(target.x, target.y, target.width, target.height);
  ctx.restore();
}

function drawPendingImage(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  pending: PendingImage,
  camera: Camera,
  hoverWorldPoint: Point | null,
) {
  const center = hoverWorldPoint ?? {
    x: (canvas.width / 2 - camera.x) / camera.zoom,
    y: (canvas.height / 2 - camera.y) / camera.zoom,
  };
  const target = {
    x: (center.x - pending.width / 2) * camera.zoom + camera.x,
    y: (center.y - pending.height / 2) * camera.zoom + camera.y,
    width: pending.width * camera.zoom,
    height: pending.height * camera.zoom,
  };
  ctx.save();
  ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.fillRect(target.x, target.y, target.width, target.height);
  ctx.strokeRect(target.x, target.y, target.width, target.height);
  ctx.restore();
}

function getCachedImage(url: string, cache: Map<string, HTMLImageElement>, onImageLoaded: () => void) {
  const existing = cache.get(url);
  if (existing) return existing;
  const image = new Image();
  image.onload = onImageLoaded;
  image.src = url;
  cache.set(url, image);
  return image;
}

async function drawExportImage(ctx: CanvasRenderingContext2D, image: BoardImage) {
  const element = await loadImage(image.imageUrl);
  ctx.save();
  ctx.drawImage(element, image.x, image.y, image.width, image.height);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(image.x, image.y, image.width, image.height);
  ctx.restore();
}

function getExportBounds(board: VisibleBoard) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  board.images.forEach((image) => {
    minX = Math.min(minX, image.x);
    minY = Math.min(minY, image.y);
    maxX = Math.max(maxX, image.x + image.width);
    maxY = Math.max(maxY, image.y + image.height);
  });
  board.strokes.forEach((stroke) => {
    const half = (stroke.width || DEFAULT_WIDTH) / 2;
    stroke.points.forEach((point) => {
      minX = Math.min(minX, point.x - half);
      minY = Math.min(minY, point.y - half);
      maxX = Math.max(maxX, point.x + half);
      maxY = Math.max(maxY, point.y + half);
    });
  });
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function lastClearIndex(events: WhiteboardEventPayload[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === 'board_clear') return index;
  }
  return -1;
}

function findOwnUndoTarget(events: WhiteboardEventPayload[], identity: string) {
  const actions: Array<{ type: 'stroke' | 'image'; id: string }> = [];
  for (const event of events.slice(lastClearIndex(events) + 1)) {
    if (event.type === 'stroke_undo') {
      removeAction(actions, (event.payload as any).strokeId);
      continue;
    }
    if (event.type === 'image_undo') {
      removeAction(actions, (event.payload as any).imageId);
      continue;
    }
    if (event.authorIdentity !== identity) continue;
    if (event.type === 'stroke_add') {
      const stroke = event.payload as Stroke;
      actions.push({ type: 'stroke', id: stroke.id });
    }
    if (event.type === 'image_add') {
      const image = event.payload as BoardImage;
      actions.push({ type: 'image', id: image.id });
    }
  }
  return actions[actions.length - 1];
}

function removeAction(actions: Array<{ id: string }>, id: string) {
  const index = actions.findIndex((action) => action.id === id);
  if (index >= 0) actions.splice(index, 1);
}

function releasePointerCapture(canvas: HTMLCanvasElement, pointerId: number) {
  try {
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture can already be released by the browser during cancellation.
  }
}

function worldToScreen(point: Point, camera: Camera) {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

function modulo(value: number, size: number) {
  return ((value % size) + size) % size;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function triggerDownload(canvas: HTMLCanvasElement, fileName: string) {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = fileName;
  link.click();
}

function readImageSize(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    image.src = url;
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = url;
  });
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable;
}
