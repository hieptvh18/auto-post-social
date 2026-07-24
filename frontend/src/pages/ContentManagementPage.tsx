import {
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
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
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { mediaApi } from '../api/media.api';
import { getPageName, getUserDisplayName, mockPages, mockUsers } from '../api/mock/data';
import { env } from '../config/env';
import { PageHeader } from '../components/common/PageHeader';
import { ContentStatusTag } from '../components/common/StatusTag';
import { useAuthUser } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import type { ContentAsset, ContentStatus, MediaType } from '../types';
import {
  CONTENT_CATEGORIES,
  CONTENT_STATUS_LABELS,
  MEDIA_TYPE_LABELS,
} from '../utils/constants';
import { can } from '../utils/permissions';

const { Text } = Typography;

function detectMediaType(file: UploadFile): MediaType {
  const mime = file.type ?? '';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

const STATUS_OPTIONS = (Object.keys(CONTENT_STATUS_LABELS) as ContentStatus[]).map(
  (s) => ({ value: s, label: CONTENT_STATUS_LABELS[s] }),
);

export default function ContentManagementPage() {
  const user = useAuthUser();
  const { content, addContent, updateContent, deleteContent } = useMockData();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<ContentStatus | undefined>();
  const [uploaderFilter, setUploaderFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [editing, setEditing] = useState<ContentAsset | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [creating, setCreating] = useState(false);
  const [editForm] = Form.useForm();
  const [createForm] = Form.useForm();

  const canReview = can(user.role, 'content:review');
  const activePages = mockPages.filter((p) => p.isActive);

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
      const matchUploader = !uploaderFilter || item.createdBy === uploaderFilter;
      const matchRange =
        !dateRange ||
        !dateRange[0] ||
        !dateRange[1] ||
        (dayjs(item.updatedAt).isAfter(dateRange[0].startOf('day')) &&
          dayjs(item.updatedAt).isBefore(dateRange[1].endOf('day')));
      return matchSearch && matchCategory && matchStatus && matchUploader && matchRange;
    });
  }, [myContent, search, categoryFilter, statusFilter, uploaderFilter, dateRange]);

  const openEdit = (record: ContentAsset) => {
    setEditing(record);
    editForm.setFieldsValue({
      title: record.title,
      description: record.description,
      category: record.category,
      caption: record.caption,
      hashtags: record.hashtags,
      assignedPageIds: record.assignedPageIds,
      status: record.status,
      isAds: record.isAds,
      rejectComment: record.rejectComment ?? '',
    });
  };

  const handleEditSubmit = (values: {
    title: string;
    description: string;
    category: string;
    caption: string;
    hashtags?: string;
    assignedPageIds: string[];
    status: ContentStatus;
    isAds: boolean;
    rejectComment?: string;
  }) => {
    if (!editing) return;
    updateContent(editing.id, {
      title: values.title,
      description: values.description,
      category: values.category,
      caption: values.caption,
      hashtags: values.hashtags,
      assignedPageIds: values.assignedPageIds ?? [],
      ...(canReview
        ? {
            status: values.status,
            isAds: values.isAds,
            rejectComment: values.status === 'REJECTED' ? values.rejectComment : null,
            approvedBy: values.status === 'APPROVED' ? user.email : editing.approvedBy,
          }
        : {}),
    });
    setEditing(null);
    message.success(`Đã cập nhật ${editing.code} (mock)`);
  };

  const handleCreate = async (values: {
    title: string;
    description: string;
    category: string;
    caption: string;
    hashtags?: string;
    assignedPageIds?: string[];
  }) => {
    const pickedFile = fileList[0];
    if (!pickedFile) {
      message.error('Vui lòng chọn file ảnh hoặc video');
      return;
    }

    const now = new Date();
    const contentCode = `CNT-${String(content.length + 1).padStart(3, '0')}`;

    // Drive upload thật khi tắt mock (POST /media/upload, M2 backend đã có).
    // Metadata content vẫn giữ ở MockDataContext cho tới khi M3 có API content-assets.
    let mediaType: MediaType = detectMediaType(pickedFile);
    let driveFileId = `drive_${now.getTime()}`;
    let driveUrl: string | undefined = `https://drive.google.com/file/d/${driveFileId}`;
    let thumbnailUrl: string | undefined = `https://picsum.photos/seed/${contentCode}/200/120`;

    if (!env.useMock) {
      const rawFile = (pickedFile.originFileObj ?? pickedFile) as unknown as File;
      setCreating(true);
      try {
        const uploaded = await mediaApi.upload(rawFile);
        mediaType = uploaded.mediaType;
        driveFileId = uploaded.fileId;
        driveUrl = uploaded.driveUrl ?? undefined;
        thumbnailUrl = uploaded.thumbnailUrl ?? undefined;
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : 'Upload file lên Google Drive thất bại';
        message.error(msg);
        return;
      } finally {
        setCreating(false);
      }
    }

    addContent({
      id: String(now.getTime()),
      code: contentCode,
      title: values.title,
      description: values.description,
      category: values.category,
      caption: values.caption,
      hashtags: values.hashtags,
      mediaType,
      driveFileId,
      driveUrl,
      thumbnailUrl,
      status: 'PENDING_REVIEW',
      isAds: false,
      assignedPageIds: values.assignedPageIds ?? [],
      publishedPageIds: [],
      createdBy: user.email,
      approvedBy: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    setCreateOpen(false);
    setFileList([]);
    createForm.resetFields();
    message.success(`Đã upload ${contentCode} — trạng thái Chờ duyệt`);
  };

  const columns: ColumnsType<ContentAsset> = [
    {
      title: 'No',
      width: 60,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Ngày upload',
      dataIndex: 'createdAt',
      width: 125,
      sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
      render: (v) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      ellipsis: true,
      render: (v, record) => (
        <Space direction="vertical" size={0}>
          <Text strong ellipsis>
            {v}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.code} · {getUserDisplayName(record.createdBy)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 160,
      render: (_, record) => (
        <ContentStatusTag
          status={record.status}
          publishedCount={record.publishedPageIds.length}
          assignedCount={record.assignedPageIds.length}
        />
      ),
    },
    {
      title: 'Dạng',
      dataIndex: 'category',
      width: 165,
      render: (v, record) => (
        <Space direction="vertical" size={2}>
          <Tag>{v}</Tag>
          <Tag color={record.mediaType === 'video' ? 'purple' : 'blue'}>
            {MEDIA_TYPE_LABELS[record.mediaType]}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Link',
      dataIndex: 'driveUrl',
      width: 80,
      align: 'center',
      render: (v) =>
        v ? (
          <a href={v} target="_blank" rel="noreferrer">
            <LinkOutlined /> Mở
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Phân bổ page',
      dataIndex: 'assignedPageIds',
      width: 190,
      render: (ids: string[]) =>
        ids.length === 0 ? (
          <Text type="secondary">Chưa phân bổ</Text>
        ) : (
          <Space size={4} wrap>
            {ids.map((id) => (
              <Tag key={id} color="geekblue">
                {getPageName(id).replace('Luca — ', '')}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Ngày cập nhật',
      dataIndex: 'updatedAt',
      width: 150,
      sorter: (a, b) => dayjs(a.updatedAt).unix() - dayjs(b.updatedAt).unix(),
      defaultSortOrder: 'descend',
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '',
      width: 100,
      render: (_, record) => (
        <Space>
          {can(user.role, 'content:edit') && (
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          )}
          {can(user.role, 'content:delete') && (
            <Popconfirm
              title={`Xoá ${record.code}?`}
              description="Thao tác không thể hoàn tác."
              okText="Xoá"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                deleteContent(record.id);
                message.success(`Đã xoá ${record.code} (mock)`);
              }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const editStatusLocked =
    editing != null && ['PUBLISHING', 'PUBLISHED'].includes(editing.status);

  return (
    <div>
      <PageHeader
        title="Quản lý Ảnh/Video Edit"
        description="Toàn bộ thông tin và thao tác duyệt bài trong 1 trang — như file sheet Excel của team"
        extra={
          can(user.role, 'content:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Upload Ảnh/Video
            </Button>
          )
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker
          placeholder={['Ngày cập nhật từ', 'đến']}
          format="DD/MM/YYYY"
          onChange={(range) => setDateRange(range)}
        />
        <Select
          placeholder="Người upload"
          allowClear
          style={{ width: 180 }}
          options={mockUsers
            .filter((u) => u.isActive)
            .map((u) => ({ value: u.email, label: u.name ?? u.email }))}
          onChange={setUploaderFilter}
        />
        <Select
          placeholder="Dạng (danh mục)"
          allowClear
          style={{ width: 180 }}
          options={CONTENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
          onChange={setCategoryFilter}
        />
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 150 }}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
        />
        <Input.Search
          placeholder="Tìm theo tên/tiêu đề..."
          allowClear
          style={{ width: 240 }}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 10, showTotal: (t) => `${t} items` }}
        scroll={{ x: 1280 }}
      />

      <Drawer
        title={editing ? `Chỉnh sửa — ${editing.code}` : ''}
        open={!!editing}
        onClose={() => setEditing(null)}
        width={520}
        extra={
          <Button type="primary" onClick={() => editForm.submit()}>
            Lưu
          </Button>
        }
      >
        {editing && (
          <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
            {editing.thumbnailUrl && (
              <Image
                src={editing.thumbnailUrl}
                alt={editing.title}
                style={{ borderRadius: 8, marginBottom: 16 }}
              />
            )}
            <Space style={{ marginBottom: 16 }} wrap>
              <ContentStatusTag
                status={editing.status}
                publishedCount={editing.publishedPageIds.length}
                assignedCount={editing.assignedPageIds.length}
              />
              <Tag color={editing.mediaType === 'video' ? 'purple' : 'blue'}>
                {MEDIA_TYPE_LABELS[editing.mediaType]}
              </Tag>
              {editing.driveUrl && (
                <a href={editing.driveUrl} target="_blank" rel="noreferrer">
                  <LinkOutlined /> File trên Drive
                </a>
              )}
            </Space>

            <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Mô tả ngắn" rules={[{ required: true }]}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="category" label="Dạng (danh mục)" rules={[{ required: true }]}>
              <Select options={CONTENT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
            <Form.Item
              name="caption"
              label="Caption đăng bài"
              tooltip="Bot dùng caption này khi tự động đăng lên Facebook"
              rules={[{ required: true, message: 'Nhập caption để bot đăng bài' }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="hashtags" label="Hashtags">
              <Input placeholder="#cơxươngkhớp #phucancxk" />
            </Form.Item>
            <Form.Item
              name="assignedPageIds"
              label="Phân bổ page"
              tooltip="Bài được bot đăng lên các page này — mỗi bài chỉ đăng 1 lần / 1 page"
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="Chọn một hoặc nhiều fanpage"
                options={activePages.map((p) => ({ value: p.id, label: p.pageName }))}
                maxTagCount="responsive"
              />
            </Form.Item>

            {canReview && (
              <>
                <Form.Item name="status" label="Trạng thái duyệt">
                  <Select
                    disabled={editStatusLocked}
                    options={STATUS_OPTIONS.map((o) => ({
                      ...o,
                      // Đang đăng / Đã đăng do bot cập nhật, không set tay
                      disabled: ['PUBLISHING', 'PUBLISHED'].includes(o.value),
                    }))}
                  />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(p, c) => p.status !== c.status}>
                  {({ getFieldValue }) =>
                    getFieldValue('status') === 'REJECTED' && (
                      <Form.Item
                        name="rejectComment"
                        label="Lý do không duyệt"
                        rules={[{ required: true, message: 'Nhập lý do không duyệt' }]}
                      >
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    )
                  }
                </Form.Item>
                <Form.Item name="isAds" valuePropName="checked">
                  <Checkbox>Đạt ADS (video/bài chạy quảng cáo đạt chuẩn)</Checkbox>
                </Form.Item>
              </>
            )}

            {editing.rejectComment && editing.status === 'REJECTED' && (
              <Alert
                type="error"
                message="Lý do không duyệt"
                description={editing.rejectComment}
                style={{ marginBottom: 16 }}
              />
            )}

            {editing.publishedPageIds.length > 0 && (
              <Alert
                type="success"
                message={`Đã đăng ${editing.publishedPageIds.length}/${editing.assignedPageIds.length} page`}
                description={editing.publishedPageIds.map((id) => getPageName(id)).join(', ')}
              />
            )}
          </Form>
        )}
      </Drawer>

      <Modal
        title="Upload Ảnh/Video"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setFileList([]);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        okText="Upload"
        confirmLoading={creating}
        width={560}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            label="File ảnh/video"
            required
            tooltip="Ảnh: JPG/PNG/WebP · Video: MP4/MOV — upload thẳng lên Google Drive"
          >
            <Upload
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              fileList={fileList}
              maxCount={1}
              beforeUpload={() => false}
              onChange={({ fileList: next }) => setFileList(next)}
            >
              <Button icon={<UploadOutlined />}>Chọn ảnh hoặc video</Button>
            </Upload>
          </Form.Item>

          <Form.Item name="category" label="Dạng (danh mục)" rules={[{ required: true }]}>
            <Select
              placeholder="Chọn dạng bài"
              options={CONTENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>

          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: 5 dấu hiệu thoái hóa khớp gối" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Mô tả ngắn"
            rules={[{ required: true, min: 10, message: 'Mô tả tối thiểu 10 ký tự' }]}
          >
            <Input.TextArea rows={2} placeholder="Mô tả ngắn giúp người duyệt hiểu nội dung" />
          </Form.Item>

          <Form.Item
            name="caption"
            label="Caption đăng bài"
            rules={[{ required: true, message: 'Nhập caption để bot đăng bài' }]}
          >
            <Input.TextArea rows={3} placeholder="Nội dung caption hiển thị trên Facebook..." />
          </Form.Item>

          <Form.Item name="hashtags" label="Hashtags">
            <Input placeholder="#cơxươngkhớp #phucancxk" />
          </Form.Item>

          <Form.Item name="assignedPageIds" label="Phân bổ page (có thể bổ sung sau)">
            <Select
              mode="multiple"
              allowClear
              placeholder="Chọn fanpage sẽ đăng bài này"
              options={activePages.map((p) => ({ value: p.id, label: p.pageName }))}
              maxTagCount="responsive"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
