import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FacebookOutlined,
  FileTextOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Card, Col, DatePicker, Radio, Row, Space, Statistic, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { mockPages, mockUsers } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { useMockData } from '../contexts/MockDataContext';
import type { MediaType } from '../types';

const { Text } = Typography;

// Ngày demo cố định của mock data
const DEMO_TODAY = dayjs('2026-07-16');

const RANGE_PRESETS = [
  { label: 'Hôm nay', value: [DEMO_TODAY.startOf('day'), DEMO_TODAY.endOf('day')] },
  { label: '7 ngày qua', value: [DEMO_TODAY.subtract(6, 'day').startOf('day'), DEMO_TODAY.endOf('day')] },
  { label: 'Tháng này', value: [DEMO_TODAY.startOf('month'), DEMO_TODAY.endOf('month')] },
  { label: 'Năm nay', value: [DEMO_TODAY.startOf('year'), DEMO_TODAY.endOf('year')] },
] satisfies { label: string; value: [Dayjs, Dayjs] }[];

function inRange(date: string, range: [Dayjs, Dayjs]) {
  const d = dayjs(date);
  return !d.isBefore(range[0]) && !d.isAfter(range[1]);
}

export default function DashboardPage() {
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
                <Tooltip />
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
                <Tooltip />
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
