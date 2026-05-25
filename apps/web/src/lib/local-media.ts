type LocationLike = Pick<Location, 'protocol' | 'host'>;
type NavigatorLike = { mediaDevices?: { getUserMedia?: unknown } };

// SSR/测试环境没有 window，封装后测试可以传入假的 location。
function currentLocation() {
  return typeof window === 'undefined' ? undefined : window.location;
}

// SSR/测试环境没有 navigator，封装后测试可以独立覆盖媒体能力。
function currentNavigator(): NavigatorLike {
  return typeof navigator === 'undefined' ? {} : navigator;
}

// getUserMedia 是浏览器访问摄像头/麦克风的核心 API。
export function canUseLocalMedia(navigatorLike: NavigatorLike = currentNavigator()) {
  return typeof navigatorLike.mediaDevices?.getUserMedia === 'function';
}

// 生成面向用户的本地媒体不可用提示，尤其覆盖 Chrome 对非安全上下文的限制。
export function localMediaUnavailableMessage(
  locationLike: LocationLike | undefined = currentLocation(),
  navigatorLike: NavigatorLike = currentNavigator(),
) {
  if (canUseLocalMedia(navigatorLike)) return '';

  const origin = locationLike ? `${locationLike.protocol}//${locationLike.host}` : '当前地址';
  if (locationLike?.protocol === 'http:') {
    // 局域网 HTTP 页面在 Chrome 中默认不是安全上下文，需要手动加入 flags 或改用 HTTPS。
    return `当前访问地址 ${origin} 不是安全上下文，Chrome 不允许访问摄像头和麦克风。请改用 HTTPS，或在 chrome://flags/#unsafely-treat-insecure-origin-as-secure 添加 ${origin} 后重启 Chrome。`;
  }

  return '当前浏览器不支持摄像头和麦克风访问，请换用支持 getUserMedia 的浏览器。';
}
