import { getAccessToken, setAccessToken } from '../auth/token';

/**
 * In `pnpm dev`, default to same-origin `/api` (Vite proxies to Nest — avoids CORS).
 * Override with `VITE_API_URL` (e.g. full URL for `vite build` / production).
 */
function apiBase(): string {
  const env = import.meta.env.VITE_API_URL;
  if (env !== undefined && env !== '') {
    return env.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return '/api';
  }
  return 'http://localhost:3000';
}

function networkHint(): string {
  const base = apiBase();
  if (base.startsWith('/')) {
    return 'Start the API (e.g. pnpm dev:api on port 3000). The dev server proxies /api → localhost:3000.';
  }
  return `Check that the API is reachable at ${base} (pnpm dev:api).`;
}

export type DocumentRow = {
  id: string;
  originalFilename: string;
  storageKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  status: string;
  ingestError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UploadSessionResponse = {
  documentId: string;
  uploadUrl: string;
  method: 'PUT';
  expiresIn: number;
  headers: Record<string, string>;
};

export type DocumentStatusOk = {
  ok: true;
  documentId: string;
  status: string;
  storageKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  transactionCount: number;
  ingestError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionRow = {
  id: string;
  postedAt: string;
  amount: string;
  currency: string;
  description: string | null;
  category: string | null;
  rowIndex: number;
};

export type TransactionsPage = {
  documentId: string;
  page: number;
  limit: number;
  total: number;
  items: TransactionRow[];
};

export type SummaryRow = {
  yearMonth: string;
  currency: string;
  netAmount: string;
  incomeTotal: string;
  expenseTotal: string;
  transactionCount: number;
  updatedAt: string;
};

export type CategorySummaryRow = SummaryRow & { categoryKey: string };

export type Paged<T> = {
  documentId: string;
  page: number;
  limit: number;
  total: number;
  items: T[];
};

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join(', ');
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* ignore */
  }
  return text || res.statusText;
}

function bearerHeaders(): Record<string, string> {
  const t = getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function handleUnauthorized(res: Response): void {
  if (res.status !== 401) return;
  const hadToken = !!getAccessToken();
  setAccessToken(null);
  if (hadToken && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ledgerlens:unauthorized'));
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...bearerHeaders(),
        ...init?.headers,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    throw new Error(`${msg}. ${networkHint()}`);
  }
  handleUnauthorized(res);
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

export type AuthResponse = {
  accessToken: string;
  user: { id: string; email: string };
};

export async function signup(body: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return json<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function login(body: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return json<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type MeResponse = {
  user: { id: string; email: string; createdAt: string };
};

/** Validates the Bearer token and returns the current user from the database. */
export async function fetchMe(): Promise<MeResponse> {
  return json<MeResponse>('/auth/me');
}

export async function listDocuments(): Promise<DocumentRow[]> {
  return json<DocumentRow[]>('/documents');
}

export async function deleteDocument(documentId: string): Promise<void> {
  const url = `${apiBase()}/documents/${documentId}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...bearerHeaders(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    throw new Error(`${msg}. ${networkHint()}`);
  }
  handleUnauthorized(res);
  if (res.status === 204) {
    return;
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
}

export async function createUploadSession(body: {
  originalFilename: string;
  contentType?: string;
  sizeBytes?: number;
}): Promise<UploadSessionResponse> {
  return json<UploadSessionResponse>('/documents/upload-session', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function putUpload(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
}

export async function completeUpload(documentId: string): Promise<unknown> {
  return json(`/documents/${documentId}/complete-upload`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getDocumentStatus(
  documentId: string,
): Promise<DocumentStatusOk> {
  return json<DocumentStatusOk>(`/documents/${documentId}/status`);
}

export async function listTransactions(
  documentId: string,
  page: number,
  limit: number,
): Promise<TransactionsPage> {
  const q = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return json<TransactionsPage>(
    `/documents/${documentId}/transactions?${q.toString()}`,
  );
}

export async function listMonthlyAnalytics(
  documentId: string,
  opts: { from?: string; to?: string; page?: number; limit?: number },
): Promise<Paged<SummaryRow>> {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  q.set('page', String(opts.page ?? 1));
  q.set('limit', String(opts.limit ?? 120));
  return json<Paged<SummaryRow>>(
    `/documents/${documentId}/analytics/monthly?${q.toString()}`,
  );
}

export type InsightsResponse = {
  documentId: string;
  status: 'planned';
  message: string;
};

export async function getDocumentInsights(
  documentId: string,
): Promise<InsightsResponse> {
  return json<InsightsResponse>(`/documents/${documentId}/insights`);
}

export async function listCategoryAnalytics(
  documentId: string,
  opts: {
    from?: string;
    to?: string;
    category?: string;
    page?: number;
    limit?: number;
  },
): Promise<Paged<CategorySummaryRow>> {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  if (opts.category !== undefined) q.set('category', opts.category);
  q.set('page', String(opts.page ?? 1));
  q.set('limit', String(opts.limit ?? 200));
  return json<Paged<CategorySummaryRow>>(
    `/documents/${documentId}/analytics/by-category?${q.toString()}`,
  );
}
