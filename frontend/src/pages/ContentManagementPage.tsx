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
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  type UploadFile,
  message,
  notification,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { mediaApi } from '../api/media.api';
import { getPageName, getUserDisplayName, mockPages, mockUsers } from '../api/mock/data';
import { env } from '../config/env';
import { CategorySelect } from '../components/common/CategorySelect';
import { HashtagInput } from '../components/common/HashtagInput';
import { PageHeader } from '../components/common/PageHeader';
import { ContentStatusTag } from '../components/common/StatusTag';
import { useAuthUser } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import {
  useBulkDeleteContentAssets,
  useBulkSetActiveContentAssets,
  useCategorySuggestions,
  useContentAsset,
  useContentAssets,
  useCreateContentAsset,
  useDeleteContentAsset,
  useEditorOptions,
  useUpdateContentAsset,
} from '../hooks/useContentAssets';
import { usePages } from '../hooks/usePages';
// Cột/filter "Người upload" đã được thay bằng "Editor" (yêu cầu user 2026-08-03) —
// giữ lại import dưới dạng chú thích để khôi phục nhanh nếu cần.
// import { useUsers } from '../hooks/useUsers';
import type {
  AssignmentFilter,
  BulkResult,
  ContentAsset,
  ContentAssetResponse,
  ContentStatus,
  MediaType,
} from '../types';
import {
  CONTENT_CATEGORIES,
  CONTENT_STATUS_LABELS,
  MEDIA_TYPE_LABELS,
} from '../utils/constants';
import { mergeCategoryOptions } from '../utils/categories';
import { can } from '../utils/permissions';

const { Text } = Typography;

function detectMediaType(file: UploadFile): MediaType {
  const mime = file.type ?? '';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

/**
 * Ô hiển thị người thao tác: tên + mốc thời gian (email ở tooltip cho khỏi chật).
 * Tạm không dùng từ 2026-08-03 — cột "Người upload" đã nhường chỗ cho cột "Editor";
 * giữ lại để khôi phục nhanh nếu cần cột đó trở lại.
 */
// function ActorCell({ actor, at }: { actor: ContentActor; at: string }) {
//   return (
//     <Space direction="vertical" size={0}>
//       <Text ellipsis title={actor.email}>
//         {actor.name}
//       </Text>
//       <Text type="secondary" style={{ fontSize: 12 }}>
//         {dayjs(at).format('DD/MM/YYYY HH:mm')}
//       </Text>
//     </Space>
//   );
// }

const STATUS_OPTIONS = (Object.keys(CONTENT_STATUS_LABELS) as ContentStatus[]).map(
  (s) => ({ value: s, label: CONTENT_STATUS_LABELS[s] }),
);

/** Bài đã đăng lên page thì không xoá được — dùng cho cả checkbox lẫn Popconfirm. */
function isDeletable(record: ContentAssetResponse): boolean {
  return record.publishedPageIds.length === 0;
}

/**
 * Báo kết quả một lô. Xong sạch thì một dòng toast là đủ; có bài bị bỏ qua thì
 * phải liệt kê ra — người dùng cần biết **bài nào** hỏng, không chỉ "2 bài lỗi".
 */
function reportBulk(result: BulkResult, doneVerb: string): void {
  if (result.failed.length === 0) {
    message.success(`Đã ${doneVerb} ${result.succeeded.length} bài`);
    return;
  }
  notification.warning({
    message: `Đã ${doneVerb} ${result.succeeded.length}/${result.requested} bài`,
    description: (
      <Space direction="vertical" size={2}>
        <Text>{result.failed.length} bài bị bỏ qua:</Text>
        {result.failed.map((item) => (
          <Text key={item.id} type="secondary" style={{ fontSize: 12 }}>
            • {item.label} — {item.reason}
          </Text>
        ))}
      </Space>
    ),
    duration: 8,
  });
}

/** Chọn implementation theo cờ mock (rule 01 FE + ADR-005) — giữ MockDataContext nguyên vẹn. */
export default function ContentManagementPage() {
  return env.useMock ? <MockContentManagementPage /> : <RealContentManagementPage />;
}

function MockContentManagementPage() {
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
      // FE bỏ ô "Mô tả ngắn" — type mock vẫn giữ field nên để rỗng.
      description: '',
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

/**
 * Bản chạy API thật (plan 11 = giai đoạn 2 của plan 04): CRUD + duyệt bài +
 * Đạt ADS + phân bổ page. Quyền field-level do backend chốt, FE chỉ ẩn UI cho gọn.
 */
function RealContentManagementPage() {
  const user = useAuthUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [assignmentFilter, setAssignmentFilter] = useState<
    AssignmentFilter | undefined
  >();
  const [statusFilter, setStatusFilter] = useState<ContentStatus | undefined>();
  // const [uploaderFilter, setUploaderFilter] = useState<string | undefined>();
  const [editorFilter, setEditorFilter] = useState<string | undefined>();
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<ContentAssetResponse | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editForm] = Form.useForm();
  const [createForm] = Form.useForm();

  const canReview = can(user.role, 'content:review');
  // Thao tác hàng loạt cần ít nhất 1 trong 2 quyền; backend vẫn kiểm lại từng bài.
  const canBulkDelete = can(user.role, 'content:delete');
  const canBulkEdit = can(user.role, 'content:edit');
  const canBulk = canBulkDelete || canBulkEdit;
  const { data, isLoading } = useContentAssets({
    search: search || undefined,
    category: categoryFilter,
    assignment: assignmentFilter,
    status: statusFilter,
    editorId: editorFilter,
    isActive: activeFilter,
    page,
    limit: pageSize,
  });
  const { data: categorySuggestions } = useCategorySuggestions();
  const categoryOptions = mergeCategoryOptions(categorySuggestions);
  // `GET /pages` mọi role đọc được (token đã mask) ⇒ CONTENT cũng phân bổ page được.
  const { data: pages } = usePages();
  const activePages = (pages ?? []).filter((p) => p.isActive);
  const pageOptions = activePages.map((p) => ({
    value: p.id,
    label: p.pageName,
  }));
  // Ô "Editor" (người dựng video/ảnh): chỉ account role EDITOR đang hoạt động.
  // Endpoint riêng thay vì `GET /users` (gác `users:manage`) để CONTENT cũng chọn được.
  const { data: editorOptions } = useEditorOptions();
  // Bộ lọc liệt kê **cả editor đã vô hiệu hoá** — bài cũ do họ dựng vẫn phải lọc ra được.
  const editorFilterOptions = (editorOptions ?? []).map((e) => ({
    value: e.id,
    label: e.isActive ? e.name : `${e.name} (đã khoá)`,
  }));
  // Form thì chỉ gán được người đang hoạt động (backend trả 400 nếu cố tình gửi).
  const editorSelectOptions = (editorOptions ?? [])
    .filter((e) => e.isActive)
    .map((e) => ({ value: e.id, label: e.name }));
  const createMutation = useCreateContentAsset();
  const bulkDeleteMutation = useBulkDeleteContentAssets();
  const bulkActiveMutation = useBulkSetActiveContentAssets();
  const updateMutation = useUpdateContentAsset();
  const deleteMutation = useDeleteContentAsset();

  const openEdit = useCallback(
    (record: ContentAssetResponse) => {
      setEditing(record);
      editForm.setFieldsValue({
        title: record.title,
        category: record.category,
        caption: record.caption,
        hashtags: record.hashtags ?? '',
        assignedPageIds: record.assignedPageIds,
        editorId: record.editorId ?? undefined,
        isActive: record.isActive,
        status: record.status,
        isAds: record.isAds,
        rejectComment: record.rejectComment ?? '',
      });
    },
    [editForm],
  );

  // Deep-link từ màn "Lịch đăng bài": `/content?edit=<id>` mở luôn Drawer sửa bài
  // đó. Bài có thể không nằm trong trang danh sách đang xem nên phải hỏi riêng.
  const editIdFromUrl = searchParams.get('edit');
  const { data: deepLinked, isError: deepLinkFailed } =
    useContentAsset(editIdFromUrl);

  useEffect(() => {
    if (deepLinked === undefined) return;
    openEdit(deepLinked);
    // Xoá param ngay để đóng Drawer rồi F5 không bị mở lại.
    setSearchParams({}, { replace: true });
  }, [deepLinked, openEdit, setSearchParams]);

  useEffect(() => {
    if (!deepLinkFailed) return;
    message.error('Không tìm thấy bài này trong kho (có thể đã bị xoá)');
    setSearchParams({}, { replace: true });
  }, [deepLinkFailed, setSearchParams]);

  // PUBLISHING/PUBLISHED là địa hạt của bot — khoá luôn ô trạng thái ở UI.
  const editStatusLocked =
    editing !== null && ['PUBLISHING', 'PUBLISHED'].includes(editing.status);

  const handleEditSubmit = async (values: {
    title: string;
    category: string;
    caption: string;
    hashtags?: string;
    assignedPageIds?: string[];
    editorId?: string;
    isActive: boolean;
    status: ContentStatus;
    isAds: boolean;
    rejectComment?: string;
  }) => {
    if (!editing) return;
    // Chỉ gửi field duyệt khi thực sự có quyền — CONTENT gửi lên sẽ bị 403.
    const body = {
      title: values.title,
      category: values.category,
      caption: values.caption,
      hashtags: values.hashtags,
      assignedPageIds: values.assignedPageIds ?? [],
      // Bỏ trống ô Editor ⇒ gửi null để gỡ người dựng đang gán.
      editorId: values.editorId ?? null,
      isActive: values.isActive,
      ...(canReview
        ? {
            // Bài do bot đang xử lý: ô trạng thái bị khoá nên không gửi `status`
            // lên nữa — vẫn sửa được caption/hashtag/phân bổ page bình thường.
            ...(editStatusLocked ? {} : { status: values.status }),
            isAds: values.isAds,
            ...(values.status === 'REJECTED' && !editStatusLocked
              ? { rejectComment: values.rejectComment }
              : {}),
          }
        : {}),
    };
    try {
      await updateMutation.mutateAsync({ id: editing.id, body });
      message.success(`Đã cập nhật "${editing.title}"`);
      setEditing(null);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Cập nhật thất bại');
    }
  };

  /** Đổi filter/trang thì bỏ chọn — tránh thao tác nhầm lên dòng không còn nhìn thấy. */
  const resetPageAndSelection = (): void => {
    setPage(1);
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    try {
      const result = await bulkDeleteMutation.mutateAsync(selectedIds);
      reportBulk(result, 'xoá');
      setSelectedIds([]);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Xoá hàng loạt thất bại');
    }
  };

  const handleBulkSetActive = async (isActive: boolean) => {
    try {
      const result = await bulkActiveMutation.mutateAsync({
        ids: selectedIds,
        isActive,
      });
      reportBulk(result, isActive ? 'bật lại' : 'ngưng dùng');
      setSelectedIds([]);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Cập nhật hàng loạt thất bại');
    }
  };

  const handleDelete = async (record: ContentAssetResponse) => {
    try {
      await deleteMutation.mutateAsync(record.id);
      message.success(`Đã xoá "${record.title}"`);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Xoá thất bại');
    }
  };

  const handleCreate = async (values: {
    title: string;
    category: string;
    caption: string;
    hashtags?: string;
    assignedPageIds?: string[];
    editorId?: string;
  }) => {
    const pickedFile = fileList[0];
    if (!pickedFile) {
      message.error('Vui lòng chọn file ảnh hoặc video');
      return;
    }
    const rawFile = (pickedFile.originFileObj ?? pickedFile) as unknown as File;

    setUploading(true);
    try {
      const uploaded = await mediaApi.upload(rawFile);
      const created = await createMutation.mutateAsync({
        title: values.title,
        category: values.category,
        caption: values.caption,
        hashtags: values.hashtags,
        assignedPageIds: values.assignedPageIds ?? [],
        editorId: values.editorId,
        mediaType: uploaded.mediaType,
        driveFileId: uploaded.fileId,
        driveUrl: uploaded.driveUrl ?? undefined,
        thumbnailUrl: uploaded.thumbnailUrl ?? undefined,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.size,
      });
      // ADMIN upload thì backend duyệt luôn (không tự duyệt bài của chính mình).
      message.success(
        `Đã upload — trạng thái ${CONTENT_STATUS_LABELS[created.status]}`,
      );
      setCreateOpen(false);
      setFileList([]);
      createForm.resetFields();
    } catch (err) {
      message.error(
        err instanceof ApiError ? err.message : 'Upload file lên Google Drive thất bại',
      );
    } finally {
      setUploading(false);
    }
  };

  const columns: ColumnsType<ContentAssetResponse> = [
    {
      title: 'No',
      width: 60,
      align: 'center',
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Ngày upload',
      dataIndex: 'createdAt',
      width: 125,
      render: (v) => dayjs(v as string).format('DD/MM/YYYY'),
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
            {record.id.slice(0, 8)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <ContentStatusTag
            status={record.status}
            publishedCount={record.publishedPageIds.length}
            assignedCount={record.assignedPageIds.length}
          />
          {record.isAds && <Tag color="gold">Đạt ADS</Tag>}
          {!record.isActive && <Tag>Ngưng dùng</Tag>}
        </Space>
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
      render: (v: string | null) =>
        v ? (
          <a href={v} target="_blank" rel="noreferrer">
            <LinkOutlined /> Mở
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    // Cột "Người upload" đã được thay bằng "Editor" (người dựng video/ảnh) theo
    // yêu cầu user 2026-08-03. Người upload vẫn xem được ở chân Drawer sửa bài.
    // {
    //   title: 'Người upload',
    //   dataIndex: ['createdBy', 'name'],
    //   width: 170,
    //   render: (_, record) => <ActorCell actor={record.createdBy} at={record.createdAt} />,
    // },
    {
      title: 'Editor',
      dataIndex: ['editor', 'name'],
      width: 170,
      render: (_, record) =>
        record.editor === null ? (
          <Text type="secondary">—</Text>
        ) : (
          <Text ellipsis title={record.editor.email}>
            {record.editor.name}
          </Text>
        ),
    },
    {
      title: 'Phân bổ page',
      dataIndex: 'assignments',
      width: 220,
      render: (_, record) =>
        record.assignments.length === 0 ? (
          <Text type="secondary">Chưa phân bổ</Text>
        ) : (
          <Space size={4} wrap>
            {record.assignments.map((a) => (
              <Tag
                key={a.pageId}
                color={a.publishedAt === null ? 'geekblue' : 'green'}
                title={
                  a.publishedAt === null
                    ? 'Chưa đăng'
                    : `Đã đăng ${dayjs(a.publishedAt).format('DD/MM/YYYY HH:mm')}`
                }
              >
                {a.pageName}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: '',
      width: 100,
      render: (_, record) => (
        <Space>
          {can(user.role, 'content:edit') && (
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          )}
          {can(user.role, 'content:delete') &&
            (isDeletable(record) ? (
              <Popconfirm
                title={`Xoá "${record.title}"?`}
                description="Thao tác không thể hoàn tác — file trên Drive cũng bị xoá."
                okText="Xoá"
                okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
                onConfirm={() => handleDelete(record)}
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ) : (
              <Tooltip title="Bài đã đăng lên page — không xoá được">
                <Button type="text" danger disabled icon={<DeleteOutlined />} />
              </Tooltip>
            ))}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quản lý Ảnh/Video Edit"
        description="Upload lên Google Drive, duyệt bài, tick Đạt ADS và phân bổ fanpage cho bot đăng"
        extra={
          can(user.role, 'content:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Upload Ảnh/Video
            </Button>
          )
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="Dạng (danh mục)"
          allowClear
          showSearch
          style={{ width: 180 }}
          options={categoryOptions.map((c) => ({ value: c, label: c }))}
          onChange={(v) => {
            setCategoryFilter(v);
            setPage(1);
          }}
        />
        <Select
          placeholder="Phân bổ page"
          allowClear
          style={{ width: 170 }}
          options={[
            { value: 'unassigned', label: 'Chưa phân bổ' },
            { value: 'assigned', label: 'Đã phân bổ' },
          ]}
          onChange={(v: AssignmentFilter | undefined) => {
            setAssignmentFilter(v);
            setPage(1);
          }}
        />
        <Select
          placeholder="Trạng thái duyệt"
          allowClear
          style={{ width: 170 }}
          options={STATUS_OPTIONS}
          onChange={(v: ContentStatus | undefined) => {
            setStatusFilter(v);
            setPage(1);
          }}
        />
        {/* Filter "Người upload" đã thay bằng "Editor" (yêu cầu user 2026-08-03):
        {canFilterByUploader && (
          <Select
            placeholder="Người upload"
            allowClear
            style={{ width: 200 }}
            options={(usersData?.data ?? []).map((u) => ({
              value: u.id,
              label: u.name,
            }))}
            onChange={(v: string | undefined) => {
              setUploaderFilter(v);
              setPage(1);
            }}
          />
        )} */}
        <Select
          placeholder="Editor"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 200 }}
          options={editorFilterOptions}
          onChange={(v: string | undefined) => {
            setEditorFilter(v);
            resetPageAndSelection();
          }}
        />
        <Select
          placeholder="Trạng thái dùng"
          allowClear
          style={{ width: 170 }}
          options={[
            { value: 'active', label: 'Đang dùng' },
            { value: 'inactive', label: 'Ngưng dùng' },
          ]}
          onChange={(v: 'active' | 'inactive' | undefined) => {
            setActiveFilter(v === undefined ? undefined : v === 'active');
            resetPageAndSelection();
          }}
        />
        <Input.Search
          placeholder="Tìm theo tiêu đề..."
          allowClear
          style={{ width: 240 }}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
      </Space>

      {selectedIds.length > 0 && (
        <Space
          wrap
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'rgba(22,119,255,.08)',
            borderRadius: 8,
          }}
        >
          <Text strong>Đã chọn {selectedIds.length} bài</Text>
          {canBulkEdit && (
            <>
              <Button
                size="small"
                loading={bulkActiveMutation.isPending}
                onClick={() => void handleBulkSetActive(false)}
              >
                Ngưng dùng
              </Button>
              <Button
                size="small"
                loading={bulkActiveMutation.isPending}
                onClick={() => void handleBulkSetActive(true)}
              >
                Dùng lại
              </Button>
            </>
          )}
          {canBulkDelete && (
            <Popconfirm
              title={`Xoá ${selectedIds.length} bài?`}
              description="Không hoàn tác được — file trên Drive cũng bị xoá."
              okText="Xoá"
              okButtonProps={{ danger: true, loading: bulkDeleteMutation.isPending }}
              onConfirm={() => void handleBulkDelete()}
            >
              <Button size="small" danger>
                Xoá
              </Button>
            </Popconfirm>
          )}
          <Button size="small" type="text" onClick={() => setSelectedIds([])}>
            Bỏ chọn
          </Button>
        </Space>
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading}
        rowSelection={
          canBulk
            ? {
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
                // Bài đã đăng lên page thì backend từ chối xoá ⇒ khoá luôn ở đây
                // cho khỏi chọn nhầm (chọn-tất-cả cũng tự bỏ qua các dòng này).
                getCheckboxProps: (record) => ({
                  disabled: !isDeletable(record),
                  title: isDeletable(record)
                    ? undefined
                    : 'Bài đã đăng lên page — không xoá được',
                }),
              }
            : undefined
        }
        rowClassName={(record) => (record.isActive ? '' : 'row-inactive')}
        pagination={{
          current: page,
          pageSize,
          total: data?.meta.total ?? 0,
          showTotal: (t) => `${t} items`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
            setSelectedIds([]);
          },
        }}
        scroll={{ x: 1500 }}
      />

      <Drawer
        title={editing ? `Chỉnh sửa — ${editing.title}` : ''}
        open={!!editing}
        onClose={() => setEditing(null)}
        width={520}
        extra={
          <Button
            type="primary"
            loading={updateMutation.isPending}
            onClick={() => editForm.submit()}
          >
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
              <ContentStatusTag status={editing.status} />
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
            <Form.Item name="category" label="Dạng (danh mục)" rules={[{ required: true }]}>
              <CategorySelect />
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
              <HashtagInput />
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
                options={pageOptions.map((option) => ({
                  ...option,
                  // Page đã đăng bài thì không gỡ ra được nữa (backend trả 409).
                  disabled: editing.publishedPageIds.includes(option.value),
                  label: editing.publishedPageIds.includes(option.value)
                    ? `${option.label} (đã đăng)`
                    : option.label,
                }))}
                maxTagCount="responsive"
              />
            </Form.Item>
            <Form.Item
              name="editorId"
              label="Editor"
              tooltip="Người DỰNG video/ảnh này — khác với người upload lên hệ thống"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chọn account Editor (không bắt buộc)"
                options={editorSelectOptions}
              />
            </Form.Item>
            <Form.Item
              name="isActive"
              label="Đang dùng"
              valuePropName="checked"
              tooltip="Tắt = ngưng dùng: Bot không lấy bài này nữa (bài đã đăng vẫn giữ nguyên trên page)"
            >
              <Switch checkedChildren="Đang dùng" unCheckedChildren="Ngưng dùng" />
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

            {editStatusLocked && (
              <Alert
                type="info"
                message="Bot đang xử lý bài này"
                description="Trạng thái Đang đăng/Đã đăng do bot cập nhật — không sửa tay được."
                style={{ marginBottom: 16 }}
              />
            )}

            <Text type="secondary" style={{ fontSize: 12 }}>
              Upload bởi <strong>{editing.createdBy.name}</strong> lúc{' '}
              {dayjs(editing.createdAt).format('DD/MM/YYYY HH:mm')}
              {editing.updatedBy && (
                <>
                  {' · '}sửa gần nhất bởi <strong>{editing.updatedBy.name}</strong> lúc{' '}
                  {dayjs(editing.updatedAt).format('DD/MM/YYYY HH:mm')}
                </>
              )}
            </Text>
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
        confirmLoading={uploading || createMutation.isPending}
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

          <Form.Item
            name="category"
            label="Dạng (danh mục)"
            rules={[{ required: true, message: 'Chọn hoặc gõ tên dạng bài' }]}
            tooltip="Gõ tên chưa có trong danh sách để tạo dạng bài mới ngay tại đây"
          >
            <CategorySelect />
          </Form.Item>

          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: 5 dấu hiệu thoái hóa khớp gối" />
          </Form.Item>

          <Form.Item
            name="caption"
            label="Caption đăng bài"
            rules={[{ required: true, message: 'Nhập caption để bot đăng bài' }]}
          >
            <Input.TextArea rows={3} placeholder="Nội dung caption hiển thị trên Facebook..." />
          </Form.Item>

          <Form.Item name="hashtags" label="Hashtags">
            <HashtagInput />
          </Form.Item>

          <Form.Item name="assignedPageIds" label="Phân bổ page (có thể bổ sung sau)">
            <Select
              mode="multiple"
              allowClear
              placeholder="Chọn fanpage sẽ đăng bài này"
              options={pageOptions}
              maxTagCount="responsive"
            />
          </Form.Item>

          <Form.Item
            name="editorId"
            label="Editor"
            tooltip="Người DỰNG video/ảnh này — khác với người upload lên hệ thống"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn account Editor (không bắt buộc)"
              options={editorSelectOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
