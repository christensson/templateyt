import type { HostAPI } from "../@types/globals";
import type { ProjectFieldInfo } from "../@types/project-info";
import {
  flattenChildTemplates,
  getChildTemplates,
  getTemplateFields,
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
  // Applied templates whose user-input fields have not been set yet.
  pendingTemplateIds: Array<string>;
  // Applied templates whose ticket hierarchy has been created below the ticket.
  createdHierarchyTemplateIds: Array<string>;
};

// "add" applies the whole template (description and fields), "fields" only sets its fields.
export type ApplyMode = "add" | "fields";

// User-input values keyed by field name; null or missing means "leave the field untouched".
export type FieldValues = Record<string, string | null>;

// User-input values of the child templates of a hierarchy, keyed by child template id.
export type ChildFieldValues = Record<string, FieldValues>;

export type TemplateActionResult = {
  success: boolean;
  message?: string;
  usedTemplateIds?: Array<string>;
  pendingTemplateIds?: Array<string>;
};

export type CreateHierarchyResult = {
  success: boolean;
  message?: string;
  createdIssueIds?: Array<string>;
  createdHierarchyTemplateIds?: Array<string>;
};

const ENDPOINTS: Record<ApplyMode, string> = {
  add: "backend/addTemplate",
  fields: "backend/applyTemplateFields",
};

export const ACTION_LABELS: Record<ApplyMode, string> = {
  add: "Apply template",
  fields: "Set fields",
};

// A template action waiting for the user to fill in user-input field values.
export type PendingApply = {
  mode: ApplyMode;
  template: Template;
};

export const formatPendingTitle = (pending: PendingApply): string =>
  pending.mode === "add"
    ? `Apply template ${pending.template.name}`
    : `Set fields from template ${pending.template.name}`;

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
export const canCreateHierarchy = (info: IssueTemplateInfo, template: Template): boolean =>
  info.usedTemplateIds.includes(template.id) &&
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
): Promise<TemplateActionResult> =>
  host.fetchApp<TemplateActionResult>(ENDPOINTS[mode], {
    scope: true,
    method: "POST",
    body: { templateId, fieldValues },
  });

export const createHierarchy = (
  host: HostAPI,
  templateId: string,
  childFieldValues: ChildFieldValues,
): Promise<CreateHierarchyResult> =>
  host.fetchApp<CreateHierarchyResult>("backend/createHierarchy", {
    scope: true,
    method: "POST",
    body: { templateId, childFieldValues },
  });

export const removeTemplate = (host: HostAPI, templateId: string): Promise<TemplateActionResult> =>
  host.fetchApp<TemplateActionResult>("backend/removeTemplate", {
    scope: true,
    method: "DELETE",
    body: { templateId },
  });
