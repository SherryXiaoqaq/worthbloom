function hostnameFromHostHeader(host: string) {
  const value = host.trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(1, value.indexOf(']'));
  return value.split(':')[0];
}

export function isLoopbackHostname(host: string) {
  const hostname = hostnameFromHostHeader(host);
  return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
}

export function isPrivateLanHostname(host: string) {
  const hostname = hostnameFromHostHeader(host);
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function isLocalPreviewHostname(host: string) {
  return isLoopbackHostname(host)
    || (process.env.NODE_ENV !== 'production' && isPrivateLanHostname(host));
}
