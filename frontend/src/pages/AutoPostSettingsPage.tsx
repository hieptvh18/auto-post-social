import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { mockPages } from '../api/mock/data';
import {
  ManualPostModal,
  type ManualPostPageOption,
} from '../components/autopost/ManualPostModal';
import { PageHeader } from '../components/common/PageHeader';
import { env } from '../config/env';
import { useAuthUser } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import {
  useAutoPostConfigs,
  useCategoryAvailability,
  useCreateSlot,
  useDeleteSlot,
  useSetAutoPostEnabled,
  useUpdateSlot,
} from '../hooks/useAutoPostConfigs';
import type {
  AutoPostConfigResponse,
  AutoPostSlot,
  AutoPostSlotResponse,
  SlotReadinessStatus,
  SlotMediaType,
} from '../types';
import { SLOT_MEDIA_TYPE_LABELS } from '../utils/constants';
import {
  buildCategoryOptionsWithStock,
  mergeCategoryOptions,
  normalizeCategory,
  type CategoryOptionWithStock,
} from '../utils/categories';
import { useCategorySuggestions } from '../hooks/useContentAssets';
import { can } from '../utils/permissions';

const { Text } = Typography;

/** Khớp `MAX_POST_PER_SLOT` mặc định của backend — vượt ngưỡng backend trả 400. */
const MAX_POST_PER_SLOT = 20;

/** Khớp `MAX_ASSETS_PER_POST` của backend — trần của Facebook cho 1 bài nhiều ảnh. */
const MAX_ASSETS_PER_POST = 10;

interface SlotFormValues {
  time: dayjs.Dayjs;
  /**
   * **Đúng 1 danh mục.** Cột DB vẫn là mảng (dữ liệu cũ có thể nhiều) nên submit
   * bọc lại thành `[category]`; backend chặn mảng >1 phần tử.
   */
  category: string;
  mediaType: SlotMediaType;
  postCount: number;
  /** Số ảnh gom vào 1 bài (album). 1 = mỗi bài 1 ảnh, như trước giờ. */
  assetsPerPost: number;
}

const BOT_LOGIC_NOTE =
  'Đến mỗi mốc giờ, cron quét lịch và lấy bài ở trạng thái Đã duyệt thuộc Dạng đã chọn, được phân bổ cho page đó. Mỗi bài chỉ được đăng 1 lần trên 1 page (unique content × page). Thứ tự lấy theo thời gian duyệt (updated_at) — bài duyệt sớm đăng trước.';

/** Chọn implementation theo cờ mock (ADR-005) — giữ MockDataContext nguyên vẹn. */
export default function AutoPostSettingsPage() {
  return env.useMock ? (
    <MockAutoPostSettingsPage />
  ) : (
    <RealAutoPostSettingsPage />
  );
}

/* ────────────────────────────── Real (API thật) ────────────────────────────── */

function RealAutoPostSettingsPage() {
  const user = useAuthUser();
  const [slotModal, setSlotModal] = useState<{
    pageId: string;
    slot: AutoPostSlotResponse | null;
  } | null>(null);
  const [pageFilter, setPageFilter] = useState<string | undefined>();
  const [manualPost, setManualPost] = useState<{ pageId?: string } | null>(
    null,
  );
  const [form] = Form.useForm<SlotFormValues>();

  const { data: configs, isLoading } = useAutoPostConfigs();
  const setEnabledMutation = useSetAutoPostEnabled();
  const createSlotMutation = useCreateSlot();
  const updateSlotMutation = useUpdateSlot();
  const deleteSlotMutation = useDeleteSlot();

  const canManage = can(user.role, 'autopost:manage');

  const openSlotModal = (pageId: string, slot: AutoPostSlotResponse | null) => {
    setSlotModal({ pageId, slot });
    if (slot) {
      form.setFieldsValue({
        time: dayjs(slot.time, 'HH:mm'),
        category: slot.categories[0] ?? '',
        mediaType: slot.mediaType,
        postCount: slot.postCount,
        assetsPerPost: slot.assetsPerPost,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ mediaType: 'all', postCount: 1, assetsPerPost: 1 });
    }
  };

  const closeSlotModal = () => {
    setSlotModal(null);
    form.resetFields();
  };

  const handleSlotSubmit = async (values: SlotFormValues) => {
    if (!slotModal) return;
    const body = {
      time: values.time.format('HH:mm'),
      categories: [values.category],
      mediaType: values.mediaType,
      postCount: values.postCount,
      assetsPerPost: values.assetsPerPost,
    };

    try {
      if (slotModal.slot) {
        await updateSlotMutation.mutateAsync({
          slotId: slotModal.slot.id,
          body,
        });
        message.success('Đã cập nhật mốc giờ');
      } else {
        await createSlotMutation.mutateAsync({
          pageId: slotModal.pageId,
          body,
        });
        message.success('Đã thêm mốc giờ đăng');
      }
      closeSlotModal();
    } catch (error) {
      // 409 = trùng giờ trong cùng page, 400 = vượt MAX_POST_PER_SLOT.
      message.error(
        error instanceof ApiError ? error.message : 'Lưu mốc giờ thất bại',
      );
    }
  };

  const handleToggleEnabled = async (pageId: string, enabled: boolean) => {
    try {
      const result = await setEnabledMutation.mutateAsync({ pageId, enabled });
      if (result.warning) {
        message.warning(result.warning);
      } else {
        message.success(enabled ? 'Đã bật đăng tự động' : 'Đã tắt đăng tự động');
      }
    } catch (error) {
      message.error(
        error instanceof ApiError ? error.message : 'Cập nhật thất bại',
      );
    }
  };

  const handleToggleSlot = async (slotId: string, enabled: boolean) => {
    try {
      await updateSlotMutation.mutateAsync({ slotId, body: { enabled } });
    } catch (error) {
      message.error(
        error instanceof ApiError ? error.message : 'Cập nhật thất bại',
      );
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    try {
      await deleteSlotMutation.mutateAsync(slotId);
      message.success('Đã xoá mốc giờ');
    } catch (error) {
      message.error(
        error instanceof ApiError ? error.message : 'Xoá mốc giờ thất bại',
      );
    }
  };

  const slotColumns: ColumnsType<AutoPostSlotResponse> = [
    {
      title: 'Mốc giờ',
      dataIndex: 'time',
      width: 110,
      sorter: (a, b) => a.time.localeCompare(b.time),
      defaultSortOrder: 'ascend',
      render: (v: string) => (
        <Text strong>
          <ClockCircleOutlined /> {v}
        </Text>
      ),
    },
    {
      title: 'Dạng bài (danh mục)',
      dataIndex: 'categories',
      render: (categories: string[]) => (
        <Space size={4} wrap>
          {categories.map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Loại media',
      dataIndex: 'mediaType',
      width: 120,
      render: (v: SlotMediaType) => (
        <Tag color={v === 'video' ? 'purple' : v === 'image' ? 'blue' : 'cyan'}>
          {SLOT_MEDIA_TYPE_LABELS[v]}
        </Tag>
      ),
    },
    {
      title: 'Số bài/lần',
      dataIndex: 'postCount',
      width: 100,
      align: 'center',
    },
    {
      title: 'Ảnh/bài',
      dataIndex: 'assetsPerPost',
      width: 100,
      align: 'center',
      render: (assetsPerPost: number) =>
        assetsPerPost > 1 ? (
          <Tag color="gold">{assetsPerPost} ảnh/bài</Tag>
        ) : (
          1
        ),
    },
    {
      title: 'Kho bài',
      key: 'readiness',
      width: 190,
      render: (_, slot) => <SlotReadinessCell slot={slot} />,
    },
    {
      title: 'Bot chạy hôm nay',
      key: 'lastRun',
      width: 190,
      render: (_, slot) => <SlotLastRunCell slot={slot} />,
    },
    {
      title: 'Bật',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, slot) => (
        <Switch
          size="small"
          checked={enabled}
          disabled={!canManage}
          onChange={(checked) => void handleToggleSlot(slot.id, checked)}
        />
      ),
    },
    {
      title: '',
      width: 100,
      render: (_, slot) =>
        canManage && (
          <Space>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openSlotModal(slot.pageId, slot)}
            />
            <Popconfirm
              title="Xoá mốc giờ này?"
              okText="Xoá"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDeleteSlot(slot.id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
    },
  ];

  const allPages: ManualPostPageOption[] = (configs ?? []).map((c) => ({
    pageId: c.pageId,
    pageName: c.pageName,
    isActive: c.isActive,
  }));

  const visibleConfigs = (configs ?? []).filter(
    (c) => pageFilter === undefined || c.pageId === pageFilter,
  );

  return (
    <div>
      <PageHeader
        title="Cài đặt đăng bài tự động"
        description="Phân bổ lịch đăng theo từng FB Page — config 1 lần, bot dùng suốt vòng đời, chỉ thay đổi khi cần"
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Logic bot đăng bài"
        description={BOT_LOGIC_NOTE}
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          style={{ minWidth: 260 }}
          placeholder="Lọc theo Facebook Page"
          value={pageFilter}
          onChange={(value?: string) => setPageFilter(value)}
          options={allPages.map((p) => ({
            value: p.pageId,
            label: p.isActive ? p.pageName : `${p.pageName} (tạm dừng)`,
          }))}
        />
        {canManage && (
          <Button
            type="primary"
            icon={<SendOutlined />}
            disabled={allPages.length === 0}
            onClick={() => setManualPost({ pageId: pageFilter })}
          >
            Đăng bài thủ công
          </Button>
        )}
      </Space>

      {isLoading ? (
        <Spin />
      ) : !configs || configs.length === 0 ? (
        <Empty description="Chưa có Facebook Page nào — thêm page ở mục Quản lý Page trước" />
      ) : visibleConfigs.length === 0 ? (
        <Empty description="Không có page nào khớp bộ lọc" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {visibleConfigs.map((config: AutoPostConfigResponse) => (
            <Card
              key={config.pageId}
              title={
                <Space>
                  <Text strong>{config.pageName}</Text>
                  <Tag color={config.enabled ? 'success' : 'default'}>
                    {config.enabled ? 'Đang chạy auto' : 'Tắt auto'}
                  </Tag>
                  {!config.isActive && <Tag color="warning">Page tạm dừng</Tag>}
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, fontWeight: 'normal' }}
                  >
                    {config.slots.length} mốc giờ/ngày
                  </Text>
                </Space>
              }
              extra={
                canManage && (
                  <Space>
                    <Switch
                      checked={config.enabled}
                      checkedChildren="Auto ON"
                      unCheckedChildren="Auto OFF"
                      onChange={(checked) =>
                        void handleToggleEnabled(config.pageId, checked)
                      }
                    />
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => openSlotModal(config.pageId, null)}
                    >
                      Thêm mốc giờ
                    </Button>
                    <Tooltip title="Đăng ngay 1 bài lên page này, không chờ mốc giờ">
                      <Button
                        size="small"
                        icon={<SendOutlined />}
                        disabled={!config.isActive}
                        onClick={() => setManualPost({ pageId: config.pageId })}
                      >
                        Đăng ngay
                      </Button>
                    </Tooltip>
                  </Space>
                )
              }
            >
              {config.slots.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Chưa có mốc giờ nào — thêm mốc giờ để bot bắt đầu đăng"
                />
              ) : (
                <>
                  <PageReadinessAlert slots={config.slots} />
                  <Table
                    rowKey="id"
                    size="small"
                    columns={slotColumns}
                    dataSource={config.slots}
                    pagination={false}
                  />
                </>
              )}
            </Card>
          ))}
        </Space>
      )}

      <SlotFormModal
        open={!!slotModal}
        isEdit={!!slotModal?.slot}
        pageId={slotModal?.pageId}
        droppedCategories={slotModal?.slot?.categories.slice(1)}
        form={form}
        confirmLoading={
          createSlotMutation.isPending || updateSlotMutation.isPending
        }
        onCancel={closeSlotModal}
        onFinish={(values) => void handleSlotSubmit(values)}
      />

      <ManualPostModal
        open={manualPost !== null}
        pages={allPages}
        defaultPageId={manualPost?.pageId}
        onClose={() => setManualPost(null)}
      />
    </div>
  );
}

/* ──────────────────── Tình trạng kho & nhật ký cron ──────────────────── */

/**
 * Cảnh báo gộp ở đầu mỗi page: tới giờ mà kho trống thì Bot im lặng bỏ qua, nên
 * phải nói trước ngay tại chỗ admin cấu hình, kèm đúng việc cần làm để sửa.
 */
function PageReadinessAlert({ slots }: { slots: AutoPostSlotResponse[] }) {
  const blocked = slots.filter(
    (slot) =>
      slot.enabled &&
      (slot.readiness.status === 'NO_ASSIGNMENT' ||
        slot.readiness.status === 'NO_MATCH'),
  );
  if (blocked.length === 0) return null;

  const times = blocked.map((slot) => slot.time).join(', ');
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      message={`${blocked.length} mốc giờ sẽ bị bỏ qua vì không có bài phù hợp: ${times}`}
      description={blocked[0].readiness.message}
    />
  );
}

const READINESS_COLORS: Record<SlotReadinessStatus, string> = {
  READY: 'green',
  NO_ASSIGNMENT: 'red',
  NO_MATCH: 'orange',
  PAUSED: 'default',
};

const READINESS_LABELS: Record<SlotReadinessStatus, string> = {
  READY: 'Sẵn sàng',
  NO_ASSIGNMENT: 'Chưa phân bổ bài',
  NO_MATCH: 'Không khớp danh mục',
  PAUSED: 'Đang tắt',
};

/**
 * Cho biết mốc giờ này tới giờ có đăng được không **trước khi** tới giờ — chứ
 * không để admin ngồi đợi rồi mới phát hiện kho trống.
 */
function SlotReadinessCell({ slot }: { slot: AutoPostSlotResponse }) {
  const { status, message } = slot.readiness;

  return (
    <Tooltip title={message ?? undefined}>
      <Space direction="vertical" size={0}>
        <Tag color={READINESS_COLORS[status]} style={{ marginInlineEnd: 0 }}>
          {status === 'READY'
            ? `${slot.readyCount} bài sẵn sàng`
            : READINESS_LABELS[status]}
        </Tag>
        {status !== 'READY' && status !== 'PAUSED' && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            Bot sẽ bỏ qua mốc này
          </Text>
        )}
      </Space>
    </Tooltip>
  );
}

/** Lần cron gần nhất trong ngày — "không có dòng nào" nghĩa là chưa tới lượt chạy. */
function SlotLastRunCell({ slot }: { slot: AutoPostSlotResponse }) {
  const run = slot.lastRun;
  if (run === null) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        Chưa chạy hôm nay
      </Text>
    );
  }
  if (run.status === 'SKIPPED') {
    return (
      <Tooltip title="Bot có chạy đúng giờ nhưng không tìm được bài phù hợp">
        <Tag color="orange">
          {run.runTime} · bỏ qua
          {run.skipReason === 'NO_CONTENT' ? ' (hết bài)' : ''}
        </Tag>
      </Tooltip>
    );
  }
  if (run.status === 'ERROR') {
    return (
      <Tooltip title={run.errorMessage ?? undefined}>
        <Tag color="red">{run.runTime} · lỗi</Tag>
      </Tooltip>
    );
  }
  return (
    <Tag color="green">
      {run.runTime} · tạo {run.jobCreatedCount} job
    </Tag>
  );
}

/* ───────────────────────── Form modal dùng chung ───────────────────────── */

/**
 * Một dòng danh mục trong dropdown: tên bên trái, kho bài của page bên phải.
 * Danh mục hết bài vẫn chọn được nhưng làm mờ — chọn xong Bot sẽ ra `NO_MATCH`.
 */
function CategoryStockOption({ item }: { item: CategoryOptionWithStock }) {
  return (
    <Space
      style={{ width: '100%', justifyContent: 'space-between' }}
      styles={{ item: { minWidth: 0 } }}
    >
      <Text type={item.isEmpty ? 'secondary' : undefined} ellipsis>
        {item.category}
      </Text>
      <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {item.isEmpty
          ? 'hết bài'
          : `${item.imageCount} ảnh · ${item.videoCount} video`}
      </Text>
    </Space>
  );
}

interface SlotFormModalProps {
  open: boolean;
  isEdit: boolean;
  /** Page đang cấu hình — dùng để đếm kho bài theo danh mục. Bản mock: bỏ trống. */
  pageId?: string;
  /**
   * Danh mục thừa của mốc giờ cũ (khai từ hồi còn cho chọn nhiều). Lưu lại là
   * mất — phải nói trước chứ không im lặng cắt bớt cấu hình của người ta.
   */
  droppedCategories?: string[];
  form: ReturnType<typeof Form.useForm<SlotFormValues>>[0];
  confirmLoading?: boolean;
  onCancel: () => void;
  onFinish: (values: SlotFormValues) => void;
}

function SlotFormModal({
  open,
  isEdit,
  pageId,
  droppedCategories = [],
  form,
  confirmLoading,
  onCancel,
  onFinish,
}: SlotFormModalProps) {
  // Danh mục lấy từ kho content (không còn hardcode); DB rỗng thì rơi về danh sách mồi.
  const { data: categorySuggestions } = useCategorySuggestions({
    enabled: !env.useMock,
  });
  // Kho bài **của riêng page này**: chỉ hỏi khi modal đang mở để đóng/mở lại là
  // thấy số mới nhất, không giữ số cũ từ lần cấu hình trước.
  const { data: availability, isFetching: loadingStock } =
    useCategoryAvailability(open && !env.useMock ? pageId : undefined);
  const categoryOptions = buildCategoryOptionsWithStock(
    mergeCategoryOptions(categorySuggestions),
    availability,
  );
  const showStock = availability !== undefined;

  // Album chỉ ghép được ảnh (Graph API không cho nhiều video / trộn ảnh-video).
  // Đổi sang video/tất cả ⇒ ép ô số ảnh về 1 luôn, để form không gửi lên cấu hình
  // mà backend chắc chắn từ chối.
  const mediaType = Form.useWatch('mediaType', form);
  const isImageOnly = mediaType === 'image';
  useEffect(() => {
    if (!isImageOnly && (form.getFieldValue('assetsPerPost') ?? 1) > 1) {
      form.setFieldValue('assetsPerPost', 1);
    }
  }, [form, isImageOnly]);

  // Gõ tên chưa từng có ⇒ dòng đầu dropdown là "＋ Thêm ..." (cùng cơ chế với
  // `CategorySelect` ở form content — danh mục không có bảng riêng, gõ là có).
  const [search, setSearch] = useState('');
  const typed = normalizeCategory(search);
  const typedNewCategory =
    typed !== null &&
    !categoryOptions.some(
      (c) => c.category.toLowerCase() === typed.toLowerCase(),
    )
      ? typed
      : null;

  return (
    <Modal
      title={isEdit ? 'Sửa mốc giờ đăng' : 'Thêm mốc giờ đăng'}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={isEdit ? 'Cập nhật' : 'Thêm'}
      confirmLoading={confirmLoading}
      width={480}
    >
      {droppedCategories.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Mốc giờ này đang khai nhiều dạng bài"
          description={`Mỗi mốc giờ giờ chỉ giữ 1 dạng. Lưu lại sẽ bỏ: ${droppedCategories.join(', ')} — muốn giữ thì thêm mốc giờ khác (lệch phút) cho từng dạng.`}
        />
      )}

      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="time"
          label="Mốc giờ trong ngày"
          rules={[{ required: true, message: 'Chọn giờ đăng' }]}
          extra="Giờ Việt Nam (Asia/Ho_Chi_Minh)"
        >
          <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="category"
          label="Dạng bài được đăng (danh mục)"
          rules={[{ required: true, message: 'Chọn 1 dạng bài' }]}
          extra={
            showStock
              ? 'Bên phải là bài đã phân bổ cho page, đã duyệt và chưa đăng.'
              : 'Mỗi mốc giờ 1 dạng bài — muốn đăng nhiều dạng thì thêm mốc giờ khác.'
          }
        >
          <Select
            showSearch
            allowClear
            loading={loadingStock}
            placeholder="Chọn hoặc gõ tên dạng bài mới"
            searchValue={search}
            onSearch={setSearch}
            onSelect={() => setSearch('')}
            onBlur={() => setSearch('')}
            filterOption={(input, option) => {
              const needle = normalizeCategory(input);
              if (needle === null || option === undefined) return true;
              // Dòng "＋ Thêm ..." luôn hiện, không bị chính chuỗi vừa gõ lọc mất.
              return (
                option.value === typedNewCategory ||
                option.value.toLowerCase().includes(needle.toLowerCase())
              );
            }}
            options={[
              ...(typedNewCategory === null
                ? []
                : [
                    {
                      value: typedNewCategory,
                      label: `＋ Thêm "${typedNewCategory}"`,
                    },
                  ]),
              ...categoryOptions.map((c) => ({
                value: c.category,
                label: c.category,
              })),
            ]}
            // Chỉ đổi cách vẽ **dòng trong dropdown** — thẻ đã chọn vẫn là tên
            // danh mục trơn, không dính con số.
            optionRender={(option) => {
              const item = categoryOptions.find(
                (c) => c.category === option.value,
              );
              if (item === undefined || !showStock) return option.label;
              return <CategoryStockOption item={item} />;
            }}
          />
        </Form.Item>

        <Form.Item
          name="mediaType"
          label="Loại media"
          rules={[{ required: true }]}
        >
          <Select
            options={(Object.keys(SLOT_MEDIA_TYPE_LABELS) as SlotMediaType[]).map(
              (v) => ({ value: v, label: SLOT_MEDIA_TYPE_LABELS[v] }),
            )}
          />
        </Form.Item>

        <Form.Item
          name="postCount"
          label="Số bài mỗi lần đăng"
          rules={[{ required: true }]}
        >
          <InputNumber
            min={1}
            max={MAX_POST_PER_SLOT}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          name="assetsPerPost"
          label="Số ảnh/video trong 1 bài"
          rules={[{ required: true }]}
          extra={
            isImageOnly
              ? `Để 1 thì mỗi bài 1 ảnh như cũ. Lớn hơn 1 ⇒ Bot gom đúng số ảnh đó vào MỘT bài, lấy theo thứ tự trước → sau (bài duyệt sớm đăng trước). Tối đa ${MAX_ASSETS_PER_POST} ảnh/bài.`
              : 'Chỉ ảnh mới ghép được nhiều tài nguyên vào 1 bài — Facebook không cho ghép video. Chọn "Loại media" là Ảnh để bật ô này.'
          }
        >
          <InputNumber
            min={1}
            max={MAX_ASSETS_PER_POST}
            disabled={!isImageOnly}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ───────────────────────────── Mock (giữ nguyên) ───────────────────────────── */

function MockAutoPostSettingsPage() {
  const user = useAuthUser();
  const {
    autoPostConfigs,
    setPageAutoPostEnabled,
    addSlot,
    updateSlot,
    removeSlot,
  } = useMockData();
  const [slotModal, setSlotModal] = useState<{
    pageId: string;
    slot: AutoPostSlot | null;
  } | null>(null);
  const [pageFilter, setPageFilter] = useState<string | undefined>();
  const [form] = Form.useForm<SlotFormValues>();

  const canManage = can(user.role, 'autopost:manage');
  const activePages = mockPages.filter((p) => p.isActive);
  const visiblePages = activePages.filter(
    (p) => pageFilter === undefined || p.id === pageFilter,
  );

  const openSlotModal = (pageId: string, slot: AutoPostSlot | null) => {
    setSlotModal({ pageId, slot });
    if (slot) {
      form.setFieldsValue({
        time: dayjs(slot.time, 'HH:mm'),
        category: slot.categories[0] ?? '',
        mediaType: slot.mediaType,
        postCount: slot.postCount,
        assetsPerPost: slot.assetsPerPost,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ mediaType: 'all', postCount: 1, assetsPerPost: 1 });
    }
  };

  const handleSlotSubmit = (values: SlotFormValues) => {
    if (!slotModal) return;
    const payload = {
      time: values.time.format('HH:mm'),
      categories: [values.category],
      mediaType: values.mediaType,
      postCount: values.postCount,
      assetsPerPost: values.assetsPerPost,
    };
    if (slotModal.slot) {
      updateSlot(slotModal.slot.id, payload);
      message.success('Đã cập nhật mốc giờ (mock)');
    } else {
      addSlot({
        id: `s${Date.now()}`,
        pageId: slotModal.pageId,
        enabled: true,
        ...payload,
      });
      message.success('Đã thêm mốc giờ đăng (mock)');
    }
    setSlotModal(null);
    form.resetFields();
  };

  const slotColumns = (pageId: string): ColumnsType<AutoPostSlot> => [
    {
      title: 'Mốc giờ',
      dataIndex: 'time',
      width: 110,
      sorter: (a, b) => a.time.localeCompare(b.time),
      defaultSortOrder: 'ascend',
      render: (v) => (
        <Text strong>
          <ClockCircleOutlined /> {v}
        </Text>
      ),
    },
    {
      title: 'Dạng bài (danh mục)',
      dataIndex: 'categories',
      render: (categories: string[]) => (
        <Space size={4} wrap>
          {categories.map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Loại media',
      dataIndex: 'mediaType',
      width: 120,
      render: (v: SlotMediaType) => (
        <Tag color={v === 'video' ? 'purple' : v === 'image' ? 'blue' : 'cyan'}>
          {SLOT_MEDIA_TYPE_LABELS[v]}
        </Tag>
      ),
    },
    {
      title: 'Số bài/lần',
      dataIndex: 'postCount',
      width: 100,
      align: 'center',
    },
    {
      title: 'Ảnh/bài',
      dataIndex: 'assetsPerPost',
      width: 100,
      align: 'center',
      render: (assetsPerPost: number) =>
        assetsPerPost > 1 ? (
          <Tag color="gold">{assetsPerPost} ảnh/bài</Tag>
        ) : (
          1
        ),
    },
    {
      title: 'Bật',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, slot) => (
        <Switch
          size="small"
          checked={enabled}
          disabled={!canManage}
          onChange={(checked) => updateSlot(slot.id, { enabled: checked })}
        />
      ),
    },
    {
      title: '',
      width: 100,
      render: (_, slot) =>
        canManage && (
          <Space>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openSlotModal(pageId, slot)}
            />
            <Popconfirm
              title="Xoá mốc giờ này?"
              okText="Xoá"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                removeSlot(slot.id);
                message.success('Đã xoá mốc giờ (mock)');
              }}
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
        title="Cài đặt đăng bài tự động"
        description="Phân bổ lịch đăng theo từng FB Page — config 1 lần, bot dùng suốt vòng đời, chỉ thay đổi khi cần"
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Logic bot đăng bài"
        description={BOT_LOGIC_NOTE}
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          style={{ minWidth: 260 }}
          placeholder="Lọc theo Facebook Page"
          value={pageFilter}
          onChange={(value?: string) => setPageFilter(value)}
          options={activePages.map((p) => ({
            value: p.id,
            label: p.pageName,
          }))}
        />
        {/* Đăng thật cần API — chế độ mock không gọi Facebook (ADR-005). */}
        <Tooltip title="Đăng bài thủ công chỉ chạy khi tắt chế độ mock (VITE_USE_MOCK=false)">
          <Button type="primary" icon={<SendOutlined />} disabled>
            Đăng bài thủ công
          </Button>
        </Tooltip>
      </Space>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {visiblePages.map((page) => {
          const config = autoPostConfigs.find((c) => c.pageId === page.id);
          const enabled = config?.enabled ?? false;
          const slots = config?.slots ?? [];

          return (
            <Card
              key={page.id}
              title={
                <Space>
                  <Text strong>{page.pageName}</Text>
                  <Tag color={enabled ? 'success' : 'default'}>
                    {enabled ? 'Đang chạy auto' : 'Tắt auto'}
                  </Tag>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, fontWeight: 'normal' }}
                  >
                    {slots.length} mốc giờ/ngày
                  </Text>
                </Space>
              }
              extra={
                canManage && (
                  <Space>
                    <Switch
                      checked={enabled}
                      checkedChildren="Auto ON"
                      unCheckedChildren="Auto OFF"
                      onChange={(checked) =>
                        setPageAutoPostEnabled(page.id, checked)
                      }
                    />
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => openSlotModal(page.id, null)}
                    >
                      Thêm mốc giờ
                    </Button>
                  </Space>
                )
              }
            >
              {slots.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Chưa có mốc giờ nào — thêm mốc giờ để bot bắt đầu đăng"
                />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  columns={slotColumns(page.id)}
                  dataSource={slots}
                  pagination={false}
                />
              )}
            </Card>
          );
        })}
      </Space>

      <SlotFormModal
        open={!!slotModal}
        isEdit={!!slotModal?.slot}
        droppedCategories={slotModal?.slot?.categories.slice(1)}
        form={form}
        onCancel={() => {
          setSlotModal(null);
          form.resetFields();
        }}
        onFinish={handleSlotSubmit}
      />
    </div>
  );
}
