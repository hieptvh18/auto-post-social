import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Modal,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { JobEventsModal } from '../components/common/JobEventsModal';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { env } from '../config/env';
import { useAuthUser } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import { useFailedJobs, useRetryPublishJob } from '../hooks/usePublishJobs';
import type { PublishJob, PublishJobItem } from '../types';
import { can } from '../utils/permissions';

const { Text, Paragraph } = Typography;

const PAGE_SIZE = 20;

export default function FailedJobsPage() {
  return env.useMock ? <MockFailedJobsPage /> : <RealFailedJobsPage />;
}

/* ─────────────────────────── Bản chạy API thật ─────────────────────────── */

function RealFailedJobsPage() {
  const user = useAuthUser();
  const canRetry = can(user.role, 'jobs:retry');

  const [page, setPage] = useState(1);
  const [eventsJob, setEventsJob] = useState<PublishJobItem | null>(null);
  const [errorJob, setErrorJob] = useState<PublishJobItem | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useFailedJobs(
    page,
    PAGE_SIZE,
  );
  const retryMutation = useRetryPublishJob();

  const handleRetry = (job: PublishJobItem) => {
    retryMutation.mutate(job.id, {
      onSuccess: (result) => {
        void message.success(result.message);
        setErrorJob(null);
      },
      onError: (mutationError) => {
        // Backend chặn đăng trùng bằng 409 (job đang chạy / bài đã lên page)
        // và 400 (page tạm dừng/đã xoá) — hiện nguyên lý do cho người bấm.
        void message.error(
          mutationError instanceof ApiError
            ? mutationError.message
            : 'Không đăng lại được job này',
        );
      },
    });
  };

  const columns: ColumnsType<PublishJobItem> = [
    {
      title: 'Giờ đăng',
      dataIndex: 'scheduleTime',
      width: 160,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    { title: 'Bài', dataIndex: 'contentTitle', ellipsis: true },
    { title: 'Page', dataIndex: 'pageName', width: 180, ellipsis: true },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (status: PublishJobItem['status']) => (
        <StatusTag status={status} />
      ),
    },
    {
      title: 'Lần thử',
      dataIndex: 'attemptCount',
      width: 90,
      align: 'center',
    },
    {
      title: 'Lỗi',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: (errorMessage: string | null, record) =>
        errorMessage === null ? (
          <Text type="secondary">—</Text>
        ) : (
          <Tooltip title={errorMessage}>
            <a onClick={() => setErrorJob(record)}>{errorMessage}</a>
          </Tooltip>
        ),
    },
    {
      title: 'Thao tác',
      width: 210,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setEventsJob(record)}
          >
            Xem nhật ký
          </Button>
          {canRetry && (
            <Button
              size="small"
              type="primary"
              icon={<ReloadOutlined />}
              loading={
                retryMutation.isPending && retryMutation.variables === record.id
              }
              onClick={() => handleRetry(record)}
            >
              Đăng lại
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Failed Jobs"
        description="Bài đăng hỏng — xem nhật ký từng lần thử và cho chạy lại"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={isFetching}
            onClick={() => void refetch()}
          >
            Làm mới
          </Button>
        }
      />

      {error !== null && error !== undefined && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được danh sách job hỏng"
        />
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        scroll={{ x: 1100 }}
        locale={{ emptyText: 'Không có job nào thất bại 🎉' }}
        pagination={{
          current: data?.page ?? page,
          pageSize: data?.pageSize ?? PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          showTotal: (total) => `${total} job hỏng`,
          onChange: setPage,
        }}
      />

      <JobEventsModal
        jobId={eventsJob?.id ?? null}
        jobTitle={eventsJob?.contentTitle}
        onClose={() => setEventsJob(null)}
      />

      <Modal
        title="Chi tiết lỗi"
        open={errorJob !== null}
        onCancel={() => setErrorJob(null)}
        width={620}
        footer={
          canRetry && errorJob !== null ? (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={retryMutation.isPending}
              onClick={() => handleRetry(errorJob)}
            >
              Đăng lại
            </Button>
          ) : null
        }
      >
        {errorJob !== null && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">Bài</Text>
              <br />
              <Text strong>{errorJob.contentTitle}</Text>
            </div>
            <div>
              <Text type="secondary">Page</Text>
              <br />
              <Text>{errorJob.pageName}</Text>
            </div>
            <div>
              <Text type="secondary">Số lần đã thử</Text>
              <br />
              <Text>{errorJob.attemptCount} / 3</Text>
            </div>
            <div>
              <Text type="secondary">Thông báo lỗi</Text>
              <Paragraph
                code
                copyable
                style={{
                  background: '#fff2f0',
                  border: '1px solid #ffccc7',
                  padding: 12,
                  borderRadius: 6,
                  marginTop: 8,
                }}
              >
                {errorJob.errorMessage ?? 'Không có thông báo lỗi'}
              </Paragraph>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}

/* ───────────────────────────── Bản mock (ADR-005) ──────────────────────── */

function MockFailedJobsPage() {
  const user = useAuthUser();
  const { publishJobs } = useMockData();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [errorJob, setErrorJob] = useState<PublishJob | null>(null);

  const jobs = publishJobs.filter(
    (job) => job.status === 'FAILED' && !hiddenIds.includes(job.id),
  );

  const handleRetry = (id: string) => {
    setHiddenIds((prev) => [...prev, id]);
    void message.success(`Job #${id} đã được đưa vào queue retry (mock)`);
  };

  const columns: ColumnsType<PublishJob> = [
    {
      title: 'Giờ đăng',
      dataIndex: 'scheduleTime',
      width: 160,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    { title: 'Bài', dataIndex: 'contentTitle', ellipsis: true },
    { title: 'Page', dataIndex: 'pageName', width: 180 },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (status: PublishJob['status']) => <StatusTag status={status} />,
    },
    { title: 'Lần thử', dataIndex: 'attempts', width: 90, align: 'center' },
    {
      title: 'Thao tác',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setErrorJob(record)}
          >
            Lỗi
          </Button>
          {can(user.role, 'jobs:retry') && (
            <Button
              size="small"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => handleRetry(record.id)}
            >
              Đăng lại
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Failed Jobs"
        description="Danh sách bài đăng thất bại (dữ liệu mock)"
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={jobs}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Không có job thất bại 🎉' }}
      />

      <Modal
        title={`Chi tiết lỗi — Job #${errorJob?.id}`}
        open={errorJob !== null}
        onCancel={() => setErrorJob(null)}
        footer={null}
        width={560}
      >
        {errorJob !== null && (
          <Paragraph code copyable>
            {errorJob.errorMessage}
          </Paragraph>
        )}
      </Modal>
    </div>
  );
}
