import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Modal, Space, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useMockData } from '../contexts/MockDataContext';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import { useAuthUser } from '../contexts/AuthContext';
import type { PublishJob } from '../types';
import { can } from '../utils/permissions';

const { Text, Paragraph } = Typography;

export default function FailedJobsPage() {
  const user = useAuthUser();
  const { publishJobs } = useMockData();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [errorJob, setErrorJob] = useState<PublishJob | null>(null);

  const jobs = publishJobs.filter((j) => j.status === 'FAILED' && !hiddenIds.includes(j.id));

  const handleRetry = (id: string) => {
    setHiddenIds((prev) => [...prev, id]);
    message.success(`Job #${id} đã được đưa vào queue retry (mock)`);
  };

  const columns: ColumnsType<PublishJob> = [
    {
      title: 'Job ID',
      dataIndex: 'id',
      width: 90,
      render: (v) => <Text code>#{v}</Text>,
    },
    {
      title: 'Content',
      dataIndex: 'contentTitle',
      ellipsis: true,
    },
    {
      title: 'Page',
      dataIndex: 'pageName',
      width: 180,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s) => <StatusTag status={s} />,
    },
    {
      title: 'Attempts',
      dataIndex: 'attempts',
      width: 90,
      align: 'center',
    },
    {
      title: 'Scheduled',
      dataIndex: 'scheduleTime',
      width: 150,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Actions',
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
          {can(user!.role, 'jobs:retry') && (
            <Button
              size="small"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => handleRetry(record.id)}
            >
              Retry
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
        description="Danh sách bài đăng thất bại — xem lỗi và retry"
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
        open={!!errorJob}
        onCancel={() => setErrorJob(null)}
        footer={
          can(user!.role, 'jobs:retry') ? (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => {
                if (errorJob) handleRetry(errorJob.id);
                setErrorJob(null);
              }}
            >
              Retry job
            </Button>
          ) : null
        }
        width={560}
      >
        {errorJob && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">Content</Text>
              <br />
              <Text strong>{errorJob.contentTitle}</Text>
            </div>
            <div>
              <Text type="secondary">Page</Text>
              <br />
              <Text>{errorJob.pageName}</Text>
            </div>
            <div>
              <Text type="secondary">Attempts</Text>
              <br />
              <Text>{errorJob.attempts} / 3</Text>
            </div>
            <div>
              <Text type="secondary">Error message</Text>
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
                {errorJob.errorMessage}
              </Paragraph>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
}
