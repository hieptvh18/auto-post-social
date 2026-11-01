import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { OverviewTab } from './dashboard/OverviewTab';
import { PublishReportTab } from './dashboard/PublishReportTab';

type DashboardTab = 'report' | 'overview';

/**
 * Màn Tổng quan chia 2 tab (plan 35):
 * - "Thống kê đăng bài" — page nào đã đăng bao nhiêu bài theo ngày/tháng.
 * - "Tổng quan hệ thống" — màn Dashboard cũ (plan 14), giữ nguyên.
 *
 * Tab đang mở nằm trong URL (`?tab=`) để F5/chia sẻ link vẫn đúng tab. Chỉ tab
 * đang mở được render ⇒ tab kia không gọi API thừa.
 */
export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: DashboardTab =
    searchParams.get('tab') === 'overview' ? 'overview' : 'report';

  return (
    <div>
      <PageHeader title="Tổng quan" />
      <Tabs
        activeKey={activeTab}
        onChange={(key) =>
          setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            params.set('tab', key);
            return params;
          })
        }
        items={[
          {
            key: 'report',
            label: 'Thống kê đăng bài',
            children: activeTab === 'report' ? <PublishReportTab /> : null,
          },
          {
            key: 'overview',
            label: 'Tổng quan hệ thống',
            children: activeTab === 'overview' ? <OverviewTab /> : null,
          },
        ]}
      />
    </div>
  );
}
