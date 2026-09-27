import ArrowLeftIcon from "@jetbrains/icons/arrow-left";
import ArticleIcon from "@jetbrains/icons/article";
import FieldIcon from "@jetbrains/icons/settings-12px";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Checkbox from "@jetbrains/ring-ui-built/components/checkbox/checkbox";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import {
  formatTemplateField,
  getTemplateFields,
  updateChildTemplate,
  type ChildTemplate,
  type Template,
} from "../../@types/template";
import TemplateFieldsPanel from "./template-fields-panel";

interface ChildTemplateEditProps {
  template: Template;
  child: ChildTemplate;
  editing: boolean;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  projectFields: Array<ProjectFieldInfo>;
  onBack: () => void;
}

// Configuration of one child template of a hierarchical template: name, inheritance and fields.
const ChildTemplateEdit: React.FunctionComponent<ChildTemplateEditProps> = ({
  template,
  child,
  editing,
  setTemplate,
  projectFields,
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
      <div className="template-edit-field-panel">
        {editing ? (
          <Checkbox
            label="Inherit fields from parent"
            checked={child.inheritParentFields}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const inheritParentFields = e.target.checked;
              update((prev) => ({ ...prev, inheritParentFields }));
            }}
          />
        ) : (
          <Text size={Text.Size.M}>
            {child.inheritParentFields
              ? "Inherits fields from parent."
              : "Does not inherit fields from parent."}
          </Text>
        )}
        <Text size={Text.Size.S} info>
          Inherited fields are the fields configured by the parent template, copied from the parent
          ticket when the hierarchy is created. Own fields take precedence.
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
