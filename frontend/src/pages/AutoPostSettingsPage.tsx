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
import { useState } from 'react';
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
  useCreateSlot,
  useDeleteSlot,
  useSetAutoPostEnabled,
  useUpdateSlot,
} from '../hooks/useAutoPostConfigs';
import type {
  AutoPostConfigResponse,
  AutoPostSlot,
  AutoPostSlotResponse,
  SlotMediaType,
} from '../types';
import { SLOT_MEDIA_TYPE_LABELS } from '../utils/constants';
import { mergeCategoryOptions } from '../utils/categories';
import { useCategorySuggestions } from '../hooks/useContentAssets';
import { can } from '../utils/permissions';

const { Text } = Typography;

/** Khớp `MAX_POST_PER_SLOT` mặc định của backend — vượt ngưỡng backend trả 400. */
const MAX_POST_PER_SLOT = 20;

interface SlotFormValues {
  time: dayjs.Dayjs;
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
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
        categories: slot.categories,
        mediaType: slot.mediaType,
        postCount: slot.postCount,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ mediaType: 'all', postCount: 1 });
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
      categories: values.categories,
      mediaType: values.mediaType,
      postCount: values.postCount,
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
                <Table
                  rowKey="id"
                  size="small"
                  columns={slotColumns}
                  dataSource={config.slots}
                  pagination={false}
                />
              )}
            </Card>
          ))}
        </Space>
      )}

      <SlotFormModal
        open={!!slotModal}
        isEdit={!!slotModal?.slot}
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

/* ───────────────────────── Form modal dùng chung ───────────────────────── */

interface SlotFormModalProps {
  open: boolean;
  isEdit: boolean;
  form: ReturnType<typeof Form.useForm<SlotFormValues>>[0];
  confirmLoading?: boolean;
  onCancel: () => void;
  onFinish: (values: SlotFormValues) => void;
}

function SlotFormModal({
  open,
  isEdit,
  form,
  confirmLoading,
  onCancel,
  onFinish,
}: SlotFormModalProps) {
  // Danh mục lấy từ kho content (không còn hardcode); DB rỗng thì rơi về danh sách mồi.
  const { data: categorySuggestions } = useCategorySuggestions({
    enabled: !env.useMock,
  });
  const categoryOptions = mergeCategoryOptions(categorySuggestions);

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
          name="categories"
          label="Dạng bài được đăng (danh mục)"
          rules={[{ required: true, message: 'Chọn ít nhất 1 dạng bài' }]}
        >
          <Select
            mode="tags"
            allowClear
            placeholder="Ví dụ: Cơ xương khớp, Thăm khám"
            options={categoryOptions.map((c) => ({ value: c, label: c }))}
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
        categories: slot.categories,
        mediaType: slot.mediaType,
        postCount: slot.postCount,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ mediaType: 'all', postCount: 1 });
    }
  };

  const handleSlotSubmit = (values: SlotFormValues) => {
    if (!slotModal) return;
    const payload = {
      time: values.time.format('HH:mm'),
      categories: values.categories,
      mediaType: values.mediaType,
      postCount: values.postCount,
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
