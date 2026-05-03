export type ApiErrorCode =
  | 'trainer_not_found'
  | 'bad_hash'
  | 'missing_init_data'
  | 'missing_hash'
  | 'missing_bot_token'
  | 'bad_user_json'
  | 'bad_user'
  | 'unauthorized'
  | 'http_error';

export class ApiError extends Error {
  code: ApiErrorCode;
  httpStatus?: number;
  constructor(code: ApiErrorCode, message?: string, httpStatus?: number) {
    super(message || code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function getInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const initData = getInitData();
  if (initData) headers.set('x-telegram-init-data', initData);

  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || !json?.ok) {
    const code = (json?.error || `http_${res.status}`) as ApiErrorCode;
    throw new ApiError(code, code, res.status);
  }
  return json as T;
}

export type ClientRow = {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  lastActivityAt: string | null;
  adherence7d: number | null;
};

export async function getClients() {
  const r = await apiFetch<{ ok: true; clients: ClientRow[] }>('/api/trainer/clients');
  return r.clients;
}

export async function getClient(id: number) {
  const r = await apiFetch<{ ok: true; client: any }>(`/api/trainer/client/${id}`);
  return r.client;
}

export async function createInvite() {
  const r = await apiFetch<{ ok: true; invite: { code: string; link: string | null } }>('/api/trainer/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return r.invite;
}

export async function getSettings() {
  const r = await apiFetch<{ ok: true; settings: { notifyOnMissedDays: boolean } }>('/api/trainer/settings');
  return r.settings;
}

export async function updateSettings(notifyOnMissedDays: boolean) {
  const r = await apiFetch<{ ok: true; settings: { notifyOnMissedDays: boolean } }>('/api/trainer/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notifyOnMissedDays }),
  });
  return r.settings;
}

