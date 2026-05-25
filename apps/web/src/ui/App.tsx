import { useEffect, useState } from 'react';
import { readJoin } from '../lib/session';
import { EntryPage } from './EntryPage';
import { MeetingPage } from './MeetingPage';

type Route = 'entry' | 'meeting';

// 顶层组件只维护入口页/会议页两种状态；真正的会议上下文放在 sessionStorage。
export function App() {
  // 刷新页面时如果还存在 join 信息，就直接恢复会议页。
  const [route, setRoute] = useState<Route>(() => (readJoin() ? 'meeting' : 'entry'));

  useEffect(() => {
    // 支持浏览器前进/后退或其他代码触发 popstate 后重新判断当前页面状态。
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
