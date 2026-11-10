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
        if (utils.issueFieldHasValue(issue, cond.fieldName, cond.fieldValue)) {
          return true;
        }
        // ...or was matching the condition before change...
        if (utils.issueFieldWas(issue, cond.fieldName, cond.fieldValue)) {
          return true;
        }
        // ...or will match the condition on change.
        if (utils.issueFieldBecomes(issue, cond.fieldName, cond.fieldValue)) {
          return true;
        }
      } else if (cond.when === "tag_is") {
        const tagName = cond.tagName;
        // Valid templates currently matches the condition...
        if (issue.hasTag(tagName)) {
          return true;
        }
        // ...or was matching the condition before change...
        if (issue.tags.removed.find((tag) => tag.name === tagName)) {
          return true;
        }
        // ...or will match the condition on change.
        if (issue.tags.added.find((tag) => tag.name === tagName)) {
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
const loadTemplateArticles = (issue, templates) => {
  const articles = {};
  for (const t of templates) {
    const articleId = t.articleId;
    if (articles[articleId]) {
      continue;
    }
    const article = entities.Article.findById(articleId);
    if (article != null && utils.isUsableTemplateArticle(article, issue.project)) {
      articles[articleId] = article;
    } else {
      log(
        `Issue ${issue.id}: Template "${t.name}" (${t.id}) skipped: article ${articleId} not found or not shared with project ${issue.project.key}`,
      );
    }
  }
  return articles;
};

// Trimmed content of the template's article, or "" when the article was skipped when loading.
const getTemplateContent = (articles, template) => {
  const article = articles[template.articleId];
  return article && article.content ? article.content.trim() : "";
};

// Sets the fixed-value fields and the relations to fixed tickets of a template on the issue; tags
// are only added on manual application. User-input fields are only set on manual application,
// so templates having them are marked as waiting for user input.
// Problems are logged and skipped so that the user's change is never blocked.
const applyTemplateFields = (ctx, issue, template) => {
  const resolved = utils.resolveTemplateFieldValues(issue.project, template, {}, false);
  for (const error of resolved.errors) {
    log(`Issue ${issue.id}: Template "${template.name}" (${template.id}) field skipped: ${error}`);
  }
  utils.applyFieldAssignments(issue, resolved.assignments);
  // Relations to fixed tickets are added also when the template is added automatically.
  const relations = utils.resolveFixedRelations(issue, template, ctx.currentUser);
  for (const error of relations.errors) {
    log(`Issue ${issue.id}: Template "${template.name}" (${template.id}) relation skipped: ${error}`);
  }
  utils.applyRelations(issue, relations.links);
  for (const assignment of resolved.assignments) {
    log(`Issue ${issue.id}: Template "${template.name}" (${template.id}) set field ${assignment.fieldName}`);
  }
  if (utils.templateHasUserInput(template)) {
    utils.markTemplatePending(issue, template.id);
    log(`Issue ${issue.id}: Template "${template.name}" (${template.id}) waits for user input`);
  }
};

// Texts of the field replacements of a template for the issue. User-input replacements are only
// available on manual application; unresolvable field replacements are logged and skipped. A
// replacement whose root ticket field is empty marks the template as waiting for user input, so
// that "Set fields" in the Apply template menu asks for the field.
const resolveReplacementValues = (issue, template) => {
  const replacements = utils.resolveReplacements(issue, template, {}, false);
  for (const error of replacements.errors) {
    log(`Issue ${issue.id}: Template "${template.name}" (${template.id}) replacement skipped: ${error}`);
  }
  if (replacements.emptyFields.length > 0) {
    utils.markTemplatePending(issue, template.id);
    log(
      `Issue ${issue.id}: Template "${template.name}" (${template.id}) waits for fields ${replacements.emptyFields.join(", ")}`,
    );
  }
  return replacements.values;
};

const setSummaryIfChanged = (issue, newSummary) => {
  if (newSummary !== (issue.summary || "")) {
    issue.summary = newSummary;
  }
};

// Field add-conditions of the templates that match the current change (or the new issue).
const getMatchedActionFields = (issue, validTemplates) => {
  const validActionFields = validTemplates
    .filter((t) => (t?.addCondition ? t?.addCondition?.when === "field_becomes" : false))
    .map((t) => ({
      name: t.addCondition.fieldName,
      value: t.addCondition.fieldValue,
    }));
  if (issue.isNew) {
    return validActionFields.filter((f) => utils.newIssueFieldHasValue(issue, f.name, f.value));
  }
  return validActionFields.filter((f) => utils.issueFieldBecomes(issue, f.name, f.value));
};

// Tag add-conditions of the templates that match the current change (or the new issue).
const getMatchedActionTags = (issue, validTemplates) => {
  const validActionTags = validTemplates
    .filter((t) => (t?.addCondition ? t?.addCondition?.when === "tag_added" : false))
    .map((t) => ({
      tagName: t.addCondition.tagName,
    }));
  if (issue.isNew) {
    return validActionTags.filter((t) => issue.tags.find((tag) => tag.name === t.tagName));
  }
  return validActionTags.filter(
    (t) =>
      issue.tags.added.find((tag) => tag.name === t.tagName) ||
      issue.tags.removed.find((tag) => tag.name === t.tagName),
  );
};

exports.rule = entities.Issue.onChange({
  title: "Apply ticket template",
  guard: function guard(ctx) {
    const issue = ctx.issue;
    // Subtasks created from a template hierarchy get their content and fields from the
    // hierarchy; do not auto-apply templates to them on creation.
    if (issue.isNew && issue.extensionProperties.createdFromChildTemplateId) {
      return false;
    }
    const validTemplates = getValidTemplates(ctx, issue);

    log("Issue " + issue.id + " valid templates issue: " + JSON.stringify(validTemplates));
    if (validTemplates.length === 0) {
      return false;
    }

    const matchedActionFields = getMatchedActionFields(issue, validTemplates);
    log(
      `Issue ${issue.id}${issue.isNew ? " (new)" : ""} fields matched issue: ${JSON.stringify(matchedActionFields)}`,
    );
    if (matchedActionFields.length > 0) {
      return true;
    }

    const matchedActionTags = getMatchedActionTags(issue, validTemplates);
    log(
      `Issue ${issue.id}${issue.isNew ? " (new)" : ""} tags matched issue: ${JSON.stringify(matchedActionTags)}`,
    );
    return matchedActionTags.length > 0;
  },
  action: function action(ctx) {
    const issue = ctx.issue;
    const usedTemplateIds = utils.parseIdList(issue.extensionProperties.usedTemplateIds);
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
            return utils.issueFieldHasValue(issue, cond.fieldName, cond.fieldValue);
          } else if (cond.when === "tag_added") {
            return issue.hasTag(cond.tagName);
          }
          return false;
        }

        if (cond.when === "field_becomes") {
          return utils.issueFieldBecomes(issue, cond.fieldName, cond.fieldValue);
        } else if (cond.when === "tag_added") {
          return issue.tags.added.find((tag) => tag.name === cond.tagName);
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
          return utils.issueFieldWas(issue, cond.fieldName, cond.fieldValue);
        } else if (cond.when === "tag_added") {
          return issue.tags.removed.find((tag) => tag.name === cond.tagName);
        }
        return false;
      });

    log(`Ticket ${issue.id}: Templates to apply: ${JSON.stringify(newTemplates)}`);
    log(`Ticket ${issue.id}: Templates to potentially remove: ${JSON.stringify(oldTemplates)}`);

    const articles = loadTemplateArticles(issue, [...newTemplates, ...oldTemplates]);
    let newDescription = issue.description ? issue.description.trim() : "";
    let newSummary = issue.summary || "";

    // Remove any old (or new) non-modified templates.
    for (const template of oldTemplates) {
      const templateContent = getTemplateContent(articles, template);
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
      utils.clearTemplatePending(issue, template.id);
      utils.clearStoredReplacementTexts(issue, template.id);
    }

    // Apply new templates, skipping already-applied ones.
    for (const template of newTemplates) {
      if (usedTemplateIds.includes(template.id)) {
        continue;
      }
      // A template whose article may not be used applies nothing (logged when loading).
      if (!articles[template.articleId]) {
        continue;
      }
      const replacementValues = resolveReplacementValues(issue, template);
      const templateContent = utils.applyReplacements(
        getTemplateContent(articles, template),
        replacementValues,
      );
      if (templateContent) {
        if (newDescription !== "") {
          newDescription += "\n\n";
        }
        newDescription += templateContent;
      }
      // Only articles the project may use are loaded, so the title never comes from another one.
      // There is no user to ask: an existing title is only replaced by "always" templates.
      newSummary = utils.pickTemplateTitle(newSummary, template, articles[template.articleId], undefined);
      newSummary = utils.applyReplacements(newSummary, replacementValues);
      applyTemplateFields(ctx, issue, template);
      usedTemplateIds.push(template.id);
      log(
        `Ticket ${issue.id}: Applied template "${template.name}" (${template.id}) from article ${template.articleId}`,
      );
    }
    if (newDescription) {
      issue.description = newDescription;
    }
    setSummaryIfChanged(issue, newSummary);
    issue.extensionProperties.usedTemplateIds = JSON.stringify(usedTemplateIds);
  },
  requirements: {},
});
