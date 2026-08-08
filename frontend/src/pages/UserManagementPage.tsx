import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { mockUsers } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { RoleTag } from '../components/common/StatusTag';
import { env } from '../config/env';
import { useAuthUser } from '../contexts/AuthContext';
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from '../hooks/useUsers';
import type { CreateUserBody, UpdateUserBody, User, UserResponse, UserRole } from '../types';
import { ROLE_LABELS } from '../utils/constants';

const { Text } = Typography;

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** Chọn implementation theo cờ mock (rule 01 FE + ADR-005). */
export default function UserManagementPage() {
  return env.useMock ? <MockUserManagementPage /> : <RealUserManagementPage />;
}

interface UserFormValues {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
}

/** CRUD thật qua `/users` — chỉ ADMIN vào được (route guard + `users:manage`). */
function RealUserManagementPage() {
  const currentUser = useAuthUser();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserResponse | null>(null);
  const [form] = Form.useForm<UserFormValues>();

  const { data, isLoading } = useUsers({
    search: search || undefined,
    role: roleFilter,
    page,
    limit: pageSize,
  });
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (user: UserResponse) => {
    setEditing(user);
    form.setFieldsValue({
      name: user.name,
      email: user.email,
      password: undefined,
      role: user.role,
      isActive: user.isActive,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: UserFormValues) => {
    try {
      if (editing) {
        const body: UpdateUserBody = {
          name: values.name,
          email: values.email,
          role: values.role,
          isActive: values.isActive,
        };
        // Chỉ gửi password khi ADMIN thực sự nhập mật khẩu mới.
        if (values.password) body.password = values.password;
        await updateMutation.mutateAsync({ id: editing.id, body });
        message.success(`Đã cập nhật ${values.email}`);
      } else {
        const body: CreateUserBody = {
          name: values.name,
          email: values.email,
          password: values.password ?? '',
          role: values.role,
        };
        await createMutation.mutateAsync(body);
        message.success(`Đã tạo tài khoản ${values.email}`);
      }
      setModalOpen(false);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Lưu thất bại');
    }
  };

  const handleDeactivate = async (user: UserResponse) => {
    try {
      await deleteMutation.mutateAsync(user.id);
      message.success(`Đã vô hiệu hóa ${user.email}`);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Vô hiệu hóa thất bại');
    }
  };

  const columns: ColumnsType<UserResponse> = [
    {
      title: 'No',
      width: 60,
      align: 'center',
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Người dùng',
      dataIndex: 'name',
      render: (v: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.email}
            {record.id === currentUser.id ? ' · bạn' : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Quyền',
      dataIndex: 'role',
      width: 140,
      render: (r: UserRole) => <RoleTag role={r} />,
    },
    {
      title: 'Hoạt động',
      dataIndex: 'isActive',
      width: 110,
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'}>{v ? 'Đang bật' : 'Đã tắt'}</Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 150,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title={`Vô hiệu hóa ${record.email}?`}
            description="Tài khoản không đăng nhập được nữa, dữ liệu cũ vẫn giữ."
            okText="Vô hiệu hóa"
            okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
            onConfirm={() => handleDeactivate(record)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={!record.isActive || record.id === currentUser.id}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quản lý người dùng"
        description="Tạo tài khoản, phân quyền RBAC và vô hiệu hóa tài khoản không còn dùng"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm người dùng
          </Button>
        }
      />

      <Space wrap className="filter-bar" style={{ marginBottom: 16 }}>
        <Select
          placeholder="Quyền"
          allowClear
          style={{ width: 180 }}
          options={ROLE_OPTIONS}
          onChange={(v: UserRole | undefined) => {
            setRoleFilter(v);
            setPage(1);
          }}
        />
        <Input.Search
          placeholder="Tìm theo tên hoặc email..."
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading}
        scroll={{ x: 860 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.meta.total ?? 0,
          showTotal: (t) => `${t} người dùng`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <Modal
        title={editing ? `Cập nhật — ${editing.email}` : 'Thêm người dùng mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Cập nhật' : 'Tạo'}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ role: 'CONTENT', isActive: true }}
        >
          <Form.Item
            name="name"
            label="Tên"
            rules={[{ required: true, message: 'Nhập tên người dùng' }, { max: 120 }]}
          >
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true }, { type: 'email', message: 'Email không hợp lệ' }]}
          >
            <Input placeholder="user@company.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing ? 'Mật khẩu mới (bỏ trống nếu không đổi)' : 'Mật khẩu'}
            rules={
              editing
                ? [{ min: 8, max: 72, message: 'Mật khẩu 8–72 ký tự' }]
                : [{ required: true, min: 8, max: 72, message: 'Mật khẩu 8–72 ký tự' }]
            }
          >
            <Input.Password placeholder="••••••••" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="Quyền" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          {editing && (
            <Form.Item
              name="isActive"
              label="Hoạt động"
              valuePropName="checked"
              tooltip={
                editing.id === currentUser.id
                  ? 'Không thể tự vô hiệu hóa tài khoản của mình'
                  : undefined
              }
            >
              <Switch disabled={editing.id === currentUser.id} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}

/** Bản mock giữ nguyên cho chế độ demo offline (`VITE_USE_MOCK=true`). */
function MockUserManagementPage() {
  const [users, setUsers] = useState(mockUsers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    form.setFieldsValue({
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
    setModalOpen(true);
  };

  const handleSubmit = (values: {
    name: string;
    email: string;
    password?: string;
    role: UserRole;
    isActive: boolean;
  }) => {
    if (editing) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editing.id
            ? {
                ...u,
                name: values.name,
                email: values.email,
                role: values.role,
                isActive: values.isActive,
              }
            : u,
        ),
      );
      message.success('Cập nhật user thành công (mock)');
    } else {
      const newUser: User = {
        id: String(Date.now()),
        name: values.name,
        email: values.email,
        role: values.role,
        isActive: values.isActive ?? true,
        createdAt: new Date().toISOString(),
      };
      setUsers((prev) => [...prev, newUser]);
      message.success('Tạo user thành công (mock)');
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (user?.role === 'ADMIN') {
      const adminCount = users.filter((u) => u.role === 'ADMIN' && u.isActive).length;
      if (adminCount <= 1) {
        message.error('Không thể xóa admin cuối cùng');
        return;
      }
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    message.success('Đã xóa user (mock)');
  };

  const columns: ColumnsType<User> = [
    {
      title: 'Người dùng',
      dataIndex: 'name',
      render: (v: string | undefined, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v ?? record.email}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.email}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      width: 140,
      render: (r: UserRole) => <RoleTag role={r} />,
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      width: 90,
      render: (v) => <Tag color={v ? 'success' : 'default'}>{v ? 'Yes' : 'No'}</Tag>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 150,
      render: (v) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Xóa user này?" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="User Management"
        description="CRUD users và phân quyền RBAC"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm User
          </Button>
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        pagination={false}
        scroll={{ x: 800 }}
      />

      <Modal
        title={editing ? 'Cập nhật User' : 'Thêm User mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Cập nhật' : 'Tạo'}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ role: 'CONTENT', isActive: true }}
        >
          <Form.Item name="name" label="Tên" rules={[{ required: true }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true }, { type: 'email', message: 'Email không hợp lệ' }]}
          >
            <Input placeholder="user@company.com" />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 8 }]}>
              <Input.Password placeholder="••••••••" />
            </Form.Item>
          )}
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
