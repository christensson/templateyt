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
  // YouTrack field type, e.g. "enum[1]", "state[1]", "user[1]", "version[1]" or "ownedField[1]".
  typeName: string;
  values: Array<ProjectFieldValueInfo>;
};

// Field types that can be used in template conditions (must match template-utils.js).
export const CONDITION_FIELD_TYPES = ["state[1]", "enum[1]"];

export const isConditionField = (field: ProjectFieldInfo): boolean =>
  CONDITION_FIELD_TYPES.includes(field.typeName);

// Multi-value fields (e.g. "version[*]") hold a set of values; templates can replace or add.
export const isMultiValueField = (field: ProjectFieldInfo): boolean =>
  field.typeName.endsWith("[*]");
