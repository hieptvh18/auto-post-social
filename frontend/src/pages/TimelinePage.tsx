import {
  CalendarOutlined,
  EditOutlined,
  LinkOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Divider,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { env } from '../config/env';
import { useMockData } from '../contexts/MockDataContext';
import { usePages } from '../hooks/usePages';
import { usePublishSchedule } from '../hooks/usePublishSchedule';
import type {
  PublishJob,
  PublishStatus,
  ScheduleItem,
  ScheduleJob,
} from '../types';
import {
  BOT_PUBLISHER,
  MEDIA_TYPE_LABELS,
  SLOT_MEDIA_TYPE_LABELS,
  SLOT_PROGRESS_COLORS,
  SLOT_PROGRESS_LABELS,
  STATUS_LABELS,
} from '../utils/constants';

const { Text } = Typography;

export default function TimelinePage() {
  return env.useMock ? <MockTimelinePage /> : <RealTimelinePage />;
}

/* -------------------------------------------------------------------------- */
/* Bản chạy API thật                                                          */
/* -------------------------------------------------------------------------- */

function RealTimelinePage() {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [pageFilter, setPageFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<PublishStatus | undefined>();

  const date = selectedDate.format('YYYY-MM-DD');
  const { data, isLoading, isError, error } = usePublishSchedule({
    date,
    pageId: pageFilter,
    status: statusFilter,
  });
  const { data: pages } = usePages();

  const items = useMemo(() => data?.items ?? [], [data]);
  const summary = data?.summary;

  // Nhóm theo giờ để timeline đọc như một ngày làm việc, không phải danh sách phẳng.
  const groupedByTime = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      const group = groups.get(item.time);
      if (group === undefined) groups.set(item.time, [item]);
      else group.push(item);
    }
    return [...groups.entries()];
  }, [items]);

  return (
    <div>
      <PageHeader
        title="Lịch đăng bài"
        description="Tiến độ đăng tự động của tất cả page — mốc giờ lấy từ Cài đặt đăng bài tự động, kết quả lấy từ job đã chạy"
      />

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được lịch đăng bài"
          description={error instanceof Error ? error.message : undefined}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Kế hoạch trong ngày"
              value={summary?.plannedPosts ?? 0}
              suffix="bài"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Đã đăng thành công"
              value={summary?.successPosts ?? 0}
              valueStyle={{ color: '#52c41a' }}
              suffix="bài"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Đang chờ / đang đăng"
              value={summary?.runningPosts ?? 0}
              valueStyle={{ color: '#faad14' }}
              suffix="bài"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Lỗi"
              value={summary?.failedPosts ?? 0}
              valueStyle={{ color: '#ff4d4f' }}
              suffix="bài"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col xs={24} lg={7}>
          <Card title="Chọn ngày & bộ lọc">
            <DatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              allowClear={false}
              format="DD/MM/YYYY"
              style={{ width: '100%', marginBottom: 12 }}
            />

            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Select
                placeholder="Kênh (FB Page)"
                allowClear
                style={{ width: '100%' }}
                value={pageFilter}
                onChange={setPageFilter}
                options={(pages ?? []).map((p) => ({
                  value: p.id,
                  label: p.pageName,
                }))}
              />
              <Select
                placeholder="Trạng thái job"
                allowClear
                style={{ width: '100%' }}
                value={statusFilter}
                onChange={setStatusFilter}
                options={(Object.keys(STATUS_LABELS) as PublishStatus[]).map(
                  (s) => ({ value: s, label: STATUS_LABELS[s] }),
                )}
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
              <Space wrap style={{ marginTop: 8, justifyContent: 'center' }}>
                <Tag color="blue">{items.length} mốc giờ</Tag>
                <Tag color="geekblue">
                  {summary?.pagesAutoOn ?? 0} page bật auto
                </Tag>
                {(summary?.manualPosts ?? 0) > 0 && (
                  <Tag color="purple">{summary?.manualPosts} bài đăng tay</Tag>
                )}
              </Space>
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Giờ hiển thị theo {data?.timezone ?? 'Asia/Ho_Chi_Minh'}
                </Text>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={17}>
          <Card title={`Lịch ngày ${selectedDate.format('DD/MM/YYYY')}`}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <Spin />
              </div>
            ) : groupedByTime.length === 0 ? (
              <Empty
                description={
                  statusFilter
                    ? 'Không có job nào khớp bộ lọc trong ngày này'
                    : 'Chưa có mốc giờ nào — thêm ở trang Cài đặt đăng bài tự động'
                }
              />
            ) : (
              <Timeline
                items={groupedByTime.map(([time, timeItems]) => ({
                  color: timelineColor(timeItems),
                  children: (
                    <div>
                      <Text strong style={{ fontSize: 16 }}>
                        {time}
                      </Text>
                      <div style={{ marginTop: 8 }}>
                        {timeItems.map((item) => (
                          <ScheduleItemCard key={item.key} item={item} />
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

/** Màu chấm timeline lấy theo mốc "nặng" nhất trong giờ đó. */
function timelineColor(items: ScheduleItem[]): string {
  if (items.some((i) => i.progress === 'FAILED')) return 'red';
  if (items.some((i) => i.progress === 'RUNNING')) return 'orange';
  if (items.every((i) => i.progress === 'DONE')) return 'green';
  return 'blue';
}

function ScheduleItemCard({ item }: { item: ScheduleItem }) {
  const isManual = item.kind === 'manual';

  return (
    <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '12px 16px' } }}>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color="geekblue">{item.pageName}</Tag>
          <Tag color={SLOT_PROGRESS_COLORS[item.progress]}>
            {SLOT_PROGRESS_LABELS[item.progress]}
          </Tag>
          {isManual ? (
            <Tag color="purple">Đăng tay</Tag>
          ) : item.slotId === null ? (
            <Tag>Ngoài lịch</Tag>
          ) : (
            <Tag color="cyan">
              {item.successCount}/{item.plannedCount} bài
            </Tag>
          )}
          {item.mediaType && (
            <Tag color={item.mediaType === 'video' ? 'purple' : 'blue'}>
              {SLOT_MEDIA_TYPE_LABELS[item.mediaType]}
            </Tag>
          )}
          {item.categories.map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
        </Space>

        <Space size={12} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <PublisherIcon publishers={item.publishers} />{' '}
            {item.publishers.length > 0
              ? `Người đăng: ${item.publishers.join(', ')}`
              : 'Người đăng: Bot (khi tới giờ)'}
          </Text>
          {item.readyCount !== null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Kho còn {item.readyCount} bài dùng được
            </Text>
          )}
        </Space>

        {!item.pageIsActive && (
          <Text type="warning" style={{ fontSize: 12 }}>
            Page đang tạm dừng — Bot sẽ không đăng
          </Text>
        )}
        {item.pageIsActive && item.kind === 'slot' && !item.autopostEnabled && (
          <Text type="warning" style={{ fontSize: 12 }}>
            Page đang tắt đăng tự động
          </Text>
        )}
        {item.kind === 'slot' &&
          item.slotId !== null &&
          item.autopostEnabled &&
          !item.slotEnabled && (
            <Text type="warning" style={{ fontSize: 12 }}>
              Mốc giờ này đang tắt
            </Text>
          )}

        {item.jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </Space>
    </Card>
  );
}

function PublisherIcon({ publishers }: { publishers: string[] }) {
  const onlyBot =
    publishers.length === 0 ||
    publishers.every((p) => p === BOT_PUBLISHER);
  return onlyBot ? <RobotOutlined /> : <UserOutlined />;
}

function JobRow({ job }: { job: ScheduleJob }) {
  return (
    <div
      style={{
        borderTop: '1px solid #f0f0f0',
        paddingTop: 8,
        marginTop: 2,
      }}
    >
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <Space wrap>
          <StatusTag status={job.status} />
          <Text strong>{job.contentTitle}</Text>
          <Tag color={job.mediaType === 'video' ? 'purple' : 'blue'}>
            {MEDIA_TYPE_LABELS[job.mediaType]}
          </Tag>
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {job.caption.slice(0, 80)}
          {job.caption.length > 80 ? '…' : ''}
        </Text>
        {job.errorMessage && (
          <Text type="danger" style={{ fontSize: 12 }}>
            {job.errorMessage}
          </Text>
        )}
        <Space size={12} wrap>
          {/* Deep-link sang "Quản lý Ảnh/Video Edit" và mở luôn Drawer sửa bài. */}
          <Link to={`/content?edit=${job.contentAssetId}`} style={{ fontSize: 12 }}>
            <EditOutlined /> Xem/sửa bài trong kho
          </Link>
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
          {job.isManual ? <UserOutlined /> : <RobotOutlined />} {job.publishedBy}{' '}
          · đặt lịch {dayjs(job.scheduleTime).format('HH:mm')}
          {job.publishedAt
            ? ` · đăng lúc ${dayjs(job.publishedAt).format('HH:mm')}`
            : ''}
        </Text>
      </Space>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bản mock (giữ nguyên cho VITE_USE_MOCK=true — ADR-005)                     */
/* -------------------------------------------------------------------------- */

function MockTimelinePage() {
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
