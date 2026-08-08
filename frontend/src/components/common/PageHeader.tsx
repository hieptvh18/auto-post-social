import { Typography } from 'antd';
import type { ReactNode } from 'react';

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: string;
  description?: string;
  extra?: ReactNode;
}

export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      {/* minWidth:0 để khối chữ co được — không có nó, mô tả dài đẩy `extra`
          (các nút hành động) tràn ra ngoài viewport trên điện thoại. */}
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <Title level={3} style={{ margin: 0 }}>
          {title}
        </Title>
        {description && (
          <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
            {description}
          </Text>
        )}
      </div>
      {extra && <div style={{ maxWidth: '100%' }}>{extra}</div>}
    </div>
  );
}
