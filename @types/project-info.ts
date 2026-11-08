export type TagInfo = {
  name: string;
};

export type ProjectFieldValueInfo = {
  // Value identifier used when storing and applying values: value name, or login for user fields.
  name: string;
  // Human readable presentation of the value.
  presentation: string;
};

export type ProjectFieldInfo = {
  name: string;
  // YouTrack field type, e.g. "enum[1]", "state[1]", "user[1]", "version[1]", "ownedField[1]",
  // or a simple type such as "date[1]" or "integer[1]" (with no values).
  typeName: string;
  values: Array<ProjectFieldValueInfo>;
};

// Field types that can be used in template conditions (must match template-utils.js).
// Conditions on multi-value fields match when the field includes the value.
export const CONDITION_FIELD_TYPES = ["state[1]", "enum[1]", "ownedField[1]", "enum[*]", "ownedField[*]"];

export const isConditionField = (field: ProjectFieldInfo): boolean =>
  CONDITION_FIELD_TYPES.includes(field.typeName);

// Multi-value fields (e.g. "version[*]") hold a set of values; templates can replace or add.
export const isMultiValueField = (field: ProjectFieldInfo): boolean =>
  field.typeName.endsWith("[*]");

// How a field's value is entered: chosen from the field's values, or typed in for simple fields.
export type FieldValueKind = "list" | "date" | "datetime" | "period" | "integer" | "float" | "string";

// Simple field types by value kind (must match template-utils.js). YouTrack names them without
// a cardinality suffix ("date", unlike "enum[1]"); the suffixed forms are accepted as well.
const SIMPLE_FIELD_KINDS: Record<string, FieldValueKind> = {
  "date": "date",
  "date[1]": "date",
  "date and time": "datetime",
  "date and time[1]": "datetime",
  "period": "period",
  "period[1]": "period",
  "integer": "integer",
  "integer[1]": "integer",
  "float": "float",
  "float[1]": "float",
  "string": "string",
  "string[1]": "string",
};

export const getFieldValueKind = (field: ProjectFieldInfo | undefined): FieldValueKind =>
  (field && SIMPLE_FIELD_KINDS[field.typeName]) || "list";
