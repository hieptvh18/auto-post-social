import { CalendarOutlined, LinkOutlined, RobotOutlined } from '@ant-design/icons';
import {
  Card,
  Col,
  DatePicker,
  Divider,
  Row,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { useMockData } from '../contexts/MockDataContext';
import type { PublishJob, PublishStatus } from '../types';
import {
  BOT_PUBLISHER,
  MEDIA_TYPE_LABELS,
  STATUS_LABELS,
} from '../utils/constants';

const { Text } = Typography;

export default function TimelinePage() {
  const { publishJobs } = useMockData();
  const [selectedDate, setSelectedDate] = useState(dayjs('2026-07-16'));
  const [pageFilter, setPageFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<PublishStatus | undefined>();

  const dayJobs = useMemo(() => {
    return publishJobs
      .filter((j) => dayjs(j.scheduleTime).isSame(selectedDate, 'day'))
      .filter((j) => !pageFilter || j.facebookPageId === pageFilter)
      .filter((j) => !statusFilter || j.status === statusFilter)
      .sort((a, b) => dayjs(a.scheduleTime).unix() - dayjs(b.scheduleTime).unix());
  }, [publishJobs, selectedDate, pageFilter, statusFilter]);

  const groupedByHour = useMemo(() => {
    const groups: Record<string, PublishJob[]> = {};
    dayJobs.forEach((job) => {
      const hour = dayjs(job.scheduleTime).format('HH:00');
      if (!groups[hour]) groups[hour] = [];
      groups[hour].push(job);
    });
    return groups;
  }, [dayJobs]);

  return (
    <div>
      <PageHeader
        title="Lịch đăng bài"
        description="Timeline các bài bot đã/sẽ đăng theo Cài đặt đăng bài tự động"
      />

      <Row gutter={24}>
        <Col xs={24} lg={8}>
          <Card title="Chọn ngày & bộ lọc">
            <DatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              style={{ width: '100%', marginBottom: 12 }}
            />

            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Select
                placeholder="Kênh (FB Page)"
                allowClear
                style={{ width: '100%' }}
                value={pageFilter}
                onChange={setPageFilter}
                options={mockPages.map((p) => ({ value: p.id, label: p.pageName }))}
              />
              <Select
                placeholder="Trạng thái"
                allowClear
                style={{ width: '100%' }}
                value={statusFilter}
                onChange={setStatusFilter}
                options={(Object.keys(STATUS_LABELS) as PublishStatus[]).map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                }))}
              />
              <Select
                style={{ width: '100%' }}
                value="bot"
                disabled
                options={[
                  {
                    value: 'bot',
                    label: (
                      <>
                        <RobotOutlined /> Người đăng: {BOT_PUBLISHER} (cố định)
                      </>
                    ),
                  },
                ]}
              />
            </Space>

            <Divider style={{ margin: '16px 0' }} />

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
              <Text type="secondary">Không có bài nào khớp bộ lọc trong ngày này</Text>
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
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Space wrap>
                                <Tag color="geekblue">{job.pageName}</Tag>
                                <StatusTag status={job.status} />
                                {job.category && <Tag>{job.category}</Tag>}
                                {job.mediaType && (
                                  <Tag color={job.mediaType === 'video' ? 'purple' : 'blue'}>
                                    {MEDIA_TYPE_LABELS[job.mediaType]}
                                  </Tag>
                                )}
                              </Space>
                              <Text strong>{job.contentTitle}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {job.caption.slice(0, 80)}
                                {job.caption.length > 80 ? '...' : ''}
                              </Text>
                              {job.hashtags && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {job.hashtags}
                                </Text>
                              )}
                              <Space size={12} wrap>
                                {job.facebookPostId && (
                                  <a
                                    href={`https://facebook.com/${job.facebookPostId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 12 }}
                                  >
                                    <LinkOutlined /> Xem bài trên Facebook
                                  </a>
                                )}
                                {job.driveUrl && (
                                  <a
                                    href={job.driveUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 12 }}
                                  >
                                    <LinkOutlined /> Media trên Drive
                                  </a>
                                )}
                              </Space>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Job #{job.id} · <RobotOutlined /> {job.createdBy} ·{' '}
                                {dayjs(job.scheduleTime).format('HH:mm')}
                                {job.publishedAt &&
                                  ` · đăng lúc ${dayjs(job.publishedAt).format('HH:mm')}`}
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
    </div>
  );
}
