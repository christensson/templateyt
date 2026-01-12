import Button from "@jetbrains/ring-ui-built/components/button/button";
import { Col, Grid, Row } from "@jetbrains/ring-ui-built/components/grid/grid";
import React, { memo, useEffect, useMemo, useState } from "react";
import type { Template } from "../../../@types/template";
import type { TemplateArticle } from "../../../@types/template-article";
import TemplateEdit from "../../components/template-edit";
import TemplateList from "../../components/template-list";

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

  const selectTemplate = (selectedTemplate: Template) => {
    setTemplate(selectedTemplate);
    setIsDraft(false);
  };

  const createNewTemplate = () => {
    setTemplate(createEmptyTemplate());
    setIsDraft(true);
  };

  return (
    <div className="widget">
      <Grid className="template-config-panel">
        <Row>
          <Col xs={12} sm={4} md={4} lg={4} className="template-list-panel">
            {!isDraft && <Button onClick={() => createNewTemplate()}>Add new template</Button>}
            <TemplateList
              templates={templates}
              templateArticles={templateArticles}
              selectedTemplate={template}
              setSelectedTemplate={selectTemplate}
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
