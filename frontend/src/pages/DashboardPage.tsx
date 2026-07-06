import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FacebookOutlined,
  FileTextOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Statistic } from 'antd';
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
import { PageHeader } from '../components/common/PageHeader';
import { mockChartData, mockDashboardStats } from '../api/mock/data';

const stats = mockDashboardStats;

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Tổng quan workflow content & publish (mock data)"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Chờ duyệt"
              value={stats.waitingReview}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Đã duyệt"
              value={stats.approved}
              valueStyle={{ color: '#1677ff' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Đã lên lịch"
              value={stats.scheduled}
              valueStyle={{ color: '#722ed1' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Đang đăng"
              value={stats.publishing}
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Publish thành công"
              value={stats.successPosts}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Publish thất bại"
              value={stats.failedPosts}
              valueStyle={{ color: '#cf1322' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Pages active"
              value={stats.activePages}
              prefix={<FacebookOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Users active"
              value={stats.activeUsers}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Bài đăng theo ngày" style={{ marginTop: 24 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={mockChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="success" name="Thành công" fill="#52c41a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="failed" name="Thất bại" fill="#ff4d4f" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Tỷ lệ thành công">
            <Statistic
              value={
                (
                  (stats.successPosts /
                    Math.max(1, stats.successPosts + stats.failedPosts)) *
                  100
                ).toFixed(1)
              }
              suffix="%"
              valueStyle={{ color: '#3f8600', fontSize: 36 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Tỷ lệ thất bại">
            <Statistic
              value={
                (
                  (stats.failedPosts /
                    Math.max(1, stats.successPosts + stats.failedPosts)) *
                  100
                ).toFixed(1)
              }
              suffix="%"
              valueStyle={{ color: '#cf1322', fontSize: 36 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
