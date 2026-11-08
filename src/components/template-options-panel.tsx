import AddIcon from "@jetbrains/icons/add-12px";
import OptionIcon from "@jetbrains/icons/flag-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";
import {
  createOption,
  getOptionUsage,
  getTemplateOptions,
  type Template,
  type TemplateOption,
} from "../../@types/template";

// How an option is preselected when the hierarchy is created.
const DEFAULT_ITEMS: Array<SelectItem> = [
  { key: "yes", label: "Yes by default" },
  { key: "no", label: "No by default" },
  { key: "choose", label: "User must choose" },
];

const getDefaultKey = (option: TemplateOption): string => {
  if (option.default === null) {
    return "choose";
  }
  return option.default ? "yes" : "no";
};

const DEFAULT_BY_KEY: Record<string, boolean | null> = { yes: true, no: false, choose: null };

interface TemplateOptionsPanelProps {
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
}

// Editable yes/no options of a hierarchical template, answered when the hierarchy is created.
// Child templates refer to options by id, so an option used by conditions cannot be removed:
// dropping those conditions would silently create the subtasks always.
const TemplateOptionsPanel: React.FunctionComponent<TemplateOptionsPanelProps> = ({
  template,
  setTemplate,
}) => {
  const usage = getOptionUsage(template);
  const setOptions = (update: (options: Array<TemplateOption>) => Array<TemplateOption>) =>
    setTemplate((prev) => ({ ...prev, options: update(getTemplateOptions(prev)) }));
  const updateOption = (id: string, changes: Partial<TemplateOption>) =>
    setOptions((options) => options.map((option) => (option.id === id ? { ...option, ...changes } : option)));

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        Options
      </Text>
      <Text size={Text.Size.S} info>
        Yes/no questions asked when the subtasks are created. Child templates can be created
        depending on the answer.
      </Text>
      {usage.map(({ option, childNames }) => (
        <div key={option.id}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div>
              <Icon glyph={OptionIcon}/>{" "}
              <Text size={Text.Size.M}>Option </Text>
              <Input
                value={option.label}
                placeholder="e.g. Security review"
                aria-label="Option name"
                size={Size.M}
                onChange={(e) => updateOption(option.id, { label: e.target.value })}
              />{" "}
              <Select
                type={Select.Type.INLINE}
                size={Select.Size.AUTO}
                data={DEFAULT_ITEMS}
                selected={DEFAULT_ITEMS.find((item) => item.key === getDefaultKey(option)) ?? null}
                onSelect={(selected: SelectItem | null) => {
                  if (selected) {
                    updateOption(option.id, { default: DEFAULT_BY_KEY[String(selected.key)] });
                  }
                }}
              />
            </div>
            <Button
              icon={TrashIcon}
              disabled={childNames.length > 0}
              title={
                childNames.length > 0
                  ? `Used by conditions of ${childNames.join(", ")}. Remove those first.`
                  : "Remove option"
              }
              onClick={() => setOptions((options) => options.filter((current) => current.id !== option.id))}
            />
          </div>
          <Text size={Text.Size.S} info>
            {childNames.length > 0
              ? `Used by ${childNames.join(", ")}`
              : "Not used by any child template yet. Add a condition on it to a child template."}
          </Text>
        </div>
      ))}
      <div>
        <Button
          onClick={() => setOptions((options) => [...options, createOption()])}
          icon={AddIcon}
          inline
        >
          Add option
        </Button>
      </div>
    </div>
  );
};

export default TemplateOptionsPanel;
