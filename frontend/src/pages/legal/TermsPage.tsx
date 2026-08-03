import { Typography } from 'antd';
import { APP_NAME, LEGAL_CONTACT_EMAIL } from '../../utils/constants';
import { LegalLayout } from './LegalLayout';

const { Title, Paragraph } = Typography;

/** Trang công khai `/terms` — URL nộp cho Meta App Review. */
export default function TermsPage() {
  return (
    <LegalLayout titleVi="Điều khoản dịch vụ" titleEn="Terms of Service">
      {(lang) =>
        lang === 'vi' ? (
          <>
            <Paragraph>
              Bằng việc sử dụng {APP_NAME} (&quot;Dịch vụ&quot;), bạn đồng ý với các điều khoản
              dưới đây. Nếu không đồng ý, vui lòng ngừng sử dụng Dịch vụ.
            </Paragraph>

            <Title level={3}>1. Mô tả dịch vụ</Title>
            <Paragraph>
              {APP_NAME} là công cụ quản lý nội dung và tự động đăng bài lên Trang Facebook: tạo
              và duyệt bài, lưu ảnh/video, lên lịch theo khung giờ, và để bot đăng bài lên các
              Trang đã kết nối. Dịch vụ dành cho tổ chức tự quản lý Trang của mình.
            </Paragraph>

            <Title level={3}>2. Tài khoản</Title>
            <Paragraph>
              Tài khoản do quản trị viên của tổ chức tạo và phân vai trò. Bạn chịu trách nhiệm
              giữ bí mật mật khẩu và mọi hoạt động diễn ra dưới tài khoản của mình. Thông báo
              cho chúng tôi ngay khi nghi ngờ tài khoản bị truy cập trái phép.
            </Paragraph>

            <Title level={3}>3. Kết nối Facebook</Title>
            <Paragraph>
              Bạn chỉ được kết nối những Trang Facebook mà bạn sở hữu hoặc được cấp quyền đăng
              bài hợp lệ. Khi kết nối, bạn cho phép {APP_NAME} đăng bài lên Trang đó thay bạn
              theo lịch bạn thiết lập. Bạn có thể ngắt kết nối bất cứ lúc nào (xem{' '}
              <a href="/data-deletion">Xoá dữ liệu người dùng</a>).
            </Paragraph>

            <Title level={3}>4. Nội dung của bạn</Title>
            <Paragraph>
              Bạn giữ toàn bộ quyền đối với nội dung mình tải lên và chịu trách nhiệm về tính
              hợp pháp của nội dung đó (bản quyền hình ảnh, âm nhạc, quảng cáo, y tế…). Bạn cấp
              cho chúng tôi quyền hạn chế để lưu trữ và truyền nội dung đó tới Facebook nhằm
              thực hiện đúng thao tác bạn yêu cầu.
            </Paragraph>

            <Title level={3}>5. Sử dụng được chấp nhận</Title>
            <Paragraph>
              Bạn không được dùng Dịch vụ để: đăng nội dung vi phạm pháp luật, spam, lừa đảo,
              thù ghét hoặc khiêu dâm; vi phạm{' '}
              <a href="https://developers.facebook.com/terms/" target="_blank" rel="noreferrer">
                Điều khoản nền tảng của Meta
              </a>{' '}
              và Tiêu chuẩn cộng đồng Facebook; đăng lên Trang bạn không có quyền; hoặc cố tình
              vượt giới hạn tần suất (rate limit) của Facebook.
            </Paragraph>

            <Title level={3}>6. Phụ thuộc bên thứ ba</Title>
            <Paragraph>
              Dịch vụ phụ thuộc vào Facebook Graph API và Google Drive. Khi các nền tảng này
              thay đổi chính sách, giới hạn hoặc gián đoạn, một số chức năng có thể ngừng hoạt
              động ngoài tầm kiểm soát của chúng tôi.
            </Paragraph>

            <Title level={3}>7. Không bảo đảm và giới hạn trách nhiệm</Title>
            <Paragraph>
              Dịch vụ được cung cấp &quot;nguyên trạng&quot;, không bảo đảm bài viết luôn được
              đăng đúng giờ hoặc thành công tuyệt đối. Trong phạm vi pháp luật cho phép, chúng
              tôi không chịu trách nhiệm cho thiệt hại gián tiếp phát sinh từ việc sử dụng Dịch
              vụ, bao gồm mất doanh thu hoặc việc Trang bị Facebook hạn chế.
            </Paragraph>

            <Title level={3}>8. Tạm ngừng và chấm dứt</Title>
            <Paragraph>
              Chúng tôi có thể tạm ngừng hoặc chấm dứt quyền truy cập nếu phát hiện vi phạm các
              điều khoản này. Bạn có thể ngừng sử dụng bất cứ lúc nào bằng cách ngắt kết nối và
              yêu cầu xoá dữ liệu.
            </Paragraph>

            <Title level={3}>9. Quyền riêng tư</Title>
            <Paragraph>
              Việc xử lý dữ liệu cá nhân tuân theo{' '}
              <a href="/privacy">Chính sách quyền riêng tư</a>, là một phần không tách rời của
              các điều khoản này.
            </Paragraph>

            <Title level={3}>10. Thay đổi điều khoản</Title>
            <Paragraph>
              Điều khoản có thể được cập nhật; bản mới đăng trên trang này kèm ngày cập nhật.
              Tiếp tục sử dụng Dịch vụ sau khi cập nhật đồng nghĩa bạn chấp thuận bản mới.
            </Paragraph>

            <Title level={3}>11. Luật áp dụng và liên hệ</Title>
            <Paragraph>
              Các điều khoản này chịu sự điều chỉnh của pháp luật Việt Nam. Mọi câu hỏi gửi tới{' '}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </Paragraph>
          </>
        ) : (
          <>
            <Paragraph>
              By using {APP_NAME} (the &quot;Service&quot;) you agree to the terms below. If you
              do not agree, please stop using the Service.
            </Paragraph>

            <Title level={3}>1. What the Service does</Title>
            <Paragraph>
              {APP_NAME} is a content management and automated Facebook Page publishing tool:
              create and approve posts, store images and videos, schedule time slots, and let a
              bot publish to the connected Pages. It is intended for organisations managing their
              own Pages.
            </Paragraph>

            <Title level={3}>2. Accounts</Title>
            <Paragraph>
              Accounts are created and assigned roles by your organisation&apos;s administrator.
              You are responsible for keeping your password confidential and for all activity
              under your account. Notify us immediately if you suspect unauthorised access.
            </Paragraph>

            <Title level={3}>3. Facebook connection</Title>
            <Paragraph>
              You may only connect Facebook Pages that you own or are validly authorised to
              publish to. By connecting, you authorise {APP_NAME} to publish to that Page on your
              behalf according to the schedule you configure. You can disconnect at any time (see{' '}
              <a href="/data-deletion">Data Deletion</a>).
            </Paragraph>

            <Title level={3}>4. Your content</Title>
            <Paragraph>
              You retain all rights to the content you upload and are responsible for its
              legality (image and music copyright, advertising and healthcare rules, and so on).
              You grant us a limited right to store and transmit that content to Facebook solely
              to carry out the actions you request.
            </Paragraph>

            <Title level={3}>5. Acceptable use</Title>
            <Paragraph>
              You must not use the Service to: publish unlawful, spam, fraudulent, hateful or
              sexually explicit content; violate the{' '}
              <a href="https://developers.facebook.com/terms/" target="_blank" rel="noreferrer">
                Meta Platform Terms
              </a>{' '}
              or the Facebook Community Standards; publish to Pages you are not authorised for;
              or deliberately circumvent Facebook rate limits.
            </Paragraph>

            <Title level={3}>6. Third-party dependencies</Title>
            <Paragraph>
              The Service depends on the Facebook Graph API and Google Drive. When those
              platforms change policies, limits, or suffer outages, some features may stop
              working for reasons outside our control.
            </Paragraph>

            <Title level={3}>7. No warranty and limitation of liability</Title>
            <Paragraph>
              The Service is provided &quot;as is&quot;, with no guarantee that every post is
              published on time or succeeds. To the extent permitted by law, we are not liable
              for indirect damages arising from use of the Service, including lost revenue or
              restrictions Facebook may impose on your Page.
            </Paragraph>

            <Title level={3}>8. Suspension and termination</Title>
            <Paragraph>
              We may suspend or terminate access if these terms are breached. You may stop using
              the Service at any time by disconnecting and requesting data deletion.
            </Paragraph>

            <Title level={3}>9. Privacy</Title>
            <Paragraph>
              Processing of personal data is governed by our{' '}
              <a href="/privacy">Privacy Policy</a>, which forms an integral part of these terms.
            </Paragraph>

            <Title level={3}>10. Changes to these terms</Title>
            <Paragraph>
              These terms may be updated; the new version is published on this page with a new
              date. Continued use after an update constitutes acceptance.
            </Paragraph>

            <Title level={3}>11. Governing law and contact</Title>
            <Paragraph>
              These terms are governed by the laws of Vietnam. Questions:{' '}
              <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
            </Paragraph>
          </>
        )
      }
    </LegalLayout>
  );
}
