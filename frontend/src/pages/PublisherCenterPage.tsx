import { CalendarOutlined, EyeOutlined } from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { ContentStatusTag } from '../components/common/StatusTag';
import { useAuth } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import type { ContentAsset, PublishJob } from '../types';
import { MEDIA_TYPE_LABELS } from '../utils/constants';
import { can } from '../utils/permissions';

const { Text, Paragraph } = Typography;

export default function PublisherCenterPage() {
  const { user } = useAuth();
  const { content, publishJobs, addPublishJob } = useMockData();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ContentAsset | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ContentAsset | null>(null);
  const [form] = Form.useForm();

  const activePages = mockPages.filter((p) => p.isActive);
  const approved = useMemo(() => {
    return content
      .filter((c) => c.status === 'APPROVED')
      .filter(
        (c) =>
          !search ||
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase()),
      );
  }, [content, search]);

  const scheduledContentIds = useMemo(
    () => new Set(publishJobs.filter((j) => !['CANCELLED', 'FAILED'].includes(j.status)).map((j) => j.contentAssetId)),
    [publishJobs],
  );

  const handleSchedule = (values: {
    facebookPageIds: string[];
    caption: string;
    hashtags?: string;
    scheduleTime: dayjs.Dayjs;
  }) => {
    if (!scheduleTarget) return;
    const pageIds = values.facebookPageIds ?? [];
    if (pageIds.length === 0) {
      message.error('Chọn ít nhất một Facebook Page');
      return;
    }

    const baseId = Date.now();
    pageIds.forEach((pageId, index) => {
      const page = activePages.find((p) => p.id === pageId);
      if (!page) return;

      const newJob: PublishJob = {
        id: String(baseId + index),
        contentAssetId: scheduleTarget.id,
        contentTitle: scheduleTarget.title,
        facebookPageId: page.id,
        pageName: page.pageName,
        caption: values.caption,
        hashtags: values.hashtags,
        scheduleTime: values.scheduleTime.toISOString(),
        status: 'QUEUED',
        publishedAt: null,
        errorMessage: null,
        attempts: 0,
        facebookPostId: null,
        createdBy: user.email,
      };

      addPublishJob(newJob);
    });

    setScheduleTarget(null);
    form.resetFields();
    message.success(
      pageIds.length === 1
        ? 'Đã lên lịch đăng bài — xem tại Lịch đăng bài'
        : `Đã lên lịch ${pageIds.length} fanpage — xem tại Lịch đăng bài`,
    );
  };

  const columns: ColumnsType<ContentAsset> = [
    {
      title: 'ID',
      dataIndex: 'code',
      width: 100,
      render: (v) => <Text code>{v}</Text>,
    },
    { title: 'Tiêu đề tài nguyên', dataIndex: 'title', ellipsis: true },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 110,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: 'Media',
      dataIndex: 'mediaType',
      width: 90,
      render: (v) => <Tag>{MEDIA_TYPE_LABELS[v as 'image' | 'video']}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (s) => <ContentStatusTag status={s} />,
    },
    {
      title: 'Đã lên lịch',
      width: 110,
      render: (_, record) =>
        scheduledContentIds.has(record.id) ? (
          <Tag color="blue">Có</Tag>
        ) : (
          <Tag>Chưa</Tag>
        ),
    },
    {
      title: '',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EyeOutlined />} onClick={() => setSelected(record)} />
          {can(user.role, 'publish:schedule') && (
            <Button
              size="small"
              type="primary"
              icon={<CalendarOutlined />}
              onClick={() => {
                setScheduleTarget(record);
                form.setFieldsValue({
                  caption: '',
                  hashtags: '',
                  facebookPageIds: [],
                  scheduleTime: dayjs().add(1, 'hour'),
                });
              }}
            >
              Lên lịch đăng
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Publisher Center"
        description="Đội đăng bài — chọn tài nguyên đã duyệt, viết caption, hashtag và chọn giờ đăng"
      />

      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Tìm tài nguyên đã duyệt..."
          allowClear
          style={{ width: 320 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Text type="secondary">{approved.length} tài nguyên sẵn sàng đăng</Text>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={approved}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
        locale={{ emptyText: 'Chưa có tài nguyên được duyệt' }}
      />

      <Drawer
        title={selected?.title}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={560}
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {selected.thumbnailUrl && (
              <Image src={selected.thumbnailUrl} alt={selected.title} style={{ borderRadius: 8 }} />
            )}
            <div>
              <Text type="secondary">Mô tả tài nguyên (từ Content)</Text>
              <Paragraph>{selected.description}</Paragraph>
            </div>
            <div>
              <Text type="secondary">Duyệt bởi</Text>
              <br />
              <Text>{selected.approvedBy}</Text>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title={`Lên lịch đăng — ${scheduleTarget?.code}`}
        open={!!scheduleTarget}
        onCancel={() => {
          setScheduleTarget(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Lên lịch"
        width={600}
      >
        {scheduleTarget && (
          <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 16 }}>
            <Text strong>{scheduleTarget.title}</Text>
            <Text type="secondary">{scheduleTarget.description}</Text>
            <Tag>{scheduleTarget.category}</Tag>
          </Space>
        )}

        <Form form={form} layout="vertical" onFinish={handleSchedule}>
          <Form.Item
            name="caption"
            label="Caption bài đăng"
            rules={[{ required: true, message: 'Nhập caption cho Facebook' }]}
          >
            <Input.TextArea rows={4} placeholder="Nội dung caption hiển thị trên Facebook..." />
          </Form.Item>

          <Form.Item name="hashtags" label="Hashtag">
            <Input placeholder="#sale #flashsale #brand" />
          </Form.Item>

          <Form.Item
            name="facebookPageIds"
            label="Facebook Page"
            rules={[{ required: true, message: 'Chọn ít nhất một fanpage', type: 'array', min: 1 }]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Chọn một hoặc nhiều fanpage"
              options={activePages.map((p) => ({ value: p.id, label: p.pageName }))}
              maxTagCount="responsive"
            />
          </Form.Item>

          <Form.Item
            name="scheduleTime"
            label="Giờ đăng"
            rules={[{ required: true }]}
          >
            <DatePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: '100%' }}
              disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
