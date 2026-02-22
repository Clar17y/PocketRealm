/** Resolve the API base URL, handling localhost-to-LAN rewriting for remote clients. */
export function resolveUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (!configured) {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
    return 'http://localhost:4000';
  }

  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(configured);
      const isConfiguredLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      const isRemoteClient = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isConfiguredLoopback && isRemoteClient) {
        const protocol = parsed.protocol || window.location.protocol;
        const port = parsed.port || '4000';
        return `${protocol}//${window.location.hostname}:${port}`;
      }
    } catch {
      // fall through to configured value
    }
  }

  return configured;
}
