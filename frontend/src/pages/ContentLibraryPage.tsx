import { EyeOutlined, PlusOutlined, SendOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  type UploadFile,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { getUserDisplayName } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { ContentStatusTag } from '../components/common/StatusTag';
import { useAuth } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import type { ContentAsset, MediaType } from '../types';
import { CONTENT_CATEGORIES, MEDIA_TYPE_LABELS } from '../utils/constants';
import { can } from '../utils/permissions';

const { Text, Paragraph } = Typography;

function detectMediaType(file: UploadFile): MediaType {
  const mime = file.type ?? '';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

export default function ContentLibraryPage() {
  const { user } = useAuth();
  const { content, addContent, submitContent } = useMockData();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<ContentAsset['status'] | undefined>();
  const [selected, setSelected] = useState<ContentAsset | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm();

  const myContent = useMemo(() => {
    if (user.role === 'CONTENT') {
      return content.filter((c) => c.createdBy === user.email);
    }
    return content;
  }, [content, user]);

  const filtered = useMemo(() => {
    return myContent.filter((item) => {
      const matchSearch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase());
      const matchCategory = !categoryFilter || item.category === categoryFilter;
      const matchStatus = !statusFilter || item.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [myContent, search, categoryFilter, statusFilter]);

  const handleSubmitUpload = (values: {
    title: string;
    description: string;
    category: string;
  }) => {
    const pickedFile = fileList[0];
    if (!pickedFile) {
      message.error('Vui lòng chọn file ảnh hoặc video');
      return;
    }

    const now = new Date();
    const contentCode = `CNT-${String(content.length + 1).padStart(3, '0')}`;
    const fileId = `drive_${now.getTime()}`;
    const mediaType = detectMediaType(pickedFile);

    const newItem: ContentAsset = {
      id: String(now.getTime()),
      code: contentCode,
      title: values.title,
      description: values.description,
      category: values.category,
      mediaType,
      driveFileId: fileId,
      driveUrl: `https://drive.google.com/file/d/${fileId}`,
      thumbnailUrl: `https://picsum.photos/seed/${contentCode}/200/120`,
      status: 'WAITING_APPROVAL',
      createdBy: user.email,
      approvedBy: null,
      updatedAt: now.toISOString(),
      createdAt: now.toISOString(),
    };

    addContent(newItem);
    setCreateOpen(false);
    setFileList([]);
    form.resetFields();
    message.success(`Đã upload và gửi duyệt ${contentCode} — chờ Sếp approve`);
  };

  const columns: ColumnsType<ContentAsset> = [
    {
      title: 'ID',
      dataIndex: 'code',
      width: 100,
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 120,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: 'Media',
      dataIndex: 'mediaType',
      width: 90,
      render: (v: MediaType) => (
        <Tag color={v === 'video' ? 'purple' : 'blue'}>{MEDIA_TYPE_LABELS[v]}</Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 140,
      render: (s) => <ContentStatusTag status={s} />,
    },
    {
      title: 'Người upload',
      dataIndex: 'createdBy',
      width: 170,
      ellipsis: true,
      render: (email: string) => (
        <div>
          <Text ellipsis>{getUserDisplayName(email)}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {email}
          </Text>
        </div>
      ),
    },
    {
      title: 'Cập nhật',
      dataIndex: 'updatedAt',
      width: 150,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EyeOutlined />} onClick={() => setSelected(record)} />
          {can(user.role, 'content:submit') &&
            (record.status === 'DRAFT' || record.status === 'REJECTED') && (
              <Button
                size="small"
                type="primary"
                icon={<SendOutlined />}
                onClick={() => {
                  submitContent(record.id);
                  message.success('Đã gửi lại duyệt (mock)');
                }}
              >
                Gửi duyệt
              </Button>
            )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Content Library"
        description="Upload tài nguyên (ảnh/video) — chọn category, tiêu đề, mô tả ngắn — gửi Sếp duyệt"
        extra={
          can(user.role, 'content:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Upload tài nguyên
            </Button>
          )
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Content Team chỉ upload tài nguyên + metadata. Caption, hashtag và lịch đăng do Đội đăng bài xử lý sau khi được duyệt."
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Tìm theo title hoặc ID..."
          allowClear
          style={{ width: 280 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          placeholder="Category"
          allowClear
          style={{ width: 150 }}
          options={CONTENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
          onChange={setCategoryFilter}
        />
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 180 }}
          options={[
            { value: 'DRAFT', label: 'Nháp' },
            { value: 'WAITING_APPROVAL', label: 'Chờ duyệt' },
            { value: 'APPROVED', label: 'Đã duyệt' },
            { value: 'REJECTED', label: 'Bị từ chối' },
          ]}
          onChange={setStatusFilter}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 10, showTotal: (t) => `${t} items` }}
        scroll={{ x: 1100 }}
      />

      <Drawer
        title={selected?.title}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={480}
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">Mã tài nguyên</Text>
              <br />
              <Text code>{selected.code}</Text>
            </div>
            <div>
              <Text type="secondary">Trạng thái</Text>
              <br />
              <ContentStatusTag status={selected.status} />
            </div>
            <div>
              <Text type="secondary">Category</Text>
              <br />
              <Tag>{selected.category}</Tag>
            </div>
            <div>
              <Text type="secondary">Người upload</Text>
              <br />
              <Text strong>{getUserDisplayName(selected.createdBy)}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {selected.createdBy}
              </Text>
            </div>
            <div>
              <Text type="secondary">Mô tả ngắn</Text>
              <Paragraph>{selected.description}</Paragraph>
            </div>
            {selected.rejectComment && (
              <Alert type="error" message="Lý do từ chối" description={selected.rejectComment} />
            )}
            <div>
              <Text type="secondary">Google Drive</Text>
              <br />
              <Text code>fileId: {selected.driveFileId}</Text>
            </div>
            <div>
              <Text type="secondary">Loại media</Text>
              <br />
              <Tag>{MEDIA_TYPE_LABELS[selected.mediaType]}</Tag>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title="Upload tài nguyên & gửi duyệt"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setFileList([]);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Gửi duyệt"
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitUpload}>
          <Form.Item
            label="File ảnh/video"
            required
            tooltip="Mock upload — file chỉ dùng để demo trên UI"
          >
            <Upload
              accept="image/*,video/*"
              fileList={fileList}
              maxCount={1}
              beforeUpload={() => false}
              onChange={({ fileList: next }) => setFileList(next)}
            >
              <Button icon={<UploadOutlined />}>Chọn ảnh hoặc video</Button>
            </Upload>
          </Form.Item>

          <Form.Item name="category" label="Category tài nguyên" rules={[{ required: true }]}>
            <Select
              placeholder="Chọn category"
              options={CONTENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>

          <Form.Item name="title" label="Tiêu đề tài nguyên" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Banner Flash Sale cuối tuần" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Mô tả ngắn tài nguyên"
            rules={[{ required: true, min: 10, message: 'Mô tả tối thiểu 10 ký tự' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Mô tả ngắn giúp Sếp hiểu nội dung tài nguyên (không phải caption đăng bài)"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
