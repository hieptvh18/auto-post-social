import { Select, Typography } from 'antd';
import { useHashtagSuggestions } from '../../hooks/useContentAssets';
import { formatHashtags, normalizeHashtag, parseHashtags } from '../../utils/hashtags';

const { Text } = Typography;

interface HashtagInputProps {
  /** Chuỗi hashtag như lưu trong DB (`'#tưthế #vănphòng'`). */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Tắt gọi API gợi ý (dùng cho bản mock). */
  suggestionsEnabled?: boolean;
}

/**
 * Ô nhập hashtag kiểu "quick update": vừa gõ vừa gợi ý tag đã dùng trong kho,
 * tag chưa có thì gõ xong Enter (hoặc dấu cách/phẩy) là thành tag mới ngay —
 * không cần popup hay trang quản lý hashtag riêng.
 *
 * Bên ngoài vẫn thấy một **chuỗi** đúng như DB lưu; việc quy đổi chuỗi ↔ mảng
 * gói gọn ở đây nên `Form.Item name="hashtags"` dùng được thẳng.
 */
export function HashtagInput({
  value,
  onChange,
  placeholder = 'Gõ hashtag rồi Enter — ví dụ #tưthế',
  suggestionsEnabled = true,
}: HashtagInputProps) {
  const { data: suggestions } = useHashtagSuggestions({
    enabled: suggestionsEnabled,
  });

  const tags = parseHashtags(value);

  // Tag đang có trên bài mà kho chưa từng thấy vẫn phải nằm trong options,
  // nếu không antd sẽ không hiển thị nhãn của nó.
  const suggestionTags = (suggestions ?? []).map((s) => ({
    value: s.tag,
    label: `${s.tag} · ${s.count} bài`,
  }));
  const knownValues = new Set(
    suggestionTags.map((option) => option.value.toLowerCase()),
  );
  const options = [
    ...tags
      .filter((tag) => !knownValues.has(tag.toLowerCase()))
      .map((tag) => ({ value: tag, label: `${tag} · mới` })),
    ...suggestionTags,
  ];

  return (
    <>
      <Select
        mode="tags"
        value={tags}
        options={options}
        placeholder={placeholder}
        tokenSeparators={[' ', ',']}
        style={{ width: '100%' }}
        // Người dùng gõ 'tuthe' ⇒ lưu '#tuthe'; gõ trùng ⇒ bị loại ở parseHashtags.
        onChange={(next: string[]) => onChange?.(formatHashtags(next))}
        filterOption={(input, option) => {
          const needle = normalizeHashtag(input);
          if (needle === null || option === undefined) return true;
          return option.value.toLowerCase().includes(needle.slice(1).toLowerCase());
        }}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        Chọn hashtag có sẵn hoặc gõ mới rồi Enter — dấu # tự thêm.
      </Text>
    </>
  );
}
