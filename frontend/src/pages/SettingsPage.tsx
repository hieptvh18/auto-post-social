import { CheckCircleOutlined, GoogleOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Space,
  Spin,
  Tabs,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { settingsApi } from '../api/settings.api';
import { PageHeader } from '../components/common/PageHeader';
import { FacebookAppSettings } from '../components/pages/FacebookAppSettings';
import { env } from '../config/env';
import type { DriveAuthMode, DriveSettingsResponse } from '../types';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

/**
 * Cài đặt Google Drive — nối API thật khi VITE_USE_MOCK=false (ADR-005, ADR-014).
 * Hỗ trợ 2 chế độ xác thực (plan 03c):
 *  - service_account: SA JSON + Shared Drive (Google Workspace).
 *  - oauth2: kết nối bằng tài khoản Google của user (Gmail free, 15GB).
 */
interface DriveSettingsForm {
  authMode: DriveAuthMode;
  folderId?: string;
  serviceAccountJson?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  maxUploadMb: number;
}

interface SavedDriveSettings {
  authMode: DriveAuthMode;
  folderId: string;
  maxUploadMb: number;
  hasServiceAccount: boolean;
  serviceAccountEmail: string | null;
  hasOauthClient: boolean;
  oauthConnected: boolean;
  oauthAccountEmail: string | null;
  usingEnvFallback: boolean;
}

const MOCK_SAVED: SavedDriveSettings = {
  authMode: 'service_account',
  folderId: '',
  maxUploadMb: 300,
  hasServiceAccount: false,
  serviceAccountEmail: null,
  hasOauthClient: false,
  oauthConnected: false,
  oauthAccountEmail: null,
  usingEnvFallback: true,
};

function toSaved(res: DriveSettingsResponse): SavedDriveSettings {
  return {
    authMode: res.authMode,
    folderId: res.folderId ?? '',
    maxUploadMb: res.maxUploadMb,
    hasServiceAccount: res.hasServiceAccount,
    serviceAccountEmail: res.serviceAccountEmail,
    hasOauthClient: res.hasOauthClient,
    oauthConnected: res.oauthConnected,
    oauthAccountEmail: res.oauthAccountEmail,
    usingEnvFallback: res.usingEnvFallback,
  };
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Đọc kết quả redirect OAuth (?drive_oauth=success|error&reason=...) rồi dọn URL. */
function consumeOauthRedirect(): 'success' | { error: string } | null {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('drive_oauth');
  if (status === null) return null;
  const reason = params.get('reason');
  window.history.replaceState({}, '', window.location.pathname);
  if (status === 'success') return 'success';
  return { error: reason ?? 'Kết nối Google thất bại' };
}

function GoogleDriveSettings() {
  const [form] = Form.useForm<DriveSettingsForm>();
  const [loading, setLoading] = useState(!env.useMock);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saved, setSaved] = useState(MOCK_SAVED);
  const authMode = Form.useWatch('authMode', form) ?? saved.authMode;

  // Nạp cấu hình + xử lý redirect OAuth (bỏ qua khi chạy mock).
  useEffect(() => {
    if (env.useMock) return;
    let alive = true;
    const redirect = consumeOauthRedirect();
    void (async () => {
      try {
        if (redirect === 'success') {
          void message.success('Đã kết nối tài khoản Google');
        } else if (redirect !== null) {
          void message.error(`Kết nối Google thất bại: ${redirect.error}`);
        }
        const res = await settingsApi.getDrive();
        if (!alive) return;
        setSaved(toSaved(res));
      } catch (err) {
        if (alive)
          void message.error(errMessage(err, 'Không tải được cấu hình Google Drive'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // Chỉ chạy 1 lần lúc mount.

  }, []);

  const handleSave = async (values: DriveSettingsForm) => {
    setSaving(true);
    try {
      if (env.useMock) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        setSaved({
          ...saved,
          authMode: values.authMode,
          folderId: values.folderId ?? '',
          maxUploadMb: values.maxUploadMb,
          hasServiceAccount:
            saved.hasServiceAccount || Boolean(values.serviceAccountJson),
          hasOauthClient: saved.hasOauthClient || Boolean(values.oauthClientId),
          usingEnvFallback: false,
        });
      } else {
        const res = await settingsApi.updateDrive({
          authMode: values.authMode,
          folderId: values.folderId ?? null,
          // Chỉ gửi secret khi user nhập mới; để trống = giữ nguyên bản đã lưu.
          ...(values.serviceAccountJson
            ? { serviceAccountJson: values.serviceAccountJson }
            : {}),
          ...(values.oauthClientId !== undefined
            ? { oauthClientId: values.oauthClientId }
            : {}),
          ...(values.oauthClientSecret
            ? { oauthClientSecret: values.oauthClientSecret }
            : {}),
          maxUploadMb: values.maxUploadMb,
        });
        setSaved(toSaved(res));
      }
      form.setFieldsValue({
        serviceAccountJson: undefined,
        oauthClientSecret: undefined,
      });
      void message.success('Đã lưu cấu hình Google Drive');
    } catch (err) {
      void message.error(errMessage(err, 'Lưu cấu hình thất bại'));
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGoogle = async () => {
    setConnecting(true);
    try {
      if (env.useMock) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        void message.info('Mock: bỏ qua OAuth, coi như đã kết nối');
        setSaved({
          ...saved,
          oauthConnected: true,
          oauthAccountEmail: 'demo@gmail.com',
        });
        return;
      }
      const { url } = await settingsApi.getOauthUrl();
      // Rời trang sang màn consent của Google; quay lại /settings?drive_oauth=...
      window.location.href = url;
    } catch (err) {
      void message.error(errMessage(err, 'Không tạo được liên kết kết nối Google'));
    } finally {
      setConnecting(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      if (env.useMock) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        void message.success('Kết nối thành công');
      } else {
        const res = await settingsApi.testDrive();
        void message.success(res.message);
      }
    } catch (err) {
      void message.error(errMessage(err, 'Kết nối thất bại — kiểm tra lại cấu hình'));
    } finally {
      setTesting(false);
    }
  };

  const readFileAsText: UploadProps['beforeUpload'] = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      form.setFieldValue('serviceAccountJson', String(reader.result ?? ''));
    };
    reader.readAsText(file);
    return false;
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Space direction="vertical">
          <Spin />
          <Text type="secondary">Đang tải cấu hình...</Text>
        </Space>
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 720 }}>
      {saved.usingEnvFallback && (
        <Alert
          type="info"
          showIcon
          message="Đang chạy bằng cấu hình mặc định từ .env"
          description="Chưa có cấu hình nào được lưu ở đây — hệ thống dùng giá trị fallback trong biến môi trường backend. Lưu form bên dưới để chuyển sang cấu hình động."
        />
      )}

      <Form<DriveSettingsForm>
        form={form}
        layout="vertical"
        initialValues={{
          authMode: saved.authMode,
          folderId: saved.folderId,
          maxUploadMb: saved.maxUploadMb,
        }}
        onFinish={handleSave}
      >
        <Form.Item
          name="authMode"
          label="Chế độ xác thực"
          rules={[{ required: true }]}
          extra="OAuth2 dùng được với Gmail cá nhân (15GB). Service account cần Shared Drive (Google Workspace)."
        >
          <Radio.Group>
            <Radio.Button value="oauth2">OAuth2 (tài khoản Google)</Radio.Button>
            <Radio.Button value="service_account">Service Account</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {authMode === 'oauth2' && (
          <>
            <Divider plain>
              OAuth2 — tài khoản Google
            </Divider>
            <Form.Item
              name="oauthClientId"
              label="OAuth Client ID"
              rules={[{ required: true, message: 'Nhập OAuth Client ID' }]}
              extra="Tạo ở Google Cloud Console → Credentials → OAuth client ID (Web application)."
            >
              <Input placeholder="xxxx.apps.googleusercontent.com" />
            </Form.Item>
            <Form.Item
              name="oauthClientSecret"
              label="OAuth Client Secret"
              extra={
                saved.hasOauthClient
                  ? 'Đã lưu — để trống nếu giữ nguyên, nhập mới để thay thế.'
                  : 'Bắt buộc lần đầu.'
              }
              rules={[
                {
                  required: !saved.hasOauthClient,
                  message: 'Nhập OAuth Client Secret',
                },
              ]}
            >
              <Input.Password placeholder="GOCSPX-..." />
            </Form.Item>
            <Form.Item
              name="folderId"
              label="Folder ID đích (tuỳ chọn)"
              extra="Để trống = upload vào My Drive gốc của tài khoản đã kết nối."
            >
              <Input placeholder="1abc_folder_id (tuỳ chọn)" />
            </Form.Item>

            <Form.Item label="Kết nối tài khoản Google">
              <Space direction="vertical" style={{ width: '100%' }}>
                {saved.oauthConnected ? (
                  <Text type="success">
                    <CheckCircleOutlined style={{ marginRight: 6 }} />
                    Đã kết nối
                    {saved.oauthAccountEmail ? ` (${saved.oauthAccountEmail})` : ''}
                  </Text>
                ) : (
                  <Text type="secondary">
                    Chưa kết nối. Lưu Client ID/Secret trước, rồi bấm nút bên dưới để
                    cấp quyền.
                  </Text>
                )}
                <Button
                  icon={<GoogleOutlined />}
                  loading={connecting}
                  disabled={!saved.hasOauthClient}
                  onClick={handleConnectGoogle}
                >
                  {saved.oauthConnected ? 'Kết nối lại' : 'Kết nối Google'}
                </Button>
              </Space>
            </Form.Item>
          </>
        )}

        {authMode === 'service_account' && (
          <>
            <Divider plain>
              Service Account — Shared Drive
            </Divider>
            <Form.Item
              name="folderId"
              label="Folder ID (Shared Drive)"
              rules={[
                { required: true, message: 'Bắt buộc khi dùng service account' },
              ]}
            >
              <Input placeholder="1abc_folder_id" />
            </Form.Item>

            <Form.Item label="Service Account JSON">
              <Space direction="vertical" style={{ width: '100%' }}>
                {saved.hasServiceAccount && (
                  <Text type="secondary">
                    <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                    Đã cấu hình
                    {saved.serviceAccountEmail
                      ? ` (${saved.serviceAccountEmail})`
                      : ''}{' '}
                    — dán JSON mới để thay thế, để trống nếu giữ nguyên.
                  </Text>
                )}
                <Upload
                  accept=".json"
                  showUploadList={false}
                  beforeUpload={readFileAsText}
                >
                  <Button>Tải file service-account.json</Button>
                </Upload>
                <Form.Item name="serviceAccountJson" noStyle>
                  <TextArea
                    rows={6}
                    placeholder='{ "type": "service_account", "client_email": "...", ... }'
                  />
                </Form.Item>
              </Space>
            </Form.Item>
          </>
        )}

        <Form.Item
          name="maxUploadMb"
          label="Giới hạn dung lượng 1 file (MB)"
          rules={[{ required: true }]}
        >
          <InputNumber min={1} max={2048} style={{ width: 200 }} />
        </Form.Item>

        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>
            Lưu cấu hình
          </Button>
          <Button onClick={handleTestConnection} loading={testing}>
            Test kết nối
          </Button>
        </Space>
      </Form>

      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        <Text strong>OAuth2:</Text> hợp với Gmail cá nhân — file thuộc tài khoản đã kết
        nối, tính vào 15GB. <Text strong>Service Account:</Text> chỉ ghi được vào{' '}
        <Text strong>Shared Drive</Text> (Google Workspace) và phải share quyền Editor
        cho email service account. Nút <Text strong>Test kết nối</Text> dùng cấu hình{' '}
        <Text strong>đã lưu</Text> — hãy Lưu (và Kết nối Google nếu dùng OAuth2) trước
        khi test.
      </Paragraph>
    </Space>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Cài đặt chung"
        description="Cấu hình động cho hệ thống — sửa ở đây có hiệu lực ngay, không cần deploy lại"
      />
      <Tabs
        items={[
          {
            key: 'google-drive',
            label: 'Google Drive',
            children: <GoogleDriveSettings />,
          },
          {
            key: 'facebook-app',
            label: 'Facebook App',
            children: <FacebookAppSettings />,
          },
        ]}
      />
    </>
  );
}
