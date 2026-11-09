var entities = require("@jetbrains/youtrack-scripting-api/entities");
var utils = require("./template-utils");

const storeTemplates = (ctx, templates) => {
  const props = ctx.project.extensionProperties;
  props.templates = JSON.stringify(templates);
};

const badRequest = (ctx, message) => {
  ctx.response.status = 400;
  ctx.response.json({ success: false, message: message });
};

// Endpoints needing more than one permission declare one of them and check the rest here.
// A `permissions` array means *any* of the listed permissions, and the object form
// `{ allOf: [...] }` that requires all of them is not accepted by YouTrack 2026.2 (upload fails
// with "Script output property 'permissions' should be stored as type Array").
// Returns true if the current user has the permission in the project, otherwise responds 403.
const requirePermission = (ctx, permission, project, action) => {
  if (ctx.currentUser.hasPermission(permission, project)) {
    return true;
  }
  ctx.response.status = 403;
  ctx.response.json({
    success: false,
    message: `You need the ${permission} permission in project ${project.name} to ${action}.`,
  });
  return false;
};

// Returns an error message if the valid-condition is inconsistent, otherwise null.
const validateValidCondition = (cond) => {
  if (cond.hasOwnProperty("when") === false) {
    return 'Inconsistent validCondition, missing "when" property.';
  }
  switch (cond.when) {
    case "field_is":
      if (cond.hasOwnProperty("fieldName") === false || cond.hasOwnProperty("fieldValue") === false) {
        return 'Inconsistent validCondition, missing "fieldName" or "fieldValue" property.';
      }
      return null;
    case "tag_is":
      if (cond.hasOwnProperty("tagName") === false) {
        return 'Inconsistent validCondition, missing "tagName" property.';
      }
      return null;
    case "entity_is":
      if (cond.hasOwnProperty("entityType") === false) {
        return 'Inconsistent validCondition, missing "entityType" property.';
      }
      return null;
    default:
      return `Inconsistent validCondition, unknown when value: ${cond.when}`;
  }
};

// Returns an error message if the add-condition is inconsistent, otherwise null.
const validateAddCondition = (cond) => {
  if (cond.hasOwnProperty("when") === false) {
    return 'Inconsistent addCondition, missing "when" property.';
  }
  switch (cond.when) {
    case "field_becomes":
      if (cond.hasOwnProperty("fieldName") === false || cond.hasOwnProperty("fieldValue") === false) {
        return 'Inconsistent addCondition, missing "fieldName" or "fieldValue" property.';
      }
      return null;
    case "tag_added":
    case "tag_removed":
      if (cond.hasOwnProperty("tagName") === false) {
        return 'Inconsistent addCondition, missing "tagName" property.';
      }
      return null;
    default:
      return `Inconsistent addCondition, unknown when value: ${cond.when}`;
  }
};

const TEMPLATE_FIELD_MODES = ["fixed", "user_input"];

// Validates a field list. `subject` prefixes the messages. Returns an error message or null.
// Keep in sync with validateFieldList in @types/template.ts.
const validateFieldList = (fields, subject) => {
  const seen = [];
  for (const field of fields) {
    if (!field || typeof field.fieldName !== "string" || field.fieldName === "") {
      return `${subject} field is missing a field name, please select a field.`;
    }
    if (seen.includes(field.fieldName)) {
      return `${subject} field "${field.fieldName}" is listed more than once.`;
    }
    seen.push(field.fieldName);
    if (!TEMPLATE_FIELD_MODES.includes(field.mode)) {
      return `${subject} field "${field.fieldName}" has unknown mode "${field.mode}".`;
    }
    if (field.mode === "fixed" && (typeof field.fieldValue !== "string" || field.fieldValue === "")) {
      return `${subject} field "${field.fieldName}" is missing a value.`;
    }
    if (field.additive !== undefined && typeof field.additive !== "boolean") {
      return `${subject} field "${field.fieldName}" additive must be a boolean.`;
    }
  }
  return null;
};

// Validates the tag names of a template or child template. Returns an error message or null.
const validateTagList = (tags, subject) => {
  if (tags === undefined) {
    return null;
  }
  if (!Array.isArray(tags)) {
    return `${subject} tags is not an array.`;
  }
  for (const tag of tags) {
    if (typeof tag !== "string" || tag.trim() === "") {
      return `${subject} has an empty tag.`;
    }
    if (tags.indexOf(tag) !== tags.lastIndexOf(tag)) {
      return `${subject} adds tag "${tag}" more than once.`;
    }
  }
  return null;
};

const validateTemplateTags = (template) => validateTagList(template.tags, "Template");

// Returns an error message if the template field list is inconsistent, otherwise null.
// Keep in sync with validateTemplateFields in @types/template.ts.
const validateTemplateFields = (template) => {
  const fields = template.fields;
  if (fields === undefined) {
    return null;
  }
  if (!Array.isArray(fields)) {
    return "Template fields is not an array.";
  }
  const listError = validateFieldList(fields, "Template");
  if (listError !== null) {
    return listError;
  }

  // A template must never set its own trigger field to another value than the one that
  // triggers it, otherwise applying the template would undo the condition that added it.
  // Values added to a multi-value field (additive) keep the trigger value and are allowed.
  const addCond = template.addCondition;
  if (addCond && addCond.when === "field_becomes") {
    const conflict = fields.find(
      (field) =>
        field.fieldName === addCond.fieldName &&
        field.additive !== true &&
        (field.mode !== "fixed" || field.fieldValue !== addCond.fieldValue),
    );
    if (conflict) {
      return `Field "${addCond.fieldName}" is used in the automatic add condition and can only be set to "${addCond.fieldValue}".`;
    }
  }
  return null;
};

// Validates the add conditions of a child template. optionIds: ids of the template's options.
// Returns an error message or null.
// Keep in sync with validateChildTemplates in @types/template.ts.
const validateChildAddConditions = (child, optionIds) => {
  const conditions = child.addConditions;
  if (conditions === undefined) {
    return null;
  }
  if (!Array.isArray(conditions)) {
    return `Child template "${child.name}" addConditions is not an array.`;
  }
  for (const cond of conditions) {
    if (cond && cond.when === "option_is") {
      if (typeof cond.optionId !== "string" || !optionIds.includes(cond.optionId)) {
        return `Child template "${child.name}" has a condition on a removed option.`;
      }
      if (typeof cond.value !== "boolean") {
        return `Child template "${child.name}" option condition is missing Yes or No.`;
      }
      continue;
    }
    if (!cond || cond.when !== "field_is") {
      return `Child template "${child.name}" condition has an unknown type.`;
    }
    if (typeof cond.fieldName !== "string" || cond.fieldName === "") {
      return `Child template "${child.name}" condition is missing a field name.`;
    }
    if (typeof cond.fieldValue !== "string" || cond.fieldValue === "") {
      return `Child template "${child.name}" condition is missing a value.`;
    }
  }
  return null;
};

const CHILD_FLAGS = ["inheritParentFields", "inheritRootFields", "manual"];

// Validates the optional boolean flags of a child template. Returns an error message or null.
const validateChildFlags = (child) => {
  for (const flag of CHILD_FLAGS) {
    if (child[flag] !== undefined && typeof child[flag] !== "boolean") {
      return `Child template "${child.name}" ${flag} must be a boolean.`;
    }
  }
  return null;
};

// Validates the own properties of one child template (not its children).
const validateChildOwnProperties = (child, optionIds) => {
  if (!child || typeof child.id !== "string" || child.id === "") {
    return "Child template is missing an id.";
  }
  if (typeof child.articleId !== "string" || child.articleId === "") {
    return "Child template is missing an articleId.";
  }
  if (typeof child.name !== "string" || child.name.trim() === "") {
    return `Child template for article ${child.articleId} needs a name.`;
  }
  if (child.fields !== undefined && !Array.isArray(child.fields)) {
    return `Child template "${child.name}" fields is not an array.`;
  }
  const fieldsError = validateFieldList(child.fields || [], `Child template "${child.name}"`);
  if (fieldsError !== null) {
    return fieldsError;
  }
  const tagsError = validateTagList(child.tags, `Child template "${child.name}"`);
  if (tagsError !== null) {
    return tagsError;
  }
  const conditionsError = validateChildAddConditions(child, optionIds);
  if (conditionsError !== null) {
    return conditionsError;
  }
  return validateChildFlags(child);
};

// Validates a list of child templates recursively. Returns an error message or null.
const validateChildList = (children, ownerName, optionIds) => {
  if (children === undefined) {
    return null;
  }
  if (!Array.isArray(children)) {
    return `Children of "${ownerName}" is not an array.`;
  }
  for (const child of children) {
    const ownError = validateChildOwnProperties(child, optionIds);
    if (ownError !== null) {
      return ownError;
    }
    const nestedError = validateChildList(child.children, child.name, optionIds);
    if (nestedError !== null) {
      return nestedError;
    }
  }
  return null;
};

const REPLACEMENT_MODES = ["user_input", "field"];

// Validates the text replacements of a template. Returns an error message or null.
// Keep in sync with validateReplacements in @types/template.ts.
const validateReplacements = (template) => {
  const replacements = template.replacements;
  if (replacements === undefined) {
    return null;
  }
  if (!Array.isArray(replacements)) {
    return "Template replacements is not an array.";
  }
  const seen = [];
  for (const replacement of replacements) {
    const search = replacement && typeof replacement.search === "string" ? replacement.search : "";
    if (search.trim() === "") {
      return "Text replacement is missing the word to replace.";
    }
    if (/\s/.test(search)) {
      return `Text replacement "${search}" must be a single word without spaces.`;
    }
    if (seen.includes(search)) {
      return `Text replacement "${search}" is listed more than once.`;
    }
    seen.push(search);
    if (!REPLACEMENT_MODES.includes(replacement.mode)) {
      return `Text replacement "${search}" has unknown mode "${replacement.mode}".`;
    }
    if (
      replacement.mode === "field" &&
      (typeof replacement.fieldName !== "string" || replacement.fieldName === "")
    ) {
      return `Text replacement "${search}" is missing the root ticket field.`;
    }
  }
  return null;
};

// Error text for a resolveReplacements result, or null when everything resolved.
const getReplacementError = (resolved) => {
  if (resolved.errors.length > 0) {
    return resolved.errors.join(" ");
  }
  if (resolved.missingInputs.length > 0) {
    return resolved.missingInputs.map((search) => `Text for ${search} is required.`).join(" ");
  }
  return null;
};

// Assigns summary and description only when the replacements changed them.
const applyReplacementsToIssue = (issue, values) => {
  if (values.length === 0) {
    return;
  }
  const newSummary = utils.applyReplacements(issue.summary || "", values);
  if (newSummary !== (issue.summary || "")) {
    issue.summary = newSummary;
  }
  const newDescription = utils.applyReplacements(issue.description || "", values);
  if (newDescription !== (issue.description || "")) {
    issue.description = newDescription;
  }
};

// Validates the hierarchy settings of a template. Returns an error message or null.
// Keep in sync with validateChildTemplates in @types/template.ts.
const validateChildTemplates = (template) => {
  if (template.hierarchical !== undefined && typeof template.hierarchical !== "boolean") {
    return "Template hierarchical must be a boolean.";
  }
  const optionIds = (Array.isArray(template.options) ? template.options : [])
    .filter((option) => option && typeof option.id === "string")
    .map((option) => option.id);
  const listError = validateChildList(template.children, template.name || template.id, optionIds);
  if (listError !== null) {
    return listError;
  }
  if (template.hierarchical === true && utils.flattenChildTemplates(template.children).length === 0) {
    return "Hierarchical template has no child templates, import child articles first.";
  }
  return null;
};

// Validates the options of a template. Returns an error message or null.
// Keep in sync with validateTemplateOptions in @types/template.ts.
const validateTemplateOptions = (template) => {
  const options = template.options;
  if (options === undefined) {
    return null;
  }
  if (!Array.isArray(options)) {
    return "Template options is not an array.";
  }
  const ids = [];
  const labels = [];
  for (const option of options) {
    const label = option && typeof option.label === "string" ? option.label.trim() : "";
    if (label === "") {
      return "Every option needs a name.";
    }
    if (labels.includes(label.toLowerCase())) {
      return `Option "${label}" is defined twice.`;
    }
    if (typeof option.id !== "string" || option.id === "" || ids.includes(option.id)) {
      return `Option "${label}" has a missing or duplicate id.`;
    }
    if (option.default !== null && typeof option.default !== "boolean") {
      return `Option "${label}" has an invalid default.`;
    }
    labels.push(label.toLowerCase());
    ids.push(option.id);
  }
  return null;
};

const RELATION_TARGETS = ["root", "child", "fixed"];

// Validates one relation of the template (ownerId null) or of a child template.
const validateRelation = (relation, ownerId, subject, childIds, user) => {
  if (!relation || typeof relation.linkName !== "string" || relation.linkName.trim() === "") {
    return `${subject} has a relation without link type.`;
  }
  if (!RELATION_TARGETS.includes(relation.target)) {
    return `${subject} relation "${relation.linkName}" has an invalid target.`;
  }
  if (relation.target === "root" && ownerId === null) {
    return `${subject} relation "${relation.linkName}" cannot target the template's own ticket.`;
  }
  if (relation.target === "child") {
    if (!childIds.includes(relation.childId)) {
      return `${subject} relation "${relation.linkName}" targets an unknown child template.`;
    }
    if (relation.childId === ownerId) {
      return `${subject} relation "${relation.linkName}" cannot target its own ticket.`;
    }
  }
  if (relation.target === "fixed") {
    const issue =
      typeof relation.issueId === "string" && relation.issueId !== ""
        ? entities.Issue.findById(relation.issueId)
        : null;
    if (issue == null || !issue.isVisibleTo(user)) {
      return `${subject} relation "${relation.linkName}" targets ticket ${relation.issueId}, which is not found or not accessible.`;
    }
  }
  return null;
};

// Validates the relations of a template and its child templates; fixed tickets must be
// accessible to the user. Returns an error message or null.
const validateTemplateRelations = (template, user) => {
  const flat = utils.flattenChildTemplates(template.children);
  const childIds = flat.map(({ child }) => child.id);
  const owners = [{ owner: template, ownerId: null, subject: "Template" }].concat(
    flat.map(({ child }) => ({
      owner: child,
      ownerId: child.id,
      subject: `Child template "${child.name}"`,
    })),
  );
  for (const { owner, ownerId, subject } of owners) {
    if (owner.relations === undefined) {
      continue;
    }
    if (!Array.isArray(owner.relations)) {
      return `${subject} relations is not an array.`;
    }
    for (const relation of owner.relations) {
      const error = validateRelation(relation, ownerId, subject, childIds, user);
      if (error !== null) {
        return error;
      }
    }
  }
  return null;
};

// Project of each article referenced by the templates (root and child articles) that the user may
// read, keyed by article id.
const getTemplateArticleProjects = (templates, project, user) => {
  const result = {};
  const add = (articleId) => {
    if (result[articleId] !== undefined) {
      return;
    }
    const article = utils.findReadableArticle(articleId, user);
    if (article !== null) {
      result[articleId] = {
        ...utils.getArticleProjectInfo(article, project),
        isShared: utils.isUsableTemplateArticle(article, project),
      };
    }
  };
  for (const template of templates) {
    add(template.articleId);
    for (const { child } of utils.flattenChildTemplates(template.children)) {
      add(child.articleId);
    }
  }
  return result;
};

// Looks up a template referenced by templateId in a request body.
// Returns { template, error } where exactly one of them is set.
const lookupRequestTemplate = (templates, body, verb) => {
  if (body.hasOwnProperty("templateId") === false || body.templateId === "") {
    return { template: null, error: `Failed to ${verb} template, no templateId.` };
  }
  const template = templates.find((t) => t.id === body.templateId);
  if (!template) {
    return {
      template: null,
      error: `Failed to ${verb} template, template ${body.templateId} doesn't exist.`,
    };
  }
  return { template: template, error: null };
};

// The template article if the user may read it and templates of the project may use it,
// otherwise null.
const findUsableTemplateArticle = (articleId, user, project) => {
  const article = utils.findReadableArticle(articleId, user);
  return article !== null && utils.isUsableTemplateArticle(article, project) ? article : null;
};

// Returns an error message if the template is invalid, otherwise null.
const validateTemplate = (template) => {
  if (template.hasOwnProperty("id") === false || template.id === "") {
    return "Template must have a valid id.";
  }
  if (template.hasOwnProperty("validCondition") === false) {
    return "Template must have a valid validCondition.";
  }
  if (template.hasOwnProperty("addCondition") === false) {
    return "Template must have a valid addCondition.";
  }
  if (!Array.isArray(template.validCondition)) {
    return "Template validCondition is not an array.";
  }
  for (const cond of template.validCondition) {
    const error = validateValidCondition(cond);
    if (error !== null) {
      return error;
    }
  }
  if (template.addCondition !== null) {
    const error = validateAddCondition(template.addCondition);
    if (error !== null) {
      return error;
    }
  }
  const validators = [
    validateTemplateFields,
    validateTemplateTags,
    validateChildTemplates,
    validateTemplateOptions,
    validateReplacements,
  ];
  for (const validate of validators) {
    const error = validate(template);
    if (error !== null) {
      return error;
    }
  }
  const articleId = template?.articleId;
  if (articleId === undefined || articleId === "") {
    return "Template must have a valid articleId.";
  }
  return null;
};

// Child templates that will be created, in tree order, skipping those whose add conditions do
// not match together with their subtrees. rootIssue is null for articles. valueOverrides: root
// field values being set in the same request; optionValues: answers to the template's options
// (see utils.isChildTemplateAdded).
const getAddedChildTemplates = (rootIssue, children, valueOverrides, optionValues) =>
  (Array.isArray(children) ? children : []).flatMap((child) =>
    utils.isChildTemplateAdded(rootIssue, child, valueOverrides, optionValues)
      ? [child, ...getAddedChildTemplates(rootIssue, child.children, valueOverrides, optionValues)]
      : [],
  );

// Resolves everything a hierarchy creation needs (articles, field values and tags) without
// creating anything, so that a bad value leaves the ticket untouched.
// Returns { errors: [string], byChildId: { [childId]: { content, assignments, tagNames,
// fixedLinks } } }.
const planHierarchy = (rootIssue, template, childFieldValues, user, valueOverrides, optionValues) => {
  const project = rootIssue.project;
  // The template article and inserted child articles must still be usable by the project; their
  // sharing may have changed since the template was saved.
  const usageError = utils.getTemplateArticleError(template, user, project);
  const errors = usageError !== null ? [usageError] : [];
  const byChildId = {};
  for (const child of getAddedChildTemplates(
    rootIssue,
    template.children,
    valueOverrides,
    optionValues,
  )) {
    const article = utils.findReadableArticle(child.articleId, user);
    if (article === null) {
      errors.push(
        `Article ${child.articleId} for child template "${child.name}" not found or not accessible.`,
      );
      continue;
    }
    const userValues = childFieldValues ? childFieldValues[child.id] : null;
    const resolved = utils.resolveTemplateFieldValues(project, child, userValues, true);
    const tags = utils.resolveTemplateTags(child);
    const relations = utils.resolveFixedRelations(rootIssue, child, user);
    const childErrors = resolved.errors.concat(
      tags.errors,
      relations.errors,
      utils.getHierarchyRelationErrors(rootIssue, child),
    );
    for (const error of childErrors) {
      errors.push(`Child template "${child.name}": ${error}`);
    }
    byChildId[child.id] = {
      content: article.content ? article.content.trim() : "",
      assignments: resolved.assignments,
      tagNames: tags.tagNames,
      fixedLinks: relations.links,
    };
  }
  return { errors: errors, byChildId: byChildId };
};

// Links of the hierarchy relations of a template or child template whose target ticket was
// created: the root ticket or the subtask of a child template.
// Returns { links: [{ linkName, target }], skipped: number }.
const resolveHierarchyLinks = (owner, rootIssue, createdById) => {
  const links = [];
  let skipped = 0;
  const relations = Array.isArray(owner.relations) ? owner.relations : [];
  for (const relation of relations) {
    if (relation.target === "fixed") {
      continue;
    }
    const target = relation.target === "root" ? rootIssue : createdById[relation.childId];
    if (target === undefined) {
      skipped += 1;
      continue;
    }
    links.push({ linkName: relation.linkName, target: target });
  }
  return { links: links, skipped: skipped };
};

// Adds the relations of the root template and of the created subtasks once all subtasks exist.
// Returns the number of relations skipped because their target was not created.
const linkHierarchy = (rootIssue, template, createdById, plan) => {
  let skipped = 0;
  const rootLinks = resolveHierarchyLinks(template, rootIssue, createdById);
  utils.applyRelations(rootIssue, rootLinks.links);
  skipped += rootLinks.skipped;
  for (const { child } of utils.flattenChildTemplates(template.children)) {
    const ticket = createdById[child.id];
    if (ticket === undefined) {
      continue;
    }
    const childLinks = resolveHierarchyLinks(child, rootIssue, createdById);
    utils.applyRelations(ticket, childLinks.links.concat(plan.byChildId[child.id].fixedLinks));
    skipped += childLinks.skipped;
  }
  return skipped;
};

// Resolves everything an article hierarchy creation needs (articles and tags) without creating
// anything. Articles have no fields, so field conditions, fields and inheritance do not apply;
// option conditions do (optionValues, see utils.resolveOptionValues).
// Returns { errors: [string], byChildId: { [childId]: { content, tagNames } } }.
const planArticleHierarchy = (template, user, project, optionValues) => {
  // The template article and inserted child articles must still be usable by the project; their
  // sharing may have changed since the template was saved.
  const usageError = utils.getTemplateArticleError(template, user, project);
  const errors = usageError !== null ? [usageError] : [];
  const byChildId = {};
  for (const child of getAddedChildTemplates(null, template.children, {}, optionValues)) {
    const article = utils.findReadableArticle(child.articleId, user);
    if (article === null) {
      errors.push(
        `Article ${child.articleId} for child template "${child.name}" not found or not accessible.`,
      );
      continue;
    }
    const tags = utils.resolveTemplateTags(child);
    for (const error of tags.errors) {
      errors.push(`Child template "${child.name}": ${error}`);
    }
    byChildId[child.id] = {
      content: article.content ? article.content.trim() : "",
      tagNames: tags.tagNames,
    };
  }
  return { errors: errors, byChildId: byChildId };
};

// Returns the error that prevents creating the hierarchy of the template for the article, or null.
const getArticleHierarchyError = (article, template) => {
  if (article.extensionProperties.isTemplate === true) {
    return "Failed to create hierarchy, cannot create below a template article.";
  }
  if (!utils.parseIdList(article.extensionProperties.usedTemplateIds).includes(template.id)) {
    return `Failed to create hierarchy, template ${template.id} is not applied to this article.`;
  }
  if (!template.hierarchical || utils.flattenChildTemplates(template.children).length === 0) {
    return "Failed to create hierarchy, template has no child templates.";
  }
  return null;
};

const uniqueNames = (names) => names.filter((name, index) => names.indexOf(name) === index);

exports.httpHandler = {
  endpoints: [
    {
      scope: "project",
      method: "GET",
      path: "templates",
      permissions: ["UPDATE_PROJECT"],
      handle: function handle(ctx) {
        const templates = utils.getTemplates(ctx);
        ctx.response.json({
          templates: templates,
          articleProjects: getTemplateArticleProjects(templates, ctx.project, ctx.currentUser),
        });
      },
    },
    {
      scope: "project",
      method: "POST",
      path: "addTemplate",
      permissions: ["UPDATE_PROJECT"],
      handle: function handle(ctx) {
        const body = JSON.parse(ctx.request.body);
        const newTemplate = body.template;
        const validationError =
          validateTemplate(newTemplate) ||
          utils.getFixedValueErrors(ctx.project, newTemplate)[0] ||
          utils.getTemplateArticleError(newTemplate, ctx.currentUser, ctx.project) ||
          validateTemplateRelations(newTemplate, ctx.currentUser);
        if (validationError !== null) {
          badRequest(ctx, validationError);
          return;
        }

        const templates = utils.getTemplates(ctx);

        const template = templates.find((t) => t.id === newTemplate.id);
        if (template) {
          // Update existing entry.
          Object.assign(template, newTemplate);
        } else {
          // Add new entry.
          templates.push(newTemplate);
        }
        storeTemplates(ctx, templates);
        ctx.response.json({ success: true, templates: templates });
      },
    },
    {
      scope: "project",
      method: "DELETE",
      path: "removeTemplate",
      permissions: ["UPDATE_PROJECT"],
      handle: function handle(ctx) {
        const body = JSON.parse(ctx.request.body);
        if (body.hasOwnProperty("id") === false || body.id === "") {
          ctx.response.status = 400;
          ctx.response.json({ success: false, message: "Id missing in request." });
          return;
        }
        const id = body.id;
        const oldTemplates = utils.getTemplates(ctx);
        const updatedTemplates = oldTemplates.filter((t) => t.id !== id);
        storeTemplates(ctx, updatedTemplates);
        ctx.response.json({ success: true, templates: updatedTemplates });
      },
    },
    {
      scope: "project",
      method: "GET",
      path: "getProjectInfo",
      permissions: ["UPDATE_PROJECT"],
      handle: function handle(ctx) {
        ctx.response.json({ fields: utils.getProjectFieldInfo(ctx.project) });
      },
    },
    {
      scope: "project",
      method: "GET",
      path: "getTemplateArticles",
      permissions: ["UPDATE_PROJECT"],
      // Template articles of all projects that the user may read and that are shared with
      // this project.
      handle: function handle(ctx) {
        const templateArticles = entities.Article.findByExtensionProperties({
          isTemplate: true,
        });
        const articles = utils
          .toArray(templateArticles)
          .filter(
            (x) =>
              utils.isArticleReadableBy(x, ctx.currentUser) &&
              utils.isArticleSharedWithProject(x, ctx.project),
          )
          .map((x) => ({
            articleId: x.id,
            summary: x.summary,
            ...utils.getArticleProjectInfo(x, ctx.project),
          }));

        ctx.response.json(articles);
      },
    },
    {
      scope: "project",
      method: "POST",
      path: "getChildArticles",
      permissions: ["UPDATE_PROJECT"],
      // Returns the article tree below the given article, for importing child templates.
      handle: function handle(ctx) {
        const body = JSON.parse(ctx.request.body);
        const articleId = body.articleId;
        if (typeof articleId !== "string" || articleId === "") {
          badRequest(ctx, "No articleId in request.");
          return;
        }
        const article = utils.findReadableArticle(articleId, ctx.currentUser);
        if (article === null) {
          badRequest(ctx, `Article ${articleId} not found or not accessible.`);
          return;
        }
        ctx.response.json(utils.getArticleTree(article, ctx.currentUser, ctx.project));
      },
    },
    {
      scope: "article",
      method: "GET",
      path: "getArticleInfo",
      handle: function handle(ctx) {
        const article = ctx.article;
        const props = article.extensionProperties;
        const isTemplate = props?.isTemplate || false;
        const usedTemplateIds = utils.parseIdList(props.usedTemplateIds);
        ctx.response.json({
          articleId: article.id,
          isTemplate: isTemplate,
          hasTemplates: usedTemplateIds.length > 0,
          projectKey: article.project.key,
          templateProjectKeys: utils.getTemplateProjectKeys(article),
        });
      },
    },
    {
      scope: "article",
      method: "POST",
      path: "setArticleInfo",
      // Marking an article as template makes it selectable in the template configuration of the
      // projects it is shared with, so it also requires UPDATE_PROJECT in the article's project. That is
      // checked in the handler, not with `{ allOf: [...] }`: see requirePermission.
      permissions: ["UPDATE_ARTICLE"],
      handle: function handle(ctx) {
        const article = ctx.article;
        if (!requirePermission(ctx, "UPDATE_PROJECT", article.project, "change template articles")) {
          return;
        }
        const props = article.extensionProperties;
        const usedTemplateIds = utils.parseIdList(props.usedTemplateIds);
        const articleInfo = JSON.parse(ctx.request.body);

        if (articleInfo.hasOwnProperty("articleId") === false || articleInfo.articleId === "") {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Article info must have a valid articleId.",
          });
          return;
        }

        if (articleInfo.hasOwnProperty("isTemplate") === false) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Article info must have an isTemplate field.",
          });
          return;
        }
        if (usedTemplateIds.length > 0) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Article uses templates, remove all used templates first.",
          });
          return;
        }
        if (articleInfo.articleId !== article.id) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Request article ID doesn't match context article ID.",
          });
          return;
        }

        // Projects that may use the template article. Kept when the article is unmarked, so
        // marking it again restores them; left unchanged when not sent.
        const projectKeys = articleInfo.templateProjectKeys;
        if (articleInfo.isTemplate === true && projectKeys !== undefined) {
          if (!Array.isArray(projectKeys) || projectKeys.length === 0) {
            badRequest(ctx, "Select at least one project that can use the template.");
            return;
          }
          const unknownKey = projectKeys.find(
            (key) => typeof key !== "string" || entities.Project.findByKey(key) == null,
          );
          if (unknownKey !== undefined) {
            badRequest(ctx, `Project ${unknownKey} not found.`);
            return;
          }
          article.extensionProperties.templateProjectKeys = JSON.stringify(
            projectKeys.filter((key, index) => projectKeys.indexOf(key) === index),
          );
        }

        article.extensionProperties.isTemplate = articleInfo.isTemplate || false;

        ctx.response.json({
          success: true,
        });
      },
    },
    {
      scope: "issue",
      method: "GET",
      path: "templates",
      handle: function handle(ctx) {
        const issue = ctx.issue;
        const issueProps = issue.extensionProperties;
        const usedTemplateIds = utils.parseIdList(issueProps.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        const validTemplateIds = templates
          .filter((t) => utils.isTemplateValidForIssue(issue, t))
          .map((t) => t.id);
        const fields = utils.getProjectFieldInfo(issue.project);
        ctx.response.json({
          usedTemplateIds: usedTemplateIds,
          templates: templates,
          validTemplateIds: validTemplateIds,
          fields: fields,
          currentFieldValues: utils.getIssueFieldValues(issue, fields),
          currentFieldValueLists: utils.getIssueFieldValueLists(issue, fields),
          currentFieldPresentations: utils.getIssueFieldPresentations(issue, fields),
          pendingTemplateIds: utils.getPendingTemplateIds(issue),
          createdHierarchyTemplateIds: utils.getCreatedHierarchyTemplateIds(issue),
          replacementTexts: utils.getStoredReplacementTexts(issue),
        });
      },
    },
    {
      scope: "issue",
      method: "POST",
      path: "addTemplate",
      permissions: ["UPDATE_ISSUE"],
      handle: function handle(ctx) {
        const issue = ctx.issue;
        const issueProps = issue.extensionProperties;
        const usedTemplateIds = utils.parseIdList(issueProps.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        const body = JSON.parse(ctx.request.body);
        const lookup = lookupRequestTemplate(templates, body, "add");
        if (lookup.error !== null) {
          badRequest(ctx, lookup.error);
          return;
        }
        const template = lookup.template;
        const templateId = template.id;

        const isValidTemplate = utils.isTemplateValidForIssue(issue, template);
        if (!isValidTemplate) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} is not valid for this issue.`,
          });
          return;
        }

        const templateArticle = findUsableTemplateArticle(
          template.articleId,
          ctx.currentUser,
          issue.project,
        );
        if (templateArticle === null) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} article ${template.articleId} not found, not accessible or not shared with this project.`,
          });
          return;
        }
        const templateContent = templateArticle.content;
        if (!templateContent || templateContent.trim() === "") {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} article ${template.articleId} has no content.`,
          });
          return;
        }

        // Resolve field values before modifying anything, so a bad value leaves the ticket as is.
        const resolved = utils.resolveTemplateFieldValues(
          issue.project,
          template,
          body.fieldValues,
          true,
        );
        // Values chosen for empty root ticket fields that field replacements use.
        const fieldInputs = utils.resolveReplacementFieldInputs(
          issue,
          template,
          body.replacementFieldValues,
        );
        const tags = utils.resolveTemplateTags(template);
        const relations = utils.resolveFixedRelations(issue, template, ctx.currentUser);
        const resolveErrors = resolved.errors.concat(
          fieldInputs.errors,
          tags.errors,
          relations.errors,
        );
        if (resolveErrors.length > 0) {
          badRequest(ctx, `Failed to add template: ${resolveErrors.join(" ")}`);
          return;
        }
        // Replacements insert the field values set by this request.
        const replacements = utils.resolveReplacements(issue, template, body.replacementTexts, true, {
          ...fieldInputs.overrides,
          ...utils.getAssignmentOverrides(issue, resolved.assignments),
        });
        const replacementError = getReplacementError(replacements);
        if (replacementError !== null) {
          badRequest(ctx, `Failed to add template: ${replacementError}`);
          return;
        }

        // Add template to ticket description, with replacements applied to the ticket summary
        // and to the template content.
        applyReplacementsToIssue(issue, replacements.values);
        let newDescription = issue.description ? issue.description.trim() : "";
        if (newDescription.length > 0) {
          newDescription += "\n\n";
        }
        newDescription += utils.applyReplacements(templateContent.trim(), replacements.values);
        issue.description = newDescription;

        // Set ticket fields and add tags defined by template.
        utils.applyFieldAssignments(issue, fieldInputs.assignments);
        utils.applyFieldAssignments(issue, resolved.assignments);
        utils.applyTags(issue, tags.tagNames);
        utils.applyRelations(issue, relations.links);

        // Add template to used templates.
        usedTemplateIds.push(templateId);
        issue.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);

        // Remember templates whose user-input fields were left empty.
        if (utils.hasMissingUserInput(template, body.fieldValues)) {
          utils.markTemplatePending(issue, templateId);
        } else {
          utils.clearTemplatePending(issue, templateId);
        }
        // Remember the entered texts for later steps, e.g. creating the hierarchy.
        utils.storeReplacementTexts(issue, template, body.replacementTexts);

        ctx.response.json({
          success: true,
          usedTemplateIds: usedTemplateIds,
          pendingTemplateIds: utils.getPendingTemplateIds(issue),
        });
      },
    },
    {
      scope: "issue",
      method: "POST",
      path: "applyTemplateFields",
      permissions: ["UPDATE_ISSUE"],
      // Sets (or re-sets) only the fields of a template, without touching the description or
      // the used templates. Lets users fill in user-input fields of automatically added templates.
      handle: function handle(ctx) {
        const issue = ctx.issue;
        const usedTemplateIds = utils.parseIdList(issue.extensionProperties.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        const body = JSON.parse(ctx.request.body);
        const lookup = lookupRequestTemplate(templates, body, "set fields from");
        if (lookup.error !== null) {
          badRequest(ctx, lookup.error);
          return;
        }
        const template = lookup.template;

        const isUsed = usedTemplateIds.includes(template.id);
        if (!isUsed && !utils.isTemplateValidForIssue(issue, template)) {
          badRequest(
            ctx,
            `Failed to set fields from template, template ${template.id} is not valid for this issue.`,
          );
          return;
        }
        if (findUsableTemplateArticle(template.articleId, ctx.currentUser, issue.project) === null) {
          badRequest(
            ctx,
            `Failed to set fields from template, template ${template.id} article ${template.articleId} not found, not accessible or not shared with this project.`,
          );
          return;
        }

        const resolved = utils.resolveTemplateFieldValues(
          issue.project,
          template,
          body.fieldValues,
          true,
        );
        // Values chosen for empty root ticket fields that field replacements use.
        const fieldInputs = utils.resolveReplacementFieldInputs(
          issue,
          template,
          body.replacementFieldValues,
        );
        const tags = utils.resolveTemplateTags(template);
        const relations = utils.resolveFixedRelations(issue, template, ctx.currentUser);
        const resolveErrors = resolved.errors.concat(
          fieldInputs.errors,
          tags.errors,
          relations.errors,
        );
        if (resolveErrors.length > 0) {
          badRequest(ctx, `Failed to set fields from template: ${resolveErrors.join(" ")}`);
          return;
        }
        // Replacements insert the field values set by this request.
        const replacements = utils.resolveReplacements(issue, template, body.replacementTexts, true, {
          ...fieldInputs.overrides,
          ...utils.getAssignmentOverrides(issue, resolved.assignments),
        });
        const replacementError = getReplacementError(replacements);
        if (replacementError !== null) {
          badRequest(ctx, `Failed to set fields from template: ${replacementError}`);
          return;
        }
        utils.applyFieldAssignments(issue, fieldInputs.assignments);
        utils.applyFieldAssignments(issue, resolved.assignments);
        utils.applyTags(issue, tags.tagNames);
        utils.applyRelations(issue, relations.links);
        // Replace placeholder words still present in the ticket (e.g. left by the workflow).
        applyReplacementsToIssue(issue, replacements.values);
        // The user has been asked for the user-input fields; the template is no longer pending.
        utils.clearTemplatePending(issue, template.id);
        utils.storeReplacementTexts(issue, template, body.replacementTexts);

        ctx.response.json({
          success: true,
          pendingTemplateIds: utils.getPendingTemplateIds(issue),
        });
      },
    },
    {
      scope: "issue",
      method: "POST",
      path: "createHierarchy",
      // Also requires CREATE_ISSUE, checked in the handler, not with `{ allOf: [...] }`: see
      // requirePermission.
      permissions: ["UPDATE_ISSUE"],
      // Creates subtasks below the issue from the child templates of an applied hierarchical
      // template, nested like the child articles.
      handle: function handle(ctx) {
        const issue = ctx.issue;
        if (!requirePermission(ctx, "CREATE_ISSUE", issue.project, "create subtasks")) {
          return;
        }
        const usedTemplateIds = utils.parseIdList(issue.extensionProperties.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        const body = JSON.parse(ctx.request.body);
        const lookup = lookupRequestTemplate(templates, body, "create hierarchy from");
        if (lookup.error !== null) {
          badRequest(ctx, lookup.error);
          return;
        }
        const template = lookup.template;
        if (!usedTemplateIds.includes(template.id)) {
          badRequest(
            ctx,
            `Failed to create hierarchy, template ${template.id} is not applied to this issue.`,
          );
          return;
        }
        if (!template.hierarchical || utils.flattenChildTemplates(template.children).length === 0) {
          badRequest(ctx, "Failed to create hierarchy, template has no child templates.");
          return;
        }

        // New values chosen for root ticket fields that child add conditions depend on; the plan
        // uses them before anything is written.
        const conditionInputs = utils.resolveConditionFieldInputs(
          issue,
          template,
          body.conditionFieldValues,
        );
        // Answers to the template's options; options without a default must be answered.
        const options = utils.resolveOptionValues(template, body.optionValues);
        const plan = planHierarchy(
          issue,
          template,
          body.childFieldValues,
          ctx.currentUser,
          conditionInputs.valueOverrides,
          options.values,
        );
        // The root ticket gets the root template's tags and fixed relations it does not have
        // yet, e.g. when the template was added automatically.
        const rootTags = utils.resolveTemplateTags(template);
        const rootRelations = utils.resolveFixedRelations(issue, template, ctx.currentUser);
        // Values chosen for empty root ticket fields that field replacements use.
        const fieldInputs = utils.resolveReplacementFieldInputs(
          issue,
          template,
          body.replacementFieldValues,
        );
        const planErrors = rootTags.errors.concat(
          options.errors,
          conditionInputs.errors,
          fieldInputs.errors,
          rootRelations.errors,
          utils.getHierarchyRelationErrors(issue, template),
          plan.errors,
        );
        if (planErrors.length > 0) {
          badRequest(ctx, `Failed to create hierarchy: ${planErrors.join(" ")}`);
          return;
        }
        // Replacements of the root template apply to every subtask's summary and description.
        const replacements = utils.resolveReplacements(
          issue,
          template,
          body.replacementTexts,
          true,
          {
            ...fieldInputs.overrides,
            ...utils.getAssignmentOverrides(issue, conditionInputs.assignments),
          },
        );
        const replacementError = getReplacementError(replacements);
        if (replacementError !== null) {
          badRequest(ctx, `Failed to create hierarchy: ${replacementError}`);
          return;
        }
        // Set the chosen root ticket fields before creating subtasks, so that subtasks inheriting
        // root ticket fields get the new values.
        utils.applyFieldAssignments(issue, conditionInputs.assignments);
        utils.applyFieldAssignments(issue, fieldInputs.assignments);

        const createdIssueIds = [];
        const skippedChildIds = [];
        const createdById = {};
        // Fields configured by the root template, inherited from the root ticket on request.
        const rootManagedFields = template.fields.map((field) => field.fieldName);
        const createChildren = (parentIssue, parentManagedFields, children) => {
          for (const child of children) {
            // Skipped child templates take their whole subtree with them.
            if (
              !utils.isChildTemplateAdded(issue, child, conditionInputs.valueOverrides, options.values)
            ) {
              skippedChildIds.push(child.id);
              continue;
            }
            const prepared = plan.byChildId[child.id];
            const ticket = new entities.Issue(
              ctx.currentUser,
              issue.project,
              utils.applyReplacements(child.name, replacements.values),
            );
            ticket.description = utils.applyReplacements(prepared.content, replacements.values);
            // Lets the template workflow skip auto-application on creation.
            ticket.extensionProperties.createdFromChildTemplateId = child.id;
            // Precedence: own fields, then the closest parent, then the root ticket, so the
            // values are applied in the opposite order.
            const rootNames = child.inheritRootFields ? rootManagedFields : [];
            for (const name of rootNames) {
              utils.copyFieldValue(issue, ticket, name);
            }
            const inheritedNames = child.inheritParentFields ? parentManagedFields : [];
            for (const name of inheritedNames) {
              utils.copyFieldValue(parentIssue, ticket, name);
            }
            utils.applyFieldAssignments(ticket, prepared.assignments);
            utils.applyTags(ticket, prepared.tagNames);
            parentIssue.links["parent for"].add(ticket);
            createdIssueIds.push(ticket.id);
            createdById[child.id] = ticket;
            const managedNames = uniqueNames(
              rootNames.concat(inheritedNames, child.fields.map((field) => field.fieldName)),
            );
            createChildren(ticket, managedNames, child.children);
          }
        };
        utils.applyTags(issue, rootTags.tagNames);
        utils.applyRelations(issue, rootRelations.links);
        createChildren(issue, rootManagedFields, template.children);
        const skippedRelations = linkHierarchy(issue, template, createdById, plan);
        utils.markHierarchyCreated(issue, template.id);
        utils.storeReplacementTexts(issue, template, body.replacementTexts);

        ctx.response.json({
          success: true,
          createdIssueIds: createdIssueIds,
          skippedChildIds: skippedChildIds,
          skippedRelations: skippedRelations,
          createdHierarchyTemplateIds: utils.getCreatedHierarchyTemplateIds(issue),
        });
      },
    },
    {
      scope: "issue",
      method: "DELETE",
      path: "removeTemplate",
      permissions: ["UPDATE_ISSUE"],
      handle: function handle(ctx) {
        const issue = ctx.issue;
        const issueProps = issue.extensionProperties;
        const usedTemplateIds = utils.parseIdList(issueProps.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        const body = JSON.parse(ctx.request.body);
        const lookup = lookupRequestTemplate(templates, body, "remove");
        if (lookup.error !== null) {
          badRequest(ctx, lookup.error);
          return;
        }
        const template = lookup.template;
        const templateId = template.id;

        // Don't check if template is valid for ticket, allow removal anyway.

        // The template is unregistered even when its article is gone or no longer shared with the
        // project, so that it can be cleaned up; its text is only removed if the article may still
        // be used, since that reads the article.
        const templateArticle = findUsableTemplateArticle(
          template.articleId,
          ctx.currentUser,
          issue.project,
        );
        const templateContent = templateArticle !== null ? templateArticle.content : "";

        // Remove template from ticket description.
        let newDescription = issue.description ? issue.description : "";
        if (templateContent && templateContent.trim().length > 0) {
          const lenBefore = newDescription.length;
          newDescription = newDescription.replace(templateContent.trim(), "");
          const charsRemoved = lenBefore - newDescription.length;
          if (charsRemoved > 0) {
            issue.description = newDescription;
          }
        }

        // Remove template from used templates.
        const index = usedTemplateIds.indexOf(templateId);
        if (index > -1) {
          usedTemplateIds.splice(index, 1);
        }
        issue.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);
        utils.clearTemplatePending(issue, templateId);
        utils.clearStoredReplacementTexts(issue, templateId);

        ctx.response.json({
          success: true,
          usedTemplateIds: usedTemplateIds,
        });
      },
    },
    {
      scope: "article",
      method: "GET",
      path: "templates",
      handle: function handle(ctx) {
        const article = ctx.article;
        const articleProps = article.extensionProperties;
        const usedTemplateIds = utils.parseIdList(articleProps.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        const validTemplateIds = templates
          .filter((t) => utils.isTemplateValidForArticle(article, t))
          .map((t) => t.id);
        ctx.response.json({
          usedTemplateIds: usedTemplateIds,
          templates: templates,
          validTemplateIds: validTemplateIds,
          isTemplate: articleProps?.isTemplate || false,
          createdHierarchyTemplateIds: utils.getCreatedHierarchyTemplateIds(article),
          replacementTexts: utils.getStoredReplacementTexts(article),
        });
      },
    },
    {
      scope: "article",
      method: "POST",
      path: "addTemplate",
      permissions: ["UPDATE_ARTICLE"],
      handle: function handle(ctx) {
        const article = ctx.article;
        const articleProps = article.extensionProperties;
        const usedTemplateIds = utils.parseIdList(articleProps.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        if (articleProps?.isTemplate === true) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Failed to add template, cannot add to a template article.",
          });
          return;
        }

        const body = JSON.parse(ctx.request.body);
        if (body.hasOwnProperty("templateId") === false || body.templateId === "") {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Failed to add template, no templateId.",
          });
          return;
        }

        const templateId = body.templateId;
        const template = templates.find((t) => t.id === templateId);
        if (!template) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} doesn't exist.`,
          });
          return;
        }

        const isValidTemplate = utils.isTemplateValidForArticle(article, template);
        if (!isValidTemplate) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} is not valid for this article.`,
          });
          return;
        }

        const templateArticle = findUsableTemplateArticle(
          template.articleId,
          ctx.currentUser,
          article.project,
        );
        if (templateArticle === null) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} article ${template.articleId} not found, not accessible or not shared with this project.`,
          });
          return;
        }
        const templateContent = templateArticle.content;
        if (!templateContent || templateContent.trim() === "") {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} article ${template.articleId} has no content.`,
          });
          return;
        }

        // Articles have no root ticket: only user-input replacements are available.
        const replacements = utils.resolveReplacements(null, template, body.replacementTexts, true);
        const replacementError = getReplacementError(replacements);
        if (replacementError !== null) {
          badRequest(ctx, `Failed to add template: ${replacementError}`);
          return;
        }
        const tags = utils.resolveTemplateTags(template);
        if (tags.errors.length > 0) {
          badRequest(ctx, `Failed to add template: ${tags.errors.join(" ")}`);
          return;
        }
        utils.applyTags(article, tags.tagNames);

        // Add template to article content.
        let newDescription = article.content ? article.content.trim() : "";
        if (newDescription.length > 0) {
          newDescription += "\n\n";
        }
        newDescription += utils.applyReplacements(templateContent.trim(), replacements.values);
        article.content = newDescription;

        // Add template to used templates.
        usedTemplateIds.push(templateId);
        article.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);
        // Remember the entered texts for later steps, e.g. creating the hierarchy.
        utils.storeReplacementTexts(article, template, body.replacementTexts);

        ctx.response.json({
          success: true,
          usedTemplateIds: usedTemplateIds,
          replacementTexts: utils.getStoredReplacementTexts(article),
        });
      },
    },
    {
      scope: "article",
      method: "POST",
      path: "createHierarchy",
      // Also requires CREATE_ARTICLE, checked in the handler, not with `{ allOf: [...] }`: see
      // requirePermission.
      permissions: ["UPDATE_ARTICLE"],
      // Creates sub-articles below the article from the child templates of an applied
      // hierarchical template, nested like the child templates. Replacements, tags and option
      // conditions apply; fields, inheritance and field conditions do not.
      handle: function handle(ctx) {
        const article = ctx.article;
        if (!requirePermission(ctx, "CREATE_ARTICLE", article.project, "create sub-articles")) {
          return;
        }
        const templates = utils.getTemplates(ctx);

        const body = JSON.parse(ctx.request.body);
        const lookup = lookupRequestTemplate(templates, body, "create hierarchy from");
        if (lookup.error !== null) {
          badRequest(ctx, lookup.error);
          return;
        }
        const template = lookup.template;
        const hierarchyError = getArticleHierarchyError(article, template);
        if (hierarchyError !== null) {
          badRequest(ctx, hierarchyError);
          return;
        }

        // Answers to the template's options; options without a default must be answered.
        const options = utils.resolveOptionValues(template, body.optionValues);
        const plan = planArticleHierarchy(
          template,
          ctx.currentUser,
          article.project,
          options.values,
        );
        const rootTags = utils.resolveTemplateTags(template);
        const planErrors = rootTags.errors.concat(options.errors, plan.errors);
        if (planErrors.length > 0) {
          badRequest(ctx, `Failed to create hierarchy: ${planErrors.join(" ")}`);
          return;
        }
        // Articles have no root ticket: only user-input replacements are available.
        const replacements = utils.resolveReplacements(null, template, body.replacementTexts, true);
        const replacementError = getReplacementError(replacements);
        if (replacementError !== null) {
          badRequest(ctx, `Failed to create hierarchy: ${replacementError}`);
          return;
        }

        const createdArticleIds = [];
        const createChildren = (parentArticle, children) => {
          for (const child of children) {
            // Skipped child templates take their whole subtree with them.
            if (!utils.isChildTemplateAdded(null, child, {}, options.values)) {
              continue;
            }
            const prepared = plan.byChildId[child.id];
            const created = new entities.Article(
              ctx.currentUser,
              article.project,
              utils.applyReplacements(child.name, replacements.values),
            );
            created.content = utils.applyReplacements(prepared.content, replacements.values);
            // Lets the template workflow skip auto-application on creation.
            created.extensionProperties.createdFromChildTemplateId = child.id;
            created.parentArticle = parentArticle;
            utils.applyTags(created, prepared.tagNames);
            createdArticleIds.push(created.id);
            createChildren(created, child.children);
          }
        };
        utils.applyTags(article, rootTags.tagNames);
        createChildren(article, template.children);
        utils.markHierarchyCreated(article, template.id);
        utils.storeReplacementTexts(article, template, body.replacementTexts);

        ctx.response.json({
          success: true,
          createdArticleIds: createdArticleIds,
          createdHierarchyTemplateIds: utils.getCreatedHierarchyTemplateIds(article),
          replacementTexts: utils.getStoredReplacementTexts(article),
        });
      },
    },
    {
      scope: "article",
      method: "DELETE",
      path: "removeTemplate",
      permissions: ["UPDATE_ARTICLE"],
      handle: function handle(ctx) {
        const article = ctx.article;
        const articleProps = article.extensionProperties;
        const usedTemplateIds = utils.parseIdList(articleProps.usedTemplateIds);
        const templates = utils.getTemplates(ctx);

        if (articleProps?.isTemplate === true) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Failed to remove template, cannot remove from a template article.",
          });
          return;
        }

        const body = JSON.parse(ctx.request.body);
        if (body.hasOwnProperty("templateId") === false || body.templateId === "") {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Failed to remove template, no templateId.",
          });
          return;
        }

        const templateId = body.templateId;
        const template = templates.find((t) => t.id === templateId);
        if (!template) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to remove template, template ${templateId} doesn't exist.`,
          });
          return;
        }

        // Don't check if template is valid for article, allow removal anyway.

        // The template is unregistered even when its article is gone or no longer shared with the
        // project, so that it can be cleaned up; its text is only removed if the article may still
        // be used, since that reads the article.
        const templateArticle = findUsableTemplateArticle(
          template.articleId,
          ctx.currentUser,
          article.project,
        );
        const templateContent = templateArticle !== null ? templateArticle.content : "";

        // Remove template from article content.
        let newDescription = article.content ? article.content : "";
        if (templateContent && templateContent.trim().length > 0) {
          const lenBefore = newDescription.length;
          newDescription = newDescription.replace(templateContent.trim(), "");
          const charsRemoved = lenBefore - newDescription.length;
          if (charsRemoved > 0) {
            article.content = newDescription;
          }
        }

        // Remove template from used templates.
        const index = usedTemplateIds.indexOf(templateId);
        if (index > -1) {
          usedTemplateIds.splice(index, 1);
        }
        article.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);
        utils.clearStoredReplacementTexts(article, templateId);

        ctx.response.json({
          success: true,
          usedTemplateIds: usedTemplateIds,
          replacementTexts: utils.getStoredReplacementTexts(article),
        });
      },
    },
  ],
};
