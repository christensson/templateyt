/* YouTrack Workflow API example */
var entities = require("@jetbrains/youtrack-scripting-api/entities");
var utils = require("./template-utils.js");

const loggingEnabled = true;
const log = (msg) => {
  if (loggingEnabled) {
    console.log(msg);
  }
};

const getValidTemplates = (ctx, issue) => {
  const templates = utils.getTemplates(ctx);
  log(`Issue ${issue.id}: All templates: ${JSON.stringify(templates)}`);
  return templates.filter((t) => {
    const conditions = Array.isArray(t.validCondition) ? t.validCondition : [];
    for (const cond of conditions) {
      if (!cond || !cond.when) {
        continue;
      }
      if (cond.when === "entity_is") {
        return cond.entityType === "issue";
      } else if (cond.when === "field_is") {
        // Valid templates currently matches the condition...
        if (issue.is(cond.fieldName, cond.fieldValue)) {
          return true;
        }
        // ...or was matching the condition before change...
        if (issue.was(cond.fieldName, cond.fieldValue)) {
          return true;
        }
        // ...or will match the condition on change.
        if (
          issue.isChanged(cond.fieldName) &&
          issue.fields.becomes(cond.fieldName, cond.fieldValue)
        ) {
          return true;
        }
      } else if (cond.when === "tag_is") {
        const tagName = cond.tagName;
        // Valid templates currently matches the condition...
        if (issue.hasTag(tagName)) {
          return true;
        }
        // ...or was matching the condition before change...
        if (issue.tags.removed.find((t) => t.name === tagName)) {
          return true;
        }
        // ...or will match the condition on change.
        if (issue.tags.added.find((t) => t.name === tagName)) {
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

exports.rule = entities.Issue.onChange({
  title: "Apply ticket template",
  guard: function (ctx) {
    const issue = ctx.issue;
    const validTemplates = getValidTemplates(ctx, issue);

    log("Issue " + issue.id + " valid templates issue: " + JSON.stringify(validTemplates));
    if (validTemplates.length == 0) {
      return false;
    }

    const validActionFields = validTemplates
      .filter((t) => (t?.addCondition ? t?.addCondition?.when === "field_becomes" : false))
      .map((t) => ({
        name: t.addCondition.fieldName,
        value: t.addCondition.fieldValue,
      }));
    let matchedActionFields = [];
    if (issue.isNew) {
      matchedActionFields = validActionFields.filter((f) => issue.fields[f.name]?.name === f.value);
    } else {
      matchedActionFields = validActionFields.filter(
        (f) => issue.isChanged(f.name) && issue.fields.becomes(f.name, f.value),
      );
    }
    log(
      "Issue " + issue.id + " (new) fields matched issue: " + JSON.stringify(matchedActionFields),
    );
    if (matchedActionFields.length > 0) {
      return true;
    }

    const validActionTags = validTemplates
      .filter((t) => (t?.addCondition ? t?.addCondition?.when === "tag_added" : false))
      .map((t) => ({
        tagName: t.addCondition.tagName,
      }));
    let matchedActionTags = [];
    if (issue.isNew) {
      matchedActionTags = validActionTags.filter((t) =>
        issue.tags.find((tag) => tag.name === t.tagName),
      );
    } else {
      matchedActionTags = validActionTags.filter(
        (t) =>
          issue.tags.added.find((tag) => tag.name === t.tagName) ||
          issue.tags.removed.find((tag) => tag.name === t.tagName),
      );
    }
    log("Issue " + issue.id + " (new) tags matched issue: " + JSON.stringify(matchedActionTags));
    return matchedActionTags.length > 0;
  },
  action: function (ctx) {
    const issue = ctx.issue;
    const usedTemplateIds = JSON.parse(issue.extensionProperties.usedTemplateIds) || [];
    const templates = getValidTemplates(ctx, issue);
    log(`Issue ${issue.id}${issue.isNew ? " (new)" : ""} templates: ${JSON.stringify(templates)}`);
    const newTemplates = templates
      .filter((t) =>
        t?.addCondition ? ["field_becomes", "tag_added"].includes(t?.addCondition?.when) : false,
      )
      .filter((t) => {
        const cond = t.addCondition;
        if (issue.isNew) {
          if (cond.when === "field_becomes") {
            return issue.is(cond.fieldName, cond.fieldValue);
          } else if (cond.when === "tag_added") {
            return issue.hasTag(cond.tagName);
          }
          return false;
        }

        if (cond.when === "field_becomes") {
          return (
            issue.isChanged(cond.fieldName) && issue.fields.becomes(cond.fieldName, cond.fieldValue)
          );
        } else if (cond.when === "tag_added") {
          return issue.tags.added.find((t) => t.name === cond.tagName);
        }
        return false;
      });
    const oldTemplates = templates
      .filter((t) =>
        t?.addCondition ? ["field_becomes", "tag_added"].includes(t?.addCondition?.when) : false,
      )
      .filter((t) => {
        const cond = t.addCondition;
        if (cond.when === "field_becomes") {
          return issue.isChanged(cond.fieldName) && issue.was(cond.fieldName, cond.fieldValue);
        } else if (cond.when === "tag_added") {
          return issue.tags.removed.find((t) => t.name === cond.tagName);
        }
        return false;
      });

    // Also remove any of the new templates that are already used.
    oldTemplates.push(
      ...newTemplates
        .filter((t) => usedTemplateIds.includes(t.id))
        .filter((t) => !oldTemplates.find((ot) => ot.id === t.id)),
    );

    log(`Ticket ${issue.id}: Templates to apply: ${JSON.stringify(newTemplates)}`);
    log(`Ticket ${issue.id}: Templates to potentially remove: ${JSON.stringify(oldTemplates)}`);

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
    let newDescription = issue.description ? issue.description.trim() : "";

    // Remove any old (or new) non-modified templates.
    for (const template of oldTemplates) {
      const article = articles[template.articleId];
      const templateContent = article.content.trim();
      if (templateContent) {
        const lenBefore = newDescription.length;
        newDescription = newDescription.replace(templateContent, "");
        const charsRemoved = lenBefore - newDescription.length;
        if (charsRemoved > 0) {
          log(
            `Ticket ${issue.id}: Removed template "${template.name}" (${template.id}): ${charsRemoved} characters removed.`,
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
      const article = articles[template.articleId];
      const templateContent = article.content.trim();
      if (templateContent) {
        if (newDescription !== "") {
          newDescription += "\n\n";
        }
        newDescription += templateContent;
        if (!usedTemplateIds.includes(template.id)) {
          usedTemplateIds.push(template.id);
        }
        log(
          `Ticket ${issue.id}: Applied template "${template.name}" (${template.id}) from article ${template.articleId}`,
        );
      }
    }
    if (newDescription) {
      issue.description = newDescription;
    }
    issue.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);
  },
  requirements: {},
});
