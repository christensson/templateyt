const isTemplateValidForIssue = (ytIssue, template) => {
  if (template.validCondition == null) {
    return false;
  }
  if (template.validCondition.when === "field_is") {
    return ytIssue.is(template.validCondition.fieldName, template.validCondition.fieldValue);
  }
  if (template.validCondition.when === "tag_is") {
    return ytIssue.hasTag(template.validCondition.tagName);
  }
  return false;
};

module.exports = { isTemplateValidForIssue };
