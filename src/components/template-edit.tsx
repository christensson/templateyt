import ArticleIcon from "@jetbrains/icons/article";
import ConditionIcon from "@jetbrains/icons/buildType-12px";
import EditIcon from "@jetbrains/icons/pencil";
import TrashIcon from "@jetbrains/icons/trash";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Confirm from "@jetbrains/ring-ui-built/components/confirm/confirm";
import DropdownMenu from "@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectFieldInfo, TagInfo } from "../../@types/project-info";
import {
  createNullTemplate,
  formatAddCondition,
  formatValidCondition,
  type Template,
  type ValidCondition,
} from "../../@types/template";
import type { TemplateArticle } from "../../@types/template-article";
import EntityTypeConditionInput from "./entity-type-condition-input";
import FieldConditionInput from "./field-condition-input";
import TagConditionInput from "./tag-condition-input";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

const TAG_PAGE_SIZE = 50;

const SELECT_VALID_CONDITION = [
  { key: "entity_is", label: "When ticket/article" },
  { key: "field_is", label: "When ticket field is" },
  { key: "tag_is", label: "When ticket/article has tag" },
];

const SELECT_ACTION_DATA = [
  { key: "none", label: "Not added automatically" },
  { key: "field_becomes", label: "Added when ticket field becomes a specific value" },
  { key: "tag_added", label: "Added when ticket or article tagged with a specific tag" },
];

type TemplateArticleSelectItem = SelectItem<{ templateArticleItem: TemplateArticle }>;

type FailMessage = {
  mode: "info" | "error" | "success" | "warning" | "purple" | "grey";
  message: string;
};

const createValidCondition = (key: string): ValidCondition => {
  if (key === "entity_is") {
    return { when: "entity_is", entityType: "issue" };
  }
  if (key === "field_is") {
    return { when: "field_is", fieldName: "", fieldValue: "" };
  }
  return { when: "tag_is", tagName: "" };
};

const getValidConditions = (template: Template): Array<ValidCondition> =>
  Array.isArray(template?.validCondition) ? template.validCondition : [];

const getTemplateArticleSelectItems = (
  data: Array<TemplateArticle>,
): Array<TemplateArticleSelectItem> =>
  data.map((templateArticle: TemplateArticle) => ({
    key: templateArticle.articleId,
    rgItemType: 2,
    label: `${templateArticle.articleId}: ${templateArticle.summary}`,
    templateArticleItem: templateArticle,
  }));

interface TemplateViewProps {
  template: Template;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
}

// Read-only presentation of a template.
const TemplateView: React.FunctionComponent<TemplateViewProps> = ({
  template,
  templateArticleSelectItems,
}) => {
  const validConditions = getValidConditions(template);
  return (
    <>
      <div className="template-edit-field-panel">
        <Text size={Text.Size.S} info>
          Name
        </Text>
        <Text size={Text.Size.M}>{template.name}</Text>
      </div>
      <div className="template-edit-field-panel">
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Template article
          </Text>
          <Text size={Text.Size.M}>
            {templateArticleSelectItems.find((item) => item.key === template?.articleId)?.label ||
              "Not set..."}
          </Text>
        </div>
        {template?.articleId && (
          <Button href={`/articles/${template.articleId}`} target="_blank" icon={ArticleIcon}>
            Open {template.articleId}
          </Button>
        )}
      </div>
      <div className="template-edit-field-panel">
        <Text size={Text.Size.S} info>
          Conditions when template is valid (any matches)
        </Text>
        {validConditions.length === 0 ? (
          <Text size={Text.Size.M}>No validity conditions.</Text>
        ) : (
          <div className="template-edit-valid-cond-list">
            {validConditions.map((cond, idx) => (
              // Conditions have no identity of their own; the list is small and rendered read-only.
              // eslint-disable-next-line react/no-array-index-key
              <Text size={Text.Size.M} key={`valid-cond-text-${idx}`}>
                <Icon glyph={ConditionIcon}/> {formatValidCondition(cond, true)}.
              </Text>
            ))}
          </div>
        )}
      </div>
      <div className="template-edit-field-panel">
        <Text size={Text.Size.S} info>
          Condition when template is added automatically
        </Text>
        {template.addCondition == null ? (
          <Text size={Text.Size.M}>No automatic condition set.</Text>
        ) : (
          <Text size={Text.Size.M}>
            <Icon glyph={ConditionIcon}/> {formatAddCondition(template.addCondition, true)}
          </Text>
        )}
      </div>
    </>
  );
};

interface TemplateEditFormProps {
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
  projectFields: Array<ProjectFieldInfo>;
  projectTags: Array<TagInfo>;
  tagsLoading: boolean;
  onTagsFilter: (filter: string) => void;
  onTagsLoadMore: () => void;
}

// Editable form for a template.
const TemplateEditForm: React.FunctionComponent<TemplateEditFormProps> = ({
  template,
  setTemplate,
  templateArticleSelectItems,
  projectFields,
  projectTags,
  tagsLoading,
  onTagsFilter,
  onTagsLoadMore,
}) => {
  const validConditions = getValidConditions(template);

  const onSelectAddCondition = (selected: SelectItem | null) => {
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
  };

  const renderValidConditionInput = (cond: ValidCondition, idx: number) => {
    if (cond.when === "entity_is") {
      return (
        <EntityTypeConditionInput
          conditionType="valid"
          template={template}
          setTemplate={setTemplate}
          conditionIndex={idx}
        />
      );
    }
    if (cond.when === "field_is") {
      return (
        <FieldConditionInput
          fields={projectFields}
          conditionType="valid"
          template={template}
          setTemplate={setTemplate}
          conditionIndex={idx}
        />
      );
    }
    return (
      <TagConditionInput
        tags={projectTags}
        tagsLoading={tagsLoading}
        onFilter={onTagsFilter}
        onLoadMore={onTagsLoadMore}
        conditionType="valid"
        template={template}
        setTemplate={setTemplate}
        conditionIndex={idx}
      />
    );
  };

  return (
    <>
      <Input
        label="Name"
        value={template.name}
        onChange={(e) =>
          setTemplate((prev) => (prev !== null ? { ...prev, name: e.target.value } : prev))
        }
        size={Size.M}
      />
      <div className="template-edit-field-panel">
        <Select
          clear
          filter
          selectedLabel="Template article"
          label="Select template article..."
          data={templateArticleSelectItems}
          selected={templateArticleSelectItems.find(
            (item) => item.templateArticleItem.articleId === template?.articleId,
          )}
          onChange={(selected: TemplateArticleSelectItem | null) => {
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
        {template?.articleId && (
          <Button href={`/articles/${template.articleId}`} target="_blank" icon={ArticleIcon}>
            Open {template.articleId}
          </Button>
        )}
      </div>
      <div className="template-edit-field-panel">
        <Text size={Text.Size.S} info>
          Conditions when template is valid (any matches)
        </Text>
        {validConditions.length === 0 && (
          <Text size={Text.Size.M}>No validity conditions yet.</Text>
        )}
        {validConditions.map((cond, idx) => (
          // Conditions have no identity of their own and the inputs are fully controlled by
          // `template`, so the position is the only stable key.
          // eslint-disable-next-line react/no-array-index-key
          <div key={`valid-cond-${idx}`} style={{ display: "flex", gap: 8 }}>
            {renderValidConditionInput(cond, idx)}
            <Button
              onClick={() =>
                setTemplate((prev) => {
                  const list = getValidConditions(prev);
                  const updated = [...list];
                  updated.splice(idx, 1);
                  return { ...prev, validCondition: updated };
                })
              }
              icon={TrashIcon}
              title="Remove condition"
            />
          </div>
        ))}
        <DropdownMenu
          anchor={"Add condition"}
          data={SELECT_VALID_CONDITION}
          onSelect={(selected: SelectItem | null) => {
            if (!selected) {
              return;
            }
            const newCond = createValidCondition(selected.key as string);
            setTemplate((prev) => ({
              ...prev,
              validCondition: [...getValidConditions(prev), newCond],
            }));
          }}
        />
      </div>
      <div className="template-edit-field-panel">
        <Select
          clear
          selectedLabel={"Condition when template is added automatically"}
          size={Size.L}
          data={SELECT_ACTION_DATA}
          selected={SELECT_ACTION_DATA.find(
            (item) => item.key === (template?.addCondition?.when || "none"),
          )}
          onChange={onSelectAddCondition}
        />
        {template?.addCondition?.when === "field_becomes" && (
          <FieldConditionInput
            fields={projectFields}
            conditionType="add"
            template={template}
            setTemplate={setTemplate}
          />
        )}
        {template?.addCondition?.when === "tag_added" && (
          <TagConditionInput
            tags={projectTags}
            tagsLoading={tagsLoading}
            onFilter={onTagsFilter}
            onLoadMore={onTagsLoadMore}
            conditionType="add"
            template={template}
            setTemplate={setTemplate}
          />
        )}
      </div>
    </>
  );
};

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
  const [tagsLoading, setTagsLoading] = useState<boolean>(false);
  const [tagsHasMore, setTagsHasMore] = useState<boolean>(false);
  const tagsFilterRef = useRef<string>("");
  const tagsSkipRef = useRef<number>(0);
  const [editFailMessage, setEditFailMessage] = useState<FailMessage | null>(null);
  const [templateSnapshot, setTemplateSnapshot] = useState<Template>(template);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState<boolean>(false);

  // Keep a fresh snapshot when parent `template` changes and we're not editing.
  useEffect(() => {
    if (!editing) {
      setTemplateSnapshot(template);
    }
  }, [template, editing]);

  const fetchTags = useCallback(async (filter: string, reset: boolean) => {
    setTagsLoading(true);
    if (reset) {
      tagsSkipRef.current = 0;
      tagsFilterRef.current = filter;
    }
    try {
      const query: Record<string, unknown> = {
        fields: "name",
        $top: TAG_PAGE_SIZE,
        $skip: tagsSkipRef.current,
      };
      if (filter) {
        query.query = filter;
      }
      const result = await host.fetchYouTrack<Array<{ name: string }>>(`tags`, { query });
      const newTags = result.map((tag) => ({ name: tag.name }));
      setProjectTags((prev) => (reset ? newTags : [...prev, ...newTags]));
      setTagsHasMore(result.length === TAG_PAGE_SIZE);
      tagsSkipRef.current += result.length;
    } finally {
      setTagsLoading(false);
    }
  }, []);

  const onTagsFilter = useCallback(
    (filter: string) => {
      fetchTags(filter, true);
    },
    [fetchTags],
  );

  const onTagsLoadMore = useCallback(() => {
    if (!tagsLoading && tagsHasMore) {
      fetchTags(tagsFilterRef.current, false);
    }
  }, [fetchTags, tagsLoading, tagsHasMore]);

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
        console.log("Project info", result);
        const fields = [...result.enumFields, ...result.stateFields];
        setProjectFields(fields);
      });
    fetchTags("", true);
  }, [fetchTags]);

  const addOrUpdateTemplate = async (templateToStore: Template) => {
    if (templateToStore.name.trim() === "") {
      setEditFailMessage({ mode: "error", message: "Template name is required." });
      return;
    }
    if (templateToStore.articleId.trim() === "") {
      setEditFailMessage({ mode: "error", message: "Template article is required." });
      return;
    }
    if (getValidConditions(templateToStore).length === 0) {
      setEditFailMessage({
        mode: "error",
        message: "Template missing valid conditions, please define when valid.",
      });
      return;
    }

    const result = await host.fetchApp<{
      success: boolean;
      message?: string;
      templates?: Array<Template>;
    }>("backend/addTemplate", {
      scope: true,
      method: "POST",
      body: { template: templateToStore },
    });
    console.log("Add template result", result);
    if (result.success) {
      setEditFailMessage({ mode: "success", message: "Template stored successfully." });
      setIsDraft(false);
      setEditing(false);
      // Saved, store snapshot.
      setTemplateSnapshot(templateToStore);
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

  const removeTemplate = async (templateToRemove: Template) => {
    if (templateToRemove.id.trim() === "") {
      setEditFailMessage({ mode: "error", message: "Template has no id, cannot remove." });
      return;
    }
    const result = await host.fetchApp<{
      success: boolean;
      message?: string;
      templates?: Array<Template>;
    }>("backend/removeTemplate", {
      scope: true,
      method: "DELETE",
      body: { id: templateToRemove.id },
    });
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
  }, [isDraft, templateSnapshot, setTemplate, setIsDraft, setEditing]);

  const templateArticleSelectItems = useMemo(
    () => getTemplateArticleSelectItems(templateArticles),
    [templateArticles],
  );

  return (
    <div className="template-edit">
      {editing ? (
        <TemplateEditForm
          template={template}
          setTemplate={setTemplate}
          templateArticleSelectItems={templateArticleSelectItems}
          projectFields={projectFields}
          projectTags={projectTags}
          tagsLoading={tagsLoading}
          onTagsFilter={onTagsFilter}
          onTagsLoadMore={onTagsLoadMore}
        />
      ) : (
        <TemplateView template={template} templateArticleSelectItems={templateArticleSelectItems}/>
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
          <Button onClick={() => setConfirmRemoveOpen(true)} icon={TrashIcon} danger>
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
      {editing && !isDraft && (
        <Confirm
          show={confirmRemoveOpen}
          text="Remove template?"
          description={`Are you sure you want to remove template "${template.name}"?`}
          onReject={() => setConfirmRemoveOpen(false)}
          onConfirm={() => removeTemplate(template)}
          confirmLabel="Remove template"
          rejectLabel="Cancel"
        />
      )}
    </div>
  );
};

export default TemplateEdit;
