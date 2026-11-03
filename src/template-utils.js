var entities = require("@jetbrains/youtrack-scripting-api/entities");

// Field types whose values a template can set: fields with a list of values, single-value ([1])
// or multi-value ([*]).
const SUPPORTED_FIELD_TYPES = [
  "state[1]",
  "enum[1]",
  "user[1]",
  "version[1]",
  "build[1]",
  "ownedField[1]",
  "enum[*]",
  "user[*]",
  "version[*]",
  "build[*]",
  "ownedField[*]",
];

// Field types that can be used in template conditions (must match @types/project-info.ts).
const CONDITION_FIELD_TYPES = ["state[1]", "enum[1]"];

const isUserType = (typeName) => typeof typeName === "string" && typeName.indexOf("user[") === 0;

// Multi-value fields hold a Set of values.
const isMultiValueType = (typeName) => typeof typeName === "string" && typeName.endsWith("[*]");

// The YT workflow API Set data-structure somehow doesn't support .map for
// iterating over the items in old self-hosted YT versions. This is a
// workaround where .forEach is used to push items into a new array.
const toArray = (wfSet) => {
  const arr = [];
  wfSet.forEach((x) => arr.push(x));
  return arr;
};

// Parses a JSON encoded array of ids stored in an extension property; [] when unset or invalid.
const parseIdList = (json) => {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeChildTemplates = (children) =>
  (Array.isArray(children) ? children : []).map((child) => ({
    ...child,
    fields: Array.isArray(child.fields) ? child.fields : [],
    tags: Array.isArray(child.tags) ? child.tags : [],
    relations: Array.isArray(child.relations) ? child.relations : [],
    addConditions: Array.isArray(child.addConditions) ? child.addConditions : [],
    inheritParentFields: child.inheritParentFields === true,
    inheritRootFields: child.inheritRootFields === true,
    manual: child.manual === true,
    children: normalizeChildTemplates(child.children),
  }));

// Child templates in tree order with their depth.
const flattenChildTemplates = (children, depth) =>
  (Array.isArray(children) ? children : []).flatMap((child) => [
    { child: child, depth: depth || 0 },
    ...flattenChildTemplates(child.children, (depth || 0) + 1),
  ]);

// A child template is added when it has no add conditions or any of them matches the root
// ticket (the ticket the hierarchy is created from).
// valueOverrides (value name by field name) holds root ticket field values that are being set in
// the same request; they are used instead of the root ticket's current values.
const isChildTemplateAdded = (rootIssue, child, valueOverrides) => {
  const conditions = Array.isArray(child.addConditions) ? child.addConditions : [];
  if (conditions.length === 0) {
    return true;
  }
  return conditions.some((cond) => {
    if (cond.when !== "field_is") {
      return false;
    }
    const override = valueOverrides ? valueOverrides[cond.fieldName] : undefined;
    return typeof override === "string"
      ? override === cond.fieldValue
      : rootIssue.is(cond.fieldName, cond.fieldValue);
  });
};

// Names of the root ticket fields that add conditions in the child tree depend on.
const getChildConditionFieldNames = (template) => {
  const names = [];
  const visit = (children) => {
    for (const child of Array.isArray(children) ? children : []) {
      for (const cond of Array.isArray(child.addConditions) ? child.addConditions : []) {
        if (cond.when === "field_is" && !names.includes(cond.fieldName)) {
          names.push(cond.fieldName);
        }
      }
      visit(child.children);
    }
  };
  visit(template.children);
  return names;
};

// True if the user may read the article: READ_ARTICLE in the article's project and, when the
// article's visibility is restricted, the author or listed in permittedUsers/permittedGroups.
const isArticleReadableBy = (article, user) => {
  if (article == null || user == null) {
    return false;
  }
  if (!user.hasPermission("READ_ARTICLE", article.project)) {
    return false;
  }
  const users = article.permittedUsers ? toArray(article.permittedUsers) : [];
  const groups = article.permittedGroups ? toArray(article.permittedGroups) : [];
  if (users.length === 0 && groups.length === 0) {
    return true;
  }
  if (article.author != null && article.author.login === user.login) {
    return true;
  }
  return (
    users.some((permitted) => permitted.login === user.login) ||
    groups.some((group) => user.isInGroup(group.name))
  );
};

// The article with the id if it exists and the user may read it, otherwise null. Both cases give
// the same result so that callers cannot reveal whether an inaccessible article exists.
const findReadableArticle = (articleId, user) => {
  if (typeof articleId !== "string" || articleId === "") {
    return null;
  }
  const article = entities.Article.findById(articleId);
  return isArticleReadableBy(article, user) ? article : null;
};

// True if the article is below the article with ancestorId in the article tree.
const isArticleBelow = (article, ancestorId) => {
  let parent = article.parentArticle;
  while (parent != null) {
    if (parent.id === ancestorId) {
      return true;
    }
    parent = parent.parentArticle;
  }
  return false;
};

// Validates that the user may read the template article and the articles of all child templates.
// A child article must be a template article (inserted; marking an article as template requires
// permission to update its project) or below the article of its parent (imported).
// Returns an error message or null.
const getTemplateArticleError = (template, user) => {
  if (findReadableArticle(template.articleId, user) === null) {
    return `Template article ${template.articleId} not found or not accessible.`;
  }
  const visit = (children, parentArticleId) => {
    for (const child of Array.isArray(children) ? children : []) {
      const article = findReadableArticle(child.articleId, user);
      if (article === null) {
        return `Child template "${child.name}": article ${child.articleId} not found or not accessible.`;
      }
      const isTemplateArticle = article.extensionProperties.isTemplate === true;
      if (!isTemplateArticle && !isArticleBelow(article, parentArticleId)) {
        return `Child template "${child.name}": article ${child.articleId} is neither a template article nor below ${parentArticleId}.`;
      }
      const error = visit(child.children, child.articleId);
      if (error !== null) {
        return error;
      }
    }
    return null;
  };
  return visit(template.children, template.articleId);
};

// The project of an article, and whether it differs from the given project.
const getArticleProjectInfo = (article, project) => ({
  projectKey: article.project.key,
  projectName: article.project.name,
  isOtherProject: article.project.key !== project.key,
});

// Article tree below an article, in the shape the config UI imports. Child articles the user may
// not read are left out together with their subtrees.
const getArticleTree = (article, user, project) => ({
  articleId: article.id,
  summary: article.summary,
  ...getArticleProjectInfo(article, project),
  children: toArray(article.childArticles)
    .filter((child) => isArticleReadableBy(child, user))
    .map((child) => getArticleTree(child, user, project)),
});

const getTemplates = (ctx) => {
  const templatesJson = ctx.project.extensionProperties.templates;
  const templates = templatesJson ? JSON.parse(templatesJson) : [];

  // Convert old template format to new format.
  templates.forEach((t) => {
    // Convert validCondition to array if needed.
    if (t.validCondition == null) {
      t.validCondition = [];
    } else if (!Array.isArray(t.validCondition)) {
      t.validCondition = [t.validCondition];
    }
    // Templates stored before field support have no fields.
    if (!Array.isArray(t.fields)) {
      t.fields = [];
    }
    // Templates stored before tag support have no tags.
    if (!Array.isArray(t.tags)) {
      t.tags = [];
    }
    // Templates stored before relation support have no relations.
    if (!Array.isArray(t.relations)) {
      t.relations = [];
    }
    // Templates stored before replacement support have no replacements.
    if (!Array.isArray(t.replacements)) {
      t.replacements = [];
    }
    // Templates stored before hierarchy support have no children.
    t.hierarchical = t.hierarchical === true;
    t.children = normalizeChildTemplates(t.children);
  });

  // Filter incomplete templates.
  return templates.filter((t) => t.id && t.articleId);
};

const isTemplateValidForIssue = (ytIssue, template) => {
  const conditions = Array.isArray(template.validCondition) ? template.validCondition : [];
  if (conditions.length === 0) {
    return false;
  }
  for (const cond of conditions) {
    if (!cond || !cond.when) {
      continue;
    }
    if (cond.when === "entity_is") {
      if (cond.entityType === "issue") {
        return true;
      }
    } else if (cond.when === "field_is") {
      if (ytIssue.is(cond.fieldName, cond.fieldValue)) {
        return true;
      }
    } else if (cond.when === "tag_is") {
      if (ytIssue.hasTag(cond.tagName)) {
        return true;
      }
    }
  }
  return false;
};

const isTemplateValidForArticle = (ytArticle, template) => {
  const conditions = Array.isArray(template.validCondition) ? template.validCondition : [];
  if (conditions.length === 0) {
    return false;
  }
  for (const cond of conditions) {
    if (!cond || !cond.when) {
      continue;
    }
    if (cond.when === "entity_is") {
      if (cond.entityType === "article") {
        return true;
      }
    } else if (cond.when === "tag_is") {
      if (ytArticle.hasTag(cond.tagName)) {
        return true;
      }
    }
    // Note: field_is doesn't apply to articles, ignore.
  }
  return false;
};

// Identifier stored for a field value: the login for users, otherwise the value name.
const getFieldValueName = (typeName, value) => (isUserType(typeName) ? value.login : value.name);

const getFieldValuePresentation = (typeName, value) =>
  isUserType(typeName) ? value.fullName : value.presentation;

// The values of an issue field as an array: the elements of a multi-value field, or the single
// value; empty when the field is empty.
const getIssueFieldValueList = (issue, typeName, fieldName) => {
  const value = issue.fields[fieldName];
  if (!value) {
    return [];
  }
  return isMultiValueType(typeName) ? toArray(value) : [value];
};

// Display text of an issue field: all values comma separated, or null when empty.
const getFieldPresentationText = (issue, typeName, fieldName) => {
  const values = getIssueFieldValueList(issue, typeName, fieldName);
  if (values.length === 0) {
    return null;
  }
  return values.map((value) => getFieldValuePresentation(typeName, value)).join(", ");
};

// Info about the project fields a template can set or use in conditions, in the shape
// of ProjectFieldInfo in @types/project-info.ts.
const getProjectFieldInfo = (project) =>
  toArray(project.fields)
    .filter((field) => SUPPORTED_FIELD_TYPES.includes(field.typeName))
    .map((field) => ({
      name: field.name,
      typeName: field.typeName,
      values: toArray(field.values).map((value) => ({
        name: getFieldValueName(field.typeName, value),
        presentation: getFieldValuePresentation(field.typeName, value),
      })),
    }));

// Current values of the given fields on an issue, keyed by field name (null when empty). For
// multi-value fields this is the first value, used to preselect a single choice.
const getIssueFieldValues = (issue, fieldInfos) => {
  const values = {};
  for (const info of fieldInfos) {
    const list = getIssueFieldValueList(issue, info.typeName, info.name);
    values[info.name] = list.length > 0 ? getFieldValueName(info.typeName, list[0]) : null;
  }
  return values;
};

// Display texts of the given fields on an issue, keyed by field name (null when empty).
const getIssueFieldPresentations = (issue, fieldInfos) => {
  const values = {};
  for (const info of fieldInfos) {
    values[info.name] = getFieldPresentationText(issue, info.typeName, info.name);
  }
  return values;
};

const findProjectField = (project, fieldName) => {
  try {
    return project.findFieldByName(fieldName) || null;
  } catch {
    return null;
  }
};

const findFieldValue = (projectField, valueName) => {
  try {
    const value = isUserType(projectField.typeName)
      ? projectField.findValueByLogin(valueName)
      : projectField.findValueByName(valueName);
    return value || null;
  } catch {
    return null;
  }
};

// Picks the value name a template field should be set to, or null when the field is skipped.
const getTemplateFieldValueName = (field, userValues, includeUserInput) => {
  if (field.mode === "fixed") {
    return field.fieldValue || null;
  }
  if (field.mode === "user_input" && includeUserInput) {
    return (userValues && userValues[field.fieldName]) || null;
  }
  return null;
};

// Resolves the values a template sets on an issue without modifying anything.
// User-input fields use userValues (keyed by field name) and are skipped when absent or when
// includeUserInput is false. Returns { assignments: [{ fieldName, value }], errors: [string] }.
const resolveTemplateFieldValues = (project, template, userValues, includeUserInput) => {
  const assignments = [];
  const errors = [];
  const fields = Array.isArray(template.fields) ? template.fields : [];
  for (const field of fields) {
    const valueName = getTemplateFieldValueName(field, userValues, includeUserInput);
    if (valueName === null) {
      continue;
    }
    const projectField = findProjectField(project, field.fieldName);
    if (projectField === null) {
      errors.push(`Field "${field.fieldName}" does not exist in project.`);
      continue;
    }
    if (!SUPPORTED_FIELD_TYPES.includes(projectField.typeName)) {
      errors.push(`Field "${field.fieldName}" has unsupported type ${projectField.typeName}.`);
      continue;
    }
    const value = findFieldValue(projectField, valueName);
    if (value === null) {
      errors.push(`Value "${valueName}" not found for field "${field.fieldName}".`);
      continue;
    }
    assignments.push({
      fieldName: field.fieldName,
      typeName: projectField.typeName,
      value: value,
      multi: isMultiValueType(projectField.typeName),
      additive: field.additive === true,
    });
  }
  return { assignments: assignments, errors: errors };
};

// Single-value fields are assigned; multi-value fields get the value added, after clearing the
// existing values unless the assignment is additive.
const applyFieldAssignments = (issue, assignments) => {
  for (const assignment of assignments) {
    if (!assignment.multi) {
      issue.fields[assignment.fieldName] = assignment.value;
      continue;
    }
    const set = issue.fields[assignment.fieldName];
    if (!assignment.additive) {
      set.clear();
    }
    set.add(assignment.value);
  }
};

// Resolves the tags a template adds without modifying anything. Only existing tags visible to the
// current user are used: Issue.addTag would otherwise create a new private tag.
// Returns { tagNames: [string], errors: [string] }.
const resolveTemplateTags = (template) => {
  const tagNames = [];
  const errors = [];
  for (const name of Array.isArray(template.tags) ? template.tags : []) {
    if (entities.Tag.findTagByName(name) == null) {
      errors.push(`Tag "${name}" not found.`);
      continue;
    }
    tagNames.push(name);
  }
  return { tagNames: tagNames, errors: errors };
};

// Adds the tags to an issue or article, skipping those it already has.
const applyTags = (entity, tagNames) => {
  for (const name of tagNames) {
    if (!entity.hasTag(name)) {
      entity.addTag(name);
    }
  }
};

const getRelations = (template) => (Array.isArray(template.relations) ? template.relations : []);

// The links of the issue for a link direction name, or null when the name is unknown.
const getLinkSet = (issue, linkName) => {
  try {
    const links = issue.links[linkName];
    return links === undefined || links === null ? null : links;
  } catch {
    // Unknown link names may throw instead of being undefined.
    return null;
  }
};

// Resolves a template's relations to fixed tickets without modifying anything. The target must
// exist and be visible to the user. Link names are checked on linkIssue: the source issue, or the
// root issue for subtasks not created yet.
// Returns { links: [{ linkName, target }], errors: [string] }.
const resolveFixedRelations = (linkIssue, template, user) => {
  const links = [];
  const errors = [];
  for (const relation of getRelations(template)) {
    if (relation.target !== "fixed") {
      continue;
    }
    if (getLinkSet(linkIssue, relation.linkName) === null) {
      errors.push(`Relation "${relation.linkName}" is not a known link type.`);
      continue;
    }
    const target = entities.Issue.findById(relation.issueId);
    if (target == null || !target.isVisibleTo(user)) {
      errors.push(`Ticket ${relation.issueId} for relation "${relation.linkName}" not found or not accessible.`);
      continue;
    }
    links.push({ linkName: relation.linkName, target: target });
  }
  return { links: links, errors: errors };
};

// Errors for relations within the hierarchy whose link name is unknown, checked on the root
// issue before anything is created.
const getHierarchyRelationErrors = (rootIssue, template) =>
  getRelations(template)
    .filter((relation) => relation.target !== "fixed" && getLinkSet(rootIssue, relation.linkName) === null)
    .map((relation) => `Relation "${relation.linkName}" is not a known link type.`);

// Adds the links, skipping targets that are already linked with the same link name.
const applyRelations = (source, links) => {
  for (const link of links) {
    const set = getLinkSet(source, link.linkName);
    if (set === null || link.target.id === source.id) {
      continue;
    }
    if (!toArray(set).some((linked) => linked.id === link.target.id)) {
      set.add(link.target);
    }
  }
};

// Copies a field value between issues; multi-value fields (Sets) are copied element by element.
const copyFieldValue = (fromIssue, toIssue, fieldName) => {
  const value = fromIssue.fields[fieldName];
  if (value && typeof value.forEach === "function") {
    const target = toIssue.fields[fieldName];
    target.clear();
    value.forEach((element) => target.add(element));
    return;
  }
  toIssue.fields[fieldName] = value;
};

const templateHasUserInputFields = (template) =>
  Array.isArray(template.fields) && template.fields.some((field) => field.mode === "user_input");

const templateHasUserInputReplacements = (template) =>
  Array.isArray(template.replacements) &&
  template.replacements.some((replacement) => replacement.mode === "user_input");

// Whether applying the template needs input from the user: field values or replacement texts.
const templateHasUserInput = (template) =>
  templateHasUserInputFields(template) || templateHasUserInputReplacements(template);

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Regex matching `search` as a whole word: delimited by start/end, whitespace or punctuation,
// where letters, digits, underscore and hyphen are word characters (so VERSION does not match in
// VERSION-1 or MY_VERSION). Uses Unicode letter classes when the engine supports them.
const buildWordRegex = (search) => {
  const escaped = escapeRegex(search);
  try {
    return new RegExp(`(^|[^\\p{L}\\p{N}_-])(${escaped})(?=$|[^\\p{L}\\p{N}_-])`, "gu");
  } catch {
    return new RegExp(`(^|[^\\w\\u00C0-\\uFFFF-])(${escaped})(?=$|[^\\w\\u00C0-\\uFFFF-])`, "g");
  }
};

// Replaces every whole-word occurrence of each { search, value } in text.
const applyReplacements = (text, values) => {
  if (!text) {
    return text;
  }
  let result = text;
  for (const replacement of values) {
    if (!replacement.search || replacement.value == null) {
      continue;
    }
    // A function replacer keeps "$" in the value literal.
    result = result.replace(buildWordRegex(replacement.search), (match, prefix) => prefix + replacement.value);
  }
  return result;
};

// Display text of a root ticket field for a field replacement: { value, error, empty }.
// fieldOverrides (display text by field name) holds values being set in the same request, used
// instead of the issue's current value.
const resolveFieldReplacement = (rootIssue, replacement, fieldOverrides) => {
  if (rootIssue === null) {
    return {
      value: null,
      error: `Replacement of ${replacement.search} uses root ticket field ${replacement.fieldName}, which is not available for articles.`,
      empty: false,
    };
  }
  const override = fieldOverrides ? fieldOverrides[replacement.fieldName] : undefined;
  if (typeof override === "string" && override !== "") {
    return { value: override, error: null, empty: false };
  }
  const projectField = findProjectField(rootIssue.project, replacement.fieldName);
  if (projectField === null) {
    return {
      value: null,
      error: `Root ticket field "${replacement.fieldName}" does not exist in project.`,
      empty: false,
    };
  }
  if (!SUPPORTED_FIELD_TYPES.includes(projectField.typeName)) {
    return {
      value: null,
      error: `Root ticket field "${replacement.fieldName}" has unsupported type ${projectField.typeName}.`,
      empty: false,
    };
  }
  const text = getFieldPresentationText(rootIssue, projectField.typeName, replacement.fieldName);
  if (text === null) {
    return { value: null, error: `Root ticket field "${replacement.fieldName}" is empty.`, empty: true };
  }
  return { value: text, error: null, empty: false };
};

const getFieldReplacementNames = (template) => {
  const replacements = Array.isArray(template.replacements) ? template.replacements : [];
  const names = [];
  for (const replacement of replacements) {
    if (replacement.mode === "field" && !names.includes(replacement.fieldName)) {
      names.push(replacement.fieldName);
    }
  }
  return names;
};

// Values chosen by the user for empty root ticket fields that field replacements use, keyed by
// field name. Only fields used by a field replacement of the template and empty on the issue are
// accepted; other keys are ignored. Returns { assignments, overrides: { fieldName: text },
// errors } without modifying anything; assignments have the shape of resolveTemplateFieldValues.
const resolveReplacementFieldInputs = (issue, template, valuesByField) => {
  const assignments = [];
  const overrides = {};
  const errors = [];
  for (const fieldName of getFieldReplacementNames(template)) {
    const valueName = valuesByField ? valuesByField[fieldName] : null;
    if (typeof valueName !== "string" || valueName === "") {
      continue;
    }
    const projectField = findProjectField(issue.project, fieldName);
    // Missing or unsupported fields are reported by resolveReplacements.
    if (projectField === null || !SUPPORTED_FIELD_TYPES.includes(projectField.typeName)) {
      continue;
    }
    if (getIssueFieldValueList(issue, projectField.typeName, fieldName).length > 0) {
      continue;
    }
    const value = findFieldValue(projectField, valueName);
    if (value === null) {
      errors.push(`Value "${valueName}" not found for field "${fieldName}".`);
      continue;
    }
    assignments.push({
      fieldName: fieldName,
      typeName: projectField.typeName,
      value: value,
      multi: isMultiValueType(projectField.typeName),
      additive: false,
    });
    overrides[fieldName] = getFieldValuePresentation(projectField.typeName, value);
  }
  return { assignments: assignments, overrides: overrides, errors: errors };
};

// New values chosen for root ticket fields that child add conditions depend on, keyed by field
// name. Only condition fields of the template's child tree with a condition field type are
// accepted, and only values different from the current one; other keys are ignored. Returns
// { assignments, valueOverrides: { fieldName: valueName }, errors } without modifying anything;
// assignments have the shape of resolveTemplateFieldValues.
const resolveConditionFieldInputs = (issue, template, valuesByField) => {
  const assignments = [];
  const valueOverrides = {};
  const errors = [];
  for (const fieldName of getChildConditionFieldNames(template)) {
    const valueName = valuesByField ? valuesByField[fieldName] : null;
    if (typeof valueName !== "string" || valueName === "") {
      continue;
    }
    const projectField = findProjectField(issue.project, fieldName);
    if (projectField === null || !CONDITION_FIELD_TYPES.includes(projectField.typeName)) {
      continue;
    }
    const current = issue.fields[fieldName];
    if (current && getFieldValueName(projectField.typeName, current) === valueName) {
      continue;
    }
    const value = findFieldValue(projectField, valueName);
    if (value === null) {
      errors.push(`Value "${valueName}" not found for field "${fieldName}".`);
      continue;
    }
    assignments.push({
      fieldName: fieldName,
      typeName: projectField.typeName,
      value: value,
      multi: false,
      additive: false,
    });
    valueOverrides[fieldName] = valueName;
  }
  return { assignments: assignments, valueOverrides: valueOverrides, errors: errors };
};

// Display texts the issue's fields will have after the assignments, keyed by field name, so that
// replacements insert the values being set rather than the previous ones.
const getAssignmentOverrides = (issue, assignments) => {
  const overrides = {};
  for (const assignment of assignments) {
    const text = getFieldValuePresentation(assignment.typeName, assignment.value);
    const current =
      assignment.multi && assignment.additive
        ? getFieldPresentationText(issue, assignment.typeName, assignment.fieldName)
        : null;
    overrides[assignment.fieldName] =
      current === null || current.split(", ").includes(text) ? current || text : `${current}, ${text}`;
  }
  return overrides;
};

// True when any user-input field of the template has no value in userValues.
const hasMissingUserInput = (template, userValues) => {
  const fields = Array.isArray(template.fields) ? template.fields : [];
  return fields.some(
    (field) => field.mode === "user_input" && !(userValues && userValues[field.fieldName]),
  );
};

// Resolves the texts a template's replacements insert. Field replacements read the root issue
// (null for articles); user-input replacements use userTexts (keyed by search word) and are
// skipped when includeUserInput is false. fieldOverrides (display text by field name) replaces
// root ticket field values that are being set in the same request. Returns
// { values: [{ search, value }], errors, missingInputs: [search], emptyFields: [fieldName] }.
const resolveReplacements = (rootIssue, template, userTexts, includeUserInput, fieldOverrides) => {
  const values = [];
  const errors = [];
  const missingInputs = [];
  const emptyFields = [];
  const replacements = Array.isArray(template.replacements) ? template.replacements : [];
  for (const replacement of replacements) {
    if (replacement.mode === "user_input") {
      if (!includeUserInput) {
        continue;
      }
      const text =
        userTexts && typeof userTexts[replacement.search] === "string"
          ? userTexts[replacement.search]
          : "";
      if (text.trim() === "") {
        missingInputs.push(replacement.search);
        continue;
      }
      values.push({ search: replacement.search, value: text });
      continue;
    }
    const fieldValue = resolveFieldReplacement(rootIssue, replacement, fieldOverrides);
    if (fieldValue.error !== null) {
      errors.push(fieldValue.error);
      if (fieldValue.empty && !emptyFields.includes(replacement.fieldName)) {
        emptyFields.push(replacement.fieldName);
      }
    } else {
      values.push({ search: replacement.search, value: fieldValue.value });
    }
  }
  return { values: values, errors: errors, missingInputs: missingInputs, emptyFields: emptyFields };
};

// Templates applied to the issue whose user-input fields have not been set yet.
const getPendingTemplateIds = (issue) =>
  parseIdList(issue.extensionProperties.templateIdsWithPendingUserFields);

const setPendingTemplateIds = (issue, ids) => {
  issue.extensionProperties.templateIdsWithPendingUserFields = JSON.stringify(ids);
};

const markTemplatePending = (issue, templateId) => {
  const ids = getPendingTemplateIds(issue);
  if (!ids.includes(templateId)) {
    ids.push(templateId);
    setPendingTemplateIds(issue, ids);
  }
};

const clearTemplatePending = (issue, templateId) => {
  const ids = getPendingTemplateIds(issue);
  if (ids.includes(templateId)) {
    setPendingTemplateIds(
      issue,
      ids.filter((id) => id !== templateId),
    );
  }
};

// Texts the user entered for user-input replacements, per applied template, stored on the issue
// or article so that later steps (set fields, create hierarchy) can offer them again:
// { [templateId]: { [search]: text } }. Unset or invalid JSON reads as {}.
const getStoredReplacementTexts = (entity) => {
  const json = entity.extensionProperties.templateReplacementTexts;
  if (!json) {
    return {};
  }
  try {
    const parsed = JSON.parse(json);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const setStoredReplacementTexts = (entity, stored) => {
  entity.extensionProperties.templateReplacementTexts = JSON.stringify(stored);
};

// Stores the non-empty texts of the template's user-input replacements; other keys are dropped.
// Writes only when the stored texts change.
const storeReplacementTexts = (entity, template, texts) => {
  const replacements = Array.isArray(template.replacements) ? template.replacements : [];
  const kept = {};
  for (const replacement of replacements) {
    const text = texts ? texts[replacement.search] : undefined;
    if (replacement.mode === "user_input" && typeof text === "string" && text.trim() !== "") {
      kept[replacement.search] = text;
    }
  }
  const stored = getStoredReplacementTexts(entity);
  const hasKept = Object.keys(kept).length > 0;
  if (JSON.stringify(stored[template.id]) === JSON.stringify(hasKept ? kept : undefined)) {
    return;
  }
  if (hasKept) {
    stored[template.id] = kept;
  } else {
    delete stored[template.id];
  }
  setStoredReplacementTexts(entity, stored);
};

const clearStoredReplacementTexts = (entity, templateId) => {
  const stored = getStoredReplacementTexts(entity);
  if (templateId in stored) {
    delete stored[templateId];
    setStoredReplacementTexts(entity, stored);
  }
};

// Templates whose hierarchy has been created below the issue or article.
const getCreatedHierarchyTemplateIds = (entity) =>
  parseIdList(entity.extensionProperties.createdHierarchyTemplateIds);

const markHierarchyCreated = (entity, templateId) => {
  const ids = getCreatedHierarchyTemplateIds(entity);
  if (!ids.includes(templateId)) {
    ids.push(templateId);
    entity.extensionProperties.createdHierarchyTemplateIds = JSON.stringify(ids);
  }
};

module.exports = {
  SUPPORTED_FIELD_TYPES,
  CONDITION_FIELD_TYPES,
  toArray,
  getTemplates,
  isTemplateValidForIssue,
  isTemplateValidForArticle,
  getProjectFieldInfo,
  getIssueFieldValues,
  getIssueFieldPresentations,
  templateHasUserInput,
  applyReplacements,
  resolveReplacements,
  resolveReplacementFieldInputs,
  resolveConditionFieldInputs,
  getAssignmentOverrides,
  resolveTemplateFieldValues,
  applyFieldAssignments,
  resolveTemplateTags,
  applyTags,
  resolveFixedRelations,
  getHierarchyRelationErrors,
  applyRelations,
  copyFieldValue,
  parseIdList,
  templateHasUserInputFields,
  hasMissingUserInput,
  getPendingTemplateIds,
  markTemplatePending,
  clearTemplatePending,
  flattenChildTemplates,
  isChildTemplateAdded,
  isArticleReadableBy,
  findReadableArticle,
  isArticleBelow,
  getArticleProjectInfo,
  getTemplateArticleError,
  getArticleTree,
  getCreatedHierarchyTemplateIds,
  markHierarchyCreated,
  getStoredReplacementTexts,
  storeReplacementTexts,
  clearStoredReplacementTexts,
};
