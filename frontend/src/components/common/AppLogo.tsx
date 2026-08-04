import { APP_NAME } from '../../utils/constants';

interface AppLogoProps {
  /** Cạnh vuông của logo (px). */
  size?: number;
}

/**
 * Logo dùng chung cho sidebar, trang đăng nhập và các trang pháp lý công khai.
 * File nằm ở `public/` nên tham chiếu bằng đường dẫn tuyệt đối — không import qua
 * bundler, tránh việc đổi ảnh phải build lại toàn bộ.
 */
export function AppLogo({ size = 32 }: AppLogoProps) {
  return (
    <img
      src="/auto-tool-logo.png"
      alt={APP_NAME}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  );
}
