var entities = require("@jetbrains/youtrack-scripting-api/entities");
var utils = require("./template-utils");

const storeTemplates = (ctx, templates) => {
  const props = ctx.project.extensionProperties;
  props.templates = JSON.stringify(templates);
};

// The YT workflow API Set data-structure somehow doesn't support .map for
// iterating over the items in old self-hosted YT versions. This is a
// workaround where .forEach is used to push items into a new array.
const toArray = (wfSet) => {
  const arr = [];
  wfSet.forEach((x) => arr.push(x));
  return arr;
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
        if (newTemplate.hasOwnProperty("id") === false || newTemplate.id === "") {
          ctx.response.status = 400;
          ctx.response.json({ success: false, message: "Template must have a valid id." });
          return;
        }

        if (newTemplate.hasOwnProperty("validCondition") === false) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Template must have a valid validCondition.",
          });
          return;
        }

        if (newTemplate.hasOwnProperty("addCondition") === false) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Template must have a valid addCondition.",
          });
          return;
        }

        if (!Array.isArray(newTemplate.validCondition)) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: "Template validCondition is not an array.",
          });
          return;
        }

        for (const cond of newTemplate.validCondition) {
          if (cond.hasOwnProperty("when") === false) {
            ctx.response.status = 400;
            ctx.response.json({
              success: false,
              message: 'Inconsistent validCondition, missing "when" property.',
            });
            return;
          }
          if (cond.when === "field_is") {
            if (
              cond.hasOwnProperty("fieldName") === false ||
              cond.hasOwnProperty("fieldValue") === false
            ) {
              ctx.response.status = 400;
              ctx.response.json({
                success: false,
                message:
                  'Inconsistent validCondition, missing "fieldName" or "fieldValue" property.',
              });
              return;
            }
          } else if (cond.when === "tag_is") {
            if (cond.hasOwnProperty("tagName") === false) {
              ctx.response.status = 400;
              ctx.response.json({
                success: false,
                message: 'Inconsistent validCondition, missing "tagName" property.',
              });
              return;
            }
          } else if (cond.when === "entity_is") {
            if (cond.hasOwnProperty("entityType") === false) {
              ctx.response.status = 400;
              ctx.response.json({
                success: false,
                message: 'Inconsistent validCondition, missing "entityType" property.',
              });
              return;
            }
          } else {
            ctx.response.status = 400;
            ctx.response.json({
              success: false,
              message: `Inconsistent validCondition, unknown when value: ${cond.when}`,
            });
            return;
          }
        }

        if (newTemplate.addCondition !== null) {
          const cond = newTemplate.addCondition;
          if (cond.hasOwnProperty("when") === false) {
            ctx.response.status = 400;
            ctx.response.json({
              success: false,
              message: 'Inconsistent addCondition, missing "when" property.',
            });
            return;
          }
          if (cond.when === "field_becomes") {
            if (
              cond.hasOwnProperty("fieldName") === false ||
              cond.hasOwnProperty("fieldValue") === false
            ) {
              ctx.response.status = 400;
              ctx.response.json({
                success: false,
                message: 'Inconsistent addCondition, missing "fieldName" or "fieldValue" property.',
              });
              return;
            }
          } else if (cond.when === "tag_added" || cond.when === "tag_removed") {
            if (cond.hasOwnProperty("tagName") === false) {
              ctx.response.status = 400;
              ctx.response.json({
                success: false,
                message: 'Inconsistent addCondition, missing "tagName" property.',
              });
              return;
            }
          } else {
            ctx.response.status = 400;
            ctx.response.json({
              success: false,
              message: `Inconsistent addCondition, unknown when value: ${cond.when}`,
            });
            return;
          }
        }

        const articleId = newTemplate?.articleId;
        if (articleId === undefined || articleId === "") {
          ctx.response.status = 400;
          ctx.response.json({ success: false, message: "Template must have a valid articleId." });
          return;
        }

        const article = entities.Article.findById(articleId);
        if (article === null) {
          ctx.response.status = 400;
          ctx.response.json({
            success: false,
            message: `No article found with articleId ${articleId}.`,
          });
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
        const project = ctx.project;
        const stateFields = toArray(project.fields)
          .map((x) => x)
          .filter((x) => x.typeName === "state[1]");
        const enumFields = toArray(project.fields)
          .map((x) => x)
          .filter((x) => x.typeName === "enum[1]");
        const stateFieldInfo = stateFields.map((x) => ({
          name: x.name,
          values: toArray(x.values).map((v) => ({
            name: v.name,
            presentation: v.presentation,
          })),
        }));
        const enumFieldInfo = enumFields.map((x) => ({
          name: x.name,
          values: toArray(x.values).map((v) => ({
            name: v.name,
            presentation: v.presentation,
          })),
        }));

        ctx.response.json({ stateFields: stateFieldInfo, enumFields: enumFieldInfo });
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
        const articles = toArray(templateArticles).map((x) => ({
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
        ctx.response.json({
          usedTemplateIds: usedTemplateIds,
          templates: templates,
          validTemplateIds: validTemplateIds,
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

        // Add template to ticket description.
        let newDescription = issue.description ? issue.description.trim() : "";
        if (newDescription.length > 0) {
          newDescription += "\n\n";
        }
        newDescription += templateContent.trim();
        issue.description = newDescription;

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
      method: "DELETE",
      path: "removeTemplate",
      handle: function handle(ctx) {
        const issue = ctx.issue;
        const issueProps = issue.extensionProperties;
        const usedTemplateIds = JSON.parse(issueProps.usedTemplateIds) || [];
        const templates = utils.getTemplates(ctx);

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
