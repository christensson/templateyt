/* YouTrack Workflow API example */
var entities = require("@jetbrains/youtrack-scripting-api/entities");
var utils = require("./template-utils.js");

const loggingEnabled = true;
const log = (msg) => {
  if (loggingEnabled) {
    console.log(msg);
  }
};

const getValidTemplates = (ctx, article) => {
  const templates = utils.getTemplates(ctx);
  log(`Article ${article.id}: All templates: ${JSON.stringify(templates)}`);
  return templates.filter((t) => {
    const conditions = Array.isArray(t.validCondition) ? t.validCondition : [];
    for (const cond of conditions) {
      if (!cond || !cond.when) {
        continue;
      }
      if (cond.when === "entity_is") {
        // Valid templates currently matches the condition...
        return cond.entityType === "article";
      } else if (cond.when === "tag_is") {
        const tagName = cond.tagName;
        // Valid templates currently matches the condition...
        if (article.hasTag(tagName)) {
          return true;
        }
        // ...or was matching the condition before change...
        if (article.tags.removed.find((tag) => tag.name === tagName)) {
          return true;
        }
        // ...or will match the condition on change.
        if (article.tags.added.find((tag) => tag.name === tagName)) {
          return true;
        }
      } else {
        // Unknown condition, ignore.
        continue;
      }
    }
    return false;
  });
};

// Load the knowledge base articles referenced by the given templates, keyed by article id.
// Not checked against the current user on purpose: templates are added automatically for anyone
// who edits a matching entity. The project admin decides which articles are used: the backend
// only stores templates whose articles the admin may read. Sharing is checked again here, since
// the article's project may have stopped sharing it since: articles the project may no longer use
// are skipped (and logged), never applied.
const loadTemplateArticles = (article, templates) => {
  const articles = {};
  for (const t of templates) {
    const articleId = t.articleId;
    if (articles[articleId]) {
      continue;
    }
    const templateArticle = entities.Article.findById(articleId);
    if (templateArticle != null && utils.isUsableTemplateArticle(templateArticle, article.project)) {
      articles[articleId] = templateArticle;
    } else {
      log(
        `Article ${article.id}: Template "${t.name}" (${t.id}) skipped: article ${articleId} not found or not shared with project ${article.project.key}`,
      );
    }
  }
  return articles;
};

// Trimmed content of the template's article, or "" when the article was skipped when loading.
const getTemplateContent = (articles, template) => {
  const templateArticle = articles[template.articleId];
  return templateArticle && templateArticle.content ? templateArticle.content.trim() : "";
};

exports.rule = entities.Article.onChange({
  title: "Apply article template",
  guard: function guard(ctx) {
    const article = ctx.article;

    // Do not ever add templates to the articles defined as templates.
    if (article.extensionProperties.isTemplate === true) {
      return false;
    }
    // Sub-articles created from a template hierarchy get their content and tags from the
    // hierarchy; do not auto-apply templates to them on creation.
    if (article.isNew && article.extensionProperties.createdFromChildTemplateId) {
      return false;
    }

    const validTemplates = getValidTemplates(ctx, article);

    log("Article " + article.id + " valid templates article: " + JSON.stringify(validTemplates));
    if (validTemplates.length === 0) {
      return false;
    }

    const validActionTags = validTemplates
      .filter((t) => (t?.addCondition ? t?.addCondition?.when === "tag_added" : false))
      .map((t) => ({
        tagName: t.addCondition.tagName,
      }));
    let matchedActionTags = [];
    if (article.isNew) {
      matchedActionTags = validActionTags.filter((t) =>
        article.tags.find((tag) => tag.name === t.tagName),
      );
    } else {
      matchedActionTags = validActionTags.filter(
        (t) =>
          article.tags.added.find((tag) => tag.name === t.tagName) ||
          article.tags.removed.find((tag) => tag.name === t.tagName),
      );
    }
    log(
      `Article ${article.id}${article.isNew ? " (new)" : ""} tags matched article: ${JSON.stringify(matchedActionTags)}`,
    );
    return matchedActionTags.length > 0;
  },
  action: function action(ctx) {
    const article = ctx.article;
    const usedTemplateIds = utils.parseIdList(article.extensionProperties.usedTemplateIds);
    const templates = getValidTemplates(ctx, article);
    log(
      `Article ${article.id}${article.isNew ? " (new)" : ""} templates: ${JSON.stringify(
        templates,
      )}`,
    );
    const newTemplates = templates
      .filter((t) => (t?.addCondition ? ["tag_added"].includes(t?.addCondition?.when) : false))
      .filter((t) => {
        const cond = t.addCondition;
        if (article.isNew) {
          if (cond.when === "tag_added") {
            return article.hasTag(cond.tagName);
          }
          return false;
        }

        if (cond.when === "tag_added") {
          return article.tags.added.find((tag) => tag.name === cond.tagName);
        }
        return false;
      });
    const oldTemplates = templates
      .filter((t) => (t?.addCondition ? ["tag_added"].includes(t?.addCondition?.when) : false))
      .filter((t) => {
        const cond = t.addCondition;
        if (cond.when === "tag_added") {
          return article.tags.removed.find((tag) => tag.name === cond.tagName);
        }
        return false;
      });

    log(`Ticket ${article.id}: Templates to apply: ${JSON.stringify(newTemplates)}`);
    log(`Ticket ${article.id}: Templates to potentially remove: ${JSON.stringify(oldTemplates)}`);

    const articles = loadTemplateArticles(article, [...newTemplates, ...oldTemplates]);
    let newDescription = article.content ? article.content.trim() : "";

    // Remove any old (or new) non-modified templates.
    for (const template of oldTemplates) {
      const templateContent = getTemplateContent(articles, template);
      if (templateContent) {
        const lenBefore = newDescription.length;
        newDescription = newDescription.replace(templateContent, "");
        const charsRemoved = lenBefore - newDescription.length;
        if (charsRemoved > 0) {
          log(
            `Article ${article.id}: Removed template "${template.name}" (${template.id}): ${charsRemoved} characters removed.`,
          );
        }
      }
      if (usedTemplateIds.includes(template.id)) {
        const index = usedTemplateIds.indexOf(template.id);
        usedTemplateIds.splice(index, 1);
      }
      utils.clearStoredReplacementTexts(article, template.id);
    }

    // Apply new templates, skipping already-applied ones.
    for (const template of newTemplates) {
      if (usedTemplateIds.includes(template.id)) {
        continue;
      }
      // A template whose article may not be used applies nothing (logged when loading).
      const templateContent = getTemplateContent(articles, template);
      if (templateContent) {
        if (newDescription !== "") {
          newDescription += "\n\n";
        }
        newDescription += templateContent;
        usedTemplateIds.push(template.id);
        log(
          `Article ${article.id}: Applied template "${template.name}" (${template.id}) from article ${template.articleId}`,
        );
      }
    }
    if (newDescription) {
      article.content = newDescription;
    }
    article.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);
  },
  requirements: {},
});
