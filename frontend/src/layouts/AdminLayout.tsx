import {
  AuditOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FileImageOutlined,
  FacebookOutlined,
  LogoutOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Avatar, Dropdown, Layout, Menu, Select, Tag, Typography, theme } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { RoleTag } from '../components/common/StatusTag';
import { canAccessRoute } from '../utils/permissions';
import { ROLE_LABELS } from '../utils/constants';
import type { UserRole } from '../types';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/content', icon: <FileImageOutlined />, label: 'Content Library' },
  { key: '/scheduler', icon: <CalendarOutlined />, label: 'Lịch đăng bài' },
  { key: '/queue', icon: <UnorderedListOutlined />, label: 'Queue Monitor' },
  { key: '/failed', icon: <WarningOutlined />, label: 'Failed Jobs' },
  { key: '/pages', icon: <FacebookOutlined />, label: 'Facebook Pages' },
  { key: '/users', icon: <TeamOutlined />, label: 'Users' },
  { key: '/audit', icon: <AuditOutlined />, label: 'Audit Logs' },
];

export function AdminLayout() {
  const { user, logout, login, isPreviewMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const visibleMenu = menuItems.filter((item) =>
    user ? canAccessRoute(user.role, item.key) : false,
  );

  const selectedKey =
    visibleMenu.find((item) => location.pathname.startsWith(item.key))?.key ??
    '/dashboard';

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
          <FacebookOutlined style={{ fontSize: 22, color: '#1877f2' }} />
          <div>
            <Text strong style={{ color: '#fff', display: 'block', lineHeight: 1.2 }}>
              Social Publish
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              Admin Panel
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
          <Tag color="orange" style={{ width: '100%', textAlign: 'center' }}>
            UI Preview — Mock Data
          </Tag>
        </div>
      </Sider>

      <Layout style={{ marginLeft: 240 }}>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 16,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 99,
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
              onChange={(role: UserRole) =>
                login(`${role.toLowerCase()}@company.com`, role)
              }
            />
          )}
          <Dropdown
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <Avatar style={{ backgroundColor: '#1877f2' }}>
                {user.email.charAt(0).toUpperCase()}
              </Avatar>
              <div>
                <Text strong style={{ display: 'block', lineHeight: 1.2 }}>
                  {user.email}
                </Text>
                <RoleTag role={user.role} />
              </div>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ padding: 24, background: '#f5f7fa', minHeight: 'calc(100vh - 64px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
