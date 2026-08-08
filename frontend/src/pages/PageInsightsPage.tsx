import {
  ArrowLeftOutlined,
  ExportOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { PageHeader } from '../components/common/PageHeader';
import {
  usePageInsightsSummary,
  usePostInsights,
  useSyncInsights,
} from '../hooks/usePostInsights';
import { usePages } from '../hooks/usePages';
import type { PostInsight, PostInsightSortField } from '../types';

const { Text } = Typography;

const PAGE_SIZE = 20;

/**
 * `null` = **chưa đồng bộ lần nào**. Hiện `0` ở đây là nói với user rằng bài
 * không ai xem, trong khi thật ra hệ thống chưa đo lần nào (plan 25 §0.2).
 */
function renderMetric(value: number | null): React.ReactNode {
  if (value === null) {
    return (
      <Tooltip title="Chưa đồng bộ số liệu cho bài này">
        <Text type="secondary">—</Text>
      </Tooltip>
    );
  }
  return value.toLocaleString('vi-VN');
}

function formatDateTime(value: string | null): string {
  return value === null ? '—' : dayjs(value).format('DD/MM/YYYY HH:mm');
}

export default function PageInsightsPage() {
  const { pageId = '' } = useParams<{ pageId: string }>();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<PostInsightSortField>('publishedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: pages } = usePages();
  const fbPage = pages?.find((p) => p.id === pageId);

  const { data: summary } = usePageInsightsSummary(pageId);
  const { data: posts, isLoading } = usePostInsights(pageId, {
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortDir,
  });
  const syncMutation = useSyncInsights(pageId);

  const missingScope = fbPage?.canReadInsights === false;

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync();
      if (result.skipReason === 'MISSING_SCOPE') {
        message.warning('Token chưa có quyền đọc thống kê — hãy kết nối lại page.');
        return;
      }
      // Lỗi cấu hình phía tool, không phải lỗi của page — nói thẳng để không ai
      // đi tìm nguyên nhân ở Facebook.
      if (result.skipReason === 'INVALID_METRIC') {
        message.error(
          'Facebook không chấp nhận chỉ số đang dùng (Meta đã đổi tên metric). Cần cập nhật tool — xem log backend.',
        );
        return;
      }
      if (result.dueCount === 0) {
        message.info('Mọi bài đều đã được đồng bộ gần đây, chưa cần lấy lại.');
        return;
      }
      message.success(
        `Đã cập nhật ${result.updatedCount}/${result.dueCount} bài.` +
          (result.missingCount > 0
            ? ` ${result.missingCount} bài không còn trên Facebook.`
            : ''),
      );
    } catch (err) {
      message.error(
        err instanceof ApiError ? err.message : 'Đồng bộ thất bại',
      );
    }
  };

  const columns: ColumnsType<PostInsight> = [
    {
      title: 'Bài đăng',
      dataIndex: 'title',
      render: (title: string, record) => (
        <Space>
          {/* Link thumbnail của Google Drive hết hạn sau một thời gian ⇒ 404.
              Ẩn hẳn ảnh vỡ thay vì để icon ảnh hỏng nằm giữa bảng. */}
          {record.thumbnailUrl !== null && (
            <img
              src={record.thumbnailUrl}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              style={{
                width: 48,
                height: 48,
                objectFit: 'cover',
                borderRadius: 4,
              }}
            />
          )}
          <Space direction="vertical" size={0}>
            <Typography.Link
              href={record.facebookPostUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {title} <ExportOutlined />
            </Typography.Link>
            <Space size={4}>
              <Tag color={record.mediaType === 'video' ? 'purple' : 'blue'}>
                {record.mediaType === 'video' ? 'Video' : 'Ảnh'}
              </Tag>
              {record.missingOnFb && (
                <Tooltip title="Bài không còn trên Facebook. Số liệu dưới đây là lần đo cuối cùng.">
                  <Tag color="error">Đã bị xoá trên Facebook</Tag>
                </Tooltip>
              )}
            </Space>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Đăng lúc',
      dataIndex: 'publishedAt',
      width: 160,
      sorter: true,
      defaultSortOrder: 'descend',
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: 'Lượt xem video',
      dataIndex: 'videoViews',
      width: 140,
      align: 'right',
      sorter: true,
      // Bài ảnh không có khái niệm này — hiện `—` thay vì `0` cho khỏi hiểu nhầm.
      render: (value: number | null, record) =>
        record.mediaType === 'video' ? (
          renderMetric(value)
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: (
        <Tooltip title="Số người ĐANG THEO DÕI page đã thấy bài này. Facebook không còn cho đọc lượt tiếp cận tổng qua API.">
          <span>Tiếp cận NTD ⓘ</span>
        </Tooltip>
      ),
      dataIndex: 'fanReach',
      width: 150,
      align: 'right',
      sorter: true,
      render: renderMetric,
    },
    {
      title: 'Lượt nhấp',
      dataIndex: 'clicks',
      width: 120,
      align: 'right',
      sorter: true,
      render: renderMetric,
    },
    {
      title: 'Tương tác',
      width: 150,
      render: (_: unknown, record) =>
        record.likeCount === null ? (
          <Text type="secondary">—</Text>
        ) : (
          <Text>
            👍 {record.likeCount} · 💬 {record.commentCount} · ↗{' '}
            {record.shareCount}
          </Text>
        ),
    },
    {
      title: 'Cập nhật',
      dataIndex: 'fetchedAt',
      width: 150,
      render: (v: string | null) =>
        v === null ? (
          <Text type="secondary">Chưa đồng bộ</Text>
        ) : (
          <Text type="secondary">{formatDateTime(v)}</Text>
        ),
    },
  ];

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<PostInsight> | SorterResult<PostInsight>[],
  ) => {
    setPage(pagination.current ?? 1);

    const active = Array.isArray(sorter) ? sorter[0] : sorter;
    // Bỏ sắp xếp ⇒ quay về mặc định "mới nhất trước", không để bảng vô định.
    if (active?.order === undefined || active.field === undefined) {
      setSortBy('publishedAt');
      setSortDir('desc');
      return;
    }
    setSortBy(active.field as PostInsightSortField);
    setSortDir(active.order === 'ascend' ? 'asc' : 'desc');
  };

  return (
    <div>
      <PageHeader
        title={fbPage?.pageName ?? 'Thống kê bài đăng'}
        description="Chỉ hiển thị các bài do tool này đăng lên page. Bài đăng thẳng trên Facebook không được theo dõi."
        extra={
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/pages')}
            >
              Quay lại
            </Button>
            {fbPage !== undefined && (
              <Button
                icon={<ExportOutlined />}
                href={`https://www.facebook.com/${fbPage.pageId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Mở Page
              </Button>
            )}
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={syncMutation.isPending}
              disabled={missingScope}
              onClick={() => void handleSync()}
            >
              Đồng bộ ngay
            </Button>
          </Space>
        }
      />

      {missingScope && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Token của page này chưa có quyền đọc thống kê"
          description="Quyền đã cấp cho một token không tự nâng cấp được. Vào Facebook Pages, bấm 'Kết nối bằng Facebook' và cấp lại quyền cho page này để bắt đầu thu thập lượt hiển thị."
          action={
            <Button size="small" onClick={() => navigate('/pages')}>
              Tới Facebook Pages
            </Button>
          }
        />
      )}

      {!missingScope && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Tổng bài đã đăng" value={summary?.postCount ?? 0} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic
                title="Tổng lượt xem video"
                value={summary?.totalVideoViews ?? 0}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic
                title="Tiếp cận người theo dõi"
                value={summary?.totalFanReach ?? 0}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic
                title="Tổng lượt nhấp"
                value={summary?.totalClicks ?? 0}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                TB {summary?.averageClicks ?? 0}/bài · {summary?.syncedCount ?? 0}{' '}
                bài đã đo
              </Text>
            </Card>
          </Col>
        </Row>
      )}

      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {summary?.lastFetchedAt != null &&
          `Cập nhật lần cuối: ${formatDateTime(summary.lastFetchedAt)}. Facebook cập nhật số liệu trễ 15 phút đến vài giờ. `}
        Facebook đã ngừng cung cấp <b>lượt hiển thị / tiếp cận tổng</b> của bài qua
        API, nên bảng dưới hiển thị các chỉ số còn đọc được.
      </Text>

      <Table
        rowKey="assignmentId"
        loading={isLoading}
        columns={columns}
        dataSource={posts?.data ?? []}
        onChange={handleTableChange}
        locale={{
          emptyText: (
            <Empty description="Chưa có bài nào được tool đăng lên page này" />
          ),
        }}
        pagination={{
          current: posts?.meta.page ?? 1,
          pageSize: PAGE_SIZE,
          total: posts?.meta.total ?? 0,
          showSizeChanger: false,
        }}
        scroll={{ x: 1100 }}
      />
    </div>
  );
}
