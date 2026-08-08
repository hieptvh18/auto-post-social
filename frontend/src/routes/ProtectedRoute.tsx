import { Spin } from 'antd';
import { Navigate, Outlet } from 'react-router-dom';
import { UI_PREVIEW_SKIP_AUTH } from '../config/preview';
import { useAuth } from '../contexts/AuthContext';
import { canAccessRoute, defaultRouteFor } from '../utils/permissions';

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();

  // Đang khôi phục phiên (gọi /auth/me) — chưa biết đăng nhập hay chưa.
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!UI_PREVIEW_SKIP_AUTH && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ path }: { path: string }) {
  const { user } = useAuth();

  // ProtectedRoute đã chặn user null; guard này chỉ chạy khi đã đăng nhập.
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessRoute(user.role, path)) {
    return <Navigate to={defaultRouteFor(user.role)} replace />;
  }

  return <Outlet />;
}
