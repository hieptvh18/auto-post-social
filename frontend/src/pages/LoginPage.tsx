import { LockOutlined, MedicineBoxOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Select, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { APP_NAME, APP_TAGLINE, PREVIEW_EMAILS, ROLE_LABELS } from '../utils/constants';

const { Title, Text } = Typography;

const DEMO_ACCOUNTS: { email: string; role: UserRole }[] = [
  { email: PREVIEW_EMAILS.ADMIN, role: 'ADMIN' },
  { email: PREVIEW_EMAILS.EDITOR, role: 'EDITOR' },
  { email: PREVIEW_EMAILS.CONTENT, role: 'CONTENT' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const onFinish = (values: { email: string; password: string; role: UserRole }) => {
    login(values.email, values.role);
    message.success(`Đăng nhập thành công — ${ROLE_LABELS[values.role]}`);
    navigate('/dashboard');
  };

  const fillDemo = (account: (typeof DEMO_ACCOUNTS)[0]) => {
    form.setFieldsValue({
      email: account.email,
      password: 'demo123',
      role: account.role,
    });
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
          initialValues={{ role: 'ADMIN', password: 'demo123', email: PREVIEW_EMAILS.ADMIN }}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, message: 'Nhập email' }]}
          >
            <Input prefix={<UserOutlined />} placeholder={PREVIEW_EMAILS.ADMIN} />
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: 'Nhập mật khẩu' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="••••••••" />
          </Form.Item>

          <Form.Item name="role" label="Role (demo)" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ROLE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large">
            Đăng nhập
          </Button>
        </Form>

        <div style={{ marginTop: 24 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chọn nhanh tài khoản demo:
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <Button key={acc.role} size="small" onClick={() => fillDemo(acc)}>
                {ROLE_LABELS[acc.role]}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
