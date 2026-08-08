import {
  ApiOutlined,
  BarChartOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FacebookOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { ConnectPagesModal } from '../components/pages/ConnectPagesModal';
import { ConnectionsCard } from '../components/pages/ConnectionsCard';
import { env } from '../config/env';
import { useAuthUser } from '../contexts/AuthContext';
import {
  useCreatePage,
  useDeletePage,
  usePages,
  useRefreshPageToken,
  useStartFacebookConnect,
  useTestPageConnection,
  useUpdatePage,
} from '../hooks/usePages';
import type {
  FacebookPage,
  FacebookPageResponse,
  PageConnectionResult,
} from '../types';
import { can } from '../utils/permissions';

const { Text } = Typography;

interface PageFormValues {
  pageName: string;
  pageId: string;
  accessToken?: string;
  isActive: boolean;
}

/** Lọc client-side: `GET /pages` trả toàn bộ danh sách, không phân trang. */
function matchesKeyword(
  page: { pageName: string; pageId: string },
  keyword: string,
): boolean {
  const q = keyword.trim().toLowerCase();
  if (q === '') return true;
  return (
    page.pageName.toLowerCase().includes(q) || page.pageId.toLowerCase().includes(q)
  );
}

/** Chọn implementation theo cờ mock (rule 01 FE + ADR-005) — giữ MockDataContext nguyên vẹn. */
export default function PageManagementPage() {
  return env.useMock ? <MockPageManagementPage /> : <RealPageManagementPage />;
}

function MockPageManagementPage() {
  const [pages, setPages] = useState(mockPages);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FacebookPage | null>(null);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (page: FacebookPage) => {
    setEditing(page);
    form.setFieldsValue({
      pageName: page.pageName,
      pageId: page.pageId,
      accessToken: '',
      isActive: page.isActive,
    });
    setModalOpen(true);
  };

  const handleSubmit = (values: PageFormValues) => {
    if (editing) {
      setPages((prev) =>
        prev.map((p) =>
          p.id === editing.id
            ? {
                ...p,
                pageName: values.pageName,
                pageId: values.pageId,
                isActive: values.isActive,
                tokenMasked: values.accessToken
                  ? `****${values.accessToken.slice(-4)}`
                  : p.tokenMasked,
              }
            : p,
        ),
      );
      message.success('Cập nhật page thành công (mock)');
    } else {
      const newPage: FacebookPage = {
        id: String(Date.now()),
        pageName: values.pageName,
        pageId: values.pageId,
        tokenMasked: `****${(values.accessToken ?? 'xxxx').slice(-4)}`,
        tokenExpireAt: null,
        isActive: values.isActive ?? true,
        createdAt: new Date().toISOString(),
      };
      setPages((prev) => [...prev, newPage]);
      message.success('Thêm page thành công (mock)');
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    message.success('Đã xóa page (mock)');
  };

  const columns: ColumnsType<FacebookPage> = [
    {
      title: 'Tên Page',
      dataIndex: 'pageName',
    },
    {
      title: 'Page ID',
      dataIndex: 'pageId',
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: 'Token',
      dataIndex: 'tokenMasked',
      width: 100,
    },
    {
      title: 'Hết hạn',
      dataIndex: 'tokenExpireAt',
      width: 140,
      render: (v) =>
        v ? (
          <Tag color={dayjs(v).isBefore(dayjs()) ? 'error' : 'success'}>
            {dayjs(v).format('DD/MM/YYYY')}
          </Tag>
        ) : (
          <Tag>N/A</Tag>
        ),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      width: 90,
      render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? 'Yes' : 'No'}</Tag>,
    },
    {
      title: 'Actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Xóa page này?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Facebook Pages"
        description="Quản lý Facebook Page và access token"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm Page
          </Button>
        }
      />

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Tìm theo tên Page hoặc Page ID"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ maxWidth: 320, marginBottom: 16 }}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={pages.filter((page) => matchesKeyword(page, keyword))}
        pagination={false}
        scroll={{ x: 900 }}
      />

      <Modal
        title={editing ? 'Cập nhật Page' : 'Thêm Page mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Cập nhật' : 'Thêm'}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ isActive: true }}
        >
          <Form.Item
            name="pageName"
            label="Tên Page"
            rules={[{ required: true }]}
          >
            <Input placeholder="Shop Thời Trang A" />
          </Form.Item>
          <Form.Item
            name="pageId"
            label="Facebook Page ID"
            rules={[{ required: true }]}
          >
            <Input placeholder="1029384756" />
          </Form.Item>
          <Form.Item
            name="accessToken"
            label="Access Token"
            rules={[{ required: !editing }]}
            extra={editing ? 'Để trống nếu không đổi token' : undefined}
          >
            <Input.Password placeholder="EAAxxxx..." />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function RealPageManagementPage() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FacebookPageResponse | null>(null);
  const [keyword, setKeyword] = useState('');
  const [testResult, setTestResult] = useState<PageConnectionResult | null>(null);
  const [form] = Form.useForm();

  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerConnectionId, setPickerConnectionId] = useState<string | null>(
    null,
  );

  const { data: pages, isLoading } = usePages();
  const createMutation = useCreatePage();
  const updateMutation = useUpdatePage();
  const deleteMutation = useDeletePage();
  const testMutation = useTestPageConnection();
  const connectMutation = useStartFacebookConnect();
  const refreshTokenMutation = useRefreshPageToken();

  const canManage = can(user.role, 'pages:manage');

  /**
   * Facebook redirect về `/pages?fb_connect=...`. Thành công thì mở luôn modal chọn
   * page — user vừa đi qua mấy màn của Meta, đừng bắt họ tự mò tiếp.
   */
  useEffect(() => {
    const status = searchParams.get('fb_connect');
    if (status === null) return;

    if (status === 'success') {
      setPickerConnectionId(searchParams.get('connectionId'));
    } else {
      message.error(
        `Kết nối Facebook thất bại: ${searchParams.get('reason') ?? 'không rõ nguyên nhân'}`,
      );
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleConnect = async (): Promise<void> => {
    try {
      await connectMutation.mutateAsync();
    } catch (err) {
      message.error(
        err instanceof ApiError ? err.message : 'Không mở được đăng nhập Facebook',
      );
    }
  };

  const handleRefreshToken = async (id: string): Promise<void> => {
    try {
      await refreshTokenMutation.mutateAsync(id);
      message.success('Đã lấy lại token mới cho page');
    } catch (err) {
      message.error(
        err instanceof ApiError ? err.message : 'Lấy lại token thất bại',
      );
    }
  };

  const filteredPages = useMemo(
    () => (pages ?? []).filter((page) => matchesKeyword(page, keyword)),
    [pages, keyword],
  );

  const closeModal = () => {
    setModalOpen(false);
    setTestResult(null);
  };

  const openCreate = () => {
    setEditing(null);
    setTestResult(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (page: FacebookPageResponse) => {
    setEditing(page);
    setTestResult(null);
    form.setFieldsValue({
      pageName: page.pageName,
      pageId: page.pageId,
      accessToken: '',
      isActive: page.isActive,
    });
    setModalOpen(true);
  };

  /**
   * Token vừa nhập ⇒ test cấu hình chưa lưu; để trống khi sửa ⇒ test token đã lưu
   * trong DB. Nhờ vậy kiểm được cả trước khi tạo lẫn sau khi đã lưu.
   */
  const handleTestConnection = async () => {
    const values = form.getFieldsValue() as PageFormValues;
    const pageId = editing?.pageId ?? values.pageId?.trim();
    const token = values.accessToken?.trim();

    if (!pageId) {
      message.warning('Nhập Facebook Page ID trước khi test');
      return;
    }
    if (!editing && !token) {
      message.warning('Nhập Access Token trước khi test');
      return;
    }

    try {
      const result = await testMutation.mutateAsync(
        token
          ? { mode: 'raw', pageId, accessToken: token }
          : { mode: 'saved', id: (editing as FacebookPageResponse).id },
      );
      setTestResult(result);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Test kết nối thất bại');
    }
  };

  const handleSubmit = async (values: PageFormValues) => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          body: {
            pageName: values.pageName,
            isActive: values.isActive,
            ...(values.accessToken ? { accessToken: values.accessToken } : {}),
          },
        });
        message.success('Cập nhật page thành công');
      } else {
        await createMutation.mutateAsync({
          pageName: values.pageName,
          pageId: values.pageId,
          accessToken: values.accessToken ?? '',
        });
        message.success('Thêm page thành công');
      }
      closeModal();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Thao tác thất bại');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      message.success('Đã xoá page');
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Xoá thất bại');
    }
  };

  const columns: ColumnsType<FacebookPageResponse> = [
    {
      title: 'Tên Page',
      dataIndex: 'pageName',
      render: (name: string, record) => (
        <Space size={4}>
          <Typography.Link
            href={`https://www.facebook.com/${record.pageId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {name} <ExportOutlined />
          </Typography.Link>
          {/* Chỉ cảnh báo khi chắc chắn THIẾU. `null` = page dán token tay,
              hệ thống không giữ scope của nó ⇒ im lặng, không báo động giả. */}
          {record.canReadInsights === false && (
            <Tooltip title="Token chưa có quyền đọc thống kê (read_insights). Bấm 'Kết nối bằng Facebook' và cấp lại quyền để xem lượt hiển thị.">
              <Tag color="warning" icon={<WarningOutlined />}>
                Thiếu quyền thống kê
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Page ID',
      dataIndex: 'pageId',
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: 'Bài đã đăng',
      dataIndex: 'publishedPostCount',
      width: 120,
      align: 'right',
      render: (count: number | undefined) => count ?? 0,
    },
    {
      title: 'Token',
      dataIndex: 'accessTokenMasked',
      width: 100,
    },
    {
      title: 'Nguồn token',
      dataIndex: 'connectMode',
      width: 150,
      render: (mode: FacebookPageResponse['connectMode']) =>
        mode === 'FB_LOGIN' ? (
          <Tag color="blue" icon={<FacebookOutlined />}>
            Đăng nhập FB
          </Tag>
        ) : (
          <Tag>Dán tay</Tag>
        ),
    },
    {
      title: 'Hết hạn',
      dataIndex: 'tokenExpireAt',
      width: 140,
      // Không có hạn là trạng thái TỐT NHẤT (Page token vĩnh viễn) — phải đọc được
      // ngay, không để user tự suy ra từ ô trống.
      render: (v: string | null) =>
        v ? (
          <Tag color={dayjs(v).isBefore(dayjs()) ? 'error' : 'success'}>
            {dayjs(v).format('DD/MM/YYYY')}
          </Tag>
        ) : (
          <Tag color="success">Vĩnh viễn</Tag>
        ),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      width: 90,
      render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? 'Yes' : 'No'}</Tag>,
    },
    ...(canManage
      ? [
          {
            title: 'Actions',
            width: 190,
            render: (_: unknown, record: FacebookPageResponse) => (
              <Space>
                <Tooltip title="Xem thống kê lượt xem các bài đã đăng lên page này">
                  <Button
                    type="text"
                    icon={<BarChartOutlined />}
                    onClick={() => navigate(`/pages/${record.id}/insights`)}
                  />
                </Tooltip>
                {/* Page dán tay không có gì để tạo lại token ⇒ không hiện nút. */}
                {record.connectMode === 'FB_LOGIN' && (
                  <Tooltip title="Lấy lại Page token từ tài khoản Facebook đã kết nối">
                    <Button
                      type="text"
                      icon={<ReloadOutlined />}
                      loading={refreshTokenMutation.isPending}
                      onClick={() => void handleRefreshToken(record.id)}
                    />
                  </Tooltip>
                )}
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(record)}
                />
                <Popconfirm
                  title="Xóa page này?"
                  okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
                  onConfirm={() => void handleDelete(record.id)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Facebook Pages"
        description="Quản lý Facebook Page và access token"
        extra={
          canManage && (
            <Space>
              <Button
                type="primary"
                icon={<FacebookOutlined />}
                loading={connectMutation.isPending}
                onClick={() => void handleConnect()}
              >
                Kết nối bằng Facebook
              </Button>
              <Button icon={<PlusOutlined />} onClick={openCreate}>
                Thêm Page thủ công
              </Button>
            </Space>
          )
        }
      />

      {canManage && (
        <ConnectionsCard
          reconnecting={connectMutation.isPending}
          onReconnect={() => void handleConnect()}
          onPickPages={setPickerConnectionId}
        />
      )}

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Tìm theo tên Page hoặc Page ID"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ maxWidth: 320, marginBottom: 16 }}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredPages}
        loading={isLoading}
        pagination={false}
        scroll={{ x: 1200 }}
      />

      <ConnectPagesModal
        connectionId={pickerConnectionId}
        onClose={() => setPickerConnectionId(null)}
      />

      <Modal
        title={editing ? 'Cập nhật Page' : 'Thêm Page mới'}
        open={modalOpen}
        onCancel={closeModal}
        footer={[
          <Button
            key="test"
            icon={<ApiOutlined />}
            loading={testMutation.isPending}
            onClick={() => void handleTestConnection()}
            style={{ float: 'left' }}
          >
            Test kết nối
          </Button>,
          <Button key="cancel" onClick={closeModal}>
            Huỷ
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={createMutation.isPending || updateMutation.isPending}
            onClick={() => form.submit()}
          >
            {editing ? 'Cập nhật' : 'Thêm'}
          </Button>,
        ]}
      >
        {testResult && (
          <Alert
            style={{ marginBottom: 16 }}
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            closable
            onClose={() => setTestResult(null)}
            message={testResult.ok ? 'Cấu hình hợp lệ' : 'Cấu hình chưa dùng được'}
            description={
              <>
                <div>{testResult.message}</div>
                {testResult.category && (
                  <div>
                    <Text type="secondary">Danh mục: {testResult.category}</Text>
                  </div>
                )}
                <Text type="secondary">
                  Loại token: {testResult.tokenType} · Hạn dùng:{' '}
                  {testResult.expiresAt
                    ? dayjs(testResult.expiresAt).format('DD/MM/YYYY HH:mm')
                    : 'không hết hạn'}
                </Text>
              </>
            }
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={(values: PageFormValues) => void handleSubmit(values)}
          initialValues={{ isActive: true }}
        >
          <Form.Item name="pageName" label="Tên Page" rules={[{ required: true }]}>
            <Input placeholder="Shop Thời Trang A" />
          </Form.Item>
          <Form.Item
            name="pageId"
            label="Facebook Page ID"
            rules={[{ required: true }]}
          >
            <Input placeholder="1029384756" disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="accessToken"
            label="Access Token"
            rules={[{ required: !editing }]}
            extra={editing ? 'Để trống nếu không đổi token' : undefined}
          >
            <Input.Password placeholder="EAAxxxx..." />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
