import { Navigate, Outlet } from 'react-router-dom';
import { UI_PREVIEW_SKIP_AUTH } from '../config/preview';
import { useAuth } from '../contexts/AuthContext';
import { canAccessRoute } from '../utils/permissions';

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  if (!UI_PREVIEW_SKIP_AUTH && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ path }: { path: string }) {
  const { user } = useAuth();

  if (!canAccessRoute(user.role, path)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
