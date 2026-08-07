/**
 * Bóc `fileId` ra khỏi một dòng người dùng dán vào (plan 24).
 *
 * Hàm **thuần**, không gọi mạng — mọi việc xác minh quyền/loại file do
 * `DriveImportsService.preview()` làm sau. Nhiều dạng URL và rất dễ sai nên
 * đây là vùng **bắt buộc test** (rule 02).
 */

/** Ký tự hợp lệ trong id của Drive. */
const ID_CHARS = '[A-Za-z0-9_-]';

/**
 * Thứ tự quan trọng: mẫu folder phải đứng **trước** mẫu `/d/<id>` chung, vì
 * `/drive/folders/<id>` và `/file/d/<id>` cùng tồn tại trên một host.
 */
const PATTERNS: { kind: DriveLinkKind; regex: RegExp }[] = [
  // https://drive.google.com/drive/folders/<id>  ·  .../drive/u/0/folders/<id>
  { kind: 'folder', regex: new RegExp(`/folders/(${ID_CHARS}+)`) },
  // https://drive.google.com/file/d/<id>/view  ·  https://docs.google.com/document/d/<id>/edit
  { kind: 'file', regex: new RegExp(`/d/(${ID_CHARS}+)`) },
  // https://drive.google.com/open?id=<id>  ·  /uc?id=<id>  ·  usercontent /download?id=<id>
  { kind: 'file', regex: new RegExp(`[?&]id=(${ID_CHARS}+)`) },
];

/** Dán thẳng id (không phải URL): chuỗi dài, không dấu cách, không dấu `/`. */
const BARE_ID = new RegExp(`^${ID_CHARS}{20,}$`);

export type DriveLinkKind = 'file' | 'folder';

export interface ParsedDriveLink {
  kind: DriveLinkKind;
  id: string;
}

/** `null` = không nhận ra là link/ID Google Drive. */
export function parseDriveLink(raw: string): ParsedDriveLink | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  if (BARE_ID.test(trimmed)) return { kind: 'file', id: trimmed };

  // Chỉ nhận host của Google — link Dropbox/OneDrive cũng có dạng `/d/<id>`.
  if (!/^https?:\/\/[^/]*\bgoogle\.com\//i.test(trimmed)) return null;

  for (const { kind, regex } of PATTERNS) {
    const matched = regex.exec(trimmed);
    if (matched !== null) return { kind, id: matched[1] };
  }
  return null;
}

/** Tên file Drive -> tiêu đề bài: bỏ đuôi mở rộng, gọn khoảng trắng. */
export function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[A-Za-z0-9]{1,10}$/, '');
  const cleaned = withoutExt.trim().replace(/\s+/g, ' ');
  return cleaned === '' ? filename.trim() : cleaned;
}
