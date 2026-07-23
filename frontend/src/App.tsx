import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AdminLayout } from './layouts/AdminLayout';
import AuditLogsPage from './pages/AuditLogsPage';
import AutoPostSettingsPage from './pages/AutoPostSettingsPage';
import ContentManagementPage from './pages/ContentManagementPage';
import DashboardPage from './pages/DashboardPage';
import FailedJobsPage from './pages/FailedJobsPage';
import GuidePage from './pages/GuidePage';
import LoginPage from './pages/LoginPage';
import PageManagementPage from './pages/PageManagementPage';
import QueueMonitorPage from './pages/QueueMonitorPage';
import SettingsPage from './pages/SettingsPage';
import TimelinePage from './pages/TimelinePage';
import UserManagementPage from './pages/UserManagementPage';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';

function LoginRedirect() {
  const { isAuthenticated, isPreviewMode, loading } = useAuth();
  if (loading) return null;
  if (isPreviewMode || isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRedirect />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="guide" element={<GuidePage />} />
          <Route element={<RoleRoute path="/content" />}>
            <Route path="content" element={<ContentManagementPage />} />
          </Route>
          <Route element={<RoleRoute path="/timeline" />}>
            <Route path="timeline" element={<TimelinePage />} />
          </Route>
          <Route element={<RoleRoute path="/auto-post" />}>
            <Route path="auto-post" element={<AutoPostSettingsPage />} />
          </Route>
          <Route element={<RoleRoute path="/pages" />}>
            <Route path="pages" element={<PageManagementPage />} />
          </Route>
          <Route element={<RoleRoute path="/users" />}>
            <Route path="users" element={<UserManagementPage />} />
          </Route>
          <Route element={<RoleRoute path="/settings" />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route element={<RoleRoute path="/queue" />}>
            <Route path="queue" element={<QueueMonitorPage />} />
          </Route>
          <Route element={<RoleRoute path="/failed" />}>
            <Route path="failed" element={<FailedJobsPage />} />
          </Route>
          <Route element={<RoleRoute path="/audit" />}>
            <Route path="audit" element={<AuditLogsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
