import { Alert, Typography } from 'antd';
import { APP_NAME, LEGAL_CONTACT_EMAIL } from '../../utils/constants';
import { LegalLayout } from './LegalLayout';

const { Title, Paragraph } = Typography;

/**
 * Trang công khai `/data-deletion` — nộp cho Meta ở ô
 * "User Data Deletion → Data Deletion Instructions URL".
 */
export default function DataDeletionPage() {
  return (
    <LegalLayout
      titleVi="Hướng dẫn xoá dữ liệu người dùng"
      titleEn="User Data Deletion Instructions"
    >
      {(lang) =>
        lang === 'vi' ? (
          <>
            <Paragraph>
              Trang này hướng dẫn cách xoá dữ liệu mà {APP_NAME} lưu về bạn, gồm dữ liệu nhận từ
              Facebook (ID tài khoản, tên, danh sách Trang, mã truy cập) và dữ liệu tài khoản
              trong ứng dụng.
            </Paragraph>

            <Title level={3}>Cách 1 — Gỡ Trang trong ứng dụng (có hiệu lực ngay)</Title>
            <Paragraph>
              <ol>
                <li>Đăng nhập {APP_NAME} bằng tài khoản có quyền quản trị.</li>
                <li>
                  Vào mục <strong>Quản lý Page</strong>.
                </li>
                <li>
                  Với từng Trang đã kết nối, bấm <strong>Xoá page</strong> và xác nhận.
                </li>
              </ol>
              Ngay khi xác nhận, mã truy cập của Trang đó bị xoá khỏi cơ sở dữ liệu và ứng dụng
              không còn đăng bài lên Trang đó nữa. Để xoá nốt mã truy cập của{' '}
              <em>tài khoản Facebook</em> đã dùng để kết nối, hãy làm thêm Cách 2 và Cách 3.
            </Paragraph>

            <Title level={3}>Cách 2 — Gỡ ứng dụng từ phía Facebook</Title>
            <Paragraph>
              <ol>
                <li>
                  Mở <em>Facebook → Cài đặt và quyền riêng tư → Cài đặt</em>.
                </li>
                <li>
                  Chọn <em>Ứng dụng và trang web</em>.
                </li>
                <li>
                  Tìm <strong>{APP_NAME}</strong>, bấm <strong>Xoá</strong> và xác nhận.
                </li>
              </ol>
              Thao tác này thu hồi mọi quyền bạn đã cấp. Sau đó hãy dùng Cách 3 nếu muốn chúng
              tôi xoá luôn dữ liệu đã lưu.
            </Paragraph>

            <Title level={3}>Cách 3 — Yêu cầu xoá toàn bộ dữ liệu qua email</Title>
            <Paragraph>
              Gửi email tới <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>{' '}
              với tiêu đề <strong>&quot;Yêu cầu xoá dữ liệu&quot;</strong>, kèm:
              <ul>
                <li>Email tài khoản bạn dùng trong {APP_NAME};</li>
                <li>Tên hoặc ID Trang Facebook đã kết nối (nếu có).</li>
              </ul>
              Chúng tôi xác minh yêu cầu và xoá dữ liệu trong vòng <strong>30 ngày</strong>, rồi
              gửi email xác nhận khi hoàn tất.
            </Paragraph>

            <Title level={3}>Những gì bị xoá</Title>
            <Paragraph>
              <ul>
                <li>Mã truy cập người dùng và mã truy cập Trang của Facebook (xoá ngay);</li>
                <li>ID, tên tài khoản Facebook và danh sách Trang đã đồng bộ;</li>
                <li>Tài khoản người dùng trong ứng dụng (họ tên, email, mật khẩu băm);</li>
                <li>Bài viết, tệp media và lịch đăng do bạn tạo, nếu bạn yêu cầu.</li>
              </ul>
            </Paragraph>

            <Title level={3}>Những gì có thể được giữ lại</Title>
            <Paragraph>
              Nhật ký kỹ thuật đã ẩn danh (không còn chứa dữ liệu cá nhân) có thể được giữ cho
              mục đích vận hành và bảo mật. Các bài <strong>đã đăng</strong> lên Trang Facebook
              nằm trên hệ thống của Meta — muốn gỡ, bạn xoá trực tiếp trên Trang đó.
            </Paragraph>

            <Alert
              type="info"
              showIcon
              style={{ marginTop: 24 }}
              message="Cần hỗ trợ?"
              description={
                <>
                  Gửi email tới{' '}
                  <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> — chúng tôi
                  phản hồi trong vòng 7 ngày làm việc.
                </>
              }
            />
          </>
        ) : (
          <>
            <Paragraph>
              This page explains how to delete the data {APP_NAME} holds about you, including
              data received from Facebook (account ID, name, Page list, access tokens) and your
              in-app account data.
            </Paragraph>

            <Title level={3}>Option 1 — Remove the Page inside the app (takes effect immediately)</Title>
            <Paragraph>
              <ol>
                <li>Sign in to {APP_NAME} with an administrator account.</li>
                <li>
                  Go to <strong>Page Management</strong>.
                </li>
                <li>
                  For each connected Page, click <strong>Delete page</strong> and confirm.
                </li>
              </ol>
              As soon as you confirm, that Page&apos;s access token is deleted from our database
              and the app stops publishing to it. To also erase the access token of the{' '}
              <em>Facebook account</em> used to connect, follow Options 2 and 3 as well.
            </Paragraph>

            <Title level={3}>Option 2 — Remove the app from Facebook</Title>
            <Paragraph>
              <ol>
                <li>
                  Open <em>Facebook → Settings &amp; privacy → Settings</em>.
                </li>
                <li>
                  Select <em>Apps and websites</em>.
                </li>
                <li>
                  Find <strong>{APP_NAME}</strong>, click <strong>Remove</strong> and confirm.
                </li>
              </ol>
              This revokes every permission you granted. Follow Option 3 as well if you also want
              the data we already stored to be erased.
            </Paragraph>

            <Title level={3}>Option 3 — Request full deletion by email</Title>
            <Paragraph>
              Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> with the
              subject <strong>&quot;Data deletion request&quot;</strong> and include:
              <ul>
                <li>the email address of your {APP_NAME} account;</li>
                <li>the name or ID of the connected Facebook Page (if any).</li>
              </ul>
              We verify the request and delete the data within <strong>30 days</strong>, then send
              a confirmation email.
            </Paragraph>

            <Title level={3}>What gets deleted</Title>
            <Paragraph>
              <ul>
                <li>Facebook user access token and Page access tokens (deleted immediately);</li>
                <li>Facebook account ID, name and the synced list of Pages;</li>
                <li>Your in-app user account (name, email, hashed password);</li>
                <li>Posts, media files and schedules you created, if you ask for them.</li>
              </ul>
            </Paragraph>

            <Title level={3}>What may be retained</Title>
            <Paragraph>
              Anonymised technical logs that no longer contain personal data may be kept for
              operational and security purposes. Posts <strong>already published</strong> to a
              Facebook Page live on Meta&apos;s systems — delete those directly on the Page.
            </Paragraph>

            <Alert
              type="info"
              showIcon
              style={{ marginTop: 24 }}
              message="Need help?"
              description={
                <>
                  Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> — we
                  reply within 7 business days.
                </>
              }
            />
          </>
        )
      }
    </LegalLayout>
  );
}
