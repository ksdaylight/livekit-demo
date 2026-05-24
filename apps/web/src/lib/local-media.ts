type LocationLike = Pick<Location, 'protocol' | 'host'>;
type NavigatorLike = { mediaDevices?: { getUserMedia?: unknown } };

function currentLocation() {
  return typeof window === 'undefined' ? undefined : window.location;
}

function currentNavigator(): NavigatorLike {
  return typeof navigator === 'undefined' ? {} : navigator;
}

export function canUseLocalMedia(navigatorLike: NavigatorLike = currentNavigator()) {
  return typeof navigatorLike.mediaDevices?.getUserMedia === 'function';
}

export function localMediaUnavailableMessage(
  locationLike: LocationLike | undefined = currentLocation(),
  navigatorLike: NavigatorLike = currentNavigator(),
) {
  if (canUseLocalMedia(navigatorLike)) return '';

  const origin = locationLike ? `${locationLike.protocol}//${locationLike.host}` : '当前地址';
  if (locationLike?.protocol === 'http:') {
    return `当前访问地址 ${origin} 不是安全上下文，Chrome 不允许访问摄像头和麦克风。请改用 HTTPS，或在 chrome://flags/#unsafely-treat-insecure-origin-as-secure 添加 ${origin} 后重启 Chrome。`;
  }

  return '当前浏览器不支持摄像头和麦克风访问，请换用支持 getUserMedia 的浏览器。';
}
