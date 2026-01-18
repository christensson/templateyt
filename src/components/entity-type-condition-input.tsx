import ConditionIcon from "@jetbrains/icons/buildType-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo, useState } from "react";
import type { EntityTypeCondition, Template } from "../../@types/template";

interface EntityTypeConditionInputProps {
  whenTitle?: string;
  conditionType: "valid";
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  disabled?: boolean;
  conditionIndex?: number; // index within validCondition array when conditionType is "valid"
}

const EntityTypeConditionInput: React.FunctionComponent<EntityTypeConditionInputProps> = ({
  whenTitle,
  conditionType,
  template,
  setTemplate,
  disabled,
  conditionIndex,
}) => {
  const onSelectEntityType = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
        setTemplate((prevTemplate) => {
          const newTemplate = {
            ...prevTemplate,
          };
          if (conditionType === "valid") {
            const currentList = Array.isArray(prevTemplate.validCondition)
              ? [...prevTemplate.validCondition]
              : [];
            const idx = conditionIndex ?? currentList.length;
            const existing = currentList[idx] as EntityTypeCondition | undefined;
            currentList[idx] = {
              when: "entity_is",
              entityType: selected.key as string,
              ...(existing ? existing : {}),
            } as EntityTypeCondition;
            newTemplate.validCondition = currentList;
          }
          return newTemplate;
        });
      }
    },
    [template, conditionType, conditionIndex],
  );

  const selectItems = [
    { key: "issue", label: "Ticket" },
    { key: "article", label: "Article" },
  ];

  const selectedItem = useMemo(() => {
    if (conditionType !== "valid") return null;
    const list = Array.isArray(template?.validCondition) ? template.validCondition : [];
    const idx = conditionIndex ?? 0;
    const condition = list[idx] as EntityTypeCondition | undefined;
    if (!condition || condition.when !== "entity_is") return null;
    return selectItems.find((item) => item.key === condition.entityType);
  }, [template, conditionType, conditionIndex]);

  return (
    <div>
      <Icon glyph={ConditionIcon} />{" "}
      <Text size={Text.Size.M}>
        {(whenTitle ?? (conditionType === "valid" ? "When entity is" : "")) + " "}
      </Text>
      <Select
        clear
        disabled={disabled}
        label="..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={selectItems}
        onSelect={onSelectEntityType}
        selected={selectedItem}
      />
      .
    </div>
  );
};

export default EntityTypeConditionInput;
