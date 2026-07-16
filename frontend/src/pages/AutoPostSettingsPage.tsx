import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
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
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import type { AutoPostSlot, SlotMediaType } from '../types';
import { CONTENT_CATEGORIES, SLOT_MEDIA_TYPE_LABELS } from '../utils/constants';
import { can } from '../utils/permissions';

const { Text } = Typography;

interface SlotFormValues {
  time: dayjs.Dayjs;
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
}

export default function AutoPostSettingsPage() {
  const { user } = useAuth();
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
  const [form] = Form.useForm<SlotFormValues>();

  const canManage = can(user.role, 'autopost:manage');
  const activePages = mockPages.filter((p) => p.isActive);

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
        description="Đến mỗi mốc giờ, cron quét lịch và lấy bài ở trạng thái Đã duyệt thuộc Dạng đã chọn, được phân bổ cho page đó. Mỗi bài chỉ được đăng 1 lần trên 1 page (unique content × page). Thứ tự lấy theo thời gian duyệt (updated_at) — bài duyệt sớm đăng trước."
      />

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {activePages.map((page) => {
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
                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
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
                      onChange={(checked) => setPageAutoPostEnabled(page.id, checked)}
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

      <Modal
        title={slotModal?.slot ? 'Sửa mốc giờ đăng' : 'Thêm mốc giờ đăng'}
        open={!!slotModal}
        onCancel={() => {
          setSlotModal(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText={slotModal?.slot ? 'Cập nhật' : 'Thêm'}
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleSlotSubmit}>
          <Form.Item
            name="time"
            label="Mốc giờ trong ngày"
            rules={[{ required: true, message: 'Chọn giờ đăng' }]}
          >
            <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="categories"
            label="Dạng bài được đăng (danh mục)"
            rules={[{ required: true, message: 'Chọn ít nhất 1 dạng bài' }]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Ví dụ: Cơ xương khớp, Thăm khám"
              options={CONTENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>

          <Form.Item name="mediaType" label="Loại media" rules={[{ required: true }]}>
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
            <InputNumber min={1} max={5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
