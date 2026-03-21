import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { login as apiLogin, signup as apiSignup } from '../api/client';
import {
  getAccessToken,
  getStoredUser,
  setAccessToken,
  setStoredUser,
  userFromJwt,
} from './token';

export type AuthUser = {
  id: string;
  email: string;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setTokenState] = useState<string | null>(() =>
    getAccessToken(),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const t = getAccessToken();
    const u = getStoredUser();
    if (u) return u;
    if (t) return userFromJwt(t);
    return null;
  });

  const logout = useCallback(() => {
    setAccessToken(null);
    setStoredUser(null);
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      logout();
      navigate('/login', { replace: true });
    };
    window.addEventListener('ledgerlens:unauthorized', onUnauthorized);
    return () =>
      window.removeEventListener('ledgerlens:unauthorized', onUnauthorized);
  }, [logout, navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    setAccessToken(res.accessToken);
    setStoredUser(res.user);
    setTokenState(res.accessToken);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const res = await apiSignup({ email, password });
    setAccessToken(res.accessToken);
    setStoredUser(res.user);
    setTokenState(res.accessToken);
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      signup,
      logout,
    }),
    [token, user, login, signup, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
