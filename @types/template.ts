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
// For multi-value fields `additive` adds the value to the existing ones instead of replacing them.
export type TemplateFixedField = {
  fieldName: string;
  mode: "fixed";
  fieldValue: string;
  additive?: boolean;
};
export type TemplateUserInputField = {
  fieldName: string;
  mode: "user_input";
  additive?: boolean;
};
export type TemplateField = TemplateFixedField | TemplateUserInputField;
export type TemplateFieldMode = TemplateField["mode"];

// Anything that carries a template field list: a template or a child template.
export type HasFields = { fields?: Array<TemplateField> };

// Anything that carries tag names added to the ticket: a template or a child template.
export type HasTags = { tags?: Array<string> };

// Issue link from the template's ticket to another ticket: the root ticket or the subtask of a
// child template (created with the hierarchy), or a fixed ticket given by id. linkName is the
// direction name used in issue.links (IssueLinkType sourceToTarget or targetToSource).
export type TemplateRelation =
  | { linkName: string; target: "root" }
  | { linkName: string; target: "child"; childId: string }
  | { linkName: string; target: "fixed"; issueId: string };
export type TemplateRelationTarget = TemplateRelation["target"];

// Anything that carries relations: a template or a child template.
export type HasRelations = { relations?: Array<TemplateRelation> };

// Issue link type as returned by the YouTrack REST API.
export type IssueLinkTypeInfo = {
  name: string;
  directed: boolean;
  aggregation: boolean;
  readOnly: boolean;
  sourceToTarget: string;
  targetToSource: string;
};

// A whole-word text replacement applied to summaries and contents when a template is applied,
// with text entered by the user or the display text of a root ticket field.
export type UserInputReplacement = { search: string; mode: "user_input" };
export type FieldReplacement = { search: string; mode: "field"; fieldName: string };
export type TextReplacement = UserInputReplacement | FieldReplacement;

// A child article of the template article, turned into a subtask when the ticket hierarchy of a
// hierarchical template is created. Child templates have no conditions.
export type ChildTemplate = {
  id: string; // Stable across re-imports of the child articles.
  articleId: string;
  name: string; // Summary of the created subtask.
  // Inserted by hand rather than imported from the article tree: keeps its place on re-import
  // and can be moved or removed.
  manual: boolean;
  fields: Array<TemplateField>;
  // Tags added to the subtask when it is created.
  tags?: Array<string>;
  // Links added to the subtask when the hierarchy is created.
  relations?: Array<TemplateRelation>;
  // The subtask is created only when any of these match the root ticket; none means always.
  addConditions: Array<FieldStateCondition>;
  // Copy the values of the fields the parent template configures from the parent ticket.
  inheritParentFields: boolean;
  // Copy the values of the fields the root template configures from the root ticket.
  // Precedence when both are set: own fields, then the closest parent, then the root ticket.
  inheritRootFields: boolean;
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
  // Tags added to the ticket when the template is applied manually; not when added automatically.
  tags?: Array<string>;
  // Links to fixed tickets are added like fields; links within the hierarchy when it is created.
  relations?: Array<TemplateRelation>;
  replacements: Array<TextReplacement>;
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

export const getTemplateTags = (template: HasTags): Array<string> =>
  Array.isArray(template?.tags) ? template.tags : [];

export const getTemplateRelations = (template: HasRelations): Array<TemplateRelation> =>
  Array.isArray(template?.relations) ? template.relations : [];

// Link directions a relation can use. Aggregation types (like Subtask) would compete with the
// template hierarchy and read-only types cannot be set, so both are left out.
export const getRelationLinkNames = (types: Array<IssueLinkTypeInfo>): Array<string> => {
  const names: Array<string> = [];
  for (const type of types) {
    if (type.aggregation || type.readOnly) {
      continue;
    }
    const directions = type.directed ? [type.sourceToTarget, type.targetToSource] : [type.sourceToTarget];
    for (const name of directions) {
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
};

export const hasUserInputFields = (template: HasFields): boolean =>
  getTemplateFields(template).some((field) => field.mode === "user_input");

export const getTemplateReplacements = (template: Template): Array<TextReplacement> =>
  Array.isArray(template?.replacements) ? template.replacements : [];

export const hasUserInputReplacements = (template: Template): boolean =>
  getTemplateReplacements(template).some((replacement) => replacement.mode === "user_input");

// Whether applying the template needs input from the user: field values or replacement texts.
export const hasUserInput = (template: Template): boolean =>
  hasUserInputFields(template) || hasUserInputReplacements(template);

export const getChildTemplates = (parent: { children?: Array<ChildTemplate> }): Array<ChildTemplate> =>
  Array.isArray(parent?.children) ? parent.children : [];

export const getChildAddConditions = (child: ChildTemplate): Array<FieldStateCondition> =>
  Array.isArray(child?.addConditions) ? child.addConditions : [];

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

// Article ids of all manually inserted nodes of the tree.
export const collectManualArticleIds = (template: Template): Set<string> =>
  new Set(
    flattenChildTemplates(getChildTemplates(template))
      .filter((flat) => flat.child.manual)
      .map((flat) => flat.child.articleId),
  );

export const findChildByArticleId = (template: Template, articleId: string): ChildTemplate | null =>
  flattenChildTemplates(getChildTemplates(template)).find(
    (flat) => flat.child.articleId === articleId,
  )?.child ?? null;

// Merges a freshly imported article tree into the existing child templates: imported articles
// already present keep their configuration, new articles get defaults, missing ones go. Articles
// that exist as manually inserted nodes anywhere in the tree are not imported again, and manual
// siblings keep their position and their whole subtree.
export const mergeImportedChildren = (
  existing: Array<ChildTemplate>,
  imported: Array<ImportedArticle>,
  manualArticleIds: Set<string>,
): Array<ChildTemplate> => {
  const merged: Array<ChildTemplate> = imported
    .filter((article) => !manualArticleIds.has(article.articleId))
    .map((article) => {
      const current = existing.find(
        (child) => !child.manual && child.articleId === article.articleId,
      );
      return {
        id: current?.id ?? uuidv4(),
        articleId: article.articleId,
        name: article.summary,
        manual: false,
        fields: current ? getTemplateFields(current) : [],
        addConditions: current ? getChildAddConditions(current) : [],
        inheritParentFields: current?.inheritParentFields ?? false,
        inheritRootFields: current?.inheritRootFields ?? false,
        children: mergeImportedChildren(
          current ? getChildTemplates(current) : [],
          article.children,
          manualArticleIds,
        ),
      };
    });
  existing.forEach((child, index) => {
    if (child.manual) {
      merged.splice(Math.min(index, merged.length), 0, child);
    }
  });
  return merged;
};

export type InsertedArticle = { articleId: string; summary: string };

const createManualChild = (article: InsertedArticle): ChildTemplate => ({
  id: uuidv4(),
  articleId: article.articleId,
  name: article.summary,
  manual: true,
  fields: [],
  addConditions: [],
  inheritParentFields: false,
  inheritRootFields: false,
  children: [],
});

// Replaces the children of the template (parentId null) or of a child template.
const updateSiblings = (
  template: Template,
  parentId: string | null,
  updater: (children: Array<ChildTemplate>) => Array<ChildTemplate>,
): Template =>
  parentId === null
    ? { ...template, children: updater(getChildTemplates(template)) }
    : updateChildTemplate(template, parentId, (parent) => ({
        ...parent,
        children: updater(getChildTemplates(parent)),
      }));

// Appends a manually inserted child template below the template or below a child template.
export const insertManualChild = (
  template: Template,
  parentId: string | null,
  article: InsertedArticle,
): Template => updateSiblings(template, parentId, (list) => [...list, createManualChild(article)]);

// Id of the parent child template, null for a direct child of the template, undefined if absent.
export const findParentId = (template: Template, childId: string): string | null | undefined => {
  if (getChildTemplates(template).some((child) => child.id === childId)) {
    return null;
  }
  const owner = flattenChildTemplates(getChildTemplates(template)).find((flat) =>
    getChildTemplates(flat.child).some((child) => child.id === childId),
  );
  return owner ? owner.child.id : undefined;
};

// Position of a child template among its siblings, or null when it is not in the tree.
export const getSiblingPosition = (
  template: Template,
  childId: string,
): { index: number; count: number } | null => {
  const parentId = findParentId(template, childId);
  if (parentId === undefined) {
    return null;
  }
  const parent = parentId === null ? null : findChildTemplate(template, parentId);
  const list = parent === null ? getChildTemplates(template) : getChildTemplates(parent);
  return { index: list.findIndex((child) => child.id === childId), count: list.length };
};

// Moves a child template one step among its siblings (delta -1 up, 1 down).
export const moveChild = (template: Template, childId: string, delta: -1 | 1): Template => {
  const parentId = findParentId(template, childId);
  if (parentId === undefined) {
    return template;
  }
  return updateSiblings(template, parentId, (list) => {
    const index = list.findIndex((child) => child.id === childId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) {
      return list;
    }
    const copy = [...list];
    copy[index] = list[target];
    copy[target] = list[index];
    return copy;
  });
};

export const removeChild = (template: Template, childId: string): Template => {
  const parentId = findParentId(template, childId);
  if (parentId === undefined) {
    return template;
  }
  return updateSiblings(template, parentId, (list) => list.filter((child) => child.id !== childId));
};

const isNodeOrDescendant = (node: ChildTemplate, childId: string): boolean =>
  node.id === childId ||
  flattenChildTemplates(getChildTemplates(node)).some((flat) => flat.child.id === childId);

// Moves a child template (with its subtree) to the end of the template's children (null) or of
// another child template's children; a node cannot be moved below itself.
export const moveChildUnder = (
  template: Template,
  childId: string,
  newParentId: string | null,
): Template => {
  const child = findChildTemplate(template, childId);
  if (child === null) {
    return template;
  }
  if (newParentId !== null) {
    const target = findChildTemplate(template, newParentId);
    if (target === null || isNodeOrDescendant(child, newParentId)) {
      return template;
    }
  }
  return updateSiblings(removeChild(template, childId), newParentId, (list) => [...list, child]);
};

export type MoveTarget = { id: string | null; label: string };

// Where a child template can be moved: the template itself and every node outside its subtree.
export const getMoveTargets = (template: Template, childId: string): Array<MoveTarget> => {
  const child = findChildTemplate(template, childId);
  const targets: Array<MoveTarget> = [{ id: null, label: `Template ${template.name}` }];
  for (const { child: node, depth } of flattenChildTemplates(getChildTemplates(template))) {
    if (child !== null && isNodeOrDescendant(child, node.id)) {
      continue;
    }
    targets.push({ id: node.id, label: `${"\u00A0\u00A0".repeat(depth + 1)}${node.name}` });
  }
  return targets;
};

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
  let str: string;
  if (field.mode === "fixed") {
    str = field.additive
      ? `adds ${field.fieldValue} to ticket field ${field.fieldName}.`
      : `sets ticket field ${field.fieldName} to ${field.fieldValue}.`;
  } else {
    str = field.additive
      ? `asks for an additional value of ticket field ${field.fieldName} when applied manually.`
      : `asks for ticket field ${field.fieldName} when applied manually.`;
  }
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

  return `Valid when ${parts.join(" or ")}.`;
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

export const formatTemplateTag = (tag: string): string => `Adds tag ${tag} to ticket.`;

// The ticket a relation points to, e.g. "root ticket", "subtask Review" or "ticket ABC-12".
export const formatRelationTarget = (relation: TemplateRelation, template: Template): string => {
  if (relation.target === "root") {
    return "root ticket";
  }
  if (relation.target === "fixed") {
    return `ticket ${relation.issueId}`;
  }
  const child = findChildTemplate(template, relation.childId);
  return child ? `subtask ${child.name}` : "a removed child template";
};

export const formatTemplateRelation = (relation: TemplateRelation, template: Template): string =>
  `Adds relation ${relation.linkName} to ${formatRelationTarget(relation, template)}.`;

// Returns an error message for an incomplete relation of the template or a child template, or null.
// Validates the relations of one template or child template. Returns an error message, or null.
const validateOwnerRelations = (owner: HasRelations, subject: string): string | null => {
  for (const relation of getTemplateRelations(owner)) {
    if (relation.linkName.trim() === "") {
      return `${subject} has a relation without link type.`;
    }
    if (relation.target === "fixed" && relation.issueId.trim() === "") {
      return `${subject} relation "${relation.linkName}" needs a ticket id.`;
    }
    if (relation.target === "child" && relation.childId === "") {
      return `${subject} relation "${relation.linkName}" needs a target ticket.`;
    }
  }
  return null;
};

export const validateRelations = (template: Template): string | null => {
  const owners: Array<{ owner: HasRelations; subject: string }> = [
    { owner: template, subject: "Template" },
    ...flattenChildTemplates(getChildTemplates(template)).map(({ child }) => ({
      owner: child,
      subject: `Child template "${child.name}"`,
    })),
  ];
  for (const { owner, subject } of owners) {
    const error = validateOwnerRelations(owner, subject);
    if (error !== null) {
      return error;
    }
  }
  return null;
};

// Drops relations to child templates that no longer exist, e.g. after removing a child template
// or re-importing the child articles.
export const pruneDanglingRelations = (template: Template): Template => {
  const ids = new Set(flattenChildTemplates(getChildTemplates(template)).map(({ child }) => child.id));
  const prune = <T extends HasRelations>(owner: T): T =>
    Array.isArray(owner.relations)
      ? {
          ...owner,
          relations: owner.relations.filter(
            (relation) => relation.target !== "child" || ids.has(relation.childId),
          ),
        }
      : owner;
  const pruneChildren = (children: Array<ChildTemplate>): Array<ChildTemplate> =>
    children.map((child) => ({ ...prune(child), children: pruneChildren(getChildTemplates(child)) }));
  return { ...prune(template), children: pruneChildren(getChildTemplates(template)) };
};

export const formatReplacement = (replacement: TextReplacement): string =>
  replacement.mode === "user_input"
    ? `Replaces ${replacement.search} with text entered by user.`
    : `Replaces ${replacement.search} with root ticket field ${replacement.fieldName}.`;

// Short summary of the words a template replaces, or empty string when it has none.
export const formatTemplateReplacements = (template: Template): string => {
  const replacements = getTemplateReplacements(template);
  if (replacements.length === 0) {
    return "";
  }
  return `Replaces: ${replacements.map((replacement) => replacement.search).join(", ")}.`;
};

// Validates the text replacements. Returns an error message, or null when valid.
// Keep in sync with validateReplacements in backend.js.
export const validateReplacements = (template: Template): string | null => {
  const seen = new Set<string>();
  for (const replacement of getTemplateReplacements(template)) {
    const search = replacement.search ?? "";
    if (search.trim() === "") {
      return "Text replacement is missing the word to replace.";
    }
    if (/\s/.test(search)) {
      return `Text replacement "${search}" must be a single word without spaces.`;
    }
    if (seen.has(search)) {
      return `Text replacement "${search}" is listed more than once.`;
    }
    seen.add(search);
    if (replacement.mode === "field" && !replacement.fieldName) {
      return `Text replacement "${search}" is missing the root ticket field.`;
    }
  }
  return null;
};

export const formatTemplateHierarchy = (template: Template): string => {
  if (!template.hierarchical) {
    return "";
  }
  const count = flattenChildTemplates(getChildTemplates(template)).length;
  return `Hierarchical with ${count} child template${count === 1 ? "" : "s"}.`;
};

// Child add conditions are evaluated on the root ticket (the ticket the hierarchy is created
// from), so their wording names it explicitly, unlike template conditions.
export const formatChildAddCondition = (cond: FieldStateCondition): string =>
  `root ticket field ${cond.fieldName} is ${cond.fieldValue}`;

// "Always added." or "Added when root ticket field Type is Bug, or root ticket field Type is Task."
export const formatChildAddConditions = (child: ChildTemplate): string => {
  const conditions = getChildAddConditions(child);
  if (conditions.length === 0) {
    return "Always added.";
  }
  return `Added when ${conditions.map(formatChildAddCondition).join(", or ")}.`;
};

// Short form of a child's add conditions for previews, e.g. "when Type is Bug or Task", or null
// when the child is always added.
export const formatChildConditionNote = (child: ChildTemplate): string | null => {
  const requiredByField = new Map<string, Array<string>>();
  for (const cond of getChildAddConditions(child)) {
    requiredByField.set(cond.fieldName, [...(requiredByField.get(cond.fieldName) ?? []), cond.fieldValue]);
  }
  if (requiredByField.size === 0) {
    return null;
  }
  const parts = Array.from(requiredByField.entries()).map(
    ([fieldName, values]) => `${fieldName} is ${values.join(" or ")}`,
  );
  return `when ${parts.join(", or ")}`;
};

// A root ticket field that child add conditions depend on: the child templates it decides
// (directly, not counting their subtrees) and the values they require.
export type ChildConditionField = {
  fieldName: string;
  childIds: Array<string>;
  values: Array<string>;
};

export const getChildConditionFields = (template: Template): Array<ChildConditionField> => {
  const byField = new Map<string, ChildConditionField>();
  for (const { child } of flattenChildTemplates(getChildTemplates(template))) {
    for (const cond of getChildAddConditions(child)) {
      const entry = byField.get(cond.fieldName) ?? {
        fieldName: cond.fieldName,
        childIds: [],
        values: [],
      };
      if (!entry.childIds.includes(child.id)) {
        entry.childIds.push(child.id);
      }
      if (!entry.values.includes(cond.fieldValue)) {
        entry.values.push(cond.fieldValue);
      }
      byField.set(cond.fieldName, entry);
    }
  }
  return Array.from(byField.values());
};

// Why unmet conditions skip a child, stating the root ticket's actual values, e.g.
// "root ticket field Type is Feature, requires Bug or Task."
const formatUnmetConditions = (
  conditions: Array<FieldStateCondition>,
  currentFieldValues: Record<string, string | null>,
): string => {
  const requiredByField = new Map<string, Array<string>>();
  for (const cond of conditions) {
    const required = requiredByField.get(cond.fieldName) ?? [];
    required.push(cond.fieldValue);
    requiredByField.set(cond.fieldName, required);
  }
  const parts = Array.from(requiredByField.entries()).map(
    ([fieldName, required]) =>
      `root ticket field ${fieldName} is ${currentFieldValues[fieldName] ?? "empty"}, requires ${required.join(" or ")}`,
  );
  return `${parts.join("; ")}.`;
};

// Whether each child template would be created for a root ticket with the given field values
// (value names keyed by field name), keyed by child template id, with the reason when not.
export type ChildInclusion = { created: boolean; reason: string | null };

export const evaluateChildInclusion = (
  template: Template,
  currentFieldValues: Record<string, string | null>,
): Record<string, ChildInclusion> => {
  const result: Record<string, ChildInclusion> = {};
  const visit = (children: Array<ChildTemplate>, parentCreated: boolean) => {
    for (const child of children) {
      let inclusion: ChildInclusion = { created: true, reason: null };
      const conditions = getChildAddConditions(child);
      if (!parentCreated) {
        inclusion = { created: false, reason: "Parent subtask is not created." };
      } else if (
        conditions.length > 0 &&
        !conditions.some((cond) => currentFieldValues[cond.fieldName] === cond.fieldValue)
      ) {
        inclusion = {
          created: false,
          reason: formatUnmetConditions(conditions, currentFieldValues),
        };
      }
      result[child.id] = inclusion;
      visit(getChildTemplates(child), inclusion.created);
    }
  };
  visit(getChildTemplates(template), true);
  return result;
};

export const formatChildTemplate = (child: ChildTemplate): string => {
  const parts: Array<string> = [];
  if (child.manual) {
    parts.push("Inserted manually.");
  }
  if (getChildAddConditions(child).length > 0) {
    parts.push(formatChildAddConditions(child));
  }
  if (child.inheritParentFields) {
    parts.push("Inherits fields from parent.");
  }
  if (child.inheritRootFields) {
    parts.push("Inherits fields from root ticket.");
  }
  const fields = formatTemplateFields(child);
  if (fields) {
    parts.push(fields);
  }
  return parts.join(" ");
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

// Problems of one child template's own settings, at most one per check, in the order the checks
// have always run: name, add conditions, fields. Relations are checked by validateRelations.
const validateChildSettings = (child: ChildTemplate): Array<TemplateValidationError> => {
  const errors: Array<TemplateValidationError> = [];
  if (!child.name || child.name.trim() === "") {
    errors.push({ section: "general", message: `Child template for article ${child.articleId} needs a name.` });
  }
  const label = child.name && child.name.trim() !== "" ? child.name : child.articleId;
  for (const cond of getChildAddConditions(child)) {
    if (!cond.fieldName) {
      errors.push({ section: "when", message: `Child template "${label}" condition is missing a field name.` });
      break;
    }
    if (!cond.fieldValue) {
      errors.push({ section: "when", message: `Child template "${label}" condition is missing a value.` });
      break;
    }
  }
  const fieldsError = validateFieldList(getTemplateFields(child), `Child template "${label}"`);
  if (fieldsError !== null) {
    errors.push({ section: "effects", message: fieldsError });
  }
  return errors;
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
    const errors = validateChildSettings(child);
    if (errors.length > 0) {
      return errors[0].message;
    }
  }
  return null;
};

// Every problem of one child template, including its relations, by editor section. Empty when
// the child template is fine or the template is not hierarchical (child templates are unused).
export const validateChildTemplate = (
  template: Template,
  child: ChildTemplate,
): Array<TemplateValidationError> => {
  if (!template.hierarchical) {
    return [];
  }
  const errors = validateChildSettings(child);
  const relationsError = validateOwnerRelations(child, `Child template "${child.name}"`);
  if (relationsError !== null) {
    errors.push({ section: "effects", message: relationsError });
  }
  return errors;
};

// Sections of the template editor, used to place validation errors next to their cause.
export type TemplateSection = "general" | "when" | "effects" | "hierarchy";

export type TemplateValidationError = {
  section: TemplateSection;
  message: string;
};

// Validates a template for storing. Returns every problem found, at most one per check, in the
// order the checks were historically run, so the first entry is the message shown before the
// editor listed all errors. Empty when the template can be stored.
export const validateTemplate = (template: Template): Array<TemplateValidationError> => {
  const errors: Array<TemplateValidationError> = [];
  const add = (section: TemplateSection, message: string | null) => {
    if (message !== null) {
      errors.push({ section, message });
    }
  };
  add("general", (template.name ?? "").trim() === "" ? "Template name is required." : null);
  add("general", (template.articleId ?? "").trim() === "" ? "Template article is required." : null);
  add(
    "when",
    getValidConditions(template).length === 0
      ? "Template missing valid conditions, please define when valid."
      : null,
  );
  add("effects", validateTemplateFields(template));
  add("hierarchy", validateChildTemplates(template));
  add("effects", validateReplacements(template));
  add("effects", validateRelations(template));
  return errors;
};

// The template payload to store and its validation errors. The payload keeps the stored shape:
// only relations to child templates that no longer exist are dropped.
export const prepareTemplateForStore = (
  template: Template,
): { template: Template; errors: Array<TemplateValidationError> } => {
  const pruned = pruneDanglingRelations(template);
  return { template: pruned, errors: validateTemplate(pruned) };
};

// New templates start as available for tickets, the most common case, so a template that is
// only named and given an article can be stored right away.
export const createEmptyTemplate = (): Template => ({
  id: uuidv4(),
  name: "",
  articleId: "",
  validCondition: [{ when: "entity_is", entityType: "issue" }],
  addCondition: null,
  fields: [],
  replacements: [],
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
  replacements: [],
  hierarchical: false,
  children: [],
});

// Options of the "Apply automatically" choice in the template editor.
export type AddConditionKey = "none" | AddCondition["when"];

export const getAddConditionKey = (template: Template): AddConditionKey =>
  template.addCondition?.when ?? "none";

// The empty add condition stored when the user picks an "Apply automatically" option.
export const addConditionForKey = (key: AddConditionKey): AddCondition | null => {
  if (key === "field_becomes") {
    return { when: "field_becomes", fieldName: "", fieldValue: "" };
  }
  if (key === "tag_added") {
    return { when: "tag_added", tagName: "" };
  }
  return null;
};

// A copy of the template to store as a new template: new template id, new child template ids
// (relations between child templates follow them), name prefixed with "Copy of".
export const duplicateTemplate = (template: Template): Template => {
  const copy: Template = JSON.parse(JSON.stringify(template));
  const idMap = new Map<string, string>();
  const renumber = (children: Array<ChildTemplate>) => {
    for (const child of children) {
      const newId = uuidv4();
      idMap.set(child.id, newId);
      child.id = newId;
      renumber(getChildTemplates(child));
    }
  };
  renumber(getChildTemplates(copy));
  const remap = (owner: HasRelations) => {
    if (Array.isArray(owner.relations)) {
      owner.relations = owner.relations.map((relation) =>
        relation.target === "child" && idMap.has(relation.childId)
          ? { ...relation, childId: idMap.get(relation.childId) as string }
          : relation,
      );
    }
  };
  remap(copy);
  flattenChildTemplates(getChildTemplates(copy)).forEach(({ child }) => remap(child));
  return { ...copy, id: uuidv4(), name: `Copy of ${template.name}` };
};

const countLabel = (count: number, singular: string, plural: string = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const formatShortValidCondition = (cond: ValidCondition): string => {
  if (cond.when === "entity_is") {
    return cond.entityType === "issue" ? "ticket" : "article";
  }
  if (cond.when === "field_is") {
    return `${cond.fieldName} is ${cond.fieldValue}`;
  }
  return `tag ${cond.tagName}`;
};

// Compact, scannable summary of a template for list rows, e.g.
// ["Ticket or article", "Auto: Type → Task", "3 fields", "11 subtasks"].
export const formatTemplateSummaryTokens = (template: Template): Array<string> => {
  const tokens: Array<string> = [];
  const conditions = getValidConditions(template);
  if (conditions.length > 0) {
    tokens.push(capitalizeFirst(conditions.map(formatShortValidCondition).join(" or ")));
  }
  const addCond = template.addCondition;
  if (addCond?.when === "field_becomes") {
    tokens.push(`Auto: ${addCond.fieldName} → ${addCond.fieldValue}`);
  } else if (addCond?.when === "tag_added") {
    tokens.push(`Auto: tag ${addCond.tagName}`);
  }
  const counts: Array<[number, string, string?]> = [
    [getTemplateFields(template).length, "field"],
    [getTemplateTags(template).length, "tag"],
    [getTemplateRelations(template).length, "relation"],
    [getTemplateReplacements(template).length, "replacement"],
  ];
  for (const [count, singular, plural] of counts) {
    if (count > 0) {
      tokens.push(countLabel(count, singular, plural));
    }
  }
  if (template.hierarchical) {
    tokens.push(countLabel(flattenChildTemplates(getChildTemplates(template)).length, "subtask"));
  }
  return tokens;
};

// The kind of entity a template is applied to.
export type TemplateTarget = "ticket" | "article";

const formatAutoToken = (template: Template): string | null => {
  const addCond = template.addCondition;
  if (addCond?.when === "field_becomes") {
    return `Auto when ${addCond.fieldName} → ${addCond.fieldValue}`;
  }
  if (addCond?.when === "tag_added") {
    return `Auto when tagged ${addCond.tagName}`;
  }
  return null;
};

// What applying a template does, for the apply dialogs, e.g.
// ["Sets Priority", "Asks for Assignee, CUSTOMER", "Tags test4", "Creates 11 subtasks"].
// Articles have no fields or relations, so those are left out for them.
export const formatTemplateEffectTokens = (
  template: Template,
  target: TemplateTarget,
): Array<string> => {
  const tokens: Array<string> = [];
  const forTicket = target === "ticket";
  const fields = forTicket ? getTemplateFields(template) : [];
  const fixedFields = fields.filter((field) => field.mode === "fixed");
  if (fixedFields.length > 0) {
    tokens.push(`Sets ${fixedFields.map((field) => field.fieldName).join(", ")}`);
  }
  const asks = [
    ...fields.filter((field) => field.mode === "user_input").map((field) => field.fieldName),
    ...getTemplateReplacements(template)
      .filter((replacement) => replacement.mode === "user_input")
      .map((replacement) => replacement.search),
  ];
  if (asks.length > 0) {
    tokens.push(`Asks for ${asks.join(", ")}`);
  }
  const tags = getTemplateTags(template);
  if (tags.length > 0) {
    tokens.push(`Tags ${tags.join(", ")}`);
  }
  const relations = forTicket ? getTemplateRelations(template).length : 0;
  if (relations > 0) {
    tokens.push(`Adds ${countLabel(relations, "link")}`);
  }
  const children = template.hierarchical
    ? flattenChildTemplates(getChildTemplates(template)).length
    : 0;
  if (children > 0) {
    // Add conditions only apply to subtasks; sub-articles are always created.
    const conditional = forTicket
      ? flattenChildTemplates(getChildTemplates(template)).filter(
        ({ child }) => getChildAddConditions(child).length > 0,
      ).length
      : 0;
    tokens.push(
      `Creates ${forTicket ? countLabel(children, "subtask") : countLabel(children, "sub-article")}${
        conditional > 0 ? ` (${conditional} conditional)` : ""
      }`,
    );
  }
  if (tokens.length === 0) {
    tokens.push("Adds content only");
  }
  const auto = formatAutoToken(template);
  if (auto !== null) {
    tokens.push(auto);
  }
  return tokens;
};
