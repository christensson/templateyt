var entities = require("@jetbrains/youtrack-scripting-api/entities");
var dateTime = require("@jetbrains/youtrack-scripting-api/date-time");

// Field types without a list of values, by value kind (must match @types/project-info.ts).
// YouTrack names them without a cardinality suffix ("date", unlike "enum[1]"); the suffixed
// forms are accepted as well.
const SIMPLE_FIELD_KINDS = {
  "date": "date",
  "date[1]": "date",
  "date and time": "datetime",
  "date and time[1]": "datetime",
  "period": "period",
  "period[1]": "period",
  "integer": "integer",
  "integer[1]": "integer",
  "float": "float",
  "float[1]": "float",
  "string": "string",
  "string[1]": "string",
};

// Field types whose values a template can set: fields with a list of values, single-value ([1])
// or multi-value ([*]), and the simple field types above.
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
  ...Object.keys(SIMPLE_FIELD_KINDS),
];

// Field types that can be used in template conditions (must match @types/project-info.ts).
// Conditions on multi-value fields match when the field includes the value.
const CONDITION_FIELD_TYPES = ["state[1]", "enum[1]", "ownedField[1]", "enum[*]", "ownedField[*]"];

const isUserType = (typeName) => typeof typeName === "string" && typeName.indexOf("user[") === 0;

// Value kind of a field type: "date", "datetime", "period", "integer", "float", "string", or
// "list" for fields with a list of values.
const getValueKind = (typeName) => SIMPLE_FIELD_KINDS[typeName] || "list";

const isSimpleType = (typeName) => getValueKind(typeName) !== "list";

const MINUTE_MS = 60000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;
const UNIT_MINUTES = { w: DAYS_PER_WEEK * MINUTES_PER_DAY, d: MINUTES_PER_DAY, h: MINUTES_PER_HOUR, m: 1 };

// Parses a duration like "1w 2d 4h 30m" (each part optional, at least one, in this order).
// allowTime: whether hours and minutes are allowed. Returns { w, d, h, m } or null.
// Keep in sync with parseDuration in @types/template.ts.
const parseDuration = (text, allowTime) => {
  const match = /^\s*(?:(\d+)\s*w)?\s*(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*$/.exec(
    typeof text === "string" ? text : "",
  );
  if (!match || (match[1] === undefined && match[2] === undefined && match[3] === undefined && match[4] === undefined)) {
    return null;
  }
  if (!allowTime && (match[3] !== undefined || match[4] !== undefined)) {
    return null;
  }
  return {
    w: Number(match[1] || 0),
    d: Number(match[2] || 0),
    h: Number(match[3] || 0),
    m: Number(match[4] || 0),
  };
};

const durationMinutes = (duration) =>
  Object.keys(UNIT_MINUTES).reduce((sum, unit) => sum + duration[unit] * UNIT_MINUTES[unit], 0);

// "1w 2d 4h 30m" from the parts that are not zero; "0m" when all are zero.
const formatDuration = (duration) => {
  const parts = Object.keys(UNIT_MINUTES)
    .filter((unit) => duration[unit])
    .map((unit) => `${duration[unit]}${unit}`);
  return parts.length > 0 ? parts.join(" ") : "0m";
};

const getUserTimeZone = () => {
  try {
    const user = entities.User.current;
    return (user && user.timeZoneId) || "UTC";
  } catch {
    return "UTC";
  }
};

// YouTrack stores date-only values as the timestamp of 12:00 UTC on that day.
const NOON_HOUR = 12;
const dateOnlyTimestamp = (year, month, day) => Date.UTC(year, month - 1, day, NOON_HOUR);

// "2026-12-01" for a timestamp, in UTC.
const ISO_DATE_LENGTH = 10;
const toIsoDate = (timestamp) => new Date(timestamp).toISOString().slice(0, ISO_DATE_LENGTH);

const parseIsoDate = (text) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === "string" ? text : "");
  if (!match) {
    return null;
  }
  const timestamp = dateOnlyTimestamp(Number(match[1]), Number(match[2]), Number(match[3]));
  // Rejects dates like 2026-02-31 that Date.UTC rolls over.
  return toIsoDate(timestamp) === text ? timestamp : null;
};

const INTEGER_PATTERN = /^\s*-?\d+\s*$/;
const FLOAT_PATTERN = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

// Parses a date or date-time value: an offset from now when fixed ("+14d", "+2d 4h"), otherwise
// a date ("2026-12-01") or a timestamp in ms. Returns the timestamp or null.
const parseDateValue = (kind, text, isFixed) => {
  if (!isFixed) {
    if (kind === "date") {
      return parseIsoDate(text);
    }
    return /^\d+$/.test(text) ? Number(text) : null;
  }
  const trimmed = text.trim();
  const offset = trimmed.charAt(0) === "+" ? parseDuration(trimmed.slice(1), kind === "datetime") : null;
  if (offset === null) {
    return null;
  }
  if (kind === "datetime") {
    return Date.now() + durationMinutes(offset) * MINUTE_MS;
  }
  const today = dateTime.format(Date.now(), "yyyy-MM-dd", getUserTimeZone()).split("-").map(Number);
  return dateOnlyTimestamp(today[0], today[1], today[2] + offset.w * DAYS_PER_WEEK + offset.d);
};

// Parsers of simple field values other than dates: the value to assign, or null when invalid.
const SIMPLE_VALUE_PARSERS = {
  period: (text) => {
    const duration = parseDuration(text, true);
    return duration === null ? null : dateTime.toPeriod(formatDuration(duration).replace(/ /g, ""));
  },
  integer: (text) => (INTEGER_PATTERN.test(text) ? Number(text) : null),
  float: (text) => (FLOAT_PATTERN.test(text) ? Number(text) : null),
  string: (text) => text,
};

// Parses the stored text of a simple field value into what is assigned to the issue field.
// Fixed date and date-time values are offsets from now ("+14d", "+2d 4h"); values chosen by the
// user are a date ("2026-12-01") or a timestamp in ms. Returns { value } or { error }.
// Keep in sync with isValidSimpleFieldValue in @types/template.ts.
const parseSimpleFieldValue = (kind, text, isFixed) => {
  if (typeof text !== "string" || text.trim() === "") {
    return { error: `Invalid ${kind} value "${text}".` };
  }
  const value =
    kind === "date" || kind === "datetime" ? parseDateValue(kind, text, isFixed) : SIMPLE_VALUE_PARSERS[kind](text);
  return value === null ? { error: `Invalid ${kind} value "${text}".` } : { value: value };
};

// The parts of a period field value (a Joda-Time Period).
const getPeriodDuration = (period) => ({
  w: period.getWeeks(),
  d: period.getDays(),
  h: period.getHours(),
  m: period.getMinutes(),
});

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

// Ids of the template's options that conditions in the child tree depend on.
const getUsedOptionIds = (template) => {
  const ids = [];
  for (const { child } of flattenChildTemplates(template.children)) {
    for (const cond of Array.isArray(child.addConditions) ? child.addConditions : []) {
      if (cond && cond.when === "option_is" && !ids.includes(cond.optionId)) {
        ids.push(cond.optionId);
      }
    }
  }
  return ids;
};

// Answers to the options that child conditions depend on: the chosen boolean (option id to
// boolean in chosen), else the option's default. Options without a default must be answered.
// Returns { values: { optionId: boolean }, errors: [string] }.
const resolveOptionValues = (template, chosen) => {
  const values = {};
  const errors = [];
  const options = Array.isArray(template.options) ? template.options : [];
  for (const optionId of getUsedOptionIds(template)) {
    const option = options.find((candidate) => candidate && candidate.id === optionId);
    if (!option) {
      continue;
    }
    const answer = chosen ? chosen[optionId] : undefined;
    if (typeof answer === "boolean") {
      values[optionId] = answer;
    } else if (typeof option.default === "boolean") {
      values[optionId] = option.default;
    } else {
      errors.push(`Choose Yes or No for option "${option.label}".`);
    }
  }
  return { values: values, errors: errors };
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

// Keys of the projects that may use a template article, or null when it has no restriction
// (articles marked as template before project restrictions existed).
const getTemplateProjectKeys = (article) => {
  const json = article.extensionProperties.templateProjectKeys;
  return json ? parseIdList(json) : null;
};

// True if the template article may be used by templates of the project.
const isArticleSharedWithProject = (article, project) => {
  const keys = getTemplateProjectKeys(article);
  return keys === null || keys.includes(project.key);
};

// True if templates of the project may use the article: articles of the project itself, or
// template articles shared with the project. Unrestricted sharing (no templateProjectKeys) only
// applies to articles still marked as template, so unmarking an article revokes its sharing.
const isUsableTemplateArticle = (article, project) =>
  article.project.key === project.key ||
  (article.extensionProperties.isTemplate === true && isArticleSharedWithProject(article, project));

// The error that prevents templates of the project from using an article that is neither of the
// project nor a template article shared with it, or null.
const getArticleUsageError = (article, project, subject) => {
  if (isUsableTemplateArticle(article, project)) {
    return null;
  }
  if (article.extensionProperties.isTemplate !== true) {
    return `${subject} is from another project and not a template article.`;
  }
  return `${subject} is not shared with project ${project.name}.`;
};

// Validates that the template article and the articles of all child templates exist and may be
// used by templates of the project. findArticle(articleId) returns the article or null. A child
// article must be below the article of its parent (imported) or itself usable by the project
// (inserted; marking an article as template requires permission to update its project).
// Returns an error message or null.
const getTemplateUsageError = (template, project, findArticle) => {
  const root = findArticle(template.articleId);
  if (root === null) {
    return `Template article ${template.articleId} not found or not accessible.`;
  }
  const rootError = getArticleUsageError(root, project, `Template article ${template.articleId}`);
  if (rootError !== null) {
    return rootError;
  }
  const visit = (children, parentArticleId) => {
    for (const child of Array.isArray(children) ? children : []) {
      const article = findArticle(child.articleId);
      if (article === null) {
        return `Child template "${child.name}": article ${child.articleId} not found or not accessible.`;
      }
      // Imported children are covered by the article they are imported from; inserted ones
      // must be usable by the project themselves.
      if (!isArticleBelow(article, parentArticleId)) {
        const error = getArticleUsageError(
          article,
          project,
          `Child template "${child.name}": article ${child.articleId}`,
        );
        if (error !== null) {
          return error;
        }
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

// Validates that the user may read the template article and the articles of all child templates,
// and that templates of the project may use them (see getTemplateUsageError).
const getTemplateArticleError = (template, user, project) =>
  getTemplateUsageError(template, project, (articleId) => findReadableArticle(articleId, user));

// The project of an article, whether it differs from the given project, and whether the article's
// template settings explicitly share it with the given project.
const getArticleProjectInfo = (article, project) => {
  const keys = getTemplateProjectKeys(article);
  return {
    projectKey: article.project.key,
    projectName: article.project.name,
    isOtherProject: article.project.key !== project.key,
    isExplicitlyShared: keys !== null && keys.includes(project.key),
  };
};

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

// Identifier of a simple field value, as a value chosen by the user is sent.
const getSimpleValueName = (kind, value) => {
  if (kind === "date") {
    return toIsoDate(value);
  }
  if (kind === "period") {
    return formatDuration(getPeriodDuration(value));
  }
  return String(value);
};

// Display text of a simple field value.
const getSimpleValuePresentation = (kind, value) => {
  if (kind === "datetime") {
    return dateTime.format(value, "yyyy-MM-dd HH:mm", getUserTimeZone());
  }
  return getSimpleValueName(kind, value);
};

// Identifier stored for a field value: the login for users, the value name for list fields,
// otherwise the value as a value chosen by the user is sent.
const getFieldValueName = (typeName, value) => {
  if (isSimpleType(typeName)) {
    return getSimpleValueName(getValueKind(typeName), value);
  }
  return isUserType(typeName) ? value.login : value.name;
};

const getFieldValuePresentation = (typeName, value) => {
  if (isSimpleType(typeName)) {
    return getSimpleValuePresentation(getValueKind(typeName), value);
  }
  return isUserType(typeName) ? value.fullName : value.presentation;
};

// The values of an issue field as an array: the elements of a multi-value field, or the single
// value; empty when the field is empty.
const getIssueFieldValueList = (issue, typeName, fieldName) => {
  const value = issue.fields[fieldName];
  // Simple fields may hold falsy values such as 0.
  if (value === null || value === undefined || (!isSimpleType(typeName) && !value)) {
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
      values: isSimpleType(field.typeName) ? [] : toArray(field.values).map((value) => ({
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

// All current value names of the given fields on an issue, keyed by field name (empty when the
// field is empty). Used to evaluate conditions on multi-value fields.
const getIssueFieldValueLists = (issue, fieldInfos) => {
  const values = {};
  for (const info of fieldInfos) {
    values[info.name] = getIssueFieldValueList(issue, info.typeName, info.name).map((value) =>
      getFieldValueName(info.typeName, value),
    );
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

// Type name of an issue's field, or null when the project has no such field.
const getIssueFieldTypeName = (issue, fieldName) => {
  const projectField = issue && issue.project ? findProjectField(issue.project, fieldName) : null;
  return projectField ? projectField.typeName : null;
};

// True if a Set of field values holds a value with the given name.
const setHasValueName = (typeName, wfSet, valueName) => {
  if (!wfSet) {
    return false;
  }
  return toArray(wfSet).some((value) => value && getFieldValueName(typeName, value) === valueName);
};

// Whether a condition field of an issue matches a value name. Multi-value fields match when they
// include the value; single-value fields use the workflow API's issue.is, as before.
const issueFieldHasValue = (issue, fieldName, valueName) => {
  const typeName = getIssueFieldTypeName(issue, fieldName);
  if (!isMultiValueType(typeName)) {
    return issue.is(fieldName, valueName);
  }
  return getIssueFieldValueList(issue, typeName, fieldName).some(
    (value) => getFieldValueName(typeName, value) === valueName,
  );
};

// Whether a condition field gets a value in the current change: becomes the value for
// single-value fields, has it added for multi-value fields.
const issueFieldBecomes = (issue, fieldName, valueName) => {
  if (!issue.isChanged(fieldName)) {
    return false;
  }
  const typeName = getIssueFieldTypeName(issue, fieldName);
  if (!isMultiValueType(typeName)) {
    return issue.fields.becomes(fieldName, valueName);
  }
  const field = issue.fields[fieldName];
  return setHasValueName(typeName, field && field.added, valueName);
};

// Whether a condition field loses a value in the current change: was the value before for
// single-value fields, has it removed for multi-value fields.
const issueFieldWas = (issue, fieldName, valueName) => {
  if (!issue.isChanged(fieldName)) {
    return false;
  }
  const typeName = getIssueFieldTypeName(issue, fieldName);
  if (!isMultiValueType(typeName)) {
    return issue.was(fieldName, valueName);
  }
  const field = issue.fields[fieldName];
  return setHasValueName(typeName, field && field.removed, valueName);
};

// Whether a condition field of a new issue holds a value: equals it for single-value fields,
// includes it for multi-value fields.
const newIssueFieldHasValue = (issue, fieldName, valueName) => {
  const typeName = getIssueFieldTypeName(issue, fieldName);
  if (!isMultiValueType(typeName)) {
    const value = issue.fields[fieldName];
    return Boolean(value) && value.name === valueName;
  }
  return issueFieldHasValue(issue, fieldName, valueName);
};

// The add conditions of a child template that count: all of them for tickets; for articles
// (rootIssue null) only option conditions, since articles have no fields.
// Whether the template adds a summary comment when its hierarchy is created; off when missing
// (templates stored before the setting existed). Keep in sync with hasSummaryComment in
// @types/template.ts.
const hasSummaryComment = (template) =>
  Boolean(template) && template.summaryComment === true && template.hierarchical === true;

const getChildActiveConditions = (rootIssue, child) => {
  const all = Array.isArray(child.addConditions) ? child.addConditions : [];
  return rootIssue == null ? all.filter((cond) => cond && cond.when === "option_is") : all;
};

// Whether one add condition of a child template matches; see isChildTemplateAdded.
const isChildConditionMet = (rootIssue, cond, valueOverrides, optionValues) => {
  if (cond && cond.when === "option_is") {
    return Boolean(optionValues) && optionValues[cond.optionId] === cond.value;
  }
  if (!cond || cond.when !== "field_is" || rootIssue == null) {
    return false;
  }
  const override = valueOverrides ? valueOverrides[cond.fieldName] : undefined;
  if (Array.isArray(override)) {
    return override.includes(cond.fieldValue);
  }
  return typeof override === "string"
    ? override === cond.fieldValue
    : issueFieldHasValue(rootIssue, cond.fieldName, cond.fieldValue);
};

// A child template is added when it has no add conditions or any of them matches: a field
// condition the root ticket (the ticket the hierarchy is created from), an option condition the
// answer in optionValues (option id to boolean, see resolveOptionValues). rootIssue is null for
// article hierarchies: articles have no fields, so field conditions are ignored there, as they
// always were, and only option conditions count.
// valueOverrides (value name, or list of value names for multi-value fields, by field name) holds
// root ticket field values that are being set in the same request; they are used instead of the
// root ticket's current values. Conditions on multi-value fields match when the field includes the
// value.
const isChildTemplateAdded = (rootIssue, child, valueOverrides, optionValues) => {
  const conditions = getChildActiveConditions(rootIssue, child);
  if (conditions.length === 0) {
    return true;
  }
  return conditions.some((cond) => isChildConditionMet(rootIssue, cond, valueOverrides, optionValues));
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
      if (issueFieldHasValue(ytIssue, cond.fieldName, cond.fieldValue)) {
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

// The value to assign for a value name: a value of the field's list, or the parsed value of a
// simple field. isFixed: the name is a fixed template value (dates are offsets from now).
// Returns { value } or { error }.
const resolveFieldValue = (projectField, fieldName, valueName, isFixed) => {
  if (isSimpleType(projectField.typeName)) {
    const parsed = parseSimpleFieldValue(getValueKind(projectField.typeName), valueName, isFixed);
    return parsed.error ? { error: `${parsed.error.slice(0, -1)} for field "${fieldName}".` } : parsed;
  }
  const value = findFieldValue(projectField, valueName);
  return value === null ? { error: `Value "${valueName}" not found for field "${fieldName}".` } : { value };
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
    const resolved = resolveFieldValue(projectField, field.fieldName, valueName, field.mode === "fixed");
    if (resolved.error) {
      errors.push(resolved.error);
      continue;
    }
    assignments.push({
      fieldName: field.fieldName,
      typeName: projectField.typeName,
      value: resolved.value,
      multi: isMultiValueType(projectField.typeName),
      additive: field.additive === true,
    });
  }
  return { assignments: assignments, errors: errors };
};

// Errors for fixed values of simple fields that do not parse, for the template and all its child
// templates. Fields missing in the project are not reported: templates may be shared.
const getFixedValueErrors = (project, template) => {
  const errors = [];
  const check = (owner, prefix) => {
    for (const field of Array.isArray(owner.fields) ? owner.fields : []) {
      if (field.mode !== "fixed") {
        continue;
      }
      const projectField = findProjectField(project, field.fieldName);
      if (projectField === null || !isSimpleType(projectField.typeName)) {
        continue;
      }
      const parsed = parseSimpleFieldValue(getValueKind(projectField.typeName), field.fieldValue, true);
      if (parsed.error) {
        errors.push(`${prefix}${parsed.error.slice(0, -1)} for field "${field.fieldName}".`);
      }
    }
  };
  check(template, "");
  for (const { child } of flattenChildTemplates(template.children)) {
    check(child, `Child template "${child.name}": `);
  }
  return errors;
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
    // A null value only clears the field, e.g. when all values of a condition field are removed.
    if (assignment.value !== null) {
      set.add(assignment.value);
    }
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

const TITLE_SOURCES = ["article"];
const TITLE_WHENS = ["always", "if_empty"];

// The title setting of a template ({ source, when }), or null when the template keeps the title:
// templates stored before titles could be set, and unknown or malformed settings.
// Keep in sync with getTemplateTitle in @types/template.ts.
const getTemplateTitleSetting = (template) => {
  const title = template ? template.title : null;
  if (
    title == null ||
    typeof title !== "object" ||
    !TITLE_SOURCES.includes(title.source) ||
    !TITLE_WHENS.includes(title.when)
  ) {
    return null;
  }
  return title;
};

// The title the template sets, or null when it keeps the title. templateArticle must be the
// template article as checked by the caller for use by the project (and the user, where one
// applies it), exactly as for its content; null when the check failed, so that the title of an
// article the project may not use never leaks.
const getTemplateTitleText = (template, templateArticle) => {
  if (getTemplateTitleSetting(template) === null || templateArticle == null) {
    return null;
  }
  const text = templateArticle.summary ? templateArticle.summary.trim() : "";
  return text === "" ? null : text;
};

// Whether a title setting replaces currentTitle. An empty title is always set. replaceChoice is
// the user's answer when applying manually; without one (workflows, older clients) only "always"
// replaces an existing title.
const shouldSetTitle = (currentTitle, setting, replaceChoice) => {
  if (setting === null) {
    return false;
  }
  if ((currentTitle || "").trim() === "") {
    return true;
  }
  if (typeof replaceChoice === "boolean") {
    return replaceChoice;
  }
  return setting.when === "always";
};

// The title after applying the template: the template's title when it is set, else currentTitle.
const pickTemplateTitle = (currentTitle, template, templateArticle, replaceChoice) => {
  const text = getTemplateTitleText(template, templateArticle);
  if (text === null || !shouldSetTitle(currentTitle, getTemplateTitleSetting(template), replaceChoice)) {
    return currentTitle;
  }
  return text;
};

// Sets the summary of the ticket or article to the template's title when it applies; assigns
// only on change. Returns whether the title was changed.
const applyTemplateTitle = (entity, template, templateArticle, replaceChoice) => {
  const current = entity.summary || "";
  const next = pickTemplateTitle(current, template, templateArticle, replaceChoice);
  if (next === current) {
    return false;
  }
  entity.summary = next;
  return true;
};


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
  if (override === null) {
    // The field is cleared in the same request.
    return { value: null, error: `Root ticket field "${replacement.fieldName}" is empty.`, empty: true };
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
    const resolved = resolveFieldValue(projectField, fieldName, valueName, false);
    if (resolved.error) {
      errors.push(resolved.error);
      continue;
    }
    assignments.push({
      fieldName: fieldName,
      typeName: projectField.typeName,
      value: resolved.value,
      multi: isMultiValueType(projectField.typeName),
      additive: false,
    });
    overrides[fieldName] = getFieldValuePresentation(projectField.typeName, resolved.value);
  }
  return { assignments: assignments, overrides: overrides, errors: errors };
};

// Value names chosen for a condition field: a list for multi-value fields (a single name is
// accepted as a one-element list), a single name for single-value fields; null when nothing usable
// was sent. An empty list is valid for multi-value fields and clears the field.
const getChosenConditionValues = (multi, chosen) => {
  if (multi) {
    if (Array.isArray(chosen)) {
      const names = chosen.filter((name) => typeof name === "string" && name !== "");
      return names.filter((name, idx) => names.indexOf(name) === idx);
    }
    return typeof chosen === "string" && chosen !== "" ? [chosen] : null;
  }
  return typeof chosen === "string" && chosen !== "" ? chosen : null;
};

const sameValueNames = (a, b) => a.length === b.length && a.every((name) => b.includes(name));

// New values chosen for root ticket fields that child add conditions depend on, keyed by field
// name: a value name for single-value fields, a list of value names for multi-value fields (the
// list replaces the field's values). Only condition fields of the template's child tree with a
// condition field type are accepted, and only values different from the current ones; other keys
// are ignored. Returns { assignments, valueOverrides: { fieldName: valueName | [valueName] },
// errors } without modifying anything; assignments have the shape of resolveTemplateFieldValues.
const resolveConditionFieldInputs = (issue, template, valuesByField) => {
  const assignments = [];
  const valueOverrides = {};
  const errors = [];
  for (const fieldName of getChildConditionFieldNames(template)) {
    const projectField = findProjectField(issue.project, fieldName);
    if (projectField === null || !CONDITION_FIELD_TYPES.includes(projectField.typeName)) {
      continue;
    }
    const typeName = projectField.typeName;
    const multi = isMultiValueType(typeName);
    const chosen = getChosenConditionValues(multi, valuesByField ? valuesByField[fieldName] : null);
    if (chosen === null) {
      continue;
    }
    const currentNames = getIssueFieldValueList(issue, typeName, fieldName).map((value) =>
      getFieldValueName(typeName, value),
    );
    const chosenNames = multi ? chosen : [chosen];
    if (sameValueNames(chosenNames, currentNames)) {
      continue;
    }
    const resolved = [];
    for (const valueName of chosenNames) {
      const value = findFieldValue(projectField, valueName);
      if (value === null) {
        errors.push(`Value "${valueName}" not found for field "${fieldName}".`);
      } else {
        resolved.push(value);
      }
    }
    if (resolved.length !== chosenNames.length) {
      continue;
    }
    if (!multi) {
      assignments.push({ fieldName, typeName, value: resolved[0], multi: false, additive: false });
    } else if (resolved.length === 0) {
      assignments.push({ fieldName, typeName, value: null, multi: true, additive: false });
    } else {
      resolved.forEach((value, idx) =>
        assignments.push({ fieldName, typeName, value, multi: true, additive: idx > 0 }),
      );
    }
    valueOverrides[fieldName] = chosen;
  }
  return { assignments: assignments, valueOverrides: valueOverrides, errors: errors };
};

// Display texts the issue's fields will have after the assignments, keyed by field name, so that
// replacements insert the values being set rather than the previous ones. A field cleared by an
// assignment without a value maps to null.
const getAssignmentOverrides = (issue, assignments) => {
  const overrides = {};
  for (const assignment of assignments) {
    if (assignment.value === null) {
      overrides[assignment.fieldName] = null;
      continue;
    }
    const text = getFieldValuePresentation(assignment.typeName, assignment.value);
    let current = null;
    if (assignment.multi && assignment.additive) {
      // Later values of a multi-value field add to the earlier assignments of the same request.
      current = assignment.fieldName in overrides
        ? overrides[assignment.fieldName]
        : getFieldPresentationText(issue, assignment.typeName, assignment.fieldName);
    }
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
  getValueKind,
  parseSimpleFieldValue,
  getFixedValueErrors,
  toArray,
  getTemplates,
  isTemplateValidForIssue,
  isTemplateValidForArticle,
  getProjectFieldInfo,
  getIssueFieldValues,
  getIssueFieldValueLists,
  getIssueFieldPresentations,
  issueFieldHasValue,
  issueFieldBecomes,
  issueFieldWas,
  newIssueFieldHasValue,
  templateHasUserInput,
  applyReplacements,
  getTemplateTitleSetting,
  getTemplateTitleText,
  shouldSetTitle,
  pickTemplateTitle,
  applyTemplateTitle,
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
  isChildConditionMet,
  hasSummaryComment,
  getChildActiveConditions,
  resolveOptionValues,
  isArticleReadableBy,
  findReadableArticle,
  isArticleBelow,
  getArticleProjectInfo,
  getTemplateArticleError,
  getTemplateProjectKeys,
  isArticleSharedWithProject,
  isUsableTemplateArticle,
  getTemplateUsageError,
  getArticleTree,
  getCreatedHierarchyTemplateIds,
  markHierarchyCreated,
  getStoredReplacementTexts,
  storeReplacementTexts,
  clearStoredReplacementTexts,
};
