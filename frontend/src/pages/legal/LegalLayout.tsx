import { Layout, Segmented, Space, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME, LEGAL_CONTACT_EMAIL, LEGAL_UPDATED_AT } from '../../utils/constants';

const { Title, Text, Paragraph } = Typography;

/** Ngôn ngữ hiển thị. EN có mặt để reviewer của Meta đọc được. */
export type LegalLang = 'vi' | 'en';

const LEGAL_LINKS: { path: string; vi: string; en: string }[] = [
  { path: '/privacy', vi: 'Chính sách quyền riêng tư', en: 'Privacy Policy' },
  { path: '/data-deletion', vi: 'Xoá dữ liệu người dùng', en: 'Data Deletion' },
  { path: '/terms', vi: 'Điều khoản dịch vụ', en: 'Terms of Service' },
];

interface LegalLayoutProps {
  titleVi: string;
  titleEn: string;
  /** Nội dung trang, render theo ngôn ngữ đang chọn. */
  children: (lang: LegalLang) => ReactNode;
}

/**
 * Khung dùng chung cho 3 trang pháp lý công khai (/privacy, /data-deletion, /terms).
 * Không nằm trong ProtectedRoute — Meta reviewer phải xem được khi chưa đăng nhập.
 */
export function LegalLayout({ titleVi, titleEn, children }: LegalLayoutProps) {
  const [lang, setLang] = useState<LegalLang>('vi');

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <Layout.Content style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 64px' }}>
        <Space
          align="start"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
          wrap
        >
          <Link to="/login">
            <Text strong style={{ fontSize: 18 }}>
              {APP_NAME}
            </Text>
          </Link>
          <Segmented
            value={lang}
            onChange={(value) => setLang(value as LegalLang)}
            options={[
              { label: 'Tiếng Việt', value: 'vi' },
              { label: 'English', value: 'en' },
            ]}
          />
        </Space>

        <Title level={2} style={{ marginTop: 16 }}>
          {lang === 'vi' ? titleVi : titleEn}
        </Title>
        <Paragraph type="secondary">
          {lang === 'vi'
            ? `Cập nhật lần cuối: ${LEGAL_UPDATED_AT} · Liên hệ: `
            : `Last updated: ${LEGAL_UPDATED_AT} · Contact: `}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        </Paragraph>

        <Typography>{children(lang)}</Typography>

        <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 40, paddingTop: 16 }}>
          <Space size="large" wrap>
            {LEGAL_LINKS.map((link) => (
              <Link key={link.path} to={link.path}>
                {lang === 'vi' ? link.vi : link.en}
              </Link>
            ))}
            <Link to="/login">{lang === 'vi' ? 'Đăng nhập' : 'Sign in'}</Link>
          </Space>
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            © {new Date().getFullYear()} {APP_NAME}
          </Paragraph>
        </div>
      </Layout.Content>
    </Layout>
  );
}
