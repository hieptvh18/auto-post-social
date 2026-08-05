import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FacebookOutlined,
  FileTextOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  RiseOutlined,
  StarOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Empty,
  Radio,
  Row,
  Skeleton,
  Space,
  Statistic,
  Tooltip,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  // antd cũng export `Tooltip` — đổi tên bản của recharts để không đụng nhau.
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { mockPages, mockUsers } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { env } from '../config/env';
import { useAuthUser } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import {
  useDailyChart,
  useDashboardHealth,
  useDashboardStats,
  usePostsByPage,
  useTopCategories,
} from '../hooks/useDashboard';
import type { DashboardAlert, MediaType } from '../types';

const { Text } = Typography;

const API_DATE = 'YYYY-MM-DD';

export default function DashboardPage() {
  return env.useMock ? <MockDashboardPage /> : <RealDashboardPage />;
}

/* ─────────────────────────── Bản chạy API thật ─────────────────────────── */

function RealDashboardPage() {
  const user = useAuthUser();
  const [searchParams, setSearchParams] = useSearchParams();

  // Kỳ nằm trong URL để copy link gửi người khác vẫn ra đúng số liệu.
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const range = useMemo(() => ({ from, to }), [from, to]);

  const [pageMediaFilter, setPageMediaFilter] = useState<MediaType | 'all'>('all');

  const stats = useDashboardStats(range);
  const daily = useDailyChart(range);
  const byPage = usePostsByPage({ ...range, mediaType: pageMediaFilter });
  // Tổng bài thành công theo page, luôn cố định 'all' — độc lập với bộ lọc
  // ảnh/video ở chart chi tiết bên dưới, để 2 khối không nhảy số theo nhau.
  const byPageTotal = usePostsByPage({ ...range, mediaType: 'all' });
  // Mặc định top 10 danh mục — không truyền limit để backend tự chốt.
  const topCategories = useTopCategories(range);
  // CONTENT bị 403 ở endpoint này — đừng gọi để khỏi log lỗi rác.
  const health = useDashboardHealth(user.role !== 'CONTENT');

  // Tỷ lệ thành công/thất bại mỗi ngày — tính lại từ dữ liệu chart cột đã có,
  // không gọi thêm API. Ngày không có job đóng sổ nào ⇒ null (khoảng trống
  // trên line chart), khác 0% (nghĩa là hỏng hết).
  const dailyRateData = useMemo(
    () =>
      (daily.data?.items ?? []).map((item) => {
        const total = item.success + item.failed;
        return {
          label: dayjs(item.date).format('D/M'),
          successRate: total > 0 ? Math.round((item.success / total) * 1000) / 10 : null,
          failRate: total > 0 ? Math.round((item.failed / total) * 1000) / 10 : null,
        };
      }),
    [daily.data],
  );

  const pageTotalData = useMemo(
    () =>
      (byPageTotal.data?.items ?? []).map((item) => ({
        pageName: item.pageName,
        totalSuccess: item.imagePosts + item.videoPosts,
      })),
    [byPageTotal.data],
  );

  // Backend là nơi chốt kỳ mặc định (7 ngày); FE chỉ hiển thị lại cái nó trả về,
  // để hai bên không tự tính ra hai khoảng khác nhau.
  const effectiveRange = stats.data?.range;
  const pickerValue: [Dayjs, Dayjs] | undefined =
    effectiveRange === undefined
      ? undefined
      : [dayjs(effectiveRange.from), dayjs(effectiveRange.to)];

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description={
          stats.data?.scopedToOwnContent === true
            ? 'Số liệu tính trên các bài do chính bạn tạo'
            : 'Tình trạng kho bài, sản lượng đăng và sức khoẻ hệ thống'
        }
        extra={
          <DatePicker.RangePicker
            value={pickerValue}
            format="DD/MM/YYYY"
            allowClear={false}
            presets={rangePresets()}
            onChange={(next) => {
              if (!next?.[0] || !next[1]) return;
              setSearchParams({
                from: next[0].format(API_DATE),
                to: next[1].format(API_DATE),
              });
            }}
          />
        }
      />

      {health.data !== undefined && health.data.alerts.length > 0 && (
        <HealthAlerts alerts={health.data.alerts} />
      )}

      {stats.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được số liệu tổng quan"
          description="Kiểm tra backend còn chạy không rồi tải lại trang."
        />
      )}

      {stats.isLoading && <Skeleton active paragraph={{ rows: 4 }} />}

      {stats.data !== undefined && (
        <>
          <StatStrip
            title="Kho bài"
            note="hiện tại"
            items={[
              {
                label: 'Chờ duyệt',
                value: stats.data.inventory.pendingReview,
                icon: <FileTextOutlined />,
              },
              {
                label: 'Đã duyệt (chờ Bot đăng)',
                value: stats.data.inventory.approved,
                color: '#1677ff',
                icon: <CheckCircleOutlined />,
              },
              {
                label: 'Chưa phân bổ page',
                value: stats.data.inventory.approvedUnassigned,
                color:
                  stats.data.inventory.approvedUnassigned > 0
                    ? '#faad14'
                    : undefined,
                icon: <InboxOutlined />,
                hint: 'Bài đã duyệt nhưng chưa gán page nào — Bot không lấy được những bài này',
              },
              {
                label: 'Không duyệt',
                value: stats.data.inventory.rejected,
                icon: <CloseCircleOutlined />,
              },
            ]}
          />

          <StatStrip
            title="Sản lượng"
            note={
              effectiveRange === undefined
                ? 'trong kỳ đã chọn'
                : `${dayjs(effectiveRange.from).format('DD/MM')} → ${dayjs(
                    effectiveRange.to,
                  ).format('DD/MM/YYYY')}`
            }
            items={[
              {
                label: 'Đăng thành công',
                value: stats.data.production.successPosts,
                color: '#3f8600',
                icon: <CheckCircleOutlined />,
              },
              {
                label: 'Đăng thất bại',
                value: stats.data.production.failedPosts,
                color: '#cf1322',
                icon: <CloseCircleOutlined />,
              },
              {
                label: 'Video đạt ADS',
                value: stats.data.production.adsVideos,
                color: '#722ed1',
                icon: <StarOutlined />,
              },
              {
                label: 'Bài mới upload',
                value: stats.data.production.newContent,
                icon: <FileTextOutlined />,
              },
            ]}
          />

          <StatStrip
            title="Đang chạy"
            note="ngay lúc này"
            items={[
              {
                label: 'Chờ đăng / đang đăng',
                value: stats.data.live.publishing,
                color: '#faad14',
                icon: <ClockCircleOutlined />,
              },
              {
                label: 'Page đang hoạt động',
                value: stats.data.live.activePages,
                icon: <FacebookOutlined />,
                hint: `${stats.data.live.autopostEnabledPages} page đã bật đăng tự động`,
              },
              // `null` = role này không được xem — bỏ hẳn ô, không hiện số 0.
              ...(stats.data.live.activeUsers === null
                ? []
                : [
                    {
                      label: 'Nhân sự đang hoạt động',
                      value: stats.data.live.activeUsers,
                      icon: <TeamOutlined />,
                    },
                  ]),
              {
                label: 'Tỷ lệ thành công',
                // null = chưa có job nào đóng sổ ⇒ "—", khác hẳn 0% (hỏng sạch).
                value: stats.data.production.successRate ?? '—',
                suffix:
                  stats.data.production.successRate === null ? undefined : '%',
                color:
                  stats.data.production.successRate === null
                    ? undefined
                    : '#3f8600',
                icon: <RiseOutlined />,
                hint:
                  stats.data.production.successRate === null
                    ? 'Chưa có bài nào đăng xong trong kỳ'
                    : `${stats.data.production.successPosts}/${
                        stats.data.production.successPosts +
                        stats.data.production.failedPosts
                      } bài`,
              },
            ]}
          />
        </>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="Bài đăng theo ngày">
            {daily.isLoading && <Skeleton active />}
            {daily.data !== undefined && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={daily.data.items.map((item) => ({
                    ...item,
                    label: dayjs(item.date).format('D/M'),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip />
                  <Legend />
                  <Bar
                    dataKey="success"
                    name="Thành công"
                    fill="#52c41a"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="failed"
                    name="Thất bại"
                    fill="#ff4d4f"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card
            title="Bài đăng theo từng page"
            extra={
              <Radio.Group
                size="small"
                value={pageMediaFilter}
                onChange={(e) => setPageMediaFilter(e.target.value as MediaType)}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'image', label: 'Ảnh' },
                  { value: 'video', label: 'Video' },
                ]}
                optionType="button"
              />
            }
          >
            {byPage.isLoading && <Skeleton active />}
            {byPage.data !== undefined && byPage.data.items.length === 0 && (
              <Empty description="Chưa có bài nào đăng trong kỳ này" />
            )}
            {byPage.data !== undefined && byPage.data.items.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byPage.data.items}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="pageName" />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip />
                    <Legend />
                    {pageMediaFilter !== 'video' && (
                      <Bar
                        dataKey="imagePosts"
                        name="Ảnh"
                        fill="#1677ff"
                        radius={[4, 4, 0, 0]}
                      />
                    )}
                    {pageMediaFilter !== 'image' && (
                      <Bar
                        dataKey="videoPosts"
                        name="Video"
                        fill="#722ed1"
                        radius={[4, 4, 0, 0]}
                      />
                    )}
                    <Bar
                      dataKey="failedPosts"
                      name="Thất bại"
                      fill="#ff4d4f"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Cột ảnh/video chỉ đếm bài đăng thành công trong kỳ đã chọn.
                </Text>
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="Tỷ lệ thành công / thất bại theo ngày">
            {daily.isLoading && <Skeleton active />}
            {daily.data !== undefined && (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyRateData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, 100]} unit="%" allowDecimals={false} />
                  <ChartTooltip
                    formatter={(value) => (value === null ? '—' : `${value}%`)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="successRate"
                    name="Tỷ lệ thành công"
                    stroke="#52c41a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="failRate"
                    name="Tỷ lệ thất bại"
                    stroke="#ff4d4f"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title="Tổng bài đăng thành công theo page">
            {byPageTotal.isLoading && <Skeleton active />}
            {byPageTotal.data !== undefined && byPageTotal.data.items.length === 0 && (
              <Empty description="Chưa có bài nào đăng thành công trong kỳ này" />
            )}
            {byPageTotal.data !== undefined && byPageTotal.data.items.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pageTotalData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="pageName" />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip />
                  <Bar
                    dataKey="totalSuccess"
                    name="Đăng thành công"
                    fill="#52c41a"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="Top danh mục đăng thành công nhiều nhất (theo số bài, gộp mọi page)">
            {topCategories.isLoading && <Skeleton active />}
            {topCategories.data !== undefined &&
              topCategories.data.items.length === 0 && (
                <Empty description="Chưa có bài nào đăng thành công trong kỳ này" />
              )}
            {topCategories.data !== undefined &&
              topCategories.data.items.length > 0 && (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(300, topCategories.data.items.length * 42)}
                >
                  <BarChart
                    data={topCategories.data.items}
                    layout="vertical"
                    margin={{ left: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={140}
                      tick={{ fontSize: 12 }}
                    />
                    <ChartTooltip
                      formatter={(value, _name, props) => [
                        `${value} bài · ${props.payload.pageCount} page`,
                        'Thành công',
                      ]}
                    />
                    <Bar
                      dataKey="successPosts"
                      name="Thành công"
                      fill="#52c41a"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

/** Khối "Cần chú ý" — mỗi cảnh báo bấm được sang đúng màn xử lý. */
function HealthAlerts({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
      {alerts.map((alert) => (
        <Alert
          key={alert.code}
          type={alert.level}
          showIcon
          icon={<WarningOutlined />}
          message={alert.message}
          action={<Link to={alert.link}>Xem chi tiết</Link>}
        />
      ))}
    </Space>
  );
}

interface StatItem {
  label: string;
  value: number | string;
  suffix?: string;
  color?: string;
  icon: React.ReactNode;
  /** Câu giải thích — để trong tooltip thay vì chiếm thêm một dòng dưới số. */
  hint?: string;
}

/**
 * Một nhóm thẻ số gói trong **một** Card mỏng thay vì mỗi số một Card.
 *
 * Ba nhóm × 4 thẻ Card thường chiếm gần hết màn hình, đẩy hai chart xuống dưới
 * nếp gấp — mà chart mới là thứ người ta vào Dashboard để xem. Ghi chú dài
 * chuyển hết vào tooltip để mọi ô cao bằng nhau.
 */
function StatStrip({
  title,
  note,
  items,
}: {
  title: string;
  note: string;
  items: StatItem[];
}) {
  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '10px 12px' } }}
      title={
        <Space align="baseline" size={6}>
          <Text strong style={{ fontSize: 13 }}>
            {title}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            · {note}
          </Text>
        </Space>
      }
    >
      <Row gutter={[12, 12]}>
        {items.map((item) => (
          <Col key={item.label} xs={12} sm={12} md={8} xl={6}>
            <StatCell item={item} />
          </Col>
        ))}
      </Row>
    </Card>
  );
}

function StatCell({ item }: { item: StatItem }) {
  const body = (
    <Space size={10} align="center">
      <span style={{ fontSize: 18, color: item.color ?? '#8c8c8c', lineHeight: 1 }}>
        {item.icon}
      </span>
      <span>
        <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.3 }}>
          {item.label}
          {item.hint !== undefined && (
            <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11 }} />
          )}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.2,
            color: item.color,
          }}
        >
          {item.value}
          {item.suffix !== undefined && (
            <span style={{ fontSize: 14, marginLeft: 2 }}>{item.suffix}</span>
          )}
        </div>
      </span>
    </Space>
  );

  return item.hint === undefined ? (
    body
  ) : (
    <Tooltip title={item.hint}>{body}</Tooltip>
  );
}

function rangePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs();
  return [
    { label: 'Hôm nay', value: [today, today] },
    { label: '7 ngày qua', value: [today.subtract(6, 'day'), today] },
    { label: '30 ngày qua', value: [today.subtract(29, 'day'), today] },
    { label: 'Tháng này', value: [today.startOf('month'), today] },
    {
      label: 'Tháng trước',
      value: [
        today.subtract(1, 'month').startOf('month'),
        today.subtract(1, 'month').endOf('month'),
      ],
    },
  ];
}

/* ──────────────────── Bản mock giữ nguyên theo ADR-005 ──────────────────── */

// Ngày demo cố định của mock data
const DEMO_TODAY = dayjs('2026-07-16');

const RANGE_PRESETS = [
  { label: 'Hôm nay', value: [DEMO_TODAY.startOf('day'), DEMO_TODAY.endOf('day')] },
  {
    label: '7 ngày qua',
    value: [DEMO_TODAY.subtract(6, 'day').startOf('day'), DEMO_TODAY.endOf('day')],
  },
  { label: 'Tháng này', value: [DEMO_TODAY.startOf('month'), DEMO_TODAY.endOf('month')] },
  { label: 'Năm nay', value: [DEMO_TODAY.startOf('year'), DEMO_TODAY.endOf('year')] },
] satisfies { label: string; value: [Dayjs, Dayjs] }[];

function inRange(date: string, range: [Dayjs, Dayjs]) {
  const d = dayjs(date);
  return !d.isBefore(range[0]) && !d.isAfter(range[1]);
}

function MockDashboardPage() {
  const { content, publishJobs } = useMockData();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    DEMO_TODAY.subtract(6, 'day').startOf('day'),
    DEMO_TODAY.endOf('day'),
  ]);
  const [pageMediaFilter, setPageMediaFilter] = useState<MediaType | 'all'>('all');

  const rangeContent = useMemo(
    () => content.filter((c) => inRange(c.updatedAt, range)),
    [content, range],
  );
  const rangeJobs = useMemo(
    () => publishJobs.filter((j) => inRange(j.scheduleTime, range)),
    [publishJobs, range],
  );

  const stats = useMemo(() => {
    const success = rangeJobs.filter((j) => j.status === 'SUCCESS').length;
    const failed = rangeJobs.filter((j) => j.status === 'FAILED').length;
    return {
      pendingReview: rangeContent.filter((c) => c.status === 'PENDING_REVIEW').length,
      approved: rangeContent.filter((c) => c.status === 'APPROVED').length,
      publishing: rangeJobs.filter((j) => ['QUEUED', 'PUBLISHING'].includes(j.status))
        .length,
      successPosts: success,
      failedPosts: failed,
      adsVideos: rangeContent.filter((c) => c.mediaType === 'video' && c.isAds).length,
      activePages: mockPages.filter((p) => p.isActive).length,
      activeUsers: mockUsers.filter((u) => u.isActive).length,
    };
  }, [rangeContent, rangeJobs]);

  const dailyChart = useMemo(() => {
    const byDay = new Map<string, { date: string; success: number; failed: number }>();
    for (
      let d = range[0].startOf('day');
      !d.isAfter(range[1]) && byDay.size < 31;
      d = d.add(1, 'day')
    ) {
      byDay.set(d.format('YYYY-MM-DD'), { date: d.format('D/M'), success: 0, failed: 0 });
    }
    rangeJobs.forEach((j) => {
      const entry = byDay.get(dayjs(j.scheduleTime).format('YYYY-MM-DD'));
      if (!entry) return;
      if (j.status === 'SUCCESS') entry.success += 1;
      if (j.status === 'FAILED') entry.failed += 1;
    });
    return [...byDay.values()];
  }, [rangeJobs, range]);

  const pageChart = useMemo(() => {
    return mockPages
      .filter((p) => p.isActive)
      .map((page) => {
        const pageJobs = rangeJobs.filter(
          (j) => j.facebookPageId === page.id && j.status === 'SUCCESS',
        );
        return {
          page: page.pageName.replace('Luca — ', ''),
          image: pageJobs.filter((j) => j.mediaType === 'image').length,
          video: pageJobs.filter((j) => j.mediaType === 'video').length,
        };
      });
  }, [rangeJobs]);

  const totalFinished = stats.successPosts + stats.failedPosts;

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Thống kê content & bài đăng theo khoảng thời gian (mock data)"
        extra={
          <DatePicker.RangePicker
            value={range}
            format="DD/MM/YYYY"
            allowClear={false}
            presets={RANGE_PRESETS}
            onChange={(r) => {
              if (r?.[0] && r?.[1]) setRange([r[0].startOf('day'), r[1].endOf('day')]);
            }}
          />
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Video đạt ADS"
              value={stats.adsVideos}
              valueStyle={{ color: '#722ed1' }}
              prefix={<StarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Chờ duyệt"
              value={stats.pendingReview}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Đã duyệt (chờ bot đăng)"
              value={stats.approved}
              valueStyle={{ color: '#1677ff' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Đang chờ đăng / đang đăng"
              value={stats.publishing}
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Đăng thành công"
              value={stats.successPosts}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Đăng thất bại"
              value={stats.failedPosts}
              valueStyle={{ color: '#cf1322' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Pages active"
              value={stats.activePages}
              prefix={<FacebookOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <Card>
            <Statistic
              title="Nhân sự active"
              value={stats.activeUsers}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="Bài đăng theo ngày">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="success" name="Thành công" fill="#52c41a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" name="Thất bại" fill="#ff4d4f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card
            title="Bài đăng theo từng page"
            extra={
              <Radio.Group
                size="small"
                value={pageMediaFilter}
                onChange={(e) => setPageMediaFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'image', label: 'Ảnh' },
                  { value: 'video', label: 'Video' },
                ]}
                optionType="button"
              />
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pageChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="page" />
                <YAxis allowDecimals={false} />
                <ChartTooltip />
                <Legend />
                {pageMediaFilter !== 'video' && (
                  <Bar dataKey="image" name="Ảnh" fill="#1677ff" radius={[4, 4, 0, 0]} />
                )}
                {pageMediaFilter !== 'image' && (
                  <Bar dataKey="video" name="Video" fill="#722ed1" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Chỉ tính bài đăng thành công trong khoảng thời gian đã chọn.
            </Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Tỷ lệ thành công">
            <Space align="baseline">
              <Statistic
                value={((stats.successPosts / Math.max(1, totalFinished)) * 100).toFixed(1)}
                suffix="%"
                valueStyle={{ color: '#3f8600', fontSize: 36 }}
              />
              <Text type="secondary">({stats.successPosts}/{totalFinished} bài)</Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Tỷ lệ thất bại">
            <Space align="baseline">
              <Statistic
                value={((stats.failedPosts / Math.max(1, totalFinished)) * 100).toFixed(1)}
                suffix="%"
                valueStyle={{ color: '#cf1322', fontSize: 36 }}
              />
              <Text type="secondary">({stats.failedPosts}/{totalFinished} bài)</Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
