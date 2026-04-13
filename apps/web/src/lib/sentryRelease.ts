export function getSentryRelease(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_VERSION ?? env.NEXT_PUBLIC_APP_VERSION ?? 'unknown';
}
