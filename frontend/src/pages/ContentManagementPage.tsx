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
  Progress,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useDeleteContentAsset,
  useEditorOptions,
  useInvalidateContentAssets,
  useUpdateContentAsset,
} from '../hooks/useContentAssets';
import {
  isActiveUploadJob,
  useCreateMediaUploadJob,
  useMediaUploadJobs,
  useRetryMediaUploadJob,
} from '../hooks/useMediaUploadJobs';
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
  MediaUploadJobResponse,
  MediaUploadStatus,
} from '../types';
import {
  CONTENT_CATEGORIES,
  CONTENT_STATUS_LABELS,
  MAX_IMAGES_PER_CONTENT_ASSET,
  MEDIA_TYPE_LABELS,
} from '../utils/constants';
import { mergeCategoryOptions } from '../utils/categories';
import { can } from '../utils/permissions';

const { Text } = Typography;

/**
 * Ô lọc "Dạng" chứa 2 nhóm giá trị trong cùng một `Select`: dạng cố định
 * (Ảnh/Video → lọc `mediaType`) và danh mục động (→ lọc `category`). Tiền tố này
 * để phân biệt 2 nhóm, tránh đụng tên khi ai đó đặt danh mục tên "Ảnh".
 */
const MEDIA_TYPE_FILTER_PREFIX = 'mediaType:';
/** Dòng kẻ ngăn 2 nhóm — option `disabled`, không chọn được. */
const DANG_FILTER_DIVIDER = '__divider__';

function detectMediaType(file: UploadFile): MediaType {
  const mime = file.type ?? '';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

/** Bỏ phần đuôi file (vd "video-abc.mp4" -> "video-abc") để làm Tiêu đề mặc định. */
function filenameToTitle(filename: string): string {
  return filename.replace(/\.[^./]+$/, '');
}

/**
 * Preview **mọi** ảnh của bài, đúng thứ tự sẽ đăng lên Facebook: ảnh đại diện của
 * record trước, rồi tới `extraFiles` theo `position`. Bài 1 ảnh/video giữ nguyên
 * khung ảnh lớn như cũ; bài nhiều ảnh xếp lưới có đánh số để đối chiếu thứ tự.
 */
function ContentImagesPreview({ asset }: { asset: ContentAssetResponse }) {
  const images = [
    { key: asset.id, url: asset.thumbnailUrl },
    ...asset.extraFiles.map((file) => ({ key: file.id, url: file.thumbnailUrl })),
  ].filter((item): item is { key: string; url: string } => Boolean(item.url));

  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <Image
        src={images[0].url}
        alt={asset.title}
        style={{ borderRadius: 8, marginBottom: 16 }}
      />
    );
  }

  return (
    <Image.PreviewGroup>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {images.map((image, index) => (
          <div key={image.key} style={{ position: 'relative' }}>
            <Image
              src={image.url}
              alt={`${asset.title} — ảnh ${index + 1}`}
              style={{
                borderRadius: 8,
                aspectRatio: '1 / 1',
                objectFit: 'cover',
                width: '100%',
              }}
            />
            <Tag
              color={index === 0 ? 'blue' : undefined}
              style={{ position: 'absolute', top: 4, left: 4, margin: 0 }}
            >
              {index === 0 ? 'Ảnh 1 · đại diện' : `Ảnh ${index + 1}`}
            </Tag>
          </div>
        ))}
      </div>
    </Image.PreviewGroup>
  );
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

/**
 * Một dòng của bảng kho bài. `uploadJob != null` = dòng **"mờ"**: file đã lên
 * server nhưng chưa xong Drive nên chưa có bản ghi thật (plan 23). Dựng dưới
 * dạng `ContentAssetResponse` để không phải viết lại toàn bộ cột — các cột chỉ
 * cần rẽ nhánh ở đúng chỗ hiển thị khác nhau.
 */
type ContentRow = ContentAssetResponse & { uploadJob?: MediaUploadJobResponse };

const UPLOAD_JOB_STATUS_META: Record<
  MediaUploadJobResponse['status'],
  { label: string; color: string }
> = {
  QUEUED: { label: 'Trong hàng đợi', color: 'default' },
  UPLOADING_TO_DRIVE: { label: 'Đang lên Google Drive', color: 'processing' },
  SUCCESS: { label: 'Đã xong', color: 'success' },
  FAILED: { label: 'Upload lỗi', color: 'error' },
};

/** Job upload -> dòng giả để Table render chung với bài thật. */
function uploadJobToRow(job: MediaUploadJobResponse): ContentRow {
  return {
    id: `upload-job:${job.id}`,
    title: job.title,
    description: null,
    caption: '',
    hashtags: null,
    category: job.category,
    mediaType: job.mediaType ?? 'image',
    driveFileId: '',
    driveUrl: null,
    thumbnailUrl: null,
    mimeType: null,
    fileSize: job.totalSize,
    status: 'PENDING_REVIEW',
    isAds: false,
    isActive: true,
    rejectComment: null,
    createdById: job.createdBy.id,
    approvedById: null,
    editorId: null,
    createdBy: { id: job.createdBy.id, name: job.createdBy.name, email: '' },
    updatedBy: null,
    editor: null,
    assignedPageIds: [],
    publishedPageIds: [],
    assignments: [],
    imageCount: job.fileCount,
    extraFiles: [],
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    uploadJob: job,
  };
}

/**
 * Ô trạng thái của dòng "mờ": job đang chờ/đang lên Drive, hoặc đã lỗi kèm nút
 * "Thử lại" ngay tại chỗ (file tạm còn trên server nên không phải chọn lại file).
 */
function UploadJobStatusCell({
  job,
  retrying,
  onRetry,
}: {
  job: MediaUploadJobResponse;
  retrying: boolean;
  onRetry: () => void;
}) {
  const meta = UPLOAD_JOB_STATUS_META[job.status];
  const running = job.status === 'QUEUED' || job.status === 'UPLOADING_TO_DRIVE';
  return (
    <Space direction="vertical" size={2} style={{ width: '100%' }}>
      <Tag color={meta.color}>{meta.label}</Tag>
      {running && (
        // Thanh **không xác định %**: server chỉ biết "đang đẩy lên Drive", không
        // có tiến độ byte để báo (Drive API không trả progress). Bịa ra con số %
        // còn tệ hơn — thanh chạy nói đúng điều đang xảy ra: chưa xong, còn sống.
        <div
          className={job.status === 'QUEUED' ? 'upload-bar' : 'upload-bar upload-bar-active'}
          role="progressbar"
          aria-label={meta.label}
        />
      )}
      {job.status === 'FAILED' && (
        <>
          <Tooltip title={job.errorMessage ?? 'Không rõ nguyên nhân'}>
            <Text type="danger" style={{ fontSize: 12 }} ellipsis>
              {job.errorMessage ?? 'Không rõ nguyên nhân'}
            </Text>
          </Tooltip>
          {job.canRetry ? (
            <Button size="small" loading={retrying} onClick={onRetry}>
              Thử lại
            </Button>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              File tạm đã bị dọn — cần chọn lại file
            </Text>
          )}
        </>
      )}
    </Space>
  );
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
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | undefined>();
  const [statusFilter, setStatusFilter] = useState<ContentStatus | undefined>();
  const [uploaderFilter, setUploaderFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [editing, setEditing] = useState<ContentAsset | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [creating, setCreating] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
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
      const matchMediaType = !mediaTypeFilter || item.mediaType === mediaTypeFilter;
      const matchStatus = !statusFilter || item.status === statusFilter;
      const matchUploader = !uploaderFilter || item.createdBy === uploaderFilter;
      const matchRange =
        !dateRange ||
        !dateRange[0] ||
        !dateRange[1] ||
        (dayjs(item.updatedAt).isAfter(dateRange[0].startOf('day')) &&
          dayjs(item.updatedAt).isBefore(dateRange[1].endOf('day')));
      return (
        matchSearch &&
        matchCategory &&
        matchMediaType &&
        matchStatus &&
        matchUploader &&
        matchRange
      );
    });
  }, [
    myContent,
    search,
    categoryFilter,
    mediaTypeFilter,
    statusFilter,
    uploaderFilter,
    dateRange,
  ]);

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
    setTitleTouched(false);
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
          options={[
            {
              value: `${MEDIA_TYPE_FILTER_PREFIX}image`,
              label: MEDIA_TYPE_LABELS.image,
            },
            {
              value: `${MEDIA_TYPE_FILTER_PREFIX}video`,
              label: MEDIA_TYPE_LABELS.video,
            },
            { value: DANG_FILTER_DIVIDER, label: '──────────', disabled: true },
            ...CONTENT_CATEGORIES.map((c) => ({
              value: c,
              label: c,
              disabled: false,
            })),
          ]}
          value={
            mediaTypeFilter
              ? `${MEDIA_TYPE_FILTER_PREFIX}${mediaTypeFilter}`
              : categoryFilter
          }
          onChange={(v: string | undefined) => {
            if (v?.startsWith(MEDIA_TYPE_FILTER_PREFIX)) {
              setMediaTypeFilter(
                v.slice(MEDIA_TYPE_FILTER_PREFIX.length) as MediaType,
              );
              setCategoryFilter(undefined);
            } else {
              setMediaTypeFilter(undefined);
              setCategoryFilter(v);
            }
          }}
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
        pagination={{ pageSize: 20, showTotal: (t) => `${t} items` }}
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
          setTitleTouched(false);
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
              onChange={({ fileList: next }) => {
                setFileList(next);
                const picked = next[0];
                if (picked && !titleTouched) {
                  createForm.setFieldValue('title', filenameToTitle(picked.name));
                }
              }}
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
            <Input
              placeholder="Ví dụ: 5 dấu hiệu thoái hóa khớp gối"
              onChange={() => setTitleTouched(true)}
            />
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
  // Ô "Dạng" gộp 2 loại lọc: 2 dạng cố định Ảnh/Video (lọc theo `mediaType`) và
  // các danh mục động (lọc theo `category`) — chọn 1 thì bỏ cái kia.
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | undefined>();
  const [assignmentFilter, setAssignmentFilter] = useState<
    AssignmentFilter | undefined
  >();
  const [statusFilter, setStatusFilter] = useState<ContentStatus | undefined>();
  // const [uploaderFilter, setUploaderFilter] = useState<string | undefined>();
  const [editorFilter, setEditorFilter] = useState<string | undefined>();
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<ContentAssetResponse | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  /** % byte đã đẩy lên server (0–100) — nguồn dữ liệu cho thanh progress. */
  const [uploadPercent, setUploadPercent] = useState(0);
  /**
   * `uploading`: đang đẩy byte lên server · `processing`: server đã nhận đủ file,
   * đang stream sang Drive + tạo bản ghi content (không còn % để hiện).
   */
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing'>(
    'idle',
  );
  const [titleTouched, setTitleTouched] = useState(false);
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
    mediaType: mediaTypeFilter,
    assignment: assignmentFilter,
    status: statusFilter,
    editorId: editorFilter,
    isActive: activeFilter,
    page,
    limit: pageSize,
  });
  const { data: categorySuggestions } = useCategorySuggestions();
  const categoryOptions = mergeCategoryOptions(categorySuggestions);
  // Ảnh/Video luôn nằm trên cùng, rồi tới đường kẻ ngăn cách (option disabled),
  // cuối cùng là danh mục động lấy từ dữ liệu thật.
  const dangFilterOptions = [
    { value: `${MEDIA_TYPE_FILTER_PREFIX}image`, label: MEDIA_TYPE_LABELS.image },
    { value: `${MEDIA_TYPE_FILTER_PREFIX}video`, label: MEDIA_TYPE_LABELS.video },
    { value: DANG_FILTER_DIVIDER, label: '──────────', disabled: true },
    ...categoryOptions.map((c) => ({ value: c, label: c, disabled: false })),
  ];
  /** Chọn Ảnh/Video ⇒ lọc `mediaType`; chọn danh mục ⇒ lọc `category`. */
  const handleDangFilterChange = (value: string | undefined): void => {
    if (value?.startsWith(MEDIA_TYPE_FILTER_PREFIX)) {
      setMediaTypeFilter(
        value.slice(MEDIA_TYPE_FILTER_PREFIX.length) as MediaType,
      );
      setCategoryFilter(undefined);
    } else {
      setMediaTypeFilter(undefined);
      setCategoryFilter(value);
    }
    setPage(1);
  };
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
  // Liệt kê **cả editor đã vô hiệu hoá** ở cả bộ lọc lẫn form (upload/chỉnh sửa):
  // bài cũ do họ dựng vẫn phải lọc ra được, và vẫn gán được người đã khoá.
  const editorFilterOptions = (editorOptions ?? []).map((e) => ({
    value: e.id,
    label: e.isActive ? e.name : `${e.name} (đã khoá)`,
  }));
  const editorSelectOptions = editorFilterOptions;
  const createJobMutation = useCreateMediaUploadJob();
  const retryJobMutation = useRetryMediaUploadJob();
  const invalidateContentAssets = useInvalidateContentAssets();
  // Chỉ poll khi có job chưa kết thúc — hook tự tắt interval khi danh sách sạch.
  const { data: uploadJobs } = useMediaUploadJobs();
  /**
   * Modal chỉ bị khoá trong lúc **đẩy byte lên server**. Xong bước đó là 202 →
   * đóng modal, phần đẩy Drive chạy nền nên người dùng bấm Upload tiếp được ngay.
   */
  const uploadBusy = uploading;
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

  /**
   * Job vừa xong ⇒ nạp lại kho bài để dòng "mờ" được thay bằng bản ghi thật.
   *
   * Chỉ báo khi thấy job **chuyển** sang SUCCESS trong phiên này. Backend giữ job
   * đã xong tới hết TTL (`MEDIA_UPLOAD_JOB_RETENTION_MS`, mặc định 1 ngày) nên
   * lần nạp đầu tiên sau F5 luôn có sẵn job SUCCESS cũ — coi chúng là "đã biết"
   * để không bắn lại toast của lần upload trước.
   */
  const seenJobStatuses = useRef<Map<string, MediaUploadStatus> | null>(null);
  useEffect(() => {
    if (uploadJobs === undefined) return;

    const previous = seenJobStatuses.current;
    seenJobStatuses.current = new Map(
      uploadJobs.map((job) => [job.id, job.status]),
    );
    // Ảnh chụp đầu tiên: chỉ ghi nhận hiện trạng, không báo gì.
    if (previous === null) return;

    const done = uploadJobs.filter(
      (job) => job.status === 'SUCCESS' && previous.get(job.id) !== 'SUCCESS',
    );
    if (done.length === 0) return;

    invalidateContentAssets();
    message.success(
      done.length === 1
        ? `Đã đưa "${done[0].title}" lên Google Drive xong`
        : `Đã đưa ${done.length} bài lên Google Drive xong`,
    );
  }, [uploadJobs, invalidateContentAssets]);

  /**
   * Dòng "mờ" = job chưa xong + job vừa lỗi (để còn bấm "Thử lại"). Job SUCCESS
   * bị loại vì bản ghi thật đã có trong danh sách — giữ lại sẽ thành 2 dòng.
   * Chỉ ghép ở **trang 1 và khi không lọc**: nhét dòng chưa-tồn-tại vào một danh
   * sách đang lọc/phân trang sẽ mâu thuẫn với chính bộ lọc đó.
   */
  const pendingJobRows = useMemo<ContentRow[]>(() => {
    if (page !== 1) return [];
    return (uploadJobs ?? [])
      .filter((job) => isActiveUploadJob(job) || job.status === 'FAILED')
      .map(uploadJobToRow);
  }, [uploadJobs, page]);

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
    if (fileList.length === 0) {
      message.error('Vui lòng chọn file ảnh hoặc video');
      return;
    }
    const rawFiles = fileList.map(
      (item) => (item.originFileObj ?? item) as unknown as File,
    );

    setUploading(true);
    setUploadPercent(0);
    setUploadPhase('uploading');
    try {
      // Cả lô ảnh đi trong MỘT request (⇒ 1 bài nhiều ảnh) và chỉ đẩy tới
      // **server**; phần lên Google Drive do worker nền làm sau.
      await createJobMutation.mutateAsync({
        body: {
          title: values.title,
          category: values.category,
          caption: values.caption,
          hashtags: values.hashtags,
          assignedPageIds: values.assignedPageIds ?? [],
          editorId: values.editorId,
        },
        files: rawFiles,
        onProgress: (percent) => {
          setUploadPercent(percent);
          if (percent >= 100) setUploadPhase('processing');
        },
      });

      message.success(
        rawFiles.length > 1
          ? `Đã nhận ${rawFiles.length} ảnh — đang đưa lên Google Drive, bạn có thể upload tiếp`
          : 'Đã nhận file — đang đưa lên Google Drive, bạn có thể upload tiếp',
      );
      // Fire-and-forget: đóng modal ngay, dòng "mờ" trên bảng lo phần còn lại.
      setCreateOpen(false);
      setFileList([]);
      setTitleTouched(false);
      createForm.resetFields();
    } catch (err) {
      // Lỗi (kể cả 503 "đang xử lý tối đa N file") ⇒ GIỮ nguyên modal và file đã
      // chọn, để bấm thử lại ngay mà không phải chọn lại file (plan 23 §3.1).
      message.error(
        err instanceof ApiError ? err.message : 'Gửi file lên server thất bại',
      );
    } finally {
      setUploading(false);
      setUploadPhase('idle');
      setUploadPercent(0);
    }
  };

  /** "Thử lại" ngay trên dòng mờ bị lỗi — dùng lại file tạm còn trên server. */
  const handleRetryUploadJob = async (job: MediaUploadJobResponse) => {
    try {
      await retryJobMutation.mutateAsync(job.id);
      message.success(`Đang thử lại "${job.title}"`);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Thử lại thất bại');
    }
  };

  const columns: ColumnsType<ContentRow> = [
    {
      title: 'No',
      width: 60,
      align: 'center',
      // Dòng mờ chưa phải bài trong kho ⇒ không chiếm số thứ tự của bài thật.
      render: (_, record, index) =>
        record.uploadJob
          ? '—'
          : (page - 1) * pageSize + index + 1 - pendingJobRows.length,
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
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis title={record.createdBy.email}>
            {record.uploadJob
              ? `${record.uploadJob.originalFilename}${
                  record.uploadJob.fileCount > 1
                    ? ` +${record.uploadJob.fileCount - 1} file`
                    : ''
                }`
              : record.createdBy.name}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 150,
      render: (_, record) => {
        const job = record.uploadJob;
        return job ? (
          <UploadJobStatusCell
            job={job}
            retrying={retryJobMutation.isPending}
            onRetry={() => void handleRetryUploadJob(job)}
          />
        ) : (
          <Space direction="vertical" size={2}>
            <ContentStatusTag
              status={record.status}
              publishedCount={record.publishedPageIds.length}
              assignedCount={record.assignedPageIds.length}
            />
            {record.isAds && <Tag color="gold">Đạt ADS</Tag>}
            {!record.isActive && <Tag>Ngưng dùng</Tag>}
          </Space>
        );
      },
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
            {record.imageCount > 1 ? ` · +${record.imageCount - 1} ảnh` : ''}
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
        record.uploadJob ? (
          // Phân bổ đã gửi kèm form nhưng chỉ được ghi khi worker tạo bài xong.
          <Text type="secondary">Chờ xử lý xong</Text>
        ) : record.assignments.length === 0 ? (
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
      render: (_, record) =>
        // Dòng "mờ" chưa có bài để sửa/xoá — nút "Thử lại" nằm ở cột Trạng thái.
        record.uploadJob ? null : (
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
          optionFilterProp="label"
          style={{ width: 180 }}
          options={dangFilterOptions}
          value={
            mediaTypeFilter
              ? `${MEDIA_TYPE_FILTER_PREFIX}${mediaTypeFilter}`
              : categoryFilter
          }
          onChange={handleDangFilterChange}
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

      <Table<ContentRow>
        rowKey="id"
        columns={columns}
        // Dòng "mờ" của job đang chạy nằm trên đầu, ngay chỗ bài sắp xuất hiện.
        dataSource={[...pendingJobRows, ...(data?.data ?? [])]}
        loading={isLoading}
        rowSelection={
          canBulk
            ? {
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
                // Bài đã đăng lên page thì backend từ chối xoá ⇒ khoá luôn ở đây
                // cho khỏi chọn nhầm (chọn-tất-cả cũng tự bỏ qua các dòng này).
                getCheckboxProps: (record) => ({
                  disabled: record.uploadJob !== undefined || !isDeletable(record),
                  title: record.uploadJob
                    ? 'File đang được xử lý — chưa phải bài trong kho'
                    : isDeletable(record)
                      ? undefined
                      : 'Bài đã đăng lên page — không xoá được',
                }),
              }
            : undefined
        }
        rowClassName={(record) =>
          record.uploadJob ? 'row-uploading' : record.isActive ? '' : 'row-inactive'
        }
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
            <ContentImagesPreview asset={editing} />
            <Space style={{ marginBottom: 16 }} wrap>
              <ContentStatusTag status={editing.status} />
              <Tag color={editing.mediaType === 'video' ? 'purple' : 'blue'}>
                {MEDIA_TYPE_LABELS[editing.mediaType]}
              </Tag>
              {editing.imageCount > 1 && (
                <Tooltip title="Danh sách ảnh cố định lúc upload — muốn đổi thì xoá bài và upload lại">
                  <Tag color="gold">Bài {editing.imageCount} ảnh</Tag>
                </Tooltip>
              )}
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
          if (uploadBusy) return;
          setCreateOpen(false);
          setFileList([]);
          setTitleTouched(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        okText="Upload"
        confirmLoading={uploadBusy}
        // Đang upload: khoá mọi lối thoát (nút X, click mask, phím Esc, nút Huỷ)
        // để không ai đóng modal giữa chừng khi file đang đẩy lên Drive.
        closable={!uploadBusy}
        maskClosable={!uploadBusy}
        keyboard={!uploadBusy}
        cancelButtonProps={{ disabled: uploadBusy }}
        width={560}
      >
        <div style={{ position: 'relative' }}>
          {uploadBusy && (
            <div
              style={{
                position: 'absolute',
                inset: -8,
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 24,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.88)',
                backdropFilter: 'blur(2px)',
                cursor: 'progress',
              }}
              // Chặn mọi thao tác chuột/bàn phím vào form phía dưới.
              onClick={(e) => e.stopPropagation()}
            >
              <Progress
                percent={uploadPercent}
                status="active"
                style={{ width: '80%', margin: 0 }}
              />
              <Text strong>
                {uploadPhase === 'processing'
                  ? 'Đang xử lý trên Google Drive...'
                  : `Đang tải file lên... ${uploadPercent}%`}
              </Text>
              <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
                Vui lòng không đóng cửa sổ này cho tới khi hoàn tất.
              </Text>
            </div>
          )}
          <Form form={createForm} layout="vertical" onFinish={handleCreate} disabled={uploadBusy}>
          <Form.Item
            label="File ảnh/video"
            required
            tooltip="Ảnh: JPG/PNG/WebP · Video: MP4/MOV — upload thẳng lên Google Drive"
          >
            <Upload
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              fileList={fileList}
              multiple
              maxCount={MAX_IMAGES_PER_CONTENT_ASSET}
              beforeUpload={() => false}
              onChange={({ fileList: next }) => {
                // Chọn nhiều ảnh ⇒ MỘT bài nhiều ảnh (album). Video thì Graph API
                // không ghép được nên rơi về đúng 1 file, giữ nguyên hành vi cũ.
                const hasVideo = next.some((f) => detectMediaType(f) === 'video');
                const trimmed = hasVideo
                  ? next.slice(0, 1)
                  : next.slice(0, MAX_IMAGES_PER_CONTENT_ASSET);
                if (trimmed.length < next.length) {
                  message.warning(
                    hasVideo
                      ? 'Video chỉ đăng được 1 file mỗi bài — Facebook không ghép nhiều video vào một bài.'
                      : `Một bài tối đa ${MAX_IMAGES_PER_CONTENT_ASSET} ảnh.`,
                  );
                }
                setFileList(trimmed);
                const picked = trimmed[0];
                if (picked && !titleTouched) {
                  createForm.setFieldValue('title', filenameToTitle(picked.name));
                }
              }}
            >
              <Button icon={<UploadOutlined />}>Chọn ảnh hoặc video</Button>
            </Upload>
            {fileList.length > 1 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {fileList.length} ảnh ⇒ đăng thành{' '}
                <strong>1 bài Facebook nhiều ảnh</strong>, theo đúng thứ tự trên.
                Ảnh đầu là ảnh đại diện của bài.
              </Text>
            )}
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
            <Input
              placeholder="Ví dụ: 5 dấu hiệu thoái hóa khớp gối"
              onChange={() => setTitleTouched(true)}
            />
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
        </div>
      </Modal>
    </div>
  );
}
