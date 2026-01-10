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
