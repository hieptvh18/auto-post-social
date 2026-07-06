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
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import type { FacebookPage } from '../types';

const { Text } = Typography;

export default function PageManagementPage() {
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

  const handleSubmit = (values: {
    pageName: string;
    pageId: string;
    accessToken?: string;
    isActive: boolean;
  }) => {
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
