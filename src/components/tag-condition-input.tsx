import ConditionIcon from "@jetbrains/icons/buildType-12px";
import SearchIcon from "@jetbrains/icons/search";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo, useState } from "react";
import type { TagInfo } from "../../@types/project-info";
import type { TagActionCondition, TagStateCondition, Template } from "../../@types/template";

interface TagConditionInputProps {
  tags: Array<TagInfo>;
  whenTitle?: string;
  conditionType: "valid" | "add";
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  disabled?: boolean;
  conditionIndex?: number; // index within validCondition array when conditionType is "valid"
}

const TagConditionInput: React.FunctionComponent<TagConditionInputProps> = ({
  tags,
  whenTitle,
  conditionType,
  template,
  setTemplate,
  disabled,
  conditionIndex,
}) => {
  const onSelectTag = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
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
              tagName: selected.key as string,
            } as TagStateCondition;
            newTemplate.validCondition = list;
          } else if (conditionType === "add") {
            newTemplate.addCondition = {
              ...prevTemplate?.addCondition,
              when: "tag_added",
              tagName: selected.key as string,
            } as TagActionCondition;
          }
          return newTemplate;
        });
      }
    },
    [template, conditionType, conditionIndex],
  );

  const selectTagItems = useMemo(
    () => tags.map((tag) => ({ key: tag.name, label: tag.name })),
    [tags],
  );

  const selectedTagItem = useMemo(() => {
    if (conditionType === "valid") {
      const list = Array.isArray(template?.validCondition) ? template.validCondition : [];
      const idx = conditionIndex ?? 0;
      const condition = list[idx] as TagStateCondition | undefined;
      if (!condition || condition.when !== "tag_is") return null;
      return selectTagItems.find((field) => field.key === condition.tagName) || null;
    } else if (conditionType === "add" && template?.addCondition?.when === "tag_added") {
      const condition = template.addCondition as TagActionCondition;
      return selectTagItems.find((field) => field.key === condition?.tagName) || null;
    }
    return null;
  }, [tags, template, conditionType, conditionIndex, selectTagItems]);

  return (
    <div>
      <Icon glyph={ConditionIcon} />{" "}
      <Text size={Text.Size.M}>
        {(whenTitle ?? (conditionType === "add" ? "Add when tag" : "When tag")) + " "}
      </Text>
      <Select
        clear
        filter
        disabled={disabled}
        label="..."
        filterIcon={SearchIcon}
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={selectTagItems}
        onSelect={onSelectTag}
        selected={selectedTagItem}
      />
      .
    </div>
  );
};

export default TagConditionInput;
