import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from '@livekit/components-react';
import { DisconnectReason, MediaDeviceFailure, Track } from 'livekit-client';
import { api } from '../lib/api';
import { localMediaUnavailableMessage } from '../lib/local-media';
import { resolveLiveKitUrl } from '../lib/livekit-url';
import { clearJoin, readJoin } from '../lib/session';
import { ChatPanel } from './panels/ChatPanel';
import { FilePanel } from './panels/FilePanel';
import { WhiteboardPanel } from './panels/WhiteboardPanel';
import { AdminPanel } from './panels/AdminPanel';

// 会议页负责组装 LiveKit 房间、业务侧边栏和离会/断线处理。
export function MeetingPage({ onExit }: { onExit: () => void }) {
  // join 信息只在组件首次挂载时读取，避免中途 sessionStorage 改变导致会议状态抖动。
  const [join] = useState(readJoin);
  // 本地媒体不可用时仍允许进入会议，只是不自动发布音视频。
  const [mediaWarning] = useState(localMediaUnavailableMessage);
  const [error, setError] = useState('');
  // 避免用户点击离开、LiveKit onDisconnected、浏览器重连等路径重复调用 leave。
  const leavingRef = useRef(false);

  const exitToHome = useCallback(() => {
    // 清掉 sessionStorage 后回到入口页，刷新浏览器也不会再次进入会议。
    leavingRef.current = true;
    clearJoin();
    onExit();
  }, [onExit]);

  const leave = useCallback(async () => {
    if (!join || leavingRef.current) return;
    leavingRef.current = true;
    try {
      // 后端离会是 best-effort：即使网络失败，也应该让用户离开本地会议页。
      await api.leave(join);
    } catch {
      // 离会请求失败时不阻塞 UI 退出；后端仍可通过断线/清理任务修正状态。
    }
    exitToHome();
  }, [exitToHome, join]);

  const handleLiveKitError = useCallback((err: Error) => {
    // LiveKit SDK 的通用错误统一展示在顶部 banner。
    setError(err.message || '会议连接失败');
  }, []);

  const handleMediaDeviceFailure = useCallback((failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
    // 把 SDK 的设备错误转换成面向用户的中文提示。
    const deviceName = kind === 'audioinput' ? '麦克风' : kind === 'videoinput' ? '摄像头' : '媒体设备';
    if (failure === MediaDeviceFailure.PermissionDenied) {
      setError(`浏览器未授权访问${deviceName}，请允许权限后重新进入会议。`);
      return;
    }
    if (failure === MediaDeviceFailure.NotFound) {
      setError(`没有找到可用的${deviceName}。`);
      return;
    }
    if (failure === MediaDeviceFailure.DeviceInUse) {
      setError(`${deviceName}正在被其他应用占用。`);
      return;
    }
    setError(`无法启用${deviceName}，请检查浏览器权限和设备状态。`);
  }, []);

  const handleLiveKitDisconnected = useCallback(
    (reason?: DisconnectReason) => {
      if (leavingRef.current) return;
      if (reason === DisconnectReason.CLIENT_INITIATED) {
        // 用户通过 LiveKit 控制栏断开时，同步调用业务离会接口。
        void leave();
        return;
      }
      if (
        reason === DisconnectReason.PARTICIPANT_REMOVED ||
        reason === DisconnectReason.ROOM_DELETED
      ) {
        // 被主持人移除或会议被删除时直接回入口页，避免留在失效会议中。
        exitToHome();
        return;
      }
      setError(disconnectMessage(reason));
    },
    [exitToHome, leave],
  );

  useEffect(() => {
    // 如果 sessionStorage 没有会议上下文，说明刷新/入口状态异常，直接回入口页。
    if (!join) onExit();
  }, [join, onExit]);

  if (!join) return null;
  const activeJoin = join;
  // 后端可能返回 same-origin 或显式 LiveKit 地址，这里统一解析成 SDK 可用 URL。
  const livekitServerUrl = resolveLiveKitUrl(activeJoin.livekitUrl);
  const canPublishLocalMedia = !mediaWarning;

  return (
    <main className="meeting-page">
      <header className="meeting-topbar">
        <div>
          <strong>{activeJoin.title}</strong>
          <span>会议号 {activeJoin.roomCode}</span>
          <span>
            {activeJoin.displayName} · {activeJoin.role === 'host' ? '主持人' : '访客'}
          </span>
        </div>
        <button className="danger" onClick={leave}>
          离开会议
        </button>
      </header>

      {error && <div className="banner">{error}</div>}
      {mediaWarning && <div className="banner">{mediaWarning}</div>}

      <div className="meeting-layout">
        <section className="video-area">
          {/* LiveKitRoom 管理信令连接、媒体发布和订阅；业务侧边栏走独立 WebSocket。 */}
          <LiveKitRoom
            serverUrl={livekitServerUrl}
            token={activeJoin.livekitToken}
            connect
            video={canPublishLocalMedia}
            audio={canPublishLocalMedia}
            onError={handleLiveKitError}
            onMediaDeviceFailure={handleMediaDeviceFailure}
            onDisconnected={handleLiveKitDisconnected}
          >
            <VideoGrid />
            <RoomAudioRenderer />
            <ControlBar
              controls={{
                camera: canPublishLocalMedia,
                microphone: canPublishLocalMedia,
                screenShare: canPublishLocalMedia,
              }}
            />
          </LiveKitRoom>
        </section>
        <aside className="side-panels">
          {/* 管理面板只给主持人展示；其他实时面板所有角色都可使用。 */}
          {activeJoin.role === 'host' && <AdminPanel join={activeJoin} onDissolved={leave} />}
          <ChatPanel join={activeJoin} />
          <FilePanel join={activeJoin} />
          <WhiteboardPanel join={activeJoin} />
        </aside>
      </div>
    </main>
  );
}

function disconnectMessage(reason?: DisconnectReason) {
  // 把 LiveKit 断线原因转换成更明确的排障提示。
  switch (reason) {
    case DisconnectReason.JOIN_FAILURE:
      return '无法连接 LiveKit 服务，请检查 LIVEKIT_URL 或 /rtc 反向代理是否能被浏览器访问。';
    case DisconnectReason.DUPLICATE_IDENTITY:
      return '同一身份已在其他窗口加入，当前连接已断开。';
    case DisconnectReason.SERVER_SHUTDOWN:
      return 'LiveKit 服务正在重启或已关闭，请稍后重试。';
    case DisconnectReason.SIGNAL_CLOSE:
      return '会议信令连接已断开，请检查网络后重试。';
    default:
      return '会议连接已断开，请检查网络或稍后重试。';
  }
}

function VideoGrid() {
  // 同时订阅摄像头和屏幕共享轨道；摄像头没有画面时保留 placeholder。
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} className="lk-grid">
      <ParticipantTile />
    </GridLayout>
  );
}
