import { SendOutlined } from '@ant-design/icons';
import {
  Alert,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message as antMessage,
} from 'antd';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useCategorySuggestions,
  useContentAssets,
} from '../../hooks/useContentAssets';
import { useManualPost } from '../../hooks/useManualPost';
import type { ContentAssetResponse, MediaType } from '../../types';
import { MEDIA_TYPE_LABELS } from '../../utils/constants';
import { mergeCategoryOptions } from '../../utils/categories';

const { Text } = Typography;

/** Chọn nhiều hơn số này thì kéo danh sách quá dài — user nên lọc theo danh mục. */
const CONTENT_PAGE_SIZE = 50;

export interface ManualPostPageOption {
  /** UUID page trong hệ thống. */
  pageId: string;
  pageName: string;
  isActive: boolean;
}

interface ManualPostModalProps {
  open: boolean;
  pages: ManualPostPageOption[];
  /** Page bấm nút "Đăng ngay" — dùng làm giá trị mặc định. */
  defaultPageId?: string;
  onClose: () => void;
}

interface ManualPostFormValues {
  pageId: string;
  caption: string;
  hashtags?: string;
}

/**
 * Đăng tay 1 bài lên 1 page, có hiệu lực ngay: backend gọi thẳng Graph API rồi
 * mới trả về. Không liên quan tới cron/slot ở trang này.
 */
export function ManualPostModal({
  open,
  pages,
  defaultPageId,
  onClose,
}: ManualPostModalProps) {
  const [form] = Form.useForm<ManualPostFormValues>();
  const [category, setCategory] = useState<string | undefined>();
  const [mediaType, setMediaType] = useState<MediaType | 'all'>('all');
  const [selected, setSelected] = useState<ContentAssetResponse | null>(null);

  const publishMutation = useManualPost();
  const { data: categorySuggestions } = useCategorySuggestions();
  const categoryOptions = mergeCategoryOptions(categorySuggestions);

  const { data: contents, isLoading } = useContentAssets({
    category,
    mediaType: mediaType === 'all' ? undefined : mediaType,
    // Bài đã "ngưng dùng" không được đem đăng (backend cũng chặn ⇒ 400).
    isActive: true,
    limit: CONTENT_PAGE_SIZE,
  });

  // Mở lại popup thì trả về trạng thái sạch, tránh giữ lựa chọn của lần trước.
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ pageId: defaultPageId ?? pages[0]?.pageId });
    setCategory(undefined);
    setMediaType('all');
    setSelected(null);
  }, [open, defaultPageId, pages, form]);

  const handleSelectContent = (content: ContentAssetResponse) => {
    setSelected(content);
    // Caption/hashtag lấy sẵn từ bài để sửa, không phải gõ lại từ đầu.
    form.setFieldsValue({
      caption: content.caption,
      hashtags: content.hashtags ?? '',
    });
  };

  const handleSubmit = async (values: ManualPostFormValues) => {
    if (selected === null) {
      antMessage.warning('Chọn 1 bài để đăng');
      return;
    }

    try {
      const result = await publishMutation.mutateAsync({
        pageId: values.pageId,
        contentAssetId: selected.id,
        caption: values.caption,
        hashtags: values.hashtags,
      });
      antMessage.success(result.message);
      onClose();
    } catch (error) {
      // 409 = bài đã đăng lên page này, 502 = Facebook/Drive trả lỗi.
      antMessage.error(
        error instanceof ApiError ? error.message : 'Đăng bài thất bại',
      );
    }
  };

  const contentOptions = contents?.data ?? [];

  return (
    <Modal
      title="Đăng bài thủ công"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Đăng ngay"
      okButtonProps={{ icon: <SendOutlined />, disabled: selected === null }}
      confirmLoading={publishMutation.isPending}
      width={640}
      maskClosable={!publishMutation.isPending}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Bài sẽ lên Facebook ngay khi bấm Đăng — không qua duyệt, không qua lịch."
      />

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="pageId"
          label="Đăng lên Page"
          rules={[{ required: true, message: 'Chọn page cần đăng' }]}
        >
          <Select
            placeholder="Chọn Facebook Page"
            options={pages.map((p) => ({
              value: p.pageId,
              label: p.isActive ? p.pageName : `${p.pageName} (tạm dừng)`,
              disabled: !p.isActive,
            }))}
          />
        </Form.Item>

        <Space size={12} style={{ marginBottom: 12, width: '100%' }} wrap>
          <Select
            allowClear
            style={{ minWidth: 220 }}
            placeholder="Lọc theo danh mục"
            value={category}
            onChange={(value?: string) => {
              setCategory(value);
              setSelected(null);
            }}
            options={categoryOptions.map((c) => ({ value: c, label: c }))}
          />
          <Radio.Group
            value={mediaType}
            onChange={(e) => {
              setMediaType(e.target.value as MediaType | 'all');
              setSelected(null);
            }}
            optionType="button"
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'image', label: MEDIA_TYPE_LABELS.image },
              { value: 'video', label: MEDIA_TYPE_LABELS.video },
            ]}
          />
        </Space>

        <div
          style={{
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            padding: 8,
            marginBottom: 16,
          }}
        >
          {isLoading ? (
            <Spin />
          ) : contentOptions.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Không có bài nào khớp bộ lọc"
            />
          ) : (
            <Radio.Group
              value={selected?.id}
              style={{ width: '100%' }}
              onChange={(e) => {
                const picked = contentOptions.find(
                  (c) => c.id === (e.target.value as string),
                );
                if (picked) handleSelectContent(picked);
              }}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {contentOptions.map((content) => (
                  <Radio key={content.id} value={content.id}>
                    <Space size={6}>
                      <Text>{content.title}</Text>
                      <Tag color={content.mediaType === 'video' ? 'purple' : 'blue'}>
                        {MEDIA_TYPE_LABELS[content.mediaType]}
                      </Tag>
                      <Tag>{content.category}</Tag>
                    </Space>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          )}
        </div>

        <Form.Item
          name="caption"
          label="Caption"
          extra="Sửa ở đây chỉ áp cho lần đăng này, không đổi caption gốc của bài"
          rules={[{ required: true, message: 'Caption không được để trống' }]}
        >
          <Input.TextArea rows={4} placeholder="Chọn 1 bài để lấy caption sẵn" />
        </Form.Item>

        <Form.Item name="hashtags" label="Hashtag">
          <Input.TextArea rows={2} placeholder="#suckhoe #phongkham" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
