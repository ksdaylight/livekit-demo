// 根据当前页面协议和 host 生成业务 WebSocket 地址。
// 页面是 https 时必须使用 wss，否则浏览器会因混合内容拦截连接。
export function wsUrl(path: string, params: Record<string, string>) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${window.location.host}${path}`);
  // identity/participantKey 放在 query 中，服务端 Gateway 建连时会先校验。
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}
