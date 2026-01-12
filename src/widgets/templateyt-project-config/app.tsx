import WarningIcon from "@jetbrains/icons/warning-empty";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import { Col, Grid, Row } from "@jetbrains/ring-ui-built/components/grid/grid";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import React, { memo, useEffect, useMemo, useState } from "react";
import type { Template } from "../../../@types/template";
import type { TemplateArticle } from "../../../@types/template-article";
import TemplateEdit from "../../components/template-edit";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

const createEmptyTemplate = (): Template => ({
  id: crypto.randomUUID(),
  name: "",
  articleId: "",
  validCondition: null,
  addCondition: null,
});

const AppComponent: React.FunctionComponent = () => {
  const [isDraft, setIsDraft] = useState<boolean>(true);
  const [templates, setTemplates] = useState<Array<Template>>([]);
  const [template, setTemplate] = useState<Template>(createEmptyTemplate());
  const [templateArticles, setTemplateArticles] = useState<TemplateArticle[]>([]);

  useEffect(() => {
    host
      .fetchApp<{ templates: Array<Template> }>("backend/templates", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        // eslint-disable-next-line no-console
        console.log("Result", result);
        setTemplates(result.templates);
      });
    host
      .fetchApp<Array<TemplateArticle>>("backend/getTemplateArticles", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        // eslint-disable-next-line no-console
        console.log("Template articles", result);
        setTemplateArticles(result);
      });
  }, [host]);

  const getListItems = (
    data: Array<Template>,
    templateArticles: Array<TemplateArticle>
  ): Array<ListDataItem<{ templateItem: Template }>> => {
    const articlesMap: Record<string, TemplateArticle> = Object.fromEntries(
      templateArticles.map((article) => [article.articleId, article])
    );
    const getDetails = (template: Template): [string, boolean] => {
      if (!template?.validCondition) {
        return ["Incomplete configuration! No validity condition set.", true];
      }
      const validCond = template.validCondition;

      let description = "";
      if (validCond.when === "entity_is") {
        description +=
          validCond.entityType === "issue" ? "Valid when ticket" : "Valid when article";
      } else if (validCond.when === "field_is") {
        description += `Valid when ticket field ${validCond.fieldName} is ${validCond.fieldValue}`;
      } else if (validCond.when === "tag_is") {
        description += `Valid when tagged with ${validCond.tagName}`;
      }

      if (template.addCondition === null) {
        description += ".";
      } else {
        const addCond = template.addCondition;
        description += ", ";
        if (addCond.when === "field_becomes") {
          description += `added when ticket field ${addCond.fieldName} becomes ${addCond.fieldValue}`;
        } else if (addCond.when === "tag_added") {
          description += `added when tagged with ${addCond.tagName}`;
        }
        description += ".";
      }
      return [description, false];
    };

    const items: Array<ListDataItem<{ templateItem: Template }>> = data.map(
      (template: Template) => {
        const [details, hasWarning] = getDetails(template);
        return {
          key: template.id,
          rgItemType: 2,
          label: template.name,
          details: details,
          templateItem: template,
          rightGlyph: hasWarning ? WarningIcon : undefined,
        };
      }
    );
    return items;
  };

  const selectTemplate = (selectedTemplate: Template) => {
    setTemplate(selectedTemplate);
    setIsDraft(false);
  };

  const createNewTemplate = () => {
    setTemplate(createEmptyTemplate());
    setIsDraft(true);
  };

  const listItems = useMemo(
    () => getListItems(templates, templateArticles),
    [templates, templateArticles]
  );

  return (
    <div className="widget">
      <Grid className="template-config-panel">
        <Row>
          <Col xs={12} sm={4} md={4} lg={4} className="template-list-panel">
            {!isDraft && <Button onClick={() => createNewTemplate()}>Add new template</Button>}
            <List
              data={listItems}
              activeIndex={listItems.findIndex((item) => item.templateItem.id === template?.id)}
              onSelect={(item: ListDataItem<{ templateItem: Template }>) =>
                selectTemplate(item.templateItem)
              }
              activateSingleItem
            />
          </Col>
          <Col xs={12} sm={8} md={8} lg={8}>
            <TemplateEdit
              isDraft={isDraft}
              setIsDraft={setIsDraft}
              templateArticles={templateArticles}
              template={template}
              setTemplate={setTemplate}
              setTemplates={setTemplates}
            />
          </Col>
        </Row>
      </Grid>
    </div>
  );
};

export const App = memo(AppComponent);
