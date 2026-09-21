import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectFieldInfo } from "../../../@types/project-info";
import {
  getTemplateFields,
  hasUserInputFields,
  type Template,
  type TemplateField,
} from "../../../@types/template";
import TemplateList from "../../components/template-list";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

type IssueTemplateInfo = {
  usedTemplateIds: Array<string>;
  templates: Array<Template>;
  validTemplateIds: Array<string>;
  fields: Array<ProjectFieldInfo>;
  currentFieldValues: Record<string, string | null>;
};

// "add" applies the whole template (description and fields), "fields" only sets its fields.
type ApplyMode = "add" | "fields";

type PendingApply = {
  mode: ApplyMode;
  template: Template;
};

type FieldValues = Record<string, string | null>;

const ENDPOINTS: Record<ApplyMode, string> = {
  add: "backend/addTemplate",
  fields: "backend/applyTemplateFields",
};

const ACTION_LABELS: Record<ApplyMode, string> = {
  add: "Apply template",
  fields: "Set fields",
};

// Initial user-input values: the ticket's current values for the template's user-input fields.
const getInitialFieldValues = (template: Template, current: FieldValues): FieldValues => {
  const values: FieldValues = {};
  for (const field of getTemplateFields(template)) {
    if (field.mode === "user_input") {
      values[field.fieldName] = current[field.fieldName] ?? null;
    }
  }
  return values;
};

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
}

// Second step shown when a template has user-input fields: lets the user pick the values.
const TemplateFieldsForm: React.FunctionComponent<TemplateFieldsFormProps> = ({
  pending,
  fieldInfos,
  values,
  setValues,
  submitting,
  onConfirm,
  onBack,
}) => {
  const templateFields = getTemplateFields(pending.template);
  const title =
    pending.mode === "add"
      ? `Apply template ${pending.template.name}`
      : `Set fields from template ${pending.template.name}`;
  const onChange = useCallback(
    (fieldName: string, value: string | null) =>
      setValues((prev) => ({ ...prev, [fieldName]: value })),
    [setValues],
  );

  return (
    <>
      <Text size={Text.Size.M}>{title}</Text>
      <div className="issue-template-fields-form">
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
        <Text size={Text.Size.S} info>
          Fields left empty are not changed.
        </Text>
      </div>
      <Panel className="issue-template-config-bottom-panel">
        <Button primary loader={submitting} disabled={submitting} onClick={onConfirm}>
          {ACTION_LABELS[pending.mode]}
        </Button>
        <Button disabled={submitting} onClick={onBack}>
          Back
        </Button>
      </Panel>
    </>
  );
};

interface TemplateActionsProps {
  selectedTemplate: Template | null;
  isSelectedUsed: boolean;
  submitting: boolean;
  onAdd: () => void;
  onSetFields: () => void;
  onRemove: () => void;
}

// Bottom panel with the actions for the selected template.
const TemplateActions: React.FunctionComponent<TemplateActionsProps> = ({
  selectedTemplate,
  isSelectedUsed,
  submitting,
  onAdd,
  onSetFields,
  onRemove,
}) => {
  const hasSelection = selectedTemplate !== null;
  const selectedHasFields = hasSelection && getTemplateFields(selectedTemplate).length > 0;
  return (
    <Panel className="issue-template-config-bottom-panel">
      <Button primary disabled={!hasSelection || isSelectedUsed || submitting} onClick={onAdd}>
        Add template
      </Button>
      <Button
        disabled={!selectedHasFields || submitting}
        onClick={onSetFields}
        title="Set or re-set the ticket fields defined by the template"
      >
        Set fields
      </Button>
      <Button disabled={!isSelectedUsed || submitting} onClick={onRemove}>
        Remove template
      </Button>
      {hasSelection && (
        <Button secondary href={`/articles/${selectedTemplate.articleId}`}>
          {`Open article ${selectedTemplate.articleId}`}
        </Button>
      )}
    </Panel>
  );
};

// Groups templates for the list: used templates first, then unused but valid ones.
const getTemplateIdGroupMap = (data: IssueTemplateInfo | null): { [key: string]: string } => {
  if (data === null) {
    return {};
  }
  const templateIdGroupMap: { [key: string]: string } = {};
  for (const template of data.templates) {
    if (data.usedTemplateIds.includes(template.id)) {
      templateIdGroupMap[template.id] = "Used templates";
    } else if (data.validTemplateIds.includes(template.id)) {
      templateIdGroupMap[template.id] = "Unused templates";
    }
  }
  return templateIdGroupMap;
};

const AppComponent: React.FunctionComponent = () => {
  const [issueTemplateInfo, setIssueTemplateInfo] = useState<IssueTemplateInfo | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [failMessage, setFailMessage] = useState<string>("");
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [pendingValues, setPendingValues] = useState<FieldValues>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchTemplateInfo = useCallback(async () => {
    const result = await host.fetchApp<IssueTemplateInfo>("backend/templates", {
      scope: true,
      method: "GET",
    });
    console.log("getUsedTemplates result", result);
    setIssueTemplateInfo(result);
  }, []);

  useEffect(() => {
    fetchTemplateInfo();
  }, [fetchTemplateInfo]);

  // Checks that the template can be sent to the backend; sets a fail message otherwise.
  const checkTemplate = useCallback(
    (template: Template | null, verb: string): boolean => {
      if (template === null || template.id === null) {
        setFailMessage(`Failed to ${verb} template, no template selected.`);
        return false;
      }
      if (issueTemplateInfo === null) {
        setFailMessage(`Failed to ${verb} template, no template info loaded.`);
        return false;
      }
      if (!issueTemplateInfo.templates.some((t) => t.id === template.id)) {
        setFailMessage(`Template ${template.id} not found in loaded templates.`);
        return false;
      }
      return true;
    },
    [issueTemplateInfo],
  );

  // Applies a template, or only its fields, with the given user-input values.
  const submitTemplate = useCallback(
    async (mode: ApplyMode, template: Template, fieldValues: FieldValues): Promise<boolean> => {
      if (!checkTemplate(template, mode === "add" ? "add" : "set fields from")) {
        return false;
      }
      setSubmitting(true);
      try {
        const result = await host.fetchApp<{ success: boolean; message?: string }>(
          ENDPOINTS[mode],
          {
            scope: true,
            method: "POST",
            body: { templateId: template.id, fieldValues: fieldValues },
          },
        );
        console.log(`${ACTION_LABELS[mode]} ${template.id} result`, result);
        if (!result.success) {
          setFailMessage(result.message || `Failed to ${ACTION_LABELS[mode].toLowerCase()}.`);
          return false;
        }
        setFailMessage("");
        // Reload used templates and current field values.
        await fetchTemplateInfo();
        return true;
      } finally {
        setSubmitting(false);
      }
    },
    [checkTemplate, fetchTemplateInfo],
  );

  // Starts an action: asks for user-input values first when the template has any.
  const startAction = useCallback(
    (mode: ApplyMode) => {
      if (selectedTemplate === null || issueTemplateInfo === null) {
        setFailMessage("No template selected.");
        return;
      }
      if (hasUserInputFields(selectedTemplate)) {
        setFailMessage("");
        setPendingValues(
          getInitialFieldValues(selectedTemplate, issueTemplateInfo.currentFieldValues),
        );
        setPending({ mode, template: selectedTemplate });
        return;
      }
      submitTemplate(mode, selectedTemplate, {});
    },
    [selectedTemplate, issueTemplateInfo, submitTemplate],
  );

  const confirmPending = useCallback(async () => {
    if (pending === null) {
      return;
    }
    // Only send chosen values; empty inputs leave the ticket field untouched.
    const fieldValues: FieldValues = {};
    for (const [fieldName, value] of Object.entries(pendingValues)) {
      if (value) {
        fieldValues[fieldName] = value;
      }
    }
    const ok = await submitTemplate(pending.mode, pending.template, fieldValues);
    if (ok) {
      setPending(null);
    }
  }, [pending, pendingValues, submitTemplate]);

  const removeTemplateFromIssue = useCallback(
    async (template: Template | null) => {
      if (template === null || !checkTemplate(template, "remove")) {
        return;
      }
      const result = await host.fetchApp<{ success: boolean; message?: string }>(
        "backend/removeTemplate",
        {
          scope: true,
          method: "DELETE",
          body: { templateId: template.id },
        },
      );
      console.log(`Remove template ${template.id} result`, result);
      if (!result.success) {
        setFailMessage(result.message || `Failed to remove template ${template.id}.`);
        return;
      }
      setFailMessage("");
      await fetchTemplateInfo();
    },
    [checkTemplate, fetchTemplateInfo],
  );

  const templateIdGroupMap = useMemo(
    () => getTemplateIdGroupMap(issueTemplateInfo),
    [issueTemplateInfo],
  );

  const failBanner = failMessage && (
    <Banner mode="error" title="Failed to update ticket templates" withIcon>
      {failMessage}
    </Banner>
  );

  if (pending !== null && issueTemplateInfo !== null) {
    return (
      <div className="widget">
        <TemplateFieldsForm
          pending={pending}
          fieldInfos={issueTemplateInfo.fields}
          values={pendingValues}
          setValues={setPendingValues}
          submitting={submitting}
          onConfirm={confirmPending}
          onBack={() => setPending(null)}
        />
        {failBanner}
      </div>
    );
  }

  const isSelectedUsed =
    selectedTemplate !== null &&
    issueTemplateInfo !== null &&
    issueTemplateInfo.usedTemplateIds.includes(selectedTemplate.id);

  return (
    <div className="widget">
      {issueTemplateInfo === null && <Loader message="Loading used templates..."/>}
      {issueTemplateInfo !== null &&
        issueTemplateInfo.usedTemplateIds.length === 0 &&
        issueTemplateInfo.validTemplateIds.length === 0 && (
          <Banner mode="info" withIcon>
            No valid templates found for ticket.
          </Banner>
        )}
      {issueTemplateInfo !== null && (
        <div className="issue-template-row">
          <TemplateList
            templates={issueTemplateInfo.templates}
            selectedTemplate={selectedTemplate}
            setSelectedTemplate={setSelectedTemplate}
            templateIdGroupMap={templateIdGroupMap}
            groupOrder={["Used templates", "Unused templates"]}
            onlyShowGrouped
            className="issue-template-used-templates-list"
          />
        </div>
      )}
      {failBanner}
      <TemplateActions
        selectedTemplate={selectedTemplate}
        isSelectedUsed={isSelectedUsed}
        submitting={submitting}
        onAdd={() => startAction("add")}
        onSetFields={() => startAction("fields")}
        onRemove={() => removeTemplateFromIssue(selectedTemplate)}
      />
    </div>
  );
};

export const App = memo(AppComponent);
