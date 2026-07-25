import { Select } from 'antd';
import { useState } from 'react';
import { useCategorySuggestions } from '../../hooks/useContentAssets';
import { mergeCategoryOptions, normalizeCategory } from '../../utils/categories';

interface CategorySelectProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Tắt gọi API gợi ý (bản mock chỉ dùng danh sách mồi). */
  suggestionsEnabled?: boolean;
}

/**
 * Ô "Dạng (danh mục)" chọn-1: gõ để lọc danh mục đã có, gõ tên chưa từng có thì
 * dòng đầu dropdown là "＋ Thêm ..." — chọn phát là dùng luôn, không cần trang
 * quản lý danh mục riêng (cùng cơ chế với `HashtagInput`).
 */
export function CategorySelect({
  value,
  onChange,
  placeholder = 'Chọn hoặc gõ tên dạng bài mới',
  disabled,
  suggestionsEnabled = true,
}: CategorySelectProps) {
  const { data } = useCategorySuggestions({ enabled: suggestionsEnabled });
  const [search, setSearch] = useState('');

  const known = mergeCategoryOptions(data, [value]);
  const typed = normalizeCategory(search);
  const isNew =
    typed !== null &&
    !known.some((item) => item.toLowerCase() === typed.toLowerCase());

  const options = [
    ...(isNew ? [{ value: typed, label: `＋ Thêm "${typed}"` }] : []),
    ...known.map((item) => ({ value: item, label: item })),
  ];

  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      value={value === '' ? undefined : value}
      placeholder={placeholder}
      options={options}
      searchValue={search}
      onSearch={setSearch}
      // Giữ chuỗi vừa gõ lại sau khi chọn thì dropdown lần sau bị lọc sẵn — xoá đi.
      onSelect={() => setSearch('')}
      onBlur={() => setSearch('')}
      onChange={(next: string | undefined) => onChange?.(next ?? '')}
      filterOption={(input, option) => {
        const needle = normalizeCategory(input);
        if (needle === null || option === undefined) return true;
        return option.value.toLowerCase().includes(needle.toLowerCase());
      }}
    />
  );
}
