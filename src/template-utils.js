// Field types whose values a template can set. Single-value fields with a list of values only.
const SUPPORTED_FIELD_TYPES = ["state[1]", "enum[1]", "user[1]", "version[1]", "ownedField[1]"];

// Field types that can be used in template conditions (must match @types/project-info.ts).
const CONDITION_FIELD_TYPES = ["state[1]", "enum[1]"];

const USER_FIELD_TYPE = "user[1]";

// The YT workflow API Set data-structure somehow doesn't support .map for
// iterating over the items in old self-hosted YT versions. This is a
// workaround where .forEach is used to push items into a new array.
const toArray = (wfSet) => {
  const arr = [];
  wfSet.forEach((x) => arr.push(x));
  return arr;
};

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
const getFieldValueName = (typeName, value) =>
  typeName === USER_FIELD_TYPE ? value.login : value.name;

const getFieldValuePresentation = (typeName, value) =>
  typeName === USER_FIELD_TYPE ? value.fullName : value.presentation;

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

// Current values of the given fields on an issue, keyed by field name (null when empty).
const getIssueFieldValues = (issue, fieldInfos) => {
  const values = {};
  for (const info of fieldInfos) {
    const value = issue.fields[info.name];
    values[info.name] = value ? getFieldValueName(info.typeName, value) : null;
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
    const value =
      projectField.typeName === USER_FIELD_TYPE
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
    assignments.push({ fieldName: field.fieldName, value: value });
  }
  return { assignments: assignments, errors: errors };
};

const applyFieldAssignments = (issue, assignments) => {
  for (const assignment of assignments) {
    issue.fields[assignment.fieldName] = assignment.value;
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
  resolveTemplateFieldValues,
  applyFieldAssignments,
};
