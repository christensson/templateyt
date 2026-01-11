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
}

const EntityTypeConditionInput: React.FunctionComponent<EntityTypeConditionInputProps> = ({
  whenTitle,
  conditionType,
  template,
  setTemplate,
}) => {
  const onSelectEntityType = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
        setTemplate((prevTemplate) => {
          const newTemplate = {
            ...prevTemplate,
          };
          if (conditionType === "valid") {
            newTemplate.validCondition = {
              ...prevTemplate?.validCondition,
              when: "entity_is",
              entityType: selected.key as string,
            } as EntityTypeCondition;
          }
          return newTemplate;
        });
      }
    },
    [template, conditionType]
  );

  const selectItems = [
    { key: "issue", label: "Issue" },
    { key: "article", label: "Article" },
  ];

  const selectedItem = useMemo(() => {
    var condition: EntityTypeCondition | null = null;
    if (conditionType === "valid" && template?.validCondition?.when === "entity_is") {
      condition = template.validCondition as EntityTypeCondition;
    }
    if (!condition) {
      return null;
    }
    return selectItems.find((item) => item.key === condition?.entityType);
  }, [template, conditionType]);

  return (
    <div>
      <Text size={Text.Size.M} info>
        {(whenTitle ?? (conditionType === "valid" ? "Valid when entity is" : "")) + " "}
      </Text>
      <Select
        clear
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
