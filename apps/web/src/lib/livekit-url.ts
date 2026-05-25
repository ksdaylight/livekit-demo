// 这些值都表示“使用当前页面同源地址”，前端会通过 /rtc 代理连接 LiveKit。
const SAME_ORIGIN_VALUES = new Set(['', 'auto', 'same-origin', 'same_origin']);
// localhost 类地址只对打开页面的那台机器有效，局域网访问时需要避免直接返回它。
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

type LocationLike = Pick<Location, 'protocol' | 'host'>;

// LiveKit 浏览器 SDK 使用 WebSocket 信令，协议要跟随页面 http/https 切换。
function wsProtocolFor(protocol: string) {
  return protocol === 'https:' ? 'wss:' : 'ws:';
}

// same-origin 模式返回当前页面 origin，实际 /rtc 路径由 LiveKit SDK 内部请求拼接。
function sameOriginLiveKitUrl(location: LocationLike) {
  return `${wsProtocolFor(location.protocol)}//${location.host}`;
}

// 解析后端返回的 livekitUrl。它可能是 same-origin，也可能是显式 ws/wss 地址。
export function resolveLiveKitUrl(livekitUrl: string, location: LocationLike = window.location) {
  const value = livekitUrl.trim();
  if (SAME_ORIGIN_VALUES.has(value.toLowerCase())) {
    return sameOriginLiveKitUrl(location);
  }

  try {
    const configuredUrl = new URL(value);
    const pageUrl = new URL(`${location.protocol}//${location.host}`);
    // 如果后端误返回 localhost，但页面是局域网/公网地址，则改回 same-origin，避免浏览器连用户自己的 localhost。
    if (LOCAL_HOSTNAMES.has(configuredUrl.hostname) && !LOCAL_HOSTNAMES.has(pageUrl.hostname)) {
      return sameOriginLiveKitUrl(location);
    }
  } catch {
    // 非标准 URL 交给 LiveKit SDK 处理，避免这里过度纠正导致兼容性问题。
    return value;
  }

  return value;
}
