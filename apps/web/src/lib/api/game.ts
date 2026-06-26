import { fetchApi } from './core';

export async function getGameBootstrap<T>() {
  return fetchApi<T>('/api/v1/game/bootstrap');
}
