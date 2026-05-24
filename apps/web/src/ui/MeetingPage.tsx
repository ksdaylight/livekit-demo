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

export function MeetingPage({ onExit }: { onExit: () => void }) {
  const [join] = useState(readJoin);
  const [mediaWarning] = useState(localMediaUnavailableMessage);
  const [error, setError] = useState('');
  const leavingRef = useRef(false);

  const exitToHome = useCallback(() => {
    leavingRef.current = true;
    clearJoin();
    onExit();
  }, [onExit]);

  const leave = useCallback(async () => {
    if (!join || leavingRef.current) return;
    leavingRef.current = true;
    try {
      await api.leave(join);
    } catch {
      // Leaving should be best-effort; the LiveKit disconnect remains user-visible.
    }
    exitToHome();
  }, [exitToHome, join]);

  const handleLiveKitError = useCallback((err: Error) => {
    setError(err.message || '会议连接失败');
  }, []);

  const handleMediaDeviceFailure = useCallback((failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
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
        void leave();
        return;
      }
      if (
        reason === DisconnectReason.PARTICIPANT_REMOVED ||
        reason === DisconnectReason.ROOM_DELETED
      ) {
        exitToHome();
        return;
      }
      setError(disconnectMessage(reason));
    },
    [exitToHome, leave],
  );

  useEffect(() => {
    if (!join) onExit();
  }, [join, onExit]);

  if (!join) return null;
  const activeJoin = join;
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
