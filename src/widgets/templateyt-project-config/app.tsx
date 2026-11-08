import AddIcon from "@jetbrains/icons/add-12px";
import HelpIcon from "@jetbrains/icons/help";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import { Col, Grid, Row } from "@jetbrains/ring-ui-built/components/grid/grid";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptyTemplate,
  createNullTemplate,
  type ChildTemplate,
  type Template,
} from "../../../@types/template";
import type { ProjectFieldInfo } from "../../../@types/project-info";
import type { ArticleProjectInfo, TemplateArticle } from "../../../@types/template-article";
import { addArticleProjects } from "../../components/article-projects";
import TemplateEdit from "../../components/template-edit";
import TemplateHelp from "../../components/template-help";
import TemplateList from "../../components/template-list";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

// The list filter is only shown once the list is long enough to need it.
const FILTER_MIN_TEMPLATES = 6;

const AppComponent: React.FunctionComponent = () => {
  const [isDraft, setIsDraft] = useState<boolean>(false);
  // Project fields, loaded by the template editor; used to word conditions in the list.
  const [projectFields, setProjectFields] = useState<Array<ProjectFieldInfo>>([]);
  const [editing, setEditing] = useState<boolean>(false);
  const [templates, setTemplates] = useState<Array<Template>>([]);
  const [template, setTemplate] = useState<Template>(createNullTemplate());
  const [templateArticles, setTemplateArticles] = useState<TemplateArticle[]>([]);
  // Help is always shown when no template is selected; this opens it above a selected template.
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  // The list shows the template being edited (including unsaved child templates) in place of
  // its stored version, and a new draft template at the end.
  const displayedTemplates = useMemo(() => {
    if (template.id === "") {
      return templates;
    }
    const known = templates.some((t) => t.id === template.id);
    return known ? templates.map((t) => (t.id === template.id ? template : t)) : [...templates, template];
  }, [templates, template]);

  // Filters by template name or article id; the selected template always stays in the list.
  const filteredTemplates = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (query === "") {
      return displayedTemplates;
    }
    return displayedTemplates.filter(
      (t) =>
        t.id === template.id ||
        t.name.toLowerCase().includes(query) ||
        t.articleId.toLowerCase().includes(query),
    );
  }, [displayedTemplates, filter, template.id]);

  useEffect(() => {
    host
      .fetchApp<{
        templates: Array<Template>;
        articleProjects?: Record<string, ArticleProjectInfo>;
      }>("backend/templates", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        console.log("Result", result);
        addArticleProjects(result.articleProjects);
        setTemplates(result.templates);
      });
    host
      .fetchApp<Array<TemplateArticle>>("backend/getTemplateArticles", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        console.log("Template articles", result);
        addArticleProjects(
          Object.fromEntries(
            result.map(({ articleId, projectKey, projectName, isOtherProject }) => [
              articleId,
              { projectKey, projectName, isOtherProject },
            ]),
          ),
        );
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
      setHelpOpen(false);
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
      setHelpOpen(false);
    },
    [editing, template.id],
  );

  // Edits the given template as a new, unsaved draft.
  const startDraft = useCallback((draft: Template) => {
    setTemplate(draft);
    setSelectedChildId(null);
    setIsDraft(true);
    setEditing(true);
    setHelpOpen(false);
  }, []);

  const createNewTemplate = () => startDraft(createEmptyTemplate());

  return (
    <div className="widget">
      <Grid className="template-config-panel">
        <Row>
          <Col xs={12} sm={5} md={5} lg={4} className="template-list-panel">
            <div className="template-toolbar">
              <Button disabled={editing} onClick={() => createNewTemplate()} icon={AddIcon} inline>
                Add new template
              </Button>
              {template.id !== "" && (
                <Button
                  className="align-right"
                  onClick={() => setHelpOpen(!helpOpen)}
                  icon={HelpIcon}
                  inline
                >
                  {helpOpen ? "Hide help" : "Help"}
                </Button>
              )}
            </div>
            {(displayedTemplates.length >= FILTER_MIN_TEMPLATES || filter !== "") && (
              <div className="template-list-filter">
                <Input
                  placeholder="Filter by name or article"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onClear={() => setFilter("")}
                  size={Size.FULL}
                />
              </div>
            )}
            {filteredTemplates.length === 0 && (
              <Text size={Text.Size.M} info className="template-list-empty">
                {displayedTemplates.length === 0
                  ? "No templates yet."
                  : "No templates match the filter."}
              </Text>
            )}
            <TemplateList
              detailsMode="compact"
              disabled={editing}
              templates={filteredTemplates}
              selectedTemplate={template}
              setSelectedTemplate={selectTemplate}
              showChildren
              draftTemplateId={isDraft ? template.id : undefined}
              fieldInfos={projectFields}
              selectedChildId={selectedChildId}
              onSelectChild={selectChildTemplate}
            />
          </Col>
          <Col xs={12} sm={7} md={7} lg={8}>
            <div className="template-edit-panel">
              {(template.id === "" || helpOpen) && (
                <TemplateHelp createNewTemplate={editing ? undefined : createNewTemplate}/>
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
                  selectedChildId={selectedChildId}
                  setSelectedChildId={setSelectedChildId}
                  startDraft={startDraft}
                  onProjectFieldsLoaded={setProjectFields}
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
