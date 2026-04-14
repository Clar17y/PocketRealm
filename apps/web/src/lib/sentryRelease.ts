function normalizeRelease(value: string | undefined): string {
  return value && value.length > 0 ? value : 'unknown';
}

export function getClientSentryRelease(): string {
  return normalizeRelease(process.env.NEXT_PUBLIC_APP_VERSION);
}

export function getServerSentryRelease(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeRelease(env.APP_VERSION || env.NEXT_PUBLIC_APP_VERSION);
}
