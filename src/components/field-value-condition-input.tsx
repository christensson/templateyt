import ConditionIcon from "@jetbrains/icons/buildType-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";

interface FieldValueConditionInputProps {
  fields: Array<ProjectFieldInfo>;
  fieldName: string;
  fieldValue: string;
  onChange: (fieldName: string, fieldValue: string) => void;
  whenTitle: string;
  // Word between the field and the value, e.g. "is" or "becomes".
  verb: string;
  disabled?: boolean;
}

// One "field <verb> value" condition row: a field select and a value select.
const FieldValueConditionInput: React.FunctionComponent<FieldValueConditionInputProps> = ({
  fields,
  fieldName,
  fieldValue,
  onChange,
  whenTitle,
  verb,
  disabled,
}) => {
  const onSelectField = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
        // Changing field invalidates any chosen value.
        onChange(String(selected.key), "");
      }
    },
    [onChange],
  );

  const onSelectValue = useCallback(
    (selected: SelectItem | null) => {
      if (selected) {
        onChange(fieldName, String(selected.key));
      }
    },
    [fieldName, onChange],
  );

  const selectFieldItems = useMemo(
    () => fields.map((field) => ({ key: field.name, label: field.name })),
    [fields],
  );

  const selectValueItems = useMemo(() => {
    const info = fields.find((field) => field.name === fieldName);
    return info ? info.values.map((value) => ({ key: value.name, label: value.presentation })) : [];
  }, [fields, fieldName]);

  const selectedFieldItem = selectFieldItems.find((item) => item.key === fieldName) || null;
  const selectedValueItem = selectValueItems.find((item) => item.key === fieldValue) || null;

  return (
    <div>
      <Icon glyph={ConditionIcon}/>{" "}
      <Text size={Text.Size.M}>{whenTitle + " "}</Text>
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
      <Text size={Text.Size.M}>{` ${verb} `}</Text>
      <Select
        clear
        label="..."
        disabled={disabled || selectedFieldItem === null}
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={selectValueItems}
        selected={selectedValueItem}
        onSelect={onSelectValue}
      />
      .
    </div>
  );
};

export default FieldValueConditionInput;
