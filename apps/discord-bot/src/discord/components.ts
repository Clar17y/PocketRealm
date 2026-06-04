export interface ParsedSupportButtonId {
  action: string;
  publicId: string;
}

export function supportButtonId(action: string, publicId: string): string {
  return `support:${action}:${publicId}`;
}

export function parseSupportButtonId(customId: string): ParsedSupportButtonId | null {
  const parts = customId.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [scope, action, publicId] = parts;
  if (scope !== 'support' || !action || !publicId) {
    return null;
  }

  return { action, publicId };
}
