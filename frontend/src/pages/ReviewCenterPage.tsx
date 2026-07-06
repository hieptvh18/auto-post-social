import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import {
  Button,
  Drawer,
  Form,
  Image,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { ContentStatusTag } from '../components/common/StatusTag';
import { useAuth } from '../contexts/AuthContext';
import { useMockData } from '../contexts/MockDataContext';
import type { ContentAsset } from '../types';
import { MEDIA_TYPE_LABELS } from '../utils/constants';
import { can } from '../utils/permissions';

const { Text, Paragraph } = Typography;

export default function ReviewCenterPage() {
  const { user } = useAuth();
  const { content, approveContent, rejectContent } = useMockData();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ContentAsset | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ContentAsset | null>(null);
  const [rejectForm] = Form.useForm();

  const waiting = useMemo(() => {
    return content
      .filter((c) => c.status === 'WAITING_APPROVAL')
      .filter(
        (c) =>
          !search ||
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => dayjs(b.updatedAt).unix() - dayjs(a.updatedAt).unix());
  }, [content, search]);

  const handleApprove = (id: string) => {
    approveContent(id, user.email);
    message.success('Đã duyệt — tài nguyên chuyển sang Đội đăng bài');
  };

  const handleReject = (values: { comment: string }) => {
    if (!rejectTarget) return;
    rejectContent(rejectTarget.id, values.comment);
    setRejectTarget(null);
    rejectForm.resetFields();
    message.warning('Đã từ chối — Content Team cần sửa và gửi lại');
  };

  const columns: ColumnsType<ContentAsset> = [
    {
      title: 'ID',
      dataIndex: 'code',
      width: 110,
      render: (v) => <Text code>{v}</Text>,
    },
    { title: 'Tiêu đề', dataIndex: 'title', ellipsis: true },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 120,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: 'Media',
      dataIndex: 'mediaType',
      width: 90,
      render: (v) => <Tag>{MEDIA_TYPE_LABELS[v as 'image' | 'video']}</Tag>,
    },
    {
      title: 'Người tạo',
      dataIndex: 'createdBy',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Gửi lúc',
      dataIndex: 'updatedAt',
      width: 150,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '',
      width: 220,
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<EyeOutlined />} onClick={() => setSelected(record)} />
          {can(user.role, 'content:review') && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleApprove(record.id)}
              >
                Duyệt
              </Button>
              <Button
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => setRejectTarget(record)}
              >
                Từ chối
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Review Center"
        description="Sếp duyệt tài nguyên Content Team đã upload — approve hoặc reject kèm lý do"
      />

      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Tìm theo title hoặc ID..."
          allowClear
          style={{ width: 320 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Text type="secondary">{waiting.length} tài nguyên chờ duyệt</Text>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={waiting}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
        locale={{ emptyText: 'Không có tài nguyên chờ duyệt' }}
      />

      <Drawer
        title={selected?.title}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={560}
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {selected.thumbnailUrl && (
              <Image src={selected.thumbnailUrl} alt={selected.title} style={{ borderRadius: 8 }} />
            )}
            <div>
              <Text type="secondary">Mã tài nguyên</Text>
              <br />
              <Text code>{selected.code}</Text>
            </div>
            <div>
              <Text type="secondary">Trạng thái</Text>
              <br />
              <ContentStatusTag status={selected.status} />
            </div>
            <div>
              <Text type="secondary">Category</Text>
              <br />
              <Tag>{selected.category}</Tag>
            </div>
            <div>
              <Text type="secondary">Mô tả ngắn</Text>
              <Paragraph>{selected.description}</Paragraph>
            </div>
            <div>
              <Text type="secondary">Người upload</Text>
              <br />
              <Text>{selected.createdBy}</Text>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title={`Từ chối — ${rejectTarget?.code}`}
        open={!!rejectTarget}
        onCancel={() => {
          setRejectTarget(null);
          rejectForm.resetFields();
        }}
        onOk={() => rejectForm.submit()}
        okText="Từ chối"
        okButtonProps={{ danger: true }}
      >
        <Form form={rejectForm} layout="vertical" onFinish={handleReject}>
          <Form.Item
            name="comment"
            label="Lý do từ chối"
            rules={[{ required: true, message: 'Bắt buộc nhập lý do từ chối' }]}
          >
            <Input.TextArea rows={4} placeholder="Ví dụ: Ảnh chưa đúng tỷ lệ, cần upload lại..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
