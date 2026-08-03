import { ArrowRightOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { mockAuditLogs } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { RoleTag } from '../components/common/StatusTag';
import { env } from '../config/env';
import { useAuditActions, useAuditLogs } from '../hooks/useAuditLogs';
import { useUsers } from '../hooks/useUsers';
import type { AuditLog, AuditLogItem } from '../types';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

/** Nhãn tiếng Việt cho action đã biết; action lạ thì hiện nguyên tên. */
const ACTION_LABELS: Record<string, string> = {
  USER_CREATE: 'Tạo người dùng',
  USER_UPDATE: 'Sửa người dùng',
  USER_DELETE: 'Xoá người dùng',
  SETTINGS_UPDATE: 'Sửa cài đặt chung',
  CONTENT_UPLOAD: 'Tải bài lên kho',
  CONTENT_UPDATE: 'Sửa bài',
  CONTENT_DELETE: 'Xoá bài',
  CONTENT_STATUS_CHANGE: 'Đổi trạng thái duyệt',
  CONTENT_ADS_MARK: 'Đánh dấu Đạt ADS',
  CONTENT_ASSIGN_PAGE: 'Phân bổ bài cho page',
  CONTENT_ACTIVE_TOGGLE: 'Ngưng dùng / dùng lại bài',
  CONTENT_BULK_DELETE: 'Xoá bài hàng loạt',
  CONTENT_BULK_ACTIVE: 'Ngưng dùng / dùng lại hàng loạt',
  PAGE_CREATE: 'Thêm Page',
  PAGE_UPDATE: 'Sửa Page',
  PAGE_TOKEN_UPDATE: 'Cập nhật token Page',
  PAGE_DELETE: 'Xoá Page',
  AUTOPOST_CONFIG_UPDATE: 'Sửa cài đặt đăng tự động',
  AUTOPOST_SLOT_CREATE: 'Thêm mốc giờ',
  AUTOPOST_SLOT_UPDATE: 'Sửa mốc giờ',
  AUTOPOST_SLOT_DELETE: 'Xoá mốc giờ',
  MANUAL_PUBLISH: 'Đăng bài thủ công',
  AUTO_PUBLISH: 'Bot đăng tự động',
  PUBLISH_JOB_RETRY: 'Đăng lại job hỏng',
};

const PAGE_SIZE = 20;

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export default function AuditLogsPage() {
  return env.useMock ? <MockAuditLogsPage /> : <RealAuditLogsPage />;
}

/* ─────────────────────────── Bản chạy API thật ─────────────────────────── */

function RealAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<AuditLogItem | null>(null);

  const params = {
    action,
    userId,
    from: range === null ? undefined : range[0].format('YYYY-MM-DD'),
    to: range === null ? undefined : range[1].format('YYYY-MM-DD'),
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, error } = useAuditLogs(params);
  const { data: actions } = useAuditActions();
  const { data: users } = useUsers({ limit: 100 });

  /** Đổi filter là đổi tập kết quả ⇒ phải quay về trang 1, không giữ trang cũ. */
  const resetPage = () => setPage(1);

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'Người thực hiện',
      dataIndex: 'actor',
      width: 220,
      render: (actor: AuditLogItem['actor']) =>
        actor === null ? (
          <Tag color="purple">Bot</Tag>
        ) : (
          <Space direction="vertical" size={0}>
            <Text>{actor.name}</Text>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {actor.email}
              </Text>
              <RoleTag role={actor.role} />
            </Space>
          </Space>
        ),
    },
    {
      title: 'Hành động',
      dataIndex: 'action',
      width: 190,
      render: (value: string) => actionLabel(value),
    },
    {
      title: 'Đối tượng',
      dataIndex: 'resource',
      width: 220,
      ellipsis: true,
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: 'Thay đổi',
      width: 130,
      render: (_, record) => (
        <Button size="small" onClick={() => setDetail(record)}>
          Xem chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Lịch sử thao tác — ai làm gì, lúc nào, đổi giá trị từ đâu sang đâu"
      />

      {error !== null && error !== undefined && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được lịch sử thao tác"
        />
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker
          format="DD/MM/YYYY"
          value={range}
          onChange={(value) => {
            setRange(
              value === null || value[0] === null || value[1] === null
                ? null
                : [value[0], value[1]],
            );
            resetPage();
          }}
        />
        <Select
          placeholder="Lọc theo hành động"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          value={action}
          options={(actions ?? []).map((item) => ({
            value: item,
            label: actionLabel(item),
          }))}
          onChange={(value) => {
            setAction(value);
            resetPage();
          }}
        />
        <Select
          placeholder="Lọc theo người thực hiện"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 260 }}
          value={userId}
          options={(users?.data ?? []).map((user) => ({
            value: user.id,
            label: `${user.name} (${user.email})`,
          }))}
          onChange={(value) => {
            setUserId(value);
            resetPage();
          }}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        scroll={{ x: 1000 }}
        pagination={{
          current: data?.page ?? page,
          pageSize: data?.pageSize ?? PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          showTotal: (total) => `${total} dòng`,
          onChange: setPage,
        }}
      />

      <AuditDetailDrawer log={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function AuditDetailDrawer({
  log,
  onClose,
}: {
  log: AuditLogItem | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={log !== null}
      onClose={onClose}
      width={640}
      title={log === null ? '' : actionLabel(log.action)}
    >
      {log !== null && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text type="secondary">Thời gian</Text>
            <br />
            <Text>{dayjs(log.createdAt).format('DD/MM/YYYY HH:mm:ss')}</Text>
          </div>
          <div>
            <Text type="secondary">Người thực hiện</Text>
            <br />
            {log.actor === null ? (
              <Tag color="purple">Bot</Tag>
            ) : (
              <Text>
                {log.actor.name} ({log.actor.email})
              </Text>
            )}
          </div>
          <div>
            <Text type="secondary">Đối tượng</Text>
            <br />
            <Text code>{log.resource}</Text>
          </div>

          <div>
            <Text type="secondary">Trước</Text>
            <JsonBlock value={log.beforeValue} />
          </div>
          <div>
            <Text type="secondary">Sau</Text>
            <JsonBlock value={log.afterValue} />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Giá trị nhạy cảm (token, mật khẩu, service account) đã được backend
            thay bằng <Text code>***</Text> trước khi trả về.
          </Text>
        </Space>
      )}
    </Drawer>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <Paragraph type="secondary" style={{ marginTop: 8 }}>
        — không có dữ liệu —
      </Paragraph>
    );
  }

  return (
    <Paragraph
      code
      copyable
      style={{
        whiteSpace: 'pre-wrap',
        background: '#fafafa',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        padding: 12,
        marginTop: 8,
        maxHeight: 280,
        overflow: 'auto',
      }}
    >
      {JSON.stringify(value, null, 2)}
    </Paragraph>
  );
}

/* ───────────────────────────── Bản mock (ADR-005) ──────────────────────── */

function MockAuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string | undefined>();

  const actions = [...new Set(mockAuditLogs.map((log) => log.action))];

  const filtered = useMemo(() => {
    return mockAuditLogs.filter((log) => {
      const matchSearch =
        search === '' ||
        log.userEmail.toLowerCase().includes(search.toLowerCase()) ||
        log.resource.toLowerCase().includes(search.toLowerCase());
      const matchAction =
        actionFilter === undefined || log.action === actionFilter;
      return matchSearch && matchAction;
    });
  }, [search, actionFilter]);

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'User',
      dataIndex: 'userEmail',
      width: 200,
      render: (email: string, record) => (
        <Space direction="vertical" size={0}>
          <Text>{email}</Text>
          <RoleTag role={record.userRole} />
        </Space>
      ),
    },
    {
      title: 'Hành động',
      dataIndex: 'action',
      width: 190,
      render: (value: string) => actionLabel(value),
    },
    {
      title: 'Đối tượng',
      dataIndex: 'resource',
      width: 180,
      render: (value: string) => <Text code>{value}</Text>,
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
        description="Lịch sử hoạt động hệ thống (dữ liệu mock)"
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Tìm theo email hoặc resource..."
          allowClear
          style={{ width: 300 }}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          placeholder="Lọc hành động"
          allowClear
          style={{ width: 220 }}
          options={actions.map((item) => ({
            value: item,
            label: actionLabel(item),
          }))}
          onChange={setActionFilter}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 15, showTotal: (total) => `${total} logs` }}
        scroll={{ x: 1000 }}
      />
    </div>
  );
}
