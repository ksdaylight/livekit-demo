import { useEffect, useState } from 'react';
import { LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer, ControlBar, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { api } from '../lib/api';
import { clearJoin, readJoin } from '../lib/session';
import { ChatPanel } from './panels/ChatPanel';
import { FilePanel } from './panels/FilePanel';
import { WhiteboardPanel } from './panels/WhiteboardPanel';
import { AdminPanel } from './panels/AdminPanel';

export function MeetingPage({ onExit }: { onExit: () => void }) {
  const [join] = useState(readJoin);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!join) onExit();
  }, [join, onExit]);

  if (!join) return null;
  const activeJoin = join;

  async function leave() {
    try {
      await api.leave(activeJoin);
    } catch {
      // Leaving should be best-effort; the LiveKit disconnect remains user-visible.
    }
    clearJoin();
    onExit();
  }

  return (
    <main className="meeting-page">
      <header className="meeting-topbar">
        <div>
          <strong>{activeJoin.title}</strong>
          <span>会议号 {activeJoin.roomCode}</span>
          <span>{activeJoin.displayName} · {activeJoin.role === 'host' ? '主持人' : '访客'}</span>
        </div>
        <button className="danger" onClick={leave}>离开会议</button>
      </header>

      {error && <div className="banner">{error}</div>}

      <div className="meeting-layout">
        <section className="video-area">
          <LiveKitRoom
            serverUrl={activeJoin.livekitUrl}
            token={activeJoin.livekitToken}
            connect
            video
            audio
            onError={(err) => setError(err.message)}
            onDisconnected={leave}
          >
            <VideoGrid />
            <RoomAudioRenderer />
            <ControlBar />
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
