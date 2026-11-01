import type { HostAPI } from "../@types/globals";
import type { ProjectFieldInfo } from "../@types/project-info";
import {
  flattenChildTemplates,
  getChildTemplates,
  getTemplateFields,
  getTemplateReplacements,
  hasUserInputFields,
  type HasFields,
  type Template,
} from "../@types/template";

// Typed wrappers around the issue-scoped backend endpoints used by the ticket widgets.

export type IssueTemplateInfo = {
  usedTemplateIds: Array<string>;
  templates: Array<Template>;
  validTemplateIds: Array<string>;
  fields: Array<ProjectFieldInfo>;
  currentFieldValues: Record<string, string | null>;
  // Display texts of the same fields, for previewing field replacements.
  currentFieldPresentations: Record<string, string | null>;
  // Applied templates whose user-input fields have not been set yet.
  pendingTemplateIds: Array<string>;
  // Applied templates whose ticket hierarchy has been created below the ticket.
  createdHierarchyTemplateIds: Array<string>;
  // Texts entered when the templates were applied; missing from older backends.
  replacementTexts?: StoredReplacementTexts;
};

// "add" applies the whole template (description and fields), "fields" only sets its fields.
export type ApplyMode = "add" | "fields";

// User-input values keyed by field name; null or missing means "leave the field untouched".
export type FieldValues = Record<string, string | null>;

// User-input values of the child templates of a hierarchy, keyed by child template id.
export type ChildFieldValues = Record<string, FieldValues>;

// Texts entered by the user for user-input replacements, keyed by the word to replace.
export type ReplacementTexts = Record<string, string>;

// Texts entered for user-input replacements, stored on the ticket or article per applied
// template (extension property templateReplacementTexts), keyed by template id.
export type StoredReplacementTexts = Record<string, ReplacementTexts>;

// Texts for the template's user-input replacements: the texts stored on the ticket or article for
// it, or empty. Stored texts for words the template no longer replaces are ignored.
export const getInitialReplacementTexts = (
  template: Template,
  stored?: StoredReplacementTexts,
): ReplacementTexts => {
  const remembered = stored?.[template.id] ?? {};
  const texts: ReplacementTexts = {};
  for (const replacement of getTemplateReplacements(template)) {
    if (replacement.mode === "user_input") {
      const text = remembered[replacement.search];
      texts[replacement.search] = typeof text === "string" ? text : "";
    }
  }
  return texts;
};

// Whether texts are stored for any of the template's user-input replacements.
export const hasStoredReplacementTexts = (
  template: Template,
  stored?: StoredReplacementTexts,
): boolean => Object.values(getInitialReplacementTexts(template, stored)).some((text) => text !== "");

// True when a user-input replacement has no text yet; texts are required.
export const hasMissingReplacementTexts = (template: Template, texts: ReplacementTexts): boolean =>
  getTemplateReplacements(template).some(
    (replacement) =>
      replacement.mode === "user_input" && (texts[replacement.search] ?? "").trim() === "",
  );

export type TemplateActionResult = {
  success: boolean;
  message?: string;
  usedTemplateIds?: Array<string>;
  pendingTemplateIds?: Array<string>;
  // Stored replacement texts after the action (article actions).
  replacementTexts?: StoredReplacementTexts;
};

export type CreateHierarchyResult = {
  success: boolean;
  message?: string;
  createdIssueIds?: Array<string>;
  createdArticleIds?: Array<string>;
  createdHierarchyTemplateIds?: Array<string>;
  // Stored replacement texts after the action (article actions).
  replacementTexts?: StoredReplacementTexts;
};

const ENDPOINTS: Record<ApplyMode, string> = {
  add: "backend/addTemplate",
  fields: "backend/applyTemplateFields",
};

export const ACTION_LABELS: Record<ApplyMode, string> = {
  add: "Apply",
  fields: "Set fields",
};

// A template action waiting for the user to fill in user-input field values.
export type PendingApply = {
  mode: ApplyMode;
  template: Template;
};

export const formatPendingTitle = (pending: PendingApply): string =>
  pending.mode === "add"
    ? `Apply ${pending.template.name}`
    : `Set fields from ${pending.template.name}`;

// Initial user-input values: the ticket's current values for the template's user-input fields.
export const getInitialFieldValues = (template: HasFields, current: FieldValues): FieldValues => {
  const values: FieldValues = {};
  for (const field of getTemplateFields(template)) {
    if (field.mode === "user_input") {
      values[field.fieldName] = current[field.fieldName] ?? null;
    }
  }
  return values;
};

// Initial user-input values for every child template that has user-input fields.
export const getInitialChildFieldValues = (
  template: Template,
  current: FieldValues,
): ChildFieldValues => {
  const values: ChildFieldValues = {};
  for (const { child } of flattenChildTemplates(getChildTemplates(template))) {
    if (hasUserInputFields(child)) {
      values[child.id] = getInitialFieldValues(child, current);
    }
  }
  return values;
};

// A hierarchy can be created for applied, hierarchical templates that have child templates.
export const canCreateHierarchy = (usedTemplateIds: Array<string>, template: Template): boolean =>
  usedTemplateIds.includes(template.id) &&
  template.hierarchical &&
  flattenChildTemplates(getChildTemplates(template)).length > 0;

export const fetchIssueTemplateInfo = (host: HostAPI): Promise<IssueTemplateInfo> =>
  host.fetchApp<IssueTemplateInfo>("backend/templates", { scope: true, method: "GET" });

// Drops empty inputs so that only chosen values are sent.
export const pickChosenValues = (values: FieldValues): FieldValues => {
  const chosen: FieldValues = {};
  for (const [fieldName, value] of Object.entries(values)) {
    if (value) {
      chosen[fieldName] = value;
    }
  }
  return chosen;
};

export const pickChosenChildValues = (values: ChildFieldValues): ChildFieldValues => {
  const chosen: ChildFieldValues = {};
  for (const [childId, childValues] of Object.entries(values)) {
    chosen[childId] = pickChosenValues(childValues);
  }
  return chosen;
};

export const submitTemplateFields = (
  host: HostAPI,
  mode: ApplyMode,
  templateId: string,
  fieldValues: FieldValues,
  replacementTexts: ReplacementTexts,
  // Values for empty ticket fields that field replacements use; also set on the ticket.
  replacementFieldValues: FieldValues = {},
): Promise<TemplateActionResult> =>
  host.fetchApp<TemplateActionResult>(ENDPOINTS[mode], {
    scope: true,
    method: "POST",
    body: { templateId, fieldValues, replacementTexts, replacementFieldValues },
  });

// Posts to the createHierarchy endpoint of the widget's scope: the ticket or the article.
export const createHierarchy = (
  host: HostAPI,
  templateId: string,
  childFieldValues: ChildFieldValues,
  replacementTexts: ReplacementTexts,
  // Values for empty root ticket fields that field replacements use; also set on the ticket.
  replacementFieldValues: FieldValues = {},
): Promise<CreateHierarchyResult> =>
  host.fetchApp<CreateHierarchyResult>("backend/createHierarchy", {
    scope: true,
    method: "POST",
    body: { templateId, childFieldValues, replacementTexts, replacementFieldValues },
  });

// Applies a template to the current article (article-scoped addTemplate).
export const addTemplateToArticle = (
  host: HostAPI,
  templateId: string,
  replacementTexts: ReplacementTexts,
): Promise<TemplateActionResult> =>
  host.fetchApp<TemplateActionResult>("backend/addTemplate", {
    scope: true,
    method: "POST",
    body: { templateId, replacementTexts },
  });

export const removeTemplate = (host: HostAPI, templateId: string): Promise<TemplateActionResult> =>
  host.fetchApp<TemplateActionResult>("backend/removeTemplate", {
    scope: true,
    method: "DELETE",
    body: { templateId },
  });
