import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as SocketServer } from 'socket.io';

vi.mock('./chatService', () => ({
  saveMessage: vi.fn(),
}));

import { saveMessage } from './chatService';
import { emitSystemMessage } from './systemMessageService';

const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>;

describe('systemMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a system message via chatService', async () => {
    mockSaveMessage.mockResolvedValue({
      id: 'msg-1',
      createdAt: new Date('2026-02-04T12:00:00Z'),
    });

    const result = await emitSystemMessage(null, 'world', 'world', 'Hello world');
    expect(result).toEqual({
      id: 'msg-1',
      createdAt: new Date('2026-02-04T12:00:00Z'),
    });

    expect(mockSaveMessage).toHaveBeenCalledWith({
      channelType: 'world',
      channelId: 'world',
      playerId: '00000000-0000-0000-0000-000000000000',
      username: 'System',
      message: 'Hello world',
      messageType: 'system',
    });
  });

  it('emits to socket room when io is provided', async () => {
    mockSaveMessage.mockResolvedValue({
      id: 'msg-2',
      createdAt: new Date('2026-02-04T12:00:00Z'),
    });

    const mockEmit = vi.fn();
    const mockTo = vi.fn(() => ({ emit: mockEmit }));
    const mockIo = { to: mockTo } as unknown as SocketServer;

    await emitSystemMessage(mockIo, 'zone', 'zone:z1', 'Zone message');

    expect(mockTo).toHaveBeenCalledWith('chat:zone:z1');
    expect(mockEmit).toHaveBeenCalledWith('chat:message', expect.objectContaining({
      id: 'msg-2',
      channelType: 'zone',
      channelId: 'zone:z1',
      playerId: '00000000-0000-0000-0000-000000000000',
      username: 'System',
      message: 'Zone message',
      messageType: 'system',
    }));
  });

  it('does not emit when io is null', async () => {
    mockSaveMessage.mockResolvedValue({
      id: 'msg-3',
      createdAt: new Date('2026-02-04T12:00:00Z'),
    });

    // Should not throw
    await emitSystemMessage(null, 'world', 'world', 'No socket');

    expect(mockSaveMessage).toHaveBeenCalled();
  });

  it('can mark structured activity separately from regular system messages', async () => {
    mockSaveMessage.mockResolvedValue({
      id: 'msg-4',
      createdAt: new Date('2026-02-04T12:00:00Z'),
    });

    await emitSystemMessage(null, 'world', 'world', 'Activity happened', 'activity');

    expect(mockSaveMessage).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Activity happened',
      messageType: 'activity',
    }));
  });
});
