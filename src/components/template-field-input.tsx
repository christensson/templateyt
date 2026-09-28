import FieldIcon from "@jetbrains/icons/settings-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import { isMultiValueField, type ProjectFieldInfo } from "../../@types/project-info";
import type { TemplateField } from "../../@types/template";

const ADDITIVE_SUFFIX = "_additive";

// Single-value fields are set; multi-value fields can also get an additional value.
const SINGLE_MODE_ITEMS = [
  { key: "fixed", label: "to fixed value" },
  { key: "user_input", label: "to value chosen by user" },
];
const MULTI_MODE_ITEMS = [
  { key: "fixed", label: "to fixed value" },
  { key: `fixed${ADDITIVE_SUFFIX}`, label: "to fixed additional value" },
  { key: "user_input", label: "to value chosen by user" },
  { key: `user_input${ADDITIVE_SUFFIX}`, label: "to additional value chosen by user" },
];

const getModeKey = (field: TemplateField): string =>
  field.additive ? `${field.mode}${ADDITIVE_SUFFIX}` : field.mode;

const makeField = (fieldName: string, mode: string, additive: boolean): TemplateField =>
  mode === "user_input"
    ? { fieldName, mode: "user_input", additive }
    : { fieldName, mode: "fixed", fieldValue: "", additive };

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
  const fieldInfo = fields.find((candidate) => candidate.name === field.fieldName);
  const isMulti = fieldInfo !== undefined && isMultiValueField(fieldInfo);

  const onSelectField = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      const fieldName = String(selected.key);
      const info = fields.find((candidate) => candidate.name === fieldName);
      // Changing field invalidates any chosen value; "additional" only applies to multi-value.
      const additive = info !== undefined && isMultiValueField(info) && field.additive === true;
      onChange(makeField(fieldName, field.mode, additive));
    },
    [fields, field.mode, field.additive, onChange],
  );

  const onSelectMode = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      const key = String(selected.key);
      const additive = key.endsWith(ADDITIVE_SUFFIX);
      const mode = additive ? key.slice(0, -ADDITIVE_SUFFIX.length) : key;
      onChange(makeField(field.fieldName, mode, additive));
    },
    [field.fieldName, onChange],
  );

  const onSelectValue = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      onChange({
        fieldName: field.fieldName,
        mode: "fixed",
        fieldValue: String(selected.key),
        additive: field.additive === true,
      });
    },
    [field.fieldName, field.additive, onChange],
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
  const modeItems = isMulti ? MULTI_MODE_ITEMS : SINGLE_MODE_ITEMS;
  const selectedModeItem = modeItems.find((item) => item.key === getModeKey(field)) || null;
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
        data={modeItems}
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
