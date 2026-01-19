import ArticleIcon from "@jetbrains/icons/article";
import ConditionIcon from "@jetbrains/icons/buildType-12px";
import EditIcon from "@jetbrains/icons/pencil";
import TrashIcon from "@jetbrains/icons/trash";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import DropdownMenu from "@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectFieldInfo, TagInfo } from "../../@types/project-info";
import {
  createNullTemplate,
  formatAddCondition,
  formatValidCondition,
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
    if (!Array.isArray(template.validCondition) || template.validCondition.length === 0) {
      setEditFailMessage({
        mode: "error",
        message: "Template missing valid conditions, please define when valid.",
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

  const removeTemplate = async (template: Template) => {
    if (template.id.trim() === "") {
      setEditFailMessage({ mode: "error", message: "Template has no id, cannot remove." });
      return;
    }
    const result = await host.fetchApp<{
      success: Boolean;
      message?: string;
      templates?: Array<Template>;
    }>("backend/removeTemplate", {
      scope: true,
      method: "DELETE",
      body: { id: template.id },
    });
    // eslint-disable-next-line no-console
    console.log("Remove template result", result);
    if (result.success) {
      setEditFailMessage(null);
      setIsDraft(false);
      setEditing(false);
      setTemplate(createNullTemplate());
      if (setTemplates) {
        setTemplates(result.templates || []);
      }
    } else {
      setEditFailMessage({
        mode: "error",
        message: result.message || "Failed to remove template.",
      });
    }
  };

  const cancelEdit = useCallback(() => {
    if (isDraft) {
      setTemplate(createNullTemplate());
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
    { key: "entity_is", label: "When ticket/article" },
    { key: "field_is", label: "When ticket field is" },
    { key: "tag_is", label: "When ticket/article has tag" },
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
          <Text size={Text.Size.S} info>
            Conditions when template is valid (any matches)
          </Text>
          {(Array.isArray(template.validCondition) ? template.validCondition : []).length === 0 && (
            <Text size={Text.Size.M}>No validity conditions yet.</Text>
          )}
          {(Array.isArray(template.validCondition) ? template.validCondition : []).map(
            (cond, idx) => (
              <div key={`valid-cond-${idx}`} style={{ display: "flex", gap: 8 }}>
                {cond.when === "entity_is" && (
                  <EntityTypeConditionInput
                    conditionType="valid"
                    template={template}
                    setTemplate={setTemplate}
                    conditionIndex={idx}
                  />
                )}
                {cond.when === "field_is" && (
                  <FieldConditionInput
                    fields={projectFields}
                    conditionType="valid"
                    template={template}
                    setTemplate={setTemplate}
                    conditionIndex={idx}
                  />
                )}
                {cond.when === "tag_is" && (
                  <TagConditionInput
                    tags={projectTags}
                    conditionType="valid"
                    template={template}
                    setTemplate={setTemplate}
                    conditionIndex={idx}
                  />
                )}
                <Button
                  onClick={() =>
                    setTemplate((prev) => {
                      const list = Array.isArray(prev.validCondition)
                        ? [...prev.validCondition]
                        : [];
                      list.splice(idx, 1);
                      return { ...prev, validCondition: list };
                    })
                  }
                  icon={TrashIcon}
                  title="Remove condition"
                />
              </div>
            ),
          )}
          <DropdownMenu
            anchor={"Add condition"}
            data={selectValidCondition}
            onSelect={(selected: SelectItem | null) => {
              if (!selected) return;
              const newCond =
                selected.key === "entity_is"
                  ? ({ when: "entity_is", entityType: "issue" } as const)
                  : selected.key === "field_is"
                    ? ({ when: "field_is", fieldName: "", fieldValue: "" } as const)
                    : ({ when: "tag_is", tagName: "" } as const);
              setTemplate((prev) => {
                const list = Array.isArray(prev.validCondition) ? [...prev.validCondition] : [];
                return { ...prev, validCondition: [...list, newCond] };
              });
            }}
          />
        </div>
      )}
      {!editing && (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Conditions when template is valid (any matches)
          </Text>
          {!Array.isArray(template?.validCondition) || template.validCondition.length === 0 ? (
            <Text size={Text.Size.M}>No validity conditions.</Text>
          ) : (
            <div className="template-edit-valid-cond-list">
              {template.validCondition.map((cond, idx) => (
                <Text size={Text.Size.M} key={`valid-cond-text-${idx}`}>
                  <Icon glyph={ConditionIcon} /> {formatValidCondition(cond, true)}.
                </Text>
              ))}
            </div>
          )}
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
          {template.addCondition == null ? (
            <Text size={Text.Size.M}>No automatic condition set.</Text>
          ) : (
            <Text size={Text.Size.M}>
              <Icon glyph={ConditionIcon} /> {formatAddCondition(template.addCondition, true)}
            </Text>
          )}
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
        {editing && !isDraft && (
          <Button onClick={() => removeTemplate(template)} icon={TrashIcon} danger>
            Remove template
          </Button>
        )}
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
