import AddIcon from "@jetbrains/icons/add-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import type { AddCondition, TemplateField } from "../../@types/template";
import TemplateFieldInput from "./template-field-input";

interface TemplateFieldsPanelProps {
  title: string;
  fields: Array<TemplateField>;
  onFieldsChange: (fields: Array<TemplateField>) => void;
  projectFields: Array<ProjectFieldInfo>;
  // The automatic add condition of the owning template, for the trigger-field hint.
  addCondition: AddCondition | null;
}

// Editable list of the ticket fields a template (or child template) sets.
const TemplateFieldsPanel: React.FunctionComponent<TemplateFieldsPanelProps> = ({
  title,
  fields,
  onFieldsChange,
  projectFields,
  addCondition,
}) => {
  const hasFieldTrigger = addCondition?.when === "field_becomes";
  const hasUserInput = fields.some((field) => field.mode === "user_input");

  const updateField = (idx: number, field: TemplateField) =>
    onFieldsChange(fields.map((current, index) => (index === idx ? field : current)));

  const addField = () =>
    onFieldsChange([...fields, { fieldName: "", mode: "fixed", fieldValue: "" }]);

  const removeField = (idx: number) => onFieldsChange(fields.filter((_, index) => index !== idx));

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        {title}
      </Text>
      {fields.length === 0 && <Text size={Text.Size.M}>No fields set yet.</Text>}
      {fields.map((field, idx) => (
        // Fields are keyed by position: the field name is user-editable and may be empty or
        // temporarily duplicated while editing, and the inputs are fully controlled by `fields`.
        // eslint-disable-next-line react/no-array-index-key
        <div key={`template-field-${idx}`} style={{ display: "flex", gap: 8 }}>
          <TemplateFieldInput
            fields={projectFields}
            field={field}
            onChange={(updated) => updateField(idx, updated)}
          />
          <Button onClick={() => removeField(idx)} icon={TrashIcon} title="Remove field"/>
        </div>
      ))}
      <div>
        <Button onClick={addField} icon={AddIcon} inline>
          Add field
        </Button>
      </div>
      {hasUserInput && (
        <Text size={Text.Size.S} info>
          Fields with a value chosen by the user are only set when the template is applied manually
          from the Apply template menu of a ticket.
        </Text>
      )}
      {hasFieldTrigger && fields.length > 0 && (
        <Text size={Text.Size.S} info>
          The field used in the automatic add condition can only be set to the triggering value.
        </Text>
      )}
    </div>
  );
};

export default TemplateFieldsPanel;
