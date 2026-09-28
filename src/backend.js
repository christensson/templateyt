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
  }
  return null;
};

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
  const addCond = template.addCondition;
  if (addCond && addCond.when === "field_becomes") {
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

// Validates the add conditions of a child template. Returns an error message or null.
// Keep in sync with validateChildTemplates in @types/template.ts.
const validateChildAddConditions = (child) => {
  const conditions = child.addConditions;
  if (conditions === undefined) {
    return null;
  }
  if (!Array.isArray(conditions)) {
    return `Child template "${child.name}" addConditions is not an array.`;
  }
  for (const cond of conditions) {
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

// Validates the own properties of one child template (not its children).
const validateChildOwnProperties = (child) => {
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
  const conditionsError = validateChildAddConditions(child);
  if (conditionsError !== null) {
    return conditionsError;
  }
  if (child.inheritParentFields !== undefined && typeof child.inheritParentFields !== "boolean") {
    return `Child template "${child.name}" inheritParentFields must be a boolean.`;
  }
  return null;
};

// Validates a list of child templates recursively. Returns an error message or null.
const validateChildList = (children, ownerName) => {
  if (children === undefined) {
    return null;
  }
  if (!Array.isArray(children)) {
    return `Children of "${ownerName}" is not an array.`;
  }
  for (const child of children) {
    const ownError = validateChildOwnProperties(child);
    if (ownError !== null) {
      return ownError;
    }
    const nestedError = validateChildList(child.children, child.name);
    if (nestedError !== null) {
      return nestedError;
    }
  }
  return null;
};

// Validates the hierarchy settings of a template. Returns an error message or null.
// Keep in sync with validateChildTemplates in @types/template.ts.
const validateChildTemplates = (template) => {
  if (template.hierarchical !== undefined && typeof template.hierarchical !== "boolean") {
    return "Template hierarchical must be a boolean.";
  }
  const listError = validateChildList(template.children, template.name || template.id);
  if (listError !== null) {
    return listError;
  }
  if (template.hierarchical === true && utils.flattenChildTemplates(template.children).length === 0) {
    return "Hierarchical template has no child templates, import child articles first.";
  }
  return null;
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
  const fieldsError = validateTemplateFields(template);
  if (fieldsError !== null) {
    return fieldsError;
  }
  const childrenError = validateChildTemplates(template);
  if (childrenError !== null) {
    return childrenError;
  }
  const articleId = template?.articleId;
  if (articleId === undefined || articleId === "") {
    return "Template must have a valid articleId.";
  }
  return null;
};

// Child templates that will be created for the root issue, in tree order, skipping those whose
// add conditions do not match together with their subtrees.
const getAddedChildTemplates = (rootIssue, children) =>
  (Array.isArray(children) ? children : []).flatMap((child) =>
    utils.isChildTemplateAdded(rootIssue, child)
      ? [child, ...getAddedChildTemplates(rootIssue, child.children)]
      : [],
  );

// Resolves everything a hierarchy creation needs (articles and field values) without creating
// anything, so that a bad value leaves the ticket untouched.
// Returns { errors: [string], byChildId: { [childId]: { content, assignments } } }.
const planHierarchy = (rootIssue, template, childFieldValues) => {
  const project = rootIssue.project;
  const errors = [];
  const byChildId = {};
  for (const child of getAddedChildTemplates(rootIssue, template.children)) {
    const article = entities.Article.findById(child.articleId);
    if (article == null) {
      errors.push(`Article ${child.articleId} for child template "${child.name}" not found.`);
      continue;
    }
    const userValues = childFieldValues ? childFieldValues[child.id] : null;
    const resolved = utils.resolveTemplateFieldValues(project, child, userValues, true);
    for (const error of resolved.errors) {
      errors.push(`Child template "${child.name}": ${error}`);
    }
    byChildId[child.id] = {
      content: article.content ? article.content.trim() : "",
      assignments: resolved.assignments,
    };
  }
  return { errors: errors, byChildId: byChildId };
};

const uniqueNames = (names) => names.filter((name, index) => names.indexOf(name) === index);

exports.httpHandler = {
  endpoints: [
    {
      scope: "project",
      method: "GET",
      path: "templates",
      handle: function handle(ctx) {
        ctx.response.json({
          templates: utils.getTemplates(ctx),
        });
      },
    },
    {
      scope: "project",
      method: "POST",
      path: "addTemplate",
      handle: function handle(ctx) {
        const body = JSON.parse(ctx.request.body);
        const newTemplate = body.template;
        const validationError = validateTemplate(newTemplate);
        if (validationError !== null) {
          badRequest(ctx, validationError);
          return;
        }

        const article = entities.Article.findById(newTemplate.articleId);
        if (article === null) {
          badRequest(ctx, `No article found with articleId ${newTemplate.articleId}.`);
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
      handle: function handle(ctx) {
        ctx.response.json({ fields: utils.getProjectFieldInfo(ctx.project) });
      },
    },
    {
      scope: "project",
      method: "GET",
      path: "getTemplateArticles",
      handle: function handle(ctx) {
        const templateArticles = entities.Article.findByExtensionProperties({
          isTemplate: true,
        });
        const articles = utils.toArray(templateArticles).map((x) => ({
          articleId: x.id,
          summary: x.summary,
        }));

        ctx.response.json(articles);
      },
    },
    {
      scope: "project",
      method: "POST",
      path: "getChildArticles",
      // Returns the article tree below the given article, for importing child templates.
      handle: function handle(ctx) {
        const body = JSON.parse(ctx.request.body);
        const articleId = body.articleId;
        if (typeof articleId !== "string" || articleId === "") {
          badRequest(ctx, "No articleId in request.");
          return;
        }
        const article = entities.Article.findById(articleId);
        if (article == null) {
          badRequest(ctx, `No article found with articleId ${articleId}.`);
          return;
        }
        ctx.response.json(utils.getArticleTree(article));
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
        });
      },
    },
    {
      scope: "article",
      method: "POST",
      path: "setArticleInfo",
      handle: function handle(ctx) {
        const article = ctx.article;
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
          pendingTemplateIds: utils.getPendingTemplateIds(issue),
          createdHierarchyTemplateIds: utils.getCreatedHierarchyTemplateIds(issue),
        });
      },
    },
    {
      scope: "issue",
      method: "POST",
      path: "addTemplate",
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

        const templateArticle = entities.Article.findById(template.articleId);
        if (templateArticle == null) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} article ${template.articleId} not found.`,
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
        if (resolved.errors.length > 0) {
          badRequest(ctx, `Failed to add template: ${resolved.errors.join(" ")}`);
          return;
        }

        // Add template to ticket description.
        let newDescription = issue.description ? issue.description.trim() : "";
        if (newDescription.length > 0) {
          newDescription += "\n\n";
        }
        newDescription += templateContent.trim();
        issue.description = newDescription;

        // Set ticket fields defined by template.
        utils.applyFieldAssignments(issue, resolved.assignments);

        // Add template to used templates.
        usedTemplateIds.push(templateId);
        issue.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);

        // Remember templates whose user-input fields were left empty.
        if (utils.hasMissingUserInput(template, body.fieldValues)) {
          utils.markTemplatePending(issue, templateId);
        } else {
          utils.clearTemplatePending(issue, templateId);
        }

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

        const resolved = utils.resolveTemplateFieldValues(
          issue.project,
          template,
          body.fieldValues,
          true,
        );
        if (resolved.errors.length > 0) {
          badRequest(ctx, `Failed to set fields from template: ${resolved.errors.join(" ")}`);
          return;
        }
        utils.applyFieldAssignments(issue, resolved.assignments);
        // The user has been asked for the user-input fields; the template is no longer pending.
        utils.clearTemplatePending(issue, template.id);

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
      // Creates subtasks below the issue from the child templates of an applied hierarchical
      // template, nested like the child articles.
      handle: function handle(ctx) {
        const issue = ctx.issue;
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

        const plan = planHierarchy(issue, template, body.childFieldValues);
        if (plan.errors.length > 0) {
          badRequest(ctx, `Failed to create hierarchy: ${plan.errors.join(" ")}`);
          return;
        }

        const createdIssueIds = [];
        const skippedChildIds = [];
        const createChildren = (parentIssue, parentManagedFields, children) => {
          for (const child of children) {
            // Skipped child templates take their whole subtree with them.
            if (!utils.isChildTemplateAdded(issue, child)) {
              skippedChildIds.push(child.id);
              continue;
            }
            const prepared = plan.byChildId[child.id];
            const ticket = new entities.Issue(ctx.currentUser, issue.project, child.name);
            ticket.description = prepared.content;
            // Lets the template workflow skip auto-application on creation.
            ticket.extensionProperties.createdFromChildTemplateId = child.id;
            const inheritedNames = child.inheritParentFields ? parentManagedFields : [];
            for (const name of inheritedNames) {
              ticket.fields[name] = parentIssue.fields[name];
            }
            // Own fields win over inherited ones.
            utils.applyFieldAssignments(ticket, prepared.assignments);
            parentIssue.links["parent for"].add(ticket);
            createdIssueIds.push(ticket.id);
            const managedNames = uniqueNames(
              inheritedNames.concat(child.fields.map((field) => field.fieldName)),
            );
            createChildren(ticket, managedNames, child.children);
          }
        };
        createChildren(
          issue,
          template.fields.map((field) => field.fieldName),
          template.children,
        );
        utils.markHierarchyCreated(issue, template.id);

        ctx.response.json({
          success: true,
          createdIssueIds: createdIssueIds,
          skippedChildIds: skippedChildIds,
          createdHierarchyTemplateIds: utils.getCreatedHierarchyTemplateIds(issue),
        });
      },
    },
    {
      scope: "issue",
      method: "DELETE",
      path: "removeTemplate",
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

        const templateArticle = entities.Article.findById(template.articleId);
        if (templateArticle == null) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to remove template, template ${templateId} article ${template.articleId} not found.`,
          });
          return;
        }
        const templateContent = templateArticle.content;

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
        });
      },
    },
    {
      scope: "article",
      method: "POST",
      path: "addTemplate",
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

        const templateArticle = entities.Article.findById(template.articleId);
        if (templateArticle == null) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to add template, template ${templateId} article ${template.articleId} not found.`,
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

        // Add template to article content.
        let newDescription = article.content ? article.content.trim() : "";
        if (newDescription.length > 0) {
          newDescription += "\n\n";
        }
        newDescription += templateContent.trim();
        article.content = newDescription;

        // Add template to used templates.
        usedTemplateIds.push(templateId);
        article.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);

        ctx.response.json({
          success: true,
          usedTemplateIds: usedTemplateIds,
        });
      },
    },
    {
      scope: "article",
      method: "DELETE",
      path: "removeTemplate",
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

        const templateArticle = entities.Article.findById(template.articleId);
        if (templateArticle == null) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `Failed to remove template, template ${templateId} article ${template.articleId} not found.`,
          });
          return;
        }
        const templateContent = templateArticle.content;

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

        ctx.response.json({
          success: true,
          usedTemplateIds: usedTemplateIds,
        });
      },
    },
  ],
};
