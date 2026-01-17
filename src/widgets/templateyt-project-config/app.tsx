import AddIcon from "@jetbrains/icons/add-12px";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import { Col, Grid, Row } from "@jetbrains/ring-ui-built/components/grid/grid";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
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

const createNullTemplate = (): Template => ({
  id: "", // Indicate null template with empty id.
  name: "",
  articleId: "",
  validCondition: null,
  addCondition: null,
});

const AppComponent: React.FunctionComponent = () => {
  const [isDraft, setIsDraft] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [templates, setTemplates] = useState<Array<Template>>([]);
  const [template, setTemplate] = useState<Template>(createNullTemplate());
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

  const selectTemplate = useCallback(
    (selectedTemplate: Template) => {
      // Cannot select templates whiled editing one.
      if (editing) {
        return;
      }
      setTemplate(selectedTemplate);
      setIsDraft(false);
      setEditing(false);
    },
    [editing]
  );

  const createNewTemplate = () => {
    setTemplate(createEmptyTemplate());
    setIsDraft(true);
    setEditing(true);
  };

  return (
    <div className="widget">
      <Grid className="template-config-panel">
        <Row>
          <Col xs={12} sm={6} md={6} lg={7} className="template-list-panel">
            <div className="template-toolbar">
              <Button disabled={editing} onClick={() => createNewTemplate()} icon={AddIcon} inline>
                Add new template
              </Button>
            </div>
            <TemplateList
              disabled={editing}
              templates={templates}
              selectedTemplate={template}
              setSelectedTemplate={selectTemplate}
            />
          </Col>
          <Col xs={12} sm={6} md={6} lg={5}>
            <div className="template-edit-panel">
              {template.id === "" && (
                <Text size={Text.Size.M}>
                  No template selected, please select a template from the list or add a new
                  template.
                </Text>
              )}
              {template.id !== "" && (
                <TemplateEdit
                  isDraft={isDraft}
                  setIsDraft={setIsDraft}
                  editing={editing}
                  setEditing={setEditing}
                  templateArticles={templateArticles}
                  template={template}
                  setTemplate={setTemplate}
                  setTemplates={setTemplates}
                />
              )}
            </div>
          </Col>
        </Row>
      </Grid>
    </div>
  );
};

export const App = memo(AppComponent);
