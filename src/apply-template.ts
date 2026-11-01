// Shared, UI-independent logic of the "Apply template" dialogs for tickets and articles.
import type { HostAPI } from "../@types/globals";
import {
  flattenChildTemplates,
  getChildTemplates,
  getTemplateFields,
  getTemplateRelations,
  getTemplateReplacements,
  getTemplateTags,
  type Template,
  type TemplateTarget,
} from "../@types/template";

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
): { text: string; warning: boolean } | null => {
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
};

export const formatChildrenNoun = (target: TemplateTarget): string =>
  target === "ticket" ? "subtasks" : "sub-articles";

export const formatHierarchyLabel = (target: TemplateTarget, again: boolean): string =>
  `Create ${formatChildrenNoun(target)}${again ? " again" : ""}`;

// The actions offered for a template in a given state; at most one of them is primary.
// Articles have no fields, so they are never offered "Set fields".
export const getApplyActions = (
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
