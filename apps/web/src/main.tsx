import '@livekit/components-styles';
import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './ui/App';

// React Query 负责入口页的会议列表/历史记录缓存和自动刷新。
const queryClient = new QueryClient();

// 前端只有一个 root，页面路由由 App 内的轻量状态控制。
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
