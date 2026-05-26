import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantTracks,
  useParticipants,
} from '@livekit/components-react';
import type { JoinMeetingResponse, MediaControlPayload } from '@rtclive/shared';
import { DisconnectReason, MediaDeviceFailure, Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import { api } from '../lib/api';
import { localMediaUnavailableMessage } from '../lib/local-media';
import { resolveLiveKitUrl } from '../lib/livekit-url';
import { clearJoin, readJoin } from '../lib/session';
import { wsUrl } from '../lib/ws';
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
  const [mediaControls, setMediaControls] = useState<MediaControlPayload[]>([]);
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

      <div className={`meeting-layout ${activeJoin.role === 'host' ? 'with-admin' : 'without-admin'}`}>
        <div className="meeting-main">
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
              <MediaControlSync
                join={activeJoin}
                onKicked={exitToHome}
                onError={setError}
                onParticipants={setMediaControls}
              />
              <VideoGrid join={activeJoin} mediaControls={mediaControls} onError={setError} />
              <RoomAudioRenderer />
              <MeetingControlBar
                canPublishLocalMedia={canPublishLocalMedia}
                lock={mediaControls.find((item) => item.identity === activeJoin.identity)}
                onError={setError}
              />
            </LiveKitRoom>
          </section>
          <WhiteboardPanel join={activeJoin} />
        </div>
        {activeJoin.role === 'host' && (
          <aside className="side-panels">
            {/* 管理面板只给主持人展示；聊天和文件恢复原版右下角浮窗。 */}
            <AdminPanel join={activeJoin} participants={mediaControls} onDissolved={leave} />
          </aside>
        )}
      </div>
      <ChatPanel join={activeJoin} />
      <FilePanel join={activeJoin} participants={mediaControls} />
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

function MediaControlSync({
  join,
  onKicked,
  onError,
  onParticipants,
}: {
  join: JoinMeetingResponse;
  onKicked: () => void;
  onError: (message: string) => void;
  onParticipants: Dispatch<SetStateAction<MediaControlPayload[]>>;
}) {
  const { localParticipant } = useLocalParticipant();
  const [currentLock, setCurrentLock] = useState<MediaControlPayload | undefined>();

  useEffect(() => {
    const socket = new WebSocket(
      wsUrl(`/ws/v1/rooms/${join.roomCode}/media-control`, {
        identity: join.identity,
        participantKey: join.participantKey,
      }),
    );
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'media.snapshot') {
        const participants = message.participants ?? [];
        onParticipants(participants);
        setCurrentLock(participants.find((item: MediaControlPayload) => item.identity === join.identity));
      }
      if (message.type === 'media.control' && message.participant) {
        const participant = message.participant as MediaControlPayload;
        onParticipants((participants) => upsertMediaControl(participants, participant));
        if (participant.identity === join.identity) setCurrentLock(participant);
      }
      if (message.type === 'participant.kicked' && message.targetIdentity === join.identity) {
        onKicked();
      }
      if (message.type === 'system.error') onError(message.message);
    };
    socket.onclose = () => {
      onParticipants([]);
      setCurrentLock(undefined);
    };
    return () => socket.close();
  }, [join, onError, onKicked, onParticipants]);

  useEffect(() => {
    if (!currentLock) return;
    if (currentLock.audioLocked && localParticipant.isMicrophoneEnabled) {
      void localParticipant.setMicrophoneEnabled(false).catch((error) => onError(error.message || '无法关闭麦克风'));
    }
    if (currentLock.videoLocked && localParticipant.isCameraEnabled) {
      void localParticipant.setCameraEnabled(false).catch((error) => onError(error.message || '无法关闭摄像头'));
    }
    if (currentLock.screenLocked && localParticipant.isScreenShareEnabled) {
      void localParticipant.setScreenShareEnabled(false).catch((error) => onError(error.message || '无法停止屏幕共享'));
    }
  }, [currentLock, localParticipant, onError]);

  return null;
}

function VideoGrid({
  join,
  mediaControls,
  onError,
}: {
  join: JoinMeetingResponse;
  mediaControls: MediaControlPayload[];
  onError: (message: string) => void;
}) {
  const participants = useParticipants();
  const [preview, setPreview] = useState<{ title: string; kind: 'camera' | 'screen'; trackRef: any } | null>(null);

  return (
    <>
      <div className="meeting-grid">
        {participants.map((participant) => (
          <ParticipantCard
            key={participant.identity}
            participant={participant}
            join={join}
            lock={mediaControls.find((item) => item.identity === participant.identity)}
            onPreview={(trackRef, title, kind) => setPreview({ trackRef, title, kind })}
            onError={onError}
          />
        ))}
      </div>

      {preview && (
        <div className="preview-modal" role="dialog" aria-modal="true">
          <div className="preview-toolbar">
            <span>{preview.title}</span>
            <button onClick={() => setPreview(null)}>关闭</button>
          </div>
          <div className={`preview-content video-${preview.kind}`}>
            <VideoTrack trackRef={preview.trackRef} />
          </div>
        </div>
      )}
    </>
  );
}

function ParticipantCard({
  participant,
  join,
  lock,
  onPreview,
  onError,
}: {
  participant: Participant;
  join: JoinMeetingResponse;
  lock?: MediaControlPayload;
  onPreview: (trackRef: any, title: string, kind: 'camera' | 'screen') => void;
  onError: (message: string) => void;
}) {
  const tracks = useParticipantTracks([Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Microphone], participant.identity);
  const isSpeaking = useIsSpeaking(participant);
  const displayName = participant.name || lock?.displayName || participant.identity;
  const isSelf = participant.identity === join.identity;
  const cameraTrack = tracks.find((track) => track.source === Track.Source.Camera);
  const screenTrack = tracks.find((track) => track.source === Track.Source.ScreenShare);
  const audioTrack = tracks.find((track) => track.source === Track.Source.Microphone);
  const cameraLive = isTrackLive(cameraTrack);
  const screenLive = isTrackLive(screenTrack);
  const audioLive = isTrackLive(audioTrack);

  return (
    <article className="participant-card">
      <header className="participant-header">
        <div className="participant-name">
          {displayName}
          {isSelf && <span className="participant-status">我</span>}
          <SpeakingIndicator active={isSpeaking} />
        </div>
        <span className="participant-status">{audioLive ? '麦克风开启' : '麦克风关闭'}</span>
        <ParticipantAdminActions join={join} participant={participant} displayName={displayName} lock={lock} onError={onError} />
      </header>

      {(lock?.audioLocked || lock?.videoLocked || lock?.screenLocked) && (
        <div className="media-lock-notice">
          已限制：{[
            lock.audioLocked ? '麦克风' : '',
            lock.videoLocked ? '摄像头' : '',
            lock.screenLocked ? '屏幕共享' : '',
          ].filter(Boolean).join('、')}
        </div>
      )}

      <section className="media-section">
        <div className="media-section-header">
          <span className="media-section-title">摄像头</span>
          <div className="media-section-actions">
            {cameraLive && <button className="zoom-btn" onClick={() => onPreview(cameraTrack, `${displayName} - 摄像头放大预览`, 'camera')}>放大</button>}
          </div>
        </div>
        <div className={`media-slot camera-slot ${isSpeaking ? 'speaking' : ''}`}>
          {cameraLive && cameraTrack ? <VideoTrack trackRef={cameraTrack} /> : <div className="media-placeholder">摄像头未开启</div>}
        </div>
      </section>

      <section className="media-section">
        <div className="media-section-header">
          <span className="media-section-title">屏幕共享</span>
          <div className="media-section-actions">
            {screenLive && <span className="section-badge">共享中</span>}
            {screenLive && <button className="zoom-btn" onClick={() => onPreview(screenTrack, `${displayName} - 屏幕共享放大预览`, 'screen')}>放大</button>}
          </div>
        </div>
        <div className="media-slot screen-slot">
          {screenLive && screenTrack ? <VideoTrack trackRef={screenTrack} /> : <div className="media-placeholder">暂无屏幕共享</div>}
        </div>
      </section>
    </article>
  );
}

function ParticipantAdminActions({
  join,
  participant,
  displayName,
  lock,
  onError,
}: {
  join: JoinMeetingResponse;
  participant: Participant;
  displayName: string;
  lock?: MediaControlPayload;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (join.role !== 'host' || participant.identity === join.identity) return null;

  async function admin(action: string, payload: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await api.admin(join.roomCode, action, {
        identity: join.identity,
        participantKey: join.participantKey,
        ...payload,
      });
    } catch (error: any) {
      onError(error.message || '主持人操作失败');
    } finally {
      setBusy(false);
    }
  }

  const targetIdentity = participant.identity;
  return (
    <div className="participant-admin-actions">
      <button className="participant-kick-btn participant-chat-mute-btn" disabled={busy} onClick={() => admin('chat-mute', { targetIdentity, muted: true })}>禁言</button>
      <button className="participant-kick-btn participant-chat-mute-btn" disabled={busy} onClick={() => admin('chat-mute', { targetIdentity, muted: false })}>解禁</button>
      <button className="participant-kick-btn participant-media-control-btn" disabled={busy} onClick={() => admin('media-lock', { targetIdentity, mediaType: 'audio', locked: !lock?.audioLocked })}>{lock?.audioLocked ? '开麦' : '关麦'}</button>
      <button className="participant-kick-btn participant-video-control-btn" disabled={busy} onClick={() => admin('media-lock', { targetIdentity, mediaType: 'video', locked: !lock?.videoLocked })}>{lock?.videoLocked ? '开摄像头' : '关摄像头'}</button>
      <button className="participant-kick-btn participant-screen-control-btn" disabled={busy} onClick={() => admin('media-lock', { targetIdentity, mediaType: 'screen', locked: !lock?.screenLocked })}>{lock?.screenLocked ? '解屏幕' : '禁屏幕'}</button>
      <button className="participant-kick-btn danger-btn" disabled={busy} onClick={() => admin('kick', { targetIdentity }, `确认将 ${displayName} 踢出会议吗？`)}>踢出</button>
    </div>
  );
}

function MeetingControlBar({
  canPublishLocalMedia,
  lock,
  onError,
}: {
  canPublishLocalMedia: boolean;
  lock?: MediaControlPayload;
  onError: (message: string) => void;
}) {
  const { isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, localParticipant } = useLocalParticipant();

  async function toggle(kind: 'audio' | 'video' | 'screen') {
    try {
      if (kind === 'audio') await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      if (kind === 'video') await localParticipant.setCameraEnabled(!isCameraEnabled);
      if (kind === 'screen') await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (error: any) {
      onError(error.message || '媒体设备操作失败');
    }
  }

  const audioDisabled = !canPublishLocalMedia || !!lock?.audioLocked;
  const videoDisabled = !canPublishLocalMedia || !!lock?.videoLocked;
  const screenDisabled = !canPublishLocalMedia || !!lock?.screenLocked;

  return (
    <div className="actions meeting-controls">
      <button disabled={audioDisabled} onClick={() => toggle('audio')}>{isMicrophoneEnabled ? '关闭麦克风' : '开启麦克风'}</button>
      <button disabled={videoDisabled} onClick={() => toggle('video')}>{isCameraEnabled ? '关闭摄像头' : '开启摄像头'}</button>
      <button disabled={screenDisabled} onClick={() => toggle('screen')}>{isScreenShareEnabled ? '停止共享屏幕' : '开始共享屏幕'}</button>
    </div>
  );
}

function SpeakingIndicator({ active }: { active: boolean }) {
  return (
    <span className={`speaking-indicator ${active ? 'active level-2' : 'idle'}`}>
      <span className="speaking-dot" />
      <span className="speaking-bars"><span /><span /><span /></span>
    </span>
  );
}

function isTrackLive(trackRef: ReturnType<typeof useParticipantTracks>[number] | undefined) {
  return !!trackRef && !trackRef.publication.isMuted;
}

function upsertMediaControl(participants: MediaControlPayload[], participant: MediaControlPayload) {
  return [...participants.filter((item) => item.identity !== participant.identity), participant];
}
