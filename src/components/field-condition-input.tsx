import ConditionIcon from "@jetbrains/icons/buildType-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
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

// Returns the field condition this input edits, or undefined if the template has no field
// condition at the given position (valid conditions) or as add condition.
const getFieldCondition = (
  template: Template,
  conditionType: "valid" | "add",
  conditionIndex?: number,
): FieldStateCondition | FieldActionCondition | undefined => {
  if (conditionType === "valid") {
    const list = Array.isArray(template?.validCondition) ? template.validCondition : [];
    const condition = list[conditionIndex ?? 0];
    return condition?.when === "field_is" ? condition : undefined;
  }
  if (template?.addCondition?.when === "field_becomes") {
    return template.addCondition;
  }
  return undefined;
};

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
    [setTemplate, conditionType, conditionIndex],
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
    [setTemplate, conditionType, conditionIndex],
  );

  const selectFieldItems = useMemo(
    () => fields.map((field) => ({ key: field.name, label: field.name })),
    [fields],
  );
  const fieldCondition = useMemo(
    () => getFieldCondition(template, conditionType, conditionIndex),
    [template, conditionType, conditionIndex],
  );

  const selectFieldValueItems = useMemo(() => {
    const fieldName = fieldCondition?.fieldName;
    if (!fieldName) {
      return [];
    }
    return (
      fields
        .find((field) => field.name === fieldName)
        ?.values.map((value) => ({ key: value.name, label: value.presentation })) || []
    );
  }, [fields, fieldCondition]);

  const selectedFieldItem = useMemo(() => {
    if (!fieldCondition) {
      return null;
    }
    return selectFieldItems.find((field) => field.key === fieldCondition.fieldName) || null;
  }, [fieldCondition, selectFieldItems]);

  const selectedFieldValueItem = useMemo(() => {
    if (!fieldCondition) {
      return null;
    }
    return selectFieldValueItems.find((field) => field.key === fieldCondition.fieldValue) || null;
  }, [fieldCondition, selectFieldValueItems]);

  return (
    <div>
      <Icon glyph={ConditionIcon}/>{" "}
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
        disabled={disabled || selectedFieldItem === null}
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
