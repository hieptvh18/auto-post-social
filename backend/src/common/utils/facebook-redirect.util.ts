/**
 * Redirect URI của luồng "Đăng nhập bằng Facebook" (plan 15).
 *
 * Dùng chung giữa `SettingsService` (hiện cho user copy vào Meta dashboard) và
 * `FacebookConnectService` (gửi kèm khi mở dialog và khi đổi code). Meta so khớp
 * **từng ký tự** giữa hai lần gọi — lệch một dấu `/` là hỏng cả luồng, nên chỉ
 * được có đúng một nơi dựng chuỗi này.
 */
export function buildFacebookRedirectUri(
  appBaseUrl: string,
  apiPrefix: string,
): string {
  const base = appBaseUrl.replace(/\/+$/, '');
  const prefix = apiPrefix.replace(/^\/+|\/+$/g, '');
  return `${base}/${prefix}/pages/connect/callback`;
}
