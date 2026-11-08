// Shared, UI-independent logic of the "Apply template" dialogs for tickets and articles.
import type { HostAPI } from "../@types/globals";
import type { ProjectFieldInfo } from "../@types/project-info";
import {
  flattenChildTemplates,
  getChildConditionFields,
  isMultiValueFieldName,
  type ConditionValues,
  getChildTemplates,
  getTemplateFields,
  getTemplateRelations,
  getTemplateReplacements,
  getTemplateTags,
  type Template,
  type TemplateTarget,
} from "../@types/template";
import { hasMissingReplacementTexts, type FieldValues, type ReplacementTexts } from "./template-client";

// What the apply dialogs know about the templates of the current ticket or article.
export type ApplyInfo = {
  templates: Array<Template>;
  usedTemplateIds: Array<string>;
  validTemplateIds: Array<string>;
  // Applied templates whose user-input fields have not been set yet (tickets only).
  pendingTemplateIds?: Array<string>;
  // Applied templates whose hierarchy has been created.
  createdHierarchyTemplateIds: Array<string>;
};

// Where a template stands for the current ticket or article.
export type ApplyStatus = "available" | "needs_input" | "applied" | "children_created";

// Status of a template, or null if it is neither applied nor available.
export const getApplyStatus = (info: ApplyInfo, template: Template): ApplyStatus | null => {
  if (info.usedTemplateIds.includes(template.id)) {
    if ((info.pendingTemplateIds ?? []).includes(template.id)) {
      return "needs_input";
    }
    return info.createdHierarchyTemplateIds.includes(template.id) ? "children_created" : "applied";
  }
  return info.validTemplateIds.includes(template.id) ? "available" : null;
};

export const NEEDS_INPUT_GROUP = "Needs input";
export const getAppliedGroup = (target: TemplateTarget): string => `Applied to this ${target}`;
export const AVAILABLE_GROUP = "Available";

export const getApplyGroupOrder = (target: TemplateTarget): Array<string> => [
  NEEDS_INPUT_GROUP,
  getAppliedGroup(target),
  AVAILABLE_GROUP,
];

// List group of each listed template: templates waiting for input first, then applied ones,
// then available ones. Templates that are neither applied nor available are left out.
export const getApplyGroupMap = (
  info: ApplyInfo | null,
  target: TemplateTarget,
): { [templateId: string]: string } => {
  const groups: { [templateId: string]: string } = {};
  if (info === null) {
    return groups;
  }
  for (const template of info.templates) {
    const status = getApplyStatus(info, template);
    if (status === "needs_input") {
      groups[template.id] = NEEDS_INPUT_GROUP;
    } else if (status === "applied" || status === "children_created") {
      groups[template.id] = getAppliedGroup(target);
    } else if (status === "available") {
      groups[template.id] = AVAILABLE_GROUP;
    }
  }
  return groups;
};

// Short status note shown in list rows; null when there is nothing to point out.
export const formatRowStatus = (
  status: ApplyStatus | null,
  target: TemplateTarget,
  blocked: boolean = false,
): { text: string; warning: boolean } | null => {
  if (blocked) {
    return { text: "Can't apply", warning: true };
  }
  if (status === "needs_input") {
    return { text: "Needs input", warning: true };
  }
  if (status === "children_created") {
    return { text: target === "ticket" ? "Subtasks created" : "Sub-articles created", warning: false };
  }
  return null;
};

// One-line description of the selected template's state, shown above the actions.
export const formatStatusSummary = (status: ApplyStatus, target: TemplateTarget): string => {
  switch (status) {
    case "available":
      return `Not applied to this ${target} yet.`;
    case "needs_input":
      return "Applied automatically; some fields still need values.";
    case "children_created":
      return target === "ticket"
        ? "Applied to this ticket, subtasks created."
        : "Applied to this article, sub-articles created.";
    default:
      return `Applied to this ${target}.`;
  }
};

export const countChildren = (template: Template): number =>
  template.hierarchical ? flattenChildTemplates(getChildTemplates(template)).length : 0;

// Whether "Set fields" has anything to (re-)set on a ticket.
export const hasSettableFields = (template: Template): boolean =>
  getTemplateFields(template).length > 0 ||
  getTemplateTags(template).length > 0 ||
  getTemplateRelations(template).some((relation) => relation.target === "fixed") ||
  getTemplateReplacements(template).length > 0;

export type ApplyActionKey = "apply" | "fields" | "hierarchy" | "remove";

export type ApplyAction = {
  key: ApplyActionKey;
  label: string;
  primary: boolean;
  // Shown but not usable, because a precondition of the template is not met.
  disabled?: boolean;
};

export const formatChildrenNoun = (target: TemplateTarget): string =>
  target === "ticket" ? "subtasks" : "sub-articles";

export const formatHierarchyLabel = (target: TemplateTarget, again: boolean): string =>
  `Create ${formatChildrenNoun(target)}${again ? " again" : ""}`;

// The actions for a template in a given state, before preconditions are considered.
const getEnabledApplyActions = (
  template: Template,
  status: ApplyStatus,
  target: TemplateTarget,
): Array<ApplyAction> => {
  if (status === "available") {
    return [{ key: "apply", label: "Apply", primary: true }];
  }
  const canSetFields = target === "ticket" && hasSettableFields(template);
  const hasChildren = countChildren(template) > 0;
  const created = status === "children_created";
  const actions: Array<ApplyAction> = [];
  if (status === "needs_input") {
    actions.push({ key: "fields", label: "Set fields", primary: true });
    if (hasChildren) {
      actions.push({ key: "hierarchy", label: formatHierarchyLabel(target, created), primary: false });
    }
  } else if (hasChildren && !created) {
    actions.push({ key: "hierarchy", label: formatHierarchyLabel(target, false), primary: true });
    if (canSetFields) {
      actions.push({ key: "fields", label: "Set fields again", primary: false });
    }
  } else {
    if (canSetFields) {
      actions.push({ key: "fields", label: "Set fields again", primary: false });
    }
    if (hasChildren) {
      actions.push({ key: "hierarchy", label: formatHierarchyLabel(target, true), primary: false });
    }
  }
  actions.push({ key: "remove", label: "Remove", primary: false });
  return actions;
};

// The actions offered for a template in a given state; at most one of them is primary.
// Articles have no fields, so they are never offered "Set fields". When the template is blocked
// by an unmet precondition, every action except Remove is disabled.
export const getApplyActions = (
  template: Template,
  status: ApplyStatus,
  target: TemplateTarget,
  blocked: boolean = false,
): Array<ApplyAction> =>
  getEnabledApplyActions(template, status, target).map((action) =>
    blocked && action.key !== "remove" ? { ...action, disabled: true } : action,
  );

// Maximum number of created ids listed one by one in a success message.
const MAX_LISTED_IDS = 4;

// Success message after creating a hierarchy, listing the created ids when they are known.
export const formatCreatedMessage = (ids: Array<string> | undefined, target: TemplateTarget): string => {
  const noun = formatChildrenNoun(target);
  const known = (ids ?? []).filter((id) => typeof id === "string" && id !== "");
  if (known.length === 0) {
    return `Created ${noun}.`;
  }
  const count = `${known.length} ${known.length === 1 ? noun.slice(0, -1) : noun}`;
  const listed =
    known.length <= MAX_LISTED_IDS
      ? known.join(", ")
      : `${known[0]} … ${known[known.length - 1]}`;
  return `Created ${count}: ${listed}.`;
};

// Message of a failed request, for load and action errors.
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

// Shows a message in YouTrack; a failing host call must not break the dialog.
export const notify = (host: HostAPI, message: string) => {
  try {
    host.alert(message);
  } catch (error) {
    console.warn("Failed to show notification", error);
  }
};

// Closes the dialog, so that the user sees the updated ticket or article.
export const closeDialog = (host: HostAPI) => {
  try {
    host.closeWidget();
  } catch (error) {
    console.warn("Failed to close dialog", error);
  }
};

// How a field replacement (a word replaced by a root ticket field) gets its text:
// - "filled": from the field's current value.
// - "empty": the field is empty; the user chooses a value, which is also set on the ticket.
// - "set_by_template": from the value the template itself sets in the same action.
// - "missing_field": the field does not exist in the project or cannot be used (blocks).
// - "article": articles have no ticket fields (blocks).
export type ReplacementPreconditionKind =
  | "filled"
  | "empty"
  | "set_by_template"
  | "missing_field"
  | "article";

export type ReplacementPrecondition = {
  search: string;
  fieldName: string;
  kind: ReplacementPreconditionKind;
  // The user must choose a value: for "empty" a replacement field value, for "set_by_template" the
  // template's own user-input field, when the ticket field is empty.
  required: boolean;
};

export type ReplacementPreconditions = {
  items: Array<ReplacementPrecondition>;
  // Why the template cannot be used here at all, or null.
  blockedReason: string | null;
};

const formatBlockedReason = (item: ReplacementPrecondition): string =>
  item.kind === "article"
    ? `Can't apply to articles: ${item.search} is replaced by ticket field ${item.fieldName}.`
    : `Can't apply: ${item.search} is replaced by field ${item.fieldName}, which this project doesn't have.`;

// The preconditions of a template's field replacements. fieldInfos lists the project fields that
// templates can use (none for articles); currentFieldPresentations holds the ticket's current
// display texts. templateSetsFields is true for actions that also set the template's fields
// (apply, set fields), false when creating subtasks.
export const getReplacementPreconditions = (
  template: Template,
  target: TemplateTarget,
  fieldInfos: Array<ProjectFieldInfo>,
  currentFieldPresentations: Record<string, string | null> | undefined,
  templateSetsFields: boolean,
): ReplacementPreconditions => {
  const templateFields = templateSetsFields && target === "ticket" ? getTemplateFields(template) : [];
  const items: Array<ReplacementPrecondition> = [];
  for (const replacement of getTemplateReplacements(template)) {
    if (replacement.mode !== "field") {
      continue;
    }
    const { search, fieldName } = replacement;
    const isFilled = Boolean(currentFieldPresentations?.[fieldName]);
    const setter = templateFields.find((field) => field.fieldName === fieldName);
    let kind: ReplacementPreconditionKind;
    let required = false;
    if (target === "article") {
      kind = "article";
    } else if (!fieldInfos.some((info) => info.name === fieldName)) {
      kind = "missing_field";
    } else if (setter !== undefined) {
      kind = "set_by_template";
      required = setter.mode === "user_input" && !isFilled;
    } else if (isFilled) {
      kind = "filled";
    } else {
      kind = "empty";
      required = true;
    }
    items.push({ search, fieldName, kind, required });
  }
  const blocking = items.find((item) => item.kind === "article" || item.kind === "missing_field");
  return { items, blockedReason: blocking ? formatBlockedReason(blocking) : null };
};

// Whether the user still has to choose values for empty replacement fields.
export const needsReplacementFieldInput = (preconditions: ReplacementPreconditions): boolean =>
  preconditions.items.some((item) => item.kind === "empty");

// Whether required input is missing: user-input replacement texts, values for empty replacement
// fields, or template fields whose value a replacement needs.
export const hasMissingRequiredInput = (
  template: Template,
  texts: ReplacementTexts,
  preconditions: ReplacementPreconditions,
  fieldValues: FieldValues,
  replacementFieldValues: FieldValues,
): boolean =>
  hasMissingReplacementTexts(template, texts) ||
  preconditions.items.some(
    (item) =>
      item.required &&
      !(item.kind === "empty" ? replacementFieldValues : fieldValues)[item.fieldName],
  );

// Value names chosen for multi-value fields, keyed by field name; an empty list clears the field.
export type MultiFieldValues = Record<string, Array<string>>;

// New values of root ticket condition fields as sent to the backend: a value name for
// single-value fields, the complete list of value names for multi-value fields.
export type ConditionFieldValues = Record<string, string | Array<string>>;

export const sameValueNames = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((name) => b.includes(name));

// Values chosen in the subtask form for root ticket fields that child add conditions depend on,
// keeping only those that differ from the ticket's current values: the fields to change.
// chosen holds single-value choices, chosenMulti the value lists of multi-value fields (fields
// the user did not touch are missing from it).
export const getChangedConditionValues = (
  template: Template,
  chosen: FieldValues,
  current: ConditionValues,
  chosenMulti: MultiFieldValues = {},
  fieldInfos: ReadonlyArray<ProjectFieldInfo> = [],
): ConditionFieldValues => {
  const changed: ConditionFieldValues = {};
  for (const { fieldName } of getChildConditionFields(template)) {
    const currentNames = current[fieldName] ?? [];
    if (isMultiValueFieldName(fieldInfos, fieldName)) {
      const names = chosenMulti[fieldName];
      if (names !== undefined && !sameValueNames(names, currentNames)) {
        changed[fieldName] = names;
      }
      continue;
    }
    const value = chosen[fieldName];
    if (value && value !== (currentNames[0] ?? null)) {
      changed[fieldName] = value;
    }
  }
  return changed;
};

// "A", "A and B", "A, B and C".
const joinNames = (names: ReadonlyArray<string>): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// What changing a multi-value field does, e.g. "Adds Backend and removes UI", or null when
// nothing changes. Names are display texts.
export const formatValueListChange = (
  added: ReadonlyArray<string>,
  removed: ReadonlyArray<string>,
): string | null => {
  const parts: Array<string> = [];
  if (added.length > 0) {
    parts.push(`adds ${joinNames(added)}`);
  }
  if (removed.length > 0) {
    parts.push(`removes ${joinNames(removed)}`);
  }
  if (parts.length === 0) {
    return null;
  }
  const text = parts.join(" and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
