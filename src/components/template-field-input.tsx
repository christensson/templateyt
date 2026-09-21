import FieldIcon from "@jetbrains/icons/settings-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import { getTemplateFields, type Template, type TemplateField } from "../../@types/template";

const MODE_ITEMS = [
  { key: "fixed", label: "to fixed value" },
  { key: "user_input", label: "to value chosen by user" },
];

const EMPTY_FIELD: TemplateField = { fieldName: "", mode: "fixed", fieldValue: "" };

interface TemplateFieldInputProps {
  fields: Array<ProjectFieldInfo>;
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  fieldIndex: number;
  disabled?: boolean;
}

// One row of the "fields set by template" list: field, mode and (for fixed mode) the value.
const TemplateFieldInput: React.FunctionComponent<TemplateFieldInputProps> = ({
  fields,
  template,
  setTemplate,
  fieldIndex,
  disabled,
}) => {
  const templateField: TemplateField = getTemplateFields(template)[fieldIndex] ?? EMPTY_FIELD;

  const updateField = useCallback(
    (updater: (prev: TemplateField) => TemplateField) => {
      setTemplate((prevTemplate) => {
        const list = [...getTemplateFields(prevTemplate)];
        list[fieldIndex] = updater(list[fieldIndex] ?? EMPTY_FIELD);
        return { ...prevTemplate, fields: list };
      });
    },
    [setTemplate, fieldIndex],
  );

  const onSelectField = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      const fieldName = selected.key as string;
      // Changing field invalidates any chosen value.
      updateField((prev) =>
        prev.mode === "user_input"
          ? { fieldName, mode: "user_input" }
          : { fieldName, mode: "fixed", fieldValue: "" },
      );
    },
    [updateField],
  );

  const onSelectMode = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      updateField((prev) =>
        selected.key === "user_input"
          ? { fieldName: prev.fieldName, mode: "user_input" }
          : { fieldName: prev.fieldName, mode: "fixed", fieldValue: "" },
      );
    },
    [updateField],
  );

  const onSelectValue = useCallback(
    (selected: SelectItem | null) => {
      if (!selected) {
        return;
      }
      updateField((prev) => ({
        fieldName: prev.fieldName,
        mode: "fixed",
        fieldValue: selected.key as string,
      }));
    },
    [updateField],
  );

  const selectFieldItems = useMemo(
    () => fields.map((field) => ({ key: field.name, label: field.name })),
    [fields],
  );

  const selectValueItems = useMemo(() => {
    const info = fields.find((field) => field.name === templateField.fieldName);
    return info ? info.values.map((value) => ({ key: value.name, label: value.presentation })) : [];
  }, [fields, templateField.fieldName]);

  const selectedFieldItem =
    selectFieldItems.find((item) => item.key === templateField.fieldName) || null;
  const selectedModeItem = MODE_ITEMS.find((item) => item.key === templateField.mode) || null;
  const selectedValueItem =
    templateField.mode === "fixed"
      ? selectValueItems.find((item) => item.key === templateField.fieldValue) || null
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
      {templateField.mode === "fixed" && (
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
