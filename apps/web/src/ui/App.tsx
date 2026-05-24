import { useEffect, useState } from 'react';
import { readJoin } from '../lib/session';
import { EntryPage } from './EntryPage';
import { MeetingPage } from './MeetingPage';

type Route = 'entry' | 'meeting';

export function App() {
  const [route, setRoute] = useState<Route>(() => (readJoin() ? 'meeting' : 'entry'));

  useEffect(() => {
    const onPop = () => setRoute(readJoin() ? 'meeting' : 'entry');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return route === 'meeting' ? (
    <MeetingPage onExit={() => setRoute('entry')} />
  ) : (
    <EntryPage onJoined={() => setRoute('meeting')} />
  );
}
