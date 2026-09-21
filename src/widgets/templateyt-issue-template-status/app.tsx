import UpdateIcon from "@jetbrains/icons/update-12px";
import WarningIcon from "@jetbrains/icons/warning-12px";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import LoaderInline from "@jetbrains/ring-ui-built/components/loader-inline/loader-inline";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { memo, useCallback, useEffect, useState } from "react";
import { getTemplateFields, type Template } from "../../../@types/template";
import { TemplateFieldsForm } from "../../components/template-fields-form";
import {
  fetchIssueTemplateInfo,
  getInitialFieldValues,
  pickChosenValues,
  submitTemplateFields,
  type FieldValues,
  type IssueTemplateInfo,
} from "../../template-client";

// The host never notifies an issue widget that the ticket changed (onRefresh is only invoked
// for dashboard widgets), so the panel offers an explicit refresh button instead.
// The widget is hidden for drafts by the manifest guard: the new ticket form is edited
// client-side and would neither show nor keep field changes made from here.
// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

type AppliedTemplateRow = {
  id: string;
  name: string;
  // Null when the template no longer exists in the project configuration.
  template: Template | null;
  // True when the template still waits for user input for some of its fields.
  pending: boolean;
};

const getAppliedRows = (info: IssueTemplateInfo): Array<AppliedTemplateRow> =>
  info.usedTemplateIds.map((id) => {
    const template = info.templates.find((t) => t.id === id) ?? null;
    return {
      id,
      name: template ? template.name : `Unknown template ${id}`,
      template,
      pending: template !== null && info.pendingTemplateIds.includes(id),
    };
  });

interface TemplateRowProps {
  row: AppliedTemplateRow;
  onSetFields: (template: Template) => void;
}

// One applied template. Templates that set fields get a "Set fields" button, marked with a
// warning sign while user input is still missing.
const TemplateRow: React.FunctionComponent<TemplateRowProps> = ({ row, onSetFields }) => {
  const { template, pending } = row;
  const hasFields = template !== null && getTemplateFields(template).length > 0;
  return (
    <div className="template-status-row">
      <Text size={Text.Size.S}>{row.name}</Text>
      {template !== null && hasFields && (
        <Button
          className={pending ? "template-status-pending" : undefined}
          icon={pending ? WarningIcon : undefined}
          title={
            pending
              ? "User input required. Click to set fields."
              : "Set or re-set the ticket fields defined by the template."
          }
          onClick={() => onSetFields(template)}
          inline
        >
          Set fields
        </Button>
      )}
    </div>
  );
};

const AppComponent: React.FunctionComponent = () => {
  const [info, setInfo] = useState<IssueTemplateInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);
  // Template whose "Set fields" form is expanded in place of the list.
  const [expandedTemplate, setExpandedTemplate] = useState<Template | null>(null);
  const [formValues, setFormValues] = useState<FieldValues>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [failMessage, setFailMessage] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchIssueTemplateInfo(host);
      console.log("Applied templates", result);
      setInfo(result);
      setLoadFailed(false);
    } catch (error) {
      console.error("Failed to load applied templates", error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const collapseForm = useCallback(() => {
    setExpandedTemplate(null);
    setFailMessage("");
  }, []);

  const expandForm = useCallback(
    (template: Template) => {
      if (info === null) {
        return;
      }
      setFormValues(getInitialFieldValues(template, info.currentFieldValues));
      setFailMessage("");
      setExpandedTemplate(template);
    },
    [info],
  );

  const confirmForm = useCallback(async () => {
    if (expandedTemplate === null) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitTemplateFields(
        host,
        "fields",
        expandedTemplate.id,
        pickChosenValues(formValues),
      );
      console.log(`Set fields ${expandedTemplate.id} result`, result);
      if (!result.success) {
        setFailMessage(result.message || "Failed to set fields.");
        return;
      }
      await load();
      collapseForm();
    } finally {
      setSubmitting(false);
    }
  }, [expandedTemplate, formValues, load, collapseForm]);

  if (expandedTemplate !== null && info !== null) {
    return (
      <div className="widget">
        <Text size={Text.Size.S} info>
          Set fields from template {expandedTemplate.name}
        </Text>
        <TemplateFieldsForm
          pending={{ mode: "fields", template: expandedTemplate }}
          fieldInfos={info.fields}
          values={formValues}
          setValues={setFormValues}
          submitting={submitting}
          onConfirm={confirmForm}
          onBack={collapseForm}
          showTitle={false}
          cancelLabel="Cancel"
        />
        {failMessage && (
          <Banner mode="error" withIcon>
            {failMessage}
          </Banner>
        )}
      </div>
    );
  }

  const rows = info !== null ? getAppliedRows(info) : [];

  return (
    <div className="widget">
      {info === null && !loadFailed && <LoaderInline/>}
      {loadFailed && (
        <Text size={Text.Size.S} info>
          Failed to load applied templates.
        </Text>
      )}
      {info !== null && rows.length === 0 && (
        <Text size={Text.Size.S} info>
          No templates applied
        </Text>
      )}
      {rows.map((row) => (
        <TemplateRow key={row.id} row={row} onSetFields={expandForm}/>
      ))}
      {info !== null && (
        <div className="template-status-toolbar">
          <Button
            icon={UpdateIcon}
            title="Refresh applied templates"
            loader={loading}
            disabled={loading}
            onClick={() => load()}
            inline
          />
        </div>
      )}
    </div>
  );
};

export const App = memo(AppComponent);
