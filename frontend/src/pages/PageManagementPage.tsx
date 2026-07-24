import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
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
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { env } from '../config/env';
import { useAuthUser } from '../contexts/AuthContext';
import { useCreatePage, useDeletePage, usePages, useUpdatePage } from '../hooks/usePages';
import type { FacebookPage, FacebookPageResponse } from '../types';
import { can } from '../utils/permissions';

const { Text } = Typography;

interface PageFormValues {
  pageName: string;
  pageId: string;
  accessToken?: string;
  isActive: boolean;
}

/** Chọn implementation theo cờ mock (rule 01 FE + ADR-005) — giữ MockDataContext nguyên vẹn. */
export default function PageManagementPage() {
  return env.useMock ? <MockPageManagementPage /> : <RealPageManagementPage />;
}

function MockPageManagementPage() {
  const [pages, setPages] = useState(mockPages);
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

      <Table rowKey="id" columns={columns} dataSource={pages} pagination={false} />

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FacebookPageResponse | null>(null);
  const [form] = Form.useForm();

  const { data: pages, isLoading } = usePages();
  const createMutation = useCreatePage();
  const updateMutation = useUpdatePage();
  const deleteMutation = useDeletePage();

  const canManage = can(user.role, 'pages:manage');

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (page: FacebookPageResponse) => {
    setEditing(page);
    form.setFieldsValue({
      pageName: page.pageName,
      pageId: page.pageId,
      accessToken: '',
      isActive: page.isActive,
    });
    setModalOpen(true);
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
      setModalOpen(false);
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
    },
    {
      title: 'Page ID',
      dataIndex: 'pageId',
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: 'Token',
      dataIndex: 'accessTokenMasked',
      width: 100,
    },
    {
      title: 'Hết hạn',
      dataIndex: 'tokenExpireAt',
      width: 140,
      render: (v: string | null) =>
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
    ...(canManage
      ? [
          {
            title: 'Actions',
            width: 120,
            render: (_: unknown, record: FacebookPageResponse) => (
              <Space>
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
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm Page
            </Button>
          )
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={pages ?? []}
        loading={isLoading}
        pagination={false}
      />

      <Modal
        title={editing ? 'Cập nhật Page' : 'Thêm Page mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Cập nhật' : 'Thêm'}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
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
