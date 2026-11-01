import { InfoCircleOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  // antd cũng export `Tooltip` — đổi tên bản của recharts để không đụng nhau.
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { mockPages } from '../../api/mock/data';
import { env } from '../../config/env';
import { useMockData } from '../../contexts/MockDataContext';
import { useCategorySuggestions } from '../../hooks/useContentAssets';
import { usePublishReport } from '../../hooks/useDashboard';
import { usePages } from '../../hooks/usePages';
import { useIsPhone } from '../../hooks/useResponsive';
import type {
  MediaType,
  PublishJob,
  PublishReport,
  PublishReportGroupBy,
  PublishReportPageRow,
} from '../../types';

const { Text } = Typography;

const API_DATE = 'YYYY-MM-DD';
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
/** Quá ngần này ngày mà vẫn xem theo ngày ⇒ gợi ý chuyển sang tháng (plan 35 §3.5). */
const SUGGEST_MONTH_AFTER_DAYS = 62;
/** Chart chồng: chỉ tô màu riêng N page nhiều bài nhất, còn lại gộp "Khác". */
const CHART_TOP_PAGES = 5;
const CHART_COLORS = ['#1677ff', '#13a8a8', '#fa8c16', '#722ed1', '#eb2f96', '#8c8c8c'];

interface ReportFilters {
  from?: string;
  to?: string;
  pageIds: string[];
  categories: string[];
  mediaType: MediaType | 'all';
  groupBy: PublishReportGroupBy;
}

interface Option {
  value: string;
  label: string;
  paused?: boolean;
}

/**
 * Tab "Thống kê đăng bài" (plan 35): page nào đã đăng bao nhiêu bài theo
 * ngày/tháng, lọc theo page + danh mục + loại media.
 */
export function PublishReportTab() {
  return env.useMock ? <MockPublishReport /> : <RealPublishReport />;
}

/* ─────────────────────────── Bản chạy API thật ─────────────────────────── */

/** Bộ lọc nằm trong URL (tiền tố `r`) để F5/chia sẻ link vẫn ra đúng bảng. */
function RealPublishReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo<ReportFilters>(
    () => ({
      from: searchParams.get('rFrom') ?? undefined,
      to: searchParams.get('rTo') ?? undefined,
      pageIds: splitParam(searchParams.get('rPages')),
      categories: splitParam(searchParams.get('rCats')),
      mediaType: (searchParams.get('rMedia') as MediaType | null) ?? 'all',
      groupBy: searchParams.get('rGroup') === 'month' ? 'month' : 'day',
    }),
    [searchParams],
  );

  const onChange = (next: ReportFilters) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      const put = (key: string, value: string | undefined) => {
        if (value === undefined || value === '') params.delete(key);
        else params.set(key, value);
      };
      put('rFrom', next.from);
      put('rTo', next.to);
      put('rPages', next.pageIds.join(','));
      put('rCats', next.categories.join(','));
      put('rMedia', next.mediaType === 'all' ? undefined : next.mediaType);
      put('rGroup', next.groupBy === 'day' ? undefined : next.groupBy);
      return params;
    });
  };

  const report = usePublishReport(filters);
  const pages = usePages();
  const categories = useCategorySuggestions();

  const pageOptions = useMemo<Option[]>(
    () =>
      (pages.data ?? []).map((page) => ({
        value: page.id,
        label: page.pageName,
        paused: !page.isActive,
      })),
    [pages.data],
  );
  const categoryOptions = useMemo<Option[]>(
    () =>
      (categories.data ?? []).map((item) => ({
        value: item.category,
        label: item.category,
      })),
    [categories.data],
  );

  return (
    <ReportView
      filters={filters}
      onChange={onChange}
      pageOptions={pageOptions}
      categoryOptions={categoryOptions}
      report={report.data}
      loading={report.isLoading}
      fetching={report.isFetching}
      error={report.isError}
    />
  );
}

/* ──────────────────── Bản mock (ADR-005) ──────────────────── */

const DEMO_TODAY = dayjs('2026-07-16');

function MockPublishReport() {
  const { publishJobs } = useMockData();
  const [filters, setFilters] = useState<ReportFilters>({
    from: DEMO_TODAY.subtract(6, 'day').format(API_DATE),
    to: DEMO_TODAY.format(API_DATE),
    pageIds: [],
    categories: [],
    mediaType: 'all',
    groupBy: 'day',
  });

  const pageOptions = useMemo<Option[]>(
    () => mockPages.map((p) => ({ value: p.id, label: p.pageName, paused: !p.isActive })),
    [],
  );
  const categoryOptions = useMemo<Option[]>(
    () =>
      [...new Set(publishJobs.map((j) => j.category).filter((c): c is string => !!c))]
        .sort((a, b) => a.localeCompare(b, 'vi'))
        .map((c) => ({ value: c, label: c })),
    [publishJobs],
  );
  const report = useMemo(
    () => buildMockReport(publishJobs, filters),
    [publishJobs, filters],
  );

  return (
    <ReportView
      filters={filters}
      onChange={setFilters}
      pageOptions={pageOptions}
      categoryOptions={categoryOptions}
      report={report}
      loading={false}
      fetching={false}
      error={false}
    />
  );
}

/** Tính lại đúng hình dạng response backend từ mock publishJobs. */
function buildMockReport(jobs: PublishJob[], filters: ReportFilters): PublishReport {
  const from = filters.from ?? DEMO_TODAY.subtract(6, 'day').format(API_DATE);
  const to = filters.to ?? DEMO_TODAY.format(API_DATE);
  const periods: string[] = [];
  for (let d = dayjs(from); !d.isAfter(dayjs(to)); d = d.add(1, 'day')) {
    const key = filters.groupBy === 'month' ? d.format('YYYY-MM') : d.format(API_DATE);
    if (periods[periods.length - 1] !== key) periods.push(key);
  }
  const index = new Map(periods.map((p, i) => [p, i]));
  const rows = new Map<string, PublishReportPageRow>();
  const cats = new Map<string, { total: number; pages: Set<string> }>();
  const ensure = (id: string, name: string, paused: boolean) => {
    let row = rows.get(id);
    if (!row) {
      row = {
        pageId: id,
        pageName: name,
        isPaused: paused,
        total: 0,
        imagePosts: 0,
        videoPosts: 0,
        byPeriod: periods.map(() => 0),
      };
      rows.set(id, row);
    }
    return row;
  };

  for (const job of jobs) {
    if (job.status !== 'SUCCESS') continue;
    const at = dayjs(job.publishedAt ?? job.scheduleTime);
    const day = at.format(API_DATE);
    if (day < from || day > to) continue;
    if (filters.pageIds.length && !filters.pageIds.includes(job.facebookPageId)) continue;
    if (filters.categories.length && !filters.categories.includes(job.category ?? '')) continue;
    if (filters.mediaType !== 'all' && job.mediaType !== filters.mediaType) continue;
    const i = index.get(filters.groupBy === 'month' ? at.format('YYYY-MM') : day);
    if (i === undefined) continue;
    const page = mockPages.find((p) => p.id === job.facebookPageId);
    const row = ensure(job.facebookPageId, job.pageName, page ? !page.isActive : false);
    row.byPeriod[i] += 1;
    row.total += 1;
    if (job.mediaType === 'video') row.videoPosts += 1;
    else row.imagePosts += 1;
    const category = job.category ?? '(Không có)';
    const cat = cats.get(category) ?? { total: 0, pages: new Set<string>() };
    cat.total += 1;
    cat.pages.add(job.facebookPageId);
    cats.set(category, cat);
  }
  for (const id of filters.pageIds) {
    const page = mockPages.find((p) => p.id === id);
    if (page) ensure(page.id, page.pageName, !page.isActive);
  }

  const pages = [...rows.values()].sort(
    (a, b) => b.total - a.total || a.pageName.localeCompare(b.pageName, 'vi'),
  );
  return {
    range: { from, to },
    groupBy: filters.groupBy,
    periods,
    totals: {
      total: sum(pages.map((p) => p.total)),
      imagePosts: sum(pages.map((p) => p.imagePosts)),
      videoPosts: sum(pages.map((p) => p.videoPosts)),
      byPeriod: periods.map((_, i) => sum(pages.map((p) => p.byPeriod[i] ?? 0))),
    },
    pages,
    categories: [...cats.entries()]
      .map(([category, v]) => ({ category, total: v.total, pageCount: v.pages.size }))
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'vi')),
    scopedToOwnContent: false,
  };
}

/* ─────────────────────────── Phần hiển thị chung ─────────────────────────── */

interface ReportViewProps {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
  pageOptions: Option[];
  categoryOptions: Option[];
  report: PublishReport | undefined;
  loading: boolean;
  fetching: boolean;
  error: boolean;
}

function ReportView({
  filters,
  onChange,
  pageOptions,
  categoryOptions,
  report,
  loading,
  fetching,
  error,
}: ReportViewProps) {
  const isPhone = useIsPhone();
  const { token } = theme.useToken();
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });

  // Backend là nơi chốt kỳ mặc định (7 ngày) — picker hiển thị lại kỳ nó trả về.
  const range = report?.range;
  const pickerValue: [Dayjs, Dayjs] | undefined =
    range === undefined ? undefined : [dayjs(range.from), dayjs(range.to)];
  const dayCount =
    range === undefined ? 0 : dayjs(range.to).diff(dayjs(range.from), 'day') + 1;
  const activePages = report?.pages.filter((p) => p.total > 0).length ?? 0;

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 12]}>
          <Col xs={24} md={12} xl={7}>
            <FilterLabel>Page</FilterLabel>
            <Select
              mode="multiple"
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              maxTagCount="responsive"
              placeholder="Tất cả page"
              style={{ width: '100%' }}
              value={filters.pageIds}
              onChange={(pageIds: string[]) => set({ pageIds })}
              options={pageOptions.map((o) => ({
                value: o.value,
                label: o.label,
                title: o.label,
              }))}
              optionRender={(option) => {
                const paused = pageOptions.find((o) => o.value === option.value)?.paused;
                return (
                  <Space>
                    {option.label}
                    {paused && <Tag color="orange">Tạm dừng</Tag>}
                  </Space>
                );
              }}
            />
          </Col>
          <Col xs={24} md={12} xl={6}>
            <FilterLabel>Danh mục (Dạng)</FilterLabel>
            <Select
              mode="multiple"
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              maxTagCount="responsive"
              placeholder="Tất cả danh mục"
              style={{ width: '100%' }}
              value={filters.categories}
              onChange={(categories: string[]) => set({ categories })}
              options={categoryOptions}
            />
          </Col>
          <Col xs={24} sm={12} xl={5}>
            <FilterLabel>Khoảng thời gian (giờ VN)</FilterLabel>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              value={pickerValue}
              format="DD/MM/YYYY"
              allowClear={false}
              presets={rangePresets()}
              onChange={(next) => {
                const start = next?.[0];
                const end = next?.[1];
                if (!start || !end) return;
                set({ from: start.format(API_DATE), to: end.format(API_DATE) });
              }}
            />
          </Col>
          <Col xs={12} sm={6} xl={3}>
            <FilterLabel>Loại</FilterLabel>
            <Segmented
              value={filters.mediaType}
              onChange={(mediaType) => set({ mediaType: mediaType as MediaType | 'all' })}
              options={[
                { label: 'Tất cả', value: 'all' },
                { label: 'Ảnh', value: 'image' },
                { label: 'Video', value: 'video' },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} xl={3}>
            <FilterLabel>Xem theo</FilterLabel>
            <Segmented
              value={filters.groupBy}
              onChange={(groupBy) => set({ groupBy: groupBy as PublishReportGroupBy })}
              options={[
                { label: 'Ngày', value: 'day' },
                { label: 'Tháng', value: 'month' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {filters.groupBy === 'day' && dayCount > SUGGEST_MONTH_AFTER_DAYS && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={`Khoảng đang chọn dài ${dayCount} ngày, bảng theo ngày sẽ rất rộng.`}
          action={
            <Button size="small" onClick={() => set({ groupBy: 'month' })}>
              Xem theo tháng
            </Button>
          }
        />
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title="Không tải được thống kê đăng bài"
          description="Kiểm tra backend còn chạy không rồi tải lại trang."
        />
      )}

      {loading && <Skeleton active paragraph={{ rows: 6 }} />}

      {report !== undefined && (
        <>
          {report.scopedToOwnContent && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title="Số liệu chỉ tính trên các bài do chính bạn tạo"
            />
          )}

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic
                  title="Tổng bài đã đăng"
                  value={report.totals.total}
                  valueStyle={{ color: token.colorPrimary }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatRange(report.range.from, report.range.to)} · {dayCount} ngày
                </Text>
              </Card>
            </Col>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic title="Số page có đăng" value={activePages} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {filters.pageIds.length > 0
                    ? `trên ${filters.pageIds.length} page đã chọn`
                    : `trên ${pageOptions.length} page`}
                </Text>
              </Card>
            </Col>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic
                  title="Trung bình / ngày"
                  value={dayCount > 0 ? report.totals.total / dayCount : 0}
                  precision={1}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {activePages > 0
                    ? `≈ ${(report.totals.total / dayCount / activePages).toFixed(1)} bài / page / ngày`
                    : ' '}
                </Text>
              </Card>
            </Col>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic title="Danh mục có bài" value={report.categories.length} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {report.categories[0]
                    ? `nhiều nhất: ${report.categories[0].category}`
                    : ' '}
                </Text>
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            style={{ marginBottom: 16 }}
            title={`Số bài đã đăng theo page, theo ${report.groupBy === 'day' ? 'ngày' : 'tháng'}`}
            extra={
              <Tooltip title="Đếm bài đăng thành công (Bot và đăng tay) theo thời điểm đăng thực tế, giờ Việt Nam. Tab Tổng quan hệ thống đếm theo giờ hẹn đăng nên có thể lệch vài bài ở mép ngày.">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <InfoCircleOutlined /> Cách đếm
                </Text>
              </Tooltip>
            }
          >
            <PivotTable report={report} loading={fetching} />
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={10}>
              <Card size="small" title="Theo danh mục">
                <Table
                  size="small"
                  rowKey="category"
                  pagination={false}
                  dataSource={report.categories}
                  locale={{ emptyText: <Empty description="Không có dữ liệu" /> }}
                  columns={[
                    { title: 'Danh mục', dataIndex: 'category' },
                    {
                      title: 'Số bài',
                      dataIndex: 'total',
                      align: 'right',
                      width: 90,
                    },
                    {
                      title: (
                        <Tooltip title="Số page khác nhau đã đăng danh mục này">
                          Số page
                        </Tooltip>
                      ),
                      dataIndex: 'pageCount',
                      align: 'right',
                      width: 90,
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={14}>
              <Card
                size="small"
                title={`Bài đăng theo ${report.groupBy === 'day' ? 'ngày' : 'tháng'}, chồng theo page`}
              >
                <StackedChart report={report} height={isPhone ? 240 : 300} />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

function PivotTable({ report, loading }: { report: PublishReport; loading: boolean }) {
  const { token } = theme.useToken();
  const max = Math.max(1, ...report.pages.flatMap((p) => p.byPeriod));
  const isDay = report.groupBy === 'day';

  const columns: TableColumnsType<PublishReportPageRow> = [
    {
      title: 'Page',
      dataIndex: 'pageName',
      fixed: 'left',
      width: 200,
      render: (name: string, row) => (
        <Space size={4}>
          <span>{name}</span>
          {row.isPaused && <Tag color="orange">Tạm dừng</Tag>}
        </Space>
      ),
    },
    {
      title: 'Tổng',
      dataIndex: 'total',
      align: 'right',
      width: 70,
      render: (v: number) => <strong>{countText(v)}</strong>,
    },
    {
      title: 'Ảnh',
      dataIndex: 'imagePosts',
      align: 'right',
      width: 60,
      render: countText,
    },
    {
      title: 'Video',
      dataIndex: 'videoPosts',
      align: 'right',
      width: 64,
      render: countText,
    },
    ...report.periods.map((period, index) => ({
      key: period,
      title: isDay ? (
        <span>
          {dayjs(period).format('DD/MM')}
          <br />
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>
            {WEEKDAYS[dayjs(period).day()]}
          </Text>
        </span>
      ) : (
        <span>
          T{Number(period.slice(5))}/{period.slice(0, 4)}
          <br />
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>
            {monthCoverage(period, report.range.from, report.range.to)}
          </Text>
        </span>
      ),
      align: 'right' as const,
      width: isDay ? 58 : 96,
      onCell: (row: PublishReportPageRow) => {
        const v = row.byPeriod[index] ?? 0;
        return v > 0
          ? {
              style: {
                background: `color-mix(in srgb, ${token.colorPrimary} ${Math.round(6 + (32 * v) / max)}%, transparent)`,
              },
            }
          : {};
      },
      render: (_: unknown, row: PublishReportPageRow) => countText(row.byPeriod[index] ?? 0),
    })),
  ];

  return (
    <Table
      size="small"
      rowKey="pageId"
      loading={loading}
      pagination={false}
      dataSource={report.pages}
      columns={columns}
      scroll={{ x: 'max-content' }}
      locale={{
        emptyText: <Empty description="Không có bài nào khớp bộ lọc trong khoảng này" />,
      }}
      summary={() =>
        report.pages.length === 0 ? null : (
          <Table.Summary fixed="bottom">
            <Table.Summary.Row style={{ background: token.colorFillAlter }}>
              <Table.Summary.Cell index={0}>
                <strong>TỔNG</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <strong>{report.totals.total}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                <strong>{report.totals.imagePosts}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <strong>{report.totals.videoPosts}</strong>
              </Table.Summary.Cell>
              {report.totals.byPeriod.map((v, i) => (
                <Table.Summary.Cell key={report.periods[i]} index={4 + i} align="right">
                  <strong>{countText(v)}</strong>
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          </Table.Summary>
        )
      }
    />
  );
}

function StackedChart({ report, height }: { report: PublishReport; height: number }) {
  const withPosts = report.pages.filter((p) => p.total > 0);
  const top = withPosts.slice(0, CHART_TOP_PAGES);
  const rest = withPosts.slice(CHART_TOP_PAGES);
  const series = top.map((p, i) => ({ key: `s${i}`, name: p.pageName, color: CHART_COLORS[i], by: p.byPeriod }));
  if (rest.length > 0) {
    series.push({
      key: 'rest',
      name: `Khác (${rest.length} page)`,
      color: CHART_COLORS[CHART_COLORS.length - 1],
      by: report.periods.map((_, i) => sum(rest.map((p) => p.byPeriod[i] ?? 0))),
    });
  }
  if (series.length === 0) {
    return <Empty description="Không có dữ liệu để vẽ" />;
  }
  const data = report.periods.map((period, i) => {
    const point: Record<string, string | number> = {
      label:
        report.groupBy === 'day'
          ? dayjs(period).format('D/M')
          : `T${Number(period.slice(5))}/${period.slice(2, 4)}`,
    };
    for (const s of series) point[s.key] = s.by[i] ?? 0;
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <ChartTooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="pages" fill={s.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────── Tiện ích ─────────────────────────── */

function FilterLabel({ children }: { children: string }) {
  return (
    <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
      {children}
    </Text>
  );
}

/** Ô 0 hiện "–" mờ cho bảng dễ đọc, khác hẳn ô có bài. */
function countText(value: number) {
  return value > 0 ? value : <Text type="secondary">–</Text>;
}

/** Tháng bị khoảng ngày cắt mất đầu/cuối thì ghi rõ phần được tính. */
function monthCoverage(month: string, from: string, to: string): string {
  const start = dayjs(`${month}-01`);
  const end = start.endOf('month');
  const a = dayjs(from).isAfter(start) ? dayjs(from) : start;
  const b = dayjs(to).isBefore(end, 'day') ? dayjs(to) : end;
  const full = a.isSame(start, 'day') && b.isSame(end, 'day');
  return full ? 'cả tháng' : `${a.format('DD/MM')}–${b.format('DD/MM')}`;
}

function formatRange(from: string, to: string): string {
  return from === to
    ? dayjs(from).format('DD/MM/YYYY')
    : `${dayjs(from).format('DD/MM')} – ${dayjs(to).format('DD/MM/YYYY')}`;
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
    { label: '3 tháng gần nhất', value: [today.subtract(2, 'month').startOf('month'), today] },
  ];
}

function splitParam(value: string | null): string[] {
  return value ? value.split(',').filter((v) => v.length > 0) : [];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
