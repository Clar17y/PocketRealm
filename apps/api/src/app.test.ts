import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test';
});

function buildApp() {
  return createApp({
    isAllowedCorsOrigin: () => true,
  });
}

describe('createApp request IDs', () => {
  it('preserves a valid client-provided UUID request ID', async () => {
    const requestId = '123e4567-e89b-12d3-a456-426614174000';

    const res = await request(buildApp())
      .get('/health/live')
      .set('x-request-id', requestId);

    expect(res.headers['x-request-id']).toBe(requestId);
  });
});
