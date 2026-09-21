import { v4 as uuidv4 } from "uuid";

export type EntityTypeCondition = {
  when: "entity_is";
  entityType: "issue" | "article";
};
export type FieldStateCondition = {
  when: "field_is";
  fieldName: string;
  fieldValue: string;
};
export type TagStateCondition = {
  when: "tag_is";
  tagName: string;
};
export type FieldActionCondition = {
  when: "field_becomes";
  fieldName: string;
  fieldValue: string;
};
export type TagActionCondition = {
  when: "tag_added";
  tagName: string;
};
export type ValidCondition = EntityTypeCondition | FieldStateCondition | TagStateCondition;
export type AddCondition = FieldActionCondition | TagActionCondition;

// A ticket field set by the template, either to a fixed value or to a value chosen by the user
// when the template is applied manually.
export type TemplateFixedField = {
  fieldName: string;
  mode: "fixed";
  fieldValue: string;
};
export type TemplateUserInputField = {
  fieldName: string;
  mode: "user_input";
};
export type TemplateField = TemplateFixedField | TemplateUserInputField;
export type TemplateFieldMode = TemplateField["mode"];

export type Template = {
  id: string;
  name: string;
  articleId: string;
  validCondition: Array<ValidCondition>;
  addCondition: AddCondition | null;
  fields: Array<TemplateField>;
};

const capitalizeFirst = (str: string): string =>
  str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : str;

// Stored templates may predate the array shape, so always read through these accessors.
export const getValidConditions = (template: Template): Array<ValidCondition> =>
  Array.isArray(template?.validCondition) ? template.validCondition : [];

export const getTemplateFields = (template: Template): Array<TemplateField> =>
  Array.isArray(template?.fields) ? template.fields : [];

export const hasUserInputFields = (template: Template): boolean =>
  getTemplateFields(template).some((field) => field.mode === "user_input");

export const formatValidCondition = (
  validCond: ValidCondition,
  capitalize: boolean = false,
): string => {
  let str = "";
  if (validCond.when === "entity_is") {
    str = validCond.entityType === "issue" ? "ticket" : "article";
  } else if (validCond.when === "field_is") {
    str = `ticket field ${validCond.fieldName} is ${validCond.fieldValue}`;
  } else if (validCond.when === "tag_is") {
    str = `ticket or article has tag ${validCond.tagName}`;
  }
  return capitalize ? capitalizeFirst(str) : str;
};

export const formatAddCondition = (
  addCond: AddCondition | null,
  capitalize: boolean = false,
): string => {
  let str = "No automatic addition condition set.";
  if (addCond == null || addCond?.when == null) {
    return str;
  }

  if (addCond.when === "field_becomes") {
    str = `ticket field ${addCond.fieldName} becomes ${addCond.fieldValue}.`;
  } else if (addCond.when === "tag_added") {
    str = `ticket or article is tagged with ${addCond.tagName}.`;
  }
  return capitalize ? capitalizeFirst(str) : str;
};

export const formatTemplateField = (field: TemplateField, capitalize: boolean = false): string => {
  const str =
    field.mode === "fixed"
      ? `sets ticket field ${field.fieldName} to ${field.fieldValue}.`
      : `asks for ticket field ${field.fieldName} when applied manually.`;
  return capitalize ? capitalizeFirst(str) : str;
};

export const formatTemplateValidCondition = (template: Template): string => {
  const conditions = getValidConditions(template);
  if (conditions.length === 0) {
    return "No validity condition set.";
  }

  const parts = conditions
    .map((validCond) => formatValidCondition(validCond))
    .filter((s) => s.length > 0);

  if (parts.length === 0) {
    return "No validity condition set.";
  }
  if (parts.length === 1) {
    return `Valid when ${parts[0]}.`;
  }

  return `Valid when any of; ${parts.join(", or ")}.`;
};

export const formatTemplateAddCondition = (template: Template): string => {
  const addCond = template.addCondition;
  if (addCond == null || addCond?.when == null) {
    return "No automatic addition condition set.";
  }

  return `Added when ${formatAddCondition(addCond)}`;
};

// Short summary of the fields a template sets, or empty string when it sets none.
export const formatTemplateFields = (template: Template): string => {
  const fields = getTemplateFields(template);
  if (fields.length === 0) {
    return "";
  }
  return `Sets fields: ${fields.map((field) => field.fieldName).join(", ")}.`;
};

// Validates the template field list. Returns an error message, or null when valid.
// Keep in sync with validateTemplateFields in backend.js.
export const validateTemplateFields = (template: Template): string | null => {
  const fields = getTemplateFields(template);
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field.fieldName) {
      return "Template field is missing a field name, please select a field.";
    }
    if (seen.has(field.fieldName)) {
      return `Template field "${field.fieldName}" is listed more than once.`;
    }
    seen.add(field.fieldName);
    if (field.mode === "fixed" && !field.fieldValue) {
      return `Template field "${field.fieldName}" is missing a value.`;
    }
  }

  // A template must never set its own trigger field to another value than the one that
  // triggers it, otherwise applying the template would undo the condition that added it.
  const addCond = template.addCondition;
  if (addCond?.when === "field_becomes") {
    const conflict = fields.find(
      (field) =>
        field.fieldName === addCond.fieldName &&
        (field.mode !== "fixed" || field.fieldValue !== addCond.fieldValue),
    );
    if (conflict) {
      return `Field "${addCond.fieldName}" is used in the automatic add condition and can only be set to "${addCond.fieldValue}".`;
    }
  }
  return null;
};

export const createEmptyTemplate = (): Template => ({
  id: uuidv4(),
  name: "",
  articleId: "",
  validCondition: [],
  addCondition: null,
  fields: [],
});

export const createNullTemplate = (): Template => ({
  id: "", // Indicate null template with empty id.
  name: "",
  articleId: "",
  validCondition: [],
  addCondition: null,
  fields: [],
});
