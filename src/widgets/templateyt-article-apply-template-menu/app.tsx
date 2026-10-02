import MoreOptionsIcon from "@jetbrains/icons/more-options";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import DropdownMenu from "@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu";
import type { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { hasUserInputReplacements, type Template } from "../../../@types/template";
import { ArticleHierarchyForm, TemplateFieldsForm } from "../../components/template-fields-form";
import TemplateList from "../../components/template-list";
import {
  addTemplateToArticle,
  canCreateHierarchy,
  createHierarchy,
  getInitialReplacementTexts,
  type FieldValues,
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

type ArticleTemplateInfo = {
  usedTemplateIds: Array<string>;
  templates: Array<Template>;
  validTemplateIds: Array<string>;
  isTemplate: boolean;
  // Applied templates whose hierarchy has been created below the article.
  createdHierarchyTemplateIds: Array<string>;
};

const hasNoTemplates = (info: ArticleTemplateInfo): boolean =>
  info.usedTemplateIds.length === 0 && info.validTemplateIds.length === 0;

interface TemplateActionsProps {
  selectedTemplate: Template | null;
  isSelectedUsed: boolean;
  canCreateHierarchyForSelected: boolean;
  submitting: boolean;
  onAdd: () => void;
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
  onCreateHierarchy,
  onRemove,
}) => (
  <Panel className="article-template-config-bottom-panel">
    <Button
      primary
      disabled={selectedTemplate === null || isSelectedUsed || submitting}
      onClick={onAdd}
    >
      Add template
    </Button>
    <Button
      disabled={!canCreateHierarchyForSelected || submitting}
      onClick={onCreateHierarchy}
      title="Create sub-articles from the child templates of the applied template"
    >
      Create hierarchy
    </Button>
    <Button primary disabled={!isSelectedUsed || submitting} onClick={onRemove}>
      Remove template
    </Button>
    {selectedTemplate !== null && (
      <DropdownMenu
        anchor={<Button icon={MoreOptionsIcon} title="More actions"/>}
        data={getMoreActions(selectedTemplate)}
      />
    )}
  </Panel>
);

// Groups templates for the list: used templates first, then unused but valid ones.
const getTemplateIdGroupMap = (data: ArticleTemplateInfo | null): { [key: string]: string } => {
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

// What the actions can do with the selected template.
const getSelectionState = (info: ArticleTemplateInfo | null, selected: Template | null) => {
  if (info === null || selected === null) {
    return { isSelectedUsed: false, canCreateHierarchyForSelected: false };
  }
  return {
    isSelectedUsed: info.usedTemplateIds.includes(selected.id),
    canCreateHierarchyForSelected: canCreateHierarchy(info.usedTemplateIds, selected),
  };
};

const AppComponent: React.FunctionComponent = () => {
  const [articleTemplateInfo, setArticleTemplateInfo] = useState<ArticleTemplateInfo | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [failMessage, setFailMessage] = useState<string>("");
  // Template waiting for replacement texts before it is added.
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  // Template whose hierarchy creation form is shown in place of the list.
  const [hierarchyTemplate, setHierarchyTemplate] = useState<Template | null>(null);
  const [replacementTexts, setReplacementTexts] = useState<ReplacementTexts>({});
  // Articles have no fields to set; the shared form still needs the value state.
  const [noValues, setNoValues] = useState<FieldValues>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    host
      .fetchApp<ArticleTemplateInfo>("backend/templates", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        console.log("getUsedTemplates result", result);
        setArticleTemplateInfo(result);
      });
  }, []);

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

  const submitAdd = useCallback(
    async (template: Template, texts: ReplacementTexts): Promise<boolean> => {
      if (!checkTemplate(template, "add")) {
        return false;
      }
      setSubmitting(true);
      try {
        const result = await addTemplateToArticle(host, template.id, texts);
        console.log(`Add template ${template.id} result`, result);
        if (!result.success) {
          setFailMessage(result.message || `Failed to add template ${template.id}.`);
          return false;
        }
        if (result.usedTemplateIds == null) {
          setFailMessage("Got no template IDs from server after add.");
          return false;
        }
        setFailMessage("");
        applyUsedTemplateIds(result.usedTemplateIds);
        return true;
      } finally {
        setSubmitting(false);
      }
    },
    [checkTemplate, applyUsedTemplateIds],
  );

  // Adds the selected template, asking for replacement texts first when it needs any.
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

  // The hierarchy form is always shown: it presents the sub-articles to be created.
  const startCreateHierarchy = useCallback(() => {
    if (selectedTemplate === null) {
      setFailMessage("No template selected.");
      return;
    }
    setFailMessage("");
    setReplacementTexts(getInitialReplacementTexts(selectedTemplate));
    setHierarchyTemplate(selectedTemplate);
  }, [selectedTemplate]);

  const confirmCreateHierarchy = useCallback(async () => {
    if (hierarchyTemplate === null || !checkTemplate(hierarchyTemplate, "create hierarchy from")) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await createHierarchy(host, hierarchyTemplate.id, {}, replacementTexts);
      console.log(`Create hierarchy ${hierarchyTemplate.id} result`, result);
      if (!result.success) {
        setFailMessage(result.message || "Failed to create hierarchy.");
        return;
      }
      setFailMessage("");
      const createdHierarchyTemplateIds = result.createdHierarchyTemplateIds;
      if (createdHierarchyTemplateIds != null) {
        setArticleTemplateInfo((prev) =>
          prev === null ? prev : { ...prev, createdHierarchyTemplateIds },
        );
      }
      setHierarchyTemplate(null);
    } finally {
      setSubmitting(false);
    }
  }, [hierarchyTemplate, replacementTexts, checkTemplate]);

  const removeTemplateFromArticle = useCallback(
    async (template: Template | null) => {
      if (template === null || !checkTemplate(template, "remove")) {
        return;
      }
      const result = await host.fetchApp<{
        success: boolean;
        message?: string;
        usedTemplateIds?: Array<string>;
      }>("backend/removeTemplate", {
        scope: true,
        method: "DELETE",
        body: { templateId: template.id },
      });
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
    },
    [checkTemplate, applyUsedTemplateIds],
  );

  const templateIdGroupMap = useMemo(
    () => getTemplateIdGroupMap(articleTemplateInfo),
    [articleTemplateInfo],
  );

  const failBanner = failMessage && (
    <Banner mode="error" title="Failed to update article templates" withIcon>
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

  if (hierarchyTemplate !== null && articleTemplateInfo !== null) {
    return (
      <div className="widget">
        <ArticleHierarchyForm
          template={hierarchyTemplate}
          texts={replacementTexts}
          setTexts={setReplacementTexts}
          alreadyCreated={articleTemplateInfo.createdHierarchyTemplateIds.includes(
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

  const { isSelectedUsed, canCreateHierarchyForSelected } = getSelectionState(
    articleTemplateInfo,
    selectedTemplate,
  );

  return (
    <div className="widget">
      {articleTemplateInfo === null && <Loader message="Loading used templates..."/>}
      {articleTemplateInfo !== null && articleTemplateInfo.isTemplate && (
        <Banner mode="info" withIcon>
          Article is configured as a template, cannot apply any templates to it.
        </Banner>
      )}
      {articleTemplateInfo !== null &&
        !articleTemplateInfo.isTemplate &&
        hasNoTemplates(articleTemplateInfo) && (
          <Banner mode="info" withIcon>
            No valid templates found for article.
          </Banner>
        )}
      {articleTemplateInfo !== null && !articleTemplateInfo.isTemplate && (
        <div className="article-template-row">
          <TemplateList
            templates={articleTemplateInfo.templates}
            selectedTemplate={selectedTemplate}
            setSelectedTemplate={setSelectedTemplate}
            templateIdGroupMap={templateIdGroupMap}
            groupOrder={["Used templates", "Unused templates"]}
            onlyShowGrouped
            className="article-template-used-templates-list"
          />
        </div>
      )}
      {failBanner}
      <TemplateActions
        selectedTemplate={selectedTemplate}
        isSelectedUsed={isSelectedUsed}
        canCreateHierarchyForSelected={canCreateHierarchyForSelected}
        submitting={submitting}
        onAdd={startAdd}
        onCreateHierarchy={startCreateHierarchy}
        onRemove={() => removeTemplateFromArticle(selectedTemplate)}
      />
    </div>
  );
};

export const App = memo(AppComponent);
