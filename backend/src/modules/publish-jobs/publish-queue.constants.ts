/** Tên queue BullMQ đăng bài Facebook (docs/08 §1). */
export const PUBLISH_FACEBOOK_QUEUE = 'publish-facebook';

/** Số lần thử tối đa cho một publish job (docs/08 §5). */
export const PUBLISH_MAX_ATTEMPTS = 3;

/** Payload job — worker tự load ngữ cảnh từ DB, không nhét content/token vào Redis. */
export interface PublishFacebookJobData {
  publishJobId: string;
}
