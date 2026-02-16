import {v4 as uuidv4 } from "uuid";

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
export type ValidCondition = EntityTypeCondition | FieldStateCondition | TagStateCondition;
export type AddCondition = FieldActionCondition | TagActionCondition;
export type Template = {
  id: string;
  name: string;
  articleId: string;
  validCondition: Array<ValidCondition>;
  addCondition: AddCondition | null;
};

export const formatValidCondition = (
  validCond: ValidCondition,
  capitalize: boolean = false,
): string => {
  let str = "";
  if (validCond.when === "entity_is") {
    str = validCond.entityType === "issue" ? "ticket" : "article";
  } else if (validCond.when === "field_is") {
    str = `ticket field ${validCond.fieldName} is ${validCond.fieldValue}`;
  } else if (validCond.when === "tag_is") {
    str = `ticket or article has tag ${validCond.tagName}`;
  }
  if (capitalize && str.length > 0) {
    str = str.charAt(0).toUpperCase() + str.slice(1);
  }
  return str;
};

export const formatAddCondition = (
  addCond: AddCondition | null,
  capitalize: boolean = false,
): string => {
  let str = "No automatic addition condition set.";
  if (addCond == null || addCond?.when == null) {
    return str;
  }

  if (addCond.when === "field_becomes") {
    str = `ticket field ${addCond.fieldName} becomes ${addCond.fieldValue}.`;
  } else if (addCond.when === "tag_added") {
    str = `ticket or article is tagged with ${addCond.tagName}.`;
  }
  if (capitalize && str.length > 0) {
    str = str.charAt(0).toUpperCase() + str.slice(1);
  }
  return str;
};

export const formatTemplateValidCondition = (template: Template): string => {
  const conditions = Array.isArray(template?.validCondition) ? template.validCondition : [];
  if (conditions.length === 0) {
    return "No validity condition set.";
  }

  const parts = conditions
    .map((validCond) => formatValidCondition(validCond))
    .filter((s) => s.length > 0);

  if (parts.length === 0) {
    return "No validity condition set.";
  }
  if (parts.length === 1) {
    return `Valid when ${parts[0]}.`;
  }

  return `Valid when any of; ${parts.join(", or ")}.`;
};

export const formatTemplateAddCondition = (template: Template): string => {
  const addCond = template.addCondition;
  if (addCond == null || addCond?.when == null) {
    return "No automatic addition condition set.";
  }

  return `Added when ${formatAddCondition(addCond)}`;
};

export const createEmptyTemplate = (): Template => ({
  id: uuidv4(),
  name: "",
  articleId: "",
  validCondition: [],
  addCondition: null,
});

export const createNullTemplate = (): Template => ({
  id: "", // Indicate null template with empty id.
  name: "",
  articleId: "",
  validCondition: [],
  addCondition: null,
});
