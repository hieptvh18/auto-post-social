import { Alert, Modal, Spin, Tag, Timeline, Typography } from 'antd';
import { usePublishJobEvents } from '../../hooks/usePublishSchedule';
import type { PublishJobEventType } from '../../types';

const { Text } = Typography;

const EVENT_LABELS: Record<PublishJobEventType, string> = {
  ENQUEUED: 'Đã xếp hàng',
  STARTED: 'Bắt đầu đăng',
  SUCCEEDED: 'Đăng thành công',
  FAILED: 'Thất bại',
  RETRY_SCHEDULED: 'Sẽ thử lại',
  GAVE_UP: 'Dừng lại, không thử nữa',
};

const EVENT_COLORS: Record<PublishJobEventType, string> = {
  ENQUEUED: 'blue',
  STARTED: 'orange',
  SUCCEEDED: 'green',
  FAILED: 'red',
  RETRY_SCHEDULED: 'gold',
  GAVE_UP: 'red',
};

interface Props {
  jobId: string | null;
  jobTitle?: string;
  onClose: () => void;
}

/** Nhật ký kỹ thuật của một job (`publish_job_events`) — mở khi cần điều tra bài lỗi. */
export function JobEventsModal({ jobId, jobTitle, onClose }: Props) {
  const { data, isLoading, error } = usePublishJobEvents(jobId);

  return (
    <Modal
      open={jobId !== null}
      onCancel={onClose}
      footer={null}
      width={640}
      title={`Nhật ký đăng bài${jobTitle === undefined ? '' : `: ${jobTitle}`}`}
    >
      {isLoading && <Spin />}
      {error !== null && error !== undefined && (
        <Alert type="error" message="Không tải được nhật ký của job này" />
      )}
      {data !== undefined && data.length === 0 && (
        <Text type="secondary">Job này chưa có dòng nhật ký nào.</Text>
      )}
      {data !== undefined && data.length > 0 && (
        <Timeline
          items={data.map((event) => ({
            color: EVENT_COLORS[event.event],
            children: (
              <div>
                <Tag color={EVENT_COLORS[event.event]}>
                  {EVENT_LABELS[event.event]}
                </Tag>
                <Tag>Lần {event.attemptNo}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(event.createdAt).toLocaleString('vi-VN')}
                </Text>
                {event.message !== null && (
                  <div style={{ marginTop: 4 }}>
                    <Text>{event.message}</Text>
                  </div>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Modal>
  );
}
