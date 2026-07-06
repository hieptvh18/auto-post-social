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
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { mockUsers } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { RoleTag } from '../components/common/StatusTag';
import type { User, UserRole } from '../types';
import { ROLE_LABELS } from '../utils/constants';

export default function UserManagementPage() {
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
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
    setModalOpen(true);
  };

  const handleSubmit = (values: {
    email: string;
    password?: string;
    role: UserRole;
    isActive: boolean;
  }) => {
    if (editing) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editing.id
            ? { ...u, email: values.email, role: values.role, isActive: values.isActive }
            : u,
        ),
      );
      message.success('Cập nhật user thành công (mock)');
    } else {
      const newUser: User = {
        id: String(Date.now()),
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
      title: 'Email',
      dataIndex: 'email',
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
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Xóa user này?"
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
        title="User Management"
        description="CRUD users và phân quyền RBAC"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm User
          </Button>
        }
      />

      <Table rowKey="id" columns={columns} dataSource={users} pagination={false} />

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
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input placeholder="user@company.com" />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="password"
              label="Mật khẩu"
              rules={[{ required: true, min: 6 }]}
            >
              <Input.Password placeholder="••••••••" />
            </Form.Item>
          )}
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ROLE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
