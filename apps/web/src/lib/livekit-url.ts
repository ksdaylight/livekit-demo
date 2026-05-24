const SAME_ORIGIN_VALUES = new Set(['', 'auto', 'same-origin', 'same_origin']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

type LocationLike = Pick<Location, 'protocol' | 'host'>;

function wsProtocolFor(protocol: string) {
  return protocol === 'https:' ? 'wss:' : 'ws:';
}

function sameOriginLiveKitUrl(location: LocationLike) {
  return `${wsProtocolFor(location.protocol)}//${location.host}`;
}

export function resolveLiveKitUrl(livekitUrl: string, location: LocationLike = window.location) {
  const value = livekitUrl.trim();
  if (SAME_ORIGIN_VALUES.has(value.toLowerCase())) {
    return sameOriginLiveKitUrl(location);
  }

  try {
    const configuredUrl = new URL(value);
    const pageUrl = new URL(`${location.protocol}//${location.host}`);
    if (LOCAL_HOSTNAMES.has(configuredUrl.hostname) && !LOCAL_HOSTNAMES.has(pageUrl.hostname)) {
      return sameOriginLiveKitUrl(location);
    }
  } catch {
    return value;
  }

  return value;
}
