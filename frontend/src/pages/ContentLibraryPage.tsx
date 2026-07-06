import {
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  Button,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { mockContent } from '../api/mock/data';
import { PageHeader } from '../components/common/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import type { ContentAsset } from '../types';
import { MEDIA_TYPE_LABELS } from '../utils/constants';
import { can } from '../utils/permissions';

const { Text, Paragraph } = Typography;

export default function ContentLibraryPage() {
  const { user } = useAuth();
  const [data, setData] = useState(mockContent);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [approvedFilter, setApprovedFilter] = useState<boolean | undefined>();
  const [selected, setSelected] = useState<ContentAsset | null>(null);
  const [syncing, setSyncing] = useState(false);

  const categories = [...new Set(mockContent.map((c) => c.category))];

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const matchSearch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.sheetRowId.toLowerCase().includes(search.toLowerCase());
      const matchCategory = !categoryFilter || item.category === categoryFilter;
      const matchApproved =
        approvedFilter === undefined || item.approved === approvedFilter;
      return matchSearch && matchCategory && matchApproved;
    });
  }, [data, search, categoryFilter, approvedFilter]);

  const toggleApprove = (id: string) => {
    setData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, approved: !item.approved } : item,
      ),
    );
    message.success('Cập nhật trạng thái duyệt (mock)');
  };

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Sync hoàn tất: created 2, updated 1, skipped 3');
    }, 1500);
  };

  const columns: ColumnsType<ContentAsset> = [
    {
      title: 'ID',
      dataIndex: 'sheetRowId',
      width: 100,
      render: (v) => <Text code>{v}</Text>,
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      ellipsis: true,
    },
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
      render: (v: 'image' | 'video') => (
        <Tag color={v === 'video' ? 'purple' : 'blue'}>{MEDIA_TYPE_LABELS[v]}</Tag>
      ),
    },
    {
      title: 'Duyệt',
      dataIndex: 'approved',
      width: 100,
      render: (approved: boolean, record) =>
        can(user!.role, 'content:approve') ? (
          <Button
            size="small"
            type={approved ? 'primary' : 'default'}
            icon={approved ? <CheckOutlined /> : <CloseOutlined />}
            onClick={() => toggleApprove(record.id)}
          >
            {approved ? 'Đã duyệt' : 'Chưa duyệt'}
          </Button>
        ) : (
          <Tag color={approved ? 'success' : 'default'}>
            {approved ? 'Đã duyệt' : 'Chưa duyệt'}
          </Tag>
        ),
    },
    {
      title: 'Owner',
      dataIndex: 'owner',
      width: 130,
    },
    {
      title: 'Cập nhật',
      dataIndex: 'updatedAt',
      width: 150,
      render: (v) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '',
      width: 60,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => setSelected(record)}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Content Library"
        description="Quản lý nội dung sync từ Google Sheet"
        extra={
          can(user!.role, 'content:sync') && (
            <Button
              type="primary"
              icon={<SyncOutlined spin={syncing} />}
              loading={syncing}
              onClick={handleSync}
            >
              Sync Google Sheet
            </Button>
          )
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Tìm theo title hoặc ID..."
          allowClear
          style={{ width: 280 }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          placeholder="Category"
          allowClear
          style={{ width: 150 }}
          options={categories.map((c) => ({ value: c, label: c }))}
          onChange={setCategoryFilter}
        />
        <Select
          placeholder="Trạng thái duyệt"
          allowClear
          style={{ width: 160 }}
          options={[
            { value: true, label: 'Đã duyệt' },
            { value: false, label: 'Chưa duyệt' },
          ]}
          onChange={setApprovedFilter}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 10, showTotal: (t) => `${t} items` }}
        scroll={{ x: 900 }}
      />

      <Drawer
        title={selected?.title}
        open={!!selected}
        onClose={() => setSelected(null)}
        width={480}
      >
        {selected && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">Sheet ID</Text>
              <br />
              <Text code>{selected.sheetRowId}</Text>
            </div>
            <div>
              <Text type="secondary">Caption</Text>
              <Paragraph>{selected.caption}</Paragraph>
            </div>
            <div>
              <Text type="secondary">Drive URL</Text>
              <br />
              <a href={selected.driveUrl} target="_blank" rel="noreferrer">
                {selected.driveUrl}
              </a>
            </div>
            <div>
              <Text type="secondary">Media type</Text>
              <br />
              <Tag>{MEDIA_TYPE_LABELS[selected.mediaType]}</Tag>
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
