import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import {
  flattenChildTemplates,
  getChildTemplates,
  getTemplateFields,
  hasUserInputFields,
  hierarchyHasUserInputFields,
  type ChildTemplate,
  type Template,
  type TemplateField,
} from "../../@types/template";
import {
  ACTION_LABELS,
  formatPendingTitle,
  type ChildFieldValues,
  type FieldValues,
  type PendingApply,
} from "../template-client";

interface UserInputFieldSelectProps {
  field: TemplateField;
  fieldInfos: Array<ProjectFieldInfo>;
  value: string | null;
  onChange: (fieldName: string, value: string | null) => void;
}

const UserInputFieldSelect: React.FunctionComponent<UserInputFieldSelectProps> = ({
  field,
  fieldInfos,
  value,
  onChange,
}) => {
  const items = useMemo(() => {
    const info = fieldInfos.find((f) => f.name === field.fieldName);
    return info ? info.values.map((v) => ({ key: v.name, label: v.presentation })) : [];
  }, [fieldInfos, field.fieldName]);
  const selected = items.find((item) => item.key === value) || null;
  return (
    <div>
      <Text size={Text.Size.M}>Set {field.fieldName} to </Text>
      <Select
        clear
        filter
        label="..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={items}
        selected={selected}
        onSelect={(item: SelectItem | null) =>
          onChange(field.fieldName, item ? String(item.key) : null)
        }
      />
    </div>
  );
};

interface FieldPreviewListProps {
  fields: Array<TemplateField>;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  onChange: (fieldName: string, value: string | null) => void;
}

// What a template will set: fixed fields as text, user-input fields as selects.
const FieldPreviewList: React.FunctionComponent<FieldPreviewListProps> = ({
  fields,
  fieldInfos,
  values,
  onChange,
}) => (
  <>
    {fields.map((field) =>
      field.mode === "fixed" ? (
        <Text size={Text.Size.M} info key={field.fieldName}>
          Will set {field.fieldName} to {field.fieldValue}.
        </Text>
      ) : (
        <UserInputFieldSelect
          key={field.fieldName}
          field={field}
          fieldInfos={fieldInfos}
          value={values[field.fieldName] ?? null}
          onChange={onChange}
        />
      ),
    )}
  </>
);

interface TemplateFieldsFormProps {
  pending: PendingApply;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  setValues: React.Dispatch<React.SetStateAction<FieldValues>>;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  // Hide the title when the surrounding container already shows it.
  showTitle?: boolean;
  cancelLabel?: string;
}

// Form for applying a template with user-input fields: shows the fixed fields and lets the user
// pick values for the user-input fields.
export const TemplateFieldsForm: React.FunctionComponent<TemplateFieldsFormProps> = ({
  pending,
  fieldInfos,
  values,
  setValues,
  submitting,
  onConfirm,
  onBack,
  showTitle = true,
  cancelLabel = "Back",
}) => {
  const onChange = useCallback(
    (fieldName: string, value: string | null) =>
      setValues((prev) => ({ ...prev, [fieldName]: value })),
    [setValues],
  );

  return (
    <>
      {showTitle && <Text size={Text.Size.M}>{formatPendingTitle(pending)}</Text>}
      <div className="template-fields-form">
        <FieldPreviewList
          fields={getTemplateFields(pending.template)}
          fieldInfos={fieldInfos}
          values={values}
          onChange={onChange}
        />
        {hasUserInputFields(pending.template) && (
          <Text size={Text.Size.S} info>
            Fields left empty are not changed.
          </Text>
        )}
      </div>
      <Panel className="template-fields-form-actions">
        <Button primary loader={submitting} disabled={submitting} onClick={onConfirm}>
          {ACTION_LABELS[pending.mode]}
        </Button>
        <Button disabled={submitting} onClick={onBack}>
          {cancelLabel}
        </Button>
      </Panel>
    </>
  );
};

// Indentation per tree depth, in --ring-unit steps.
const UNITS_PER_DEPTH = 3;

interface ChildTemplatePreviewProps {
  child: ChildTemplate;
  depth: number;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  onChange: (childId: string, fieldName: string, value: string | null) => void;
}

const ChildTemplatePreview: React.FunctionComponent<ChildTemplatePreviewProps> = ({
  child,
  depth,
  fieldInfos,
  values,
  onChange,
}) => {
  const onFieldChange = useCallback(
    (fieldName: string, value: string | null) => onChange(child.id, fieldName, value),
    [child.id, onChange],
  );
  const fields = getTemplateFields(child);
  return (
    <div
      className="template-hierarchy-child"
      style={{ marginLeft: `calc(var(--ring-unit) * ${depth * UNITS_PER_DEPTH})` }}
    >
      <div className="template-hierarchy-child-title">
        <Text size={Text.Size.M} bold>
          {child.name}
        </Text>{" "}
        <Text size={Text.Size.S} info>
          {child.articleId}
        </Text>
      </div>
      <div className="template-hierarchy-child-body">
        {child.inheritParentFields && (
          <Text size={Text.Size.S} info>
            Inherits template controlled fields from parent.
          </Text>
        )}
        {fields.length === 0 && !child.inheritParentFields && (
          <Text size={Text.Size.S} info>
            No fields set.
          </Text>
        )}
        <FieldPreviewList
          fields={fields}
          fieldInfos={fieldInfos}
          values={values}
          onChange={onFieldChange}
        />
      </div>
    </div>
  );
};

interface HierarchyFormProps {
  template: Template;
  fieldInfos: Array<ProjectFieldInfo>;
  values: ChildFieldValues;
  setValues: React.Dispatch<React.SetStateAction<ChildFieldValues>>;
  // A hierarchy for this template was created for the ticket before.
  alreadyCreated: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  cancelLabel?: string;
}

// Form for creating the ticket hierarchy of a template: shows the subtasks that will be created
// with their fields and lets the user pick values for user-input fields.
export const HierarchyForm: React.FunctionComponent<HierarchyFormProps> = ({
  template,
  fieldInfos,
  values,
  setValues,
  alreadyCreated,
  submitting,
  onConfirm,
  onBack,
  cancelLabel = "Back",
}) => {
  const flat = flattenChildTemplates(getChildTemplates(template));
  const onChange = useCallback(
    (childId: string, fieldName: string, value: string | null) =>
      setValues((prev) => ({
        ...prev,
        [childId]: { ...(prev[childId] ?? {}), [fieldName]: value },
      })),
    [setValues],
  );

  return (
    <>
      {alreadyCreated && (
        <Banner mode="warning" withIcon>
          A hierarchy for this template was already created for this ticket. Creating it again adds
          another set of subtasks.
        </Banner>
      )}
      <Text size={Text.Size.S} info>
        {flat.length === 1
          ? "The following subtask will be created below the ticket:"
          : `The following ${flat.length} subtasks will be created below the ticket:`}
      </Text>
      <div className="template-fields-form template-hierarchy-list">
        {flat.map(({ child, depth }) => (
          <ChildTemplatePreview
            key={child.id}
            child={child}
            depth={depth}
            fieldInfos={fieldInfos}
            values={values[child.id] ?? {}}
            onChange={onChange}
          />
        ))}
        {hierarchyHasUserInputFields(template) && (
          <Text size={Text.Size.S} info>
            Fields left empty are not set.
          </Text>
        )}
      </div>
      <Panel className="template-fields-form-actions">
        <Button primary loader={submitting} disabled={submitting} onClick={onConfirm}>
          {alreadyCreated ? "Create hierarchy again" : "Create hierarchy"}
        </Button>
        <Button disabled={submitting} onClick={onBack}>
          {cancelLabel}
        </Button>
      </Panel>
    </>
  );
};
