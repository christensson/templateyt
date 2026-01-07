import Button from "@jetbrains/ring-ui-built/components/button/button";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { Template } from "../../../@types/template";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

type IssueTemplateInfo = {
  usedTemplateIds: Array<string>;
  templates: Array<Template>;
  validTemplateIds: Array<string>;
};

const AppComponent: React.FunctionComponent = () => {
  const [issueTemplateInfo, setIssueTemplateInfo] = useState<IssueTemplateInfo | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

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

  const getListItems = (
    data: IssueTemplateInfo | null
  ): Array<ListDataItem<{ templateItem?: Template }>> => {
    if (data === null) {
      return [];
    }
    const usedTemplates = data.templates.filter((t) => data.usedTemplateIds.includes(t.id));
    const unusedTemplates = data.templates
      .filter((t) => !data.usedTemplateIds.includes(t.id))
      .filter((t) => data.validTemplateIds.includes(t.id));
    const items: Array<ListDataItem<{ templateItem?: Template }>> = [];
    items.push({
      rgItemType: 5,
      label: "Used templates",
    });
    items.push(
      ...usedTemplates.map((t: Template) => ({
        key: t.id,
        rgItemType: 2,
        label: t.name,
        details: `From article: ${t.articleId}`,
        templateItem: t,
      }))
    );
    items.push({
      rgItemType: 5,
      label: "Unused templates",
    });
    items.push(
      ...unusedTemplates.map((t: Template) => ({
        key: t.id,
        rgItemType: 2,
        label: t.name,
        details: `From article: ${t.articleId}`,
        templateItem: t,
      }))
    );
    return items;
  };

  const listItems = useMemo(() => getListItems(issueTemplateInfo), [issueTemplateInfo]);
  const selectedTemplate = useMemo(() => {
    if (issueTemplateInfo === null || selectedTemplateId === null) {
      return null;
    }
    return issueTemplateInfo.templates.find((t) => t.id === selectedTemplateId) || null;
  }, [issueTemplateInfo, selectedTemplateId]);

  return (
    <div className="widget">
      {issueTemplateInfo === null && <Loader message="Loading used templates..." />}
      {issueTemplateInfo !== null && (
        <div className="issue-template-row">
          <List
            data={listItems}
            activeIndex={
              setSelectedTemplateId !== null
                ? listItems.findIndex((item) => item.key === selectedTemplateId)
                : -1
            }
            onSelect={(item: ListDataItem<{ templateItem?: Template }>) => {
              if (item.templateItem) {
                setSelectedTemplateId(item.templateItem.id);
              }
            }}
            activateSingleItem
            className="issue-template-used-templates-list"
          />
        </div>
      )}
      <Panel className="issue-template-config-bottom-panel">
        <Button
          primary
          disabled={
            selectedTemplateId === null ||
            issueTemplateInfo?.usedTemplateIds.includes(selectedTemplateId)
          }
        >
          {"Add template"}
        </Button>
        <Button
          primary
          disabled={
            selectedTemplateId === null ||
            !issueTemplateInfo?.usedTemplateIds.includes(selectedTemplateId)
          }
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
