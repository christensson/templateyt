const isTemplateValidForIssue = (ytIssue, template) => {
  if (template.validCondition == null) {
    return true;
  }
  if (template.validCondition.when === "field_is") {
    return ytIssue.is(template.validCondition.fieldName, template.validCondition.fieldValue);
  }
  return false;
};

module.exports = { isTemplateValidForIssue };