import { Typography } from 'antd';
import { APP_NAME, LEGAL_CONTACT_EMAIL } from '../../utils/constants';
import { LegalLayout } from './LegalLayout';

const { Title, Paragraph } = Typography;

/** Trang công khai `/privacy` — URL nộp cho Meta App Review. */
export default function PrivacyPolicyPage() {
  return (
    <LegalLayout titleVi="Chính sách quyền riêng tư" titleEn="Privacy Policy">
      {(lang) =>
        lang === 'vi' ? (
          <>
            <Paragraph>
              {APP_NAME} (&quot;chúng tôi&quot;) là công cụ nội bộ giúp đội ngũ marketing lên
              lịch và tự động đăng bài lên các Trang Facebook mà chính tổ chức sử dụng công cụ
              sở hữu hoặc được cấp quyền quản trị. Chính sách này mô tả dữ liệu chúng tôi thu
              thập, cách dùng, cách bảo vệ và cách bạn yêu cầu xoá.
            </Paragraph>

            <Title level={3}>1. Dữ liệu chúng tôi thu thập</Title>
            <Paragraph>
              <strong>a) Dữ liệu tài khoản trong ứng dụng.</strong> Họ tên, địa chỉ email, mật
              khẩu đã băm (bcrypt) và vai trò (Admin / Editor / Content) của người dùng do quản
              trị viên tạo.
            </Paragraph>
            <Paragraph>
              <strong>b) Dữ liệu nhận từ Facebook.</strong> Khi bạn bấm &quot;Kết nối
              Facebook&quot; và chấp thuận, chúng tôi nhận từ Meta: ID và tên tài khoản
              Facebook của bạn; danh sách Trang bạn quản lý (ID, tên, danh mục, quyền được
              cấp); mã truy cập người dùng (user access token) và mã truy cập Trang (page
              access token). Các quyền chúng tôi yêu cầu là <code>pages_show_list</code>,{' '}
              <code>pages_read_engagement</code>, <code>pages_manage_posts</code> và{' '}
              <code>business_management</code>, chỉ nhằm liệt kê Trang và đăng bài thay bạn.
              Chúng tôi <strong>không</strong> thu thập danh sách bạn bè, tin nhắn, ảnh cá nhân
              hay dòng thời gian cá nhân của bạn.
            </Paragraph>
            <Paragraph>
              <strong>c) Dữ liệu nội dung.</strong> Bài viết, chú thích, danh mục, ảnh và video
              do người dùng tải lên (lưu trên Google Drive của tổ chức), lịch đăng, cùng nhật
              ký đăng bài (thời điểm, kết quả, thông báo lỗi từ Facebook) và nhật ký thao tác
              (ai làm gì, lúc nào).
            </Paragraph>

            <Title level={3}>2. Mục đích sử dụng</Title>
            <Paragraph>
              Dữ liệu chỉ được dùng để: xác thực và phân quyền người dùng; hiển thị danh sách
              Trang để bạn chọn; đăng bài lên đúng Trang vào đúng thời điểm bạn đã lên lịch;
              hiển thị trạng thái, lỗi và lịch sử đăng bài; bảo đảm an toàn hệ thống và truy vết
              sự cố. Chúng tôi <strong>không</strong> dùng dữ liệu để quảng cáo, không phân tích
              hành vi người dùng cuối, không bán hay cho thuê dữ liệu cho bất kỳ bên nào.
            </Paragraph>

            <Title level={3}>3. Chia sẻ dữ liệu</Title>
            <Paragraph>
              Chúng tôi không bán và không chia sẻ dữ liệu cho bên thứ ba vì mục đích thương
              mại. Dữ liệu chỉ đi qua các dịch vụ cần thiết để vận hành: <strong>Meta (Facebook
              Graph API)</strong> để đăng bài, và <strong>Google Drive</strong> để lưu tệp ảnh /
              video của tổ chức. Chúng tôi có thể tiết lộ dữ liệu nếu pháp luật bắt buộc.
            </Paragraph>

            <Title level={3}>4. Lưu trữ và bảo mật</Title>
            <Paragraph>
              Dữ liệu nằm trong cơ sở dữ liệu PostgreSQL trên máy chủ riêng của tổ chức. Mọi mã
              truy cập Facebook được <strong>mã hoá AES-256-GCM</strong> trước khi ghi xuống
              đĩa và chỉ được giải mã ngay tại thời điểm gọi API đăng bài; giao diện chỉ hiển
              thị 4 ký tự cuối. Mật khẩu băm bằng bcrypt. Toàn bộ kết nối dùng HTTPS. Nhật ký
              hệ thống che (redact) token và mật khẩu. Truy cập được phân quyền theo vai trò.
            </Paragraph>

            <Title level={3}>5. Thời gian lưu giữ</Title>
            <Paragraph>
              Dữ liệu được giữ trong thời gian tài khoản còn hoạt động. Khi bạn gỡ một Trang
              khỏi ứng dụng, mã truy cập của Trang đó bị xoá khỏi cơ sở dữ liệu ngay lập tức;
              khi bạn ngắt kết nối tài khoản Facebook, mã truy cập người dùng bị xoá. Khi bạn yêu cầu xoá
              tài khoản, chúng tôi xoá dữ liệu cá nhân trong vòng <strong>30 ngày</strong>. Nhật
              ký kỹ thuật đã ẩn danh có thể được giữ lâu hơn cho mục đích vận hành.
            </Paragraph>

            <Title level={3}>6. Quyền của bạn</Title>
            <Paragraph>
              Bạn có quyền yêu cầu xem, sửa hoặc xoá dữ liệu cá nhân của mình, rút lại đồng ý
              kết nối Facebook bất cứ lúc nào. Hướng dẫn xoá chi tiết ở trang{' '}
              <a href="/data-deletion">Xoá dữ liệu người dùng</a>. Bạn cũng có thể gỡ ứng dụng
              trong <em>Facebook → Cài đặt và quyền riêng tư → Cài đặt → Ứng dụng và trang
              web</em>.
            </Paragraph>

            <Title level={3}>7. Trẻ em</Title>
            <Paragraph>
              Đây là công cụ nội bộ dành cho nhân sự làm việc, không hướng tới và không thu
              thập dữ liệu của người dưới 13 tuổi.
            </Paragraph>

            <Title level={3}>8. Thay đổi chính sách</Title>
            <Paragraph>
              Khi có thay đổi, chúng tôi cập nhật nội dung trên trang này kèm ngày cập nhật mới.
            </Paragraph>

            <Title level={3}>9. Liên hệ</Title>
            <Paragraph>
              Mọi câu hỏi về quyền riêng tư, gửi email tới{' '}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </Paragraph>
          </>
        ) : (
          <>
            <Paragraph>
              {APP_NAME} (&quot;we&quot;, &quot;us&quot;) is an internal tool that lets a
              marketing team schedule and automatically publish posts to the Facebook Pages that
              their own organisation owns or has been granted admin access to. This policy
              explains what data we collect, how we use and protect it, and how you can have it
              deleted.
            </Paragraph>

            <Title level={3}>1. Data we collect</Title>
            <Paragraph>
              <strong>a) In-app account data.</strong> Name, email address, bcrypt-hashed
              password and role (Admin / Editor / Content) of users created by an administrator.
            </Paragraph>
            <Paragraph>
              <strong>b) Data received from Facebook.</strong> When you click &quot;Connect
              Facebook&quot; and grant consent, Meta returns to us: your Facebook account ID and
              name; the list of Pages you manage (ID, name, category, granted tasks); a user
              access token and Page access tokens. The permissions we request are{' '}
              <code>pages_show_list</code>, <code>pages_read_engagement</code>,{' '}
              <code>pages_manage_posts</code> and <code>business_management</code>, solely to
              list your Pages and publish posts on your behalf. We do <strong>not</strong>{' '}
              collect your friend list, messages, personal photos or personal timeline.
            </Paragraph>
            <Paragraph>
              <strong>c) Content data.</strong> Posts, captions, categories, images and videos
              uploaded by users (stored in the organisation&apos;s Google Drive), publishing
              schedules, publishing logs (time, result, error messages returned by Facebook) and
              audit logs (who did what, when).
            </Paragraph>

            <Title level={3}>2. How we use data</Title>
            <Paragraph>
              Data is used only to: authenticate and authorise users; show your list of Pages so
              you can choose targets; publish posts to the correct Page at the time you
              scheduled; display publishing status, errors and history; and keep the system
              secure and troubleshootable. We do <strong>not</strong> use data for advertising,
              do not profile end users, and never sell or rent data to anyone.
            </Paragraph>

            <Title level={3}>3. Data sharing</Title>
            <Paragraph>
              We do not sell data and do not share it with third parties for commercial
              purposes. Data only transits the services required to operate:{' '}
              <strong>Meta (Facebook Graph API)</strong> for publishing, and{' '}
              <strong>Google Drive</strong> for storing the organisation&apos;s image and video
              files. We may disclose data where required by law.
            </Paragraph>

            <Title level={3}>4. Storage and security</Title>
            <Paragraph>
              Data resides in a PostgreSQL database on the organisation&apos;s own server. All
              Facebook access tokens are <strong>encrypted with AES-256-GCM</strong> before being
              written to disk and are decrypted only at the moment of an API call; the UI shows
              only the last 4 characters. Passwords are hashed with bcrypt. All connections use
              HTTPS. Application logs redact tokens and passwords. Access is restricted by role.
            </Paragraph>

            <Title level={3}>5. Retention</Title>
            <Paragraph>
              Data is retained while the account remains active. When you remove a Page from the
              app its Page access token is deleted from the database immediately; when you
              disconnect the Facebook account, the user access token is deleted. When you request
              account deletion, we delete your personal data within <strong>30 days</strong>.
              Anonymised technical logs may be kept longer for operational purposes.
            </Paragraph>

            <Title level={3}>6. Your rights</Title>
            <Paragraph>
              You may request access to, correction of, or deletion of your personal data, and
              withdraw your Facebook connection consent at any time. See the{' '}
              <a href="/data-deletion">Data Deletion</a> page for step-by-step instructions. You
              can also remove the app under <em>Facebook → Settings &amp; privacy → Settings →
              Apps and websites</em>.
            </Paragraph>

            <Title level={3}>7. Children</Title>
            <Paragraph>
              This is an internal workplace tool. It is not directed at, and does not knowingly
              collect data from, anyone under 13.
            </Paragraph>

            <Title level={3}>8. Changes to this policy</Title>
            <Paragraph>
              Any change is published on this page together with a new &quot;last updated&quot;
              date.
            </Paragraph>

            <Title level={3}>9. Contact</Title>
            <Paragraph>
              For any privacy question, email{' '}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </Paragraph>
          </>
        )
      }
    </LegalLayout>
  );
}
