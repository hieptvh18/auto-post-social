import { ArrowRightOutlined } from '@ant-design/icons';
import { Input, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { mockAuditLogs } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { RoleTag } from '../components/common/StatusTag';
import type { AuditLog } from '../types';

const { Text } = Typography;

const ACTION_LABELS: Record<string, string> = {
  CONTENT_UPLOAD: 'Upload content',
  CONTENT_STATUS_CHANGE: 'Đổi trạng thái duyệt',
  CONTENT_ADS_MARK: 'Đánh dấu Đạt ADS',
  AUTOPOST_CONFIG_UPDATE: 'Sửa cài đặt đăng tự động',
  JOB_RETRY: 'Retry job',
  PAGE_TOKEN_UPDATE: 'Cập nhật token',
  USER_CREATE: 'Tạo user',
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string | undefined>();

  const actions = [...new Set(mockAuditLogs.map((l) => l.action))];

  const filtered = useMemo(() => {
    return mockAuditLogs.filter((log) => {
      const matchSearch =
        !search ||
        log.userEmail.toLowerCase().includes(search.toLowerCase()) ||
        log.resource.toLowerCase().includes(search.toLowerCase());
      const matchAction = !actionFilter || log.action === actionFilter;
      return matchSearch && matchAction;
    });
  }, [search, actionFilter]);

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      width: 170,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'User',
      dataIndex: 'userEmail',
      width: 200,
      render: (email, record) => (
        <Space direction="vertical" size={0}>
          <Text>{email}</Text>
          <RoleTag role={record.userRole} />
        </Space>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 160,
      render: (v) => ACTION_LABELS[v] ?? v,
    },
    {
      title: 'Resource',
      dataIndex: 'resource',
      width: 180,
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: 'Thay đổi',
      width: 200,
      render: (_, record) => (
        <Space>
          <Text type="secondary">{record.oldValue ?? '—'}</Text>
          <ArrowRightOutlined style={{ color: '#1677ff' }} />
          <Text strong>{record.newValue ?? '—'}</Text>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Lịch sử hoạt động hệ thống — ai làm gì, khi nào"
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Tìm theo email hoặc resource..."
          allowClear
          style={{ width: 300 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          placeholder="Lọc action"
          allowClear
          style={{ width: 200 }}
          options={actions.map((a) => ({
            value: a,
            label: ACTION_LABELS[a] ?? a,
          }))}
          onChange={setActionFilter}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 15, showTotal: (t) => `${t} logs` }}
        scroll={{ x: 1000 }}
      />
    </div>
  );
}
