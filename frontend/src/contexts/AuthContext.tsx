import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEMO_USER, UI_PREVIEW_SKIP_AUTH } from '../config/preview';
import type { AuthUser, UserRole } from '../types';

interface AuthContextValue {
  user: AuthUser;
  login: (email: string, role: UserRole) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isPreviewMode: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'social-publish-auth';

function loadUser(): AuthUser {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored) as AuthUser;
  if (UI_PREVIEW_SKIP_AUTH) return DEMO_USER;
  return DEMO_USER; // fallback, ProtectedRoute sẽ chặn nếu tắt preview
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(loadUser);

  const login = (email: string, role: UserRole) => {
    const authUser: AuthUser = { id: 'demo', email, role };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
  };

  const logout = () => {
    if (UI_PREVIEW_SKIP_AUTH) {
      localStorage.removeItem(STORAGE_KEY);
      setUser(DEMO_USER);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    setUser(DEMO_USER);
  };

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      isAuthenticated: UI_PREVIEW_SKIP_AUTH || !!localStorage.getItem(STORAGE_KEY),
      isPreviewMode: UI_PREVIEW_SKIP_AUTH,
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
