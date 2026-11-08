import ConditionIcon from "@jetbrains/icons/buildType-12px";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useMemo } from "react";
import { isMultiValueField, type ProjectFieldInfo } from "../../@types/project-info";
import {
  formatOptionAnswer,
  getConditionVerb,
  isOptionCondition,
  type ChildAddCondition,
  type TemplateOption,
} from "../../@types/template";

// List item type of a group header in Ring UI lists (List.ListProps.Type.TITLE).
const TITLE_ITEM_TYPE = 5;

const OPTION_PREFIX = "option:";
const FIELD_PREFIX = "field:";

const ANSWER_ITEMS: Array<SelectItem> = [
  { key: "yes", label: formatOptionAnswer(true) },
  { key: "no", label: formatOptionAnswer(false) },
];

interface ChildConditionInputProps {
  condition: ChildAddCondition;
  // The template's options.
  options: ReadonlyArray<TemplateOption>;
  // Root ticket fields that conditions can use; empty when only options apply (article-only).
  fields: ReadonlyArray<ProjectFieldInfo>;
  showFields: boolean;
  onChange: (condition: ChildAddCondition) => void;
}

// One condition of a child template, as a sentence: "When <option or field> is <value>." The
// first select lists the template's options, then the root ticket fields, under group headers.
// Options are answered Yes or No; multi-value fields read "includes".
const ChildConditionInput: React.FunctionComponent<ChildConditionInputProps> = ({
  condition,
  options,
  fields,
  showFields,
  onChange,
}) => {
  const subjectItems = useMemo(() => {
    const items: Array<SelectItem> = [{ key: "options-title", label: "Options", rgItemType: TITLE_ITEM_TYPE }];
    if (options.length === 0) {
      items.push({
        key: "options-none",
        label: "Add options in the template's Hierarchy section",
        disabled: true,
      });
    }
    for (const option of options) {
      items.push({ key: `${OPTION_PREFIX}${option.id}`, label: option.label.trim() || "Unnamed option" });
    }
    if (showFields) {
      items.push({ key: "fields-title", label: "Root ticket fields", rgItemType: TITLE_ITEM_TYPE });
      for (const field of fields) {
        items.push({
          key: `${FIELD_PREFIX}${field.name}`,
          label: field.name,
          description: isMultiValueField(field) ? "multiple values" : undefined,
        });
      }
    }
    return items;
  }, [options, fields, showFields]);

  const subjectKey = isOptionCondition(condition)
    ? `${OPTION_PREFIX}${condition.optionId}`
    : `${FIELD_PREFIX}${condition.fieldName}`;
  const selectedSubject = subjectItems.find((item) => item.key === subjectKey) ?? null;

  const valueItems = useMemo((): Array<SelectItem> => {
    if (isOptionCondition(condition)) {
      return ANSWER_ITEMS;
    }
    const info = fields.find((field) => field.name === condition.fieldName);
    return info ? info.values.map((value) => ({ key: value.name, label: value.presentation })) : [];
  }, [condition, fields]);

  let valueKey: string;
  if (isOptionCondition(condition)) {
    valueKey = condition.value ? "yes" : "no";
  } else {
    valueKey = condition.fieldValue;
  }
  const selectedValue = valueItems.find((item) => item.key === valueKey) ?? null;

  const verb = isOptionCondition(condition) ? "is" : getConditionVerb("is", fields, condition.fieldName);

  const onSelectSubject = (selected: SelectItem | null) => {
    if (!selected) {
      return;
    }
    const key = String(selected.key);
    // A new subject invalidates the value; options start at Yes, the more common question.
    if (key.startsWith(OPTION_PREFIX)) {
      onChange({ when: "option_is", optionId: key.slice(OPTION_PREFIX.length), value: true });
    } else if (key.startsWith(FIELD_PREFIX)) {
      onChange({ when: "field_is", fieldName: key.slice(FIELD_PREFIX.length), fieldValue: "" });
    }
  };

  const onSelectValue = (selected: SelectItem | null) => {
    if (!selected) {
      return;
    }
    if (isOptionCondition(condition)) {
      onChange({ ...condition, value: selected.key === "yes" });
    } else {
      onChange({ ...condition, fieldValue: String(selected.key) });
    }
  };

  return (
    <div>
      <Icon glyph={ConditionIcon}/>{" "}
      <Text size={Text.Size.M}>When </Text>
      <Select
        filter
        label="option or field..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={subjectItems}
        selected={selectedSubject}
        onSelect={onSelectSubject}
      />
      <Text size={Text.Size.M}>{` ${verb} `}</Text>
      <Select
        filter={!isOptionCondition(condition)}
        label="..."
        disabled={selectedSubject === null}
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={valueItems}
        selected={selectedValue}
        onSelect={onSelectValue}
      />
      .
    </div>
  );
};

export default ChildConditionInput;
