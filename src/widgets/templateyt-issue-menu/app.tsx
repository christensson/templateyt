import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  getInitialOptionValues,
  hasUserInput,
  type OptionValues,
  type Template,
} from "../../../@types/template";
import {
  closeDialog,
  countChildren,
  formatCreatedMessage,
  formatRowStatus,
  getApplyGroupMap,
  getChangedConditionValues,
  getApplyGroupOrder,
  getApplyStatus,
  getErrorMessage,
  getReplacementPreconditions,
  needsReplacementFieldInput,
  notify,
  type ApplyActionKey,
  type MultiFieldValues,
  type ReplacementPreconditions,
} from "../../apply-template";
import {
  ApplyActionsPanel,
  ApplyLoadState,
  NoTemplatesMessage,
} from "../../components/apply-template-actions";
import { HierarchyForm, TemplateFieldsForm } from "../../components/template-fields-form";
import TemplateList, { type TemplateRowStatus } from "../../components/template-list";
import {
  ACTION_LABELS,
  createHierarchy,
  fetchIssueTemplateInfo,
  getCurrentConditionValues,
  getInitialChildFieldValues,
  getInitialFieldValues,
  getInitialReplacementTexts,
  hasStoredReplacementTexts,
  pickAnsweredOptions,
  pickChosenChildValues,
  pickChosenValues,
  removeTemplate,
  submitTemplateFields,
  type ApplyMode,
  type ChildFieldValues,
  type FieldValues,
  type IssueTemplateInfo,
  type PendingApply,
  type ReplacementTexts,
} from "../../template-client";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

const TARGET = "ticket";
const GROUP_ORDER = getApplyGroupOrder(TARGET);

// Preconditions of a template's field replacements on this ticket. templateSetsFields: the action
// also sets the template's own fields (apply, set fields), not when creating subtasks.
const getPreconditions = (
  template: Template,
  info: IssueTemplateInfo,
  templateSetsFields: boolean,
): ReplacementPreconditions =>
  getReplacementPreconditions(
    template,
    TARGET,
    info.fields,
    info.currentFieldPresentations,
    templateSetsFields,
  );

const getRowStatus = (info: IssueTemplateInfo | null): { [id: string]: TemplateRowStatus } => {
  const result: { [id: string]: TemplateRowStatus } = {};
  for (const template of info?.templates ?? []) {
    const blocked =
      info !== null && getPreconditions(template, info, true).blockedReason !== null;
    const status = formatRowStatus(
      getApplyStatus(info as IssueTemplateInfo, template),
      TARGET,
      blocked,
    );
    if (status !== null) {
      result[template.id] = status;
    }
  }
  return result;
};

// The subtask form, opened from the list or right after applying a hierarchical template.
type HierarchyStep = { template: Template; afterApply: boolean };

const AppComponent: React.FunctionComponent = () => {
  const [issueTemplateInfo, setIssueTemplateInfo] = useState<IssueTemplateInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [failMessage, setFailMessage] = useState<string>("");
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [pendingValues, setPendingValues] = useState<FieldValues>({});
  const [replacementTexts, setReplacementTexts] = useState<ReplacementTexts>({});
  // Values chosen for empty ticket fields that field replacements use.
  const [replacementFieldValues, setReplacementFieldValues] = useState<FieldValues>({});
  // Values chosen for multi-value root ticket fields that decide which subtasks are created.
  const [conditionMultiValues, setConditionMultiValues] = useState<MultiFieldValues>({});
  // Answers to the options of the template whose subtasks are being created.
  const [optionValues, setOptionValues] = useState<OptionValues>({});
  const [hierarchy, setHierarchy] = useState<HierarchyStep | null>(null);
  const [childValues, setChildValues] = useState<ChildFieldValues>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Loads the templates and the ticket's state; returns null if loading failed.
  const fetchTemplateInfo = useCallback(async (): Promise<IssueTemplateInfo | null> => {
    try {
      const result = await fetchIssueTemplateInfo(host);
      setIssueTemplateInfo(result);
      setLoadError(null);
      return result;
    } catch (error) {
      setLoadError(getErrorMessage(error));
      return null;
    }
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

  // Opens the subtask form, keeping replacement texts that were just entered.
  const openHierarchy = useCallback(
    (template: Template, info: IssueTemplateInfo, texts: ReplacementTexts, afterApply: boolean) => {
      setFailMessage("");
      setChildValues(getInitialChildFieldValues(template, info.currentFieldValues));
      // Texts stored when the template was applied, unless texts were just entered.
      setReplacementTexts({
        ...getInitialReplacementTexts(template, info.replacementTexts),
        ...texts,
      });
      setReplacementFieldValues({});
      setConditionMultiValues({});
      // Options start from their defaults every time; answers are not remembered.
      setOptionValues(getInitialOptionValues(template));
      setHierarchy({ template, afterApply });
    },
    [],
  );

  // Applies a template, or only its fields, with the given user-input values and texts. On
  // success, continues with the subtasks of a hierarchical template, or closes the dialog.
  const submitTemplate = useCallback(
    async (
      mode: ApplyMode,
      template: Template,
      fieldValues: FieldValues,
      texts: ReplacementTexts,
      replacementValues: FieldValues,
    ): Promise<boolean> => {
      if (!checkTemplate(template, mode === "add" ? "apply" : "set fields from")) {
        return false;
      }
      setSubmitting(true);
      try {
        const result = await submitTemplateFields(
          host,
          mode,
          template.id,
          fieldValues,
          texts,
          replacementValues,
        );
        console.log(`${ACTION_LABELS[mode]} ${template.id} result`, result);
        if (!result.success) {
          setFailMessage(result.message || `Failed to ${ACTION_LABELS[mode].toLowerCase()}.`);
          return false;
        }
        setFailMessage("");
        const info = await fetchTemplateInfo();
        if (mode === "add" && info !== null && countChildren(template) > 0) {
          notify(host, `${template.name} applied.`);
          openHierarchy(template, info, texts, true);
          return true;
        }
        notify(host, mode === "add" ? `${template.name} applied.` : `Fields set from ${template.name}.`);
        closeDialog(host);
        return true;
      } catch (error) {
        setFailMessage(getErrorMessage(error));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [checkTemplate, fetchTemplateInfo, openHierarchy],
  );

  // Starts an action: asks for user-input values first when the template has any.
  const startAction = useCallback(
    (mode: ApplyMode) => {
      if (selectedTemplate === null || issueTemplateInfo === null) {
        setFailMessage("No template selected.");
        return;
      }
      const askFields = needsReplacementFieldInput(
        getPreconditions(selectedTemplate, issueTemplateInfo, true),
      );
      if (hasUserInput(selectedTemplate) || askFields) {
        setFailMessage("");
        setReplacementFieldValues({});
        setPendingValues(
          getInitialFieldValues(selectedTemplate, issueTemplateInfo.currentFieldValues),
        );
        setReplacementTexts(
          getInitialReplacementTexts(selectedTemplate, issueTemplateInfo.replacementTexts),
        );
        setPending({ mode, template: selectedTemplate });
        return;
      }
      submitTemplate(mode, selectedTemplate, {}, {}, {});
    },
    [selectedTemplate, issueTemplateInfo, submitTemplate],
  );

  const confirmPending = useCallback(async () => {
    if (pending === null) {
      return;
    }
    const ok = await submitTemplate(
      pending.mode,
      pending.template,
      pickChosenValues(pendingValues),
      replacementTexts,
      pickChosenValues(replacementFieldValues),
    );
    if (ok) {
      setPending(null);
    }
  }, [pending, pendingValues, replacementTexts, replacementFieldValues, submitTemplate]);

  const confirmCreateHierarchy = useCallback(async () => {
    if (hierarchy === null || !checkTemplate(hierarchy.template, "create subtasks from")) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await createHierarchy(
        host,
        hierarchy.template.id,
        pickChosenChildValues(childValues),
        replacementTexts,
        pickChosenValues(replacementFieldValues),
        // Only condition fields the user changed are set on the ticket.
        issueTemplateInfo === null
          ? {}
          : getChangedConditionValues(
            hierarchy.template,
            replacementFieldValues,
            getCurrentConditionValues(issueTemplateInfo),
            conditionMultiValues,
            issueTemplateInfo.fields,
          ),
        pickAnsweredOptions(optionValues),
      );
      console.log(`Create hierarchy ${hierarchy.template.id} result`, result);
      if (!result.success) {
        setFailMessage(result.message || "Failed to create subtasks.");
        return;
      }
      setFailMessage("");
      notify(host, formatCreatedMessage(result.createdIssueIds, TARGET));
      setHierarchy(null);
      closeDialog(host);
    } catch (error) {
      setFailMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [
    hierarchy,
    childValues,
    replacementTexts,
    replacementFieldValues,
    conditionMultiValues,
    optionValues,
    issueTemplateInfo,
    checkTemplate,
  ]);

  const removeTemplateFromIssue = useCallback(
    async (template: Template | null) => {
      if (template === null || !checkTemplate(template, "remove")) {
        return;
      }
      setSubmitting(true);
      try {
        const result = await removeTemplate(host, template.id);
        console.log(`Remove template ${template.id} result`, result);
        if (!result.success) {
          setFailMessage(result.message || `Failed to remove template ${template.id}.`);
          return;
        }
        setFailMessage("");
        notify(host, `${template.name} removed.`);
        await fetchTemplateInfo();
      } catch (error) {
        setFailMessage(getErrorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [checkTemplate, fetchTemplateInfo],
  );

  const onAction = useCallback(
    (key: ApplyActionKey) => {
      if (key === "apply") {
        startAction("add");
      } else if (key === "fields") {
        startAction("fields");
      } else if (key === "hierarchy") {
        if (selectedTemplate !== null && issueTemplateInfo !== null) {
          openHierarchy(selectedTemplate, issueTemplateInfo, {}, false);
        }
      } else {
        removeTemplateFromIssue(selectedTemplate);
      }
    },
    [startAction, selectedTemplate, issueTemplateInfo, openHierarchy, removeTemplateFromIssue],
  );

  const templateIdGroupMap = useMemo(
    () => getApplyGroupMap(issueTemplateInfo, TARGET),
    [issueTemplateInfo],
  );
  const rowStatus = useMemo(() => getRowStatus(issueTemplateInfo), [issueTemplateInfo]);

  const failBanner = failMessage && (
    <Banner mode="error" title="Something went wrong" withIcon>
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
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          currentFieldPresentations={issueTemplateInfo.currentFieldPresentations}
          fieldInput={{ values: replacementFieldValues, setValues: setReplacementFieldValues }}
          textsRemembered={hasStoredReplacementTexts(
            pending.template,
            issueTemplateInfo.replacementTexts,
          )}
          submitting={submitting}
          onConfirm={confirmPending}
          onBack={() => setPending(null)}
        />
        {failBanner}
      </div>
    );
  }

  if (hierarchy !== null && issueTemplateInfo !== null) {
    return (
      <div className="widget">
        <HierarchyForm
          template={hierarchy.template}
          fieldInfos={issueTemplateInfo.fields}
          currentFieldValues={issueTemplateInfo.currentFieldValues}
          currentConditionValues={getCurrentConditionValues(issueTemplateInfo)}
          currentFieldPresentations={issueTemplateInfo.currentFieldPresentations}
          values={childValues}
          setValues={setChildValues}
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          alreadyCreated={issueTemplateInfo.createdHierarchyTemplateIds.includes(
            hierarchy.template.id,
          )}
          fieldInput={{ values: replacementFieldValues, setValues: setReplacementFieldValues }}
          multiConditionInput={{ values: conditionMultiValues, setValues: setConditionMultiValues }}
          optionInput={{ values: optionValues, setValues: setOptionValues }}
          textsRemembered={hasStoredReplacementTexts(
            hierarchy.template,
            issueTemplateInfo.replacementTexts,
          )}
          submitting={submitting}
          onConfirm={confirmCreateHierarchy}
          onBack={() => setHierarchy(null)}
          backLabel={hierarchy.afterApply ? "Not now" : "Back"}
        />
        {failBanner}
      </div>
    );
  }

  if (issueTemplateInfo === null) {
    return (
      <div className="widget">
        <ApplyLoadState error={loadError} onRetry={fetchTemplateInfo}/>
      </div>
    );
  }

  const listed = Object.keys(templateIdGroupMap).length > 0;
  // The selection is kept by id, so that it follows reloads of the template info.
  const selected =
    issueTemplateInfo.templates.find((template) => template.id === selectedTemplate?.id) ?? null;

  return (
    <div className="widget">
      {!listed && <NoTemplatesMessage target={TARGET}/>}
      {listed && (
        <div className="apply-template-list-row">
          <TemplateList
            templates={issueTemplateInfo.templates}
            selectedTemplate={selected}
            setSelectedTemplate={setSelectedTemplate}
            templateIdGroupMap={templateIdGroupMap}
            groupOrder={GROUP_ORDER}
            onlyShowGrouped
            detailsMode="effect"
            target={TARGET}
            rowStatus={rowStatus}
            fieldInfos={issueTemplateInfo.fields}
            className="apply-template-list"
          />
        </div>
      )}
      {failBanner}
      {listed && (
        <ApplyActionsPanel
          template={selected}
          status={selected === null ? null : getApplyStatus(issueTemplateInfo, selected)}
          blockedReason={
            selected === null
              ? null
              : getPreconditions(selected, issueTemplateInfo, true).blockedReason
          }
          target={TARGET}
          submitting={submitting}
          onAction={onAction}
        />
      )}
    </div>
  );
};

export const App = memo(AppComponent);
