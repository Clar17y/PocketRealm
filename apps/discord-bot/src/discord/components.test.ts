import { describe, expect, it } from 'vitest';

import {
  duelAcceptButtonId,
  duelBuildsButtonId,
  duelDeclineButtonId,
  duelReplayButtonId,
  duelRematchButtonId,
  parseDuelButtonId,
  parseSupportButtonId,
  supportButtonId,
} from './components.js';

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

describe('duel Discord component ids', () => {
  it('builds stable duel button custom ids', () => {
    expect(duelAcceptButtonId('duel-1', '123456789012345678')).toBe(
      'duel:accept:duel-1:123456789012345678',
    );
    expect(duelDeclineButtonId('duel-1', '123456789012345678')).toBe(
      'duel:decline:duel-1:123456789012345678',
    );
    expect(duelReplayButtonId('duel-1', 2)).toBe('duel:replay:duel-1:2');
    expect(duelBuildsButtonId('duel-1')).toBe('duel:builds:duel-1');
    expect(duelRematchButtonId('duel-1')).toBe('duel:rematch:duel-1');
  });

  it('parses accept and decline duel custom ids with the target user id', () => {
    expect(parseDuelButtonId('duel:accept:duel-1:123456789012345678')).toEqual({
      action: 'accept',
      duelId: 'duel-1',
      targetDiscordUserId: '123456789012345678',
    });
    expect(parseDuelButtonId('duel:decline:duel-1:123456789012345678')).toEqual({
      action: 'decline',
      duelId: 'duel-1',
      targetDiscordUserId: '123456789012345678',
    });
  });

  it('parses replay duel custom ids with a page number', () => {
    expect(parseDuelButtonId('duel:replay:duel-1:2')).toEqual({
      action: 'replay',
      duelId: 'duel-1',
      page: 2,
    });
  });

  it('parses result action duel custom ids', () => {
    expect(parseDuelButtonId('duel:builds:duel-1')).toEqual({
      action: 'builds',
      duelId: 'duel-1',
    });
    expect(parseDuelButtonId('duel:rematch:duel-1')).toEqual({
      action: 'rematch',
      duelId: 'duel-1',
    });
  });

  it('rejects malformed duel custom ids', () => {
    expect(parseDuelButtonId('support:accept:duel-1:123456789012345678')).toBeNull();
    expect(parseDuelButtonId('duel:accept:duel-1')).toBeNull();
    expect(parseDuelButtonId('duel:accept:duel-1:')).toBeNull();
    expect(parseDuelButtonId('duel:replay:duel-1:not-a-page')).toBeNull();
  });
});
