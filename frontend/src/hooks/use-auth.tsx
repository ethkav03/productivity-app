'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { loginRequest, logoutRequest, registerRequest } from '@/lib/api/auth';
import { getMe } from '@/lib/api/users';
import { tokenStore } from '@/lib/token-store';
import { PublicUser } from '@/lib/types';

interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (email: string, username: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const bootstrap = useCallback(async () => {
    const accessToken = tokenStore.getAccessToken();
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    function handleExpired() {
      setUser(null);
      router.push('/login');
    }
    window.addEventListener('liferpg:auth-expired', handleExpired);
    return () => window.removeEventListener('liferpg:auth-expired', handleExpired);
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginRequest({ email, password });
    tokenStore.setTokens(session.accessToken, session.refreshToken);
    setUser(session.user);
    return session.user;
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const session = await registerRequest({ email, username, password });
    tokenStore.setTokens(session.accessToken, session.refreshToken);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // best-effort; clear local state regardless
    }
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      setUser,
      refreshUser: bootstrap,
    }),
    [user, isLoading, login, register, logout, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
