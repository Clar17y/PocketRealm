import { describe, expect, it } from 'vitest';

import { parseSupportButtonId, supportButtonId } from './components.js';

describe('support Discord component ids', () => {
  it('builds stable support button custom ids', () => {
    expect(supportButtonId('ask_reporter', 'SUP-1')).toBe('support:ask_reporter:SUP-1');
  });

  it('parses support button custom ids', () => {
    expect(parseSupportButtonId('support:needs_info:SUP-1')).toEqual({
      action: 'needs_info',
      publicId: 'SUP-1',
    });
  });

  it('rejects malformed support button custom ids', () => {
    expect(parseSupportButtonId('profile:needs_info:SUP-1')).toBeNull();
    expect(parseSupportButtonId('support:needs_info')).toBeNull();
    expect(parseSupportButtonId('support:needs_info:')).toBeNull();
  });
});
