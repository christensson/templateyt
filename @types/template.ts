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

// Anything that carries a template field list: a template or a child template.
export type HasFields = { fields?: Array<TemplateField> };

// A child article of the template article, turned into a subtask when the ticket hierarchy of a
// hierarchical template is created. Child templates have no conditions.
export type ChildTemplate = {
  id: string; // Stable across re-imports of the child articles.
  articleId: string;
  name: string; // Summary of the created subtask.
  fields: Array<TemplateField>;
  // Copy the values of the fields the parent template configures from the parent ticket.
  inheritParentFields: boolean;
  children: Array<ChildTemplate>;
};

// Article tree as returned by the backend when importing child articles.
export type ImportedArticle = {
  articleId: string;
  summary: string;
  children: Array<ImportedArticle>;
};

export type Template = {
  id: string;
  name: string;
  articleId: string;
  validCondition: Array<ValidCondition>;
  addCondition: AddCondition | null;
  fields: Array<TemplateField>;
  hierarchical: boolean;
  children: Array<ChildTemplate>;
};

const capitalizeFirst = (str: string): string =>
  str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : str;

// Stored templates may predate the array shape, so always read through these accessors.
export const getValidConditions = (template: Template): Array<ValidCondition> =>
  Array.isArray(template?.validCondition) ? template.validCondition : [];

export const getTemplateFields = (template: HasFields): Array<TemplateField> =>
  Array.isArray(template?.fields) ? template.fields : [];

export const hasUserInputFields = (template: HasFields): boolean =>
  getTemplateFields(template).some((field) => field.mode === "user_input");

export const getChildTemplates = (parent: { children?: Array<ChildTemplate> }): Array<ChildTemplate> =>
  Array.isArray(parent?.children) ? parent.children : [];

export type FlatChildTemplate = {
  child: ChildTemplate;
  depth: number;
};

// Child templates in tree order with their depth, for rendering trees as lists.
export const flattenChildTemplates = (
  children: Array<ChildTemplate>,
  depth: number = 0,
): Array<FlatChildTemplate> =>
  children.flatMap((child) => [
    { child, depth },
    ...flattenChildTemplates(getChildTemplates(child), depth + 1),
  ]);

export const findChildTemplate = (template: Template, childId: string): ChildTemplate | null =>
  flattenChildTemplates(getChildTemplates(template)).find((flat) => flat.child.id === childId)
    ?.child ?? null;

const updateChildInList = (
  children: Array<ChildTemplate>,
  childId: string,
  updater: (child: ChildTemplate) => ChildTemplate,
): Array<ChildTemplate> =>
  children.map((child) =>
    child.id === childId
      ? updater(child)
      : { ...child, children: updateChildInList(getChildTemplates(child), childId, updater) },
  );

// Returns a copy of the template with one child template replaced by updater(child).
export const updateChildTemplate = (
  template: Template,
  childId: string,
  updater: (child: ChildTemplate) => ChildTemplate,
): Template => ({
  ...template,
  children: updateChildInList(getChildTemplates(template), childId, updater),
});

// Merges a freshly imported article tree into the existing child templates: articles already
// present keep their id, fields and inherit flag, new articles get defaults, missing ones go.
export const mergeImportedChildren = (
  existing: Array<ChildTemplate>,
  imported: Array<ImportedArticle>,
): Array<ChildTemplate> =>
  imported.map((article) => {
    const current = existing.find((child) => child.articleId === article.articleId);
    return {
      id: current?.id ?? uuidv4(),
      articleId: article.articleId,
      name: article.summary,
      fields: current ? getTemplateFields(current) : [],
      inheritParentFields: current?.inheritParentFields ?? false,
      children: mergeImportedChildren(current ? getChildTemplates(current) : [], article.children),
    };
  });

export const hierarchyHasUserInputFields = (template: Template): boolean =>
  flattenChildTemplates(getChildTemplates(template)).some((flat) => hasUserInputFields(flat.child));

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
export const formatTemplateFields = (template: HasFields): string => {
  const fields = getTemplateFields(template);
  if (fields.length === 0) {
    return "";
  }
  return `Sets fields: ${fields.map((field) => field.fieldName).join(", ")}.`;
};

export const formatTemplateHierarchy = (template: Template): string => {
  if (!template.hierarchical) {
    return "";
  }
  const count = flattenChildTemplates(getChildTemplates(template)).length;
  return `Hierarchical with ${count} child template${count === 1 ? "" : "s"}.`;
};

export const formatChildTemplate = (child: ChildTemplate): string => {
  const parts: Array<string> = [];
  if (child.inheritParentFields) {
    parts.push("Inherits fields from parent.");
  }
  const fields = formatTemplateFields(child);
  if (fields) {
    parts.push(fields);
  }
  return parts.length > 0 ? parts.join(" ") : "No fields set.";
};

// Validates a field list. `subject` prefixes the messages, e.g. `Template` or
// `Child template "Name"`. Returns an error message, or null when valid.
// Keep in sync with validateFieldList in backend.js.
export const validateFieldList = (fields: Array<TemplateField>, subject: string): string | null => {
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field.fieldName) {
      return `${subject} field is missing a field name, please select a field.`;
    }
    if (seen.has(field.fieldName)) {
      return `${subject} field "${field.fieldName}" is listed more than once.`;
    }
    seen.add(field.fieldName);
    if (field.mode === "fixed" && !field.fieldValue) {
      return `${subject} field "${field.fieldName}" is missing a value.`;
    }
  }
  return null;
};

// Validates the template field list. Returns an error message, or null when valid.
// Keep in sync with validateTemplateFields in backend.js.
export const validateTemplateFields = (template: Template): string | null => {
  const fields = getTemplateFields(template);
  const listError = validateFieldList(fields, "Template");
  if (listError !== null) {
    return listError;
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

// Validates the child templates of a hierarchical template. Returns an error message, or null.
// Keep in sync with validateChildTemplates in backend.js.
export const validateChildTemplates = (template: Template): string | null => {
  if (!template.hierarchical) {
    return null;
  }
  const flat = flattenChildTemplates(getChildTemplates(template));
  if (flat.length === 0) {
    return "Hierarchical template has no child templates, import child articles first.";
  }
  for (const { child } of flat) {
    if (!child.name || child.name.trim() === "") {
      return `Child template for article ${child.articleId} needs a name.`;
    }
    const error = validateFieldList(getTemplateFields(child), `Child template "${child.name}"`);
    if (error !== null) {
      return error;
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
  hierarchical: false,
  children: [],
});

export const createNullTemplate = (): Template => ({
  id: "", // Indicate null template with empty id.
  name: "",
  articleId: "",
  validCondition: [],
  addCondition: null,
  fields: [],
  hierarchical: false,
  children: [],
});
