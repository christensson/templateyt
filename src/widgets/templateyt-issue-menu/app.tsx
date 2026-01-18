import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { Template } from "../../../@types/template";
import TemplateList from "../../components/template-list";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

type IssueTemplateInfo = {
  usedTemplateIds: Array<string>;
  templates: Array<Template>;
  validTemplateIds: Array<string>;
};

const AppComponent: React.FunctionComponent = () => {
  const [issueTemplateInfo, setIssueTemplateInfo] = useState<IssueTemplateInfo | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [failMessage, setFailMessage] = useState<string>("");

  useEffect(() => {
    host
      .fetchApp<IssueTemplateInfo>("backend/templates", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        // eslint-disable-next-line no-console
        console.log("getUsedTemplates result", result);
        setIssueTemplateInfo(result);
      });
  }, [host]);

  const addTemplateToIssue = useCallback(
    async (template: Template | null) => {
      if (template === null || template.id === null) {
        setFailMessage("Failed to add template, no template selected.");
        return;
      }
      if (issueTemplateInfo === null) {
        setFailMessage("Failed to add template, no template info loaded.");
        return;
      }
      const templateId = template.id;
      if (!issueTemplateInfo.templates.map((t) => t.id).includes(templateId)) {
        setFailMessage(`Template ${templateId} not found in loaded templates.`);
        return;
      }
      const result = await host.fetchApp<{
        success: Boolean;
        message?: string;
        usedTemplateIds?: Array<string>;
      }>("backend/addTemplate", {
        scope: true,
        method: "POST",
        body: { templateId: templateId },
      });
      // eslint-disable-next-line no-console
      console.log(`Add template ${templateId} result`, result);
      if (!result.success) {
        setFailMessage(result.message || `Failed to add template ${templateId}.`);
        return;
      }
      if (result?.usedTemplateIds == undefined) {
        setFailMessage("Got no template IDs from server after add.");
        return;
      }

      setFailMessage("");
      setIssueTemplateInfo((prev) => {
        if (prev === null) {
          return prev;
        }
        return {
          ...prev,
          usedTemplateIds: result.usedTemplateIds as Array<string>,
        };
      });
    },
    [host, issueTemplateInfo],
  );

  const removeTemplateFromIssue = useCallback(
    async (template: Template | null) => {
      if (template === null || template.id === null) {
        setFailMessage("Failed to remove template, no template selected.");
        return;
      }
      if (issueTemplateInfo === null) {
        setFailMessage("Failed to remove template, no template info loaded.");
        return;
      }
      const templateId = template.id;
      if (!issueTemplateInfo.templates.map((t) => t.id).includes(templateId)) {
        setFailMessage(`Template ${templateId} not found in loaded templates.`);
        return;
      }
      const result = await host.fetchApp<{
        success: Boolean;
        message?: string;
        usedTemplateIds?: Array<string>;
      }>("backend/removeTemplate", {
        scope: true,
        method: "DELETE",
        body: { templateId: templateId },
      });
      // eslint-disable-next-line no-console
      console.log(`Remove template ${templateId} result`, result);
      if (!result.success) {
        setFailMessage(result.message || `Failed to remove template ${templateId}.`);
        return;
      }
      if (result?.usedTemplateIds == undefined) {
        setFailMessage("Got no template IDs from server after removal.");
        return;
      }

      setFailMessage("");
      setIssueTemplateInfo((prev) => {
        if (prev === null) {
          return prev;
        }
        return {
          ...prev,
          usedTemplateIds: result.usedTemplateIds as Array<string>,
        };
      });
    },
    [host, issueTemplateInfo],
  );

  const getTemplateIdGroupMap = (data: IssueTemplateInfo | null): { [key: string]: string } => {
    if (data === null) {
      return {};
    }
    const usedTemplateIds = data.templates
      .map((t) => t.id)
      .filter((tid) => data.usedTemplateIds.includes(tid));
    const unusedTemplateIds = data.templates
      .map((t) => t.id)
      .filter((tid) => !data.usedTemplateIds.includes(tid))
      .filter((tid) => data.validTemplateIds.includes(tid));

    const templateIdGroupMap: { [key: string]: string } = {};
    for (const tid of usedTemplateIds) {
      templateIdGroupMap[tid] = "Used templates";
    }
    for (const tid of unusedTemplateIds) {
      templateIdGroupMap[tid] = "Unused templates";
    }
    return templateIdGroupMap;
  };

  const templateIdGroupMap = useMemo(() => {
    return getTemplateIdGroupMap(issueTemplateInfo);
  }, [issueTemplateInfo]);

  return (
    <div className="widget">
      {issueTemplateInfo === null && <Loader message="Loading used templates..." />}
      {issueTemplateInfo !== null &&
        issueTemplateInfo.usedTemplateIds.length == 0 &&
        issueTemplateInfo.validTemplateIds.length == 0 && (
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
      {failMessage && (
        <Banner mode="error" title="Failed to update ticket templates" withIcon>
          {failMessage}
        </Banner>
      )}
      <Panel className="issue-template-config-bottom-panel">
        <Button
          primary
          disabled={
            selectedTemplate === null ||
            issueTemplateInfo?.usedTemplateIds.includes(selectedTemplate.id)
          }
          onClick={() => addTemplateToIssue(selectedTemplate)}
        >
          {"Add template"}
        </Button>
        <Button
          primary
          disabled={
            selectedTemplate === null ||
            !issueTemplateInfo?.usedTemplateIds.includes(selectedTemplate.id)
          }
          onClick={() => removeTemplateFromIssue(selectedTemplate)}
        >
          {"Remove template"}
        </Button>
        {selectedTemplate !== null && (
          <Button secondary href={`/articles/${selectedTemplate?.articleId}`}>
            {`Open article ${selectedTemplate?.articleId}`}
          </Button>
        )}
      </Panel>
    </div>
  );
};

export const App = memo(AppComponent);
