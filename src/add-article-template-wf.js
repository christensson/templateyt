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
        if (article.tags.removed.find((t) => t.name === tagName)) {
          return true;
        }
        // ...or will match the condition on change.
        if (article.tags.added.find((t) => t.name === tagName)) {
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

exports.rule = entities.Article.onChange({
  title: "Apply article template",
  guard: function (ctx) {
    const article = ctx.article;

    // Do not ever add templates to the articles defined as templates.
    if (article.extensionProperties.isTemplate === true) {
      return false;
    }

    const validTemplates = getValidTemplates(ctx, article);

    log("Article " + article.id + " valid templates article: " + JSON.stringify(validTemplates));
    if (validTemplates.length == 0) {
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
  action: function (ctx) {
    const article = ctx.article;
    const usedTemplateIds = JSON.parse(article.extensionProperties.usedTemplateIds) || [];
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
          return article.tags.added.find((t) => t.name === cond.tagName);
        }
        return false;
      });
    const oldTemplates = templates
      .filter((t) => (t?.addCondition ? ["tag_added"].includes(t?.addCondition?.when) : false))
      .filter((t) => {
        const cond = t.addCondition;
        if (cond.when === "tag_added") {
          return article.tags.removed.find((t) => t.name === cond.tagName);
        }
        return false;
      });

    // Also remove any of the new templates that are already used.
    oldTemplates.push(
      ...newTemplates
        .filter((t) => usedTemplateIds.includes(t.id))
        .filter((t) => !oldTemplates.find((ot) => ot.id === t.id)),
    );

    log(`Ticket ${article.id}: Templates to apply: ${JSON.stringify(newTemplates)}`);
    log(`Ticket ${article.id}: Templates to potentially remove: ${JSON.stringify(oldTemplates)}`);

    // Load articles.
    const articles = {};
    for (const t of [...newTemplates, ...oldTemplates]) {
      const articleId = t.articleId;
      if (articles[articleId]) {
        continue;
      }
      const article = entities.Article.findById(articleId);
      if (article != null) {
        articles[articleId] = article;
      }
    }
    let newDescription = article.content ? article.content.trim() : "";

    // Remove any old (or new) non-modified templates.
    for (const template of oldTemplates) {
      const templateArticle = articles[template.articleId];
      const templateContent = templateArticle.content.trim();
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
    }

    // Apply new templates.
    for (const template of newTemplates) {
      const templateArticle = articles[template.articleId];
      const templateContent = templateArticle.content.trim();
      if (templateContent) {
        if (newDescription !== "") {
          newDescription += "\n\n";
        }
        newDescription += templateContent;
        if (!usedTemplateIds.includes(template.id)) {
          usedTemplateIds.push(template.id);
        }
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
