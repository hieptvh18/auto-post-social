/** Tên queue BullMQ đăng bài Facebook (docs/08 §1). */
export const PUBLISH_FACEBOOK_QUEUE = 'publish-facebook';

/** Số lần thử tối đa cho một publish job (docs/08 §5). */
export const PUBLISH_MAX_ATTEMPTS = 3;

/**
 * Giữ job hỏng trong Redis bao lâu. Nguồn sự thật của job vẫn là bảng
 * `publish_jobs` trong Postgres — bản trong Redis chỉ để điều tra, nên hết hạn
 * là xoá được. Trước đây `removeOnFail: false` khiến chúng tồn tại vĩnh viễn.
 */
export const FAILED_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;

/** Payload job — worker tự load ngữ cảnh từ DB, không nhét content/token vào Redis. */
export interface PublishFacebookJobData {
  publishJobId: string;
}
