import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AdminLayout } from './layouts/AdminLayout';
import AuditLogsPage from './pages/AuditLogsPage';
import ContentLibraryPage from './pages/ContentLibraryPage';
import DashboardPage from './pages/DashboardPage';
import FailedJobsPage from './pages/FailedJobsPage';
import LoginPage from './pages/LoginPage';
import PageManagementPage from './pages/PageManagementPage';
import PublishSchedulerPage from './pages/PublishSchedulerPage';
import PublisherCenterPage from './pages/PublisherCenterPage';
import QueueMonitorPage from './pages/QueueMonitorPage';
import ReviewCenterPage from './pages/ReviewCenterPage';
import UserManagementPage from './pages/UserManagementPage';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';

function LoginRedirect() {
  const { isAuthenticated, isPreviewMode } = useAuth();
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
          <Route element={<RoleRoute path="/content" />}>
            <Route path="content" element={<ContentLibraryPage />} />
          </Route>
          <Route element={<RoleRoute path="/review" />}>
            <Route path="review" element={<ReviewCenterPage />} />
          </Route>
          <Route element={<RoleRoute path="/publisher" />}>
            <Route path="publisher" element={<PublisherCenterPage />} />
          </Route>
          <Route element={<RoleRoute path="/scheduler" />}>
            <Route path="scheduler" element={<PublishSchedulerPage />} />
          </Route>
          <Route path="queue" element={<QueueMonitorPage />} />
          <Route path="failed" element={<FailedJobsPage />} />

          <Route element={<RoleRoute path="/pages" />}>
            <Route path="pages" element={<PageManagementPage />} />
          </Route>
          <Route element={<RoleRoute path="/users" />}>
            <Route path="users" element={<UserManagementPage />} />
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
