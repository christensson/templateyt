import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectFieldInfo, TagInfo } from "../../@types/project-info";
import type { Template } from "../../@types/template";
import type { TemplateArticle } from "../../@types/template-article";
import FieldConditionInput from "./field-condition-input";
import TagConditionInput from "./tag-condition-input";
import EntityTypeConditionInput from "./entity-type-condition-input";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

const createEmptyTemplate = (): Template => ({
  id: crypto.randomUUID(),
  name: "",
  articleId: "",
  validCondition: null,
  addCondition: null,
});

interface TemplateEditProps {
  isDraft: boolean;
  setIsDraft: React.Dispatch<React.SetStateAction<boolean>>;
  templateArticles: Array<TemplateArticle>;
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  setTemplates?: React.Dispatch<React.SetStateAction<Array<Template>>>;
}

const TemplateEdit: React.FunctionComponent<TemplateEditProps> = ({
  isDraft,
  setIsDraft,
  templateArticles,
  template,
  setTemplate,
  setTemplates,
}) => {
  const [projectFields, setProjectFields] = useState<Array<ProjectFieldInfo>>([]);
  const [projectTags, setProjectTags] = useState<Array<TagInfo>>([]);
  const [failMessage, setFailMessage] = useState<string>("");

  useEffect(() => {
    host
      .fetchApp<{
        stateFields: Array<ProjectFieldInfo>;
        enumFields: Array<ProjectFieldInfo>;
      }>("backend/getProjectInfo", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        // eslint-disable-next-line no-console
        console.log("Project info", result);
        const fields = [...result.enumFields, ...result.stateFields];
        setProjectFields(fields);
      });
    host
      .fetchYouTrack<Array<{ name: string }>>(`tags`, {
        query: {
          fields: "name",
        },
      })
      .then((result) => {
        // eslint-disable-next-line no-console
        console.log("Tags", result);
        const tags: Array<TagInfo> = result.map((tag) => ({
          name: tag.name,
        }));
        setProjectTags(tags);
      });
  }, [host]);

  const addOrUpdateTemplate = async (template: Template) => {
    if (template.name.trim() === "") {
      setFailMessage("Template name is required.");
      return;
    }
    if (template.articleId.trim() === "") {
      setFailMessage("Template article is required.");
      return;
    }
    if (template.validCondition === null) {
      setFailMessage("Template is not valid for any issues, please defined when valid.");
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
      if (setTemplates) {
        setTemplates(result.templates || []);
      }
    } else {
      setFailMessage(result.message || "Failed to add or update template.");
    }
  };

  const getTemplateArticleSelectItems = (
    data: Array<TemplateArticle>
  ): Array<SelectItem<{ templateArticleItem: TemplateArticle }>> => {
    const items: Array<SelectItem<{ templateArticleItem: TemplateArticle }>> = data.map(
      (templateArticle: TemplateArticle) => ({
        key: templateArticle.articleId,
        rgItemType: 2,
        label: `${templateArticle.articleId}: ${templateArticle.summary}`,
        templateArticleItem: templateArticle,
      })
    );
    return items;
  };

  const createNewTemplate = () => {
    setTemplate(createEmptyTemplate());
    setIsDraft(true);
    setFailMessage("");
  };

  const templateArticleSelectItems = useMemo(
    () => getTemplateArticleSelectItems(templateArticles),
    [templateArticles]
  );
  const selectActionData = [
    { key: "none", label: "Not added automatically" },
    { key: "field_becomes", label: "Add when ticket field is set" },
    { key: "tag_added", label: "Add when tag is added" },
  ];

  return (
    <div className="template-edit-panel">
      <Input
        label="Name"
        value={template.name}
        onChange={(e) => setTemplate((prev) => ({ ...prev, name: e.target.value }))}
        size={Size.L}
      />
      <div className="template-edit-panel-article-select">
        <Select
          clear
          filter
          selectedLabel="Template article"
          label="Select template article..."
          data={templateArticleSelectItems}
          selected={templateArticleSelectItems.find(
            (item) => item.templateArticleItem.articleId === template?.articleId
          )}
          onChange={(selected: SelectItem<{ templateArticleItem: TemplateArticle }> | null) => {
            if (selected != null) {
              setTemplate((prev) => ({
                ...prev,
                articleId: selected.templateArticleItem.articleId,
              }));
            }
          }}
        />
        {template !== null && template?.articleId && (
          <Button href={`/articles/${template.articleId}`} target="_blank">
            Open {template.articleId}
          </Button>
        )}
      </div>
      <EntityTypeConditionInput
        conditionType="valid"
        template={template}
        setTemplate={setTemplate}
      />
      <FieldConditionInput
        fields={projectFields}
        conditionType="valid"
        template={template}
        setTemplate={setTemplate}
      />
      <TagConditionInput
        tags={projectTags}
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
      {template !== null && template?.addCondition?.when === "tag_added" && (
        <TagConditionInput
          tags={projectTags}
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
  );
};

export default TemplateEdit;
