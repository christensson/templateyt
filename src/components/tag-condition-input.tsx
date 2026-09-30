import ConditionIcon from "@jetbrains/icons/buildType-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback } from "react";
import type { TagInfo } from "../../@types/project-info";
import type { TagActionCondition, TagStateCondition, Template } from "../../@types/template";
import TagSelect from "./tag-select";

interface TagConditionInputProps {
  tags: Array<TagInfo>;
  tagsLoading?: boolean;
  onFilter?: (filter: string) => void;
  onLoadMore?: () => void;
  whenTitle?: string;
  conditionType: "valid" | "add";
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  disabled?: boolean;
  conditionIndex?: number; // index within validCondition array when conditionType is "valid"
}

const TagConditionInput: React.FunctionComponent<TagConditionInputProps> = ({
  tags,
  tagsLoading,
  onFilter,
  onLoadMore,
  whenTitle,
  conditionType,
  template,
  setTemplate,
  disabled,
  conditionIndex,
}) => {
  const onSelectTag = useCallback(
    (tagName: string | null) => {
      if (tagName) {
        setTemplate((prevTemplate) => {
          const newTemplate = {
            ...prevTemplate,
          };
          if (conditionType === "valid") {
            const list = Array.isArray(prevTemplate.validCondition)
              ? [...prevTemplate.validCondition]
              : [];
            const idx = conditionIndex ?? list.length;
            list[idx] = {
              when: "tag_is",
              tagName: tagName,
            } as TagStateCondition;
            newTemplate.validCondition = list;
          } else if (conditionType === "add") {
            newTemplate.addCondition = {
              ...prevTemplate?.addCondition,
              when: "tag_added",
              tagName: tagName,
            } as TagActionCondition;
          }
          return newTemplate;
        });
      }
    },
    [setTemplate, conditionType, conditionIndex],
  );

  const getSelectedTagName = (): string | null => {
    if (conditionType === "valid") {
      const list = Array.isArray(template?.validCondition) ? template.validCondition : [];
      const condition = list[conditionIndex ?? 0] as TagStateCondition | undefined;
      return condition && condition.when === "tag_is" ? condition.tagName : null;
    }
    if (conditionType === "add" && template?.addCondition?.when === "tag_added") {
      return (template.addCondition as TagActionCondition).tagName ?? null;
    }
    return null;
  };

  return (
    <div>
      <Icon glyph={ConditionIcon}/>{" "}
      <Text size={Text.Size.M}>
        {(whenTitle ?? (conditionType === "add" ? "Add when tag" : "When tag")) + " "}
      </Text>
      <TagSelect
        tags={tags}
        tagsLoading={tagsLoading}
        onFilter={onFilter}
        onLoadMore={onLoadMore}
        selected={getSelectedTagName()}
        onSelect={onSelectTag}
        disabled={disabled}
      />
      .
    </div>
  );
};

export default TagConditionInput;
