import {
  BulbOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FacebookOutlined,
  FieldTimeOutlined,
  FileImageOutlined,
  QuestionCircleOutlined,
  RiseOutlined,
  RobotOutlined,
  SafetyOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Card, Col, Collapse, Row, Space, Steps, Tag, Timeline, Typography } from 'antd';
import { PageHeader } from '../components/common/PageHeader';
import { useAuthUser } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../utils/constants';

const { Title, Text, Paragraph } = Typography;

const VALUE_ITEMS = [
  {
    icon: <ThunderboltOutlined style={{ fontSize: 22, color: '#faad14' }} />,
    title: 'Tiết kiệm thời gian đăng bài',
    desc: 'Không cần ai ngồi canh giờ đăng thủ công từng bài lên từng page — Bot tự đăng đúng mốc giờ đã cấu hình, mọi ngày trong tuần.',
  },
  {
    icon: <SafetyOutlined style={{ fontSize: 22, color: '#1677ff' }} />,
    title: 'Kiểm soát chất lượng nội dung',
    desc: 'Mọi bài đều qua bước duyệt (Đã duyệt/Không duyệt kèm lý do) trước khi lên sóng — tránh sai sót, sai hình ảnh nhạy cảm, thiếu che thông tin bệnh nhân.',
  },
  {
    icon: <RiseOutlined style={{ fontSize: 22, color: '#52c41a' }} />,
    title: 'Không trùng, không sót bài',
    desc: 'Mỗi bài chỉ đăng đúng 1 lần trên mỗi page (unique content × page) — loại bỏ hoàn toàn tình trạng đăng trùng hoặc quên đăng như khi dùng Google Sheet thủ công.',
  },
  {
    icon: <TeamOutlined style={{ fontSize: 22, color: '#722ed1' }} />,
    title: 'Phân quyền rõ ràng theo vai trò',
    desc: 'Content chỉ lo upload, Editor chỉ lo duyệt và cấu hình lịch, Admin quản trị toàn hệ thống — không giẫm chân nhau, dễ quy trách nhiệm.',
  },
  {
    icon: <CalendarOutlined style={{ fontSize: 22, color: '#13a8a8' }} />,
    title: 'Chủ động lịch đăng theo từng chi nhánh',
    desc: 'Mỗi FB Page (chi nhánh) có thể có khung giờ và tỷ lệ Ảnh/Video khác nhau — cấu hình 1 lần, chạy tự động suốt vòng đời, chỉ chỉnh khi cần.',
  },
  {
    icon: <FieldTimeOutlined style={{ fontSize: 22, color: '#eb2f96' }} />,
    title: 'Đo lường hiệu quả tức thời',
    desc: 'Dashboard hiển thị số video đạt chuẩn ADS, tỷ lệ đăng thành công/thất bại, số bài theo từng page — giúp phòng ban báo cáo nhanh, ra quyết định dựa trên số liệu.',
  },
];

const CONTENT_STEPS = [
  {
    title: 'Upload ảnh/video',
    description:
      'Vào Quản lý Ảnh/Video Edit → "Upload Ảnh/Video" → chọn file, nhập tiêu đề, mô tả, Dạng bài, Caption đăng bài và Hashtag, chọn Phân bổ page (có thể để trống, bổ sung sau).',
  },
  {
    title: 'Theo dõi trạng thái',
    description:
      'Bài mới upload ở trạng thái "Chờ duyệt". Theo dõi cột Trạng thái trong bảng để biết bài đã được duyệt hay chưa.',
  },
  {
    title: 'Sửa bài bị Không duyệt',
    description:
      'Nếu bài bị "Không duyệt", mở lại để xem lý do (hiện trong drawer), chỉnh sửa nội dung rồi lưu — bài tự động quay về "Chờ duyệt".',
  },
];

const EDITOR_STEPS = [
  {
    title: 'Duyệt bài',
    description:
      'Mở bài ở trạng thái "Chờ duyệt" (icon bút chì) → xem nội dung, ảnh/video → đổi Trạng thái sang "Đã duyệt" hoặc "Không duyệt" (bắt buộc nhập lý do) → Lưu.',
  },
  {
    title: 'Đánh dấu Đạt ADS',
    description:
      'Trong cùng drawer edit, tick checkbox "Đạt ADS" cho video/bài đủ chuẩn chạy quảng cáo — số liệu này sẽ lên Dashboard.',
  },
  {
    title: 'Cấu hình lịch đăng tự động',
    description:
      'Vào "Cài đặt đăng bài tự động" → chọn từng FB Page → bật Auto ON → thêm các mốc giờ trong ngày, mỗi mốc chọn Dạng bài + loại media + số bài/lần.',
  },
  {
    title: 'Theo dõi Lịch đăng bài',
    description:
      'Vào "Lịch đăng bài" (Timeline) để xem Bot đã/sẽ đăng bài nào, giờ nào, trên page nào — lọc theo Kênh hoặc Trạng thái khi cần kiểm tra nhanh.',
  },
];

export default function GuidePage() {
  const user = useAuthUser();

  return (
    <div>
      <PageHeader
        title="Hướng dẫn sử dụng"
        description="Cách dùng tool và giá trị mang lại cho phòng ban — dành cho mọi vai trò"
      />

      <Card style={{ marginBottom: 24 }}>
        <Space align="start" size={16}>
          <BulbOutlined style={{ fontSize: 28, color: '#faad14' }} />
          <div>
            <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
              Vì sao phòng ban nên dùng tool này?
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Tool thay thế hoàn toàn cách làm cũ (upload Drive → dán link Google
              Sheet → đăng tay từng bài). Toàn bộ vòng đời của một bài đăng — từ
              upload, duyệt, đến đăng lên Facebook — được quản lý tập trung và tự
              động hoá, giúp đội ngũ tập trung vào chất lượng nội dung thay vì thao
              tác thủ công lặp lại.
            </Paragraph>
          </div>
        </Space>
      </Card>

      <Title level={4}>Giá trị tool mang lại</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {VALUE_ITEMS.map((item) => (
          <Col xs={24} sm={12} lg={8} key={item.title}>
            <Card style={{ height: '100%' }}>
              <Space align="start" size={12}>
                {item.icon}
                <div>
                  <Text strong>{item.title}</Text>
                  <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>
                    {item.desc}
                  </Paragraph>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Title level={4}>
        <QuestionCircleOutlined /> Hướng dẫn theo vai trò của bạn hiện tại — {ROLE_LABELS[user.role]}
      </Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <FileImageOutlined /> Dành cho Content
              </Space>
            }
          >
            <Steps direction="vertical" size="small" items={CONTENT_STEPS} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CheckCircleOutlined /> Dành cho Editor / Admin
              </Space>
            }
          >
            <Steps direction="vertical" size="small" items={EDITOR_STEPS} />
          </Card>
        </Col>
      </Row>

      <Title level={4}>
        <RobotOutlined /> Bot đăng bài tự động như thế nào?
      </Title>
      <Card style={{ marginBottom: 24 }}>
        <Timeline
          items={[
            {
              color: 'blue',
              children: (
                <>
                  <Text strong>Đến mốc giờ đã cấu hình</Text>
                  <br />
                  <Text type="secondary">
                    Ví dụ 08:00 sáng cho Page Hà Nội — Bot bắt đầu quét theo Dạng bài và loại
                    media (Ảnh/Video) đã chọn cho mốc giờ này.
                  </Text>
                </>
              ),
            },
            {
              color: 'blue',
              children: (
                <>
                  <Text strong>Chọn bài đủ điều kiện</Text>
                  <br />
                  <Text type="secondary">
                    Chỉ lấy bài đã ở trạng thái <Tag color="cyan">Đã duyệt</Tag> và{' '}
                    <b>chưa từng đăng trên page đó</b> — mỗi bài chỉ đăng 1 lần / 1 page.
                  </Text>
                </>
              ),
            },
            {
              color: 'blue',
              children: (
                <>
                  <Text strong>Ưu tiên bài duyệt trước</Text>
                  <br />
                  <Text type="secondary">
                    Trong các bài đủ điều kiện, bài nào được duyệt sớm hơn sẽ được đăng trước
                    (FIFO theo thời điểm duyệt).
                  </Text>
                </>
              ),
            },
            {
              color: 'green',
              dot: <FacebookOutlined />,
              children: (
                <>
                  <Text strong>Đăng lên Facebook</Text>
                  <br />
                  <Text type="secondary">
                    Bài chuyển trạng thái <Tag color="warning">Đang đăng</Tag>, sau khi thành
                    công trên ít nhất 1 page sẽ chuyển{' '}
                    <Tag color="success">Đã đăng</Tag> kèm badge x/y page cho biết đã đăng
                    được bao nhiêu trên tổng số page được phân bổ.
                  </Text>
                </>
              ),
            },
          ]}
        />
      </Card>

      <Title level={4}>
        <ClockCircleOutlined /> Câu hỏi thường gặp
      </Title>
      <Collapse
        items={[
          {
            key: '1',
            label: 'Vì sao bài của tôi chưa được đăng dù đã Đã duyệt?',
            children: (
              <Paragraph style={{ marginBottom: 0 }}>
                Kiểm tra 3 điều: (1) bài đã được <b>Phân bổ page</b> mong muốn chưa, (2) page đó
                có <b>mốc giờ auto-post</b> nào khớp Dạng bài/loại media của bài không, (3) Auto
                của page đó đã <b>bật (Auto ON)</b> chưa — xem tại Cài đặt đăng bài tự động.
              </Paragraph>
            ),
          },
          {
            key: '2',
            label: 'Một bài có thể đăng lên nhiều page cùng lúc không?',
            children: (
              <Paragraph style={{ marginBottom: 0 }}>
                Có. Một bài có thể được phân bổ cho nhiều page — Bot sẽ đăng độc lập trên từng
                page theo mốc giờ riêng của page đó. Cột Trạng thái sẽ hiện badge x/y page để
                theo dõi tiến độ.
              </Paragraph>
            ),
          },
          {
            key: '3',
            label: 'Sửa cấu hình đăng tự động có ảnh hưởng bài đã đăng không?',
            children: (
              <Paragraph style={{ marginBottom: 0 }}>
                Không. Cấu hình chỉ ảnh hưởng các lượt quét tiếp theo của Bot. Những bài đã đăng
                thành công vẫn giữ nguyên trạng thái và không bị đăng lại.
              </Paragraph>
            ),
          },
          {
            key: '4',
            label: 'Bài bị đăng thất bại thì sao?',
            children: (
              <Paragraph style={{ marginBottom: 0 }}>
                Hệ thống tự động thử lại tối đa 3 lần. Nếu vẫn lỗi, bài sẽ xuất hiện ở mục{' '}
                <b>Failed Jobs</b> (Admin) kèm lý do lỗi cụ thể để xử lý hoặc thử lại thủ công.
              </Paragraph>
            ),
          },
        ]}
      />
    </div>
  );
}
