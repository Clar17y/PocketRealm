import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => ({
      subscribe: vi.fn().mockResolvedValue(1),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
    })),
  },
}));

import { redis } from '../redis';
import { publishChatMessageFromWorker, startRealtimeBridge } from './realtimeBridge';

describe('publishChatMessageFromWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes a serialized chat message event to Redis', async () => {
    await publishChatMessageFromWorker({
      id: 'm1',
      channelType: 'zone',
      channelId: 'zone:z1',
      playerId: 'system',
      username: 'System',
      message: 'hello',
      messageType: 'system',
      createdAt: '2026-05-27T00:00:00.000Z',
    });

    expect(redis.publish).toHaveBeenCalledWith(
      'pocketrealm:realtime:chat-message',
      expect.stringContaining('"id":"m1"'),
    );
  });

  it('emits bridged worker messages only to local sockets', async () => {
    type RedisMessageHandler = (channel: string, payload: string) => void;
    const sub = {
      subscribe: vi.fn().mockResolvedValue(1),
      on: vi.fn((_event: string, _handler: RedisMessageHandler) => undefined),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    vi.mocked(redis.duplicate).mockReturnValue(sub as never);

    const emit = vi.fn();
    const localTo = vi.fn(() => ({ emit }));
    const globalTo = vi.fn(() => ({ emit: vi.fn() }));
    const io = {
      local: { to: localTo },
      to: globalTo,
    };

    const stop = startRealtimeBridge(io as never);
    const handleMessage = sub.on.mock.calls.find(([event]) => event === 'message')?.[1];
    if (!handleMessage) {
      throw new Error('Realtime bridge did not register a Redis message handler');
    }

    handleMessage('pocketrealm:realtime:chat-message', JSON.stringify({
      id: 'm2',
      channelType: 'zone',
      channelId: 'zone:z1',
      playerId: 'system',
      username: 'System',
      message: 'worker activity',
      messageType: 'activity',
      createdAt: '2026-05-27T00:00:00.000Z',
    }));

    expect(localTo).toHaveBeenCalledWith('chat:zone:z1');
    expect(globalTo).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('chat:message', expect.objectContaining({ id: 'm2' }));

    await stop();
    expect(sub.quit).toHaveBeenCalled();
  });
});
