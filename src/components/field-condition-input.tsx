import ConditionIcon from "@jetbrains/icons/buildType-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo, useState } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import type { FieldActionCondition, FieldStateCondition, Template } from "../../@types/template";

interface FieldConditionInputProps {
  fields: Array<ProjectFieldInfo>;
  whenTitle?: string;
  conditionType: "valid" | "add";
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  disabled?: boolean;
  conditionIndex?: number; // index within validCondition array when conditionType is "valid"
}

const FieldConditionInput: React.FunctionComponent<FieldConditionInputProps> = ({
  fields,
  whenTitle,
  conditionType,
  template,
  setTemplate,
  disabled,
  conditionIndex,
}) => {
  const onSelectField = useCallback(
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
            const existing = list[idx] as FieldStateCondition | undefined;
            list[idx] = {
              when: "field_is",
              fieldName: selected.key as string,
              fieldValue: existing?.fieldValue ?? "",
            } as FieldStateCondition;
            newTemplate.validCondition = list;
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
    [template, conditionType, conditionIndex],
  );

  const onSelectFieldValue = useCallback(
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
            const existing = list[idx] as FieldStateCondition | undefined;
            list[idx] = {
              when: "field_is",
              fieldName: existing?.fieldName ?? "",
              fieldValue: selected.key as string,
            } as FieldStateCondition;
            newTemplate.validCondition = list;
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
    [template, conditionType, conditionIndex],
  );

  const selectFieldItems = useMemo(
    () => fields.map((field) => ({ key: field.name, label: field.name })),
    [fields],
  );
  const selectFieldValueItems = useMemo(() => {
    if (conditionType === "valid") {
      const list = Array.isArray(template?.validCondition) ? template.validCondition : [];
      const idx = conditionIndex ?? 0;
      const condition = list[idx] as FieldStateCondition | undefined;
      const fieldName = condition?.fieldName;
      if (!condition || condition.when !== "field_is" || !fieldName) {
        return [];
      }
      return (
        fields
          .find((field) => field.name === fieldName)
          ?.values.map((value) => ({ key: value.name, label: value.presentation })) || []
      );
    } else if (conditionType === "add" && template?.addCondition?.when === "field_becomes") {
      const condition = template.addCondition as FieldActionCondition;
      return (
        fields
          .find((field) => field.name === condition?.fieldName)
          ?.values.map((value) => ({ key: value.name, label: value.presentation })) || []
      );
    }
    return [];
  }, [fields, template, conditionType, conditionIndex]);

  const selectedFieldItem = useMemo(() => {
    if (conditionType === "valid") {
      const list = Array.isArray(template?.validCondition) ? template.validCondition : [];
      const idx = conditionIndex ?? 0;
      const condition = list[idx] as FieldStateCondition | undefined;
      if (!condition || condition.when !== "field_is") {
        return null;
      }
      return selectFieldItems.find((field) => field.key === condition.fieldName) || null;
    } else if (conditionType === "add" && template?.addCondition?.when === "field_becomes") {
      const condition = template.addCondition as FieldActionCondition;
      return selectFieldItems.find((field) => field.key === condition?.fieldName) || null;
    }
    return null;
  }, [fields, template, conditionType, conditionIndex]);

  const selectedFieldValueItem = useMemo(() => {
    if (conditionType === "valid") {
      const list = Array.isArray(template?.validCondition) ? template.validCondition : [];
      const idx = conditionIndex ?? 0;
      const condition = list[idx] as FieldStateCondition | undefined;
      if (!condition || condition.when !== "field_is") return null;
      return selectFieldValueItems.find((field) => field.key === condition.fieldValue) || null;
    } else if (conditionType === "add" && template?.addCondition?.when === "field_becomes") {
      const condition = template.addCondition as FieldActionCondition;
      return selectFieldValueItems.find((field) => field.key === condition?.fieldValue) || null;
    }
    return null;
  }, [fields, template, conditionType, conditionIndex, selectFieldValueItems]);

  return (
    <div>
      <Icon glyph={ConditionIcon} />{" "}
      <Text size={Text.Size.M}>
        {(whenTitle ?? (conditionType === "add" ? "Add when ticket field" : "When ticket field")) +
          " "}
      </Text>
      <Select
        clear
        disabled={disabled}
        label="..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={selectFieldItems}
        onSelect={onSelectField}
        selected={selectedFieldItem}
      />
      <Text size={Text.Size.M}>{conditionType === "add" ? " becomes " : " is "}</Text>
      <Select
        clear
        label="..."
        disabled={disabled || selectedFieldItem == undefined}
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={selectFieldValueItems}
        selected={selectedFieldValueItem}
        onSelect={onSelectFieldValue}
      />
      .
    </div>
  );
};

export default FieldConditionInput;
