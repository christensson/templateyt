import AddIcon from "@jetbrains/icons/add-12px";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import { Col, Grid, Row } from "@jetbrains/ring-ui-built/components/grid/grid";
import Link from "@jetbrains/ring-ui-built/components/link/link";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptyTemplate,
  createNullTemplate,
  type ChildTemplate,
  type Template,
} from "../../../@types/template";
import type { TemplateArticle } from "../../../@types/template-article";
import TemplateEdit from "../../components/template-edit";
import TemplateHelp from "../../components/template-help";
import TemplateList from "../../components/template-list";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

const AppComponent: React.FunctionComponent = () => {
  const [isDraft, setIsDraft] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [templates, setTemplates] = useState<Array<Template>>([]);
  const [template, setTemplate] = useState<Template>(createNullTemplate());
  const [templateArticles, setTemplateArticles] = useState<TemplateArticle[]>([]);
  const [helpCollapsed, setHelpCollapsed] = useState<boolean>(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // The list shows the template being edited (including unsaved child templates) in place of
  // its stored version, and a new draft template at the end.
  const displayedTemplates = useMemo(() => {
    if (template.id === "") {
      return templates;
    }
    const known = templates.some((t) => t.id === template.id);
    return known ? templates.map((t) => (t.id === template.id ? template : t)) : [...templates, template];
  }, [templates, template]);

  useEffect(() => {
    host
      .fetchApp<{ templates: Array<Template> }>("backend/templates", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        console.log("Result", result);
        setTemplates(result.templates);
      });
    host
      .fetchApp<Array<TemplateArticle>>("backend/getTemplateArticles", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        console.log("Template articles", result);
        setTemplateArticles(result);
      });
  }, []);

  const selectTemplate = useCallback(
    (selectedTemplate: Template | null) => {
      // While editing, only the edited template's own rows can be selected, which just leaves
      // any selected child template.
      if (editing) {
        if (selectedTemplate !== null && selectedTemplate.id === template.id) {
          setSelectedChildId(null);
        }
        return;
      }
      if (selectedTemplate === null) {
        setTemplate(createNullTemplate());
      } else {
        setTemplate(selectedTemplate);
      }
      setSelectedChildId(null);
      setIsDraft(false);
      setEditing(false);
      setHelpCollapsed(true);
    },
    [editing, template.id],
  );

  const selectChildTemplate = useCallback(
    (parent: Template, child: ChildTemplate) => {
      if (editing) {
        if (parent.id === template.id) {
          setSelectedChildId(child.id);
        }
        return;
      }
      setTemplate(parent);
      setSelectedChildId(child.id);
      setIsDraft(false);
      setHelpCollapsed(true);
    },
    [editing, template.id],
  );

  const createNewTemplate = () => {
    setTemplate(createEmptyTemplate());
    setSelectedChildId(null);
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
              templates={displayedTemplates}
              selectedTemplate={template}
              setSelectedTemplate={selectTemplate}
              showChildren
              selectedChildId={selectedChildId}
              onSelectChild={selectChildTemplate}
            />
          </Col>
          <Col xs={12} sm={6} md={6} lg={5}>
            <div className="template-edit-panel">
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
                  selectedChildId={selectedChildId}
                  setSelectedChildId={setSelectedChildId}
                />
              )}
              <div className="template-edit-extra-info">
                {template.id === "" && (
                  <Text size={Text.Size.M}>
                    No template selected, please select a template from the list or{" "}
                    <Link onClick={() => createNewTemplate()}>add a new template</Link>.
                  </Text>
                )}
              </div>
              <TemplateHelp
                collapsed={helpCollapsed}
                setCollapsed={setHelpCollapsed}
                createNewTemplate={createNewTemplate}
              />
            </div>
          </Col>
        </Row>
      </Grid>
    </div>
  );
};

export const App = memo(AppComponent);
