import { CheckCircleOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Radio,
  Space,
  Tabs,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import { useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

/**
 * Cài đặt Google Drive — dữ liệu mock, chưa nối API thật (nối ở M7, plan 08).
 * BE tương ứng: GET/PUT /settings/google-drive, POST /settings/google-drive/test
 * (xem plans/03-google-drive-upload.md).
 */
interface DriveSettingsForm {
  driver: 'real' | 'fake';
  folderId?: string;
  serviceAccountJson?: string;
  maxUploadMb: number;
}

interface SavedDriveSettings {
  driver: 'real' | 'fake';
  folderId: string;
  maxUploadMb: number;
  hasServiceAccount: boolean;
  serviceAccountEmail: string | null;
  usingEnvFallback: boolean;
}

const MOCK_SAVED: SavedDriveSettings = {
  driver: 'fake',
  folderId: '',
  maxUploadMb: 200,
  hasServiceAccount: false,
  serviceAccountEmail: null,
  usingEnvFallback: true,
};

function GoogleDriveSettings() {
  const [form] = Form.useForm<DriveSettingsForm>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(MOCK_SAVED);
  const driver = Form.useWatch('driver', form) ?? saved.driver;

  const handleSave = async (values: DriveSettingsForm) => {
    setSaving(true);
    try {
      // TODO(M7): PUT /settings/google-drive — xem plans/08-frontend-integration.md
      await new Promise((resolve) => setTimeout(resolve, 400));
      setSaved({
        driver: values.driver,
        folderId: values.folderId ?? '',
        maxUploadMb: values.maxUploadMb,
        hasServiceAccount: saved.hasServiceAccount || Boolean(values.serviceAccountJson),
        serviceAccountEmail: saved.serviceAccountEmail,
        usingEnvFallback: false,
      });
      form.setFieldValue('serviceAccountJson', undefined);
      void message.success('Đã lưu cấu hình Google Drive');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      // TODO(M7): POST /settings/google-drive/test
      await new Promise((resolve) => setTimeout(resolve, 600));
      void message.success(`Kết nối thành công (driver: ${driver})`);
    } catch {
      void message.error('Kết nối thất bại — kiểm tra lại cấu hình');
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
        initialValues={{ driver: saved.driver, folderId: saved.folderId, maxUploadMb: saved.maxUploadMb }}
        onFinish={handleSave}
      >
        <Form.Item
          name="driver"
          label="Driver"
          rules={[{ required: true }]}
          extra="fake = ghi thư mục tạm local (dev/test) · real = gọi Google Drive thật"
        >
          <Radio.Group>
            <Radio.Button value="fake">Fake (dev/test)</Radio.Button>
            <Radio.Button value="real">Real (Google Drive)</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="folderId"
          label="Folder ID trên Google Drive"
          rules={[{ required: driver === 'real', message: 'Bắt buộc khi driver = real' }]}
        >
          <Input placeholder="1abc_folder_id" disabled={driver === 'fake'} />
        </Form.Item>

        <Form.Item label="Service Account JSON">
          <Space direction="vertical" style={{ width: '100%' }}>
            {saved.hasServiceAccount && (
              <Text type="secondary">
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                Đã cấu hình{saved.serviceAccountEmail ? ` (${saved.serviceAccountEmail})` : ''} — dán JSON mới
                bên dưới để thay thế, để trống nếu muốn giữ nguyên.
              </Text>
            )}
            <Upload accept=".json" showUploadList={false} beforeUpload={readFileAsText} disabled={driver === 'fake'}>
              <Button disabled={driver === 'fake'}>Tải file service-account.json</Button>
            </Upload>
            <Form.Item name="serviceAccountJson" noStyle>
              <TextArea
                rows={6}
                placeholder='{ "type": "service_account", "client_email": "...", ... }'
                disabled={driver === 'fake'}
              />
            </Form.Item>
          </Space>
        </Form.Item>

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
        Service account phải được share quyền <Text strong>Editor</Text> trên folder Drive đích, nếu
        không upload sẽ báo lỗi 403.
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
        ]}
      />
    </>
  );
}
