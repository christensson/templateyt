import SearchIcon from "@jetbrains/icons/search";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import React, { useMemo } from "react";
import type { TagInfo } from "../../@types/project-info";

interface TagSelectProps {
  tags: Array<TagInfo>;
  tagsLoading?: boolean;
  // Server-side filtering and paging of the tag list, see fetchTags in TemplateEdit.
  onFilter?: (filter: string) => void;
  onLoadMore?: () => void;
  selected: string | null;
  onSelect: (tagName: string | null) => void;
  disabled?: boolean;
  label?: string;
}

// Inline, filterable tag select that loads more tags when scrolled to the end.
const TagSelect: React.FunctionComponent<TagSelectProps> = ({
  tags,
  tagsLoading,
  onFilter,
  onLoadMore,
  selected,
  onSelect,
  disabled,
  label = "...",
}) => {
  const items = useMemo(() => tags.map((tag) => ({ key: tag.name, label: tag.name })), [tags]);
  const selectedItem = useMemo(
    () => (selected === null ? null : items.find((item) => item.key === selected) || null),
    [items, selected],
  );
  return (
    <Select
      clear
      filter
      loading={tagsLoading}
      disabled={disabled}
      label={label}
      filterIcon={SearchIcon}
      type={Select.Type.INLINE}
      size={Select.Size.AUTO}
      data={items}
      onFilter={onFilter}
      onLoadMore={onLoadMore}
      onSelect={(item: SelectItem | null) => onSelect(item ? String(item.key) : null)}
      selected={selectedItem}
    />
  );
};

export default TagSelect;
