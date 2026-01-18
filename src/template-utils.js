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
  });

  // Filter incomplete templates.
  return templates.filter((t) => t.id && t.articleId);
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
      if (ytIssue.is(cond.fieldName, cond.fieldValue)) {
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

module.exports = { getTemplates, isTemplateValidForIssue, isTemplateValidForArticle };
