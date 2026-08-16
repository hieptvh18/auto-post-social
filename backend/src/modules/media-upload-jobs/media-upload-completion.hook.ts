import type { MediaUploadJobRecord } from './media-upload-jobs.repository';

/**
 * Móc báo kết quả job upload cho **người đặt hàng** job đó (plan 29 §3.3 cách a).
 *
 * **Vì sao là hook chứ không phải import thẳng:** worker `media-upload` tuyệt đối
 * không được biết module `reup` tồn tại (QĐ-6 §3) — import ngược lại là vòng phụ
 * thuộc, và làm reup thôi là "tuỳ chọn" trên giấy. Ở đây media-upload chỉ khai
 * **hợp đồng của chính nó**; ai quan tâm thì tự đăng ký.
 *
 * **Không đăng ký ⇒ inject ra `null` ⇒ luồng upload tay chạy y hệt như trước.**
 * Đó là điều kiện Done của plan 29 (§6 R1) và có test hồi quy riêng.
 *
 * Lỗi ném ra từ hook **không được** làm hỏng job upload: job đã thành công thật,
 * chỉ là bên đặt hàng chưa ghi nhận được. `MediaUploadJobsService` nuốt lỗi này
 * và chỉ log lại.
 */
export const MEDIA_UPLOAD_COMPLETION_HOOK = Symbol(
  'MEDIA_UPLOAD_COMPLETION_HOOK',
);

export interface MediaUploadCompletionHook {
  onJobSucceeded(
    job: MediaUploadJobRecord,
    contentAssetId: string,
  ): Promise<void>;

  /** `isLastAttempt = false` ⇒ job còn lượt retry, chưa phải hỏng hẳn. */
  onJobFailed(
    job: MediaUploadJobRecord,
    message: string,
    isLastAttempt: boolean,
  ): Promise<void>;
}
