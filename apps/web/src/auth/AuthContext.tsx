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
import {
  changePassword as apiChangePassword,
  fetchMe,
  login as apiLogin,
  signup as apiSignup,
} from '../api/client';
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
  name?: string;
  createdAt?: string;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (params: {
    name: string;
    email: string;
    password: string;
    passwordConfirm: string;
  }) => Promise<void>;
  changePassword: (params: {
    currentPassword: string;
    newPassword: string;
    newPasswordConfirm: string;
  }) => Promise<void>;
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

  /** Hydrate profile from the server when a token exists (no JWT decoding for identity). */
  useEffect(() => {
    if (!token) return;
    void fetchMe()
      .then((me) => {
        setStoredUser(me.user);
        setUser(me.user);
      })
      .catch(() => {
        logout();
      });
  }, [token, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    setAccessToken(res.accessToken);
    setStoredUser(res.user);
    setTokenState(res.accessToken);
    setUser(res.user);
  }, []);

  const signup = useCallback(
    async (params: {
      name: string;
      email: string;
      password: string;
      passwordConfirm: string;
    }) => {
      const res = await apiSignup(params);
      setAccessToken(res.accessToken);
      setStoredUser(res.user);
      setTokenState(res.accessToken);
      setUser(res.user);
    },
    [],
  );

  const changePassword = useCallback(
    async (params: {
      currentPassword: string;
      newPassword: string;
      newPasswordConfirm: string;
    }) => {
      await apiChangePassword(params);
    },
    [],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      login,
      signup,
      changePassword,
      logout,
    }),
    [token, user, login, signup, changePassword, logout],
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
