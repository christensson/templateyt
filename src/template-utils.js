const getTemplates = (ctx) => {
  const templatesJson = ctx.project.extensionProperties.templates;
  const templates = templatesJson ? JSON.parse(templatesJson) : [];
  // Filter incomplete templates.
  return templates.filter((t) => t.id && t.articleId);
};

const isTemplateValidForIssue = (ytIssue, template) => {
  if (template.validCondition == null) {
    return false;
  }
  if (template.validCondition.when === "entity_is") {
    return template.validCondition.entityType === "issue";
  }
  if (template.validCondition.when === "field_is") {
    return ytIssue.is(template.validCondition.fieldName, template.validCondition.fieldValue);
  }
  if (template.validCondition.when === "tag_is") {
    return ytIssue.hasTag(template.validCondition.tagName);
  }
  return false;
};

const isTemplateValidForArticle = (ytArticle, template) => {
  if (template.validCondition == null) {
    return false;
  }
  if (template.validCondition.when === "entity_is") {
    return template.validCondition.entityType === "article";
  }
  if (template.validCondition.when === "tag_is") {
    return ytArticle.hasTag(template.validCondition.tagName);
  }
  return false;
};

module.exports = { getTemplates, isTemplateValidForIssue, isTemplateValidForArticle };
