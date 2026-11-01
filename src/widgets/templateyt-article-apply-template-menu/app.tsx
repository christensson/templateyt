import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { hasUserInputReplacements, type Template } from "../../../@types/template";
import {
  closeDialog,
  countChildren,
  formatCreatedMessage,
  formatRowStatus,
  getApplyGroupMap,
  getApplyGroupOrder,
  getApplyStatus,
  getErrorMessage,
  notify,
  type ApplyActionKey,
} from "../../apply-template";
import {
  ApplyActionsPanel,
  ApplyLoadState,
  NoTemplatesMessage,
} from "../../components/apply-template-actions";
import { ArticleHierarchyForm, TemplateFieldsForm } from "../../components/template-fields-form";
import TemplateList, { type TemplateRowStatus } from "../../components/template-list";
import {
  addTemplateToArticle,
  createHierarchy,
  getInitialReplacementTexts,
  removeTemplate,
  type FieldValues,
  type ReplacementTexts,
} from "../../template-client";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

const TARGET = "article";
const GROUP_ORDER = getApplyGroupOrder(TARGET);

type ArticleTemplateInfo = {
  usedTemplateIds: Array<string>;
  templates: Array<Template>;
  validTemplateIds: Array<string>;
  isTemplate: boolean;
  // Applied templates whose hierarchy has been created below the article.
  createdHierarchyTemplateIds: Array<string>;
};

const getRowStatus = (info: ArticleTemplateInfo | null): { [id: string]: TemplateRowStatus } => {
  const result: { [id: string]: TemplateRowStatus } = {};
  for (const template of info?.templates ?? []) {
    const status = formatRowStatus(getApplyStatus(info as ArticleTemplateInfo, template), TARGET);
    if (status !== null) {
      result[template.id] = status;
    }
  }
  return result;
};

// The sub-article form, opened from the list or right after applying a hierarchical template.
type HierarchyStep = { template: Template; afterApply: boolean };

const AppComponent: React.FunctionComponent = () => {
  const [articleTemplateInfo, setArticleTemplateInfo] = useState<ArticleTemplateInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [failMessage, setFailMessage] = useState<string>("");
  // Template waiting for replacement texts before it is applied.
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [hierarchy, setHierarchy] = useState<HierarchyStep | null>(null);
  const [replacementTexts, setReplacementTexts] = useState<ReplacementTexts>({});
  // Articles have no fields to set; the shared form still needs the value state.
  const [noValues, setNoValues] = useState<FieldValues>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchTemplateInfo = useCallback(async () => {
    try {
      const result = await host.fetchApp<ArticleTemplateInfo>("backend/templates", {
        scope: true,
        method: "GET",
      });
      setArticleTemplateInfo(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
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
      if (articleTemplateInfo === null) {
        setFailMessage(`Failed to ${verb} template, no template info loaded.`);
        return false;
      }
      if (!articleTemplateInfo.templates.some((t) => t.id === template.id)) {
        setFailMessage(`Template ${template.id} not found in loaded templates.`);
        return false;
      }
      return true;
    },
    [articleTemplateInfo],
  );

  const applyUsedTemplateIds = useCallback((usedTemplateIds: Array<string>) => {
    setArticleTemplateInfo((prev) => (prev === null ? prev : { ...prev, usedTemplateIds }));
  }, []);

  // Opens the sub-article form, keeping replacement texts that were just entered.
  const openHierarchy = useCallback(
    (template: Template, texts: ReplacementTexts, afterApply: boolean) => {
      setFailMessage("");
      setReplacementTexts({ ...getInitialReplacementTexts(template), ...texts });
      setHierarchy({ template, afterApply });
    },
    [],
  );

  // Applies a template; continues with the sub-articles of a hierarchical template, or closes
  // the dialog.
  const submitAdd = useCallback(
    async (template: Template, texts: ReplacementTexts): Promise<boolean> => {
      if (!checkTemplate(template, "apply")) {
        return false;
      }
      setSubmitting(true);
      try {
        const result = await addTemplateToArticle(host, template.id, texts);
        console.log(`Add template ${template.id} result`, result);
        if (!result.success) {
          setFailMessage(result.message || `Failed to apply template ${template.id}.`);
          return false;
        }
        if (result.usedTemplateIds == null) {
          setFailMessage("Got no template IDs from server after applying.");
          return false;
        }
        setFailMessage("");
        applyUsedTemplateIds(result.usedTemplateIds);
        notify(host, `${template.name} applied.`);
        if (countChildren(template) > 0) {
          openHierarchy(template, texts, true);
        } else {
          closeDialog(host);
        }
        return true;
      } catch (error) {
        setFailMessage(getErrorMessage(error));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [checkTemplate, applyUsedTemplateIds, openHierarchy],
  );

  // Applies the selected template, asking for replacement texts first when it needs any.
  const startAdd = useCallback(() => {
    if (selectedTemplate === null) {
      setFailMessage("No template selected.");
      return;
    }
    if (hasUserInputReplacements(selectedTemplate)) {
      setFailMessage("");
      setReplacementTexts(getInitialReplacementTexts(selectedTemplate));
      setPendingTemplate(selectedTemplate);
      return;
    }
    submitAdd(selectedTemplate, {});
  }, [selectedTemplate, submitAdd]);

  const confirmPending = useCallback(async () => {
    if (pendingTemplate === null) {
      return;
    }
    const ok = await submitAdd(pendingTemplate, replacementTexts);
    if (ok) {
      setPendingTemplate(null);
    }
  }, [pendingTemplate, replacementTexts, submitAdd]);

  const confirmCreateHierarchy = useCallback(async () => {
    if (hierarchy === null || !checkTemplate(hierarchy.template, "create sub-articles from")) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await createHierarchy(host, hierarchy.template.id, {}, replacementTexts);
      console.log(`Create hierarchy ${hierarchy.template.id} result`, result);
      if (!result.success) {
        setFailMessage(result.message || "Failed to create sub-articles.");
        return;
      }
      setFailMessage("");
      const createdHierarchyTemplateIds = result.createdHierarchyTemplateIds;
      if (createdHierarchyTemplateIds != null) {
        setArticleTemplateInfo((prev) =>
          prev === null ? prev : { ...prev, createdHierarchyTemplateIds },
        );
      }
      notify(host, formatCreatedMessage(result.createdArticleIds, TARGET));
      setHierarchy(null);
      closeDialog(host);
    } catch (error) {
      setFailMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [hierarchy, replacementTexts, checkTemplate]);

  const removeTemplateFromArticle = useCallback(
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
        if (result.usedTemplateIds == null) {
          setFailMessage("Got no template IDs from server after removal.");
          return;
        }
        setFailMessage("");
        applyUsedTemplateIds(result.usedTemplateIds);
        notify(host, `${template.name} removed.`);
      } catch (error) {
        setFailMessage(getErrorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [checkTemplate, applyUsedTemplateIds],
  );

  const onAction = useCallback(
    (key: ApplyActionKey) => {
      if (key === "apply") {
        startAdd();
      } else if (key === "hierarchy") {
        if (selectedTemplate !== null) {
          openHierarchy(selectedTemplate, {}, false);
        }
      } else if (key === "remove") {
        removeTemplateFromArticle(selectedTemplate);
      }
    },
    [startAdd, selectedTemplate, openHierarchy, removeTemplateFromArticle],
  );

  const templateIdGroupMap = useMemo(
    () => getApplyGroupMap(articleTemplateInfo, TARGET),
    [articleTemplateInfo],
  );
  const rowStatus = useMemo(() => getRowStatus(articleTemplateInfo), [articleTemplateInfo]);

  const failBanner = failMessage && (
    <Banner mode="error" title="Something went wrong" withIcon>
      {failMessage}
    </Banner>
  );

  if (pendingTemplate !== null) {
    return (
      <div className="widget">
        <TemplateFieldsForm
          pending={{ mode: "add", template: pendingTemplate }}
          fieldInfos={[]}
          values={noValues}
          setValues={setNoValues}
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          submitting={submitting}
          onConfirm={confirmPending}
          onBack={() => setPendingTemplate(null)}
          forArticle
        />
        {failBanner}
      </div>
    );
  }

  if (hierarchy !== null && articleTemplateInfo !== null) {
    return (
      <div className="widget">
        <ArticleHierarchyForm
          template={hierarchy.template}
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          alreadyCreated={articleTemplateInfo.createdHierarchyTemplateIds.includes(
            hierarchy.template.id,
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

  if (articleTemplateInfo === null) {
    return (
      <div className="widget">
        <ApplyLoadState error={loadError} onRetry={fetchTemplateInfo}/>
      </div>
    );
  }

  if (articleTemplateInfo.isTemplate) {
    return (
      <div className="widget">
        <Banner mode="info" withIcon>
          This article is configured as a template, so templates cannot be applied to it.
        </Banner>
      </div>
    );
  }

  const listed = Object.keys(templateIdGroupMap).length > 0;
  // The selection is kept by id, so that it follows updates of the template info.
  const selected =
    articleTemplateInfo.templates.find((template) => template.id === selectedTemplate?.id) ?? null;

  return (
    <div className="widget">
      {!listed && <NoTemplatesMessage target={TARGET}/>}
      {listed && (
        <div className="apply-template-list-row">
          <TemplateList
            templates={articleTemplateInfo.templates}
            selectedTemplate={selected}
            setSelectedTemplate={setSelectedTemplate}
            templateIdGroupMap={templateIdGroupMap}
            groupOrder={GROUP_ORDER}
            onlyShowGrouped
            detailsMode="effect"
            target={TARGET}
            rowStatus={rowStatus}
            className="apply-template-list"
          />
        </div>
      )}
      {failBanner}
      {listed && (
        <ApplyActionsPanel
          template={selected}
          status={selected === null ? null : getApplyStatus(articleTemplateInfo, selected)}
          target={TARGET}
          submitting={submitting}
          onAction={onAction}
        />
      )}
    </div>
  );
};

export const App = memo(AppComponent);
