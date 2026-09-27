import FieldIcon from "@jetbrains/icons/settings-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import type { TemplateField } from "../../@types/template";

const MODE_ITEMS = [
  { key: "fixed", label: "to fixed value" },
  { key: "user_input", label: "to value chosen by user" },
];

interface TemplateFieldInputProps {
  fields: Array<ProjectFieldInfo>;
  field: TemplateField;
  onChange: (field: TemplateField) => void;
  disabled?: boolean;
}

// One row of a "fields set by template" list: field, mode and (for fixed mode) the value.
const TemplateFieldInput: React.FunctionComponent<TemplateFieldInputProps> = ({
  fields,
  field,
  onChange,
  disabled,
}) => {
  const onSelectField = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      const fieldName = String(selected.key);
      // Changing field invalidates any chosen value.
      onChange(
        field.mode === "user_input"
          ? { fieldName, mode: "user_input" }
          : { fieldName, mode: "fixed", fieldValue: "" },
      );
    },
    [field.mode, onChange],
  );

  const onSelectMode = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      onChange(
        selected.key === "user_input"
          ? { fieldName: field.fieldName, mode: "user_input" }
          : { fieldName: field.fieldName, mode: "fixed", fieldValue: "" },
      );
    },
    [field.fieldName, onChange],
  );

  const onSelectValue = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      onChange({ fieldName: field.fieldName, mode: "fixed", fieldValue: String(selected.key) });
    },
    [field.fieldName, onChange],
  );

  const selectFieldItems = useMemo(
    () => fields.map((info) => ({ key: info.name, label: info.name })),
    [fields],
  );

  const selectValueItems = useMemo(() => {
    const info = fields.find((candidate) => candidate.name === field.fieldName);
    return info ? info.values.map((value) => ({ key: value.name, label: value.presentation })) : [];
  }, [fields, field.fieldName]);

  const selectedFieldItem = selectFieldItems.find((item) => item.key === field.fieldName) || null;
  const selectedModeItem = MODE_ITEMS.find((item) => item.key === field.mode) || null;
  const selectedValueItem =
    field.mode === "fixed"
      ? selectValueItems.find((item) => item.key === field.fieldValue) || null
      : null;

  return (
    <div>
      <Icon glyph={FieldIcon}/>{" "}
      <Text size={Text.Size.M}>Set ticket field </Text>
      <Select
        clear
        filter
        disabled={disabled}
        label="..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={selectFieldItems}
        onSelect={onSelectField}
        selected={selectedFieldItem}
      />{" "}
      <Select
        disabled={disabled}
        label="..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={MODE_ITEMS}
        onSelect={onSelectMode}
        selected={selectedModeItem}
      />
      {field.mode === "fixed" && (
        <>
          {" "}
          <Select
            clear
            filter
            label="..."
            disabled={disabled || selectedFieldItem === null}
            type={Select.Type.INLINE}
            size={Select.Size.AUTO}
            data={selectValueItems}
            onSelect={onSelectValue}
            selected={selectedValueItem}
          />
        </>
      )}
      .
    </div>
  );
};

export default TemplateFieldInput;
