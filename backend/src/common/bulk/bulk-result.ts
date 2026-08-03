/**
 * Khuôn chung cho mọi thao tác hàng loạt (plan 19 §2.3).
 *
 * Nguyên tắc: **không all-or-nothing**. Làm được record nào chạy record đó, record
 * hỏng ghi lý do vào `failed` — chọn 50 bài mà 1 bài vướng thì huỷ cả lô là không
 * dùng được. HTTP vẫn 200 kể cả `failed` không rỗng: đây là kết quả hỗn hợp, không
 * phải request sai.
 */

/** Một record bị bỏ qua, kèm lý do đọc được cho người dùng cuối. */
export interface BulkItemFailure {
  id: string;
  /** Nhãn nhận ra record trên UI (title/tên) — id trần thì người dùng không biết là bài nào. */
  label: string;
  reason: string;
}

export interface BulkResult {
  requested: number;
  /** Id đã xử lý xong. */
  succeeded: string[];
  failed: BulkItemFailure[];
}

/**
 * Chạy `handler` **tuần tự** cho từng id và gom kết quả.
 *
 * Tuần tự chứ không `Promise.all`: một lô xoá 100 bài là 100 lần gọi Google Drive
 * (có rate limit), và thứ tự lý do phải ổn định thì test mới bám được.
 *
 * `handler` ném lỗi ⇒ record đó vào `failed` với `message` của lỗi. Lỗi lạ (không
 * phải `Error`) vẫn không làm sập cả lô.
 */
export async function runBulkSequential(
  ids: string[],
  handler: (id: string) => Promise<void>,
): Promise<BulkResult> {
  const succeeded: string[] = [];
  const failed: BulkItemFailure[] = [];

  for (const id of ids) {
    try {
      await handler(id);
      succeeded.push(id);
    } catch (error) {
      failed.push({
        id,
        label: labelOf(error, id),
        reason: reasonOf(error),
      });
    }
  }

  return { requested: ids.length, succeeded, failed };
}

/**
 * Lỗi mang theo nhãn của record (tiêu đề bài...) để UI liệt kê được cái nào hỏng.
 * Ném từ trong `handler`; ngoài ra mọi exception thường của Nest vẫn dùng được.
 */
export class BulkItemError extends Error {
  constructor(
    readonly label: string,
    message: string,
  ) {
    super(message);
    this.name = 'BulkItemError';
  }
}

function labelOf(error: unknown, fallback: string): string {
  return error instanceof BulkItemError ? error.label : fallback;
}

function reasonOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Lỗi không xác định';
}
