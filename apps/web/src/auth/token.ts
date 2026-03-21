const KEY = 'ledgerlens_access_token';
const USER_KEY = 'ledgerlens_user';

export type StoredUser = { id: string; email: string; createdAt?: string };

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (token === null) {
      localStorage.removeItem(KEY);
      localStorage.removeItem(USER_KEY);
    } else {
      localStorage.setItem(KEY, token);
    }
  } catch {
    /* ignore */
  }
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser | null): void {
  try {
    if (user === null) {
      localStorage.removeItem(USER_KEY);
    } else {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  } catch {
    /* ignore */
  }
}

/** Best-effort decode for display when only a token exists (legacy sessions). */
export function userFromJwt(token: string): StoredUser | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as { sub?: string; email?: string };
    if (typeof p.sub === 'string' && typeof p.email === 'string') {
      return { id: p.sub, email: p.email };
    }
    return null;
  } catch {
    return null;
  }
}
