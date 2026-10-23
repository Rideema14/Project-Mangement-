'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUnauthorizedHandler } from './api/client';
import { authApi } from './api/endpoints';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');

  const clearSession = useCallback(() => {
    setUser(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    let active = true;
    // The backend owns the httpOnly JWT cookie. Ask it whether this browser has
    // a valid session instead of relying on a token stored in localStorage.
    authApi.me()
      .then(({ user: currentUser }) => {
        if (!active) return;
        setUser(currentUser);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('anonymous');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      router.replace('/login');
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, router]);

  const login = useCallback(async (email: string, password: string) => {
    const payload = await authApi.login({ email, password });
    setUser(payload.user);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const payload = await authApi.register({ name, email, password });
    setUser(payload.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(() => {
    // Clear the UI immediately; the server clears the cookie in the background.
    clearSession();
    void authApi.logout().catch(() => undefined);
    router.replace('/login');
  }, [clearSession, router]);

  const value = useMemo(() => ({ user, status, login, register, logout }), [user, status, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an <AuthProvider>');
  return context;
}
