var entities = require("@jetbrains/youtrack-scripting-api/entities");

exports.httpHandler = {
  endpoints: [
    {
      scope: "project",
      method: "GET",
      path: "templates",
      handle: function handle(ctx) {
        const props = ctx.project.extensionProperties;
        const templates = JSON.parse(props.templates) || [];
        ctx.response.json({
          templates: templates,
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

        if (newTemplate.validCondition !== null) {
          const cond = newTemplate.validCondition;
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

        let props = ctx.project.extensionProperties;
        let templates = JSON.parse(props.templates) || [];
        let template = templates.find((t) => t.id === newTemplate.id);
        if (template) {
          // Update existing entry.
          Object.assign(template, newTemplate);
        } else {
          // Add new entry.
          templates.push(newTemplate);
        }
        props.templates = JSON.stringify(templates);
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
        let props = ctx.project.extensionProperties;
        const oldTemplates = JSON.parse(props.templates) || [];
        const updatedTemplates = oldTemplates.filter((t) => t.id !== id);
        props.templates = JSON.stringify(updatedTemplates);
        ctx.response.json({ success: true });
      },
    },
    {
      scope: "project",
      method: "GET",
      path: "getProjectInfo",
      handle: function handle(ctx) {
        const project = ctx.project;
        const stateFields = project.fields.map((x) => x).filter((x) => x.typeName === "state[1]");
        const enumFields = project.fields.map((x) => x).filter((x) => x.typeName === "enum[1]");
        const stateFieldInfo = stateFields.map((x) => ({
          name: x.name,
          values: x.values.map((v) => ({
            name: v.name,
            presentation: v.presentation,
          })),
        }));
        const enumFieldInfo = enumFields.map((x) => ({
          name: x.name,
          values: x.values.map((v) => ({
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
        const articles = templateArticles.map((x) => ({
          articleId: x.id,
          summary: x.summary,
          url: x.url,
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
        ctx.response.json({
          articleId: article.id,
          isTemplate: isTemplate,
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
        const projectProps = ctx.project.extensionProperties;
        const usedTemplateIds = JSON.parse(issueProps.usedTemplateIds) || [];
        const templates = JSON.parse(projectProps.templates) || [];

        const validTemplateIds = templates
          .filter((t) => {
            if (t.validCondition == null) {
              return true;
            }
            if (t.validCondition.when === "field_is") {
              return issue.is(t.validCondition.fieldName, t.validCondition.fieldValue);
            }
            return false;
          })
          .map((t) => t.id);
        ctx.response.json({
          usedTemplateIds: usedTemplateIds,
          templates: templates,
          validTemplateIds: validTemplateIds,
        });
      },
    },
  ],
};
