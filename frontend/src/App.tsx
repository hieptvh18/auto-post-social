import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AdminLayout } from './layouts/AdminLayout';
import AuditLogsPage from './pages/AuditLogsPage';
import AutoPostSettingsPage from './pages/AutoPostSettingsPage';
import ContentManagementPage from './pages/ContentManagementPage';
import DashboardPage from './pages/DashboardPage';
import FailedJobsPage from './pages/FailedJobsPage';
import GuidePage from './pages/GuidePage';
import DataDeletionPage from './pages/legal/DataDeletionPage';
import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage';
import TermsPage from './pages/legal/TermsPage';
import LoginPage from './pages/LoginPage';
import PageInsightsPage from './pages/PageInsightsPage';
import PageManagementPage from './pages/PageManagementPage';
import QueueMonitorPage from './pages/QueueMonitorPage';
import SettingsPage from './pages/SettingsPage';
import TimelinePage from './pages/TimelinePage';
import UserManagementPage from './pages/UserManagementPage';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';
import { defaultRouteFor } from './utils/permissions';

/** Đưa user về màn mặc định của role — EDITOR không vào được `/dashboard`. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? defaultRouteFor(user.role) : '/dashboard'} replace />;
}

function LoginRedirect() {
  const { isAuthenticated, isPreviewMode, loading } = useAuth();
  if (loading) return null;
  if (isPreviewMode || isAuthenticated) return <HomeRedirect />;
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRedirect />} />

      {/*
        Ba trang pháp lý CÔNG KHAI — nộp cho Meta App Review. Phải nằm ngoài
        ProtectedRoute: reviewer xem khi chưa đăng nhập, và phải khai báo trước
        route "*" để không bị đá về /dashboard.
      */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />
      <Route path="/terms" element={<TermsPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route element={<RoleRoute path="/dashboard" />}>
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>
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
            {/* Thống kê nằm trong cùng RoleRoute `/pages` — ai quản lý được page
                thì xem được số liệu page đó, không đẻ thêm luật quyền mới. */}
            <Route
              path="pages/:pageId/insights"
              element={<PageInsightsPage />}
            />
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

      <Route path="*" element={<HomeRedirect />} />
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
