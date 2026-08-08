import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { env } from '../config/env';
import { useMockData } from '../contexts/MockDataContext';
import { useQueueSummary } from '../hooks/useMonitor';
import type {
  PublishJob,
  PublishJobItem,
  PublishStatus,
  QueueSummary,
  StuckJob,
} from '../types';

const { Text } = Typography;

export default function QueueMonitorPage() {
  return env.useMock ? <MockQueueMonitorPage /> : <RealQueueMonitorPage />;
}

/* ─────────────────────────── Bản chạy API thật ─────────────────────────── */

function RealQueueMonitorPage() {
  const { data, isLoading, error, refetch, isFetching } = useQueueSummary();

  return (
    <div>
      <PageHeader
        title="Queue Monitor"
        description="Hàng đợi đăng bài đang chạy gì — số liệu tự làm mới mỗi 10 giây"
        extra={
          <Space wrap>
            {data !== undefined && (
              <Text type="secondary">
                Cập nhật lúc {dayjs(data.checkedAt).format('HH:mm:ss')}
              </Text>
            )}
            <Button
              icon={<ReloadOutlined />}
              loading={isFetching}
              onClick={() => void refetch()}
            >
              Làm mới
            </Button>
          </Space>
        }
      />

      {error !== null && error !== undefined && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được số liệu hàng đợi"
          description="Kiểm tra backend còn chạy không, rồi bấm Làm mới."
        />
      )}

      {isLoading && <Spin />}

      {data !== undefined && <QueueSummaryView summary={data} />}
    </div>
  );
}

function QueueSummaryView({ summary }: { summary: QueueSummary }) {
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {!summary.queueHealthy && (
        <Alert
          type="warning"
          showIcon
          message="Mất kết nối Redis — không đọc được số liệu BullMQ"
          description={
            <>
              <div>
                Số liệu bên dưới chỉ còn phần lấy từ database. Bot không đăng
                được bài cho tới khi Redis trở lại.
              </div>
              {summary.queueError !== null && (
                <div style={{ marginTop: 4 }}>
                  <Text code>{summary.queueError}</Text>
                </div>
              )}
            </>
          }
        />
      )}

      {summary.stuck.length > 0 && (
        <StuckJobsAlert
          jobs={summary.stuck}
          thresholdMinutes={summary.stuckThresholdMinutes}
        />
      )}

      <Card
        size="small"
        title={
          <Space>
            <span>Hàng đợi BullMQ (Redis)</span>
            <Badge
              status={summary.queueHealthy ? 'success' : 'error'}
              text={summary.queueHealthy ? 'Redis OK' : 'Mất kết nối'}
            />
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} md={4}>
            <Statistic title="Đang chờ" value={summary.queue?.waiting ?? '—'} />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Statistic
              title="Đang chạy"
              value={summary.queue?.active ?? '—'}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Statistic title="Hẹn giờ" value={summary.queue?.delayed ?? '—'} />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Statistic
              title="Hỏng"
              value={summary.queue?.failed ?? '—'}
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Statistic
              title="Đã xong"
              value={summary.queue?.completed ?? '—'}
              valueStyle={{ color: '#3f8600' }}
            />
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        title="Job trong database"
        extra={
          <Text type="secondary">
            Lệch nhiều so với Redis ⇒ Redis vừa bị xoá hoặc worker chết
          </Text>
        }
      >
        <Row gutter={[16, 16]}>
          {DB_STATUS_LABELS.map(([status, label]) => (
            <Col xs={12} sm={8} md={4} key={status}>
              <Statistic title={label} value={summary.db[status]} />
            </Col>
          ))}
        </Row>
      </Card>

      <Card size="small" title="Job đang chờ / đang đăng">
        <ActiveJobsTable jobs={summary.activeJobs} />
      </Card>
    </Space>
  );
}

const DB_STATUS_LABELS: [PublishStatus, string][] = [
  ['SCHEDULED', 'Chờ tới giờ'],
  ['QUEUED', 'Trong hàng đợi'],
  ['PUBLISHING', 'Đang đăng'],
  ['SUCCESS', 'Thành công'],
  ['FAILED', 'Thất bại'],
  ['CANCELLED', 'Đã huỷ'],
];

function StuckJobsAlert({
  jobs,
  thresholdMinutes,
}: {
  jobs: StuckJob[];
  thresholdMinutes: number;
}) {
  return (
    <Alert
      type="error"
      showIcon
      message={`${jobs.length} job kẹt ở trạng thái "Đang đăng" quá ${thresholdMinutes} phút`}
      description={
        <div>
          <div style={{ marginBottom: 8 }}>
            Worker nhiều khả năng đã chết giữa chừng. Hệ thống không tự sửa —
            xem log backend, rồi dùng "Đăng lại" ở màn Lịch đăng bài nếu bài chưa
            thật sự lên Facebook.
          </div>
          {jobs.map((job) => (
            <div key={job.id}>
              <Text strong>{job.contentTitle}</Text>
              <Text type="secondary"> · {job.pageName} · </Text>
              <Tag color="red">kẹt {job.stuckMinutes} phút</Tag>
            </div>
          ))}
        </div>
      }
    />
  );
}

function ActiveJobsTable({ jobs }: { jobs: PublishJobItem[] }) {
  const columns: ColumnsType<PublishJobItem> = [
    {
      title: 'Giờ đăng',
      dataIndex: 'scheduleTime',
      width: 170,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm:ss'),
    },
    { title: 'Bài', dataIndex: 'contentTitle', ellipsis: true },
    { title: 'Page', dataIndex: 'pageName', width: 200, ellipsis: true },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: PublishStatus) => <StatusTag status={status} />,
    },
    {
      title: 'Lần thử',
      dataIndex: 'attemptCount',
      width: 90,
      align: 'center',
    },
    { title: 'Người tạo', dataIndex: 'createdBy', width: 160, ellipsis: true },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={jobs}
      pagination={false}
      scroll={{ x: 900 }}
      locale={{
        emptyText: <Empty description="Không có job nào đang chờ đăng" />,
      }}
    />
  );
}

/* ───────────────────────────── Bản mock (ADR-005) ──────────────────────── */

const QUEUE_STATUSES: PublishStatus[] = ['SCHEDULED', 'QUEUED', 'PUBLISHING'];

function MockQueueMonitorPage() {
  const { publishJobs } = useMockData();
  const [tick, setTick] = useState(() => dayjs());

  const queueJobs = useMemo(
    () =>
      publishJobs
        .filter((job) => QUEUE_STATUSES.includes(job.status))
        .sort(
          (a, b) => dayjs(a.scheduleTime).unix() - dayjs(b.scheduleTime).unix(),
        ),
    [publishJobs],
  );

  const columns: ColumnsType<PublishJob> = [
    {
      title: 'Giờ đăng',
      dataIndex: 'scheduleTime',
      width: 170,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm:ss'),
    },
    { title: 'Bài', dataIndex: 'contentTitle', ellipsis: true },
    { title: 'Page', dataIndex: 'pageName', width: 180 },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: PublishStatus) => <StatusTag status={status} />,
    },
    { title: 'Lần thử', dataIndex: 'attempts', width: 90, align: 'center' },
  ];

  return (
    <div>
      <PageHeader
        title="Queue Monitor"
        description="Theo dõi các job đang chờ và đang xử lý trong BullMQ (dữ liệu mock)"
        extra={
          <Space wrap>
            <Text type="secondary">Cập nhật lúc {tick.format('HH:mm:ss')}</Text>
            <Button icon={<ReloadOutlined />} onClick={() => setTick(dayjs())}>
              Làm mới
            </Button>
          </Space>
        }
      />

      <Space style={{ marginBottom: 16 }}>
        <Text type="secondary">{queueJobs.length} job trong hàng đợi</Text>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={queueJobs}
        pagination={false}
        scroll={{ x: 900 }}
      />
    </div>
  );
}
