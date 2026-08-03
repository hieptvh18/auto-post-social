import { LockOutlined, MedicineBoxOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Space, Typography, message } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { APP_NAME, APP_TAGLINE, PREVIEW_EMAILS } from '../utils/constants';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { login, isPreviewMode } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      void message.success('Đăng nhập thành công');
      navigate('/dashboard');
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.message
          : 'Không kết nối được máy chủ — kiểm tra backend đang chạy';
      void message.error(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a2e2e 0%, #135200 50%, #13a8a8 100%)',
        padding: 24,
      }}
    >
      <Card
        style={{ width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
        styles={{ body: { padding: 32 } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <MedicineBoxOutlined style={{ fontSize: 40, color: '#13a8a8' }} />
          <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>
            {APP_NAME}
          </Title>
          <Text type="secondary">{APP_TAGLINE}</Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={
            isPreviewMode ? { email: PREVIEW_EMAILS.ADMIN, password: 'demo123' } : undefined
          }
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="admin@example.com" autoComplete="email" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: 'Nhập mật khẩu' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Đăng nhập
          </Button>
        </Form>

        {isPreviewMode && (
          <div style={{ marginTop: 24 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Chế độ preview (mock) — nhập bất kỳ email/mật khẩu nào để vào.
            </Text>
          </div>
        )}

        {/* Link công khai để Meta reviewer tìm thấy 3 trang pháp lý từ trang chủ. */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Space split="·" size={8} wrap>
            <Link to="/privacy" style={{ fontSize: 12 }}>
              Quyền riêng tư
            </Link>
            <Link to="/terms" style={{ fontSize: 12 }}>
              Điều khoản
            </Link>
            <Link to="/data-deletion" style={{ fontSize: 12 }}>
              Xoá dữ liệu
            </Link>
          </Space>
        </div>
      </Card>
    </div>
  );
}
