import { CopyOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { settingsApi } from '../../api/settings.api';
import { env } from '../../config/env';
import type { FacebookAppSettingsResponse } from '../../types';

const { Text, Paragraph } = Typography;

interface FacebookAppForm {
  appId: string;
  appSecret?: string;
}

/**
 * Khai báo Meta app cho luồng "Đăng nhập bằng Facebook" (plan 15 §3.2).
 * Lưu trong `app_settings`, không phải `.env` (ADR-014) — sửa xong có hiệu lực ngay.
 */
export function FacebookAppSettings() {
  const [form] = Form.useForm<FacebookAppForm>();
  const [loading, setLoading] = useState(!env.useMock);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<FacebookAppSettingsResponse | null>(null);

  useEffect(() => {
    if (env.useMock) return;
    let alive = true;
    void (async () => {
      try {
        const res = await settingsApi.getFacebookApp();
        if (!alive) return;
        setSaved(res);
        form.setFieldsValue({ appId: res.appId ?? '' });
      } catch (err) {
        void message.error(
          err instanceof ApiError ? err.message : 'Không tải được cấu hình Facebook App',
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [form]);

  const handleSubmit = async (values: FacebookAppForm): Promise<void> => {
    setSaving(true);
    try {
      // Để trống = giữ nguyên secret đã lưu (backend không đổ secret cũ xuống client).
      const res = await settingsApi.updateFacebookApp({
        appId: values.appId.trim(),
        ...(values.appSecret ? { appSecret: values.appSecret } : {}),
      });
      setSaved(res);
      form.setFieldsValue({ appSecret: '' });
      void message.success('Đã lưu cấu hình Facebook App');
    } catch (err) {
      void message.error(
        err instanceof ApiError ? err.message : 'Lưu cấu hình thất bại',
      );
    } finally {
      setSaving(false);
    }
  };

  const copyRedirectUri = (): void => {
    if (saved === null) return;
    void navigator.clipboard.writeText(saved.redirectUri);
    void message.success('Đã copy Redirect URI');
  };

  if (loading) return <Spin />;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 720 }}>
      <Alert
        type="info"
        showIcon
        message="Trước khi khai báo"
        description={
          <>
            Vào Meta for Developers → app của bạn → <Text strong>App roles</Text>, thêm
            tài khoản Facebook của bạn với vai trò <Text strong>Tester</Text> trở lên.
            Thiếu bước này, đăng nhập vẫn thành công nhưng danh sách Page sẽ rỗng.
          </>
        }
      />

      {saved?.usingEnvFallback === true && (
        <Alert
          type="warning"
          showIcon
          message="Đang dùng giá trị từ .env"
          description="Lưu cấu hình ở đây để chuyển sang bản trong database, sửa được không cần restart."
        />
      )}

      <Form form={form} layout="vertical" onFinish={(v) => void handleSubmit(v)}>
        <Form.Item
          name="appId"
          label="App ID"
          rules={[{ required: true, message: 'Nhập App ID của Meta app' }]}
        >
          <Input placeholder="1029384756102938" />
        </Form.Item>

        <Form.Item
          name="appSecret"
          label={
            <Space>
              App Secret
              {saved?.hasAppSecret === true && <Tag color="success">Đã lưu</Tag>}
            </Space>
          }
          rules={[{ required: saved?.hasAppSecret !== true }]}
          extra={
            saved?.hasAppSecret === true
              ? 'Để trống nếu không đổi secret'
              : 'Mã hoá AES-256-GCM trước khi lưu, không bao giờ trả lại qua API'
          }
        >
          <Input.Password placeholder="••••••••••••••••" />
        </Form.Item>

        <Form.Item
          label="Redirect URI"
          extra={
            <>
              Dán đúng chuỗi này vào{' '}
              <Text strong>Facebook Login → Settings → Valid OAuth Redirect URIs</Text>.
              Lệch một ký tự là Meta chặn ở bước đăng nhập.
            </>
          }
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input readOnly value={saved?.redirectUri ?? ''} />
            <Button icon={<CopyOutlined />} onClick={copyRedirectUri}>
              Copy
            </Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="Quyền sẽ xin khi đăng nhập">
          <Space wrap>
            <Tag>pages_show_list</Tag>
            <Tag>pages_read_engagement</Tag>
            <Tag>pages_manage_posts</Tag>
            <Tag>business_management</Tag>
          </Space>
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={saving}>
          Lưu cấu hình
        </Button>
      </Form>

      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Khai báo xong, vào <Text strong>Quản lý Page</Text> bấm{' '}
        <Text strong>Kết nối bằng Facebook</Text> để lấy Page token. Token lấy theo
        đường này <Text strong>không có hạn dùng</Text> — không cần System User.
      </Paragraph>
    </Space>
  );
}
