import SearchIcon from "@jetbrains/icons/search";
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
}

const TagConditionInput: React.FunctionComponent<TagConditionInputProps> = ({
  tags,
  whenTitle,
  conditionType,
  template,
  setTemplate,
}) => {
  const onSelectTag = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
        setTemplate((prevTemplate) => {
          const newTemplate = {
            ...prevTemplate,
          };
          if (conditionType === "valid") {
            newTemplate.validCondition = {
              ...prevTemplate?.validCondition,
              when: "tag_is",
              tagName: selected.key as string,
            } as TagStateCondition;
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
    [template, conditionType]
  );

  const selectTagItems = useMemo(
    () => tags.map((tag) => ({ key: tag.name, label: tag.name })),
    [tags]
  );

  const selectedTagItem = useMemo(() => {
    var condition: TagStateCondition | TagActionCondition | null = null;
    if (conditionType === "valid" && template?.validCondition?.when === "tag_is") {
      condition = template.validCondition as TagStateCondition;
    } else if (conditionType === "add" && template?.addCondition?.when === "tag_added") {
      condition = template.addCondition as TagActionCondition;
    }
    if (!condition) {
      return null;
    }
    return selectTagItems.find((field) => field.key === condition?.tagName);
  }, [tags, template, conditionType]);

  return (
    <div>
      <Text size={Text.Size.M} info>
        {(whenTitle ?? (conditionType === "add" ? "Add when tag" : "Valid when tag")) + " "}
      </Text>
      <Select
        clear
        filter
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
