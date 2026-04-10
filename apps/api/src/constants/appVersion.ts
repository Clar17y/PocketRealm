/**
 * Resolves the deployed application version.
 *
 * Set `APP_VERSION` at build time (e.g. from git tag or package.json).
 * Used as the Sentry release tag and surfaced in /health.
 */
export function resolveAppVersion(): string {
  const raw = process.env.APP_VERSION;
  if (typeof raw !== 'string') return 'unknown';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

export const APP_VERSION = resolveAppVersion();
