import React, { useCallback, useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import type { FieldActionCondition, FieldStateCondition, Template } from "../../@types/template";
import FieldValueConditionInput from "./field-value-condition-input";

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

// Field condition of a template: a validity condition ("field is value") at a given position, or
// the automatic add condition ("field becomes value"). Edits go straight into the template.
const FieldConditionInput: React.FunctionComponent<FieldConditionInputProps> = ({
  fields,
  whenTitle,
  conditionType,
  template,
  setTemplate,
  disabled,
  conditionIndex,
}) => {
  const onChange = useCallback(
    (fieldName: string, fieldValue: string) => {
      setTemplate((prevTemplate) => {
        if (conditionType === "valid") {
          const list = Array.isArray(prevTemplate.validCondition)
            ? [...prevTemplate.validCondition]
            : [];
          const idx = conditionIndex ?? list.length;
          list[idx] = { when: "field_is", fieldName, fieldValue };
          return { ...prevTemplate, validCondition: list };
        }
        return {
          ...prevTemplate,
          addCondition: { when: "field_becomes", fieldName, fieldValue },
        };
      });
    },
    [setTemplate, conditionType, conditionIndex],
  );

  const fieldCondition = useMemo(
    () => getFieldCondition(template, conditionType, conditionIndex),
    [template, conditionType, conditionIndex],
  );

  return (
    <FieldValueConditionInput
      fields={fields}
      fieldName={fieldCondition?.fieldName ?? ""}
      fieldValue={fieldCondition?.fieldValue ?? ""}
      onChange={onChange}
      whenTitle={whenTitle ?? (conditionType === "add" ? "Add when ticket field" : "When ticket field")}
      verb={conditionType === "add" ? "becomes" : "is"}
      disabled={disabled}
    />
  );
};

export default FieldConditionInput;
