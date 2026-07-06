import { CalendarOutlined } from '@ant-design/icons';
import { Card, Col, DatePicker, Row, Space, Tag, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { useMockData } from '../contexts/MockDataContext';
import type { PublishJob } from '../types';

const { Text } = Typography;

export default function PublishSchedulerPage() {
  const { publishJobs } = useMockData();
  const [selectedDate, setSelectedDate] = useState(dayjs('2026-07-05'));

  const dayJobs = useMemo(() => {
    return publishJobs
      .filter((j) => dayjs(j.scheduleTime).isSame(selectedDate, 'day'))
      .sort((a, b) => dayjs(a.scheduleTime).unix() - dayjs(b.scheduleTime).unix());
  }, [publishJobs, selectedDate]);

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
        description="Xem timeline các bài đã lên lịch — tạo lịch mới tại Publisher Center"
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
                                {job.caption.slice(0, 80)}
                                {job.caption.length > 80 ? '...' : ''}
                              </Text>
                              {job.hashtags && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {job.hashtags}
                                </Text>
                              )}
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
    </div>
  );
}
