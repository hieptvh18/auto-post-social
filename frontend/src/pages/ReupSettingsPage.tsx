import {
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import {
  useCreateReupTopic,
  useDeleteReupTopic,
  useDeleteReupVideoResource,
  useDiscoverReupTopicNow,
  useReupCleanupPreview,
  useReupCleanupSettings,
  useReupHealth,
  useReupRuns,
  useReupSchedule,
  useReupTopics,
  useReupVideos,
  useRetryReupVideo,
  useRunReupCleanup,
  useSkipReupVideo,
  useUpdateReupCleanupSettings,
  useUpdateReupSchedule,
  useUpdateReupTopic,
  useUpdateYoutubeApiSettings,
  useYoutubeApiSettings,
} from '../hooks/useReupTopics';
import type {
  CreateReupTopicBody,
  ReupPlatform,
  ReupRunResponse,
  ReupScheduleSettingsResponse,
  ReupTopicResponse,
  ReupVideoResponse,
} from '../types';

const { Text, Paragraph } = Typography;

const PLATFORM_OPTIONS: { value: ReupPlatform; label: string }[] = [
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'DOUYIN', label: 'Douyin' },
  { value: 'TIKTOK', label: 'TikTok' },
];

const PLATFORM_LABELS: Record<ReupPlatform, string> = {
  YOUTUBE: 'YouTube',
  DOUYIN: 'Douyin',
  TIKTOK: 'TikTok',
};

/** Giá trị mặc định của form — khớp default ở `schema.prisma` để đỡ lệch. */
const FORM_DEFAULTS = {
  platform: 'YOUTUBE' as ReupPlatform,
  regionCode: 'VN',
  dailyQuota: 3,
  minViewCount: 50000,
  maxAgeDays: 30,
  minDurationSec: 15,
  maxDurationSec: 180,
  autoApprove: false,
  isActive: true,
};

/** Nhãn tiếng Việt cho `skipReason` — khớp `ReupSkipReason` ở backend. */
const SKIP_REASON_LABELS: Record<string, string> = {
  PLATFORM_NOT_SUPPORTED: 'Nền tảng chưa hỗ trợ',
  DOWNLOADER_UNAVAILABLE: 'Chưa cài công cụ tải video',
  NOT_CONFIGURED: 'Chưa cấu hình API key YouTube',
  QUOTA_EXCEEDED: 'Đã hết quota YouTube hôm nay',
  CONTRACT_MISMATCH: 'Phiên bản công cụ tải video không khớp',
  NO_NEW_VIDEO: 'Không có video mới',
};

const REUP_STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ tải', color: 'default' },
  DOWNLOADING: { label: 'Đang tải', color: 'processing' },
  DOWNLOADED: { label: 'Đã tải xong', color: 'processing' },
  UPLOADING: { label: 'Đang lên Google Drive', color: 'processing' },
  IMPORTED: { label: 'Đã vào kho', color: 'success' },
  FAILED: { label: 'Lỗi', color: 'error' },
  SKIPPED: { label: 'Đã bỏ qua', color: 'default' },
};

const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  CLAIMED: { label: 'Đang chạy', color: 'processing' },
  DONE: { label: 'Xong', color: 'success' },
  SKIPPED: { label: 'Bỏ qua', color: 'default' },
  ERROR: { label: 'Lỗi', color: 'error' },
};

interface TopicFormValues extends Omit<CreateReupTopicBody, 'keywords'> {
  /** Ô nhập là Select mode="tags" ⇒ luôn là mảng chuỗi. */
  keywords?: string[];
}

/** Menu Reup Setting — route `/reup`, chỉ SUPER_ADMIN (plan 26 `canAccessRoute`). */
export default function ReupSettingsPage() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ReupTopicResponse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<TopicFormValues>();
  const [platformInForm, setPlatformInForm] = useState<ReupPlatform>('YOUTUBE');

  const { data, isLoading } = useReupTopics({ page, limit: 20 });
  const createTopic = useCreateReupTopic();
  const updateTopic = useUpdateReupTopic();
  const deleteTopic = useDeleteReupTopic();
  const discoverNow = useDiscoverReupTopicNow();
  const { data: health } = useReupHealth();

  const handleDiscoverNow = async (topic: ReupTopicResponse) => {
    try {
      const result = await discoverNow.mutateAsync(topic.id);
      if (!result.claimed) {
        message.info('Chủ đề này đã được quét hôm nay — không quét lại lần nữa');
      } else if (result.status === 'DONE') {
        message.success(
          `Tìm thấy ${result.foundCount} video, chọn ${result.pickedCount} video mới (đã tự loại video trùng)`,
        );
      } else if (result.skipReason === 'NO_NEW_VIDEO') {
        message.info('Không có video mới — mọi video tìm được đều đã tải trước đó');
      } else {
        message.warning(`Bỏ qua: ${SKIP_REASON_LABELS[result.skipReason ?? ''] ?? result.skipReason}`);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Quét thất bại');
    }
  };

  const openCreate = () => {
    setEditing(null);
    setPlatformInForm(FORM_DEFAULTS.platform);
    form.setFieldsValue({ ...FORM_DEFAULTS, name: '', category: '' });
    setModalOpen(true);
  };

  const openEdit = (topic: ReupTopicResponse) => {
    setEditing(topic);
    setPlatformInForm(topic.platform);
    form.setFieldsValue({
      name: topic.name,
      platform: topic.platform,
      keywords: topic.keywords,
      regionCode: topic.regionCode,
      category: topic.category,
      dailyQuota: topic.dailyQuota,
      minViewCount: topic.minViewCount,
      maxAgeDays: topic.maxAgeDays,
      minDurationSec: topic.minDurationSec,
      maxDurationSec: topic.maxDurationSec,
      autoApprove: topic.autoApprove,
      captionTemplate: topic.captionTemplate ?? undefined,
      hashtags: topic.hashtags ?? undefined,
      isActive: topic.isActive,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateTopic.mutateAsync({ id: editing.id, body: values });
        message.success('Đã cập nhật chủ đề');
      } else {
        await createTopic.mutateAsync(values);
        message.success('Đã tạo chủ đề');
      }
      setModalOpen(false);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Lưu chủ đề thất bại',
      );
    }
  };

  /** Bật/tắt nhanh ngay trên bảng — không phải mở modal chỉ để đổi 1 switch. */
  const toggleField = async (
    topic: ReupTopicResponse,
    field: 'isActive' | 'autoApprove',
    value: boolean,
  ) => {
    try {
      await updateTopic.mutateAsync({ id: topic.id, body: { [field]: value } });
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Cập nhật thất bại',
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTopic.mutateAsync(id);
      message.success('Đã tắt chủ đề');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Tắt thất bại');
    }
  };

  const columns: ColumnsType<ReupTopicResponse> = [
    {
      title: 'Chủ đề',
      dataIndex: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Dạng bài: {record.category}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Nguồn',
      dataIndex: 'platform',
      width: 140,
      render: (platform: ReupPlatform, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={record.isPlatformSupported ? 'blue' : 'default'}>
            {PLATFORM_LABELS[platform]}
          </Tag>
          {!record.isPlatformSupported && (
            <Tooltip title="Khai báo được nhưng lượt quét sẽ bị bỏ qua — giai đoạn này chỉ YouTube chạy thật.">
              <Tag color="warning">chưa hỗ trợ</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Video/ngày',
      dataIndex: 'dailyQuota',
      width: 110,
      align: 'center',
    },
    {
      title: 'Bộ lọc',
      width: 200,
      render: (_, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          ≥ {record.minViewCount.toLocaleString('vi-VN')} view ·{' '}
          {record.minDurationSec}–{record.maxDurationSec}s · đăng trong{' '}
          {record.maxAgeDays} ngày
        </Text>
      ),
    },
    {
      title: 'Tự duyệt',
      dataIndex: 'autoApprove',
      width: 110,
      align: 'center',
      render: (autoApprove: boolean, record) => (
        <Tooltip title="Bật = video tải về vào thẳng hàng chờ đăng, KHÔNG qua duyệt tay">
          <Switch
            size="small"
            checked={autoApprove}
            onChange={(checked) =>
              void toggleField(record, 'autoApprove', checked)
            }
          />
        </Tooltip>
      ),
    },
    {
      title: 'Đang bật',
      dataIndex: 'isActive',
      width: 100,
      align: 'center',
      render: (isActive: boolean, record) => (
        <Switch
          size="small"
          checked={isActive}
          onChange={(checked) => void toggleField(record, 'isActive', checked)}
        />
      ),
    },
    {
      title: 'Thao tác',
      width: 220,
      render: (_, record) => (
        <Space>
          <Tooltip
            title={
              record.isPlatformSupported
                ? 'Quét ngay — không đợi cron 02:00. Video đã tải trước đó sẽ tự bỏ qua, không tải lại.'
                : 'Nền tảng này chưa hỗ trợ quét thật'
            }
          >
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              disabled={!record.isPlatformSupported || !record.isActive}
              loading={discoverNow.isPending}
              onClick={() => void handleDiscoverNow(record)}
            >
              Quét ngay
            </Button>
          </Tooltip>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Tắt chủ đề này?"
            description="Chủ đề sẽ ngừng được quét. Video đã kéo về vẫn giữ nguyên."
            okText="Tắt"
            cancelText="Huỷ"
            onConfirm={() => void handleDelete(record.id)}
          >
            <Button type="link" size="small" danger disabled={!record.isActive}>
              Tắt
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const topicsTab = (
    <>
      <Space wrap className="filter-bar" style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Thêm chủ đề
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.data ?? []}
        scroll={{ x: 1350 }}
        locale={{
          emptyText: (
            <Empty
              description="Chưa khai báo chủ đề nào — thêm chủ đề để bắt đầu kéo video."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize: data?.meta.limit ?? 20,
          total: data?.meta.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />
    </>
  );

  return (
    <div>
      <PageHeader
        title="Reup Setting"
        description="Khai báo chủ đề cần kéo video về kho. Mỗi ngày bot tự tìm theo từ khoá, lọc theo điều kiện bạn đặt rồi đưa vào Quản lý Ảnh/Video."
      />

      {health && !health.available && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Chưa cài được công cụ tải video"
          description={
            <Paragraph style={{ marginBottom: 0 }}>
              {health.reason ?? 'Không rõ lý do'} — tính năng reup tạm ngưng,
              phần còn lại của hệ thống vẫn chạy bình thường. Cấu hình xong
              không cần khởi động lại server.
            </Paragraph>
          }
        />
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Giai đoạn này chỉ YouTube chạy thật"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            Douyin/TikTok vẫn khai báo và lưu được, nhưng lượt quét sẽ bị bỏ qua
            cho tới khi có adapter tương ứng.
          </Paragraph>
        }
      />

      <YoutubeApiSettingsCard />

      <Tabs
        defaultActiveKey="topics"
        items={[
          { key: 'topics', label: 'Chủ đề', children: topicsTab },
          {
            key: 'videos',
            label: 'Video đã kéo',
            children: <ReupVideosTab />,
          },
          {
            key: 'runs',
            label: 'Nhật ký quét',
            children: <ReupRunsTab />,
          },
          {
            key: 'cleanup',
            label: 'Dọn dẹp',
            children: <ReupCleanupTab />,
          },
          {
            key: 'schedule',
            label: 'Lịch chạy',
            children: <ReupScheduleTab />,
          },
        ]}
      />

      <Modal
        title={editing ? 'Sửa chủ đề' : 'Thêm chủ đề'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={createTopic.isPending || updateTopic.isPending}
        okText="Lưu"
        cancelText="Huỷ"
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={FORM_DEFAULTS}>
          <Form.Item
            name="name"
            label="Tên chủ đề"
            rules={[{ required: true, message: 'Nhập tên chủ đề' }]}
          >
            <Input placeholder="Mẹo nấu ăn" />
          </Form.Item>

          <Form.Item name="platform" label="Nguồn">
            <Select
              options={PLATFORM_OPTIONS}
              onChange={(value: ReupPlatform) => setPlatformInForm(value)}
            />
          </Form.Item>

          {platformInForm !== 'YOUTUBE' && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Nền tảng chưa hỗ trợ — sẽ bỏ qua khi quét"
            />
          )}

          <Form.Item
            name="keywords"
            label="Từ khoá tìm kiếm"
            tooltip="Gõ rồi nhấn Enter để thêm. Bắt buộc với nguồn YouTube."
            rules={[
              {
                validator: (_, value: string[] | undefined) =>
                  platformInForm === 'YOUTUBE' &&
                  (value === undefined || value.length === 0)
                    ? Promise.reject(
                        new Error('Chủ đề YouTube phải có ít nhất 1 từ khoá'),
                      )
                    : Promise.resolve(),
              },
            ]}
          >
            <Select mode="tags" tokenSeparators={[',']} placeholder="mẹo nấu ăn" />
          </Form.Item>

          <Form.Item
            name="category"
            label='Dạng bài ("Dạng" trong kho nội dung)'
            rules={[{ required: true, message: 'Nhập dạng bài' }]}
          >
            <Input placeholder="Ẩm thực" />
          </Form.Item>

          <Space wrap size={16}>
            <Form.Item name="dailyQuota" label="Số video mỗi ngày">
              <InputNumber min={1} max={10} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="minViewCount" label="View tối thiểu">
              <InputNumber min={0} step={1000} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="maxAgeDays" label="Đăng trong vòng (ngày)">
              <InputNumber min={1} max={365} style={{ width: 180 }} />
            </Form.Item>
          </Space>

          <Space wrap size={16}>
            <Form.Item name="minDurationSec" label="Thời lượng tối thiểu (giây)">
              <InputNumber min={1} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item
              name="maxDurationSec"
              label="Thời lượng tối đa (giây)"
              dependencies={['minDurationSec']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, value: number | undefined) => {
                    const min = getFieldValue('minDurationSec') as
                      | number
                      | undefined;
                    if (
                      value === undefined ||
                      min === undefined ||
                      value > min
                    ) {
                      return Promise.resolve();
                    }
                    return Promise.reject(
                      new Error('Phải lớn hơn thời lượng tối thiểu'),
                    );
                  },
                }),
              ]}
            >
              <InputNumber min={1} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="regionCode" label="Vùng">
              <Input style={{ width: 100 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="captionTemplate"
            label="Caption mặc định"
            tooltip="Dùng {title} để chèn tiêu đề video gốc. Bỏ trống ⇒ lấy luôn tiêu đề video."
          >
            <Input.TextArea rows={2} placeholder="{title} #reup" />
          </Form.Item>

          <Form.Item name="hashtags" label="Hashtag">
            <Input placeholder="#mẹovặt #nấuăn" />
          </Form.Item>

          <Form.Item
            name="autoApprove"
            label="Tự duyệt"
            valuePropName="checked"
            tooltip="Bật = video tải về vào thẳng hàng chờ đăng, không qua duyệt tay"
          >
            <Switch />
          </Form.Item>

          <Form.Item name="isActive" label="Đang bật" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/** Cấu hình API key YouTube — đặt ở màn Reup (không phải /settings, xem I10). */
function YoutubeApiSettingsCard() {
  const { data, isLoading } = useYoutubeApiSettings();
  const updateSettings = useUpdateYoutubeApiSettings();
  const [form] = Form.useForm<{ apiKey?: string; dailyQuota?: number }>();
  const [expanded, setExpanded] = useState(false);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      await updateSettings.mutateAsync({
        // Ô trống = không đổi key hiện có (backend giữ nguyên khi thiếu field).
        apiKey: values.apiKey === '' ? undefined : values.apiKey,
        dailyQuota: values.dailyQuota,
      });
      message.success('Đã lưu cấu hình YouTube API');
      form.resetFields(['apiKey']);
      setExpanded(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Lưu thất bại');
    }
  };

  if (isLoading || !data) return null;

  return (
    <Alert
      type={data.hasApiKey ? 'success' : 'error'}
      showIcon
      style={{ marginBottom: 16 }}
      message={
        <Space>
          <span>
            {data.hasApiKey
              ? `API key YouTube: ${data.maskedApiKey ?? '••••'}`
              : 'Chưa cấu hình API key YouTube — cron sẽ không quét được'}
          </span>
          {data.usingEnvFallback && <Tag>đang dùng key trong .env</Tag>}
          <Button size="small" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Đóng' : 'Sửa'}
          </Button>
        </Space>
      }
      description={
        expanded && (
          <Form
            form={form}
            layout="inline"
            style={{ marginTop: 12 }}
            initialValues={{ dailyQuota: data.dailyQuota }}
            onFinish={() => void handleSave()}
          >
            <Form.Item name="apiKey" label="API key mới">
              <Input.Password
                placeholder="Để trống nếu không đổi"
                style={{ width: 260 }}
              />
            </Form.Item>
            <Form.Item
              name="dailyQuota"
              label="Trần quota/ngày"
              tooltip="search.list tốn 100 units/lần. Mặc định Google cấp 10.000/ngày."
            >
              <InputNumber min={100} step={100} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={updateSettings.isPending}
              >
                Lưu
              </Button>
            </Form.Item>
          </Form>
        )
      }
    />
  );
}

/** Tab "Video đã kéo" — plan 29 + Tag "Đã xoá file" của plan 30. */
function ReupVideosTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useReupVideos({ page, limit: 20 });
  const retryVideo = useRetryReupVideo();
  const skipVideo = useSkipReupVideo();
  const deleteResource = useDeleteReupVideoResource();

  const handleRetry = async (video: ReupVideoResponse) => {
    try {
      await retryVideo.mutateAsync(video.id);
      message.success(`Đang thử lại "${video.title}"`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Thử lại thất bại');
    }
  };

  const handleSkip = async (video: ReupVideoResponse) => {
    try {
      await skipVideo.mutateAsync(video.id);
      message.success('Đã bỏ qua video');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Bỏ qua thất bại');
    }
  };

  const handleDeleteResource = async (video: ReupVideoResponse) => {
    try {
      await deleteResource.mutateAsync(video.id);
      message.success('Đã xoá file trên Drive — bản ghi trong kho vẫn giữ nguyên');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Xoá file thất bại');
    }
  };

  const columns: ColumnsType<ReupVideoResponse> = [
    {
      title: 'Video',
      dataIndex: 'title',
      render: (title: string, record) => (
        <Space direction="vertical" size={0} style={{ maxWidth: 360 }}>
          <a href={record.sourceUrl} target="_blank" rel="noreferrer">
            <Text strong ellipsis>
              {title}
            </Text>
          </a>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.authorName} · {record.topicName}
            {record.viewCount !== null &&
              ` · ${record.viewCount.toLocaleString('vi-VN')} view`}
            {record.durationSec !== null && ` · ${record.durationSec}s`}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 170,
      render: (status: string, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={REUP_STATUS_META[status]?.color ?? 'default'}>
            {REUP_STATUS_META[status]?.label ?? status}
          </Tag>
          {record.resourceDeletedAt && (
            <Tooltip title="Cron dọn dẹp đã xoá file trên Drive để giải phóng dung lượng — bản ghi và thống kê vẫn giữ nguyên.">
              <Tag color="default">Đã xoá file</Tag>
            </Tooltip>
          )}
          {record.status === 'FAILED' && record.errorMessage && (
            <Tooltip title={record.errorMessage}>
              <Text type="danger" style={{ fontSize: 12 }} ellipsis>
                {record.errorMessage}
              </Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Ngày phát hiện',
      dataIndex: 'discoveredAt',
      width: 130,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Thao tác',
      width: 220,
      render: (_, record) => (
        <Space>
          {record.contentAssetId && !record.resourceDeletedAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Đã vào kho
            </Text>
          )}
          {record.status === 'FAILED' && (
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              loading={retryVideo.isPending}
              onClick={() => void handleRetry(record)}
            >
              Thử lại
            </Button>
          )}
          {record.status !== 'IMPORTED' && record.status !== 'SKIPPED' && (
            <Button
              type="link"
              size="small"
              danger
              loading={skipVideo.isPending}
              onClick={() => void handleSkip(record)}
            >
              Bỏ qua
            </Button>
          )}
          {record.status === 'IMPORTED' && !record.resourceDeletedAt && (
            <Popconfirm
              title="Xoá file trên Drive của video này?"
              description="Chỉ xoá file, bản ghi và thống kê vẫn giữ nguyên — không khôi phục được."
              okText="Xoá"
              okButtonProps={{ danger: true }}
              cancelText="Huỷ"
              onConfirm={() => void handleDeleteResource(record)}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={deleteResource.isPending}
              >
                Xoá file
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      loading={isLoading}
      columns={columns}
      dataSource={data?.data ?? []}
      scroll={{ x: 950 }}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có video nào — bấm Quét ngay ở tab Chủ đề hoặc đợi cron chạy lúc 02:00."
          />
        ),
      }}
      pagination={{
        current: page,
        pageSize: data?.meta.limit ?? 20,
        total: data?.meta.total ?? 0,
        showSizeChanger: false,
        onChange: setPage,
      }}
    />
  );
}

/** Tab "Nhật ký quét" — plan 29. */
function ReupRunsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useReupRuns({ page, limit: 30 });

  const columns: ColumnsType<ReupRunResponse> = [
    { title: 'Ngày', dataIndex: 'runDate', width: 110 },
    { title: 'Chủ đề', render: (_, record) => record.topic.name },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: string, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={RUN_STATUS_META[status]?.color ?? 'default'}>
            {RUN_STATUS_META[status]?.label ?? status}
          </Tag>
          {record.skipReason && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {SKIP_REASON_LABELS[record.skipReason] ?? record.skipReason}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Tìm được / Chọn',
      width: 130,
      align: 'center',
      render: (_, record) => `${record.foundCount} / ${record.pickedCount}`,
    },
    { title: 'Quota tiêu', dataIndex: 'quotaUsed', width: 100, align: 'center' },
    {
      title: 'Thời điểm',
      dataIndex: 'startedAt',
      width: 160,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
  ];

  return (
    <Table
      rowKey="id"
      loading={isLoading}
      columns={columns}
      dataSource={data?.data ?? []}
      scroll={{ x: 800 }}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có lượt quét nào."
          />
        ),
      }}
      pagination={{
        current: page,
        pageSize: data?.meta.limit ?? 30,
        total: data?.meta.total ?? 0,
        showSizeChanger: false,
        onChange: setPage,
      }}
    />
  );
}

/** `1_500_000` → `"1.4 MB"` — dùng chung cho tổng dung lượng và từng dòng. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Tab "Dọn dẹp" — plan 30. `enabled = false` mặc định: người vận hành phải tự
 * xem preview rồi mới bật, tránh xoá hàng loạt ngay lần deploy đầu (R5).
 */
function ReupCleanupTab() {
  const { data: settings, isLoading: settingsLoading } =
    useReupCleanupSettings();
  const updateSettings = useUpdateReupCleanupSettings();
  const { data: preview, isLoading: previewLoading } = useReupCleanupPreview();
  const runCleanup = useRunReupCleanup();
  const [form] = Form.useForm<{ enabled: boolean; retentionDays: number }>();

  const handleSaveSettings = async () => {
    const values = await form.validateFields();
    try {
      await updateSettings.mutateAsync(values);
      message.success('Đã lưu cấu hình dọn dẹp');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Lưu thất bại');
    }
  };

  const handleRunNow = async () => {
    try {
      const result = await runCleanup.mutateAsync();
      if (result.deletedCount === 0 && result.failedCount === 0) {
        message.info('Không có bài nào đủ điều kiện để dọn');
      } else {
        message.success(
          `Đã xoá file của ${result.deletedCount} bài, giải phóng ${formatBytes(result.freedBytes)}` +
            (result.failedCount > 0 ? ` (${result.failedCount} bài lỗi, sẽ thử lại)` : ''),
        );
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Dọn dẹp thất bại');
    }
  };

  const columns: ColumnsType<{
    id: string;
    title: string;
    driveFileId: string;
    fileSize: number | null;
    publishedAt: string;
  }> = [
    { title: 'Tiêu đề', dataIndex: 'title' },
    {
      title: 'Ngày đăng',
      dataIndex: 'publishedAt',
      width: 150,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Dung lượng',
      dataIndex: 'fileSize',
      width: 120,
      align: 'right',
      render: (v: number | null) => (v === null ? '—' : formatBytes(v)),
    },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Chỉ xoá file trên Drive, không xoá bản ghi"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            Bài reup đã đăng quá hạn sẽ mất file trên Google Drive để giải
            phóng dung lượng, nhưng tiêu đề/caption/thống kê lượt xem vẫn giữ
            nguyên để tra cứu. Bài <Text strong>tự dựng (MANUAL)</Text> không
            bao giờ bị đụng tới.
          </Paragraph>
        }
      />

      <Form
        form={form}
        layout="inline"
        style={{ marginBottom: 16 }}
        initialValues={settings}
        onFinish={() => void handleSaveSettings()}
      >
        <Form.Item
          name="enabled"
          label="Bật tự động dọn dẹp"
          valuePropName="checked"
        >
          <Switch loading={settingsLoading} />
        </Form.Item>
        <Form.Item
          name="retentionDays"
          label="Xoá file sau (ngày)"
          tooltip="Tính từ lúc bài được đăng lên page."
        >
          <InputNumber min={1} max={365} style={{ width: 120 }} />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={updateSettings.isPending}
          >
            Lưu cấu hình
          </Button>
        </Form.Item>
      </Form>

      <Space
        wrap
        className="filter-bar"
        style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}
      >
        <Text>
          {preview
            ? `${preview.items.length} bài sẽ bị xoá file · tổng ${formatBytes(preview.totalBytes)}`
            : 'Đang tải danh sách xem trước...'}
        </Text>
        <Popconfirm
          title={`Dọn ngay ${preview?.items.length ?? 0} bài?`}
          description="Sẽ xoá file trên Drive của các bài trong danh sách bên dưới — không khôi phục được."
          okText="Dọn ngay"
          okButtonProps={{ danger: true }}
          cancelText="Huỷ"
          disabled={!preview || preview.items.length === 0}
          onConfirm={() => void handleRunNow()}
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={runCleanup.isPending}
            disabled={!preview || preview.items.length === 0}
          >
            Dọn ngay
          </Button>
        </Popconfirm>
      </Space>

      <Table
        rowKey="id"
        loading={previewLoading}
        columns={columns}
        dataSource={preview?.items ?? []}
        scroll={{ x: 700 }}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Chưa có bài nào đủ điều kiện dọn dẹp."
            />
          ),
        }}
      />
    </div>
  );
}

interface ScheduleFormValues {
  discoveryEnabled: boolean;
  discoveryTime: import('dayjs').Dayjs;
  cleanupEnabled: boolean;
  cleanupTime: import('dayjs').Dayjs;
}

function toFormValues(
  settings: ReupScheduleSettingsResponse,
): ScheduleFormValues {
  return {
    discoveryEnabled: settings.discoveryEnabled,
    discoveryTime: dayjs(settings.discoveryTime, 'HH:mm'),
    cleanupEnabled: settings.cleanupEnabled,
    cleanupTime: dayjs(settings.cleanupTime, 'HH:mm'),
  };
}

function formatNextRun(value: string | null): string {
  return value === null ? 'Đang tắt' : dayjs(value).format('DD/MM/YYYY HH:mm');
}

/** Tab **Lịch chạy** (plan 32) — đổi giờ hai cron reup, có hiệu lực ngay, không restart. */
function ReupScheduleTab() {
  const { data: settings, isLoading } = useReupSchedule();
  const updateSchedule = useUpdateReupSchedule();
  const [form] = Form.useForm<ScheduleFormValues>();

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      await updateSchedule.mutateAsync({
        discoveryEnabled: values.discoveryEnabled,
        discoveryTime: values.discoveryTime.format('HH:mm'),
        cleanupEnabled: values.cleanupEnabled,
        cleanupTime: values.cleanupTime.format('HH:mm'),
      });
      message.success('Đã lưu lịch chạy — có hiệu lực ngay, không cần khởi động lại server');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Lưu thất bại');
    }
  };

  return (
    <div>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Tránh trùng khung giờ đăng bài"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            Tải video reup ăn băng thông — nên đặt giờ quét/dọn dẹp ngoài các
            mốc giờ đã cấu hình ở <Text strong>Quản lý Fanpage → Cấu hình đăng
            tự động</Text> để không giành băng thông với lúc Bot đang đẩy video
            lên Facebook.
          </Paragraph>
        }
      />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Mỗi chủ đề chỉ quét 1 lần/ngày"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            Đổi giờ ở đây chỉ đổi THỜI ĐIỂM cron chạy, không làm nó chạy nhiều
            lần trong ngày.
          </Paragraph>
        }
      />

      {settings && (
        <Form<ScheduleFormValues>
          form={form}
          layout="vertical"
          initialValues={toFormValues(settings)}
        >
          <Space size={48} align="start" wrap>
            <div>
              <Typography.Title level={5}>Quét video</Typography.Title>
              <Form.Item
                name="discoveryEnabled"
                label="Bật cron quét"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="discoveryTime"
                label="Giờ quét"
                rules={[{ required: true, message: 'Chọn giờ quét' }]}
              >
                <TimePicker format="HH:mm" minuteStep={5} allowClear={false} />
              </Form.Item>
              <Text type="secondary">
                Lần chạy kế tiếp: {formatNextRun(settings.discoveryNextRunAt)}
              </Text>
            </div>

            <div>
              <Typography.Title level={5}>Dọn dẹp file</Typography.Title>
              <Form.Item
                name="cleanupEnabled"
                label="Bật cron dọn dẹp"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="cleanupTime"
                label="Giờ dọn dẹp"
                rules={[{ required: true, message: 'Chọn giờ dọn dẹp' }]}
              >
                <TimePicker format="HH:mm" minuteStep={5} allowClear={false} />
              </Form.Item>
              <Text type="secondary">
                Lần chạy kế tiếp: {formatNextRun(settings.cleanupNextRunAt)}
              </Text>
              <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                Bật cron ở đây chỉ quyết định LỊCH chạy — công tắc "xoá file có
                được phép chạy không" nằm ở tab <Text strong>Dọn dẹp</Text>.
              </Paragraph>
            </div>
          </Space>

          <Form.Item style={{ marginTop: 24 }}>
            <Button
              type="primary"
              loading={updateSchedule.isPending}
              onClick={() => void handleSave()}
            >
              Lưu lịch chạy
            </Button>
          </Form.Item>
        </Form>
      )}

      {isLoading && !settings && <Text type="secondary">Đang tải lịch chạy...</Text>}
    </div>
  );
}
