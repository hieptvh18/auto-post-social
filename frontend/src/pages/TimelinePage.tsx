import {
  CalendarOutlined,
  ClockCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  LinkOutlined,
  RedoOutlined,
  RobotOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Empty,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { mockPages } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { env } from '../config/env';
import { useAuthUser } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import { usePages } from '../hooks/usePages';
import { useRetryPublishJob } from '../hooks/usePublishJobs';
import { usePublishSchedule, useRunSlotNow } from '../hooks/usePublishSchedule';
import { JobEventsModal } from '../components/common/JobEventsModal';
import type {
  PublishJob,
  PublishStatus,
  ScheduleItem,
  ScheduleJob,
} from '../types';
import { can } from '../utils/permissions';
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
  // Job đang xem nhật ký — null là đóng modal.
  const [eventsJob, setEventsJob] = useState<ScheduleJob | null>(null);

  const date = selectedDate.format('YYYY-MM-DD');
  const { data, isLoading, isError, error } = usePublishSchedule({
    date,
    pageId: pageFilter,
    status: statusFilter,
  });
  const { data: pages } = usePages();

  const user = useAuthUser();
  // Chỉ ADMIN có `jobs:retry` (docs/05 §2) — role khác không thấy nút.
  const canRetry = can(user.role, 'jobs:retry');
  const retryMutation = useRetryPublishJob();
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  // Chạy lại cả mốc giờ = việc của engine tự động ⇒ quyền `autopost:manage`.
  const canRunSlot = can(user.role, 'autopost:manage');
  const runSlotMutation = useRunSlotNow();
  const [runningSlotId, setRunningSlotId] = useState<string | null>(null);

  const handleRunSlot = async (item: ScheduleItem) => {
    if (item.slotId === null) return;
    setRunningSlotId(item.slotId);
    try {
      const result = await runSlotMutation.mutateAsync(item.slotId);
      if (!result.claimed) {
        message.warning('Mốc giờ này vừa chạy trong phút này — thử lại sau 1 phút');
      } else if (result.jobCreatedCount > 0) {
        message.success(
          `Đã xếp hàng đăng ${result.jobCreatedCount} bài cho mốc ${item.time}`,
        );
      } else {
        message.warning(
          'Đã chạy lại nhưng kho vẫn không có bài nào dùng được cho mốc này',
        );
      }
    } catch (err) {
      message.error(
        err instanceof ApiError ? err.message : 'Không chạy lại được mốc giờ này',
      );
    } finally {
      setRunningSlotId(null);
    }
  };

  const handleRetry = async (job: ScheduleJob) => {
    setRetryingJobId(job.id);
    try {
      const result = await retryMutation.mutateAsync(job.id);
      message.success(result.message);
    } catch (err) {
      // 409 = job đang chạy / bài đã đăng rồi, 400 = page tạm dừng hoặc đã xoá.
      message.error(
        err instanceof ApiError ? err.message : 'Không đăng lại được bài này',
      );
    } finally {
      setRetryingJobId(null);
    }
  };

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
    // Mốc giờ mới nhất lên đầu — người dùng quan tâm việc vừa/sắp xảy ra trước.
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [items]);

  // Đồng hồ tick mỗi 30s để khối "mốc giờ kế tiếp" tự nhảy sang mốc sau khi tới giờ,
  // không cần người dùng F5.
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const nextSlot = useMemo(
    () => findNextSlot(groupedByTime, date, now),
    [groupedByTime, date, now],
  );

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
          {/* Bộ lọc dính theo màn hình khi cuộn — chỉ danh sách bên phải cuộn.
              top = 64 (Header sticky của AdminLayout) + 16 khoảng thở. */}
          <div
            style={{
              position: 'sticky',
              top: 80,
              maxHeight: 'calc(100vh - 96px)',
              overflowY: 'auto',
            }}
          >
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
          </div>
        </Col>

        <Col xs={24} lg={17}>
          <Card title={`Lịch ngày ${selectedDate.format('DD/MM/YYYY')}`}>
            {!isLoading && nextSlot !== null && (
              <div
                style={{
                  border: `1px solid ${nextSlot.willRun ? '#1677ff' : '#faad14'}`,
                  background: nextSlot.willRun ? '#f0f7ff' : '#fffbe6',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 20,
                }}
              >
                <Space wrap style={{ marginBottom: 8 }}>
                  <ClockCircleOutlined
                    style={{ color: nextSlot.willRun ? '#1677ff' : '#faad14' }}
                  />
                  <Text strong style={{ fontSize: 16 }}>
                    Khung giờ chạy tiếp theo: {nextSlot.time}
                  </Text>
                  <Tag color={nextSlot.willRun ? 'blue' : 'orange'}>
                    {formatCountdown(
                      dayjs(`${date}T${nextSlot.time}`),
                      now,
                    )}
                  </Tag>
                  {!nextSlot.willRun && (
                    <Tag color="orange" icon={<WarningOutlined />}>
                      Mốc gần nhất còn lại đang tắt — Bot sẽ không đăng
                    </Tag>
                  )}
                </Space>
                {nextSlot.items.map((item) => (
                  <ScheduleItemCard
                    key={item.key}
                    item={item}
                    date={date}
                    onShowEvents={setEventsJob}
                    onRetry={canRetry ? handleRetry : undefined}
                    retryingJobId={retryingJobId}
                    onRunSlot={canRunSlot ? handleRunSlot : undefined}
                    runningSlot={runningSlotId === item.slotId}
                  />
                ))}
              </div>
            )}

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
                          <ScheduleItemCard
                            key={item.key}
                            item={item}
                            date={date}
                            onShowEvents={setEventsJob}
                            onRetry={canRetry ? handleRetry : undefined}
                            retryingJobId={retryingJobId}
                            onRunSlot={canRunSlot ? handleRunSlot : undefined}
                            runningSlot={runningSlotId === item.slotId}
                          />
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

      <JobEventsModal
        jobId={eventsJob?.id ?? null}
        jobTitle={eventsJob?.contentTitle}
        onClose={() => setEventsJob(null)}
      />
    </div>
  );
}

/** Mốc giờ sẽ chạy sắp tới + các item của nó. */
type NextSlot = { time: string; items: ScheduleItem[]; willRun: boolean };

/** Mốc giờ này Bot có thực sự chạy không (page bật, auto bật, mốc bật). */
function isSlotLive(item: ScheduleItem): boolean {
  return (
    item.kind === 'slot' &&
    item.slotId !== null &&
    item.slotEnabled &&
    item.autopostEnabled &&
    item.pageIsActive
  );
}

/**
 * Mốc giờ kế tiếp so với `now`: ưu tiên mốc gần nhất còn **thực sự chạy**; nếu cả
 * ngày chỉ còn mốc đang tắt thì vẫn trả về mốc gần nhất để người dùng biết. Ngày đã
 * qua / mọi mốc đã trôi qua ⇒ `null`.
 *
 * `groups` đã sort giảm dần nên duyệt từ cuối lên để lấy mốc sớm nhất trong tương lai.
 */
function findNextSlot(
  groups: [string, ScheduleItem[]][],
  date: string,
  now: dayjs.Dayjs,
): NextSlot | null {
  let fallback: NextSlot | null = null;
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const [time, timeItems] = groups[i];
    // `YYYY-MM-DDTHH:mm` = ISO không timezone ⇒ dayjs hiểu là giờ địa phương,
    // khớp giả định toàn hệ thống chạy ở Asia/Ho_Chi_Minh.
    if (!dayjs(`${date}T${time}`).isAfter(now)) continue;
    if (timeItems.some(isSlotLive)) return { time, items: timeItems, willRun: true };
    fallback ??= { time, items: timeItems, willRun: false };
  }
  return fallback;
}

/** "còn 1 giờ 20 phút nữa" — đọc nhanh hơn là bắt người dùng tự trừ giờ. */
function formatCountdown(target: dayjs.Dayjs, now: dayjs.Dayjs): string {
  const totalMinutes = Math.max(0, Math.ceil(target.diff(now, 'minute', true)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `còn ${minutes} phút nữa`;
  return minutes === 0
    ? `còn ${hours} giờ nữa`
    : `còn ${hours} giờ ${minutes} phút nữa`;
}

/** Màu chấm timeline lấy theo mốc "nặng" nhất trong giờ đó. */
function timelineColor(items: ScheduleItem[]): string {
  if (items.some((i) => i.progress === 'FAILED')) return 'red';
  if (items.some((i) => i.progress === 'RUNNING')) return 'orange';
  if (items.every((i) => i.progress === 'DONE')) return 'green';
  return 'blue';
}

function ScheduleItemCard({
  item,
  date,
  onShowEvents,
  onRetry,
  retryingJobId,
  onRunSlot,
  runningSlot,
}: {
  item: ScheduleItem;
  /** Ngày đang xem (`YYYY-MM-DD`) — ghép với `item.time` để biết mốc đã tới chưa. */
  date: string;
  onShowEvents: (job: ScheduleJob) => void;
  /** `undefined` = người dùng không có quyền `jobs:retry` ⇒ ẩn nút đăng lại. */
  onRetry?: (job: ScheduleJob) => void;
  retryingJobId: string | null;
  /** `undefined` = không có quyền `autopost:manage` ⇒ ẩn nút chạy lại mốc giờ. */
  onRunSlot?: (item: ScheduleItem) => void;
  runningSlot: boolean;
}) {
  const isManual = item.kind === 'manual';
  // Mốc giờ trong tương lai thì Bot sẽ tự chạy khi tới giờ — chạy tay lúc này chỉ
  // làm bài đăng sớm hơn kế hoạch, nên ẩn nút. Giờ so theo máy người dùng, khớp
  // với giả định toàn hệ thống chạy ở Asia/Ho_Chi_Minh.
  // `YYYY-MM-DDTHH:mm` = ISO không timezone ⇒ dayjs hiểu là giờ địa phương.
  const slotTimeReached = dayjs(`${date}T${item.time}`).isBefore(dayjs());
  // Mốc giờ đã tới nhưng chưa ra bài nào: Bot bỏ qua vì hết bài, chạy lỗi, hoặc
  // chưa từng chạy (MISSED). Đăng đủ kế hoạch rồi thì không cho chạy thêm.
  const canRunSlotNow =
    onRunSlot !== undefined &&
    slotTimeReached &&
    item.kind === 'slot' &&
    item.slotId !== null &&
    item.slotEnabled &&
    item.autopostEnabled &&
    item.pageIsActive &&
    item.successCount + item.runningCount < item.plannedCount;

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
          {item.slotRun?.status === 'SKIPPED' && (
            <Tag color="orange" icon={<WarningOutlined />}>
              Bot bỏ qua — không có bài
            </Tag>
          )}
          {item.slotRun?.status === 'ERROR' && (
            <Tag color="red" icon={<WarningOutlined />}>
              Bot chạy lỗi
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

        {item.kind === 'slot' && item.slotId !== null && (
          <SlotRunNote item={item} />
        )}

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

        {canRunSlotNow && (
          <Popconfirm
            title={`Chạy lại mốc ${item.time}?`}
            description={`Bot sẽ chọn bài trong kho cho page "${item.pageName}" và xếp hàng đăng ngay bây giờ (tối đa ${item.plannedCount} bài). Bài đã đăng rồi không bị đăng lại.`}
            okText="Chạy lại"
            cancelText="Huỷ"
            onConfirm={() => onRunSlot?.(item)}
          >
            <Button
              size="small"
              icon={<RedoOutlined />}
              loading={runningSlot}
              style={{ alignSelf: 'flex-start' }}
            >
              Chạy lại mốc này
            </Button>
          </Popconfirm>
        )}

        {item.jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            onShowEvents={onShowEvents}
            onRetry={onRetry}
            retrying={retryingJobId === job.id}
          />
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

/**
 * Dấu vết cron cho mốc giờ này. Phân biệt rõ 3 tình huống hay bị lẫn:
 * chưa tới lượt chạy · chạy rồi nhưng hết bài · chạy hỏng.
 */
function SlotRunNote({ item }: { item: ScheduleItem }) {
  const run = item.slotRun;
  if (run === null) {
    // Không có dòng slot_runs = cron chưa chạm mốc này (chưa tới giờ, hoặc app
    // không chạy lúc đó) — khác hẳn "chạy rồi nhưng hết bài".
    return item.progress === 'MISSED' ? (
      <Alert
        type="warning"
        showIcon
        message="Mốc giờ đã qua nhưng Bot chưa từng chạy mốc này"
        description="Thường do backend không chạy đúng thời điểm đó, hoặc mốc giờ vừa được tạo/đổi giờ sau khi thời điểm đã trôi qua."
        style={{ marginTop: 4 }}
      />
    ) : null;
  }

  if (run.status === 'SKIPPED') {
    return (
      <Alert
        type="warning"
        showIcon
        message={`Bot đã chạy lúc ${dayjs(run.startedAt).format('HH:mm')} nhưng KHÔNG đăng bài nào`}
        description={
          run.skipReason === 'NO_CONTENT'
            ? 'Kho không còn bài nào khớp mốc giờ này: bài phải ở trạng thái Đã duyệt, đúng danh mục/loại media của mốc, và đã được phân bổ vào page này (chưa đăng lần nào ở page đó). Kiểm tra ở Quản lý Ảnh/Video Edit → mục "Phân bổ page".'
            : run.skipReason
        }
        style={{ marginTop: 4 }}
      />
    );
  }
  if (run.status === 'ERROR') {
    return (
      <Alert
        type="error"
        showIcon
        message="Bot chạy mốc này lỗi"
        description={run.errorMessage}
        style={{ marginTop: 4 }}
      />
    );
  }
  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      Bot đã chạy lúc {dayjs(run.startedAt).format('HH:mm')} — chọn{' '}
      {run.pickedCount} bài, tạo {run.jobCreatedCount} job
    </Text>
  );
}

/** Job đã dừng hẳn thì mới cho đăng lại — QUEUED/PUBLISHING vẫn đang trong hàng đợi. */
const RETRYABLE_JOB_STATUSES: PublishStatus[] = [
  'FAILED',
  'CANCELLED',
  'SCHEDULED',
];

function JobRow({
  job,
  onShowEvents,
  onRetry,
  retrying,
}: {
  job: ScheduleJob;
  onShowEvents: (job: ScheduleJob) => void;
  onRetry?: (job: ScheduleJob) => void;
  retrying: boolean;
}) {
  const canRetryJob =
    onRetry !== undefined && RETRYABLE_JOB_STATUSES.includes(job.status);

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
        {canRetryJob && (
          <Popconfirm
            title="Đăng lại bài này?"
            description={`Bài "${job.contentTitle}" sẽ được xếp hàng đăng lại ngay lên page. Chỉ làm khi lỗi trước đó đã được xử lý.`}
            okText="Đăng lại"
            cancelText="Huỷ"
            onConfirm={() => onRetry?.(job)}
          >
            <Button
              size="small"
              type="primary"
              ghost
              danger={job.status === 'FAILED'}
              icon={<RedoOutlined />}
              loading={retrying}
              style={{ alignSelf: 'flex-start' }}
            >
              Đăng lại
            </Button>
          </Popconfirm>
        )}
        <Space size={12} wrap>
          {/* Deep-link sang "Quản lý Ảnh/Video Edit" và mở luôn Drawer sửa bài. */}
          <Link to={`/content?edit=${job.contentAssetId}`} style={{ fontSize: 12 }}>
            <EditOutlined /> Xem/sửa bài trong kho
          </Link>
          <a
            onClick={() => onShowEvents(job)}
            style={{ fontSize: 12, cursor: 'pointer' }}
          >
            <HistoryOutlined /> Xem nhật ký
          </a>
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
