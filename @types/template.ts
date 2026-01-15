export type EntityTypeCondition = {
  when: "entity_is";
  entityType: "issue" | "article";
};
export type FieldStateCondition = {
  when: "field_is";
  fieldName: string;
  fieldValue: string;
};
export type TagStateCondition = {
  when: "tag_is";
  tagName: string;
};
export type FieldActionCondition = {
  when: "field_becomes";
  fieldName: string;
  fieldValue: string;
};
export type TagActionCondition = {
  when: "tag_added";
  tagName: string;
};
export type Template = {
  id: string;
  name: string;
  articleId: string;
  validCondition: EntityTypeCondition | FieldStateCondition | TagStateCondition | null;
  addCondition: FieldActionCondition | TagActionCondition | null;
};

export const formatTemplateValidCondition = (template: Template): string => {
  if (!template?.validCondition) {
    return "No validity condition set.";
  }

  const validCond = template.validCondition;

  if (validCond?.when == null) {
    return "No validity condition set.";
  }

  let description = "";
  if (validCond.when === "entity_is") {
    description += validCond.entityType === "issue" ? "Valid when ticket." : "Valid when article.";
  } else if (validCond.when === "field_is") {
    description += `Valid when ticket field ${validCond.fieldName} is ${validCond.fieldValue}.`;
  } else if (validCond.when === "tag_is") {
    description += `Valid when ticket or article has tag ${validCond.tagName}.`;
  }
  return description;
};

export const formatTemplateAddCondition = (template: Template): string => {
  if (template.addCondition === null) {
    return "No automatic addition condition set.";
  }

  const addCond = template.addCondition;

  if (addCond?.when == null) {
    return "No automatic addition condition set.";
  }

  let description = "";
  if (addCond.when === "field_becomes") {
    description += `Added when ticket field ${addCond.fieldName} becomes ${addCond.fieldValue}.`;
  } else if (addCond.when === "tag_added") {
    description += `Added when ticket or article is tagged with ${addCond.tagName}.`;
  }
  return description;
};
