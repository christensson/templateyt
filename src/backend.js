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
  const seen = [];
  for (const field of fields) {
    if (!field || typeof field.fieldName !== "string" || field.fieldName === "") {
      return "Template field is missing a field name, please select a field.";
    }
    if (seen.includes(field.fieldName)) {
      return `Template field "${field.fieldName}" is listed more than once.`;
    }
    seen.push(field.fieldName);
    if (!TEMPLATE_FIELD_MODES.includes(field.mode)) {
      return `Template field "${field.fieldName}" has unknown mode "${field.mode}".`;
    }
    if (field.mode === "fixed" && (typeof field.fieldValue !== "string" || field.fieldValue === "")) {
      return `Template field "${field.fieldName}" is missing a value.`;
    }
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
  const articleId = template?.articleId;
  if (articleId === undefined || articleId === "") {
    return "Template must have a valid articleId.";
  }
  return null;
};

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
      scope: "article",
      method: "GET",
      path: "getArticleInfo",
      handle: function handle(ctx) {
        const article = ctx.article;
        const props = article.extensionProperties;
        const isTemplate = props?.isTemplate || false;
        const usedTemplateIds = JSON.parse(props.usedTemplateIds) || [];
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
        const usedTemplateIds = JSON.parse(props.usedTemplateIds) || [];
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
        const usedTemplateIds = JSON.parse(issueProps.usedTemplateIds) || [];
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
        const usedTemplateIds = JSON.parse(issueProps.usedTemplateIds) || [];
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

        ctx.response.json({
          success: true,
          usedTemplateIds: usedTemplateIds,
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
        const usedTemplateIds = JSON.parse(issue.extensionProperties.usedTemplateIds) || [];
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

        ctx.response.json({ success: true });
      },
    },
    {
      scope: "issue",
      method: "DELETE",
      path: "removeTemplate",
      handle: function handle(ctx) {
        const issue = ctx.issue;
        const issueProps = issue.extensionProperties;
        const usedTemplateIds = JSON.parse(issueProps.usedTemplateIds) || [];
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
        const usedTemplateIds = JSON.parse(articleProps.usedTemplateIds) || [];
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
        const usedTemplateIds = JSON.parse(articleProps.usedTemplateIds) || [];
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
        const usedTemplateIds = JSON.parse(articleProps.usedTemplateIds) || [];
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
