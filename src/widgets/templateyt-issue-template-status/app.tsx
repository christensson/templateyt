import BranchesIcon from "@jetbrains/icons/branches-12px";
import UpdateIcon from "@jetbrains/icons/update-12px";
import WarningIcon from "@jetbrains/icons/warning-12px";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import LoaderInline from "@jetbrains/ring-ui-built/components/loader-inline/loader-inline";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { memo, useCallback, useEffect, useState } from "react";
import { getTemplateFields, getTemplateReplacements, type Template } from "../../../@types/template";
import { HierarchyForm, TemplateFieldsForm } from "../../components/template-fields-form";
import {
  canCreateHierarchy,
  createHierarchy,
  fetchIssueTemplateInfo,
  getInitialChildFieldValues,
  getInitialFieldValues,
  getInitialReplacementTexts,
  pickChosenChildValues,
  pickChosenValues,
  submitTemplateFields,
  type ChildFieldValues,
  type FieldValues,
  type IssueTemplateInfo,
  type ReplacementTexts,
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
  // True when a ticket hierarchy can be created from the template.
  canCreateHierarchy: boolean;
  // True when a ticket hierarchy has been created from the template before.
  hierarchyCreated: boolean;
};

const getAppliedRows = (info: IssueTemplateInfo): Array<AppliedTemplateRow> =>
  info.usedTemplateIds.map((id) => {
    const template = info.templates.find((t) => t.id === id) ?? null;
    return {
      id,
      name: template ? template.name : `Unknown template ${id}`,
      template,
      pending: template !== null && info.pendingTemplateIds.includes(id),
      canCreateHierarchy: template !== null && canCreateHierarchy(info, template),
      hierarchyCreated: info.createdHierarchyTemplateIds.includes(id),
    };
  });

// Which form is expanded in place of the list.
type Expanded = { kind: "fields" | "hierarchy"; template: Template };

interface TemplateRowProps {
  row: AppliedTemplateRow;
  onSetFields: (template: Template) => void;
  onCreateHierarchy: (template: Template) => void;
}

// One applied template. Templates that set fields get a "Set fields" button, marked with a
// warning sign while user input is still missing; hierarchical ones get "Create hierarchy".
const TemplateRow: React.FunctionComponent<TemplateRowProps> = ({
  row,
  onSetFields,
  onCreateHierarchy,
}) => {
  const { template, pending, hierarchyCreated } = row;
  const hasFields =
    template !== null &&
    (getTemplateFields(template).length > 0 || getTemplateReplacements(template).length > 0);
  return (
    <div className="template-status-row">
      <Text size={Text.Size.S}>{row.name}</Text>
      <div className="template-status-row-actions">
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
        {template !== null && row.canCreateHierarchy && (
          <Button
            icon={BranchesIcon}
            title={
              hierarchyCreated
                ? "A hierarchy was already created. Click to create another set of subtasks."
                : "Create subtasks from the child templates."
            }
            onClick={() => onCreateHierarchy(template)}
            inline
          >
            {hierarchyCreated ? "Hierarchy created" : "Create hierarchy"}
          </Button>
        )}
      </div>
    </div>
  );
};

const AppComponent: React.FunctionComponent = () => {
  const [info, setInfo] = useState<IssueTemplateInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Expanded | null>(null);
  const [formValues, setFormValues] = useState<FieldValues>({});
  const [childValues, setChildValues] = useState<ChildFieldValues>({});
  const [replacementTexts, setReplacementTexts] = useState<ReplacementTexts>({});
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

  const collapse = useCallback(() => {
    setExpanded(null);
    setFailMessage("");
  }, []);

  const expandFields = useCallback(
    (template: Template) => {
      if (info === null) {
        return;
      }
      setFormValues(getInitialFieldValues(template, info.currentFieldValues));
      setReplacementTexts(getInitialReplacementTexts(template));
      setFailMessage("");
      setExpanded({ kind: "fields", template });
    },
    [info],
  );

  const expandHierarchy = useCallback(
    (template: Template) => {
      if (info === null) {
        return;
      }
      setChildValues(getInitialChildFieldValues(template, info.currentFieldValues));
      setReplacementTexts(getInitialReplacementTexts(template));
      setFailMessage("");
      setExpanded({ kind: "hierarchy", template });
    },
    [info],
  );

  // Runs a backend action; on success reloads and collapses the form.
  const runAction = useCallback(
    async (action: () => Promise<{ success: boolean; message?: string }>, failText: string) => {
      setSubmitting(true);
      try {
        const result = await action();
        console.log("Applied templates action result", result);
        if (!result.success) {
          setFailMessage(result.message || failText);
          return;
        }
        await load();
        collapse();
      } finally {
        setSubmitting(false);
      }
    },
    [load, collapse],
  );

  const confirmFields = useCallback(() => {
    if (expanded === null) {
      return;
    }
    runAction(
      () =>
        submitTemplateFields(
          host,
          "fields",
          expanded.template.id,
          pickChosenValues(formValues),
          replacementTexts,
        ),
      "Failed to set fields.",
    );
  }, [expanded, formValues, replacementTexts, runAction]);

  const confirmHierarchy = useCallback(() => {
    if (expanded === null) {
      return;
    }
    runAction(
      () =>
        createHierarchy(
          host,
          expanded.template.id,
          pickChosenChildValues(childValues),
          replacementTexts,
        ),
      "Failed to create hierarchy.",
    );
  }, [expanded, childValues, replacementTexts, runAction]);

  const failBanner = failMessage && (
    <Banner mode="error" withIcon>
      {failMessage}
    </Banner>
  );

  if (expanded !== null && info !== null && expanded.kind === "fields") {
    return (
      <div className="widget">
        <Text size={Text.Size.S} info>
          Set fields from template {expanded.template.name}
        </Text>
        <TemplateFieldsForm
          pending={{ mode: "fields", template: expanded.template }}
          fieldInfos={info.fields}
          values={formValues}
          setValues={setFormValues}
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          currentFieldPresentations={info.currentFieldPresentations}
          submitting={submitting}
          onConfirm={confirmFields}
          onBack={collapse}
          showTitle={false}
          cancelLabel="Cancel"
        />
        {failBanner}
      </div>
    );
  }

  if (expanded !== null && info !== null) {
    return (
      <div className="widget">
        <Text size={Text.Size.S} info>
          Create hierarchy from template {expanded.template.name}
        </Text>
        <HierarchyForm
          template={expanded.template}
          fieldInfos={info.fields}
          currentFieldValues={info.currentFieldValues}
          currentFieldPresentations={info.currentFieldPresentations}
          values={childValues}
          setValues={setChildValues}
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          alreadyCreated={info.createdHierarchyTemplateIds.includes(expanded.template.id)}
          submitting={submitting}
          onConfirm={confirmHierarchy}
          onBack={collapse}
          cancelLabel="Cancel"
        />
        {failBanner}
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
        <TemplateRow
          key={row.id}
          row={row}
          onSetFields={expandFields}
          onCreateHierarchy={expandHierarchy}
        />
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
