import MoreOptionsIcon from "@jetbrains/icons/more-options";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import DropdownMenu from "@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu";
import type { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  getTemplateFields,
  getTemplateTags,
  getTemplateRelations,
  getTemplateReplacements,
  hasUserInput,
  type Template,
} from "../../../@types/template";
import { HierarchyForm, TemplateFieldsForm } from "../../components/template-fields-form";
import TemplateList from "../../components/template-list";
import {
  ACTION_LABELS,
  canCreateHierarchy,
  createHierarchy,
  fetchIssueTemplateInfo,
  getInitialChildFieldValues,
  getInitialFieldValues,
  getInitialReplacementTexts,
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

// Secondary actions for a template, shown in a "..." menu to keep the button row compact.
const getMoreActions = (template: Template): Array<ListDataItem> => [
  {
    rgItemType: 1,
    label: `Open article ${template.articleId}`,
    href: `/articles/${template.articleId}`,
    target: "_blank",
  },
];

interface TemplateActionsProps {
  selectedTemplate: Template | null;
  isSelectedUsed: boolean;
  canCreateHierarchyForSelected: boolean;
  submitting: boolean;
  onAdd: () => void;
  onSetFields: () => void;
  onCreateHierarchy: () => void;
  onRemove: () => void;
}

// Bottom panel with the actions for the selected template.
const TemplateActions: React.FunctionComponent<TemplateActionsProps> = ({
  selectedTemplate,
  isSelectedUsed,
  canCreateHierarchyForSelected,
  submitting,
  onAdd,
  onSetFields,
  onCreateHierarchy,
  onRemove,
}) => {
  const hasSelection = selectedTemplate !== null;
  const selectedHasFields =
    hasSelection &&
    (getTemplateFields(selectedTemplate).length > 0 ||
      getTemplateTags(selectedTemplate).length > 0 ||
      getTemplateRelations(selectedTemplate).some((relation) => relation.target === "fixed") ||
      getTemplateReplacements(selectedTemplate).length > 0);
  return (
    <Panel className="issue-template-config-bottom-panel">
      <Button primary disabled={!hasSelection || isSelectedUsed || submitting} onClick={onAdd}>
        Add template
      </Button>
      <Button
        disabled={!selectedHasFields || submitting}
        onClick={onSetFields}
        title="Set or re-set the ticket fields, tags and relations defined by the template"
      >
        Set fields
      </Button>
      <Button
        disabled={!canCreateHierarchyForSelected || submitting}
        onClick={onCreateHierarchy}
        title="Create subtasks from the child templates of the applied template"
      >
        Create hierarchy
      </Button>
      <Button disabled={!isSelectedUsed || submitting} onClick={onRemove}>
        Remove template
      </Button>
      {hasSelection && (
        <DropdownMenu
          anchor={<Button icon={MoreOptionsIcon} title="More actions"/>}
          data={getMoreActions(selectedTemplate)}
        />
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
  const [replacementTexts, setReplacementTexts] = useState<ReplacementTexts>({});
  // Template whose hierarchy creation form is shown in place of the list.
  const [hierarchyTemplate, setHierarchyTemplate] = useState<Template | null>(null);
  const [childValues, setChildValues] = useState<ChildFieldValues>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchTemplateInfo = useCallback(async () => {
    const result = await fetchIssueTemplateInfo(host);
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

  // Applies a template, or only its fields, with the given user-input values and texts.
  const submitTemplate = useCallback(
    async (
      mode: ApplyMode,
      template: Template,
      fieldValues: FieldValues,
      texts: ReplacementTexts,
    ): Promise<boolean> => {
      if (!checkTemplate(template, mode === "add" ? "add" : "set fields from")) {
        return false;
      }
      setSubmitting(true);
      try {
        const result = await submitTemplateFields(host, mode, template.id, fieldValues, texts);
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
      if (hasUserInput(selectedTemplate)) {
        setFailMessage("");
        setPendingValues(
          getInitialFieldValues(selectedTemplate, issueTemplateInfo.currentFieldValues),
        );
        setReplacementTexts(getInitialReplacementTexts(selectedTemplate));
        setPending({ mode, template: selectedTemplate });
        return;
      }
      submitTemplate(mode, selectedTemplate, {}, {});
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
    );
    if (ok) {
      setPending(null);
    }
  }, [pending, pendingValues, replacementTexts, submitTemplate]);

  // The hierarchy form is always shown: it presents the subtasks to be created.
  const startCreateHierarchy = useCallback(() => {
    if (selectedTemplate === null || issueTemplateInfo === null) {
      setFailMessage("No template selected.");
      return;
    }
    setFailMessage("");
    setChildValues(
      getInitialChildFieldValues(selectedTemplate, issueTemplateInfo.currentFieldValues),
    );
    setReplacementTexts(getInitialReplacementTexts(selectedTemplate));
    setHierarchyTemplate(selectedTemplate);
  }, [selectedTemplate, issueTemplateInfo]);

  const confirmCreateHierarchy = useCallback(async () => {
    if (hierarchyTemplate === null || !checkTemplate(hierarchyTemplate, "create hierarchy from")) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await createHierarchy(
        host,
        hierarchyTemplate.id,
        pickChosenChildValues(childValues),
        replacementTexts,
      );
      console.log(`Create hierarchy ${hierarchyTemplate.id} result`, result);
      if (!result.success) {
        setFailMessage(result.message || "Failed to create hierarchy.");
        return;
      }
      setFailMessage("");
      await fetchTemplateInfo();
      setHierarchyTemplate(null);
    } finally {
      setSubmitting(false);
    }
  }, [hierarchyTemplate, childValues, replacementTexts, checkTemplate, fetchTemplateInfo]);

  const removeTemplateFromIssue = useCallback(
    async (template: Template | null) => {
      if (template === null || !checkTemplate(template, "remove")) {
        return;
      }
      const result = await removeTemplate(host, template.id);
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
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          currentFieldPresentations={issueTemplateInfo.currentFieldPresentations}
          submitting={submitting}
          onConfirm={confirmPending}
          onBack={() => setPending(null)}
        />
        {failBanner}
      </div>
    );
  }

  if (hierarchyTemplate !== null && issueTemplateInfo !== null) {
    return (
      <div className="widget">
        <HierarchyForm
          template={hierarchyTemplate}
          fieldInfos={issueTemplateInfo.fields}
          currentFieldValues={issueTemplateInfo.currentFieldValues}
          currentFieldPresentations={issueTemplateInfo.currentFieldPresentations}
          values={childValues}
          setValues={setChildValues}
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          alreadyCreated={issueTemplateInfo.createdHierarchyTemplateIds.includes(
            hierarchyTemplate.id,
          )}
          submitting={submitting}
          onConfirm={confirmCreateHierarchy}
          onBack={() => setHierarchyTemplate(null)}
        />
        {failBanner}
      </div>
    );
  }

  const isSelectedUsed =
    selectedTemplate !== null &&
    issueTemplateInfo !== null &&
    issueTemplateInfo.usedTemplateIds.includes(selectedTemplate.id);
  const canCreateHierarchyForSelected =
    selectedTemplate !== null &&
    issueTemplateInfo !== null &&
    canCreateHierarchy(issueTemplateInfo.usedTemplateIds, selectedTemplate);

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
        canCreateHierarchyForSelected={canCreateHierarchyForSelected}
        submitting={submitting}
        onAdd={() => startAction("add")}
        onSetFields={() => startAction("fields")}
        onCreateHierarchy={startCreateHierarchy}
        onRemove={() => removeTemplateFromIssue(selectedTemplate)}
      />
    </div>
  );
};

export const App = memo(AppComponent);
