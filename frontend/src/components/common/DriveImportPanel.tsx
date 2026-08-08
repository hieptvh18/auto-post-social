import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Space,
  Spin,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { ApiError } from '../../api/client';
import {
  useCreateDriveImport,
  useInspectDriveLinks,
} from '../../hooks/useDriveImports';
import type { DriveImportInspectItem, DriveImportSkipped } from '../../types';
import { MAX_IMAGES_PER_CONTENT_ASSET } from '../../utils/constants';

const { Text } = Typography;

/** Chờ người dùng ngừng gõ/dán rồi mới hỏi Drive — tránh gọi theo từng phím. */
const INSPECT_DEBOUNCE_MS = 800;

interface Props {
  /** Đã tạo xong N job — trang cha đóng modal và hiện dòng "mờ". */
  onCreated: (jobCount: number) => void;
  onCancel: () => void;
}

/**
 * Tab "Nhập từ link Google Drive" (plan 24).
 *
 * Cố ý chỉ có **ba thứ để nhập**: danh sách link, checkbox gộp ảnh (yêu cầu user
 * 2026-08-07) và checkbox "Copy data" (yêu cầu user 2026-08-08 — mặc định tắt để
 * chỉ lưu link, không tốn dung lượng Drive). Mọi thứ còn lại backend tự đặt — tiêu đề = tên file, bài vào
 * **Chờ duyệt** với caption tạm `-`; người dùng điền caption/danh mục lúc duyệt.
 *
 * Sau khi ngừng gõ, panel **dò ngầm** loại file của từng link để biết có cho tick
 * "gộp ảnh" không: Facebook chỉ ghép được **ảnh** (`attached_media` chỉ nhận
 * photo id) — không gộp nhiều video, cũng không trộn ảnh–video vào một bài feed.
 */
export function DriveImportPanel({ onCreated, onCancel }: Props) {
  const [rawLinks, setRawLinks] = useState('');
  const [mergeImages, setMergeImages] = useState(false);
  // Mặc định KHÔNG copy (yêu cầu user 2026-08-08): chỉ lưu link để Drive đang
  // cấu hình không phình dung lượng.
  const [copyData, setCopyData] = useState(false);
  const [skipped, setSkipped] = useState<DriveImportSkipped[]>([]);
  const [inspected, setInspected] = useState<DriveImportInspectItem[] | null>(
    null,
  );

  const inspectMutation = useInspectDriveLinks();
  const createMutation = useCreateDriveImport();
  const { mutateAsync: inspect } = inspectMutation;

  const links = useMemo(
    () =>
      rawLinks
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    [rawLinks],
  );
  // Chuỗi ổn định để effect chỉ chạy lại khi tập link ĐỔI, không phải mỗi render.
  const linksKey = links.join('\n');

  useEffect(() => {
    if (linksKey === '') {
      setInspected(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void inspect(linksKey.split('\n'))
        .then((result) => {
          if (!cancelled) setInspected(result.items);
        })
        .catch(() => {
          // Dò hỏng (quá trần link, mất mạng…) ⇒ coi như chưa biết gì: không
          // khoá nhầm checkbox, backend vẫn chặn lại lúc submit.
          if (!cancelled) setInspected(null);
        });
    }, INSPECT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [linksKey, inspect]);

  const usable = useMemo(
    () => (inspected ?? []).filter((item) => item.ok),
    [inspected],
  );
  const videoCount = usable.filter((item) => item.mediaType === 'video').length;
  const imageCount = usable.filter((item) => item.mediaType === 'image').length;

  /** Chỉ cho gộp khi đã dò xong VÀ mọi dòng dùng được đều là ảnh. */
  const mergeBlockedReason: string | null =
    inspected === null
      ? 'Đang kiểm tra loại file của các link…'
      : usable.length === 0
        ? 'Chưa có link nào dùng được'
        : videoCount === usable.length
          ? 'Danh sách chỉ có video — Facebook không ghép nhiều video vào một bài'
          : videoCount > 0
            ? `Có ${videoCount} video trong danh sách — Facebook không trộn ảnh và video vào một bài`
            : imageCount > MAX_IMAGES_PER_CONTENT_ASSET
              ? `Một bài chỉ ghép được tối đa ${MAX_IMAGES_PER_CONTENT_ASSET} ảnh, đang có ${imageCount}`
              : null;

  // Đang tick mà danh sách đổi thành không gộp được nữa ⇒ bỏ tick, đừng để gửi
  // đi một yêu cầu chắc chắn bị backend từ chối.
  useEffect(() => {
    if (mergeBlockedReason !== null) setMergeImages(false);
  }, [mergeBlockedReason]);

  const handleImport = async (): Promise<void> => {
    setSkipped([]);
    try {
      const result = await createMutation.mutateAsync({
        links,
        mergeImagesIntoOnePost: mergeImages,
        copyData,
      });

      if (result.duplicates.length > 0) {
        message.warning(
          `${result.duplicates.length} file đã từng nhập trước đó (vẫn nhập lại theo yêu cầu)`,
        );
      }
      if (result.skipped.length > 0) {
        // Còn dòng hỏng ⇒ GIỮ modal để người dùng sửa link rồi dán lại; chỉ giữ
        // lại đúng những dòng chưa nhập được, dòng đã nhập thì bỏ khỏi ô.
        setSkipped(result.skipped);
        setRawLinks(result.skipped.map((item) => item.link).join('\n'));
        message.warning(
          `Đã nhập ${result.jobs.length} bài, bỏ qua ${result.skipped.length} dòng`,
        );
        return;
      }

      onCreated(result.jobs.length);
    } catch (err) {
      message.error(
        err instanceof ApiError ? err.message : 'Nhập từ Google Drive thất bại',
      );
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="File phải được chia sẻ cho tài khoản Drive của tool, hoặc để chế độ “Bất kỳ ai có đường liên kết”."
        description="Mỗi dòng là một bài riêng, tiêu đề lấy theo tên file. Bài vào Chờ duyệt — điền caption và danh mục khi duyệt."
      />

      <div>
        <Text strong>Dán link, mỗi dòng một file</Text>
        <Input.TextArea
          rows={6}
          value={rawLinks}
          onChange={(e) => setRawLinks(e.target.value)}
          placeholder={
            'https://drive.google.com/file/d/.../view\nhttps://drive.google.com/file/d/.../view'
          }
          style={{ marginTop: 4 }}
        />
        <Space size={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {links.length > 0 ? `${links.length} link` : 'Chưa có link nào'}
          </Text>
          {inspectMutation.isPending && <Spin size="small" />}
          {inspected !== null && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              · {imageCount} ảnh · {videoCount} video
              {usable.length < inspected.length
                ? ` · ${inspected.length - usable.length} dòng lỗi`
                : ''}
            </Text>
          )}
        </Space>
      </div>

      <div>
        <Tooltip title={mergeBlockedReason ?? ''}>
          {/* span bọc ngoài: antd Tooltip không bắt được hover trên input disabled */}
          <span>
            <Checkbox
              checked={mergeImages}
              disabled={mergeBlockedReason !== null}
              onChange={(e) => setMergeImages(e.target.checked)}
            >
              Gộp tất cả ảnh đã chọn thành 1 bài nhiều ảnh
            </Checkbox>
          </span>
        </Tooltip>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {mergeBlockedReason ??
              `Bật ⇒ gom ${imageCount} ảnh thành 1 bài. Bỏ trống ⇒ mỗi dòng một bài riêng.`}
          </Text>
        </div>
      </div>

      <div>
        <Checkbox
          checked={copyData}
          onChange={(e) => setCopyData(e.target.checked)}
        >
          Copy data về Drive của tool
        </Checkbox>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {copyData
              ? 'Bật ⇒ tool sao chép file về folder Drive đang cấu hình (tốn dung lượng), bài không phụ thuộc file gốc nữa.'
              : 'Đang tắt ⇒ chỉ lưu link gốc, không tốn dung lượng Drive. Lưu ý: file gốc bị xoá hoặc bỏ chia sẻ thì bài sẽ không đăng được.'}
          </Text>
        </div>
      </div>

      {skipped.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${skipped.length} dòng chưa nhập được — đã giữ lại trong ô trên để bạn sửa`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {skipped.map((item) => (
                <li key={item.line}>
                  <Text style={{ fontSize: 12 }}>
                    Dòng {item.line}: {item.message}
                  </Text>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
        <Button onClick={onCancel} disabled={createMutation.isPending}>
          Huỷ
        </Button>
        <Button
          type="primary"
          disabled={links.length === 0}
          loading={createMutation.isPending}
          onClick={() => void handleImport()}
        >
          Nhập{' '}
          {links.length > 0
            ? mergeImages
              ? `${imageCount} ảnh thành 1 bài`
              : `${links.length} bài`
            : ''}
        </Button>
      </Space>
    </Space>
  );
}
