import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import { Col, Grid, Row } from "@jetbrains/ring-ui-built/components/grid/grid";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectFieldInfo } from "../../../@types/project-fields";
import type { Template } from "../../../@types/template";
import FieldConditionInput from "./field-condition";
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
  const [templates, setTemplates] = useState<Array<Template>>([]);
  const [template, setTemplate] = useState<Template>(createEmptyTemplate());
  const [isDraft, setIsDraft] = useState<boolean>(true);
  const [failMessage, setFailMessage] = useState<string>("");
  const [projectFields, setProjectFields] = useState<Array<ProjectFieldInfo>>([]);

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
      .fetchApp<{ stateFields: Array<ProjectFieldInfo>; enumFields: Array<ProjectFieldInfo> }>(
        "backend/getProjectInfo",
        {
          scope: true,
          method: "GET",
        }
      )
      .then((result) => {
        // eslint-disable-next-line no-console
        console.log("Project fields", result);
        const fields = [...result.enumFields, ...result.stateFields];
        setProjectFields(fields);
      });
  }, [host]);

  const addOrUpdateTemplate = async (template: Template) => {
    if (template.name.trim() === "") {
      console.log("Template name is required");
      return;
    }
    if (template.articleId.trim() === "") {
      console.log("Article ID is required");
      return;
    }
    const result = await host.fetchApp<{
      success: Boolean;
      message?: string;
      templates?: Array<Template>;
    }>("backend/addTemplate", {
      scope: true,
      method: "POST",
      body: { template: template },
    });
    // eslint-disable-next-line no-console
    console.log("Add template result", result);
    if (result.success) {
      setFailMessage("");
      setIsDraft(false);
      setTemplates(result.templates || []);
    } else {
      setFailMessage(result.message || "Failed to add or update template.");
    }
  };

  const getListItems = (data: Array<Template>): Array<ListDataItem<{ templateItem: Template }>> => {
    const items: Array<ListDataItem<{ templateItem: Template }>> = data.map(
      (template: Template) => ({
        key: template.id,
        rgItemType: 2,
        label: template.name,
        details: `Article ID: ${template.articleId}`,
        templateItem: template,
      })
    );
    return items;
  };

  const selectTemplate = (selectedTemplate: Template) => {
    setTemplate(selectedTemplate);
    setIsDraft(false);
    setFailMessage("");
  };

  const createNewTemplate = () => {
    setTemplate(createEmptyTemplate());
    setIsDraft(true);
    setFailMessage("");
  };

  const listItems = useMemo(() => getListItems(templates), [templates]);
  const selectActionData = [
    { key: "none", label: "Not added automatically" },
    { key: "field_becomes", label: "Add when field is set" },
    /* { key: "tag_added", label: "Add when tag is added" }, */
  ];

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
            <div className="template-edit-panel">
              <Input
                label="Name"
                value={template.name}
                onChange={(e) => setTemplate((prev) => ({ ...prev, name: e.target.value }))}
                size={Size.L}
              />
              <Input
                label="Article ID"
                value={template.articleId}
                onChange={(e) =>
                  setTemplate((prev) => ({ ...prev, articleId: e.target.value.toUpperCase() }))
                }
                size={Size.L}
              />
              <FieldConditionInput
                fields={projectFields}
                conditionType="valid"
                template={template}
                setTemplate={setTemplate}
              />
              <Select
                clear
                data={selectActionData}
                selected={selectActionData.find(
                  (item) => item.key === (template?.addCondition?.when || "none")
                )}
                onChange={(selected: SelectItem | null) => {
                  if (selected === null || selected.key === "none") {
                    setTemplate((prev) => ({ ...prev, addCondition: null }));
                  } else if (selected.key === "field_becomes") {
                    setTemplate((prev) => ({
                      ...prev,
                      addCondition: {
                        when: "field_becomes",
                        fieldName: "",
                        fieldValue: "",
                      },
                    }));
                  } else if (selected.key === "tag_added") {
                    setTemplate((prev) => ({
                      ...prev,
                      addCondition: {
                        when: "tag_added",
                        tagName: "",
                      },
                    }));
                  }
                }}
              />
              {template !== null && template?.addCondition?.when === "field_becomes" && (
                <FieldConditionInput
                  fields={projectFields}
                  conditionType="add"
                  template={template}
                  setTemplate={setTemplate}
                />
              )}
              {failMessage && (
                <Banner mode="error" title="Failed to store template" withIcon>
                  {failMessage}
                </Banner>
              )}
              <div className="template-edit-actions">
                <Button onClick={() => addOrUpdateTemplate(template)}>
                  {isDraft ? "Add Template" : "Save Template"}
                </Button>
              </div>
            </div>
          </Col>
        </Row>
      </Grid>
    </div>
  );
};

export const App = memo(AppComponent);
