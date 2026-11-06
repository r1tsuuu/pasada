import type { ApiConfig, ApiDecision, ApiHeldFill, ApiState, ApiTranche } from '@pasada/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8080';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`);
  return body as T;
}

export const api = {
  base: BASE,
  config: () => call<ApiConfig>('/api/config'),
  state: () => call<ApiState>('/api/state'),
  fill: (vehicleId: string, stationId: string, liters: number) =>
    call<{ decision: ApiDecision }>('/api/fills', { method: 'POST', body: JSON.stringify({ vehicleId, stationId, liters }) }),
  approveHeld: (id: string) => call<{ decision: ApiDecision }>(`/api/held/${id}/approve`, { method: 'POST' }),
  rejectHeld: (id: string) => call<{ held: ApiHeldFill }>(`/api/held/${id}/reject`, { method: 'POST' }),
  checkBalance: (vehicleId: string) => call<{ tranche: ApiTranche | null }>(`/api/vehicles/${vehicleId}/check-balance`, { method: 'POST' }),
};
