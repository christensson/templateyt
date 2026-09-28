import AddIcon from "@jetbrains/icons/add-12px";
import ArrowLeftIcon from "@jetbrains/icons/arrow-left";
import ArticleIcon from "@jetbrains/icons/article";
import FieldIcon from "@jetbrains/icons/settings-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Checkbox from "@jetbrains/ring-ui-built/components/checkbox/checkbox";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import {
  formatChildAddConditions,
  formatTemplateField,
  getChildAddConditions,
  getTemplateFields,
  updateChildTemplate,
  type ChildTemplate,
  type FieldStateCondition,
  type Template,
} from "../../@types/template";
import FieldValueConditionInput from "./field-value-condition-input";
import TemplateFieldsPanel from "./template-fields-panel";

interface ChildAddConditionsPanelProps {
  child: ChildTemplate;
  editing: boolean;
  conditionFields: Array<ProjectFieldInfo>;
  onChange: (conditions: Array<FieldStateCondition>) => void;
}

// Conditions on the root ticket that decide whether the child template is created.
const ChildAddConditionsPanel: React.FunctionComponent<ChildAddConditionsPanelProps> = ({
  child,
  editing,
  conditionFields,
  onChange,
}) => {
  const conditions = getChildAddConditions(child);
  const updateCondition = (idx: number, fieldName: string, fieldValue: string) =>
    onChange(
      conditions.map((cond, index) =>
        index === idx ? { when: "field_is", fieldName, fieldValue } : cond,
      ),
    );
  const removeCondition = (idx: number) =>
    onChange(conditions.filter((_, index) => index !== idx));
  const addCondition = () =>
    onChange([...conditions, { when: "field_is", fieldName: "", fieldValue: "" }]);

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        Conditions on the root ticket for adding this child template (any matches)
      </Text>
      <Text size={Text.Size.S} info>
        The root ticket is the ticket the hierarchy is created from. Without conditions the child
        template is always added. Children of a skipped child template are skipped too.
      </Text>
      {!editing && <Text size={Text.Size.M}>{formatChildAddConditions(child)}</Text>}
      {editing && conditions.length === 0 && (
        <Text size={Text.Size.M}>No conditions, always added.</Text>
      )}
      {editing &&
        conditions.map((cond, idx) => (
          // Conditions have no identity of their own and the inputs are fully controlled by
          // `conditions`, so the position is the only stable key.
          // eslint-disable-next-line react/no-array-index-key
          <div key={`child-add-cond-${idx}`} style={{ display: "flex", gap: 8 }}>
            <FieldValueConditionInput
              fields={conditionFields}
              fieldName={cond.fieldName}
              fieldValue={cond.fieldValue}
              onChange={(fieldName, fieldValue) => updateCondition(idx, fieldName, fieldValue)}
              whenTitle="When root ticket field"
              verb="is"
            />
            <Button onClick={() => removeCondition(idx)} icon={TrashIcon} title="Remove condition"/>
          </div>
        ))}
      {editing && (
        <div>
          <Button onClick={addCondition} icon={AddIcon} inline>
            Add condition
          </Button>
        </div>
      )}
    </div>
  );
};

interface ChildTemplateEditProps {
  template: Template;
  child: ChildTemplate;
  editing: boolean;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  projectFields: Array<ProjectFieldInfo>;
  conditionFields: Array<ProjectFieldInfo>;
  onBack: () => void;
}

// Configuration of one child template of a hierarchical template: name, inheritance and fields.
const ChildTemplateEdit: React.FunctionComponent<ChildTemplateEditProps> = ({
  template,
  child,
  editing,
  setTemplate,
  projectFields,
  conditionFields,
  onBack,
}) => {
  const update = (updater: (prev: ChildTemplate) => ChildTemplate) =>
    setTemplate((prev) => updateChildTemplate(prev, child.id, updater));
  const childFields = getTemplateFields(child);

  return (
    <>
      <div>
        <Button icon={ArrowLeftIcon} inline onClick={onBack}>
          Back to template {template.name}
        </Button>
      </div>
      {editing ? (
        <Input
          label="Child template name (subtask summary)"
          value={child.name}
          onChange={(e) => update((prev) => ({ ...prev, name: e.target.value }))}
          size={Size.M}
        />
      ) : (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Child template name (subtask summary)
          </Text>
          <Text size={Text.Size.M}>{child.name}</Text>
        </div>
      )}
      <div className="template-edit-field-panel">
        <Text size={Text.Size.S} info>
          Child article
        </Text>
        <Button href={`/articles/${child.articleId}`} target="_blank" icon={ArticleIcon}>
          Open {child.articleId}
        </Button>
      </div>
      <ChildAddConditionsPanel
        child={child}
        editing={editing}
        conditionFields={conditionFields}
        onChange={(addConditions) => update((prev) => ({ ...prev, addConditions }))}
      />
      <div className="template-edit-field-panel">
        {editing ? (
          <>
            <Checkbox
              label="Inherit fields from parent"
              checked={child.inheritParentFields}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const inheritParentFields = e.target.checked;
                update((prev) => ({ ...prev, inheritParentFields }));
              }}
            />
            <Checkbox
              label="Inherit fields from root ticket"
              checked={child.inheritRootFields}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const inheritRootFields = e.target.checked;
                update((prev) => ({ ...prev, inheritRootFields }));
              }}
            />
          </>
        ) : (
          <>
            <Text size={Text.Size.M}>
              {child.inheritParentFields
                ? "Inherits fields from parent."
                : "Does not inherit fields from parent."}
            </Text>
            <Text size={Text.Size.M}>
              {child.inheritRootFields
                ? "Inherits fields from root ticket."
                : "Does not inherit fields from root ticket."}
            </Text>
          </>
        )}
        <Text size={Text.Size.S} info>
          Inherited fields are the fields configured by the parent template (copied from the parent
          ticket) or by the root template (copied from the root ticket) when the hierarchy is
          created. Precedence: own fields, then the closest parent, then the root ticket.
        </Text>
      </div>
      {editing ? (
        <TemplateFieldsPanel
          title="Ticket fields set by child template"
          fields={childFields}
          onFieldsChange={(fields) => update((prev) => ({ ...prev, fields }))}
          projectFields={projectFields}
          addCondition={null}
        />
      ) : (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Ticket fields set by child template
          </Text>
          {childFields.length === 0 && <Text size={Text.Size.M}>No fields set.</Text>}
          {childFields.map((field) => (
            <Text size={Text.Size.M} key={`child-field-text-${field.fieldName}`}>
              <Icon glyph={FieldIcon}/> {formatTemplateField(field, true)}
            </Text>
          ))}
        </div>
      )}
    </>
  );
};

export default ChildTemplateEdit;
