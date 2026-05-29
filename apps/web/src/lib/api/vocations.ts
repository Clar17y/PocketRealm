import type { VocationId, VocationSnapshotResponse, VocationStateDto } from '@pocketrealm/shared';
import { fetchApi, type TaxInfo, type TurnStateResponse } from './core';

export type { VocationSnapshotResponse };

export interface VocationActionResult {
  snapshot: VocationSnapshotResponse;
  vocation: VocationStateDto;
  turnSpend?: TurnStateResponse;
  taxInfo?: TaxInfo | null;
}

export function getVocations() {
  return fetchApi<VocationSnapshotResponse>('/api/v1/vocations');
}

export function honeVocation(vocationId: VocationId, turns: number) {
  return fetchApi<VocationActionResult>('/api/v1/vocations/hone', {
    method: 'POST',
    body: JSON.stringify({ vocationId, turns }),
  });
}

export function learnVocationTechnique(vocationId: VocationId, techniqueId: string) {
  return fetchApi<VocationActionResult>('/api/v1/vocations/techniques/learn', {
    method: 'POST',
    body: JSON.stringify({ vocationId, techniqueId }),
  });
}

export function respecVocation(vocationId: VocationId) {
  return fetchApi<VocationActionResult>('/api/v1/vocations/respec', {
    method: 'POST',
    body: JSON.stringify({ vocationId }),
  });
}
