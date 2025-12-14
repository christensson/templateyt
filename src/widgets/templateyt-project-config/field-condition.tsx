import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo, useState } from "react";
import type { ProjectFieldInfo } from "../../../@types/project-fields";
import type { FieldActionCondition, FieldStateCondition, Template } from "../../../@types/template";

interface FieldConditionInputProps {
  fields: Array<ProjectFieldInfo>;
  conditionType: "valid" | "add";
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
}

const FieldConditionInput: React.FunctionComponent<FieldConditionInputProps> = ({
  fields,
  conditionType,
  template,
  setTemplate,
}) => {
  const onSelectField = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
        setTemplate((prevTemplate) => {
          const newTemplate = {
            ...prevTemplate,
          };
          if (conditionType === "valid") {
            newTemplate.validCondition = {
              ...prevTemplate?.validCondition,
              when: "field_is",
              fieldName: selected.key as string,
            } as FieldStateCondition;
          } else if (conditionType === "add") {
            newTemplate.addCondition = {
              ...prevTemplate?.addCondition,
              when: "field_becomes",
              fieldName: selected.key as string,
            } as FieldActionCondition;
          }
          return newTemplate;
        });
      }
    },
    [template, conditionType]
  );

  const onSelectFieldValue = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
        setTemplate((prevTemplate) => {
          const newTemplate = {
            ...prevTemplate,
          };
          if (conditionType === "valid") {
            newTemplate.validCondition = {
              ...prevTemplate?.validCondition,
              when: "field_is",
              fieldValue: selected.key as string,
            } as FieldStateCondition;
          } else if (conditionType === "add") {
            newTemplate.addCondition = {
              ...prevTemplate?.addCondition,
              when: "field_becomes",
              fieldValue: selected.key as string,
            } as FieldActionCondition;
          }
          return newTemplate;
        });
      }
    },
    [template, conditionType]
  );

  const selectFieldItems = useMemo(
    () => fields.map((field) => ({ key: field.name, label: field.name })),
    [fields]
  );
  const selectFieldValueItems = useMemo(() => {
    var condition: FieldStateCondition | FieldActionCondition | null = null;
    if (conditionType === "valid" && template?.validCondition?.when === "field_is") {
      condition = template.validCondition as FieldStateCondition;
    } else if (conditionType === "add" && template?.addCondition?.when === "field_becomes") {
      condition = template.addCondition as FieldActionCondition;
    }
    if (!condition) {
      return [];
    }
    return (
      fields
        .find((field) => field.name === condition?.fieldName)
        ?.values.map((value) => ({
          key: value.name,
          label: value.presentation,
        })) || []
    );
  }, [fields, template, conditionType]);

  const selectedFieldItem = useMemo(() => {
    var condition: FieldStateCondition | FieldActionCondition | null = null;
    if (conditionType === "valid" && template?.validCondition?.when === "field_is") {
      condition = template.validCondition as FieldStateCondition;
    } else if (conditionType === "add" && template?.addCondition?.when === "field_becomes") {
      condition = template.addCondition as FieldActionCondition;
    }
    if (!condition) {
      return null;
    }
    return selectFieldItems.find((field) => field.key === condition?.fieldName);
  }, [fields, template, conditionType]);

  const selectedFieldValueItem = useMemo(() => {
    var condition: FieldStateCondition | FieldActionCondition | null = null;
    if (conditionType === "valid" && template?.validCondition?.when === "field_is") {
      condition = template.validCondition as FieldStateCondition;
    } else if (conditionType === "add" && template?.addCondition?.when === "field_becomes") {
      condition = template.addCondition as FieldActionCondition;
    }
    if (!condition) {
      return null;
    }
    return selectFieldValueItems.find((field) => field.key === condition?.fieldValue);
  }, [fields, template, conditionType]);

  return (
    <div>
      <Text size={Text.Size.M} info>
        {conditionType === "add" ? "Add when field " : "Valid when field "}
      </Text>
      <Select clear data={selectFieldItems} onSelect={onSelectField} selected={selectedFieldItem} />
      <Text size={Text.Size.M} info>
        {conditionType === "add" ? " becomes " : " is "}
      </Text>
      <Select
        clear
        data={selectFieldValueItems}
        selected={selectedFieldValueItem}
        onSelect={onSelectFieldValue}
      />
    </div>
  );
};

export default FieldConditionInput;
