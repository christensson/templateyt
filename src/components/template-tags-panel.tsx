import AddIcon from "@jetbrains/icons/add-12px";
import TagIcon from "@jetbrains/icons/tag-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useMemo } from "react";
import type { TagInfo } from "../../@types/project-info";
import TagSelect from "./tag-select";

interface TemplateTagsPanelProps {
  title: string;
  tags: Array<string>;
  onTagsChange: (tags: Array<string>) => void;
  projectTags: Array<TagInfo>;
  tagsLoading: boolean;
  onTagsFilter: (filter: string) => void;
  onTagsLoadMore: () => void;
  hint?: string;
}

// Editable list of the tags a template (or child template) adds to the ticket.
const TemplateTagsPanel: React.FunctionComponent<TemplateTagsPanelProps> = ({
  title,
  tags,
  onTagsChange,
  projectTags,
  tagsLoading,
  onTagsFilter,
  onTagsLoadMore,
  hint,
}) => {
  const selectableTags = useMemo(
    () => projectTags.filter((tag) => !tags.includes(tag.name)),
    [projectTags, tags],
  );

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        {title}
      </Text>
      {tags.map((tag) => (
        <div key={`template-tag-${tag}`} className="template-replacement-row">
          <Icon glyph={TagIcon}/>
          <Text size={Text.Size.M}>{tag}</Text>
          <Button
            onClick={() => onTagsChange(tags.filter((current) => current !== tag))}
            icon={TrashIcon}
            title="Remove tag"
          />
        </div>
      ))}
      <div className="template-add-row">
        <Icon glyph={AddIcon} className="template-add-row-icon"/>
        {/* Remounted per added tag so the select shows its placeholder again. */}
        <TagSelect
          key={`add-tag-${tags.length}`}
          tags={selectableTags}
          tagsLoading={tagsLoading}
          onFilter={onTagsFilter}
          onLoadMore={onTagsLoadMore}
          selected={null}
          label="Add tag"
          onSelect={(tagName) => {
            if (tagName !== null && !tags.includes(tagName)) {
              onTagsChange([...tags, tagName]);
            }
          }}
        />
      </div>
      {hint && (
        <Text size={Text.Size.S} info>
          {hint}
        </Text>
      )}
    </div>
  );
};

export default TemplateTagsPanel;
