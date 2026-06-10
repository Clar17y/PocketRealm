import { isRecord } from '../utils.js';

export interface PocketRealmApiClientOptions {
  baseUrl: string;
  internalApiKey: string;
  fetchImpl?: typeof fetch;
}

export class PocketRealmApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'PocketRealmApiError';
  }
}

export class PocketRealmApiClient {
  private readonly baseUrl: URL;
  private readonly internalApiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PocketRealmApiClientOptions) {
    this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    this.internalApiKey = options.internalApiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
      },
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(this.buildUrl(path), {
      ...init,
      headers: {
        ...init.headers,
        'x-pocketrealm-bot-key': this.internalApiKey,
      },
    });

    const body = await parseResponseBody(response);
    if (!response.ok) {
      const errorBody = isRecord(body) ? body : {};
      const code = typeof errorBody.code === 'string' ? errorBody.code : 'POCKETREALM_API_ERROR';
      const message = typeof errorBody.message === 'string'
        ? errorBody.message
        : `PocketRealm API request failed with status ${response.status}`;

      throw new PocketRealmApiError(message, response.status, code, body);
    }

    return body as T;
  }

  private buildUrl(path: string): URL {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('PocketRealm API path must be a relative API path beginning with /');
    }

    return new URL(path.slice(1), this.baseUrl);
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
