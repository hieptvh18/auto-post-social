import {
  AuditOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  FileImageOutlined,
  FacebookOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Avatar, Dropdown, Layout, Menu, Select, Space, Tag, Typography, theme } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { RoleTag } from '../components/common/StatusTag';
import { canAccessRoute } from '../utils/permissions';
import { APP_NAME, APP_TAGLINE, ROLE_LABELS } from '../utils/constants';
import type { UserRole } from '../types';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const mainMenuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: '/content', icon: <FileImageOutlined />, label: 'Quản lý Ảnh/Video Edit' },
  { key: '/timeline', icon: <CalendarOutlined />, label: 'Lịch đăng bài' },
  { key: '/auto-post', icon: <FieldTimeOutlined />, label: 'Cài đặt đăng tự động' },
  { key: '/pages', icon: <FacebookOutlined />, label: 'Quản lý FB Pages' },
  { key: '/users', icon: <TeamOutlined />, label: 'Quản lý nhân sự' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Cài đặt chung' },
  { key: '/guide', icon: <QuestionCircleOutlined />, label: 'Hướng dẫn sử dụng' },
];

const monitorMenuItems = [
  { key: '/queue', icon: <UnorderedListOutlined />, label: 'Queue Monitor' },
  { key: '/failed', icon: <WarningOutlined />, label: 'Failed Jobs' },
  { key: '/audit', icon: <AuditOutlined />, label: 'Audit Logs' },
];

export function AdminLayout() {
  const { user, logout, switchPreviewRole, isPreviewMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  // AdminLayout luôn render dưới ProtectedRoute nên user đã đăng nhập; guard cho TS.
  if (!user) return null;

  const visibleMain = mainMenuItems.filter((item) =>
    canAccessRoute(user.role, item.key),
  );
  const visibleMonitor = monitorMenuItems.filter((item) =>
    canAccessRoute(user.role, item.key),
  );

  const visibleMenu = [
    ...visibleMain,
    ...(visibleMonitor.length > 0
      ? [
          {
            key: 'monitor-group',
            label: 'Monitor',
            type: 'group' as const,
            children: visibleMonitor,
          },
        ]
      : []),
  ];

  const selectedKey =
    [...visibleMain, ...visibleMonitor].find((item) =>
      location.pathname.startsWith(item.key),
    )?.key ?? '/dashboard';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        style={{
          background: '#001529',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <MedicineBoxOutlined style={{ fontSize: 22, color: '#36cfc9' }} />
          <div>
            <Text strong style={{ color: '#fff', display: 'block', lineHeight: 1.2 }}>
              {APP_NAME}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              {APP_TAGLINE}
            </Text>
          </div>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={visibleMenu}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8 }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {isPreviewMode && (
            <Tag color="orange" style={{ width: '100%', textAlign: 'center' }}>
              UI Preview — Mock Data
            </Tag>
          )}
        </div>
      </Sider>

      <Layout style={{ marginLeft: 240 }}>
        <Header
          style={{
            background: token.colorBgContainer,
            height: 64,
            lineHeight: '64px',
            padding: '0 24px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 16,
              height: 64,
            }}
          >
            {isPreviewMode && (
              <Select
                size="small"
                value={user.role}
                style={{ width: 160 }}
                options={(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => ({
                  value: role,
                  label: ROLE_LABELS[role],
                }))}
                onChange={(role: UserRole) => switchPreviewRole(role)}
              />
            )}
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Đăng xuất',
                    onClick: logout,
                  },
                ],
              }}
            >
              <Space
                size={8}
                style={{
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: 8,
                  lineHeight: 1,
                }}
              >
                <Avatar size={32} style={{ backgroundColor: '#13a8a8', flexShrink: 0 }}>
                  {user.email.charAt(0).toUpperCase()}
                </Avatar>
                <Text
                  strong
                  ellipsis
                  style={{ maxWidth: 160, fontSize: 13, lineHeight: '20px' }}
                >
                  {user.email}
                </Text>
                <RoleTag role={user.role} />
              </Space>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ padding: 24, background: '#f5f7fa', minHeight: 'calc(100vh - 64px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
