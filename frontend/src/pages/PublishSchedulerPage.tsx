import { CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { mockContent, mockPages, mockPublishJobs } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { useAuth } from '../contexts/AuthContext';
import type { PublishJob } from '../types';
import { can } from '../utils/permissions';

const { Text } = Typography;

export default function PublishSchedulerPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(mockPublishJobs);
  const [selectedDate, setSelectedDate] = useState(dayjs('2026-07-05'));
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const approvedContent = mockContent.filter((c) => c.approved);
  const activePages = mockPages.filter((p) => p.isActive);

  const dayJobs = useMemo(() => {
    return jobs
      .filter((j) => dayjs(j.scheduledAt).isSame(selectedDate, 'day'))
      .sort((a, b) => dayjs(a.scheduledAt).unix() - dayjs(b.scheduledAt).unix());
  }, [jobs, selectedDate]);

  const handleCreate = (values: {
    contentAssetId: string;
    facebookPageId: string;
    scheduledAt: dayjs.Dayjs;
  }) => {
    const content = approvedContent.find((c) => c.id === values.contentAssetId)!;
    const page = activePages.find((p) => p.id === values.facebookPageId)!;
    const newJob: PublishJob = {
      id: String(Date.now()),
      contentAssetId: content.id,
      contentTitle: content.title,
      facebookPageId: page.id,
      pageName: page.pageName,
      scheduledAt: values.scheduledAt.toISOString(),
      status: 'QUEUED',
      publishedAt: null,
      errorMessage: null,
      attempts: 0,
      facebookPostId: null,
      createdBy: user!.email,
    };
    setJobs((prev) => [...prev, newJob]);
    setModalOpen(false);
    form.resetFields();
    message.success('Đã tạo lịch đăng bài (mock)');
  };

  const groupedByHour = useMemo(() => {
    const groups: Record<string, PublishJob[]> = {};
    dayJobs.forEach((job) => {
      const hour = dayjs(job.scheduledAt).format('HH:00');
      if (!groups[hour]) groups[hour] = [];
      groups[hour].push(job);
    });
    return groups;
  }, [dayJobs]);

  return (
    <div>
      <PageHeader
        title="Lịch đăng bài"
        description="Calendar view — xem và tạo lịch publish"
        extra={
          can(user!.role, 'publish:schedule') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalOpen(true)}
            >
              Tạo lịch mới
            </Button>
          )
        }
      />

      <Row gutter={24}>
        <Col xs={24} lg={8}>
          <Card title="Chọn ngày">
            <DatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              style={{ width: '100%', marginBottom: 16 }}
            />
            <div style={{ textAlign: 'center' }}>
              <CalendarOutlined style={{ fontSize: 48, color: '#1677ff' }} />
              <div style={{ marginTop: 8 }}>
                <Text strong style={{ fontSize: 18 }}>
                  {selectedDate.format('dddd, DD/MM/YYYY')}
                </Text>
              </div>
              <Tag color="blue" style={{ marginTop: 8 }}>
                {dayJobs.length} bài trong ngày
              </Tag>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title={`Timeline — ${selectedDate.format('DD/MM/YYYY')}`}>
            {Object.keys(groupedByHour).length === 0 ? (
              <Text type="secondary">Không có bài nào trong ngày này</Text>
            ) : (
              <Timeline
                items={Object.entries(groupedByHour).map(([hour, hourJobs]) => ({
                  color: 'blue',
                  children: (
                    <div key={hour}>
                      <Text strong style={{ fontSize: 16 }}>
                        {hour}
                      </Text>
                      <div style={{ marginTop: 8 }}>
                        {hourJobs.map((job) => (
                          <Card
                            key={job.id}
                            size="small"
                            style={{ marginBottom: 8 }}
                            styles={{ body: { padding: '12px 16px' } }}
                          >
                            <Space direction="vertical" size={4}>
                              <Space>
                                <Tag color="geekblue">{job.pageName}</Tag>
                                <StatusTag status={job.status} />
                              </Space>
                              <Text strong>{job.contentTitle}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Job #{job.id} · {job.createdBy}
                              </Text>
                            </Space>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="Tạo lịch đăng bài"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Tạo lịch"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="contentAssetId"
            label="Content"
            rules={[{ required: true }]}
          >
            <Select
              placeholder="Chọn content đã duyệt"
              options={approvedContent.map((c) => ({
                value: c.id,
                label: `${c.sheetRowId} — ${c.title}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="facebookPageId"
            label="Facebook Page"
            rules={[{ required: true }]}
          >
            <Select
              placeholder="Chọn page"
              options={activePages.map((p) => ({
                value: p.id,
                label: p.pageName,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="scheduledAt"
            label="Thời gian đăng"
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
