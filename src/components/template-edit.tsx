import ArticleIcon from "@jetbrains/icons/article";
import EditIcon from "@jetbrains/icons/pencil";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectFieldInfo, TagInfo } from "../../@types/project-info";
import {
  formatTemplateAddCondition,
  formatTemplateValidCondition,
  type Template,
} from "../../@types/template";
import type { TemplateArticle } from "../../@types/template-article";
import EntityTypeConditionInput from "./entity-type-condition-input";
import FieldConditionInput from "./field-condition-input";
import TagConditionInput from "./tag-condition-input";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

interface TemplateEditProps {
  isDraft: boolean;
  setIsDraft: React.Dispatch<React.SetStateAction<boolean>>;
  editing: boolean;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
  templateArticles: Array<TemplateArticle>;
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  setTemplates?: React.Dispatch<React.SetStateAction<Array<Template>>>;
}

const TemplateEdit: React.FunctionComponent<TemplateEditProps> = ({
  isDraft,
  setIsDraft,
  editing,
  setEditing,
  templateArticles,
  template,
  setTemplate,
  setTemplates,
}) => {
  const [projectFields, setProjectFields] = useState<Array<ProjectFieldInfo>>([]);
  const [projectTags, setProjectTags] = useState<Array<TagInfo>>([]);
  const [editFailMessage, setEditFailMessage] = useState<{
    mode: "info" | "error" | "success" | "warning" | "purple" | "grey";
    message: string;
  } | null>(null);
  const [templateSnapshot, setTemplateSnapshot] = useState<Template>(template);

  // Keep a fresh snapshot when parent `template` changes and we're not editing.
  useEffect(() => {
    if (!editing) {
      setTemplateSnapshot(template);
    }
  }, [template, editing]);

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
      setEditFailMessage({ mode: "error", message: "Template name is required." });
      return;
    }
    if (template.articleId.trim() === "") {
      setEditFailMessage({ mode: "error", message: "Template article is required." });
      return;
    }
    if (template.validCondition === null) {
      setEditFailMessage({
        mode: "error",
        message: "Template is not valid for any issues, please defined when valid.",
      });
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
      setEditFailMessage({ mode: "success", message: "Template stored successfully." });
      setIsDraft(false);
      setEditing(false);
      // Saved, store snapshot.
      setTemplateSnapshot(template);
      if (setTemplates) {
        setTemplates(result.templates || []);
      }
    } else {
      setEditFailMessage({
        mode: "error",
        message: result.message || "Failed to add or update template.",
      });
    }
  };

  const cancelEdit = useCallback(() => {
    if (isDraft) {
      setTemplate({
        id: "",
        name: "",
        articleId: "",
        validCondition: null,
        addCondition: null,
      });
      setIsDraft(false);
    } else {
      // Revert to initial template state.
      setTemplate(templateSnapshot);
    }

    setEditing(false);
    setEditFailMessage(null);
  }, [isDraft, templateSnapshot]);

  const getTemplateArticleSelectItems = (
    data: Array<TemplateArticle>,
  ): Array<SelectItem<{ templateArticleItem: TemplateArticle }>> => {
    const items: Array<SelectItem<{ templateArticleItem: TemplateArticle }>> = data.map(
      (templateArticle: TemplateArticle) => ({
        key: templateArticle.articleId,
        rgItemType: 2,
        label: `${templateArticle.articleId}: ${templateArticle.summary}`,
        templateArticleItem: templateArticle,
      }),
    );
    return items;
  };

  const templateArticleSelectItems = useMemo(
    () => getTemplateArticleSelectItems(templateArticles),
    [templateArticles],
  );

  const selectValidCondition = [
    { key: "none", label: "No valid condition set" },
    { key: "entity_is", label: "Valid when ticket or article" },
    { key: "field_is", label: "Valid when ticket field has a specific value" },
    { key: "tag_is", label: "Valid when ticket or article has a specific tag" },
  ];

  const selectActionData = [
    { key: "none", label: "Not added automatically" },
    { key: "field_becomes", label: "Added when ticket field becomes a specific value" },
    { key: "tag_added", label: "Added when ticket or article tagged with a specific tag" },
  ];

  return (
    <div className="template-edit">
      {editing && (
        <Input
          label="Name"
          value={template.name}
          onChange={(e) =>
            setTemplate((prev) => (prev !== null ? { ...prev, name: e.target.value } : prev))
          }
          size={Size.M}
        />
      )}
      {!editing && (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Name
          </Text>
          <Text size={Text.Size.M}>{template.name}</Text>
        </div>
      )}
      <div className="template-edit-field-panel">
        {editing && (
          <Select
            clear
            filter
            selectedLabel="Template article"
            label="Select template article..."
            data={templateArticleSelectItems}
            selected={templateArticleSelectItems.find(
              (item) => item.templateArticleItem.articleId === template?.articleId,
            )}
            onChange={(selected: SelectItem<{ templateArticleItem: TemplateArticle }> | null) => {
              if (selected != null) {
                setTemplate((prev) =>
                  prev !== null
                    ? {
                        ...prev,
                        articleId: selected.templateArticleItem.articleId,
                      }
                    : prev,
                );
              }
            }}
          />
        )}
        {!editing && (
          <div className="template-edit-field-panel">
            <Text size={Text.Size.S} info>
              Template article
            </Text>
            <Text size={Text.Size.M}>
              {templateArticleSelectItems.find((item) => item.key === template?.articleId)?.label ||
                "Not set..."}
            </Text>
          </div>
        )}
        {template !== null && template?.articleId && (
          <Button href={`/articles/${template.articleId}`} target="_blank" icon={ArticleIcon}>
            Open {template.articleId}
          </Button>
        )}
      </div>
      {editing && (
        <div className="template-edit-field-panel">
          <Select
            clear
            selectedLabel={"Condition when template is valid"}
            size={Size.L}
            data={selectValidCondition}
            selected={selectValidCondition.find(
              (item) => item.key === (template?.validCondition?.when || "none"),
            )}
            onChange={(selected: SelectItem | null) => {
              if (selected === null || selected.key === "none") {
                setTemplate((prev) => (prev !== null ? { ...prev, validCondition: null } : prev));
              } else if (selected.key === "field_is") {
                setTemplate((prev) =>
                  prev !== null
                    ? {
                        ...prev,
                        validCondition: {
                          when: "field_is",
                          fieldName: "",
                          fieldValue: "",
                        },
                      }
                    : prev,
                );
              } else if (selected.key === "tag_is") {
                setTemplate((prev) =>
                  prev !== null
                    ? {
                        ...prev,
                        validCondition: {
                          when: "tag_is",
                          tagName: "",
                        },
                      }
                    : prev,
                );
              }
            }}
          />
          {template !== null && template?.validCondition?.when === "entity_is" && (
            <EntityTypeConditionInput
              conditionType="valid"
              template={template}
              setTemplate={setTemplate}
            />
          )}
          {template !== null && template?.validCondition?.when === "field_is" && (
            <FieldConditionInput
              fields={projectFields}
              conditionType="valid"
              template={template}
              setTemplate={setTemplate}
            />
          )}
          {template !== null && template?.validCondition?.when === "tag_is" && (
            <TagConditionInput
              tags={projectTags}
              conditionType="valid"
              template={template}
              setTemplate={setTemplate}
            />
          )}
        </div>
      )}
      {!editing && (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Condition when template is valid
          </Text>
          <Text size={Text.Size.M}>{formatTemplateValidCondition(template)}</Text>
        </div>
      )}
      {editing && (
        <div className="template-edit-field-panel">
          <Select
            clear
            selectedLabel={"Condition when template is added automatically"}
            size={Size.L}
            data={selectActionData}
            selected={selectActionData.find(
              (item) => item.key === (template?.addCondition?.when || "none"),
            )}
            onChange={(selected: SelectItem | null) => {
              if (selected === null || selected.key === "none") {
                setTemplate((prev) => (prev !== null ? { ...prev, addCondition: null } : prev));
              } else if (selected.key === "field_becomes") {
                setTemplate((prev) =>
                  prev !== null
                    ? {
                        ...prev,
                        addCondition: {
                          when: "field_becomes",
                          fieldName: "",
                          fieldValue: "",
                        },
                      }
                    : prev,
                );
              } else if (selected.key === "tag_added") {
                setTemplate((prev) =>
                  prev !== null
                    ? {
                        ...prev,
                        addCondition: {
                          when: "tag_added",
                          tagName: "",
                        },
                      }
                    : prev,
                );
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
        </div>
      )}
      {!editing && (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Condition when template is added automatically
          </Text>
          <Text size={Text.Size.M}>{formatTemplateAddCondition(template)}</Text>
        </div>
      )}
      {editFailMessage !== null && (
        <Banner
          mode={editFailMessage.mode}
          title={
            editFailMessage.mode === "success"
              ? "Template stored successfully"
              : "Failed to store template"
          }
          withIcon
          onClose={() => setEditFailMessage(null)}
        >
          {editFailMessage.message}
        </Banner>
      )}
      <div className="template-edit-actions">
        {editing && (
          <Button onClick={() => addOrUpdateTemplate(template)} primary>
            {isDraft ? "Add template" : "Save template"}
          </Button>
        )}
        {editing && <Button onClick={() => cancelEdit()}>Cancel edit</Button>}
        {!editing && (
          <Button
            onClick={() => {
              // Capture current state as snapshot before entering edit mode.
              setTemplateSnapshot(template);
              setEditing(true);
            }}
            icon={EditIcon}
          >
            Edit template
          </Button>
        )}
      </div>
    </div>
  );
};

export default TemplateEdit;
