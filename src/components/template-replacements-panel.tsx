import AddIcon from "@jetbrains/icons/add-12px";
import ReplaceIcon from "@jetbrains/icons/pencil-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import type { TextReplacement, TicketFeatureAvailability } from "../../@types/template";

// Replacement modes; the root ticket field mode is marked or disabled when the template is
// (also) available for articles, which have no fields.
const getModeItems = (ticketFields: TicketFeatureAvailability): Array<SelectItem> => [
  { key: "user_input", label: "with text entered by user" },
  {
    key: "field",
    label: ticketFields === "allowed" ? "with root ticket field" : "with root ticket field (tickets only)",
    disabled: ticketFields === "unavailable",
  },
];

interface ReplacementRowProps {
  replacement: TextReplacement;
  projectFields: Array<ProjectFieldInfo>;
  onChange: (replacement: TextReplacement) => void;
  ticketFields: TicketFeatureAvailability;
}

const ReplacementRow: React.FunctionComponent<ReplacementRowProps> = ({
  replacement,
  projectFields,
  onChange,
  ticketFields,
}) => {
  const modeItems = useMemo(() => getModeItems(ticketFields), [ticketFields]);
  const fieldItems = useMemo(
    () => projectFields.map((field) => ({ key: field.name, label: field.name })),
    [projectFields],
  );
  const selectedMode = modeItems.find((item) => item.key === replacement.mode) || null;
  const selectedField =
    replacement.mode === "field"
      ? fieldItems.find((item) => item.key === replacement.fieldName) || null
      : null;

  const onSelectMode = (selected: SelectItem | null) => {
    if (!selected) {
      return;
    }
    onChange(
      selected.key === "field"
        ? { search: replacement.search, mode: "field", fieldName: "" }
        : { search: replacement.search, mode: "user_input" },
    );
  };

  return (
    <div className="template-replacement-row">
      <Icon glyph={ReplaceIcon}/>{" "}
      <Text size={Text.Size.M}>Replace </Text>
      <Input
        value={replacement.search}
        placeholder="WORD"
        size={Size.S}
        onChange={(e) => onChange({ ...replacement, search: e.target.value })}
      />{" "}
      <Select
        label="..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={modeItems}
        selected={selectedMode}
        onSelect={onSelectMode}
      />
      {replacement.mode === "field" && (
        <>
          {" "}
          <Select
            clear
            filter
            label="..."
            type={Select.Type.INLINE}
            size={Select.Size.AUTO}
            data={fieldItems}
            selected={selectedField}
            onSelect={(selected: SelectItem | null) => {
              if (selected) {
                onChange({ search: replacement.search, mode: "field", fieldName: String(selected.key) });
              }
            }}
          />
        </>
      )}
      .
    </div>
  );
};

interface TemplateReplacementsPanelProps {
  replacements: Array<TextReplacement>;
  onReplacementsChange: (replacements: Array<TextReplacement>) => void;
  projectFields: Array<ProjectFieldInfo>;
  // Whether root ticket field replacements can be configured, see getTicketFeatureAvailability.
  ticketFields?: TicketFeatureAvailability;
}

// Editable list of the whole-word text replacements a template applies.
const TemplateReplacementsPanel: React.FunctionComponent<TemplateReplacementsPanelProps> = ({
  replacements,
  onReplacementsChange,
  projectFields,
  ticketFields = "allowed",
}) => {
  const updateReplacement = (idx: number, replacement: TextReplacement) =>
    onReplacementsChange(
      replacements.map((current, index) => (index === idx ? replacement : current)),
    );
  const addReplacement = () =>
    onReplacementsChange([...replacements, { search: "", mode: "user_input" }]);
  const removeReplacement = (idx: number) =>
    onReplacementsChange(replacements.filter((_, index) => index !== idx));

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        Text replacements
      </Text>
      {replacements.map((replacement, idx) => (
        // Replacements are keyed by position: the word is user-editable and may be empty or
        // temporarily duplicated while editing, and the inputs are fully controlled.
        // eslint-disable-next-line react/no-array-index-key
        <div key={`replacement-${idx}`} style={{ display: "flex", gap: 8 }}>
          <ReplacementRow
            replacement={replacement}
            projectFields={projectFields}
            onChange={(updated) => updateReplacement(idx, updated)}
            ticketFields={ticketFields}
          />
          <Button onClick={() => removeReplacement(idx)} icon={TrashIcon} title="Remove replacement"/>
        </div>
      ))}
      <div>
        <Button onClick={addReplacement} icon={AddIcon} inline>
          Add replacement
        </Button>
      </div>
      <Text size={Text.Size.S} info>
        Replaces whole words in the summary, the content and all subtasks. See Help for details.
      </Text>
    </div>
  );
};

export default TemplateReplacementsPanel;
