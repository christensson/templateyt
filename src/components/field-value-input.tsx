import DatePicker from "@jetbrains/ring-ui-built/components/date-picker/date-picker";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import React, { useEffect, useMemo, useState } from "react";
import { getFieldValueKind, type FieldValueKind, type ProjectFieldInfo } from "../../@types/project-info";
import { getSimpleValueHint, isValidSimpleFieldValue } from "../../@types/template";

const pad = (n: number): string => String(n).padStart(2, "0");

// "2026-12-01" for the local day of a date picked in the date picker.
const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// The date picker's date for a stored value chosen by the user: a date or a timestamp in ms.
const toPickerDate = (kind: FieldValueKind, value: string | null): Date | null => {
  if (!value) {
    return null;
  }
  if (kind === "date") {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(Number(value));
};

interface FieldValueInputProps {
  // The project field whose value is entered; undefined while no field is selected.
  fieldInfo: ProjectFieldInfo | undefined;
  value: string | null;
  // A fixed template value (date fields take an offset from when the template is applied) rather
  // than a value chosen by the user.
  isFixed: boolean;
  // Called with a valid value, or null when the input is empty or invalid.
  onChange: (value: string | null) => void;
  // Label of the select or placeholder of the input.
  label?: string;
  disabled?: boolean;
}

// Text input for a simple field value. Keeps what the user types and reports only valid values.
const SimpleValueInput: React.FunctionComponent<FieldValueInputProps & { kind: FieldValueKind }> = ({
  kind,
  value,
  isFixed,
  onChange,
  label,
  disabled,
}) => {
  const [draft, setDraft] = useState(value ?? "");
  const valid = isValidSimpleFieldValue(kind, draft, isFixed);
  // Follow values set from outside, e.g. when another field is selected.
  useEffect(() => {
    setDraft((prev) => {
      const reported = isValidSimpleFieldValue(kind, prev, isFixed) ? prev : "";
      return reported === (value ?? "") ? prev : value ?? "";
    });
  }, [kind, isFixed, value]);
  const hint = getSimpleValueHint(kind, isFixed);
  return (
    <Input
      className="template-field-value-input"
      size={Size.S}
      disabled={disabled}
      value={draft}
      placeholder={label && label !== "..." ? `${label} (${hint})` : hint}
      error={draft !== "" && !valid ? `Enter ${hint}` : null}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        onChange(isValidSimpleFieldValue(kind, text, isFixed) ? text : null);
      }}
    />
  );
};

// Editor for a field value: a select over the values of list fields, a date picker for dates and
// times chosen by the user, and a text input for other simple fields and relative dates.
const FieldValueInput: React.FunctionComponent<FieldValueInputProps> = (props) => {
  const { fieldInfo, value, isFixed, onChange, label, disabled } = props;
  const kind = getFieldValueKind(fieldInfo);
  const items = useMemo(
    () => (fieldInfo ? fieldInfo.values.map((v) => ({ key: v.name, label: v.presentation })) : []),
    [fieldInfo],
  );

  if (kind === "list") {
    return (
      <Select
        clear
        filter
        disabled={disabled}
        label={label ?? "Choose…"}
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={items}
        selected={items.find((item) => item.key === value) || null}
        onSelect={(item: SelectItem | null) => onChange(item ? String(item.key) : null)}
      />
    );
  }
  if ((kind === "date" || kind === "datetime") && !isFixed) {
    const date = toPickerDate(kind, value);
    // With time the picker reports a Date, although its type says otherwise.
    const onDate = (picked: unknown) => {
      if (!(picked instanceof Date)) {
        onChange(null);
        return;
      }
      onChange(kind === "date" ? toIsoDate(picked) : String(picked.getTime()));
    };
    return kind === "date" ? (
      <DatePicker inline clear disabled={disabled} date={date} onChange={onDate} datePlaceholder={label}/>
    ) : (
      <DatePicker
        inline
        clear
        withTime
        disabled={disabled}
        date={date}
        onChange={onDate}
        dateTimePlaceholder={label}
      />
    );
  }
  return <SimpleValueInput {...props} kind={kind}/>;
};

export default FieldValueInput;
