# contexts.md — Trạng thái dự án Tool Auto FB

> **File này là bộ nhớ dài hạn của dự án.**
> Claude PHẢI đọc file này đầu mỗi session và cập nhật nó mỗi khi hoàn thành 1 module
> hoặc kết thúc session. Xem quy tắc cập nhật ở [.claude/rules/03-context-protocol.md](.claude/rules/03-context-protocol.md).

**Cập nhật lần cuối:** 2026-08-13 (Fix lượt xem video không fetch được trong Post Insights)
**Session gần nhất (mới nhất):** **Fix bug: `/pages/:pageId/insights` không lấy được lượt xem
video (yêu cầu user, không có file plan — bug fix cho plan 25).** User báo lượt xem video của
bài đã đăng luôn trống. **Nguyên nhân gốc:** `FacebookPublisherClient.publishVideo()`
(`facebook-publisher.client.ts:251`) trả về **video_id thô** làm `postId` (khác ảnh — ảnh có
bước riêng lấy đúng `post_id` dạng `{pageId}_{postId}`), và giá trị này được lưu thẳng vào
`content_page_assignments.facebook_post_id`. `FacebookInsightsClient` lại nhét `post_video_views`
vào chung `insights.metric()` với `post_fan_reach`/`post_clicks` rồi gọi trên chính video_id đó —
Graph **không báo lỗi**, chỉ **âm thầm trả rỗng**, vì lượt xem video thật ra nằm ở edge riêng của
video object: `GET /{video_id}/video_insights?metric=total_video_views&period=lifetime` (đã xác
nhận qua tài liệu Meta for Developers hiện hành, **chưa đo bằng token thật/Graph API Explorer** —
xem `contexts.md` §6 để test tay khi có token). Permalink bài video (`facebook.com/{video_id}`)
vẫn mở đúng nên bug này không lộ ra ở đó. **Sửa:** `facebook-insights.client.ts` bỏ
`post_video_views` khỏi metric list của `insights.metric()`, thêm method riêng `fetchVideoViews()`
gọi batch tới `/{video_id}/video_insights` chỉ cho bài `isVideo`, merge kết quả vào
`FacebookPostInsight.videoViews` sau khi đã lấy xong fan_reach/clicks/like/comment/share — lỗi ở
bước này chỉ làm `videoViews = null` cho đúng bài đó, không kéo cả bài xuống `failed`. Không đụng
schema (`erd.md` giữ nguyên), không đụng publisher (video_id vẫn đúng cho permalink + upload, chỉ
sai chỗ dùng cho insights). BE test: 20 case trong `facebook-insights.client.spec.ts` (bỏ 1 case
cũ giả định sai, thêm 3 case mới cho `video_insights`), toàn bộ **894 test backend xanh**,
lint/build xanh. **Còn nợ:** user chưa test tay bằng token thật trên page có video đã đăng để xác
nhận `total_video_views` đúng là metric còn sống trên Graph version đang dùng — nếu Graph vẫn trả
rỗng/lỗi thì cần đo lại bằng Graph API Explorer (nguyên tắc đã ghi trong comment file, xem §6).

---

**Session trước đó:** **Responsive cơ bản cho mobile/tablet (yêu cầu user, không có
file plan — user chốt "code luôn").** Trước đây web chỉ chạy được trên desktop: sidebar
`position: fixed` rộng 240px + `marginLeft: 240` cứng nên trên điện thoại menu chiếm 2/3 màn
hình và nội dung bị đẩy khuất. **Cách làm:** thêm hook `frontend/src/hooks/useResponsive.ts`
(`useIsMobile` ≤991px = breakpoint `lg` của antd, `useIsPhone` ≤767px). Hook dùng
**`useSyncExternalStore`** chứ không `useState + useEffect` để giá trị đúng ngay lần render
ĐẦU — nếu sửa trong effect thì mở trên điện thoại sẽ nháy bố cục desktop một nhịp; môi trường
không có `matchMedia` (jsdom) ⇒ trả false = desktop, nhờ vậy 63 test cũ không đỏ. `AdminLayout`
tách ruột sidebar ra biến `sidebarBody` dùng chung: desktop giữ nguyên `Sider`, màn hẹp đổi
sang `Drawer` trái mở bằng nút hamburger ở header (bấm menu là tự đóng Drawer), header ẩn
email + RoleTag và đưa chúng vào Dropdown của avatar, `Content` padding 24→12.
**Cạm bẫy lớn nhất đã tránh:** cách chống tràn ngang quen thuộc `overflow-x: hidden` trên
`body`/`#root`/`Content` sẽ **giết `position: sticky`** của mọi phần tử con — tức header dính
của AdminLayout và thẻ lọc dính ở `/timeline` (đặt overflow biến phần tử thành scroll container
nhưng nó không bao giờ cuộn). Đã bỏ hẳn hướng đó, chống tràn đúng nguồn: mọi `<Table>` còn
thiếu nay đều có `scroll={{ x }}` (PageManagement 1200/900, UserManagement 860/800, AutoPost
slots 1100/780, ConnectPagesModal 700, ConnectionsCard 720), `img/video/iframe` chặn
`max-width: 100%`, `pre/code` `word-break`, cột nội dung của Layout thêm `minWidth: 0`.
Phần còn lại xử lý bằng **CSS theo breakpoint trong `index.css`** thay vì sửa inline style ở
~15 file (rủi ro chạm logic): Drawer/Modal bề rộng cứng bị chặn `max-width: 100vw`, Select/
DatePicker/Input `max-width: 100%`, `.ant-card-head-wrapper` cho xuống dòng, pagination wrap,
`.ant-card-body` padding 24→16→12. Thêm class `.filter-bar` cho 6 thanh lọc đầu trang
(Content ×2, Audit ×2, User, AutoPost ×2) ⇒ trên điện thoại mỗi ô chiếm trọn dòng. Sửa thêm:
`/timeline` **tắt sticky thẻ lọc trên màn hẹp** (2 cột xếp dọc, dính lại thì nó che chính
danh sách đang cuộn), mọi `<Row gutter={N}>` đổi sang `[N, N]` để có khoảng cách dọc khi
Col xếp chồng, `PageHeader` cho khối chữ `flex: 1 1 260px; minWidth: 0` để mô tả dài không
đẩy nút hành động ra ngoài, LoginPage `width: 420` → `maxWidth: 420`, YAxis chart "Top danh
mục" 140→92px trên điện thoại. **Không đụng backend, không đụng schema ⇒ `erd.md` giữ
nguyên; không thêm biến env.** FE **67 test (+4 cho `useResponsive`)**, lint/build xanh.
**Chưa bấm tay trên thiết bị thật** ⇒ nợ §6.

---

**Session trước đó:** **Plan 25 — M11 tracking lượt xem bài đã đăng (Facebook Post
Insights).** `/pages` giờ mỗi dòng có nút **"Chi tiết"** mở màn thống kê riêng của page
(`/pages/:pageId/insights`), **tên page bấm được** mở thẳng Page trên Facebook, thêm cột "Bài
đã đăng". Màn mới: 4 thẻ tổng + bảng bài đăng **mặc định mới nhất trước**, tiêu đề bài link ra
đúng bài gốc, kèm lượt hiển thị / người tiếp cận / lượt xem video / tương tác + nút "Đồng bộ
ngay" (throttle 5 phút ⇒ 429). **Ràng buộc cứng user chốt: CHỈ theo dõi bài DO TOOL ĐĂNG** —
nguồn là `content_page_assignments` có `published_at` + `facebook_post_id`, **không** crawl
`/{page-id}/posts`; chọn bảng assignment chứ không `publish_jobs` vì nó có UNIQUE
`(content, page)`, còn 1 content retry nhiều lần đẻ nhiều job ⇒ cộng view sẽ **nhân đôi**.
**Về quyền Facebook: thêm đúng 1 scope `read_insights`** — `pages_read_engagement` chỉ cho đọc
*nội dung* bài, **không** mở được edge `/insights` (Graph trả `(#200)`). **Cạm bẫy lớn nhất:
scope đã cấp cho một token là bất biến** ⇒ mọi kết nối tạo trước 08/08 **phải bấm "Kết nối
lại"**, không tự nâng cấp — nên có cờ `canReadInsights` (true/false/**null** = page dán token
tay, không biết scope ⇒ **im lặng**, không báo động giả) hiện thành Tag vàng + Alert + khoá nút
đồng bộ. **Ba chỗ dễ sai đã xử lý:** (1) **`null` ≠ `0`** xuyên suốt adapter→repository→UI —
metric bị Meta deprecate **biến mất khỏi response chứ không ném lỗi**, coi là 0 thì một hôm
Meta đổi tên metric là **xoá sạch số liệu cũ**; nay vắng mặt ⇒ `null` ⇒ UI hiện `—` + log cảnh
báo, repository **bỏ hẳn field khỏi `update`**; (2) **Batch API parse từng phần tử riêng** — 1
bài bị xoá trả 400 trong khi 49 bài kia trả 200, gộp cả lô thành lỗi là mất sạch dữ liệu vì
đúng một bài; (3) **tần suất theo tuổi bài** (<48h: 6h/lần · 2–7 ngày: 24h · 8–30 ngày: 48h ·
>30 ngày **ngừng hẳn**) đặt ở **service** để test bằng clock giả, không nhét vào SQL. Bài không
còn trên FB ⇒ `missing_on_fb_at` và **ngừng** quét (phanh duy nhất chặn retry vô hạn). Thiếu
scope ⇒ **bỏ cả page, 0 call Graph**. Hai bảng mới `post_insights` (số hiện tại) +
`post_insight_snapshots` (ảnh chụp theo ngày, UNIQUE `(assignment, date)`); tách 2 bảng để màn
danh sách chỉ cần 1 join thay vì `DISTINCT ON`. Dùng lại permission `pages:manage` + route
trong `RoleRoute path="/pages"` sẵn có — không đẻ luật quyền mới. Chi tiết:
[plans/25-page-post-insights.md](./plans/25-page-post-insights.md). `erd.md` đã cập nhật
(migration `20260808064846_post_insights_real_metrics`). BE **887 test xanh (+52)**, FE **63 test (+4)**,
lint/build 2 phía xanh.

**ĐÃ CHẠY THẬT với Graph cùng ngày và phải sửa 3 lỗi (plan 25 §8)** — user báo "mọi chỉ số
= 0". (1) **`post_impressions` KHÔNG CÒN TỒN TẠI**: đo thật với Page token hợp lệ (có
`read_insights`, `expires_at=0`), cả họ `post_impressions*`/`post_reach`/`post_views`/
`page_impressions*` trả `(#100) The value must be a valid insights metric` trên **v19→v23**
⇒ Meta gỡ hẳn, không phải lỗi quyền/sai version/thiếu App Review. Đổi sang 3 chỉ số đã đo
là còn sống: **`post_video_views` · `post_fan_reach` · `post_clicks`**. Hệ quả nghiệp vụ:
**bài ảnh không còn cách lấy lượt xem tổng qua API** (số Business Suite hiện đi qua API nội
bộ Meta). UI đổi sang 3 cột *Lượt xem video · Tiếp cận người theo dõi · Lượt nhấp* và nói rõ
giới hạn ngay dưới header. (2) **Lỗi làm hỏng dữ liệu:** `code = 100` bị map thành "bài đã
bị xoá" ⇒ **3 bài đang sống** bị ghi `missing_on_fb_at` và **vĩnh viễn** không đồng bộ lại,
âm thầm — Graph dùng cùng code đó cho "tên metric sai"; nay chỉ set khi `error_subcode = 33`,
thêm cờ `isInvalidMetric` để dừng cả page và log đúng chỗ cần sửa. (3) **Nguồn gốc con số
0:** `saveInsight()` viết `?? 0` ở nhánh `create`, mà lần đồng bộ đầu **luôn** đi vào
`create` ⇒ ghi 0 thật vào DB kèm `fetched_at`; nay **mọi cột số NULLABLE, bỏ `DEFAULT 0`**
và bỏ hẳn field khỏi payload khi `null` ⇒ bất biến "`NULL` = chưa đo, `0` = đo được 0" do
**DB** bảo đảm chứ không chỉ là quy ước. (4) **Prod vẫn báo lỗi metric dù dev xanh** ⇒ bỏ
hẳn danh sách metric cứng: Meta cấp bộ metric **khác nhau tuỳ page** (New Page Experience
vs page cũ), nên adapter nay **tự dò** — Graph chê metric (không nói metric nào) thì gửi 1
request hỏi từng metric một trên 1 bài, ghi nhớ metric hỏng **theo từng page**, loại ra rồi
thử lại; hết metric thì bỏ hẳn khối `insights` nhưng **vẫn** lấy like/comment/share. Đã dọn
4 dòng hỏng; chạy lại thật: **4/5 bài có số**, bài "KK Coach" trả `👍1` (bằng chứng đường dữ
liệu chạy thật). Migration `20260808064846_post_insights_real_metrics`. **Còn nợ:** smoke UI (§6 mục 34), thumbnail
Drive hết hạn ⇒ 404 (§6 mục 35).

**Session trước đó:** **Plan 24 — thêm bài vào kho bằng cách DÁN LINK Google Drive.**
Modal "Thêm Ảnh/Video" giờ có **2 tab**: *Tải từ máy* (plan 23, giữ nguyên) và *Nhập từ link
Google Drive* (mới). **Kỹ thuật cốt lõi — user chốt: `drive.files.copy`**, tức Google tự nhân
bản file ở phía họ và **không byte nào của file đi qua backend** — link 2GB cũng chỉ là 1
request, không RAM/đĩa/băng thông, khác hẳn upload từ máy. Cấm tuyệt đối đường "tải về rồi đẩy
lên lại" (ghi thành ràng buộc cứng ở plan §0.1). **Modal chỉ có ĐÚNG 2 field** (user chốt): ô dán link (mỗi dòng
1 file) + checkbox "Gộp tất cả ảnh thành 1 bài nhiều ảnh". Mọi thứ khác ngầm định: tiêu đề =
tên file, caption `'-'` ⇒ **bài luôn vào Chờ duyệt** (kể cả ADMIN), danh mục `'Chưa phân
loại'`, không gán page/editor — biên tập sau lúc duyệt. Mặc định **mỗi dòng = 1
`content_assets`**, tick gộp mới về 1 record nhiều ảnh. **Luật gộp = "toàn ảnh"** (đã kiểm chứng
lại: `attached_media` của Graph API **chỉ nhận photo id** ⇒ không gộp nhiều video, **cũng
không trộn ảnh–video** trong một bài feed) — nên checkbox bị **khoá thật** cho cả 3 ca (toàn
video · trộn · quá 10 ảnh). Để khoá được thì phải biết loại file trước khi submit, mà link Drive
không chứa tên file ⇒ thêm endpoint **chỉ đọc** `POST /media/drive-imports/inspect`, FE gọi
**ngầm** (debounce 800ms sau khi ngừng gõ) — UI vẫn đúng 2 field. **Không có bước "Kiểm tra" riêng**:
một lần `POST /media/drive-imports` vừa soi link vừa tạo job, trả `{ jobs, skipped,
duplicates }`; dòng hỏng **không làm hỏng cả lô** (chỉ "không dòng nào dùng được" mới 400),
modal ở lại và giữ đúng những dòng hỏng trong ô dán kèm lý do để sửa rồi bấm lại. **Quyền truy cập (§0.4,
user chốt sau khi cân nhắc Google Picker/per-user OAuth/Playwright): chỉ 2 đường** — file được
share cho **email tài khoản Drive đang cấu hình**, hoặc để *"Bất kỳ ai có đường liên kết"*;
**private thì báo lỗi**, câu lỗi **nêu đúng email cần share tới** (thêm
`SettingsService.getDriveAccountEmail()`). Quyền Drive gắn với **tài khoản**, không gắn với
thiết bị — server không dùng được phiên đăng nhập trên máy user. **Dùng lại gần như toàn bộ
hạ tầng plan 23**: cùng bảng `media_upload_jobs` (thêm cột `source`), cùng dòng "mờ" + poll +
nút "Thử lại" + cron dọn. **Bốn chỗ dễ sai đã xử lý:** (1) khung vòng đời job tách thành
`MediaUploadJobsService.runJob()` **dùng chung 2 luồng** — luật "lỗi khi còn lượt retry ⇒ về
`QUEUED` chứ không `FAILED`" mà chép ra bản thứ hai thì sớm muộn cũng lệch; (2)
`MediaUploadLimitGuard` **chỉ đếm `source = LOCAL_FILE`** (trần 20 là trần **đĩa tạm**, job
copy không chạm đĩa — để nguyên thì dán 30 link là dính 503 vô lý); (3) **queue riêng
`media-drive-import`** để một video 500MB không chặn đầu hàng đợi hàng chục lệnh copy vài
giây; (4) job nhập từ link **luôn** retry được (`filesRemovedAt` vô nghĩa với nó). Caption bỏ
trống ⇒ lưu `'-'` **và ép `PENDING_REVIEW` kể cả ADMIN** — nếu để tự duyệt thì Bot có thể đăng
bài "-" lên Page thật. Thêm `content_assets.source_drive_file_id` để **cảnh báo** (không chặn)
nhập trùng; xoá bài chỉ xoá **bản copy**, file gốc bên Drive người khác không bị đụng. Không
nhận link **folder** (báo lỗi riêng), có checkbox **gộp ảnh thành 1 bài nhiều ảnh** (tắt mặc
định, dùng lại đường album của plan 22). Chi tiết:
[plans/24-drive-link-import.md](./plans/24-drive-link-import.md). `erd.md` đã cập nhật
(migration `20260807130353_drive_link_import`). BE **832 test xanh (+65)**, FE **49 test (+4)**,
lint/build 2 phía xanh. **Chưa test tay trên UI/Drive thật** ⇒ plan 24 ở `plans/`.


**Bổ sung cùng ngày (user test video ~200MB, plan 24b):** bấm Upload ở tab "Tải từ máy" vẫn
đứng chờ trong modal ⇒ **queue của plan 23 chỉ bỏ được chặng server → Drive, không bỏ được
chặng trình duyệt → server** (byte nằm trên máy user, không code nào rút ngắn được — 200MB
qua uplink 20Mbps là ~80s). Thứ sửa được là **sự chặn**, không phải thời gian: thêm hàng đợi
phía client (`useLocalUploadQueue` + `utils/uploadQueue.ts`) — bấm Upload là **đóng modal
ngay**, byte chạy nền tối đa **2 luồng song song** (uplink hẹp, chạy 5 luồng không nhanh hơn),
% THẬT từ XHR hiện trên chính dòng "mờ" của bảng, xong 100% thì `media_upload_jobs` phía
server tiếp quản (dòng đổi sang "Đang lên Google Drive"). Lỗi ⇒ dòng đỏ + "Thử lại" dùng lại
đúng `File` đã chọn (giữ trong ref, không vào state) + nút "Bỏ". Đã **xoá overlay khoá modal**
và toàn bộ state `uploading/uploadPercent/uploadPhase`. **Giới hạn đã biết:** F5/đóng tab giữa
chừng là mất file — có cảnh báo `beforeunload`; muốn bền hơn phải làm upload chunk/resumable
(đã cân nhắc, user chọn không làm vì **không nhanh hơn**, chỉ bền hơn khi rớt mạng).
**Cũng vá 1 regression do gộp modal 2 tab:** `closeCreateModal()` bị nhét guard
`if (uploading) return` nên luồng thành công gọi nó lúc `uploading` còn true ⇒ modal không
đóng, nhìn như mất fire-and-forget; guard đã chuyển về `onCancel` của Modal. FE **57 test
(+8)**, lint/build xanh. Lỗi này không test nào bắt được vì rule 02 không test component —
ghi nhận là loại lỗi chỉ lộ khi bấm tay.
---

**Session trước đó:** **Plan 23 — bấm "Upload" không còn phải đứng chờ Google Drive.**
Trước đây một request upload ôm trọn: nhận file → đẩy Drive → tạo bài, nên modal khoá cho tới khi
xong, upload liên tiếp phải chờ từng cái. Giờ request **chỉ nhận file xuống đĩa** (`MEDIA_UPLOAD_TMP_DIR`,
multer `diskStorage`) rồi trả **202** ngay; phần đẩy Drive + tạo `content_assets` chuyển sang **queue
BullMQ thứ hai của dự án: `media-upload`** (concurrency `MEDIA_UPLOAD_CONCURRENCY`, mặc định 3 — cửa
sổ trượt, job xong là job kế tiếp vào ngay). Trong lúc chờ, bảng `/content` hiện **dòng "mờ"** kèm
trạng thái (FE poll `GET /media/upload-jobs` mỗi 3s, **chỉ khi còn job chạy**), xong thì dòng thật thay
chỗ; lỗi thì dòng mờ đổi đỏ + nút **"Thử lại"** dùng lại file tạm (không bắt chọn lại file).
**Chặn quá tải bằng `MediaUploadLimitGuard`** đặt ở tầng **Guard** (chạy TRƯỚC multer): đủ
`MEDIA_UPLOAD_MAX_PENDING_JOBS` (20) job đang chạy ngầm ⇒ **503 ngay khi chưa ghi byte nào xuống đĩa**;
FE giữ nguyên modal + file đã chọn. **Đảo ngược có kiểm soát quyết định "chỉ stream, không ghi disk"**
(`PLAN-MVP.md` §4) — worker chạy sau khi response đã trả nên file **bắt buộc** phải sống ngoài vòng đời
request; bù lại có trần 20 job (⇒ trần đĩa ≈ 20 × file lớn nhất), TTL dọn định kỳ
(`MEDIA_UPLOAD_JOB_RETENTION_MS`) và dọn sạch lúc boot. **Ba chỗ dễ sai đã xử lý:** (1) lỗi khi **còn
lượt retry** phải trả job về `QUEUED` chứ không `FAILED` — để `FAILED` thì guard đếm hụt và processor
(chỉ nhận job `QUEUED` để không tạo bài trùng) tự bỏ qua chính lượt retry của mình; (2) retry phải
`queue.remove` rồi add bằng **jobId mới** (Bull bỏ qua lặng lẽ jobId trùng — cùng cạm bẫy plan 07);
(3) worker tạo bài qua **đúng** `ContentAssetsService.create()` của `POST /content-assets` với actor =
**người bấm Upload** (không phải Bot) ⇒ quyền duyệt/ownership/audit `CONTENT_UPLOAD` giống hệt, không
có bản logic thứ hai. Schema lệch bản nháp plan: dùng `files` (jsonb, N file/1 job cho bài nhiều ảnh
của plan 22) thay vì các cột 1-file, thêm `files_removed_at`. `POST /media/upload` cũ **giữ nguyên**.
Chi tiết: [plans/23-queue-media-upload.md](./plans/23-queue-media-upload.md). `erd.md` đã cập nhật
(migration `20260806171728_media_upload_jobs`). BE **767 test xanh (+30)**, FE **45 test (+4)**,
lint/build 2 phía xanh. **Chưa test tay trên UI thật** ⇒ plan 23 còn ở `plans/` (§6 mục 29).

---

**Session trước đó:** **Plan 22 — đổi hướng "bài nhiều ảnh": gom ảnh ngay ở 1
`content_assets` record lúc upload, thay cho `assetsPerPost` của plan 21.** Theo quyết định user
2026-08-06: ở màn Quản lý Ảnh/Video chọn **nhiều ảnh cùng lúc** ⇒ tạo **1** record duy nhất (ảnh
đầu là ảnh đại diện, phần còn lại vào bảng mới `content_asset_files` với `position >= 1`); khi đăng
— **tay hay Bot đều vậy** — toàn bộ ảnh của record lên thành **1 bài Facebook nhiều ảnh**, không
phải cấu hình gì thêm ở mốc giờ. **Vì sao bỏ hướng cũ:** để Bot tự ghép N record rời rạc thì picker
phải loại trừ 2 đường (dễ đăng lặp), và đăng tay không dùng được. Hướng mới đơn giản hơn hẳn:
picker quay lại **1 job = 1 content** như trước plan 21, và **đăng tay tự động có album** mà không
cần code thêm ở `manual-post`. **Migration `20260806090000_content_asset_files` đảo ngược 1 phần
`20260805170928_album_post`**: xoá `auto_post_slots.assets_per_post` + xoá nguyên bảng
`publish_job_assets`, thêm `content_asset_files` (cascade theo content). Kiểm tra trước khi chạy:
`publish_job_assets` **0 dòng**, mọi slot `assets_per_post = 1` ⇒ không mất dữ liệu. **Hạ tầng đăng
album của plan 21 giữ nguyên** (`publishImageAlbum` 2 pha, mượn file tuần tự nên RAM phẳng) — chỉ
đổi *nguồn* danh sách ảnh. **Ba cạm bẫy đã xử lý:** (1) `job.assets` giờ là danh sách **file** (id
của `content_asset_files`) ⇒ executor phải ghi trạng thái bằng `[job.contentAssetId]`, dùng
`asset.id` sẽ upsert assignment bằng id không tồn tại và nổ FK; (2) xoá bài phải xoá **mọi** file
Drive — bảng con cascade nên sau đó không ai nhớ fileId ảnh phụ nữa; (3) việc ghép ảnh nằm ở **một**
hàm duy nhất `toPublishContents()` (`publish-media.service.ts`) cho cả 2 đường publish. API:
`ContentAssetResponse` thêm `imageCount` + `extraFiles`; `POST /content-assets` nhận `extraFiles`
(chỉ với `mediaType=image`, tối đa `MAX_IMAGES_PER_CONTENT_ASSET` = 10, validate ở service). FE:
Upload cho chọn nhiều ảnh (chọn video ⇒ ép về 1 file), badge `+N ảnh` trên bảng + tag "Bài N ảnh"
trong Drawer, bỏ ô "Số ảnh/video trong 1 bài" ở `/auto-post`. Chi tiết:
[plans/22-content-multi-image.md](./plans/22-content-multi-image.md). `erd.md` đã cập nhật.
BE **737 test xanh (+10, đã xoá test cũ của plan 21)**, FE 41 test cũ xanh, lint/build 2 phía xanh.
**Chưa test tay trên UI/Page thật** ⇒ plan 22 còn ở `plans/` (§6 mục 28). `plans/21-album-post.md`
**ở lại `plans/`** với trạng thái ❌ BỊ THAY THẾ — không chuyển vào `DONE/`.

---

**Session trước đó:** **Plan 21 — mốc giờ đăng có thêm "Số ảnh/video trong 1 bài"
(`assetsPerPost`, mặc định 1) — ❌ ĐÃ BỊ PLAN 22 THAY THẾ VÀ GỠ BỎ, giữ lại đoạn dưới chỉ để hiểu
lịch sử.** Khi `assetsPerPost` > 1, Bot lấy N ảnh liên tiếp trong danh mục (thứ tự
`updated_at ASC`, cũ → mới) và đăng thành **MỘT** bài Facebook nhiều ảnh, không phải N bài lẻ.
Tổng ảnh lấy mỗi lần chạy = `postCount × assetsPerPost`; nhóm cuối thiếu vẫn đăng. **Album chỉ
áp dụng cho ảnh** — Graph API không ghép nhiều video/trộn ảnh-video vào một bài feed, nên
`assetsPerPost > 1` bắt buộc `mediaType = image` (chặn ở service, 400; FE khoá ô nhập). **Schema:**
`auto_post_slots.assets_per_post` + bảng mới `publish_job_assets` **chỉ chứa ảnh phụ**
(`position >= 1`; ảnh đầu vẫn là `publish_jobs.content_asset_id`) ⇒ timeline/dashboard/monitor/
đăng tay/retry không phải sửa, job cũ không cần backfill. **Cạm bẫy đã xử lý:** picker phải loại
**cả hai** đường (job chính **và** ảnh phụ), nếu không tick sau Bot chọn lại đúng những ảnh vừa
gom vào album và đăng lần nữa. Publisher thêm `publishImageAlbum` (upload từng ảnh
`published=false` → `POST /feed` kèm `attached_media[i]`), mượn file tuần tự nên RAM phẳng như
luồng 1 ảnh. Khi thành công, **mọi** ảnh trong bài cùng nhận một `facebook_post_id` + assignment
`published_at`. Chi tiết: [plans/21-album-post.md](./plans/21-album-post.md). `erd.md` đã cập nhật
(migration `20260805170928_album_post`). BE **735 test xanh (+20)**, FE 41 test cũ xanh, lint/build
2 phía xanh. **Chưa từng smoke UI/Page thật** — và sẽ không smoke nữa: toàn bộ cơ chế
`assetsPerPost` + `publish_job_assets` mô tả ở trên **đã bị xoá khỏi code và DB** ở plan 22.

---

**Session trước đó:** **Fix bug + nâng giới hạn upload (ngoài scope plan, theo yêu cầu user):**
User test tay upload video ~450MB gặp `413 Content Too Large` nhưng toast chỉ hiện "Lỗi không
xác định". **Nguyên nhân:** lỗi 413 này chặn ở tầng proxy đứng trước backend (Nginx/CDN theo
`client_max_body_size`, không phải Nest/Multer — `MediaController` dùng `memoryStorage()` không
giới hạn size cứng, size thật được `MediaService.upload()` check ĐỘNG theo `maxUploadMb` từ
Settings/DB, và exception đó vẫn trả JSON message rõ ràng bình thường). Phản hồi 413 từ proxy là
HTML, không phải JSON của app ⇒ `parseError()` ở `frontend/src/api/client.ts` rơi vào nhánh catch,
dùng `res.statusText` — với response HTTP/2 (phổ biến qua HTTPS) statusText luôn rỗng (RFC 7540 bỏ
reason phrase) ⇒ hiện "Lỗi không xác định" dù nguyên nhân xác định được qua status code. **Fix:**
thêm map `NON_JSON_STATUS_MESSAGES` (413/502/503/504) trong `client.ts`, fallback cuối cùng luôn
kèm mã lỗi thay vì mù mờ hoàn toàn. **Nâng giới hạn:** `MAX_UPLOAD_MB` mặc định 300→500 ở
`backend/src/config/env.validation.ts` + `.env`/`.env.example`/`.env.production.example` (validate
DTO `UpdateDriveSettingsDto.maxUploadMb` đã cho phép tới 2048 nên không cần đổi). **Lưu ý quan
trọng:** nếu bảng `app_settings` (key `google_drive`) đã có bản ghi, giá trị `maxUploadMb` lưu
trong DB **ghi đè** giá trị mặc định từ env — nếu vậy phải vào `/settings` → tab Google Drive sửa
tay ô "Giới hạn dung lượng 1 file upload" thành 500 (chưa kiểm tra DB thật). Nginx/timeout mạng
(`client_max_body_size`, proxy buffering, LB timeout) là việc user tự cấu hình, không đụng ở đây.
BE +1 test (`env.validation.spec.ts`, 715 tổng), FE +4 test (`client.test.ts`, 39 tổng), lint/build
2 phía xanh. Chưa smoke lại bằng file 450MB thật (không có môi trường proxy để tái hiện 413 tại
đây) — nợ vào §6 nếu cần xác nhận sau khi user chỉnh Nginx.

---

**Session trước đó:** **Dashboard (plan 14) — thêm 3 chart theo yêu cầu user:**
(1) line chart "Tỷ lệ thành công/thất bại theo ngày" (%) — tính lại từ dữ liệu
`GET /dashboard/chart/daily` đã fetch sẵn, không gọi thêm API; ngày chưa có job đóng sổ ⇒
`null` (khoảng trống trên line), khác `0%`. (2) bar chart "Tổng bài đăng thành công theo page"
— gọi lại `GET /dashboard/posts-by-page` với `mediaType=all` **cố định** (độc lập bộ lọc
ảnh/video của chart chi tiết sẵn có), cộng `imagePosts+videoPosts`. (3) bar ngang "Top danh
mục đăng thành công nhiều nhất, gộp mọi page" (mặc định 10) — **endpoint mới**
`GET /dashboard/top-categories?from=&to=&limit=` (**ngoài `docs/04` §8**, cùng kiểu bổ sung
như `/health`), raw SQL group theo `content_assets.category` (text tự do, không bảng riêng)
đếm `publish_jobs.status=SUCCESS` + `COUNT(DISTINCT facebook_page_id)` làm `pageCount`; scope
RBAC giống `production.successPosts` (CONTENT chỉ thấy danh mục bài của mình). File:
`backend/src/modules/dashboard/{dashboard.types,dashboard.repository,dashboard.service,
dashboard.controller,dto/query-dashboard.dto}.ts`, `frontend/src/{api/dashboard.api,
hooks/useDashboard,pages/DashboardPage,types/index}.ts`. **Không đụng schema ⇒ `erd.md` giữ
nguyên.** BE +4 test (714 tổng), FE 35 test cũ xanh, lint/build 2 phía xanh. **Chưa smoke UI
thật** — cộng dồn vào nợ UI sẵn có của plan 14 (§6 mục 18).

---

**Cập nhật lần cuối:** 2026-08-05 (Plan 20 — Facebook resumable upload video + chặn job đăng trùng)
**Session gần nhất (mới nhất):** **Vá 3 bug production phát hiện qua test tay plan 20:**
(1) tên file ảnh/video tiếng Việt lên Drive bị lỗi font (mojibake) — do Busboy decode
multipart header theo `latin1` mặc định, sửa bằng decode lại `latin1→utf8` ở
`media.controller.ts`. (2) Video ~180MB đăng thủ công/auto-post bị `502` — do đẩy toàn bộ
video trong 1 POST tới `graph-video.facebook.com`, Facebook cắt kết nối giữa chừng với file
lớn. Sửa bằng chuyển `publishVideo` sang **Facebook Resumable Upload API** (start/transfer/
finish theo chunk do Facebook điều khiển offset, retry riêng từng pha) — trả nợ kỹ thuật #22
cũ. (3) Test tay video 180MB lộ ra `/timeline` hiện 2 record (1 lỗi + 1 thành công) cho cùng
1 bài — **bug thật**: `ManualPostService.publishNow` không chặn tạo job trùng khi content+page
đã có job QUEUED/PUBLISHING/FAILED, và `content-picker` (auto-post) chỉ loại QUEUED/PUBLISHING,
**không loại FAILED** nên Bot có thể tự re-pick nội dung vừa lỗi. Đã thêm guard 409 ở cả 2
đường + test byte-exact xác nhận resumable upload không làm hỏng video. BE **710 test xanh**,
lint/build xanh. Phát hiện `docs/03-database-design.md` lệch code (thiếu `FAILED` trong mẫu
SQL) — ghi nợ §6 mục 27, **không tự sửa `docs/`** theo rule 00. **User test tay 3 video thật
(162.5MB, 130.5MB, 48MB): không còn 502 lần nào.** Điều tra tốc độ (~5.5-7.4 Mbps, chỉ bằng
1/40 so với ~310 Mbps băng thông thô đo bằng `curl`) đã **ĐÓNG**: log chi tiết chunk đầu
(1622ms) so với TB chunk sau (1425ms) chỉ chênh ~14% (loại bỏ giả thuyết lỗi tái dùng kết nối
trong code), biên độ chunk sau chênh ~7 lần (881-6300ms) là dấu hiệu Facebook rate-limit kiểu
bucket cho phiên Resumable Upload — kết luận: giới hạn từ phía Meta, không sửa được bằng code.
Xem plan 20 §4c-§4d. Việc còn lại trước khi đóng plan 20: test 409 chặn job trùng trên UI thật
+ đo RSS khi upload video lớn (§6 mục 22).

---

---

**Session trước đó:** **M9 Dashboard (plan 14) — code xong, chưa smoke UI.**
`/dashboard` là màn **cuối cùng** bỏ mock ⇒ toàn bộ 10 trang FE đã chạy API thật. Backend
module mới `dashboard/` chỉ đọc: `GET /dashboard/{stats,chart/daily,posts-by-page}` theo
đúng tên ở `docs/04` §8, thêm `GET /dashboard/health` (**ngoài docs**) gom 5 cảnh báo vận
hành (job hỏng/kẹt, mốc giờ bỏ lỡ, page hết bài, token sắp hết hạn) — mỗi cảnh báo kèm
`link` sang màn xử lý, mượn lại `MonitorService` + `AutoPostConfigsService` thay vì tính lại.
**Ba quyết định về ngữ nghĩa số liệu** (plan 14 §3.2): thẻ tồn kho là **snapshot hiện tại**
(không lọc theo range, vì "còn bao nhiêu bài chờ duyệt" luôn là câu hỏi *bây giờ*), job đếm
theo `schedule_time` (job FAILED không có `published_at`), content đếm theo `created_at`.
**RBAC scope ở service, không phải guard**: `dashboard:view` có ở cả 3 role nên CONTENT chỉ
được đếm trên bài của chính mình (nếu không thì đây là đường rò rỉ ngược so với `/content`),
EDITOR không thấy `activeUsers` và không thấy cảnh báo token, CONTENT gọi `/dashboard/health`
⇒ 403. **Không đụng schema ⇒ `erd.md` giữ nguyên**, không thêm biến env. BE **542 test xanh
(+26)**, FE 32 test cũ xanh, lint/build 2 phía xanh. **Đã smoke API thật** và **bắt được 1 lỗi
timezone mà unit test không thể bắt** (xem §7 cạm bẫy: phải `AT TIME ZONE 'UTC'` trước rồi mới
`AT TIME ZONE 'Asia/Ho_Chi_Minh'`). **Chưa bấm tay trên UI** ⇒ plan 14 vẫn ở `plans/`, xem §6 mục 18.

---

**Session trước đó:** **M8 Monitor (plan 13)** — 3 màn Queue/Failed/Audit bỏ mock (chi tiết ở §5).

---

**Session trước đó:** **Chốt đóng MVP + mở Phase 2 (M8 Monitor).** User quyết
định đóng MVP ngày 2026-07-25: toàn bộ M0→M7 chuyển ✅, 12 file plan còn lại chuyển vào
`plans/DONE/`, `PLAN-MVP.md` §5 tick xong. **Nợ nghiệm thu không mất đi** — vẫn nằm nguyên
ở §6 (đăng thật lên Page thiếu token — mục 10; smoke UI các trang — mục 5, 7–9, 11–16);
đóng MVP nghĩa là không mở lại milestone, không phải "đã kiểm chứng hết trên UI thật".
Tiếp theo: **M8 Monitor** — 3 màn `Queue Monitor` / `Failed Jobs` / `Audit Logs`, plan
thiết kế xong ở [plans/13-monitor.md](./plans/13-monitor.md), **chưa code dòng nào**.
Ba màn này trước ở "ngoài scope MVP", nay chuyển vào Phase 2 theo yêu cầu user.

---

**Session trước đó:** **Auto-post engine** (plan 07) — trái tim của MVP.
Cron `@Cron('* * * * *', tz Asia/Ho_Chi_Minh)` chạy **trong chính process backend** (ADR-002,
không phải crontab OS): mỗi phút lấy slot tới giờ → picker chọn bài (raw SQL theo docs/03 §7)
→ tạo `publish_jobs` QUEUED + đẩy vào BullMQ `publish-facebook` (3 attempts, backoff mũ 60s)
→ worker tải file Drive → Graph API → ghi kết quả. Hai module mới: `modules/auto-post/`
(scheduler + `content-picker.repository` + `slot-run.{repository,service}` + `POST /auto-post/run-now`
để chạy tay khỏi đợi mốc giờ) và `modules/publish-jobs/` (repository/service/executor/processor
+ `GET /publish-jobs`, `GET /publish-jobs/:id/events`). **Log vào DB 2 tầng theo yêu cầu user:**
`slot_runs` mở rộng thành nhật ký cron (status/picked_count/job_created_count/skip_reason/
started_at/finished_at/error_message — vẫn giữ UNIQUE chống double-fire) + bảng mới
`publish_job_events` (attempt_no, event, message, `raw_error` jsonb đã lọc token) ⇒
**migration `20260725122007_autopost_engine_logs`, `erd.md` đã cập nhật.** Đường đăng bài rút
thành `PublishMediaService` dùng chung với đăng tay (plan 09) để không có 2 bản logic publish.
`/timeline` hiện thêm lý do cron skip + modal "Xem nhật ký" của job. BE 452 test xanh (+41),
FE 32 test cũ xanh, lint/build 2 phía xanh. **Đã smoke thật với DB+Redis** (page test token sai
để không đăng nhầm lên page thật): tick tạo job đúng, gọi tick 2 lần cùng phút ⇒ chỉ 1 job,
bài đang QUEUED ⇒ tick sau `SKIPPED/NO_CONTENT`, token sai ⇒ 3 lần thử rồi `GAVE_UP` + job FAILED
+ content tự về APPROVED; dữ liệu smoke đã xoá. **Chưa đăng thật lên Facebook** (thiếu Page token
— §6 mục 10) và **chưa smoke UI thật**.
**Bổ sung cùng ngày (yêu cầu user):** slot 22:00 chạy ra `SKIPPED/NO_CONTENT` mà UI không
nói vì sao ⇒ thêm chẩn đoán "hết bài": `GET /auto-post-configs` trả `readyCount` +
`readiness` (`READY`/`NO_ASSIGNMENT`/`NO_MATCH`/`PAUSED`, hàm thuần `auto-post/slot-readiness.ts`,
phân biệt "chưa phân bổ bài cho page" với "có bài nhưng không khớp danh mục/media") +
`lastRun` (lần cron gần nhất hôm nay). FE `/auto-post` thêm cột "Kho bài" + "Bot chạy hôm nay"
+ banner cảnh báo; `/timeline` đổi dòng chữ nhỏ thành tag + `Alert` nói rõ cách sửa, và phân
biệt "chạy rồi nhưng hết bài" với "chưa từng chạy". Tách `ContentPickerModule`/`SlotRunModule`
để tránh vòng phụ thuộc. BE 464 test xanh (+12).

**Bổ sung cùng ngày (yêu cầu user) — đăng lại thủ công khi Bot bỏ qua:** retry tự động
(3 lượt) hết lượt là job nằm im `FAILED`, mốc giờ bị bỏ qua thì không có đường chạy lại.
Thêm 2 nút ở `/timeline`: **"Đăng lại"** từng job (`POST /publish-jobs/:id/retry`, quyền
`jobs:retry` = ADMIN) và **"Chạy lại mốc này"** cho cả slot (`POST /auto-post/slots/:id/run-now`,
quyền `autopost:manage`, chạy ngay không cần trùng phút). Chặn đăng trùng: job đang
`QUEUED`/`PUBLISHING` ⇒ 409, bài đã đăng lên page đó ⇒ 409, page tạm dừng/xoá ⇒ 400; slot
run-now vẫn qua `slot_runs` claim theo phút hiện tại. **Cạm bẫy đã xử lý:** bull job cũ còn
trong Redis (`removeOnFail: false`) ⇒ phải `queue.remove` rồi add với jobId mới
`publish-<id>-retry-<ts>`, nếu không BullMQ bỏ qua lặng lẽ. Audit action mới
`PUBLISH_JOB_RETRY`. Không đụng schema ⇒ `erd.md` giữ nguyên. BE 485 test xanh (+21),
FE 32 test cũ xanh, lint/build 2 phía xanh. **Chưa smoke UI thật.**

**Session trước:** **Lịch đăng bài** (plan 12) — biến trang `/timeline`
từ mock thành màn **tracking lịch + tiến độ đăng tự động của mọi page**, dữ liệu map
thẳng từ "Cài đặt đăng bài tự động": mỗi mốc giờ (`auto_post_slots`) × page = một dòng
lịch trong ngày, kèm kế hoạch (`postCount`) / đã đăng / đang chạy / lỗi / **kho còn bao
nhiêu bài dùng được**. Backend module mới `publish-schedule` (`GET /publish-schedule?date=&pageId=&status=`,
gác `timeline:view` ⇒ CONTENT 403) + `ClockService` (`src/infra/clock/`, plan 07 dùng lại)
+ `common/utils/datetime.util.ts` (quy đổi ngày/giờ VN ↔ UTC) + hàm thuần
`resolveSlotProgress` 8 trạng thái (PENDING/RUNNING/DONE/PARTIAL/FAILED/MISSED/NO_CONTENT/PAUSED).
**Bài đăng tay cũng được map** (yêu cầu user): job `created_by != 'Bot'` gom thành dòng
`kind: 'manual'`, và **người đăng hiển thị đúng tên USER** thay vì "Bot" (`publishedBy`
per job + `publishers` per dòng); job của Bot lệch giờ slot (slot bị xoá/đổi giờ) hiện
thành dòng "Ngoài lịch". **Không đụng schema** ⇒ `erd.md` giữ nguyên. BE 411 test xanh
(+28), FE 32 test cũ xanh, lint/build 2 phía xanh. **Đã smoke API với backend thật**
(dữ liệu thật: 2 slot MISSED hôm nay, 1 bài đăng tay 13:13 do "System Admin", ngày mai
ra PENDING/NO_CONTENT đúng, filter page/status, date sai ⇒ 400, CONTENT ⇒ 403) —
**chưa smoke UI thật**, xem §6 mục 14. Mỗi job trong lịch có link **"Xem/sửa bài trong
kho"** → `/content?edit=<contentAssetId>`; `ContentManagementPage` đọc param này và mở
luôn Drawer sửa bài đó (hook mới `useContentAsset`), xoá param ngay sau khi mở.

**Trước đó:** Theo yêu cầu user: (1) **Content giai đoạn 2** (plan 11,
tiếp plan 04) — mở lại 3 khối UI đang bị ẩn ở "Quản lý Ảnh/Video Edit": **Phân bổ page**,
**Trạng thái duyệt**, checkbox **Đạt ADS**, kèm backend thật: `PATCH /content-assets/:id`
nhận `status`/`isAds`/`rejectComment`/`assignedPageIds`, transition tách ra hàm thuần
`content-status.transition.ts` (client set PUBLISHING/PUBLISHED ⇒ 422, REJECTED thiếu lý
do ⇒ 400, APPROVED ⇒ ghi `approvedById`), RBAC field-level (CONTENT chạm `status`/`isAds`
⇒ 403; CONTENT sửa bài REJECTED ⇒ tự về PENDING_REVIEW), diff assignment trong 1
transaction (gỡ page đã đăng ⇒ 409, xoá bài đã đăng ⇒ 409, page lạ ⇒ 400). Audit thêm
`CONTENT_STATUS_CHANGE`/`CONTENT_ADS_MARK`/`CONTENT_ASSIGN_PAGE`. (2) **Hashtag quick
update** — `GET /content-assets/hashtags` gom tag đã dùng từ chính cột `hashtags` (không
thêm bảng, **schema không đổi** ⇒ `erd.md` giữ nguyên) + component FE `HashtagInput`
(`Select mode="tags"`): vừa gõ vừa gợi ý, tag chưa có thì Enter là tạo mới, không popup
riêng. (3) **Danh mục ("Dạng") cũng vậy** — `GET /content-assets/categories` (groupBy
category) + `CategorySelect` (select-1 `showSearch`, gõ tên chưa có ⇒ dòng "＋ Thêm ..."),
`category` được `trim()` ở service; **bỏ hardcode `CONTENT_CATEGORIES`** khỏi mọi ô chọn
(ContentManagementPage, AutoPostSettingsPage, ManualPostModal) — nó chỉ còn là danh sách
mồi khi DB rỗng. Bảng danh sách **bỏ cột "Người sửa gần nhất"**, thay bằng cột **"Phân bổ page"**
(tag xanh = đã đăng) theo yêu cầu user; thông tin người sửa vẫn ở chân Drawer. BE 383 test
xanh (+22), FE 32 test (+9 `utils/hashtags.ts`, +6 `utils/categories.ts`), lint/build 2
phía xanh. **Đã smoke API
qua curl** đủ các case 403/400/422/409 + gợi ý hashtag — **chưa smoke UI thật**, xem plan
11 + §6 mục 13.

**Trước đó:** Bổ sung theo yêu cầu user cho trang **Cài đặt đăng bài
tự động** (plan 09): **filter theo FB Page** + **nút "Đăng bài thủ công"** — popup chọn
page, lọc danh mục/loại media, chọn 1 bài ảnh/video trong kho, sửa caption/hashtag lấy
sẵn từ bài rồi **đăng ngay lập tức** qua Graph API. Backend thêm module `manual-post`
(`POST /manual-post`, gác `autopost:manage`) và adapter publisher đầu tiên
`infra/facebook/facebook-publisher.client.ts` (ảnh `/{pageId}/photos`, video
`/{pageId}/videos` trên host `graph-video`). Đăng xong ghi `publish_jobs` + `content_page_assignments`
+ chuyển content sang `PUBLISHED` trong **một transaction**; lỗi Graph/Drive ⇒ job FAILED
+ 502 kèm message tiếng Việt. Không đụng schema ⇒ `erd.md` không đổi. BE 357 test xanh
(11 test mới), lint/build 2 phía xanh, FE 16 test cũ vẫn xanh. **Chưa đăng thật lên page**
— vẫn kẹt ở nợ §6 mục 10 (chưa có Page token).
**Trước đó:** Bổ sung theo yêu cầu user cho trang **Facebook Pages**:
nút **"Test kết nối"** trong popup thêm/sửa Page + **ô search** trên bảng danh sách.
Tạo adapter Meta Graph đầu tiên của dự án `backend/src/infra/facebook/` (interface +
`FacebookGraphClient` dùng fetch + map lỗi Graph sang message tiếng Việt), 2 endpoint
`POST /pages/test-connection` (cấu hình chưa lưu) và `POST /pages/:id/test-connection`
(token đã lưu trong DB), cả hai gác `pages:manage`. Sai cấu hình trả `200 {ok:false,message}`
để form hiện lý do. Không đụng schema, không thêm biến env. Sau đó **gọi Graph thật** và
phát hiện 2 lỗi mock test không thấy: field `tasks` không tồn tại trên page node, và lỗi
`(#10)` bị map nhầm thành "thiếu quyền" trong khi lỗi thật là sai Page ID ⇒ thêm
`debugToken()` gọi trước, response thêm `tokenType`/`expiresAt`. BE 343 test xanh,
lint/build 2 phía xanh — xem plan 05 §8 + §7 cạm bẫy. **Còn thiếu Page token dài hạn
(System User) để chạy thật** — §6 mục 10.
**Trước đó:** Làm **M5 Cài đặt đăng bài tự động** (plan 06): module backend
`auto-post-configs` — **chỉ CRUD cấu hình**, phần logic auto đăng bài (cron picker +
BullMQ + publisher) tách hẳn thành module riêng ở plan 07 theo yêu cầu user.
5 endpoint theo docs/04 §6 (`GET /auto-post-configs`, `PATCH /auto-post-configs/:pageId`,
`POST /auto-post-configs/:pageId/slots`, `PATCH|DELETE /auto-post-slots/:slotId`), tất cả
gác `autopost:manage` (ADMIN + EDITOR). Không đụng schema ⇒ `erd.md` không đổi.
Nối FE `AutoPostSettingsPage` theo pattern Real/Mock split (`api/autoPost.api.ts`,
`hooks/useAutoPostConfigs.ts`). BE 318 test xanh (+32), lint/build 2 phía xanh,
**đã smoke test API qua curl với backend thật** nhưng **chưa smoke UI thật** — xem §6 mục 9.
Trước đó: **M4 Facebook Pages + token crypto** (plan 05): module
backend `facebook-pages` (repository/service/controller/dto/mapper) — tái dùng
`CryptoService` sẵn có từ M2 thay vì tạo `crypto.util.ts` riêng, thêm
`common/utils/token-mask.util.ts` (`maskToken`). `GET /pages` mọi role đọc được
(token luôn mask), `POST/PUT/DELETE` chỉ ADMIN (`pages:manage`), DELETE = soft
delete. Audit `PAGE_CREATE`/`PAGE_UPDATE`/`PAGE_TOKEN_UPDATE` không ghi giá trị
token. Nối FE `PageManagementPage` theo đúng pattern Real/Mock split của plan 04
(`api/pages.api.ts`, `hooks/usePages.ts`). BE 286 test xanh (12 test mới), lint/
build 2 phía xanh. **Đã smoke test qua curl với backend thật** (login → tạo/sửa/xoá
page → mask đúng → trùng pageId ⇒ 409 → EDITOR đọc được nhưng POST ⇒ 403 → grep log
không lộ token) nhưng **chưa smoke test UI thật qua trình duyệt** — xem §6.
Trước đó: smoke test OAuth2 Drive thật thành công (connect tài khoản Gmail qua UI)
sau khi đổi cổng backend dev từ 3100 → 3001 (khớp OAuth Client đã đăng ký ở Google
Console) — cập nhật `PORT`/`APP_BASE_URL` ở `.env`/`.env.example`/`env.validation.ts`
default + proxy Vite. Sau đó làm **M3 Content Assets giai đoạn 1** (CRUD cơ bản,
hoãn duyệt/isAds/phân bổ page sang giai đoạn 2, chốt với user 2026-07-24): module
backend `content-assets` (repository/service/controller/DTO, RBAC ownership
CONTENT-chỉ-bài-mình, xoá kèm file Drive) + nối FE `ContentManagementPage` (tách
`RealContentManagementPage` dùng API thật khỏi `MockContentManagementPage` giữ
nguyên mock, chọn theo `VITE_USE_MOCK`). Lint/build/test 2 phía xanh (BE 274 test,
FE 16 test) nhưng **chưa smoke test UI thật** — xem §6. Cũng sửa lại plan 03 (DONE)
cho khớp thực tế (bỏ driver `fake`, thêm OAuth2 — theo ADR-016/017 đã áp dụng nhưng
tài liệu cũ chưa cập nhật).

---

## 1. Ảnh chụp hiện trạng

| Thành phần | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `docs/` | ✅ Hoàn thiện | Spec v3.0, không sửa khi code |
| `.claude/rules/` | ✅ Hoàn thiện | 6 rule: workflow, coding, testing, context, env, ERD |
| `plans/` | ✅ Hoàn thiện | **14 file plan đã xong nằm hết ở `plans/DONE/`** (MVP đóng 2026-07-25). Đang mở: `plans/13-monitor.md` (M8), `plans/14-dashboard.md` (M9) + `_TEMPLATE.md`, `plans/22-content-multi-image.md` (bài nhiều ảnh — chưa smoke UI), `plans/23-queue-media-upload.md` (upload qua hàng đợi — chưa smoke UI), `plans/24-drive-link-import.md` (nhập bài từ link Drive — chưa smoke UI), `plans/21-album-post.md` (❌ BỊ THAY THẾ, giữ làm lịch sử) |
| `erd.md` | ✅ Thiết kế xong | Mermaid; **bắt buộc cập nhật khi đổi schema** |
| `frontend/` | 🟡 UI mock + auth thật + content CRUD + pages CRUD + auto-post CRUD | 10 page mock; **auth/login đã nối API thật** (M2.5). **`ContentManagementPage` đã nối API thật đầy đủ** (upload+CRUD+duyệt+Đạt ADS+phân bổ page+hashtag/danh mục quick-update). **`PageManagementPage` đã nối API thật** (CRUD + token mask). **`AutoPostSettingsPage` đã nối API thật** (CRUD mốc giờ + bật/tắt auto + filter page + đăng bài thủ công). **`UserManagementPage` đã nối API thật** (CRUD + vô hiệu hóa). **`TimelinePage` ("Lịch đăng bài") đã nối API thật** (lịch slot × page theo ngày + tiến độ + bài đăng tay). `SettingsPage` đã nối API thật (Drive 2 authMode). **`QueueMonitorPage` / `FailedJobsPage` / `AuditLogsPage` đã nối API thật** (M8, plan 13 — vẫn giữ nhánh mock theo ADR-005). **`DashboardPage` ("Tổng quan") đã nối API thật** (M9, plan 14 — thẻ số + 2 chart + khối "Cần chú ý"). **Không còn trang nào chạy mock** (nhánh `VITE_USE_MOCK` vẫn giữ theo ADR-005). |
| `backend/` | 🟡 Đang xây | Khung + **auth/RBAC/users** + **settings/media (Drive)** + **content-assets (CRUD + duyệt/ADS/phân bổ page + gợi ý hashtag/danh mục)** + **facebook-pages (CRUD + token crypto)** + **auto-post-configs (CRUD slot)** + **manual-post (đăng tay ngay qua Graph)** + **tracking người upload/sửa content** + **publish-schedule (lịch đăng bài, chỉ đọc)** + **auto-post engine (cron picker + BullMQ + publisher + log DB, plan 07)** + **monitor (queue summary + audit log đọc + publish-jobs phân trang, plan 13)** + **media-upload-jobs (upload qua hàng đợi BullMQ `media-upload`, plan 23; + nhập bài từ link Drive qua queue `media-drive-import` bằng `files.copy`, plan 24)** xong. Còn: đăng thật lên Facebook (thiếu Page token) |
| `worker/` | ⬜ Chưa có | Gộp vào backend process ở MVP (xem ADR-002) |
| `docker/` | ✅ Chạy được | Postgres 16 (55432) + Redis 7 (56379), cả hai healthy |

---

## 2. Scope MVP (đã chốt với user 2026-07-22)

Luồng duy nhất phải chạy được end-to-end:

```text
Upload video/ảnh → lưu Google Drive (folder cấu hình sẵn)
   → Quản lý FB Page (CRUD + token)
   → Cài đặt đăng bài tự động (slot: giờ + category + media type + số bài)
   → Cron picker lấy bài theo category/lịch → publish lên FB Page
```

**Trong scope:** auth/RBAC, users tối thiểu, media upload Drive, content-assets
(CRUD + duyệt + phân bổ page), facebook-pages, auto-post slots, cron scheduler +
picker query, BullMQ queue + processor, publish ảnh/video, timeline đọc job.

**Ngoài scope MVP:** dashboard aggregation nâng cao, queue monitor UI, audit log UI,
failed-jobs UI, reconciliation cron, Nginx/production compose.
(Vẫn ghi audit log ở backend vì rẻ, nhưng chưa làm màn hình.)

**Cập nhật 2026-07-25 — MVP đã đóng, mở Phase 2.** 3 màn **Queue Monitor / Failed Jobs /
Audit Logs** chuyển từ "ngoài scope" vào scope Phase 2 (M8, `plans/13-monitor.md`) theo
yêu cầu user. Vẫn ngoài scope: dashboard aggregation nâng cao, reconciliation cron,
Nginx/production compose, Instagram/TikTok, AI caption.

---

## 3. Quyết định kiến trúc (ADR)

| # | Quyết định | Lý do |
|---|-----------|-------|
| ADR-001 | Backend NestJS + Prisma, module theo feature | Theo docs/02 |
| ADR-002 | MVP chạy worker **cùng process** với API (`BullModule` + `@Processor`), tách process sau | Giảm hạ tầng; ranh giới module vẫn giữ nguyên nên tách sau chỉ là đổi bootstrap |
| ADR-003 | ~~Google Drive & Meta Graph bọc sau interface + có driver `fake` bật bằng env~~ **Bỏ 2026-07-24** — xem ADR-017 | Chạy/test local không cần credential thật |
| ADR-004 | ~~Coverage 100% bắt buộc cho service/domain~~ **Đổi 2026-07-23:** MVP ưu tiên tốc độ ⇒ chỉ test logic phức tạp/dễ sai khi cần; auto-post engine + crypto/token vẫn **bắt buộc** phủ kỹ, CRUD thuần không cần | User yêu cầu đi nhanh phase MVP; xem `.claude/rules/02-testing.md` §Chủ trương |
| ADR-005 | FE gọi API thật, giữ mock sau cờ `VITE_USE_MOCK` | Chốt với user |
| ADR-006 | Chống cron double-fire bằng bảng `slot_runs` UNIQUE(slot_id, run_date, run_time) thay vì Redis SETNX | Bền vững qua restart Redis, dễ test |
| ADR-007 | `.env` + `.env.example` tách riêng cho `backend/`, `frontend/`, `docker/` | Yêu cầu user; FE chỉ chứa biến public |
| ADR-008 | `erd.md` (mermaid) là bản đồ dữ liệu bắt buộc, cập nhật cùng lúc với mọi thay đổi schema | Yêu cầu user; tránh schema trôi khỏi tài liệu |
| ADR-009 | Dùng **Prisma 7** + driver adapter `@prisma/adapter-pg`; connection URL ở `prisma.config.ts`, không ở `schema.prisma` | Bản mới nhất khi scaffold. Docs viết theo cú pháp Prisma 5 — **đọc docs/03 phải quy đổi** |
| ADR-010 | Prisma Client sinh ra `backend/generated/prisma` (gitignored), import qua đường dẫn tương đối | Prisma 7 yêu cầu `output` tường minh; chạy `npm run prisma:generate` sau khi clone |
| ADR-011 | Port dev lệch chuẩn: Postgres 55432, Redis 56379, API 3100 | Máy dev đã chiếm 5432/6379/3000 |
| ADR-012 | Guard đăng ký **global** (`APP_GUARD`): mặc định mọi route cần auth, route công khai phải `@Public()` | Quên gắn guard ⇒ route lộ ra ngoài. Đảo mặc định lại thì quên `@Public()` chỉ gây 401, an toàn hơn nhiều |
| ADR-013 | Không dùng passport/JwtStrategy; `JwtAuthGuard` gọi thẳng `JwtService.verifyAsync` rồi **đọc lại user từ DB mỗi request** | Cần user bị khóa mất hiệu lực ngay, không chờ token hết hạn. Đã phải query DB thì strategy chỉ là lớp trung gian thừa |
| ADR-014 | Cấu hình Google Drive (driver, folder, service account) lưu **động trong bảng `app_settings`** (JSONB, secret mã hoá AES-256-GCM), sửa qua UI **"Cài đặt chung"** (`/settings`, chỉ ADMIN). `.env` chỉ còn là **fallback bootstrap** khi DB chưa có bản ghi | Yêu cầu user 2026-07-23: không muốn hardcode key/folder trong `.env`, cần đổi được từ UI không restart |
| ADR-016 | Drive `real` có **2 authMode**: `service_account` (chỉ ghi Shared Drive/Workspace) và `oauth2` (tài khoản Google, dùng được Gmail free). OAuth lấy refresh token bằng **flow trong app** (callback public bảo vệ bằng `state`). Chọn switch ở UI, lưu trong `app_settings` (secret mã hoá) | Service account **không có quota** ⇒ không upload được My Drive của Gmail cá nhân; Shared Drive cần trả phí. OAuth2 cho phép dev/user free vẫn chạy thật. Xem plan 03c |
| ADR-015 | **BE + API song song:** từ M3, mỗi milestone backend tự nối luôn FE trang tương ứng (bỏ mock cho trang đó) thay vì dồn nối API về cuối. Thêm milestone M2.5 dựng `api/client.ts` + `AuthContext` một lần dùng chung. M7 chỉ còn dọn phần sót + nghiệm thu end-to-end | Yêu cầu user 2026-07-23: xong milestone nào phải test tay được trên UI thật ngay, không chỉ curl/Swagger |
| ADR-018 | **Page token lấy qua "Đăng nhập bằng Facebook"** (plan 15): OAuth authorization-code phía server → user token ngắn hạn → **user token dài hạn (~60 ngày)** → `/me/accounts` lấy Page token. Page token dẫn xuất từ user token dài hạn **không có hạn dùng**. Bảng mới `facebook_connections` giữ user token (mã hoá) để đồng bộ/lấy lại token. Luồng dán token tay **giữ nguyên** song song (`facebook_pages.connect_mode`). App ID/Secret vào `app_settings['facebook_app']` theo ADR-014, `.env` chỉ là fallback | Yêu cầu user 2026-07-26: chỉ được **share quyền** trên Page doanh nghiệp, không cầm System User ⇒ không lấy được token vĩnh viễn theo đường cũ (§6 mục 10 kẹt từ 25/07). Không dùng JS SDK popup vì bước đổi long-lived bắt buộc cần `appSecret` — phải làm ở server dù có SDK hay không |
| ADR-017 | **Bỏ hẳn driver `fake`** cho Google Drive và Facebook (thay ADR-003). Xoá `DriverMode`, `FakeDriveStorage`, `DRIVE_DRIVER`/`FACEBOOK_DRIVER`. Drive luôn dùng `GoogleDriveStorage` (service_account hoặc oauth2); Facebook publisher (chưa code, plan 07) sẽ chỉ có driver thật khi làm | Yêu cầu user 2026-07-24: chỉ dùng cấu hình thật, không cần chế độ giả lập nữa. Unit test vẫn mock adapter qua interface (rule 02), không cần class fake riêng |

---

## 4. Tiến độ theo milestone

Xem kế hoạch chi tiết: [PLAN-MVP.md](./PLAN-MVP.md)

| Milestone | Trạng thái | Ngày xong |
|-----------|-----------|-----------|
| M0 — Scaffold + Docker + Prisma | ✅ | 2026-07-22 |
| M1 — Auth + RBAC + Users | ✅ | 2026-07-22 |
| M2 — Google Drive + Media upload | ✅ | 2026-07-23 |
| M2.5 — FE core (api client + AuthContext + Login) | ✅ | 2026-07-23 — code+test xong; smoke UI còn nợ (§6 mục 5) |
| M3 — Content Assets + assignments (+ nối FE ContentPage) | ✅ | 2026-07-25 — giai đoạn 1 (CRUD, plan 04) + giai đoạn 2 (duyệt/isAds/phân bổ page/hashtag, plan 11); smoke UI còn nợ (§6 mục 7, 13) |
| M4 — Facebook Pages + token crypto (+ nối FE PagePage) | ✅ | 2026-07-24 — code+test+smoke API xong; smoke UI còn nợ (§6 mục 8) |
| M5 — Auto-post slots CRUD + đăng tay (+ nối FE AutoPostPage) | ✅ | 2026-07-25 — plan 06 + plan 09; smoke UI còn nợ (§6 mục 9, 11) |
| M6 — Cron picker + BullMQ + publisher (+ nối FE Timeline) | ✅ | 2026-07-25 (plan 12 + plan 07) — smoke API + smoke cron/queue/retry với DB+Redis đủ; **chưa đăng thật lên FB** (thiếu Page token, §6 mục 10) |
| M7 — Dọn FE còn sót (Users, Settings) | ✅ | 2026-07-25 — Users + Settings (2 authMode Drive) đã nối API thật |
| **MVP đóng** | ✅ | **2026-07-25** — xem `PLAN-MVP.md` §5. Nợ nghiệm thu giữ ở §6 |
| M8 — Monitor (Queue · Failed Jobs · Audit Logs) | 🟡 | 2026-07-25 — code + test + smoke API xong ([plans/13-monitor.md](./plans/13-monitor.md) §7); **chưa smoke UI thật** ⇒ chưa chuyển plan sang DONE (§6 mục 17) |
| M9 — Tổng quan (Dashboard) số liệu thật | 🟡 | 2026-07-26 — code + test + smoke API xong ([plans/14-dashboard.md](./plans/14-dashboard.md) §7); **chưa smoke UI thật** ⇒ chưa chuyển plan sang DONE (§6 mục 18) |
| M10 — Kết nối Page bằng đăng nhập Facebook | 🟡 | 2026-07-27 — code + 41 test mới xanh, lint/build 2 phía xanh ([plans/15-facebook-login-connect.md](./plans/15-facebook-login-connect.md)); **chưa smoke với Meta app thật** (cần App ID/Secret + tài khoản có role Tester) ⇒ chưa chuyển plan sang DONE (§6 mục 19) |

| M11 — Tracking lượt xem bài đã đăng (Facebook Insights) | 🟡 | 2026-08-08 — code + 45 test mới xanh, lint/build 2 phía xanh ([plans/25-page-post-insights.md](./plans/25-page-post-insights.md)); **chưa gọi Graph Insights thật** ⇒ chưa chuyển plan sang DONE (§6 mục 33, 34) |

Ký hiệu: ⬜ chưa làm · 🟡 đang làm · ✅ xong (test pass + coverage đạt)

> **Cách đọc bảng này sau 2026-07-25:** ✅ ở M3–M7 nghĩa là *code + test xanh + smoke API*,
> **không** đảm bảo đã bấm tay đủ trên UI thật. Danh sách chính xác việc còn phải kiểm tay
> nằm ở §6 — đừng coi ✅ là đã nghiệm thu xong.

---

## 5. Nhật ký module đã hoàn thành

> Mỗi module xong ghi 1 mục ở đây theo mẫu trong `.claude/rules/03-context-protocol.md`.

### Nhập từ link Drive — checkbox "Copy data" (Plan 24 bổ sung) — 🟡 2026-08-08 (chưa bấm tay)

- **Phạm vi:** modal Thêm Ảnh/Video > tab "Nhập từ link Google Drive" thêm checkbox
  **"Copy data về Drive của tool"**, **mặc định TẮT**. Tắt ⇒ chỉ lưu link: bài trỏ thẳng
  vào fileId gốc, Drive đang cấu hình **không tốn thêm dung lượng**. Bật ⇒ `files.copy`
  như cũ. Body API thêm `copyData?: boolean`.
- **File chính:** `backend/src/modules/media-upload-jobs/drive-imports.service.ts`,
  `dto/create-drive-import.dto.ts`, `media-upload.constants.ts`,
  `backend/src/infra/drive/{drive-storage.interface,google-drive.storage}.ts`,
  `backend/src/modules/content-assets/content-assets.service.ts`,
  `frontend/src/components/common/DriveImportPanel.tsx`.
- **Quyết định:** dấu hiệu "file thuộc người khác" = `drive_file_id === source_drive_file_id`
  ⇒ **không thêm cột DB**, và chỗ xoá bài dựa vào đó để **không xoá file gốc** của người ta.
  Vẫn giữ check `canCopy` ở chế độ không copy vì publisher phải tải bytes lúc đăng.
- **Test:** BE +6 test (212 xanh ở 3 suite liên quan), FE 63 xanh, lint + build xanh 2 phía.
- **Còn nợ:** chưa bấm tay — xem mục cuối `plans/24-drive-link-import.md`.

### M11 Tracking lượt xem bài đã đăng (Plan 25) — 🟡 2026-08-08 (chưa chạy với Graph thật)

- **Phạm vi:** màn **thống kê riêng cho từng Page** — `/pages` mỗi dòng có nút "Chi tiết"
  (→ `/pages/:pageId/insights`), tên page bấm được mở thẳng Page trên Facebook, thêm cột
  "Bài đã đăng". Màn chi tiết: 4 thẻ tổng + bảng bài đăng **mặc định mới nhất trước**, kèm
  lượt hiển thị / người tiếp cận / lượt xem video / tương tác, tiêu đề bài link ra đúng bài
  gốc, nút "Đồng bộ ngay". 3 endpoint mới `GET|POST /pages/:pageId/insights/{posts,summary,sync}`.
- **File chính:** `backend/src/infra/facebook/facebook-insights.{client,interface}.ts`,
  `backend/src/modules/post-insights/*`, `frontend/src/pages/PageInsightsPage.tsx`,
  `frontend/src/{api/postInsights.api,hooks/usePostInsights}.ts`
- **Quyết định:**
  1. **Chỉ theo dõi bài DO TOOL ĐĂNG** (user chốt) — nguồn là `content_page_assignments`
     có `published_at` + `facebook_post_id`, **không** crawl `/{page-id}/posts`. Chọn bảng
     assignment chứ không `publish_jobs` vì nó có UNIQUE `(content, page)`, còn 1 content
     retry nhiều lần đẻ nhiều job ⇒ cộng view sẽ nhân đôi.
  2. **Thêm đúng 1 scope `read_insights`** vào `OAUTH_SCOPES`. `pages_read_engagement`
     **không** mở được edge `/insights` (Graph trả `(#200)`).
  3. **`null` ≠ `0`** xuyên suốt 3 tầng (adapter → repository → UI): `null` = chưa đo,
     `0` = đã đo và thật sự không ai xem. Metric bị Meta deprecate biến mất khỏi response
     chứ không ném lỗi — coi là 0 thì một hôm Meta đổi tên metric là **xoá sạch số liệu cũ**.
  4. **Batch API parse từng phần tử riêng** — 1 bài bị xoá trả 400 trong khi 49 bài kia
     trả 200; gộp cả lô thành lỗi là mất sạch dữ liệu vì đúng một bài.
  5. **Tần suất theo tuổi bài** (<48h: 6h/lần · 2–7 ngày: 24h · 8–30 ngày: 48h · >30 ngày:
     ngừng hẳn) — logic nằm ở **service** (test bằng clock giả), không nhét vào SQL.
  6. Dùng lại permission `pages:manage` và đặt route trong `RoleRoute path="/pages"` sẵn có
     — không đẻ luật quyền mới cho một màn chỉ-đọc.
- **Sửa lớn cùng ngày sau khi chạy thật (plan 25 §8) — user báo "mọi chỉ số = 0":**
  1. **`post_impressions` KHÔNG CÒN TỒN TẠI.** Đo thật với Page token hợp lệ (có
     `read_insights`, `expires_at=0`): cả họ `post_impressions*`, `post_reach`,
     `post_views`, `page_impressions*` đều trả `(#100) The value must be a valid
     insights metric` trên **v19→v23** ⇒ Meta gỡ hẳn, không phải lỗi quyền hay sai
     version. Đổi sang 3 chỉ số **đã đo là còn sống**: `post_video_views` ·
     `post_fan_reach` · `post_clicks`. **Bài ảnh không còn cách lấy lượt xem tổng
     qua API** — con số Business Suite hiện đi qua API nội bộ của Meta.
  2. **Lỗi làm hỏng dữ liệu:** code 100 bị map thành "bài đã bị xoá" ⇒ **3 bài đang
     sống** bị ghi `missing_on_fb_at` và **vĩnh viễn** không đồng bộ lại. Graph dùng
     cùng code 100 cho "tên metric sai". Nay chỉ set khi `error_subcode = 33`.
  3. **Nguồn gốc của "= 0":** `saveInsight()` viết `?? 0` ở nhánh `create`, mà lần
     đồng bộ đầu luôn đi vào `create` ⇒ ghi 0 thật vào DB. Nay **mọi cột số
     NULLABLE, bỏ `DEFAULT 0`** và bỏ hẳn field khỏi payload khi `null` — bất biến
     "`NULL` = chưa đo, `0` = đo được 0" do **DB** bảo đảm.
  4. **Prod vẫn lỗi metric dù dev xanh** (báo sau) ⇒ bỏ hẳn danh sách metric cứng:
     Meta cấp metric khác nhau giữa page "New Page Experience" và page cũ. Adapter
     nay **tự dò** metric nào bị từ chối (1 request/page, chỉ khi có lỗi), nhớ theo
     **từng page**, loại ra rồi thử lại; hết metric thì bỏ khối `insights` nhưng vẫn
     lấy like/comment/share. Xem plan 25 §8.4.
  Đã dọn 4 dòng hỏng. Chạy lại thật: **4/5 bài có số**, bài "KK Coach" trả `👍1`
  (bằng chứng đường dữ liệu chạy thật, không phải 0 giả).
- **Test:** BE **887** test xanh (+52), FE **63** (+4). Lint/build 2 phía xanh.
  Migration `20260808064846_post_insights_real_metrics`, `erd.md` đã cập nhật.
- **Còn nợ:** chưa smoke UI thật (§6 mục 34); mọi kết nối tạo **trước 08/08 phải bấm
  "Kết nối lại"** mới có `read_insights`; ảnh thumbnail Drive hết hạn ⇒ 404 (§6 mục 35).

### Upload media qua hàng đợi (Plan 23) — 🟡 2026-08-07 (chưa smoke UI)

- **Phạm vi:** 3 endpoint mới `POST /media/upload-jobs` (multipart N file, trả **202**),
  `GET /media/upload-jobs`, `POST /media/upload-jobs/:id/retry` + queue BullMQ thứ hai
  `media-upload` (worker đẩy Drive → tạo `content_assets`). FE `/content`: modal upload
  fire-and-forget + dòng "mờ" + nút "Thử lại".
- **File chính:** `backend/src/modules/media-upload-jobs/*`,
  `backend/src/modules/media/media-type.util.ts`,
  `frontend/src/{api/mediaUploadJobs.api,hooks/useMediaUploadJobs,pages/ContentManagementPage}.ts(x)`
- **Quyết định:** (1) chấp nhận **ghi file tạm xuống đĩa** — đảo ngược "chỉ stream"
  (`PLAN-MVP.md` §4), vì worker chạy sau khi response đã trả; kiểm soát bằng trần 20 job
  + TTL + dọn lúc boot. (2) Giới hạn quá tải đặt ở **Guard** (trước multer) chứ không
  trong controller, để 503 không tốn băng thông/đĩa. (3) Lỗi khi còn lượt retry ⇒ job về
  `QUEUED`, chỉ lượt cuối mới `FAILED`. (4) Worker tạo bài qua đúng
  `ContentAssetsService.create()` với actor = người upload, không nhân bản logic.
- **Test:** BE +30 (767 tổng) · FE +4 (45 tổng) · lint/build 2 phía xanh
- **Còn nợ:** chưa test tay UI (§6 mục 29); `docs/08-bullmq.md` chưa có mục cho queue mới
  (§6 mục 30); Drive vẫn nhận `Buffer` (§6 mục 21)

### M0 Scaffold (Plan 01) — ✅ 2026-07-22

- **Phạm vi:** Backend NestJS chạy được. Docker Postgres+Redis, Prisma schema 8 bảng
  đã migrate, seed admin, health check, env validation, exception filter, correlationId.
  Endpoint: `GET /api/health`, `GET /api/health/ready`, Swagger `/api/docs`.
- **File chính:** `backend/src/config/`, `backend/src/infra/`, `backend/src/common/`,
  `backend/src/modules/health/`, `backend/prisma/schema.prisma`, `docker/docker-compose.yml`
- **Quyết định:** dùng Prisma 7 (khác docs viết theo Prisma 5) → xem ADR-009, ADR-010.
- **Test:** 65 test / 8 suite · coverage 100% cả 4 chỉ số · lint + build xanh
- **Còn nợ:** Pino logger (§6)

### M1 Auth + RBAC + Users (Plan 02) — ✅ 2026-07-22

- **Phạm vi:** `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`;
  CRUD `/users` (ADMIN, DELETE = soft delete). RBAC 3 role theo ma trận docs/05 §2.
  Audit log `USER_CREATE`/`USER_UPDATE`/`USER_DELETE`.
- **File chính:** `backend/src/common/permissions.ts`, `common/guards/`,
  `src/modules/auth/auth.service.ts`, `src/modules/users/users.service.ts`,
  `src/modules/audit/audit.service.ts`, `src/infra/crypto/password.service.ts`
- **Quyết định:** guard global + bỏ passport → ADR-012, ADR-013.
  Thêm `PasswordService` bọc bcrypt để test không phụ thuộc bcrypt thật.
- **Test:** 184 test / 18 suite · coverage service/domain 100% cả 4 chỉ số ·
  đã smoke test thật với Postgres (login, 401/403, soft delete, audit).
- **Còn nợ:** chưa có e2e tự động (§6).

### M2 Google Drive + Media upload (Plan 03) — ✅ 2026-07-23

- **Phạm vi:** `POST /media/upload` (multipart, validate mime ảnh/video + size),
  `GET/PUT /settings/google-drive`, `POST /settings/google-drive/test` (ADMIN).
  Menu FE mới **"Cài đặt chung"** (`/settings`) để cấu hình Drive không cần sửa `.env`.
- **File chính:** `backend/src/modules/settings/`, `backend/src/modules/media/`,
  `backend/src/infra/drive/` (interface, `GoogleDriveStorage`, `FakeDriveStorage`,
  `DriveStorageFactory`), `backend/src/infra/crypto/crypto.service.ts`,
  `frontend/src/pages/SettingsPage.tsx`
- **Quyết định:** cấu hình Drive chuyển từ hardcode `.env` sang bảng `app_settings`
  (JSONB, secret mã hoá AES-256-GCM), `.env` chỉ còn là fallback bootstrap → ADR-014.
  Thêm permission `settings:manage` (chỉ ADMIN). Phá vòng phụ thuộc
  `SettingsModule ↔ DriveModule` bằng cách tách controller sang
  `SettingsHttpModule` riêng (xem comment trong `settings.module.ts`).
- **Test:** 260 test / 24 suite · coverage service/domain 100% cả 4 chỉ số ·
  đã smoke test thật qua curl (login → GET/PUT settings → upload fake driver →
  test connection → xác nhận đổi `maxUploadMb` có hiệu lực ngay không cần restart →
  CONTENT role gọi `/settings` → 403).
- **Còn nợ:** FE `SettingsPage` vẫn chạy trên state mock cục bộ (chưa có
  `src/api/settings.api.ts`) — nối API thật dời sang M7 (plan 08) theo đúng ADR-005.
  Driver `real` (Google Drive thật) chưa test bằng credential thật, chỉ test bằng
  mock `googleapis`. Tab Facebook/Hệ thống trong "Cài đặt chung" chưa làm.

### M2.5 FE core auth (Plan 03b) — 🟡 2026-07-23

- **Phạm vi:** hạ tầng FE gọi API thật + login thật. `api/client.ts` (fetch wrapper:
  gắn Bearer, refresh token đúng 1 lần khi 401 rồi retry, map lỗi backend → `ApiError`),
  `api/tokenStore.ts` (localStorage), `api/auth.api.ts`. `AuthContext` nối thật khi
  `VITE_USE_MOCK=false` (khôi phục phiên bằng `/auth/me`), `LoginPage` login thật,
  `ProtectedRoute`/`RoleRoute` chặn theo role, Vite proxy `/api`→backend.
- **File chính:** `frontend/src/api/{client,auth.api,tokenStore}.ts`,
  `frontend/src/config/env.ts`, `frontend/src/contexts/AuthContext.tsx`,
  `frontend/src/routes/ProtectedRoute.tsx`, `frontend/src/pages/LoginPage.tsx`
- **Quyết định:** fetch thay axios; tokenStore tách riêng; `useAuthUser()` assert
  non-null cho trang trong vùng auth; vitest config tách file (xung đột type vite 8).
- **Test:** 15 test Vitest xanh (client + permissions). Lint chỉ warning fast-refresh,
  build xanh. **Chưa smoke test với backend thật** (backend chưa chạy lúc code).
- **Còn nợ:** (1) smoke test login/refresh/role guard với backend thật — xem §6.
  (2) Drive upload + SettingsPage nối thật: **hoãn theo yêu cầu user**, để làm sau.

### Drive 2 authMode (Plan 03c) — 🟡 2026-07-24

- **Phạm vi:** cho ADMIN switch chế độ xác thực Drive ở "Cài đặt chung":
  `service_account` (SA JSON + Shared Drive, thêm `supportsAllDrives`) và `oauth2`
  (tài khoản Google, Gmail free). OAuth flow trong app: `GET /settings/google-drive/oauth/url`
  (ADMIN) + `GET .../oauth/callback` (**@Public**, `state` single-use TTL 10') → lưu
  refresh token mã hoá + email. FE SettingsPage: UI 2 mode + nút "Kết nối Google" +
  xử lý `?drive_oauth=success|error`. `POST /media/upload` không đổi — chạy theo config đang lưu.
- **File chính:** `backend/src/modules/settings/{settings.service,drive-oauth.service,
  drive-oauth.controller,settings.controller,settings.types}.ts`,
  `backend/src/infra/drive/{google-drive.storage,drive-storage.factory}.ts`,
  `frontend/src/pages/SettingsPage.tsx`, `frontend/src/api/settings.api.ts`
- **Quyết định:** ADR-016. Config lưu JSONB (không migration). Đổi client id/secret ⇒
  tự xoá refresh token cũ. `mapDriveError` nhận diện lỗi quota qua message (service
  account không ghi được My Drive).
- **Test:** BE 65 test (settings + drive storage/factory oauth) xanh; FE 16 test xanh. lint/build cả hai xanh.
- **Còn nợ:** smoke test OAuth thật (cần OAuth Client của user + đăng ký redirect URI). Chưa `git mv` plan sang DONE.
- **Cập nhật 2026-07-24 (sau):** theo yêu cầu user, **bỏ hẳn driver `fake` khỏi hệ
  thống** (không chỉ ẩn UI) — xem ADR-017. Xoá `DriverMode`, `FakeDriveStorage`,
  `DRIVE_DRIVER`/`FACEBOOK_DRIVER` khỏi env/config/settings/DTO/FE types.
  `assertModeConfigured` giờ luôn validate (không còn early-return khi driver≠real).
  263 test BE xanh, 16 test FE xanh, lint/build cả hai xanh.

### Content Assets giai đoạn 1 (Plan 04) — 🟡 2026-07-24

- **Phạm vi:** CRUD cơ bản cho `content_assets` — tạo content từ file đã upload
  Drive (`POST /content-assets`), list có filter (mediaType/category/search/
  createdBy) + phân trang (`GET /content-assets`), chi tiết, sửa field mô tả
  (`PATCH`), xoá kèm xoá file trên Drive (`DELETE`). **Chưa có** duyệt (status luôn
  `PENDING_REVIEW`), `isAds`, phân bổ page — dời sang giai đoạn 2 (chốt với user).
  RBAC: CONTENT chỉ thao tác bài của chính mình (403 nếu không), EDITOR/ADMIN mọi bài.
- **File chính:** `backend/src/modules/content-assets/` (repository/service/
  controller/dto/mapper), `frontend/src/api/contentAssets.api.ts`,
  `frontend/src/hooks/useContentAssets.ts`, `frontend/src/pages/ContentManagementPage.tsx`
  (tách `RealContentManagementPage` API thật vs `MockContentManagementPage` giữ
  nguyên mock, chọn theo `env.useMock`).
- **Quyết định:** chia 2 giai đoạn theo yêu cầu user 2026-07-24 để đi nhanh — xem
  plan 04 §1. Xoá file Drive khi xoá content (không mồ côi file trên Drive).
- **Test:** BE 11 test mới (RBAC ownership: CONTENT sửa/xoá/xem bài người khác ⇒
  403, scope list theo actor, audit log) — tổng 274 test BE xanh. FE lint/build
  xanh, 16 test Vitest hiện có vẫn xanh (chưa thêm test cho page mới — CRUD thuần
  UI, theo rule 02 không bắt buộc).
- **Còn nợ:** **chưa smoke test tay trên UI thật** — xem §6 mục 7. Giai đoạn 2
  (duyệt/isAds/phân bổ page) chưa làm.

### Facebook Pages + token crypto (Plan 05) — 🟡 2026-07-24

- **Phạm vi:** CRUD `facebook_pages` — `GET /pages` (mọi role, token mask),
  `POST/PUT/DELETE /pages` (ADMIN, `pages:manage`). DELETE = soft delete
  (`isActive=false`, vì `publish_jobs` tham chiếu tới page). `pageId` không sửa
  được sau khi tạo. `getDecryptedToken(id)` — lối vào duy nhất lấy token plaintext,
  chặn page inactive — export sẵn cho publisher (plan 07) dùng sau này.
- **File chính:** `backend/src/modules/facebook-pages/` (repository/service/
  controller/dto/mapper), `backend/src/common/utils/token-mask.util.ts`,
  `frontend/src/api/pages.api.ts`, `frontend/src/hooks/usePages.ts`,
  `frontend/src/pages/PageManagementPage.tsx` (tách `RealPageManagementPage`/
  `MockPageManagementPage` theo `env.useMock`, cùng pattern plan 04).
- **Quyết định:** không tạo `crypto.util.ts` riêng theo plan gốc — tái dùng
  `infra/crypto/crypto.service.ts` (đã có AES-256-GCM từ M2) để tránh trùng lặp,
  chỉ thêm `maskToken` làm util riêng. Mask token tính bằng cách decrypt tại thời
  điểm response (không lưu cột mask riêng trong DB); nếu decrypt lỗi (đổi
  `TOKEN_ENCRYPTION_KEY`) thì trả mask "chưa xác định" thay vì crash cả danh sách
  — đúng rủi ro đã ghi ở plan 05 §6.
- **Test:** BE 286 test (12 test mới `FacebookPagesService`: mask đúng, không lộ
  token trong response/audit log, `getDecryptedToken` chặn page inactive, list vẫn
  chạy khi token cũ không giải mã được, conflict 409 khi trùng `pageId`) — lint +
  build xanh. FE lint + build xanh. Smoke test qua curl với backend thật: tạo/sửa/
  xoá page, mask đúng, EDITOR đọc được nhưng bị 403 khi tạo, log không lộ token.
- **Còn nợ:** **chưa smoke test UI thật qua trình duyệt** — chỉ mới test API qua
  curl. Cần mở `VITE_USE_MOCK=false`, đăng nhập ADMIN, thao tác CRUD trên `/pages`
  thật trước khi coi milestone Done theo rule 00 (`git mv` sang `plans/DONE/` khi
  đó). Xem §6 mục 8.
- **Fix 2026-07-25 — nút Xoá page không có tác dụng:** `remove()` soft delete bằng
  `isActive=false` nhưng `findMany()` không lọc ⇒ page vẫn nằm trong danh sách, chỉ
  đổi cột Active sang "No". Không thể lọc theo `isActive` vì cột đó mang nghĩa
  **tạm dừng** (bật/tắt được trong form Sửa, page tạm dừng vẫn phải hiện). Đã tách
  2 khái niệm: thêm cột `facebook_pages.deleted_at` (migration
  `20260725033247_facebook_pages_deleted_at`, đã cập nhật `erd.md`).
  `remove()` set `deletedAt=now()` + `isActive=false` + `autopostEnabled=false`,
  audit action mới `PAGE_DELETE`. `findMany`/`findById` lọc `deletedAt: null` ⇒ page
  đã xoá coi như không tồn tại (404 khi PUT/DELETE, publisher không lấy được token).
  `create()` với `pageId` đã xoá mềm thì **hồi sinh** dòng cũ thay vì 409 (UNIQUE
  `page_id` áp cả trên dòng đã xoá). 288 test BE xanh (thêm 3), lint/build xanh.
  FE không phải sửa.
- **Bổ sung 2026-07-25 — Test kết nối Page + search danh sách** (yêu cầu user, plan 05 §8):
  thêm `backend/src/infra/facebook/` (adapter Meta Graph đầu tiên: interface,
  `FacebookGraphClient` gọi `GET /{pageId}?fields=id,name,category,tasks` bằng fetch,
  timeout 10s, token đi qua header `Authorization` chứ không qua query; `facebook.errors.ts`
  map code 190/100/200/4 sang message tiếng Việt nói rõ cách sửa). 2 endpoint ADMIN:
  `POST /pages/test-connection` (pageId+token chưa lưu) và `POST /pages/:id/test-connection`
  (dùng token đã lưu — cố ý **không** qua `getDecryptedToken` để page tạm dừng vẫn test được).
  Lỗi Graph ⇒ `200 {ok:false,message}` để form đọc được lý do; `canPost` bật khi `tasks`
  chứa `CREATE_CONTENT` ⇒ phát hiện sớm token đọc được page nhưng không đăng bài được.
  FE: nút "Test kết nối" trong footer popup + `Alert` kết quả, ô search lọc theo tên/Page ID
  (client-side, cả bản Real lẫn Mock). BE 336 test xanh (+18), lint/build 2 phía xanh.
- **Sửa cùng ngày, sau khi gọi Graph thật lần đầu:** bỏ field `tasks` (không tồn tại
  trên page node khi dùng Page token ⇒ Graph trả `(#100)`), thêm `debugToken()` gọi
  **trước** page node để biết token loại gì / của page nào / hạn tới bao giờ ⇒ báo đúng
  "sai Page ID" thay vì "thiếu quyền". Response thêm `tokenType` + `expiresAt`, cảnh báo
  khi token sắp hết hạn. BE 343 test xanh. Chi tiết + bài học: plan 05 §8, §7 cạm bẫy.

### Cài đặt đăng bài tự động — slots CRUD (Plan 06) — 🟡 2026-07-25

- **Phạm vi:** CRUD cấu hình đăng tự động, **không** có logic cron/queue nào.
  `GET /auto-post-configs` (mọi page kèm slot, slot sắp theo giờ tăng dần),
  `PATCH /auto-post-configs/:pageId` (bật/tắt auto — bật khi page chưa có slot thì
  vẫn cho, chỉ trả `warning`), `POST /auto-post-configs/:pageId/slots`,
  `PATCH|DELETE /auto-post-slots/:slotId`. Tất cả gác `autopost:manage`
  (ADMIN + EDITOR; CONTENT ⇒ 403). Trùng `time` trong cùng page ⇒ 409;
  `time` sai định dạng / `categories` rỗng ⇒ 400; `postCount > MAX_POST_PER_SLOT` ⇒ 400.
- **File chính:** `backend/src/modules/auto-post-configs/` (repository/service/
  `auto-post-configs.controller.ts` + `auto-post-slots.controller.ts`/dto/mapper),
  `frontend/src/api/autoPost.api.ts`, `frontend/src/hooks/useAutoPostConfigs.ts`,
  `frontend/src/pages/AutoPostSettingsPage.tsx` (Real/Mock split theo `env.useMock`).
- **Quyết định:** **tách engine đăng tự động ra module riêng** (yêu cầu user
  2026-07-25) — module này chỉ là cấu hình, plan 07 sẽ tạo module engine dùng lại
  `AutoPostConfigsRepository.findDueSlots(hhmm)` (đã export). Audit tách 4 action
  (`AUTOPOST_CONFIG_UPDATE` + `AUTOPOST_SLOT_CREATE/UPDATE/DELETE`) thay vì 1 như plan.
  Response thêm `facebookPageId` + `isActive` ngoài spec để UI cảnh báo page tạm dừng.
  **Không đụng schema** (`auto_post_slots` có từ M0) ⇒ `erd.md` không đổi.
- **Test:** BE 318 test / 28 suite xanh (+32 mới: service 20, repository `findDueSlots`
  2 — lọc đúng slot tắt / page tạm dừng / page tắt auto / page đã xoá, DTO validate 10).
  Lint + build BE/FE xanh, FE 16 test cũ vẫn xanh. Smoke API qua curl với backend thật
  (đủ 4 điều kiện nghiệm thu §5 của plan 06 trừ mục UI), dữ liệu smoke đã dọn khỏi DB dev.
- **Còn nợ:** chưa smoke test tay trên UI thật — xem §6 mục 9.

### Đăng bài thủ công + filter page (Plan 09) — 🟡 2026-07-25

- **Phạm vi:** trang "Cài đặt đăng bài tự động" có thêm filter theo FB Page và nút
  "Đăng bài thủ công" (cả nút "Đăng ngay" trên từng card page). `POST /manual-post`
  (`autopost:manage`) đăng **đồng bộ** 1 bài lên 1 page qua Graph API: chặn page tạm
  dừng (400), bài đã đăng lên chính page đó (409), lỗi Graph/Drive ⇒ job FAILED + 502.
- **File chính:** `backend/src/infra/facebook/facebook-publisher.{interface,client}.ts`,
  `backend/src/modules/manual-post/` (repository/service/controller/dto),
  `frontend/src/api/manualPost.api.ts`, `frontend/src/hooks/useManualPost.ts`,
  `frontend/src/components/autopost/ManualPostModal.tsx`,
  `frontend/src/pages/AutoPostSettingsPage.tsx`
- **Quyết định:** tách hẳn khỏi engine tự động (plan 07) — không cron, không BullMQ,
  user đứng chờ kết quả. Caption/hashtag sửa trong popup chỉ áp cho **lần đăng này**
  (lưu ở `publish_jobs.caption/hashtags`), không ghi đè caption gốc của content.
  `content.status = PUBLISHED` do server set sau khi Graph trả post id — vẫn đúng rule
  "client không được tự set PUBLISHING/PUBLISHED". Video đi qua host `graph-video.facebook.com`.
  File nạp cả vào RAM (đã bị chặn bởi `maxUploadMb` lúc upload Drive).
  Không đụng schema ⇒ `erd.md` không đổi.
- **Test:** BE 357 test / 30 suite xanh (11 test mới `ManualPostService`: chọn đúng
  publishImage/publishVideo theo mediaType, ghép caption+hashtag, 409 trùng, page tạm
  dừng ⇒ 400, lỗi Graph/Drive ⇒ job FAILED và không đụng content/assignment, audit
  MANUAL_PUBLISH). Lint + build BE/FE xanh, FE 16 test cũ vẫn xanh.
- **Còn nợ:** **chưa đăng thật lên Facebook** (thiếu Page token — §6 mục 10); chưa smoke
  UI thật. Video lớn chưa có resumable upload.

### User Management CRUD + tracking người upload/sửa (Plan 10) — 🟡 2026-07-25

- **Phạm vi:** (1) FE `/users` chạy API thật — list có filter role + search + phân trang,
  tạo/sửa (đổi tên, email, quyền, mật khẩu, bật/tắt hoạt động), vô hiệu hóa (soft delete).
  Backend không phải sửa gì (đã đủ từ M1). (2) `content_assets` tracking **ai sửa gần nhất**:
  cột mới `updated_by`, API trả `createdBy`/`updatedBy` dạng `{id,name,email}`; trang
  "Quản lý Ảnh/Video Edit" thêm 2 cột + filter theo người upload (ADMIN).
- **File chính:** `frontend/src/api/users.api.ts`, `frontend/src/hooks/useUsers.ts`,
  `frontend/src/pages/UserManagementPage.tsx`, `frontend/src/pages/ContentManagementPage.tsx`,
  `backend/prisma/schema.prisma`, `backend/src/modules/content-assets/{content-assets.repository,
  content-asset.mapper,content-assets.service}.ts`
- **Quyết định:** join user chỉ `select {id,name,email}` ở **repository** (không để service
  tự lọc) ⇒ `passwordHash` không có đường lọt ra API. `create()` cũng set
  `updatedById = actor.id` nên bài mới không trống cột "Người sửa". Bản Real của `/content`
  bỏ cột "Ngày cập nhật" riêng vì mốc thời gian đã nằm trong ô "Người sửa gần nhất".
  Nút ở `/users` là "Vô hiệu hóa" (DELETE = soft delete), không gọi là "Xoá".
- **Schema:** migration `20260725062013_content_assets_updated_by` (uuid nullable, FK
  `users.id`, không index). `erd.md` đã cập nhật (cột + quan hệ + ràng buộc + lịch sử).
- **Test:** BE 361 test / 30 suite xanh (+4 cho tracking). FE 16 test cũ xanh, lint/build
  2 phía xanh. Smoke API qua curl với backend thật (dữ liệu smoke đã dọn khỏi DB dev).
- **Còn nợ:** chưa smoke UI thật — xem §6 mục 12.

---

### Content giai đoạn 2 — duyệt / ADS / phân bổ page + hashtag & danh mục quick-update (Plan 11) — 🟡 2026-07-25

- **Phạm vi:** `PATCH /content-assets/:id` nhận thêm `status`/`isAds`/`rejectComment`/
  `assignedPageIds`; `POST` nhận `assignedPageIds`; `GET` thêm filter `status`/`isAds`;
  `GET /content-assets/hashtags` + `GET /content-assets/categories` trả gợi ý. FE mở lại
  3 khối UI bị ẩn từ giai đoạn 1 + ô hashtag dạng tag và ô "Dạng" select-1 gõ được (gõ là
  gợi ý, chưa có thì tạo mới ngay) — hết hardcode danh mục.
- **File chính:** `backend/src/modules/content-assets/content-status.transition.ts` (mới),
  `content-assets.{service,repository}.ts`, `frontend/src/components/common/HashtagInput.tsx`
  (mới), `frontend/src/utils/hashtags.ts` (mới), `frontend/src/pages/ContentManagementPage.tsx`
- **Quyết định:** không thêm bảng `hashtags`/`categories` — gợi ý quét thẳng cột
  `content_assets.hashtags` và groupBy `content_assets.category`
  (MVP vài trăm bài; có bảng riêng lại phải đồng bộ 2 nguồn) ⇒ **schema không đổi, `erd.md`
  giữ nguyên**. Bảng danh sách bỏ cột "Người sửa gần nhất" để nhường chỗ cột "Phân bổ page"
  (yêu cầu user); thông tin người sửa vẫn hiện ở chân Drawer sửa. Validate page tồn tại đặt
  ở `ContentAssetsRepository.findExistingPageIds` thay vì kéo `FacebookPagesRepository` vào.
- **Test:** BE 383 test / 30 suite xanh (+22). FE 32 test (+15). Smoke curl đủ §5 plan 11.
- **Còn nợ:** chưa smoke UI thật (§6 mục 13).

### Lịch đăng bài — tracking lịch + tiến độ auto-post (Plan 12) — 🟡 2026-07-25

- **Phạm vi:** `GET /publish-schedule?date=&pageId=&status=` (`timeline:view`, ADMIN+EDITOR)
  — **chỉ đọc**. Ghép `auto_post_slots` (dữ liệu của trang "Cài đặt đăng bài tự động")
  với `publish_jobs` trong ngày: mỗi mốc giờ × page = 1 dòng lịch kèm `plannedCount`
  (`postCount`) / `successCount` / `failedCount` / `runningCount` / `readyCount` (kho còn
  bài dùng được) / `progress`. Bài **đăng tay** thành dòng `kind: 'manual'` với đúng tên
  USER đăng; job Bot không khớp mốc giờ nào ⇒ dòng "Ngoài lịch". FE `/timeline` bỏ mock.
- **File chính:** `backend/src/modules/publish-schedule/` (repository/service/controller/
  dto/mapper + `schedule-progress.ts`), `backend/src/infra/clock/`,
  `backend/src/common/utils/datetime.util.ts`, `frontend/src/api/publishSchedule.api.ts`,
  `frontend/src/hooks/usePublishSchedule.ts`, `frontend/src/pages/TimelinePage.tsx`,
  `frontend/src/pages/ContentManagementPage.tsx` (deep-link `?edit=<id>` mở Drawer),
  `frontend/src/hooks/useContentAssets.ts` (`useContentAsset`)
- **Quyết định:** làm **trước** engine plan 07 (yêu cầu user) — engine xong thì trang này
  không phải sửa vì job tự động cùng đổ vào `publish_jobs`. Ghép job↔slot theo (page, `HH:mm`
  giờ VN) chứ **không thêm cột `slot_id`** vào `publish_jobs` ⇒ **schema không đổi, `erd.md`
  giữ nguyên** (plan 06 đã chặn 2 slot cùng page trùng giờ nên khoá này đủ phân biệt).
  `readyCount` cố ý **không** nhân bản toàn bộ picker của plan 07 (thiếu mệnh đề "chưa có
  job QUEUED/PUBLISHING") — chỉ để cảnh báo hết bài, không quyết định đăng gì.
  Dùng lại `AutoPostConfigsRepository.findPagesWithSlots` thay vì tự query slot.
  `ClockService` tách ra `src/infra/clock/` để plan 07 dùng lại.
- **Test:** BE 411 test / 33 suite xanh (+28: `resolveSlotProgress` 10, service 12 —
  ghép job UTC lệch ngày sang giờ VN, dòng manual, filter page/status, summary, sắp xếp;
  `datetime.util` 6). FE 32 test cũ xanh, lint/build 2 phía xanh. Smoke API với backend
  thật: đủ mục §5 plan 12 (CONTENT ⇒ 403, `date` sai định dạng ⇒ 400).
- **Còn nợ:** chưa smoke UI thật (§6 mục 14). Job tự động chỉ xuất hiện sau plan 07.
  `readyCount` chạy 1 query/slot — chấp nhận ở MVP.

### Auto-post engine — cron picker + BullMQ + publisher + log DB (Plan 07) — 🟡 2026-07-25

- **Phạm vi:** Bot tự đăng theo lịch. `AutoPostSchedulerService` `@Cron('* * * * *')` (tz VN,
  tắt bằng `AUTOPOST_ENABLED`) → `findDueSlots('HH:mm')` → claim `slot_runs` → picker →
  `publish_jobs` QUEUED + BullMQ (3 attempts, backoff mũ 60s) → `PublishExecutorService` đăng
  qua Graph → ghi assignment + content `PUBLISHED`. Thêm `POST /auto-post/run-now` (chạy tay
  1 nhịp), `GET /publish-jobs`, `GET /publish-jobs/:id/events`; `GET /publish-schedule` trả
  thêm `slotRun`.
- **File chính:** `backend/src/modules/auto-post/` (scheduler, `content-picker.repository.ts`,
  `slot-run.{repository,service}.ts`, `auto-post-engine.controller.ts`),
  `backend/src/modules/publish-jobs/` (`publish-jobs.{repository,service}.ts`,
  `publish-executor.service.ts`, `publish-media.service.ts`, `publish-job-events.{repository,service}.ts`,
  `publish-facebook.processor.ts`), `frontend/src/components/timeline/JobEventsModal.tsx`
- **Quyết định:** (1) Đường đăng dùng chung tách thành **`PublishMediaService`** (Drive + chọn
  ảnh/video + ghép caption), `ManualPostService` gọi lại — tránh 2 bản logic publish trôi khỏi
  nhau; 11 test cũ của plan 09 xanh không sửa assertion. (2) **Không** set content → PUBLISHING
  lúc tạo job (khác `docs/08` §1b): nằm trong queue chưa phải đang đăng; picker vẫn không chọn
  lại nhờ mệnh đề loại job QUEUED. (3) Còn lượt retry ⇒ job quay về QUEUED (đi đúng cửa
  idempotent), hết lượt ⇒ FAILED + content **recompute** từ assignments. (4) Thêm `run-now` để
  nghiệm thu không phải đợi đúng mốc giờ — vẫn qua claim nên bấm nhiều lần không đăng trùng.
- **Schema:** migration `20260725122007_autopost_engine_logs` — `slot_runs` +7 cột (nhật ký cron)
  + index `(run_date,status)`; bảng mới `publish_job_events`; enum `SlotRunStatus`,
  `PublishJobEventType`. `erd.md` đã cập nhật (sơ đồ + enum + index + ràng buộc + lịch sử).
- **Test:** BE 452 test / 38 suite xanh (+41: scheduler 13 gồm double-fire, picker 6, slot-run
  repository 4 gồm P2002, executor 11 gồm idempotent/retry, events + `sanitizeRawError` 7).
  FE 32 test cũ xanh, lint/build 2 phía xanh. Smoke thật với DB+Redis bằng **page test token sai**
  (cố ý không đăng lên page thật): tick → 1 job, tick lại cùng phút ⇒ `claimed=false`, bài đang
  QUEUED ⇒ `SKIPPED/NO_CONTENT`, token sai ⇒ 3 lần thử → `GAVE_UP` + job FAILED + content về
  APPROVED. Dữ liệu smoke đã xoá khỏi DB dev.
- **Còn nợ:** chưa đăng thật lên Facebook (§6 mục 10); chưa smoke UI `/timeline` phần nhật ký;
  chưa có reconciliation cron cho job kẹt `PUBLISHING` (ngoài scope MVP); đổi giờ slot giữa ngày
  ⇒ dòng lịch giờ cũ mất `slotRun`.
- **Bổ sung 2026-07-25 — đăng lại thủ công (plan 07 §10):** `POST /publish-jobs/:id/retry`
  (`jobs:retry`, ADMIN) đưa job `FAILED`/`CANCELLED`/`SCHEDULED` về QUEUED + xếp lại BullMQ;
  `POST /auto-post/slots/:slotId/run-now` (`autopost:manage`) chạy lại nguyên một mốc giờ ngay,
  không cần trùng phút. Chặn đăng trùng: job đang QUEUED/PUBLISHING ⇒ 409, bài đã đăng lên page
  đó ⇒ 409, page tạm dừng/xoá ⇒ 400; slot run-now vẫn qua `slot_runs` claim theo phút hiện tại.
  **Bull job cũ còn trong Redis** (`removeOnFail:false`) nên phải `queue.remove` rồi add với
  jobId mới `publish-<id>-retry-<ts>`, không thì BullMQ bỏ qua lặng lẽ. FE `/timeline` thêm nút
  "Đăng lại" (mỗi job hỏng) + "Chạy lại mốc này" (dòng slot còn thiếu bài). Audit
  `PUBLISH_JOB_RETRY`. Không đụng schema. BE 485 test xanh (+21). Chưa smoke UI thật.

### Đóng MVP + thiết kế M8 Monitor (Plan 13) — 🟡 2026-07-25

- **Phạm vi:** không code. Chốt đóng MVP theo quyết định user: `PLAN-MVP.md` §2 bảng
  milestone đổi sang trạng thái ✅ + thêm dòng M8, §3 chuyển 3 màn Monitor từ "ngoài scope"
  vào Phase 2, §5 tick xong định nghĩa Done kèm ghi chú nợ. 12 file plan còn lại `git mv`
  vào `plans/DONE/` và sửa header trạng thái.
- **File chính:** `PLAN-MVP.md`, `contexts.md`, `plans/DONE/*` (14 file), **`plans/13-monitor.md`** (mới)
- **Quyết định:** (1) Đóng MVP **không** đồng nghĩa đã nghiệm thu hết — nợ smoke UI và
  đăng thật lên Page giữ nguyên ở §6, có ghi chú cách đọc bảng §4 để session sau không
  hiểu nhầm ✅. (2) M8 **không đụng schema** ⇒ không migration, `erd.md` không đổi.
  (3) Failed Jobs **không có API riêng**, dùng lại `GET /publish-jobs` + filter (chỉ thêm
  phân trang) — tránh 2 endpoint trùng chức năng. (4) Đường đọc audit tách
  `AuditHttpModule` riêng vì `AuditModule` bị import khắp nơi (bài học `SettingsHttpModule`, §7).
- **Đã kiểm khi thiết kế:** FE **chưa** gọi `GET /publish-jobs` (list) ở đâu — `/timeline`
  đi qua `/publish-schedule` và chỉ mượn `/:id/events`, `/:id/retry` — nên đổi response
  sang dạng phân trang không gãy màn nào.
- **Test:** không có (chỉ tài liệu)
- **Còn nợ:** M8 chưa code dòng nào; danh sách nghiệm thu ở `plans/13-monitor.md` §5.

---

### M8 Monitor — Queue · Failed Jobs · Audit Logs (Plan 13) — 🟡 2026-07-25

- **Phạm vi:** `GET /monitor/queue/summary` (số BullMQ + `groupBy` DB + job kẹt +
  job đang chờ), `GET /audit-logs` + `GET /audit-logs/actions` (đọc audit, ADMIN),
  `GET /publish-jobs` đổi sang phân trang `{items,total,page,pageSize}` + lọc
  `from`/`to`/`search`. FE bỏ mock 3 màn `/queue`, `/failed`, `/audit`.
- **File chính:** `backend/src/modules/monitor/`,
  `backend/src/modules/audit/{audit.controller,audit-http.module,audit-log.mapper,
  sanitize-audit-value}.ts`, `backend/src/modules/publish-jobs/publish-jobs.repository.ts`,
  `frontend/src/api/{monitor,audit,publishJobs}.ts`,
  `frontend/src/pages/{QueueMonitorPage,FailedJobsPage,AuditLogsPage}.tsx`
- **Quyết định:** (1) Redis chết ⇒ **không 500**: `Promise.race` timeout 2s, trả
  `queue: null` + `queueError` để màn giám sát không chết theo thứ nó giám sát.
  (2) Controller đọc audit đặt ở `AuditHttpModule` riêng — `AuditModule` bị cả chục
  module import để *ghi* log, thêm controller vào đó là tạo vòng phụ thuộc.
  (3) `summary` trả kèm `activeJobs` để `/queue` chỉ poll **một** endpoint mỗi 10s.
  (4) Không đụng schema ⇒ `erd.md` giữ nguyên.
- **Test:** BE 516 test xanh (+31, gồm 18 test `sanitizeAuditValue` và 10 `MonitorService`
  dùng clock fake) · FE 32 test cũ xanh · lint/build 2 phía xanh · smoke API thật đủ
  case (plan 13 §7).
- **Còn nợ:** chưa bấm tay trên UI (§6 mục 17); `/failed` chưa có ô tìm kiếm dù backend
  đã hỗ trợ `search`.

### M9 Tổng quan (Dashboard) — số liệu thật (Plan 14) — 🟡 2026-07-26

- **Phạm vi:** `GET /dashboard/stats` (tồn kho hiện tại + sản lượng trong kỳ + số đang
  chạy), `GET /dashboard/chart/daily`, `GET /dashboard/posts-by-page`, và
  `GET /dashboard/health` (**ngoài `docs/04` §8**) gom 5 cảnh báo vận hành kèm link sang
  màn xử lý. FE bỏ mock `/dashboard` — **màn cuối cùng còn mock**.
- **File chính:** `backend/src/modules/dashboard/` (controller/service/repository/mapper/
  types/module + `dashboard-range.ts` + `dto/query-dashboard.dto.ts`),
  `frontend/src/api/dashboard.api.ts`, `frontend/src/hooks/useDashboard.ts`,
  `frontend/src/pages/DashboardPage.tsx`
- **Quyết định:** (1) **Tồn kho là snapshot, không lọc theo range** — "còn bao nhiêu bài
  chờ duyệt" luôn là câu hỏi *bây giờ*; UI ghi nhãn "hiện tại" vs "trong kỳ". (2) Job đếm
  theo `schedule_time` (job FAILED không có `published_at` ⇒ dùng lẫn 2 cột thì
  success+failed không khớp mẫu số nào), content đếm theo `created_at`. (3) **Scope RBAC ở
  service**: `dashboard:view` có ở cả 3 role, CONTENT chỉ đếm bài của mình, EDITOR không
  thấy `activeUsers`/cảnh báo token, CONTENT gọi `/health` ⇒ 403. (4) `successRate = null`
  khi chưa có job nào đóng sổ (khác hẳn `0` = hỏng sạch), UI hiện "—". (5) Chặn range >
  366 ngày. (6) `MonitorModule`/`AutoPostConfigsModule` thêm `exports` để Dashboard mượn
  service — không tính lại readiness/job kẹt lần thứ hai. (7) Không đụng schema ⇒ `erd.md`
  giữ nguyên; không thêm biến env.
- **Test:** BE 542 test xanh (+26: 8 `dashboard-range` + 18 `DashboardService`) · FE 32 test
  cũ xanh · lint/build 2 phía xanh · smoke API thật đủ case RBAC/validate/timezone
  (plan 14 §7), dữ liệu smoke đã xoá.
- **Còn nợ:** chưa bấm tay trên UI (§6 mục 18).

### Tinh chỉnh màn Quản lý Ảnh/Video Edit — ✅ 2026-07-26

- **Phạm vi:** (1) FE bỏ hẳn ô "Mô tả ngắn" ở popup Upload và Drawer Chỉnh sửa (cả
  nhánh mock lẫn nhánh API thật) — không gửi `description` lên nữa. (2) Bài do **ADMIN**
  upload vào thẳng `APPROVED` kèm `approved_by = admin`; CONTENT/EDITOR vẫn `PENDING_REVIEW`.
- **File chính:** `frontend/src/pages/ContentManagementPage.tsx`,
  `backend/src/modules/content-assets/content-assets.service.ts` (+ `.repository.ts`)
- **Quyết định:** BE **giữ nguyên** cột `description` (vẫn optional trong DTO/schema) —
  PATCH không gửi field ⇒ dữ liệu cũ không bị xoá; chỉ ẩn ở UI. Auto-duyệt gắn với role
  `ADMIN` chứ không phải quyền `content:review` (EDITOR upload vẫn phải qua hàng chờ).
  Không đụng schema ⇒ `erd.md` giữ nguyên.
- **Test:** BE 548 test xanh (+6 cho nhánh auto-duyệt lúc create) · lint/build 2 phía xanh.
- **Còn nợ:** chưa bấm tay trên UI.

### Multi action + `is_active` cho content (Plan 19) — 🟡 2026-08-03

- **Phạm vi:** chọn nhiều bài ở `/content` để **xoá** / **ngưng dùng** / **dùng lại**;
  cột DB mới `content_assets.is_active`. Bài ngưng dùng **vẫn hiện** trong kho (làm mờ
  + tag "Ngưng dùng") nhưng **mọi nơi tiêu thụ bài đều bỏ qua**: cron picker, đếm kho
  (`readyCount`/`readiness`), đăng tay, lịch đăng bài, thẻ tồn kho dashboard.
- **File chính:** `backend/src/common/bulk/bulk-result.ts` (mới, dùng lại được cho
  resource khác), `backend/src/modules/content-assets/*`,
  `backend/src/modules/auto-post/content-picker.repository.ts`,
  `frontend/src/pages/ContentManagementPage.tsx`
- **Quyết định:** (1) `is_active` là **cột riêng, không phải một `ContentStatus` mới** —
  status có bảng chuyển trạng thái + rule "chỉ Bot set PUBLISHING/PUBLISHED", nhét
  "ngưng dùng" vào đó sẽ đẻ ~10 cặp transition phải test. (2) Bulk **không all-or-nothing**:
  trả `{requested, succeeded[], failed[{id,label,reason}]}` **HTTP 200** kể cả có bài bị bỏ
  qua; UI hiện toast "đã xoá 8/10 + lý do từng bài", checkbox của bài đã đăng bị **disable**
  sẵn. (3) Trần **100 id/lô**, xử lý **tuần tự** (mỗi bài là 1 lần gọi Drive). (4) RBAC
  **per-item**: CONTENT chọn nhầm bài người khác ⇒ chỉ bài đó vào `failed`. (5) Audit ghi
  **1 dòng cho cả lô**, không 100 dòng lẻ. (6) Tắt `is_active` **không** gỡ bài đã đăng và
  job đang QUEUED/PUBLISHING **vẫn chạy** (đã qua bước pick) — cố ý.
- **Test:** BE **687 test xanh (+34)**, FE 35 test cũ xanh, lint/build 2 phía xanh.
  **Đã smoke API thật** — xem `plans/19-bulk-actions.md` §6.
- **Còn nợ:** chưa bấm tay trên UI (§6 mục 26).

### Cột "Editor" (người dựng video/ảnh) cho Quản lý Ảnh/Video (Plan 18) — 🟡 2026-08-03

- **Phạm vi:** thêm trường **Editor** = *ai dựng* video/ảnh, khác hẳn "Người upload".
  Chọn được trong Modal upload + Drawer sửa (**không bắt buộc**), có cột riêng trên bảng
  và ô filter. Theo yêu cầu user: cột/filter **"Người upload" bị thay** bằng "Editor"
  (code cũ để lại dạng comment, chưa xoá); label role FE `Biên tập / Duyệt bài` → `Editor`.
- **File chính:** `backend/prisma/schema.prisma` (+ migration `20260803130538_content_assets_editor`),
  `backend/src/modules/content-assets/*`, `backend/src/modules/users/users.repository.ts`,
  `frontend/src/pages/ContentManagementPage.tsx`, `frontend/src/hooks/useContentAssets.ts`
- **Quyết định:** (1) **Dùng lại role `EDITOR` sẵn có** (user chốt) — không thêm enum, không
  đụng ma trận quyền; chỉ user role EDITOR **đang active** mới chọn được, sai ⇒ **400**
  (FK không diễn tả được ràng buộc theo role). (2) Endpoint riêng
  `GET /content-assets/editors` thay vì dùng `GET /users` — `/users` gác `users:manage`
  (chỉ ADMIN) trong khi CONTENT cũng phải chọn editor cho bài của mình. (3) `editorId`
  **không phải field duyệt** ⇒ ai sửa được bài thì set được; gửi `null` = gỡ, không gửi =
  không đụng. (4) `erd.md` đã cập nhật (cột + index + lịch sử).
- **Test:** BE **653 test xanh (+9 test Editor)**, FE 35 test cũ xanh, lint/build 2 phía xanh.
  **Đã smoke API thật** (editor bị khoá / role CONTENT / uuid sai ⇒ 400, gán ⇒ trả `editor`
  kèm tên–email, `?editorId=` lọc đúng 1 bài, gửi `null` ⇒ gỡ) — tài khoản mượn để smoke đã
  trả về trạng thái cũ.
- **Còn nợ:** **chưa bấm tay trên UI** — xem §6 mục 24.

### Tối ưu đường publish media — cache Drive + stream, bỏ buffer RAM (Plan 17) — 🟡 2026-08-03

- **Phạm vi:** cùng 1 video phân bổ cho nhiều page trước đây tải lại từ Drive cho **từng**
  page và nạp trọn file vào RAM. Giờ tải 1 lần xuống đĩa, các job stream từ đó.
  Kèm: timeout đăng FB đưa vào env, job hỏng trong Redis có hạn sống.
- **File chính:** `backend/src/infra/media-cache/media-cache.service.ts` (mới),
  `backend/src/infra/facebook/facebook-publisher.client.ts`,
  `backend/src/modules/publish-jobs/publish-media.service.ts`
- **Quyết định:** (1) `PublishFileInput` đổi từ `Buffer` sang **đường dẫn file**, publisher
  dùng `fs.openAsBlob` — đo thật: video 300MB từ **1020MB RSS xuống ~200MB**, do bỏ được
  3 bản copy Buffer/Uint8Array/Blob. (2) Dọn cache bằng **`@Cron` 10 phút + `sweep(now)`**
  chứ không `setTimeout`, để test được bằng giờ giả (cùng khuôn `AutoPostSchedulerService.tick`).
  (3) Tải xuống `.part` rồi `rename` — file cụt do crash không được mang tên thật, nếu không
  lần sau sẽ đăng lên Facebook một video hỏng. (4) `FB_VIDEO_TIMEOUT_MS` 180s → 900s: 180s
  đòi ≥14 Mbps liên tục mới đẩy nổi 300MB, không đạt thì hỏng rồi retry, mỗi lần retry lại
  tải file về. (5) `removeOnFail: false` → hạn 7 ngày.
- **Test:** BE **644 test xanh (+41)** — 21 test `MediaCacheService` (coverage 100%),
  13 test `PublishMediaService`, 6 test kịch bản 4 page cùng mốc giờ, 3 test env.
  Lint/build xanh.
- **Còn nợ:** chưa test tay trên VPS thật với video 300MB × 4 page; FB resumable upload,
  concurrency worker, tách queue ảnh/video — xem §6.

### Nâng trần upload 300MB + vá timeout tầng Node — ✅ 2026-08-03

- **Phạm vi:** `MAX_UPLOAD_MB` 200 → 300; vá `413` (Nginx) và chặn `408/504` (Node).
- **File chính:** `backend/src/common/http/server-timeouts.ts` (mới), `backend/src/main.ts`
- **Quyết định:** Node `server.requestTimeout` mặc định **300_000ms** là tổng thời gian nhận
  trọn request **kể cả body** — nới Nginx không cứu được. Thêm `HTTP_REQUEST_TIMEOUT_MS`
  (900_000) áp trước `app.listen()`. Giới hạn upload nằm ở **3 tầng độc lập**: Nginx
  `client_max_body_size`, `MAX_UPLOAD_MB` (chỉ fallback), và `maxUploadMb` trong
  `app_settings` (**tầng này thắng**, sửa ở UI `/settings`).
- **Test:** 8 test `server-timeouts` gồm 3 test hành vi thật trên socket. Lint/build xanh.
- **Còn nợ:** đường **upload** vẫn dùng multer `memoryStorage` (300MB ⇒ ~600MB RAM) — §6.

---

### M10 Kết nối Page bằng đăng nhập Facebook (Plan 15) — 🟡 2026-07-27

- **Phạm vi:** thay việc dán Page token tay bằng đăng nhập Facebook. BE: `GET /pages/connect/url`,
  `GET /pages/connect/callback` (`@Public`, state single-use TTL 10 phút),
  `GET /pages/connect`, `GET /pages/connect/:id/candidates`, `POST /pages/connect/:id/import`,
  `DELETE /pages/connect/:id`, `POST /pages/:id/refresh-token`, `GET/PUT /settings/facebook-app`.
  FE: nút "Kết nối bằng Facebook" + modal chọn page + cột "Nguồn token" + card kết nối +
  tab "Facebook App" ở `/settings`.
- **File chính:** `backend/src/modules/facebook-pages/facebook-connect.service.ts`,
  `facebook-connect.controller.ts`, `facebook-connections.repository.ts`,
  `backend/src/infra/facebook/facebook-graph.client.ts` (thêm `exchangeCodeForUserToken`,
  `exchangeLongLivedUserToken`, `getMe`, `listPagesWithTokens`, `appsecret_proof`),
  `frontend/src/components/pages/{ConnectPagesModal,ConnectionsCard,FacebookAppSettings}.tsx`
- **Quyết định:** ADR-018. (1) **Không thêm biến `.env`** — App ID/Secret vào
  `app_settings['facebook_app']`, `META_APP_ID/SECRET` sẵn có chỉ còn là fallback.
  (2) Import trúng page đang `MANUAL_TOKEN` ⇒ trả `needsConfirm`, **không tự ghi đè**
  (ghi đè token System User bằng token cá nhân là hạ độ bền). (3) Chặn page thiếu task
  `CREATE_CONTENT` ngay ở modal thay vì để job FAILED sau này. (4) Ngắt kết nối chỉ xoá
  user token, **không** đụng Page token đang chạy. **Đổi schema ⇒ `erd.md` đã cập nhật**
  (bảng `facebook_connections`, enum `FacebookConnectMode`, 2 cột mới trên `facebook_pages`;
  migration `20260726163154_facebook_login_connection`).
- **Test:** BE **590 test xanh (+41)** — 31 test service (state single-use/hết hạn, thứ tự
  đổi token ngắn→dài, token lưu dạng mã hoá, 5 nhánh import, refresh, revoke, response không
  lộ token) + 10 test graph client. FE 35 test cũ xanh. Lint/build 2 phía xanh.
- **Còn nợ:** chưa chạy với Meta app thật (§6 mục 19) — cần user tạo app và tự thêm vai trò
  **Tester**. Chưa làm auto-refresh nền cho user token 60 ngày (chỉ cảnh báo + nút kết nối lại).

---

### Fix mojibake tên file khi upload Drive — ✅ 2026-08-05

- **Phạm vi:** bug tên file ảnh/video tiếng Việt lên Google Drive bị lỗi font
  (mojibake) sau khi upload.
- **Nguyên nhân:** Busboy (multer) decode header multipart theo `latin1` mặc
  định, trong khi trình duyệt gửi tên file UTF-8 ⇒ `file.originalname` đã sai
  ngay khi vào controller, Drive adapter chỉ forward nguyên chuỗi hỏng.
- **File chính:** `backend/src/modules/media/media.controller.ts` — decode lại
  `Buffer.from(file.originalname, 'latin1').toString('utf8')` trước khi truyền
  vào `mediaService.upload`.
- **Test:** không thêm unit test riêng (controller mỏng, chỉ chuyển field —
  thuộc diện CRUD/delegate không bắt buộc test theo rule 02). Lint/build xanh.
- **Còn nợ:** chưa test tay upload 1 file tên tiếng Việt thật trên UI để xác
  nhận hiển thị đúng trên Drive.

### Facebook resumable upload cho video lớn (Plan 20) — 🟡 2026-08-05

- **Phạm vi:** video ~180MB đăng thủ công/auto-post bị `502` (`code=undefined
  subcode=undefined ...` — body lỗi không phải JSON) vì code cũ đẩy **toàn bộ
  video trong 1 POST** tới `graph-video.facebook.com/{pageId}/videos`, endpoint
  đồng bộ này không ổn định với file lớn. Trả nợ kỹ thuật #22 cũ.
- **Thiết kế:** chuyển `publishVideo` sang **Facebook Resumable Upload API** —
  3 pha `start` (gửi `file_size`, nhận `video_id`/`upload_session_id`/offset
  đầu) → `transfer` (lặp theo `start_offset`/`end_offset` do chính Facebook
  điều khiển, cắt chunk bằng `blob.slice()` trên Blob từ `openAsBlob`, không
  đọc file vào RAM) → `finish`. Mỗi pha retry riêng tối đa
  `FB_VIDEO_CHUNK_RETRIES` lần (mặc định 3), không delay giữa các lần thử.
  Guard offset không tiến ⇒ ném lỗi domain thay vì loop vô hạn.
- **File chính:** `backend/src/infra/facebook/facebook-publisher.client.ts`
  (`publishVideo` viết lại hoàn toàn, thêm `startVideoUpload`/
  `transferVideoChunk`/`finishVideoUpload`/`withRetry`),
  `backend/src/infra/facebook/facebook-publisher.interface.ts`
  (`PublishFileInput.size`), `backend/src/modules/publish-jobs/publish-media.service.ts`
  (truyền `file.size` từ `MediaCacheService`), `backend/src/config/env.validation.ts`
  + `app-config.service.ts` (`FB_VIDEO_CHUNK_RETRIES`).
- **Test:** 9 test mới `facebook-publisher.client.spec.ts` (1 chunk · nhiều
  chunk · start lỗi Graph retry đúng số lần · transfer lỗi mạng rồi retry
  thành công · transfer hết retry vẫn lỗi (không gọi finish) · finish
  `success:false` · offset không tiến (chặn loop vô hạn) · start thiếu
  `video_id` · ảnh `publishImage` không đổi hành vi). Toàn bộ 706 test BE xanh,
  lint/build xanh.
- **Còn nợ:** chưa test tay trên VPS thật với video ≥180MB (đăng thủ công lẫn
  auto-post) — xem §6 mục 22. Chưa làm resume-sau-crash (giữ
  `upload_session_id` để tiếp tục job dở khi process crash giữa chừng).

### Plan 20 §4b — chặn tạo job đăng trùng + test video toàn vẹn — ✅ 2026-08-05

- **Phạm vi:** user test tay video 180MB, `/timeline` hiện 2 record cùng bài
  (1 Thất bại + 1 Thành công). Điều tra: **không phải bug hiển thị** — là 2
  `publish_jobs` row thật, vì `ManualPostService.publishNow` không chặn tạo job
  mới khi content+page đã có job đang chờ/lỗi (bấm "Đăng bài thủ công" lần 2
  sau khi lần 1 lỗi, thay vì bấm "Đăng lại" trên chính job đó). Nhân tiện phát
  hiện `content-picker` (auto-post) có cùng lỗ hổng: chỉ loại content có job
  `QUEUED`/`PUBLISHING`, **không loại `FAILED`** — Bot có thể tự re-pick nội
  dung vừa lỗi ở tick sau, rủi ro nặng hơn vì không ai bấm nút.
- **Fix:**
  1. `ManualPostRepository.findBlockingJob(contentId, pageId)` — job mới nhất
     đang `QUEUED`/`PUBLISHING`/`FAILED`. `ManualPostService.publishNow` ném
     `ConflictException` (409) nếu có, message khác nhau theo trạng thái (đang
     xử lý / dùng nút "Đăng lại").
  2. `content-picker.repository.ts` — cả `pickForSlot` **và**
     `countByCategoryForPage` (2 câu phải giống hệt nhau, đã có comment cảnh
     báo sẵn) thêm `FAILED` vào danh sách loại trừ.
  3. Test byte-exact trong `facebook-publisher.client.spec.ts`: ghi file 12
     byte phân biệt (0..11), giả lập Facebook chia 3 chunk, đọc lại đúng
     `video_file_chunk` Blob đã gửi ở mỗi lần `transfer` và ghép lại — xác nhận
     100% khớp file gốc (`Blob.slice()` trên Node không làm hỏng/lệch dữ liệu).
  4. Log thời lượng + số chunk + Mbps ước tính ở cuối `publishVideo` (thành
     công lẫn thất bại) — dùng để lần test tay sau phân biệt "nghẽn băng thông
     VPS" (ít chunk, thời lượng tỉ lệ file size) với "nghẽn giao thức" (nhiều
     chunk/round-trip). Trả lời câu hỏi tốc độ ~4 phút/180MB: tính ra khớp
     ~6 Mbps sustained — nhiều khả năng là băng thông thật của VPS chứ không
     phải overhead giao thức (mỗi `fetch` dùng chung connection pool của
     undici), nhưng cần log thật để xác nhận, chưa đo được trên VPS thật.
- **File chính:** `backend/src/modules/manual-post/manual-post.repository.ts`
  (`findBlockingJob`), `manual-post.service.ts` (guard),
  `backend/src/modules/auto-post/content-picker.repository.ts` (thêm `FAILED`,
  2 câu SQL), `backend/src/infra/facebook/facebook-publisher.client.ts` (log
  timing, `describeUploadTiming`).
- **Test:** +4 test (2 `manual-post.service.spec.ts` — job FAILED/PUBLISHING
  chặn tạo mới; 1 `content-picker.repository.spec.ts` — `countByCategoryForPage`
  khớp picker; 1 `facebook-publisher.client.spec.ts` — byte-exact). **710 test
  BE xanh**, lint/build xanh.
- **Nợ phát sinh:** `docs/03-database-design.md:381` mẫu SQL picker chỉ có
  `('QUEUED', 'PUBLISHING')`, thiếu `FAILED` — code giờ đúng hơn spec, **không
  tự sửa `docs/`** theo rule 00 (xem §6 mục 27). Chưa đo tốc độ upload thật
  trên VPS bằng log mới thêm.

### FE — thanh progress + mask khoá modal Upload Ảnh/Video — ✅ 2026-08-05

- **Phạm vi:** popup "Upload Ảnh/Video" (màn Quản lý Ảnh/Video) đổi spinner sang
  **thanh progress % thật** + lớp mask phủ toàn bộ form, khoá nút X / Esc / click
  mask / nút Huỷ trong lúc upload. Đạt 100% byte ⇒ chuyển nhãn "Đang xử lý trên
  Google Drive..." (server còn stream tiếp sang Drive).
- **File chính:** `frontend/src/api/client.ts` (thêm `apiUpload` dùng
  XMLHttpRequest — `fetch` **không** expose upload progress; giữ nguyên cơ chế
  Bearer + refresh 401 một lần), `frontend/src/api/media.api.ts`,
  `frontend/src/pages/ContentManagementPage.tsx` (`RealContentManagementPage`).
- **Quyết định:** chỉ sửa nhánh real; nhánh `MockContentManagementPage` giữ
  nguyên (ADR-005).
- **Test:** `media.api.test.ts` viết lại theo XHR giả lập, +2 case (onProgress,
  ApiError từ body lỗi). 41 test FE xanh, lint/build xanh.
- **Còn nợ:** không.

### Fix — ẩn page tạm dừng khỏi Cài đặt đăng bài tự động — ✅ 2026-08-07

- **Phạm vi:** `GET /auto-post-configs` chỉ trả page `is_active = TRUE`; màn Cài
  đặt đăng bài tự động (kèm dropdown lọc + chọn page ở modal Đăng ngay) không còn
  hiện page bị tạm dừng ở màn Quản lý FB Page.
- **File chính:** `backend/src/modules/auto-post-configs/auto-post-configs.repository.ts`
  (`findPagesWithSlots(activeOnly)`), `auto-post-configs.service.ts`,
  `frontend/src/pages/AutoPostSettingsPage.tsx` (đổi text empty state).
- **Quyết định:** thêm cờ `activeOnly` thay vì lọc cứng — `publish-schedule`
  (Timeline) dùng chung method này và vẫn cần thấy page tạm dừng.
- **Test:** +2 test repository (where có/không `isActive`). 40 test auto-post-configs
  + publish-schedule xanh; lint/build BE & FE xanh.
- **Còn nợ:** không.

### RBAC — thu hẹp quyền role EDITOR còn 2 màn — ✅ 2026-08-08

- **Phạm vi:** EDITOR chỉ còn vào **Quản lý Ảnh/Video Edit** và **Hướng dẫn sử
  dụng**. Mất Tổng quan, Lịch đăng bài, Cài đặt đăng tự động (và mọi API tương
  ứng: `dashboard:view`, `timeline:view`, `autopost:manage`, kể cả Đăng ngay).
  Giữ nguyên quyền trong màn content, gồm cả duyệt bài (`content:review`).
- **File chính:** `backend/src/common/permissions.ts`,
  `frontend/src/utils/permissions.ts` (thêm `defaultRouteFor` — EDITOR về
  `/content`), `frontend/src/App.tsx` (`HomeRedirect`, `/dashboard` bọc
  `RoleRoute`), `routes/ProtectedRoute.tsx`, `layouts/AdminLayout.tsx`,
  `pages/LoginPage.tsx`, `pages/GuidePage.tsx` (tách `ADMIN_STEPS`).
- **Quyết định:** chặn cả 2 tầng (menu ẩn + guard route + permission BE), không
  chỉ ẩn menu. `/dashboard` phải vào bảng `restricted` nên cần route mặc định
  theo role, nếu không EDITOR lặp redirect vô hạn.
- **Test:** BE 834 test xanh (cập nhật ma trận trong `common/__tests__/permissions.spec.ts`);
  FE 59 test xanh (+ case "EDITOR chỉ còn /content và /guide", `defaultRouteFor`).
  Lint/build BE & FE xanh.
- **Còn nợ:** `docs/05-rbac.md` §2 vẫn ghi ma trận cũ — xem §6.

### Lịch đăng bài — khối "Khung giờ chạy tiếp theo" — ✅ 2026-08-08

- **Phạm vi:** thêm block nổi bật (border xanh, có đếm ngược) ngay đầu card "Lịch
  ngày …", show mốc giờ gần nhất còn ở tương lai so với giờ hiện tại. Danh sách
  timeline bên dưới giữ nguyên thứ tự muộn → sớm.
- **File chính:** `frontend/src/pages/TimelinePage.tsx` (`findNextSlot`,
  `formatCountdown`, `isSlotLive`).
- **Quyết định:** ưu tiên mốc gần nhất **thực sự chạy** (page active + auto bật +
  slot bật); nếu cả ngày chỉ còn mốc đang tắt thì vẫn show mốc gần nhất nhưng đổi
  border/tag sang cam kèm cảnh báo. Ngày quá khứ hoặc hết mốc ⇒ ẩn block. Đồng hồ
  tick 30s để block tự nhảy mốc, không cần F5.
- **Test:** chưa viết test (UI thuần, rule 02 không bắt buộc). Lint + build FE xanh.
- **Còn nợ:** không.

---

## 6. Việc đang dở / nợ kỹ thuật

| # | Việc | Chi tiết |
|---|------|----------|
| 1 | **Pino logger + redact secret** ⚠️ TRỄ HẠN | Đã cài `nestjs-pino`, `pino-http`, `pino-pretty` nhưng **vẫn chưa wire** vào `app.module.ts`. Hiện dùng Nest Logger mặc định. Dự định làm ở M1 nhưng chưa làm — mà `POST /auth/login` và `POST /users` đã nhận password rồi. **Rủi ro hiện tại:** chưa có redact tự động; đang an toàn vì không có chỗ nào log body, nhưng phải làm **đầu M2**. Redact bắt buộc: `password`, `token`, `accessToken`, `accessTokenEnc`, `authorization`, `GOOGLE_SERVICE_ACCOUNT_JSON`. |
| 2 | E2E test setup | `test/jest-e2e.json` còn nguyên mặc định, chưa có e2e nào. M1 đã kiểm §5 **bằng tay qua curl** (đạt hết), nhưng chưa tự động hóa. Nên làm cùng M2. |
| 3 | ~~`SettingsPage` (FE) chưa nối API thật~~ ✅ ĐÃ XONG 2026-07-24 (xem mục 6) | Đang chạy bằng state mock cục bộ trong component, không qua `MockDataContext`/react-query như các trang khác vì chưa tới M7. BE đã có đủ 3 endpoint (`GET/PUT /settings/google-drive`, `POST .../test`) sẵn sàng để nối. |
| 4 | `GoogleDriveStorage` chưa test với credential Google thật ở CI | Chỉ test bằng mock `googleapis` (unit test). Đã xác nhận thủ công 1 lần với service account thật (2026-07-24) rằng service account không có storage quota trên My Drive cá nhân — đúng như `mapDriveError` đã cảnh báo; cần Shared Drive hoặc OAuth2. |
| 5 | **M2.5 chưa smoke test với backend thật** | Code + 15 test Vitest xanh nhưng chưa chạy end-to-end với API. Cần: `docker compose up` + `cd backend && npm run start:dev`, rồi `cd frontend` (đảm bảo `.env` có `VITE_USE_MOCK=false`) `npm run dev` → login admin seed, kiểm token lưu localStorage, đổi role CONTENT bị chặn `/users`, `/pages`, `/settings`. |
| 6 | ~~Drive FE đã nối xong~~ ✅ ĐÃ XONG 2026-07-24 | `api/media.api.ts` + `api/settings.api.ts` + SettingsPage 2 chế độ. **OAuth2 đã smoke test thật thành công** (connect tài khoản Gmail qua UI, redirect URI `http://localhost:3001/api/settings/google-drive/oauth/callback` — cổng đổi 3100→3001 để khớp OAuth Client đã đăng ký). Service_account chỉ chạy được với Shared Drive (Workspace), chưa test lại với authMode này sau đổi cổng (không ảnh hưởng vì không phụ thuộc redirect URI). |
| 7 | **Content Assets giai đoạn 1 chưa smoke test UI thật** | Code BE+FE xong (274 test BE, lint/build 2 phía xanh) nhưng **chưa test tay** — process backend dev hiện tại (`node dist/main`) là build cũ từ trước khi thêm module `content-assets`, cần `npm run start:dev` lại (hoặc restart) để nạp route mới. Sau khi restart: test trên `/content` — upload ảnh/video thật, sửa, xoá (kiểm file trên Drive cũng bị xoá), CONTENT không thấy/sửa được bài người khác. |
| 8 | **Facebook Pages chưa smoke test UI thật** | Code BE+FE xong (286 test BE, lint/build 2 phía xanh), đã smoke test API qua curl (tạo/sửa/xoá page, mask đúng, 409 trùng pageId, EDITOR bị 403) nhưng **chưa test tay trên UI thật**. Cần `VITE_USE_MOCK=false`, đăng nhập ADMIN, vào `/pages` — thêm/sửa/xoá page qua form, kiểm token hiện dạng mask trong bảng, đăng nhập EDITOR kiểm không thấy nút sửa/xoá. |
| 9 | **Auto-post configs chưa smoke test UI thật** | Code BE+FE xong (318 test BE, lint/build 2 phía xanh), đã smoke API qua curl đủ các case nghiệm thu (3 slot sắp theo giờ, trùng giờ ⇒ 409, `time='25:00'` ⇒ 400, `postCount=21` ⇒ 400, warning khi bật auto lúc chưa có slot, CONTENT ⇒ 403) nhưng **chưa test tay trên UI**. Cần `VITE_USE_MOCK=false`, đăng nhập ADMIN, vào `/auto-post` — thêm 3 mốc giờ, kiểm sắp xếp, thêm trùng giờ xem báo lỗi 409, bật/tắt switch Auto ON, xoá mốc giờ. Đăng nhập CONTENT kiểm không vào được trang. |
| 11 | **Đăng bài thủ công chưa chạy thật** | Code BE+FE xong (plan 09, BE 357 test xanh) nhưng đường publish **chưa từng gọi Graph thật** — chặn bởi mục 10 (chưa có Page token). Khi có token: vào `/auto-post` → "Đăng bài thủ công" → chọn 1 **ảnh** trước (nhẹ, nhanh) → kiểm bài lên Page thật, `publish_jobs` SUCCESS + `facebookPostId`, assignment có `published_at`, content chuyển `PUBLISHED`; đăng lại chính bài đó ⇒ 409. Sau đó thử 1 video (đường `graph-video`, timeout 180s). |
| 12 | **User Management + tracking content chưa smoke UI thật** | Code BE+FE xong (plan 10, BE 361 test xanh), đã smoke API qua curl đủ case (tạo/sửa/vô hiệu hóa user, 409 email trùng, 400 tự khóa mình, `PATCH /content-assets` ⇒ `updatedBy` đúng actor) nhưng **chưa test tay trên UI**. Cần `VITE_USE_MOCK=false`, đăng nhập ADMIN: `/users` tạo user mới (có tên) → sửa quyền → vô hiệu hóa; `/content` kiểm 2 cột "Người upload"/"Người sửa gần nhất" đổi đúng sau khi sửa bài; đăng nhập CONTENT gõ `/users` phải bị chặn. |
| 10 | **Chưa có Page token dùng được cho Page thật** | Đã gọi Graph thật 2026-07-25 và sửa xong adapter (xem §7). Token hiện lưu là **SYSTEM_USER token** (hết hạn 23/09/2026) nhưng system user `toolfbtest` **chưa được gán Page nào** (`/me/accounts` rỗng) nên vẫn không đọc được page. Bước còn lại: Business settings → System users → Add assets → Pages → gán page + task Manage Page, rồi đổi sang Page token qua `/me/accounts`. Token cũ hơn là USER token ngắn hạn (hết hạn trong ngày) nên nút Test vẫn báo đỏ đúng nghiệp vụ. Cần token **System User** (`expires_at = 0`) → dùng nó gọi `/me/accounts` lấy Page token vĩnh viễn → dán vào form. Publisher (plan 07) sẽ chết vì token hết hạn nếu bỏ qua bước này. Business đang dùng: `27820019340966159`, app `KakuCoach`, page thật `111367907895365` (Cửa hàng cây cảnh mini). |

| 14 | **Lịch đăng bài chưa smoke UI thật** | Code BE+FE xong (plan 12, BE 411 test xanh), đã smoke API qua curl (lịch hôm nay đúng 2 slot × page, bài đăng tay hiện tên user "System Admin", ngày mai ra PENDING/NO_CONTENT, filter page/status, `date=25-07-2026` ⇒ 400, CONTENT ⇒ 403). **Chưa test tay UI**: `VITE_USE_MOCK=false`, đăng nhập ADMIN, vào `/timeline` — kiểm 4 ô thống kê, đổi ngày (hôm qua/mai), lọc theo page và theo trạng thái job, dòng đăng tay hiện tag "Đăng tay" + tên user, tắt 1 mốc giờ ở `/auto-post` rồi quay lại xem có báo "Đang tắt"/PAUSED, bấm "Xem/sửa bài
trong kho" ở một job ⇒ sang `/content` và Drawer sửa đúng bài mở sẵn (đóng Drawer rồi F5
không mở lại). Đăng nhập CONTENT kiểm không vào được trang. |
| 15 | **Engine auto-post chưa đăng thật lên Facebook + chưa smoke UI** | Code BE+FE xong (plan 07, BE 464 test xanh), đã smoke đủ đường cron→job→worker→retry→FAILED bằng page test token sai. Khi có Page token thật (mục 10): tạo 1 slot sát giờ + 1 bài ảnh APPROVED đã gán page → chờ tới mốc (hoặc `POST /auto-post/run-now`) → job phải SUCCESS, assignment có `published_at` + `facebook_post_id`, content `PUBLISHED`, chạy lại slot trong ngày không đăng lại. UI: `/timeline` xem dòng "Bot đã chạy lúc …", lý do "kho không còn bài phù hợp", nút "Xem nhật ký" trên job. |
| 16 | **Nút "Đăng lại" / "Chạy lại mốc này" chưa smoke UI thật** | Code BE+FE xong (plan 07 §10, BE 485 test xanh) nhưng **chưa bấm thử trên UI và chưa chạy với Redis thật**. Cần: tạo 1 job hỏng (page token sai) → `/timeline` bấm "Đăng lại" ⇒ job về QUEUED rồi worker chạy lại, nhật ký có dòng "Đăng lại thủ công bởi …"; bấm lại khi job đang QUEUED ⇒ báo 409; tắt page rồi bấm ⇒ báo 400. Với mốc giờ `MISSED`/`SKIPPED`: bấm "Chạy lại mốc này" ⇒ tạo job nếu kho có bài, bấm lần 2 trong cùng phút ⇒ cảnh báo "vừa chạy trong phút này". Đăng nhập EDITOR kiểm không thấy nút "Đăng lại" (chỉ ADMIN có `jobs:retry`). |
| 13 | **Content giai đoạn 2 chưa smoke UI thật** | Code BE+FE xong (plan 11, BE 382 test xanh), đã smoke API qua curl đủ case (403 CONTENT đổi status/isAds, 400 thiếu lý do từ chối, 422 set PUBLISHED, 409 gỡ page đã đăng / xoá bài đã đăng, 400 page lạ, CONTENT sửa bài REJECTED ⇒ tự về PENDING_REVIEW, gợi ý hashtag). **Chưa test tay UI**: `/content` — bảng có cột "Phân bổ page" (tag xanh = đã đăng), Drawer sửa duyệt/không duyệt (bắt buộc lý do)/tick Đạt ADS/chọn page (page đã đăng bị khoá), ô Hashtags gõ ra gợi ý và tạo tag mới được, ô "Dạng" gõ tên mới ⇒ dropdown hiện "＋ Thêm ..." và lưu được (kiểm cả ở `/auto-post` slot categories). Đăng nhập CONTENT kiểm không thấy khối duyệt. |
| 17 | **M8 Monitor chưa smoke UI thật** | Code BE+FE xong (plan 13, BE 516 test xanh), đã smoke API thật đủ case (Redis chết ⇒ 200 + `queue: null`, job kẹt 30 phút ⇒ `stuckMinutes: 30`, phân trang + lọc `/publish-jobs` và `/audit-logs`, EDITOR ⇒ 403). **Chưa bấm tay UI**: `VITE_USE_MOCK=false`, ADMIN vào `/queue` (thẻ số tự nhảy trong 10s sau `POST /auto-post/run-now`, tắt container Redis ⇒ badge "Mất kết nối" chứ không trắng trang), `/failed` (phân trang >20 job, "Xem nhật ký", "Đăng lại" ⇒ 409 khi bấm lại lúc đang QUEUED), `/audit` (lọc ngày/action/user, Drawer diff JSON, log cron hiện tag "Bot"), và **mở lại `/timeline`** xác nhận không gãy sau khi đổi shape `/publish-jobs`. EDITOR gõ thẳng `/queue`,`/failed`,`/audit` ⇒ bị đá về `/dashboard`. Xong thì `git mv plans/13-monitor.md plans/DONE/`. Còn thiếu: ô tìm kiếm theo tiêu đề ở `/failed` (backend đã hỗ trợ `search`). |
| 19 | **M10 Kết nối Facebook chưa smoke với Meta app thật** | Code BE+FE xong (plan 15, BE 590 test xanh, +41 test mới), nhưng **chưa chạy lần nào với Meta app thật** vì cần user tạo app + tự thêm mình vào **App roles → Tester** (nếu không, đăng nhập vẫn thành công nhưng `/me/accounts` rỗng — đúng cái bẫy đã gặp ở mục 10). Cần: `/settings` tab "Facebook App" nhập App ID/Secret, copy Redirect URI dán vào Meta (Facebook Login → Valid OAuth Redirect URIs), `/pages` bấm "Kết nối bằng Facebook" → consent → modal chọn page → import. **Bằng chứng làm đúng: page vừa import phải hiện "Hết hạn: Vĩnh viễn" và Test kết nối trả `tokenType=PAGE`, `expiresAt=null`.** Nếu ra một ngày cụ thể ⇒ bước đổi long-lived hỏng. Sau đó trả nốt mục 10/11/15 (đăng thật lên Page). Xong thì `git mv plans/15-facebook-login-connect.md plans/DONE/`. |
| 20 | **Plan 17 chưa smoke trên VPS thật** | Cache media + stream đã xong, 644 test xanh, nhưng **chưa chạy lần nào với video lớn thật**. Cần: 1 video ~300MB phân bổ 4 page, cùng mốc giờ. Bằng chứng làm đúng: log `Đã tải file <id> (300MB) xuống cache` xuất hiện **đúng 1 lần** cho 4 job; `pm2 monit` RSS **không** vọt lên ~1GB; 4 bài lên đủ 4 page. Kiểm luôn `MEDIA_CACHE_DIR` không phình sau vài ngày (cron dọn 10 phút/lần). Xong thì `git mv plans/17-publish-media-optimize.md plans/DONE/`. |
| 21 | **Đường UPLOAD vẫn nạp trọn file vào RAM lúc đẩy Drive** | *(Cập nhật 2026-08-07 sau plan 23 — đã vá một nửa.)* Đường mới `POST /media/upload-jobs` (UI dùng đường này) ghi thẳng xuống đĩa bằng multer `diskStorage` ⇒ **nhận** file không còn tốn RAM; nhưng worker vẫn `readFile()` toàn bộ rồi mới gọi Drive vì `DriveStorage.upload()` chỉ nhận `Buffer` ⇒ RAM đỉnh ≈ `MEDIA_UPLOAD_CONCURRENCY` (3) × file lớn nhất. Đường cũ `POST /media/upload` vẫn `memoryStorage()` (giữ nguyên, không còn UI nào gọi). Hướng xử lý còn lại: đổi interface Drive sang stream / resumable upload để bỏ nốt bản copy trong RAM. |
| 22 | **Plan 20 (resumable upload video) — hết 502, tốc độ đã điều tra xong; còn 2 việc nhỏ trước khi đóng plan** | Code xong (BE **710** test xanh) — `publishVideo` dùng Facebook Resumable Upload API, guard chặn job đăng trùng (manual + auto-post picker), video không bị hỏng khi chia chunk (test byte-exact). **Đã test tay 2 lần trên video thật (162.5MB, 130.5MB, 48MB, 2026-08-05): không còn 502 lần nào.** **Tốc độ ~5.5-7.4 Mbps đã điều tra xong và ĐÓNG (plan 20 §4c-§4d):** đối chiếu `curl` upload thô ra ~310 Mbps (chênh ~42 lần) loại bỏ giả thuyết băng thông VPS yếu; log chi tiết chunk đầu (1622ms) so với TB chunk sau (1425ms) chỉ chênh ~14% (loại bỏ giả thuyết lỗi tái dùng kết nối trong code); biên độ chunk sau chênh ~7 lần (881-6300ms) là dấu hiệu Facebook rate-limit kiểu bucket cho phiên Resumable Upload — **kết luận: giới hạn từ phía Meta, không sửa được bằng code, không cần điều tra thêm.** **Việc còn lại trước khi đóng plan:** thử bấm "Đăng bài thủ công" 2 lần liên tiếp cùng bài+page trên UI thật để xác nhận lần 2 bị 409 thay vì tạo bài trùng; `pm2 monit` RSS không vọt khi upload video lớn (đo thật, chưa làm). Xong thì `git mv plans/20-facebook-resumable-upload.md plans/DONE/`. |
| 27 | **`docs/03-database-design.md` lệch code sau plan 20 §4b** | Dòng 381, mẫu SQL picker chỉ ghi `j.status IN ('QUEUED', 'PUBLISHING')`, thiếu `FAILED` — code (`content-picker.repository.ts`) giờ đã thêm `FAILED` để tránh Bot tự re-pick nội dung vừa đăng lỗi (đúng hành vi hơn, spec cũ thiếu case này). Theo rule 00 §1, không tự sửa `docs/` khi đang code — cần user xác nhận rồi cập nhật `docs/03-database-design.md` dòng 381 cho khớp. |
| 28 | **Plan 22 (nhiều ảnh trong 1 content record) chưa test tay trên UI/Page thật** | *(Thay cho nợ cũ của plan 21 — hướng `assetsPerPost` đã bị xoá, xem plan 22.)* Code BE+FE xong (BE **737** test xanh, migration `20260806090000_content_asset_files` đã apply DB dev). **Chưa bấm tay**: `/content` → Upload, chọn **4 ảnh cùng lúc** ⇒ tạo đúng **1** bài, bảng hiện `Ảnh · +3 ảnh`, Drawer hiện tag "Bài 4 ảnh"; chọn **1 video** ⇒ vẫn upload bình thường như cũ; chọn **11 ảnh** ⇒ UI cắt còn 10 kèm cảnh báo (và nếu lách được thì BE trả 400). Sau đó bấm **"Đăng bài thủ công"** với bài 4 ảnh ⇒ **Facebook hiện đúng 1 bài 4 ảnh** (đăng tay giờ cũng có album — plan 21 không hỗ trợ); rồi thử đường **Bot**: `POST /auto-post/run-now` cho mốc giờ có bài đó ⇒ cũng ra 1 bài 4 ảnh, record chuyển `PUBLISHED`. Kiểm **hồi quy**: bài 1 ảnh cũ vẫn đăng bài thường. Kiểm **xoá**: xoá bài 4 ảnh ⇒ 4 file biến mất trên Drive và `content_asset_files` sạch (`SELECT COUNT(*) FROM content_asset_files`). Kiểm `/auto-post`: form mốc giờ **không còn** ô "Số ảnh/video trong 1 bài". Xong thì `git mv plans/22-content-multi-image.md plans/DONE/` (plan 21 **ở lại** `plans/` với trạng thái BỊ THAY THẾ, không chuyển DONE). |
| 23 | **Worker concurrency vẫn = 1, chưa tách queue ảnh/video** | Giữ 1 là đúng khi RAM còn phình; sau plan 17 RAM đã phẳng nên nâng được, nhưng phải đo rate limit Meta trước. Hệ quả hiện tại: một video 300MB chiếm hàng đợi vài phút, mọi bài **ảnh** của page khác xếp sau phải chờ. Cân nhắc 2 queue riêng + `limiter` của BullMQ. |
| 26 | **Multi action (plan 19) chưa smoke UI thật** | Code BE+FE xong (BE 687 test xanh), đã smoke API đủ case (xem plan 19 §6). **Chưa bấm tay UI**: `/content` — chọn nhiều dòng (dòng đã đăng phải **mờ checkbox**), thanh "Đã chọn N bài" hiện đúng, bấm **Ngưng dùng** ⇒ dòng mờ + tag, bấm **Xoá** với lô có bài đã đăng ⇒ notification liệt kê bài bị bỏ qua kèm lý do; ô lọc "Trạng thái dùng"; Switch "Đang dùng" trong Drawer sửa. Sau đó `POST /auto-post/run-now` xác nhận Bot **không** lấy bài đã ngưng. Đăng nhập CONTENT kiểm chỉ thao tác được trên bài của mình. Xong thì `git mv plans/19-bulk-actions.md plans/DONE/`. |
| 24 | **Cột "Editor" chưa smoke UI thật** | Code BE+FE xong (plan 18, BE 653 test xanh), đã smoke API qua curl đủ case 400/gán/lọc/gỡ. **Chưa bấm tay UI**: `/content` — mở Modal upload chọn Editor (bỏ trống vẫn upload được), Drawer sửa đổi/gỡ Editor, cột "Editor" hiện đúng tên (bài chưa gán hiện "—"), ô filter "Editor" lọc đúng và gõ tìm được theo tên. Kiểm bằng account **CONTENT** (phải thấy danh sách Editor dù không có quyền `/users`). Lưu ý: DB dev hiện **không có EDITOR nào đang active** ⇒ dropdown rỗng là đúng, phải tạo 1 account role Editor ở `/users` trước. Xong thì `git mv plans/18-content-editor-field.md plans/DONE/`. |
| 29 | **Plan 23 (upload qua hàng đợi) chưa test tay trên UI thật** | Code BE+FE xong (BE **767** test xanh, FE 45; migration `20260806171728_media_upload_jobs` đã apply DB dev). **Chưa bấm tay** — chạy đủ §5 của plan: (1) `/content` → Upload 1 file ⇒ **modal đóng ngay**, bảng hiện dòng "mờ"; (2) mở modal lần nữa upload file B ⇒ A và B cùng mờ, tối đa `MEDIA_UPLOAD_CONCURRENCY` job thật sự lên Drive cùng lúc; (3) A xong ⇒ dòng mờ tự thành bài thật (PENDING_REVIEW/APPROVED); (4) làm hỏng credential Drive giữa chừng ⇒ job FAILED, bấm **"Thử lại"** chạy lại **không** phải chọn lại file; (5) file vượt `maxUploadMb` ⇒ 400 ngay, không sinh dòng mờ nào; (6) **restart backend** khi có job đang chạy ⇒ job tự về FAILED kèm message, không kẹt mãi; (7) account CONTENT chỉ thấy job của chính mình; (8) tạo đủ `MEDIA_UPLOAD_MAX_PENDING_JOBS` job rồi upload thêm ⇒ **503** và modal **không** đóng, file đã chọn còn nguyên. Kiểm hồi quy: upload **nhiều ảnh** vẫn ra **1** bài (plan 22), `POST /media/upload` cũ vẫn chạy. Kiểm đĩa: `MEDIA_UPLOAD_TMP_DIR` sạch sau khi job xong. Xong thì `git mv plans/23-queue-media-upload.md plans/DONE/`. |
| 30 | **`docs/08-bullmq.md` mới chỉ mô tả queue `publish-facebook`** | Từ plan 23 dự án có **queue thứ hai** `media-upload` (3 attempts, backoff mũ 30s, `removeOnComplete: 100`, concurrency theo env, payload chỉ chứa `mediaUploadJobId`) nhưng `docs/` chưa có mục nào cho nó. Theo rule 00 §1 không tự sửa `docs/` khi đang code — cần user xác nhận rồi bổ sung một mục cho `media-upload` vào `docs/08-bullmq.md`. |
| 31 | **`docs/05-rbac.md` §2 lệch code sau khi thu hẹp quyền EDITOR (2026-08-08)** | User chốt EDITOR chỉ dùng màn Quản lý Ảnh/Video + Hướng dẫn sử dụng, nên code đã bỏ `autopost:manage`, `timeline:view`, `dashboard:view` khỏi EDITOR (`backend/src/common/permissions.ts`, `frontend/src/utils/permissions.ts`). `docs/05-rbac.md` §2 vẫn ghi ma trận cũ. Theo rule 00 §1 không tự sửa `docs/` khi đang code — cần user xác nhận rồi cập nhật ma trận + phần mô tả route của EDITOR. |
| 32 | **RBAC EDITOR mới chưa test tay trên UI thật** | Đã xanh test tự động (BE 834, FE 59) nhưng **chưa đăng nhập thử**. Cần `VITE_USE_MOCK=false`, login account role EDITOR: sidebar chỉ còn **Quản lý Ảnh/Video Edit** + **Hướng dẫn sử dụng**; sau đăng nhập rơi thẳng vào `/content` (không phải `/dashboard`); gõ tay `/dashboard`, `/timeline`, `/auto-post`, `/pages`, `/users`, `/settings`, `/queue`, `/failed`, `/audit` ⇒ đều bị đá về `/content` (không lặp redirect); vẫn upload/sửa/duyệt bài bình thường ở `/content`; trang Hướng dẫn không còn khối "Chỉ Admin". Kiểm hồi quy ADMIN và CONTENT vào đúng `/dashboard` như cũ. |
| 18 | **M9 Dashboard chưa smoke UI thật** | Code BE+FE xong (plan 14, BE 542 test xanh), đã smoke API thật đủ case (kỳ mặc định 7 ngày, biên timezone 23:30/00:30, `from>to` và >366 ngày ⇒ 400, EDITOR không có `activeUsers`, CONTENT `scopedToOwnContent: true` + `/health` ⇒ 403). **Chưa bấm tay UI**: `VITE_USE_MOCK=false`, ADMIN vào `/dashboard` — đổi range rồi kiểm thẻ "Chờ duyệt/Đã duyệt" **không đổi** (đúng thiết kế snapshot) trong khi thẻ sản lượng đổi, copy URL sang tab mới giữ nguyên kỳ, khối "Cần chú ý" bấm link nhảy đúng `/failed`·`/timeline`·`/auto-post`·`/pages`·`/queue`, range rỗng job ⇒ tỷ lệ hiện "—" chứ không `NaN%`. Đăng nhập EDITOR/CONTENT kiểm ẩn thẻ "Nhân sự đang hoạt động". Xong thì `git mv plans/14-dashboard.md plans/DONE/`. |
| 33 | ~~Tên metric Insights chưa xác minh~~ ✅ ĐÃ LÀM 2026-08-08 — **và giả định ban đầu SAI** | Đo thật: `post_impressions*`, `post_reach`, `post_views`, `page_impressions*` đã bị Meta **gỡ hẳn** (v19→v23 đều `(#100) not a valid insights metric`, token có đủ `read_insights`). Đang dùng `post_video_views` · `post_fan_reach` · `post_clicks`. **Hệ quả còn lại:** bài **ảnh** không có lượt xem/hiển thị tổng qua API — nếu sau này cần con số như Business Suite thì phải chờ Meta mở metric mới, không sửa được bằng code. Chi tiết plan 25 §8. |
| 36 | **Responsive mobile/tablet chưa bấm tay trên thiết bị thật** | Code xong, lint/build/67 test FE xanh, nhưng **chưa mở bằng điện thoại/tablet thật** lần nào — loại thay đổi này chỉ lộ lỗi khi chạm tay (rule 02 không test component). Cần kiểm: (1) ở ≤991px hiện nút hamburger, mở Drawer menu, bấm 1 mục ⇒ **Drawer tự đóng và điều hướng đúng**; (2) xoay ngang / phóng to cửa sổ qua 992px ⇒ Drawer tự đóng, `Sider` thật hiện ra, **không chồng nhau**; (3) **header dính khi cuộn** (đây là thứ dễ hỏng nhất — xem ghi chú `overflow-x` ở §7) và ở `/timeline` desktop thẻ lọc vẫn dính, mobile thì không; (4) mọi bảng cuộn ngang **trong khung của nó**, cả trang không trượt ngang; (5) Modal "Thêm Ảnh/Video" (2 tab), Drawer sửa bài, ConnectPagesModal vừa màn hình; (6) `/dashboard` các chart không vỡ; (7) đăng nhập/upload/đăng bài chạy y như cũ. |
| 35 | **Thumbnail Google Drive hết hạn ⇒ ảnh 404 trên mọi màn có ảnh** | `content_assets.thumbnail_url` lưu nguyên `thumbnailLink` mà Drive trả lúc upload (`lh3.googleusercontent.com/...`). Link này **hết hạn** sau một thời gian ⇒ ảnh vỡ ở `/content` (Drawer preview) lẫn `/pages/:id/insights`. Đã vá tạm ở màn thống kê: `onError` ẩn hẳn thẻ `<img>` thay vì để icon ảnh hỏng. **Cách sửa gốc** (chưa làm, cần user chốt vì đụng nhiều màn): thêm endpoint proxy `GET /media/:driveFileId/thumbnail` ở backend, stream ảnh xuống bằng credential Drive của hệ thống và cache — khi đó FE chỉ cần trỏ vào URL của chính mình, không phụ thuộc link tạm của Google. Cách rẻ hơn nhưng kém bền: mỗi lần đọc bài thì gọi Drive lấy `thumbnailLink` mới (tốn 1 call/bài). |
| 34 | **M11 (plan 25) chưa smoke UI + chưa nộp App Review `read_insights`** | Code BE+FE xong (BE 880 test, FE 63). **Chưa bấm tay** — chạy §5 của plan 25: (1) `/pages` bấm "Kết nối bằng Facebook" ⇒ màn consent phải **hiện mục "Read Insights"** (nếu không hiện thì scope chưa vào, xem lại `OAUTH_SCOPES`); (2) tên page bấm được, mở đúng Page ở tab mới; (3) nút "Chi tiết" mở `/pages/:id/insights`, **bài mới nhất nằm trên cùng khi vừa mở**; (4) bấm tiêu đề bài ⇒ mở **đúng bài đó**; (5) "Đồng bộ ngay" ⇒ số điền vào, "Cập nhật lần cuối" nhảy; bấm lại ngay ⇒ **429** kèm câu giải thích; (6) đối chiếu số với **Meta Business Suite** cùng bài (lệch nhỏ do trễ là bình thường); (7) xoá 1 bài trên Facebook ⇒ lần đồng bộ sau bài đó có Tag đỏ "Đã bị xoá", **các bài khác vẫn cập nhật**; (8) page kết nối **trước 08/08** phải hiện Tag vàng "Thiếu quyền thống kê" + Alert + nút "Đồng bộ ngay" bị khoá. **Quan trọng:** scope đã cấp là bất biến ⇒ mọi kết nối cũ phải bấm "Kết nối lại", đây là ca dễ tưởng là bug nhất. Còn lại: nộp **App Review** cho `read_insights` (cần Business Verification + screencast quay từ consent tới màn hiện số) nếu mở cho user ngoài team — với page mà tài khoản có role trong Meta app thì Standard Access đã chạy được, **không chặn** việc nghiệm thu. Xong thì `git mv plans/25-page-post-insights.md plans/DONE/`. |

---

## 7. Cạm bẫy đã gặp

> Ghi lại lỗi mất thời gian để session sau không lặp lại.

| Vấn đề | Nguyên nhân & cách xử lý |
|--------|--------------------------|
| **`overflow-x: hidden` để chống tràn ngang sẽ GIẾT `position: sticky` của mọi phần tử con** | Phản xạ đầu tiên khi làm responsive là đặt `overflow-x: hidden` lên `body`/`#root`/khối `Content` cho khỏi trượt ngang. Làm vậy là phần tử đó thành **scroll container**, nên `sticky` bên trong bám vào nó thay vì viewport — mà nó không bao giờ cuộn ⇒ header dính của `AdminLayout` và thẻ lọc dính ở `/timeline` **đứng im, nhìn như tính năng biến mất** và không có lỗi nào báo. Cách đúng: xử lý **nguồn** gây tràn — bảng đặt `scroll={{ x }}` để cuộn trong khung, `img/video/iframe` `max-width: 100%`, `pre/code` `word-break: break-word`, flex item thêm `min-width: 0`. Đã ghi comment cảnh báo ngay tại `frontend/src/index.css` và `AdminLayout.tsx` để không ai vô tình thêm lại. |
| **Graph API dùng chung `code = 100` cho "object không tồn tại" VÀ "tên metric sai"** ⇒ suy ra "bài đã bị xoá" là sai và **mất dữ liệu âm thầm** | Ngày 2026-08-08, adapter insights map `code ∈ {100, 803}` thành `isMissing` ⇒ 3 bài **đang sống** bị ghi `missing_on_fb_at`, mà repository lọc `missing_on_fb_at IS NULL` nên chúng **vĩnh viễn** không được đồng bộ lại — không log, không cảnh báo, chỉ là số liệu đứng im. **Cách xử lý:** chỉ kết luận "đã xoá" khi có `error_subcode = 33`; đọc `message` để nhận diện lỗi cấu hình (`"valid insights metric"`) và dừng cả page thay vì đổ lỗi lên từng bài. **Bài học chung: cờ nào khiến hệ thống NGỪNG VĨNH VIỄN làm một việc thì phải dựa trên tín hiệu hẹp nhất có thể, không dựa vào error code dùng chung.** |
| **Meta cấp bộ metric Insights KHÁC NHAU tuỳ page ⇒ prod hỏng trong khi dev xanh** | Sau khi sửa tên metric, máy dev chạy tốt nhưng prod vẫn báo "không chấp nhận chỉ số đang dùng" — cùng code, cùng `META_GRAPH_API_VERSION`. Nguyên nhân: page "New Page Experience" và page cũ có bộ metric khác nhau ⇒ **mọi danh sách metric hard-code đều sẽ hỏng ở page nào đó**. **Cách xử lý:** adapter **tự dò** — khi Graph chê metric (nó không nói metric nào), gửi 1 request hỏi từng metric một trên 1 bài, ghi nhớ metric hỏng **theo từng page**, loại ra rồi thử lại; hết metric thì bỏ hẳn khối `insights` nhưng vẫn lấy like/comment/share. **Bài học: với API bên thứ ba trả "tính năng khác nhau tuỳ đối tượng", đừng cấu hình cứng — hãy dò một lần rồi nhớ.** |
| **Metric Facebook Insights `post_impressions` đã bị gỡ hẳn — đừng tin tài liệu/trí nhớ** | Cả họ `post_impressions*`, `post_reach`, `post_views`, `post_engaged_users`, `page_impressions*` đều trả `(#100) The value must be a valid insights metric` trên **mọi** version v19→v23, kể cả với Page token hợp lệ có đủ `read_insights`. **Không phải** lỗi quyền, **không phải** pin sai version, **không** sửa được bằng App Review. Chỉ số còn sống (đã đo): `post_video_views` · `post_fan_reach` · `post_clicks` · `post_reactions_by_type_total`. **Cách xử lý: luôn dò tên metric bằng call thật trước khi code**, đừng chép từ tài liệu cũ. Bài **ảnh** hiện không có lượt xem/hiển thị tổng qua API. |
| **`?? 0` ở nhánh `create` của upsert biến "chưa đo" thành "đo được 0"** | Nhánh `update` xử lý `null` đúng nhưng **lần ghi đầu tiên luôn đi vào `create`**, nên cột `NOT NULL DEFAULT 0` nhận `0` thật kèm `fetched_at` ⇒ UI hiện "đã đồng bộ, 0 lượt xem" cho bài chưa hề lấy được số. **Cách xử lý:** cột nào phân biệt "chưa có dữ liệu" với "dữ liệu bằng 0" thì để **NULLABLE, không default**, và bỏ hẳn field khỏi payload khi giá trị `null` — ở **cả** `create` lẫn `update`. Đừng để bất biến quan trọng chỉ nằm ở quy ước code. |
| **Bộ lọc boolean trên query string luôn ra `true`** (`?isAds=false`, `?isActive=false` không lọc được) | `ValidationPipe` bật `transformOptions.enableImplicitConversion` ⇒ class-transformer chạy `Boolean('false') === true` **trước** khi `@Transform` được gọi, nên `@Transform(({ value }) => ...)` nhận sẵn `true` chứ không phải chuỗi gốc. Lỗi âm thầm, unit test cũ không thấy vì test gọi service chứ không qua pipe. **Cách xử lý:** trong `@Transform` đọc giá trị gốc từ `obj[key]` (`@Transform(({ obj }) => toBoolean(obj.isAds))`), và có test dựng DTO **kèm `enableImplicitConversion: true`** để khoá lại — xem `content-assets/__tests__/bulk-content-assets.dto.spec.ts`. Áp dụng cho mọi DTO query có field boolean. |
| **Server smoke cũ không chết ⇒ test nhầm build cũ** | `pkill -f "PORT=3002"` chỉ giết tiến trình npm, `node dist/main` vẫn giữ cổng; instance mới bật lên chết vì `EADDRINUSE` nhưng lệnh chạy nền không báo gì, curl vẫn xanh nên rất dễ tưởng code mới đã chạy. **Cách xử lý:** luôn `lsof -ti:<port> | xargs kill` rồi kiểm lại cổng trống trước khi smoke. |
| FE `vite.config.ts` không nhận key `test` của vitest (TS2769) và xung đột type `Plugin` | Vite 8 dùng rolldown, còn vitest kéo theo bản vite riêng ⇒ hai kiểu `Plugin` khác nhau. Xử lý: **tách cấu hình test ra `vitest.config.ts` riêng** (`defineConfig` từ `vitest/config`), giữ `vite.config.ts` dùng `defineConfig` của `vite`; script test trỏ `--config vitest.config.ts`. |
| Test FE `localStorage.clear is not a function` | jsdom trong môi trường này cấp `localStorage` thiếu method. Xử lý: stub `MemoryStorage` trong `src/test/setup.ts` gán vào `globalThis.localStorage`. |
| `prisma migrate` báo `P1012: datasource url no longer supported` | **Prisma 7** bỏ `url` trong `schema.prisma`. Phải khai ở `prisma.config.ts` (`defineConfig({ datasource: { url: env('DATABASE_URL') } })`) và runtime client dùng `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Cũng bỏ luôn flag `--skip-generate`. |
| Branch coverage kẹt ở 92%, không phủ nổi dòng `constructor(...)` | TypeScript sinh helper `__metadata("design:paramtypes", ...)` chứa ternary không thể chạm tới từ test. Xử lý: `tsconfig.spec.json` đặt `emitDecoratorMetadata: false` **chỉ cho jest**; build thật vẫn giữ để Nest DI hoạt động. |
| `prisma.service.ts` biến mất khỏi báo cáo coverage | Ignore pattern `'/prisma/'` (định loại thư mục `prisma/` gốc) nuốt luôn `src/infra/prisma/`. Phải dùng `'<rootDir>/prisma/'`. **Bài học: pattern coverage phải neo gốc, nếu không sẽ âm thầm miễn trừ code nghiệp vụ.** |
| `npm run start:prod` báo không tìm thấy `dist/main` | `include` trong `tsconfig.json` có `prisma/` nên rootDir bị đẩy lên, ra `dist/src/main.js`. Xử lý: `tsconfig.build.json` khai `include: ["src/**/*"]`. |
| Lỗi TS1272 khi build | Type dùng trong signature của method có decorator phải `import type` riêng (do `isolatedModules` + `emitDecoratorMetadata`). |
| Port 5432/6379/3000 đã bị chiếm | Máy dev có sẵn Postgres, Redis, app khác. Dự án dùng **55432 / 56379 / 3100**. |
| `jwtService.signAsync` báo TS2769 khi truyền `expiresIn: '15m'` | `@nestjs/jwt` v11 nhận `expiresIn` kiểu template `StringValue` của thư viện `ms`, không nhận `string` thường. Xử lý: quy đổi sang **số giây** bằng `common/utils/duration.ts` rồi truyền number. Tiện thể tái dùng luôn cho field `expiresIn` trong response login. |
| Đăng ký guard global làm health check thành 401 | `APP_GUARD` áp cho **mọi** route, kể cả `/api/health` vốn phải public cho Docker healthcheck. Xử lý: `@Public()` decorator + gắn lên `HealthController`. **Nhớ: mỗi lần thêm route công khai mới phải gắn `@Public()`.** |
| `SettingsModule` cần `DriveStorageFactory` (nút "Test kết nối") nhưng `DriveModule` lại import `SettingsModule` (đọc config) ⇒ vòng phụ thuộc NestJS | Tách `SettingsController` ra khỏi `SettingsModule` sang module riêng `SettingsHttpModule` (import cả `SettingsModule` lẫn `MediaModule`). `SettingsModule` chỉ export service, không khai controller. **Bài học: khi 2 module cần lẫn nhau vì 1 phía chỉ cần đọc còn phía kia chỉ cần route, tách controller ra module riêng thay vì cố gộp.** |
| Nút "Xoá" ở `/pages` bấm xong không thấy gì thay đổi | Soft delete dùng chung cột `is_active` với chức năng "tạm dừng", mà list không lọc. **Bài học: soft delete phải có cột dấu xoá riêng (`deleted_at`), không mượn cờ trạng thái nghiệp vụ** — và phải lọc ngay ở repository, không để service/UI tự lọc. |
| `nest build` báo `Property 'deletedAt' does not exist` sau khi sửa schema | Prisma Client sinh ra `backend/generated/prisma` (ADR-010) nên `prisma migrate dev` **không** tự cập nhật type cho tsc trong mọi trường hợp — chạy `npm run prisma:generate` sau khi đổi schema. Lưu ý jest vẫn xanh trong khi tsc đỏ, dễ tưởng là ổn. |
| Nút Test kết nối FB báo "thiếu quyền" trong khi quyền đã đủ | Hai lỗi chồng nhau, mất >1h mới ra: (1) code hỏi `fields=...,tasks` nhưng `tasks` **không tồn tại** trên page node với Page token (chỉ có ở `/me/accounts`) ⇒ Graph trả `(#100)`; (2) Page token của page A đọc page B ⇒ Graph trả `(#10)` = "thiếu quyền", đánh lạc hướng khỏi lỗi thật là **sai Page ID**. Xử lý: gọi `/debug_token` **trước** để biết token loại gì, của page nào, hạn bao lâu — rồi mới gọi page node. **Bài học: adapter external API phải gọi thật ít nhất 1 lần trước khi coi là xong; unit test mock `fetch` chỉ chứng minh code khớp *giả định của mình* về API.** |
| Coverage kẹt vì `jest.Mock` không generic khiến biểu thức trong `expect(...).toEqual({ message: expect.stringContaining(...) })` bị coi là `any` (`no-unsafe-assignment`) | ESLint `recommendedTypeChecked` bắt lỗi này ngay cả trong test. Xử lý: tách thành nhiều `expect(...).toBe(...)`/`toContain(...)` riêng lẻ thay vì gộp vào object literal cho `toEqual`. |
| Chart Dashboard gom **sai ngày** dù đã dùng `AT TIME ZONE 'Asia/Ho_Chi_Minh'` | Prisma map `DateTime` sang `timestamp` **without** time zone, nên `schedule_time AT TIME ZONE 'Asia/Ho_Chi_Minh'` khiến Postgres hiểu giá trị đang lưu **là giờ VN** rồi đổi ngược chiều — bài 23:30 và 00:30 giờ VN (khác ngày) dồn hết vào một cột. Đúng phải là `schedule_time AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'`: lần đầu gắn nhãn UTC cho giá trị naive, lần sau mới đổi sang giờ VN. **Bài học: lỗi này unit test không bao giờ bắt được vì nó nằm trong SQL — mọi câu raw gom theo ngày đều phải smoke với 2 bản ghi cận biên 23:30/00:30.** |
| `ORDER BY "imagePosts" + "videoPosts"` ⇒ 500 `column does not exist` | Postgres cho dùng alias output ở `ORDER BY` **trần**, nhưng không cho dùng trong **biểu thức**. Phải lặp lại nguyên hàm `COUNT(*) FILTER (...)`. |
| Prisma mất type `_count._all` khi gộp `groupBy` + `count` vào cùng một `$transaction([...])` | Mảng `$transaction` làm suy kiểu thành union ⇒ `_count` thành union `true / 0 / object`. Xử lý: dùng `Promise.all` cho trường hợp trộn nhiều loại query; `$transaction` chỉ giữ khi các query cùng loại. `groupBy` cũng bắt buộc có `orderBy`. |
| Test `MediaCacheService` xoá file hết hạn không bao giờ xanh với `jest.useFakeTimers()` (2026-08-03) | Eviction ban đầu dùng `setTimeout` rồi `await rm(...)` bên trong callback. `jest.advanceTimersByTimeAsync` đẩy được đồng hồ nhưng **không chờ thao tác `fs` thật** trong callback ⇒ assert chạy trước khi file kịp xoá. Xử lý gốc: bỏ hẳn `setTimeout`, đổi sang `@Cron` + hàm `sweep(now)` nhận thời điểm — test gọi thẳng `sweep()` và `await` được. **Bài học: khi fake timer làm test khó xanh, thường là thiết kế đang trộn "khi nào chạy" với "chạy cái gì" — tách ra theo mẫu `AutoPostSchedulerService.tick(now)` thay vì vật lộn với timer.** |
| Thêm biến env có default nhưng `.env.example` ship giá trị RỖNG ⇒ app crash lúc boot (2026-08-03) | `MEDIA_CACHE_DIR=` (rỗng) đi vào `@IsNotEmpty()` là lỗi validate ngay. Viết `@Transform` trả `undefined` **vẫn không cứu được**: `plainToInstance` chạy với `exposeDefaultValues: true` gán `undefined` đè lên default của class. Transform phải trả **thẳng giá trị mặc định**. **Bài học: mỗi key mới ship rỗng trong `.env.example` phải có 1 test `validateEnv({ KEY: '' })`, nếu không lỗi chỉ lộ ra lúc deploy trên máy vừa copy file mẫu.** |
| Upload video 66MB trên production báo `413 Request Entity Too Large` (2026-08-03) | **Không phải lỗi backend.** Backend vượt giới hạn thì ném `BadRequestException` **400** kèm message tiếng Việt (`media.service.ts`), còn multer `memoryStorage()` không đặt `limits` nên không bao giờ trả 413. 413 là của **Nginx**, mặc định `client_max_body_size 1m` — server block do certbot sinh ra trên VPS không có dòng này. Xử lý: thêm `client_max_body_size` + `proxy_send/read_timeout 600s` + `proxy_request_buffering off` vào server block, `nginx -T \| grep client_max_body_size` để xác nhận config **đang chạy**. **Bài học: giới hạn upload nằm ở 3 tầng độc lập — Nginx, `MAX_UPLOAD_MB` (chỉ là fallback), và giá trị `maxUploadMb` lưu trong `app_settings` (tầng này thắng, sửa ở UI /settings). Đổi 1 tầng mà quên 2 tầng kia thì vẫn chặn.** |
| Nới `client_max_body_size` xong, upload file lớn vẫn chết — lần này là `504`/`408` (2026-08-03) | **Node có timeout riêng mà Nginx không cứu được:** `server.requestTimeout` mặc định **300_000ms** = tổng thời gian nhận trọn 1 request **kể cả body**. Với `proxy_request_buffering off`, backend nhận file theo đúng tốc độ mạng người upload ⇒ video 300MB từ đường <8 Mbps vượt 300s, **Node trả 408 và huỷ request** dù `proxy_read_timeout` để 600s. Xử lý: `common/http/server-timeouts.ts` + `HTTP_REQUEST_TIMEOUT_MS` (mặc định 900_000), gọi trong `main.ts` **trước** `app.listen()`. **Bài học: timeout upload có 4 tầng — Nginx, Node `requestTimeout`, `headersTimeout`, và CDN nếu có. Sửa mỗi Nginx là sửa được đúng 1/4.** Lưu ý phụ: Node quét connection quá hạn theo `connectionsCheckingInterval` (mặc định 30s) nên test hành vi phải hạ giá trị này xuống mới quan sát được. |
| Đổi `TOKEN_ENCRYPTION_KEY` ⇒ UI báo *"Không giải mã được dữ liệu — sai khoá mã hoá..."* ở nhiều màn khác nhau (2026-07-28) | Mọi secret trong `app_settings`/`facebook_pages` mã hoá bằng khoá cũ thành rác. Commit `ee4a062` mới vá **một** đường (Drive settings), nên lỗi lại nổi ở `/pages` → nút "Kết nối lại" (đường `getFacebookAppCredentials` giải mã `appSecretEnc`). Xử lý gốc: thêm `CryptoService.tryDecrypt()` (null thay vì ném lỗi) + `SettingsService.decryptSecret(enc, label, howToFix)` ném **400 nói rõ phải nhập lại secret nào ở đâu**; áp cho cả 4 secret (SA JSON, Drive client secret, Drive refresh token, Meta app secret) và `FacebookPagesService.getDecryptedToken`. **Bài học: khi vá lỗi do đổi khoá mã hoá, phải quét `grep -rn "\.decrypt("` và xử lý toàn bộ call site — vá lẻ từng chỗ thì lỗi chỉ đổi màn hình.** |
| Upload Drive báo `invalid_grant`, UI vẫn hiện "đã kết nối" (2026-08-03) | `invalid_grant` không phải lỗi Drive API mà là lỗi bước đổi **refresh token → access token**, nên không có `code`/`reason` như lỗi Drive thường ⇒ rơi xuống nhánh cuối `mapDriveError` thành **500** với message thô. Nguyên nhân gốc hay gặp nhất: OAuth consent screen còn ở chế độ **Testing** ⇒ Google thu hồi refresh token sau **7 ngày** (phải Publish app). Xử lý: `DriveAuthExpiredError` (502, message hướng dẫn kết nối lại) nhận diện qua `response.data.error` **lẫn** `message`; `DriveStorageFactory` bọc storage OAuth2 để khi gặp lỗi này thì gọi `SettingsService.clearOauthTokens()` (xoá `oauthRefreshTokenEnc` + email, actor = null) và bỏ client đang cache. **Bài học: token chết mà không xoá thì `oauthConnected` vẫn `true` và client hỏng còn nằm trong cache cho tới khi restart — lỗi xác thực phải dọn state, không chỉ đổi message.** |
| Tên file tiếng Việt upload lên Drive bị lỗi font (mojibake) (2026-08-05) | Busboy (multer) decode header multipart theo **`latin1` mặc định**, trong khi trình duyệt gửi tên file **UTF-8** ⇒ `file.originalname` đã sai byte-for-byte ngay khi vào controller — Drive adapter chỉ forward nguyên chuỗi hỏng, không phải chỗ gây lỗi. Xử lý: `Buffer.from(file.originalname, 'latin1').toString('utf8')` ngay tại nơi đọc `originalname` trong controller. **Bài học: multer không có option bật UTF-8 cho `originalname` — phải tự decode lại thủ công ở nơi tiêu thụ, không phải trong cấu hình `FileInterceptor`.** |
| Video ~180MB đăng bài báo `502` với log `code=undefined subcode=undefined trace=undefined message=undefined` (2026-08-05) | Log này nghĩa là request **đã tới được** `graph-video.facebook.com` và nhận response `!ok`, nhưng body không phải JSON hợp lệ (`response.json()` throw, bị nuốt thành `null`) ⇒ `mapFacebookError` không đọc được `code/message` nên in ra toàn `undefined`. **Không phải** lỗi Nginx/Node timeout (nếu là Nginx timeout thì log app còn không thấy `HttpExceptionFilter` xử lý). Nguyên nhân thật: code cũ đẩy **toàn bộ video trong 1 POST multipart** — endpoint đồng bộ này của Meta không ổn định với file lớn, hạ tầng Facebook tự cắt kết nối giữa chừng. Xử lý gốc (plan 20): chuyển sang **Facebook Resumable Upload API** (start/transfer/finish theo chunk). **Bài học: `code=undefined` ở log lỗi Graph không có nghĩa "không có lỗi" — nghĩa là body lỗi không đúng shape kỳ vọng, thường vì response đến từ một tầng trung gian (edge/proxy của chính Facebook) chứ không phải Graph API thật.** |
| `npm run build` chạy qua Bash tool của Claude "thành công" nhưng PM2 (`nest-api`) vẫn báo `Cannot find module dist/main.js`, crash-loop 33 lần (2026-08-05) | Bash tool của Claude chạy **sandbox cô lập** khi không có cờ `dangerouslyDisableSandbox` — lệnh `npm run build` báo exit code 0 và không có lỗi, nhưng `dist/` được ghi vào bản sao cô lập, **không** ghi xuống ổ đĩa thật mà tiến trình PM2 đang dùng. Edit/Write tool thì ghi thật (source code sửa đúng), chỉ riêng kết quả các lệnh Bash (build output, v.v.) mới đáng ngờ. Xử lý: user tự chạy `npm run build` + `pm2 restart nest-api` trên máy thật. **Bài học: sau khi sửa code, đừng tin `npm run build` chạy qua Bash tool là đã cập nhật tiến trình đang chạy thật — luôn nhờ user (hoặc dùng `dangerouslyDisableSandbox: true` nếu được phép) build lại trên chính máy host, đặc biệt trước khi yêu cầu user test tay một tiến trình PM2/service đang chạy nền.** |
