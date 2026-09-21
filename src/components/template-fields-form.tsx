import Button from "@jetbrains/ring-ui-built/components/button/button";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import {
  getTemplateFields,
  hasUserInputFields,
  type TemplateField,
} from "../../@types/template";
import {
  ACTION_LABELS,
  formatPendingTitle,
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

interface TemplateFieldsFormProps {
  pending: PendingApply;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  setValues: React.Dispatch<React.SetStateAction<FieldValues>>;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  // Hide the title when the surrounding container (e.g. a dialog header) already shows it.
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
  const templateFields = getTemplateFields(pending.template);
  const onChange = useCallback(
    (fieldName: string, value: string | null) =>
      setValues((prev) => ({ ...prev, [fieldName]: value })),
    [setValues],
  );

  return (
    <>
      {showTitle && <Text size={Text.Size.M}>{formatPendingTitle(pending)}</Text>}
      <div className="template-fields-form">
        {templateFields.map((field) =>
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
