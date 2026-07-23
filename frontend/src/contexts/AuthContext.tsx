import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../api/auth.api';
import { setOnAuthExpired } from '../api/client';
import { tokenStore } from '../api/tokenStore';
import { DEMO_USER, UI_PREVIEW_SKIP_AUTH } from '../config/preview';
import type { AuthUser, UserRole } from '../types';
import { PREVIEW_EMAILS } from '../utils/constants';

interface AuthContextValue {
  user: AuthUser | null;
  /** Đăng nhập thật; ở mock mode chấp nhận mọi input như DEMO_USER. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Chỉ mock mode: đổi nhanh role để preview UI. Thật: no-op. */
  switchPreviewRole: (role: UserRole) => void;
  isAuthenticated: boolean;
  isPreviewMode: boolean;
  /** true khi đang khôi phục phiên lúc mới load (gọi /auth/me). */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(
    UI_PREVIEW_SKIP_AUTH ? DEMO_USER : null,
  );
  // Mock mode: không cần khôi phục phiên. Thật: loading tới khi /auth/me trả về.
  const [loading, setLoading] = useState(!UI_PREVIEW_SKIP_AUTH);

  // Khôi phục phiên: có access token thì hỏi lại /auth/me (backend đọc DB mỗi
  // request nên user bị khoá sẽ mất hiệu lực ngay). Chỉ chạy ở chế độ thật.
  useEffect(() => {
    if (UI_PREVIEW_SKIP_AUTH) return;

    // Khi refresh thất bại, client gọi hàm này để dọn phiên.
    setOnAuthExpired(() => setUser(null));

    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    if (UI_PREVIEW_SKIP_AUTH) {
      // Mock: không gọi backend, chấp nhận mọi input như DEMO_USER.
      setUser({ ...DEMO_USER, email });
      return;
    }
    const result = await authApi.login(email, password);
    tokenStore.set({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    setUser(result.user);
  };

  const logout = (): void => {
    tokenStore.clear();
    setUser(UI_PREVIEW_SKIP_AUTH ? DEMO_USER : null);
  };

  const switchPreviewRole = (role: UserRole): void => {
    if (!UI_PREVIEW_SKIP_AUTH) return;
    setUser({ ...DEMO_USER, email: PREVIEW_EMAILS[role], role });
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
      switchPreviewRole,
      isAuthenticated: UI_PREVIEW_SKIP_AUTH || user !== null,
      isPreviewMode: UI_PREVIEW_SKIP_AUTH,
      loading,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Dùng trong các trang NẰM TRONG ProtectedRoute — nơi user chắc chắn đã đăng nhập.
 * Ném lỗi nếu gọi ngoài phạm vi đó (bug lập trình, không phải luồng người dùng).
 */
export function useAuthUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error('useAuthUser gọi ngoài vùng đã xác thực');
  return user;
}
