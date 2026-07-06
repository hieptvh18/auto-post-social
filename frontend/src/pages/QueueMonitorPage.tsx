import { ReloadOutlined } from '@ant-design/icons';
import { Button, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useMockData } from '../contexts/MockDataContext';
import { PageHeader } from '../components/common/PageHeader';
import { StatusTag } from '../components/common/StatusTag';
import type { PublishJob, PublishStatus } from '../types';

const { Text } = Typography;

const QUEUE_STATUSES: PublishStatus[] = [
  'SCHEDULED',
  'QUEUED',
  'PUBLISHING',
];

export default function QueueMonitorPage() {
  const { publishJobs } = useMockData();
  const [statusFilter, setStatusFilter] = useState<PublishStatus | undefined>();

  const queueJobs = useMemo(() => {
    return publishJobs
      .filter((j) => QUEUE_STATUSES.includes(j.status))
      .filter((j) => !statusFilter || j.status === statusFilter)
      .sort((a, b) => dayjs(a.scheduleTime).unix() - dayjs(b.scheduleTime).unix());
  }, [publishJobs, statusFilter]);

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
      width: 120,
      render: (s: PublishStatus) => <StatusTag status={s} />,
    },
    {
      title: 'Attempts',
      dataIndex: 'attempts',
      width: 90,
      align: 'center',
    },
    {
      title: 'Scheduled Time',
      dataIndex: 'scheduleTime',
      width: 170,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      width: 200,
      ellipsis: true,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Queue Monitor"
        description="Theo dõi các job đang chờ và đang xử lý trong BullMQ"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => setStatusFilter(undefined)}>
            Refresh
          </Button>
        }
      />

      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Lọc theo status"
          allowClear
          style={{ width: 180 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={QUEUE_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <Text type="secondary">{queueJobs.length} jobs trong queue</Text>
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
