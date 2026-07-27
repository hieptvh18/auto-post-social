import { FacebookOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { ApiError } from '../../api/client';
import { usePageConnections, useRevokeConnection } from '../../hooks/usePages';
import type { FacebookConnectionResponse } from '../../types';

const { Text } = Typography;

/** Dưới ngưỡng này thì cảnh báo — trùng ngưỡng cảnh báo token của backend. */
const EXPIRY_WARNING_DAYS = 7;

interface Props {
  onReconnect: () => void;
  onPickPages: (connectionId: string) => void;
  reconnecting: boolean;
}

/**
 * Tài khoản Facebook đã đăng nhập (plan 15 §3.7).
 *
 * Điểm dễ hiểu nhầm nhất và phải nói thẳng ra: user token hết hạn **không** làm bot
 * ngừng đăng — Page token là token riêng, không có hạn. Hết hạn chỉ mất khả năng
 * đồng bộ page mới và lấy lại token.
 */
export function ConnectionsCard({
  onReconnect,
  onPickPages,
  reconnecting,
}: Props) {
  const { data: connections, isLoading } = usePageConnections();
  const revokeMutation = useRevokeConnection();

  const expiring = (connections ?? []).filter(
    (c) => c.daysUntilExpire !== null && c.daysUntilExpire <= EXPIRY_WARNING_DAYS,
  );

  const handleRevoke = async (id: string): Promise<void> => {
    try {
      await revokeMutation.mutateAsync(id);
      message.success('Đã ngắt kết nối — các page vẫn đăng bài bình thường');
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Ngắt kết nối thất bại');
    }
  };

  const columns: ColumnsType<FacebookConnectionResponse> = [
    {
      title: 'Tài khoản Facebook',
      dataIndex: 'fbUserName',
      render: (name: string | null, record) => (
        <>
          <div>{name ?? '(không tên)'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.fbUserId}
          </Text>
        </>
      ),
    },
    {
      title: 'Số page',
      dataIndex: 'pageCount',
      width: 90,
    },
    {
      title: 'Hạn kết nối',
      dataIndex: 'daysUntilExpire',
      width: 190,
      render: (days: number | null, record) => {
        if (days === null) return <Tag color="success">Không hết hạn</Tag>;
        if (days < 0) return <Tag color="error">Đã hết hạn</Tag>;
        return (
          <Tag color={days <= EXPIRY_WARNING_DAYS ? 'warning' : 'success'}>
            Còn {days} ngày ·{' '}
            {dayjs(record.tokenExpireAt).format('DD/MM/YYYY')}
          </Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      width: 250,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => onPickPages(record.id)}>
            Chọn page
          </Button>
          <Button type="link" size="small" onClick={onReconnect} loading={reconnecting}>
            Kết nối lại
          </Button>
          <Popconfirm
            title="Ngắt kết nối tài khoản này?"
            description="Các page đang chạy giữ nguyên token và vẫn đăng bài được."
            okButtonProps={{ danger: true, loading: revokeMutation.isPending }}
            onConfirm={() => void handleRevoke(record.id)}
          >
            <Button type="link" size="small" danger>
              Ngắt
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!isLoading && (connections ?? []).length === 0) return null;

  return (
    <Card
      size="small"
      title={
        <Space>
          <FacebookOutlined />
          Tài khoản Facebook đã kết nối
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {expiring.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Kết nối sắp hết hạn"
          description={
            <>
              Các page đang chạy <b>vẫn đăng bài bình thường</b> — Page token không
              hết hạn. Nhưng sau ngày đó sẽ không đồng bộ được page mới và không lấy
              lại được token nếu có sự cố. Bấm <b>Kết nối lại</b> để làm mới.
            </>
          }
        />
      )}

      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        columns={columns}
        dataSource={connections ?? []}
        pagination={false}
      />
    </Card>
  );
}
