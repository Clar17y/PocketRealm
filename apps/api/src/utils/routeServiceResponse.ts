import type { Response } from 'express';
import type { AuthPayload } from '../middleware/auth';

export interface RouteServiceResponse<TBody = unknown> {
  status?: number;
  headers?: Record<string, string>;
  body: TBody;
}

export interface AuthenticatedRouteServiceRequest {
  body?: unknown;
  query?: unknown;
  player: AuthPayload;
}

export interface AnonymousRouteServiceRequest {
  body?: unknown;
  query?: unknown;
}

export function routeJson<TBody>(body: TBody): RouteServiceResponse<TBody>;
export function routeJson<TBody>(status: number, body: TBody): RouteServiceResponse<TBody>;
export function routeJson<TBody>(
  statusOrBody: number | TBody,
  body?: TBody,
): RouteServiceResponse<TBody> {
  if (typeof statusOrBody === 'number') {
    return { status: statusOrBody, body: body as TBody };
  }

  return { body: statusOrBody };
}

export function withHeaders<TBody>(
  response: RouteServiceResponse<TBody>,
  headers: Record<string, string>,
): RouteServiceResponse<TBody> {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...headers,
    },
  };
}

export function sendRouteServiceResponse(res: Response, response: RouteServiceResponse): void {
  for (const [name, value] of Object.entries(response.headers ?? {})) {
    res.set(name, value);
  }
  res.status(response.status ?? 200).json(response.body);
}
