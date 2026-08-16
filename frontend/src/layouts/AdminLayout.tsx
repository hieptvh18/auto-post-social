import {
  AuditOutlined,
  CalendarOutlined,
  CloudDownloadOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  FileImageOutlined,
  FacebookOutlined,
  LogoutOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Layout,
  Menu,
  Select,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AppLogo } from '../components/common/AppLogo';
import { RoleTag } from '../components/common/StatusTag';
import { useIsMobile } from '../hooks/useResponsive';
import { canAccessRoute, defaultRouteFor } from '../utils/permissions';
import { APP_NAME, APP_TAGLINE, ROLE_LABELS } from '../utils/constants';
import type { UserRole } from '../types';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const SIDER_WIDTH = 240;

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

// Nhóm riêng trên sidebar. Vẫn lọc bằng `canAccessRoute` như 2 nhóm kia — không
// tự viết điều kiện role ở đây (một nguồn sự thật, plan 26 C1).
const reupMenuItems = [
  { key: '/reup', icon: <CloudDownloadOutlined />, label: 'Reup Setting' },
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
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Xoay ngang máy / mở rộng cửa sổ về desktop: Drawer phải tự đóng, nếu không
  // nó che mất sidebar thật vừa hiện ra.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  // AdminLayout luôn render dưới ProtectedRoute nên user đã đăng nhập; guard cho TS.
  if (!user) return null;

  const visibleMain = mainMenuItems.filter((item) =>
    canAccessRoute(user.role, item.key),
  );
  const visibleMonitor = monitorMenuItems.filter((item) =>
    canAccessRoute(user.role, item.key),
  );
  const visibleReup = reupMenuItems.filter((item) =>
    canAccessRoute(user.role, item.key),
  );

  const visibleMenu = [
    ...visibleMain,
    ...(visibleReup.length > 0
      ? [
        {
          key: 'reup-group',
          label: 'Reup',
          type: 'group' as const,
          children: visibleReup,
        },
      ]
      : []),
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

  // Phải gộp CẢ 3 nhóm: thiếu `visibleReup` thì vào /reup menu không sáng mục nào
  // và rơi về `defaultRouteFor` — nhìn như đang đứng ở Tổng quan.
  const selectedKey =
    [...visibleMain, ...visibleReup, ...visibleMonitor].find((item) =>
      location.pathname.startsWith(item.key),
    )?.key ?? defaultRouteFor(user.role);

  /** Ruột sidebar — dùng chung cho Sider (desktop) và Drawer (màn hẹp). */
  const sidebarBody = (
    <>
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
        <AppLogo size={28} />
        <div style={{ minWidth: 0 }}>
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
        onClick={({ key }) => {
          navigate(key);
          // Trên màn hẹp Drawer phủ kín màn hình: không đóng thì bấm menu xong
          // vẫn chỉ thấy menu, tưởng như không có gì xảy ra.
          setDrawerOpen(false);
        }}
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
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          width={SIDER_WIDTH}
          style={{
            background: '#001529',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
          }}
        >
          {sidebarBody}
        </Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={SIDER_WIDTH}
          closable={false}
          styles={{ body: { padding: 0, background: '#001529' } }}
          rootClassName="app-nav-drawer"
        >
          {sidebarBody}
        </Drawer>
      )}

      {/* minWidth:0 — cột nội dung là flex item; không có nó, một bảng rộng sẽ
          nong cả cột ra và đẩy trang trượt ngang thay vì cuộn trong bảng. */}
      <Layout style={{ marginLeft: isMobile ? 0 : SIDER_WIDTH, minWidth: 0 }}>
        <Header
          style={{
            background: token.colorBgContainer,
            height: 64,
            lineHeight: '64px',
            padding: isMobile ? '0 12px' : '0 24px',
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
              justifyContent: 'space-between',
              gap: 8,
              height: 64,
            }}
          >
            {isMobile ? (
              <Space size={8} style={{ minWidth: 0 }}>
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  aria-label="Mở menu"
                  onClick={() => setDrawerOpen(true)}
                />
                <AppLogo size={24} />
              </Space>
            ) : (
              <span />
            )}

            <Space size={isMobile ? 8 : 16} style={{ minWidth: 0 }}>
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
                  // Header ẩn email trên màn hẹp ⇒ đưa vào đây để vẫn biết đang
                  // đăng nhập bằng tài khoản nào.
                  ...(isMobile
                    ? [
                        {
                          key: 'identity',
                          disabled: true,
                          label: (
                            <Space direction="vertical" size={2}>
                              <Text style={{ fontSize: 12 }}>{user.email}</Text>
                              <RoleTag role={user.role} />
                            </Space>
                          ),
                        },
                        { key: 'identity-divider', type: 'divider' as const },
                      ]
                    : []),
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
                {/* Email + role chiếm gần hết header trên điện thoại; vẫn xem
                    được khi bấm vào avatar (Dropdown) nên ẩn đi là an toàn. */}
                {!isMobile && (
                  <>
                    <Text
                      strong
                      ellipsis
                      style={{ maxWidth: 160, fontSize: 13, lineHeight: '20px' }}
                    >
                      {user.email}
                    </Text>
                    <RoleTag role={user.role} />
                  </>
                )}
              </Space>
            </Dropdown>
            </Space>
          </div>
        </Header>

        <Content
          style={{
            padding: isMobile ? 12 : 24,
            background: '#f5f7fa',
            minHeight: 'calc(100vh - 64px)',
            // Chỉ khoá bề rộng. KHÔNG dùng `overflowX: hidden` ở đây — Content
            // là tổ tiên của thẻ lọc `position: sticky` ở /timeline, đặt overflow
            // sẽ biến nó thành scroll container và sticky ngừng hoạt động.
            maxWidth: '100%',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
