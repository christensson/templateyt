import AddIcon from "@jetbrains/icons/add-12px";
import ArrowLeftIcon from "@jetbrains/icons/arrow-left";
import ArticleIcon from "@jetbrains/icons/article";
import ArrowDownIcon from "@jetbrains/icons/chevron-down";
import ArrowUpIcon from "@jetbrains/icons/chevron-up";
import ImportIcon from "@jetbrains/icons/download";
import RelationIcon from "@jetbrains/icons/link-12px";
import FieldIcon from "@jetbrains/icons/settings-12px";
import TagIcon from "@jetbrains/icons/tag-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Checkbox from "@jetbrains/ring-ui-built/components/checkbox/checkbox";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useMemo, useState } from "react";
import type { ProjectFieldInfo, TagInfo } from "../../@types/project-info";
import {
  collectManualArticleIds,
  findChildByArticleId,
  formatChildAddConditions,
  formatTemplateField,
  formatTemplateTag,
  formatTemplateRelation,
  getChildAddConditions,
  getChildTemplates,
  getMoveTargets,
  getSiblingPosition,
  getTemplateFields,
  getTemplateTags,
  getTemplateRelations,
  insertManualChild,
  mergeImportedChildren,
  moveChild,
  moveChildUnder,
  removeChild,
  updateChildTemplate,
  type ChildTemplate,
  type FieldStateCondition,
  type ImportedArticle,
  type InsertedArticle,
  type Template,
} from "../../@types/template";
import FieldValueConditionInput from "./field-value-condition-input";
import type { TemplateArticleSelectItem } from "./template-article-select-items";
import TemplateFieldsPanel from "./template-fields-panel";
import TemplateRelationsPanel, { type IssueChecker } from "./template-relations-panel";
import TemplateTagsPanel from "./template-tags-panel";

export type ArticleTreeResponse = ImportedArticle & { success?: boolean; message?: string };

// Reads an article's title and child article tree; provided by the widget that owns the host.
export type ArticleTreeFetcher = (articleId: string) => Promise<ArticleTreeResponse>;

const ROOT_TARGET_KEY = "__template__";

interface InsertChildArticleProps {
  template: Template;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
  onInsert: (article: InsertedArticle) => void;
}

// Inserts a template article, picked from a filterable list, as a manually placed child template.
// Articles already in the hierarchy are left out.
export const InsertChildArticle: React.FunctionComponent<InsertChildArticleProps> = ({
  template,
  templateArticleSelectItems,
  onInsert,
}) => {
  const [selected, setSelected] = useState<TemplateArticleSelectItem | null>(null);
  const items = useMemo(
    () =>
      templateArticleSelectItems.filter(
        (item) =>
          item.templateArticleItem.articleId !== template.articleId &&
          findChildByArticleId(template, item.templateArticleItem.articleId) === null,
      ),
    [templateArticleSelectItems, template],
  );

  const insert = () => {
    if (selected === null) {
      return;
    }
    onInsert(selected.templateArticleItem);
    setSelected(null);
  };

  return (
    <div className="template-edit-field-panel">
      <div className="template-replacement-row">
        <Text size={Text.Size.M}>Insert article </Text>
        <Select
          filter
          clear
          size={Select.Size.M}
          label="Select template article..."
          data={items}
          selected={selected}
          onChange={(item: TemplateArticleSelectItem | null) => setSelected(item)}
        />
        <Button onClick={insert} disabled={selected === null} icon={AddIcon} inline>
          Insert as child template
        </Button>
      </div>
      {items.length === 0 && (
        <Text size={Text.Size.S} info>
          No other template articles available.
        </Text>
      )}
    </div>
  );
};

interface ChildAddConditionsPanelProps {
  child: ChildTemplate;
  editing: boolean;
  conditionFields: Array<ProjectFieldInfo>;
  onChange: (conditions: Array<FieldStateCondition>) => void;
}

// Conditions on the root ticket that decide whether the child template is created.
const ChildAddConditionsPanel: React.FunctionComponent<ChildAddConditionsPanelProps> = ({
  child,
  editing,
  conditionFields,
  onChange,
}) => {
  const conditions = getChildAddConditions(child);
  const updateCondition = (idx: number, fieldName: string, fieldValue: string) =>
    onChange(
      conditions.map((cond, index) =>
        index === idx ? { when: "field_is", fieldName, fieldValue } : cond,
      ),
    );
  const removeCondition = (idx: number) =>
    onChange(conditions.filter((_, index) => index !== idx));
  const addCondition = () =>
    onChange([...conditions, { when: "field_is", fieldName: "", fieldValue: "" }]);

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        Conditions on the root ticket for adding this child template (any matches)
      </Text>
      <Text size={Text.Size.S} info>
        The root ticket is the ticket the hierarchy is created from. Without conditions the child
        template is always added. Children of a skipped child template are skipped too.
      </Text>
      {!editing && <Text size={Text.Size.M}>{formatChildAddConditions(child)}</Text>}
      {editing && conditions.length === 0 && (
        <Text size={Text.Size.M}>No conditions, always added.</Text>
      )}
      {editing &&
        conditions.map((cond, idx) => (
          // Conditions have no identity of their own and the inputs are fully controlled by
          // `conditions`, so the position is the only stable key.
          // eslint-disable-next-line react/no-array-index-key
          <div key={`child-add-cond-${idx}`} style={{ display: "flex", gap: 8 }}>
            <FieldValueConditionInput
              fields={conditionFields}
              fieldName={cond.fieldName}
              fieldValue={cond.fieldValue}
              onChange={(fieldName, fieldValue) => updateCondition(idx, fieldName, fieldValue)}
              whenTitle="When root ticket field"
              verb="is"
            />
            <Button onClick={() => removeCondition(idx)} icon={TrashIcon} title="Remove condition"/>
          </div>
        ))}
      {editing && (
        <div>
          <Button onClick={addCondition} icon={AddIcon} inline>
            Add condition
          </Button>
        </div>
      )}
    </div>
  );
};

interface ChildPositionPanelProps {
  template: Template;
  child: ChildTemplate;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  onRemoved: () => void;
}

// Moving and removing a manually inserted child template.
const ChildPositionPanel: React.FunctionComponent<ChildPositionPanelProps> = ({
  template,
  child,
  setTemplate,
  onRemoved,
}) => {
  if (!child.manual) {
    return (
      <div className="template-edit-field-panel">
        <Text size={Text.Size.S} info>
          Position
        </Text>
        <Text size={Text.Size.M}>
          Follows the article hierarchy. Re-import the child articles to refresh it.
        </Text>
      </div>
    );
  }
  const position = getSiblingPosition(template, child.id);
  const targets = getMoveTargets(template, child.id).map((target) => ({
    key: target.id ?? ROOT_TARGET_KEY,
    label: target.label,
  }));
  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        Position
      </Text>
      <div className="template-replacement-row">
        <Button
          icon={ArrowUpIcon}
          disabled={position === null || position.index <= 0}
          onClick={() => setTemplate((prev) => moveChild(prev, child.id, -1))}
          inline
        >
          Move up
        </Button>
        <Button
          icon={ArrowDownIcon}
          disabled={position === null || position.index >= position.count - 1}
          onClick={() => setTemplate((prev) => moveChild(prev, child.id, 1))}
          inline
        >
          Move down
        </Button>
        <Select
          label="Move under..."
          type={Select.Type.INLINE}
          size={Select.Size.AUTO}
          data={targets}
          selected={null}
          onSelect={(item: SelectItem | null) => {
            if (item) {
              const key = String(item.key);
              setTemplate((prev) =>
                moveChildUnder(prev, child.id, key === ROOT_TARGET_KEY ? null : key),
              );
            }
          }}
        />
        <Button
          icon={TrashIcon}
          danger
          onClick={() => {
            setTemplate((prev) => removeChild(prev, child.id));
            onRemoved();
          }}
          inline
        >
          Remove child template
        </Button>
      </div>
    </div>
  );
};

interface ChildArticlesPanelProps {
  template: Template;
  child: ChildTemplate;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  fetchArticleTree: ArticleTreeFetcher;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
}

// Inserting articles below this child template and, for manually inserted ones, importing the
// child articles of their article. Imported nodes get their children from the root import.
const ChildArticlesPanel: React.FunctionComponent<ChildArticlesPanelProps> = ({
  template,
  child,
  setTemplate,
  fetchArticleTree,
  templateArticleSelectItems,
}) => {
  const [importing, setImporting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const childCount = getChildTemplates(child).length;

  const importChildren = async () => {
    setImporting(true);
    setMessage("");
    try {
      const result = await fetchArticleTree(child.articleId);
      if (result.success === false) {
        setMessage(result.message || "Failed to import child articles.");
        return;
      }
      setTemplate((prev) =>
        updateChildTemplate(prev, child.id, (current) => ({
          ...current,
          children: mergeImportedChildren(
            getChildTemplates(current),
            result.children,
            collectManualArticleIds(prev),
          ),
        })),
      );
      setMessage("Child articles imported.");
    } catch (error) {
      console.error("Failed to import child articles", error);
      setMessage("Failed to import child articles.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        Child templates below this one
      </Text>
      <Text size={Text.Size.M}>
        {childCount === 0 ? "None." : `${childCount} direct child template${childCount === 1 ? "" : "s"}.`}
      </Text>
      {child.manual && (
        <div>
          <Button
            onClick={importChildren}
            disabled={importing}
            loader={importing}
            icon={ImportIcon}
            inline
          >
            Import child articles of {child.articleId}
          </Button>
        </div>
      )}
      {!child.manual && (
        <Text size={Text.Size.S} info>
          Imported child templates get their child articles from the import at the template.
        </Text>
      )}
      {message && (
        <Text size={Text.Size.S} info>
          {message}
        </Text>
      )}
      <InsertChildArticle
        template={template}
        templateArticleSelectItems={templateArticleSelectItems}
        onInsert={(article) => setTemplate((prev) => insertManualChild(prev, child.id, article))}
      />
    </div>
  );
};

interface ChildTemplateEditProps {
  template: Template;
  child: ChildTemplate;
  editing: boolean;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  projectFields: Array<ProjectFieldInfo>;
  conditionFields: Array<ProjectFieldInfo>;
  fetchArticleTree: ArticleTreeFetcher;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
  projectTags: Array<TagInfo>;
  tagsLoading: boolean;
  onTagsFilter: (filter: string) => void;
  onTagsLoadMore: () => void;
  linkNames: Array<string>;
  checkIssue: IssueChecker;
  onBack: () => void;
}

// Configuration of one child template of a hierarchical template: name, conditions,
// inheritance, fields, position and its own child templates.
const ChildTemplateEdit: React.FunctionComponent<ChildTemplateEditProps> = ({
  template,
  child,
  editing,
  setTemplate,
  projectFields,
  conditionFields,
  fetchArticleTree,
  templateArticleSelectItems,
  projectTags,
  tagsLoading,
  onTagsFilter,
  onTagsLoadMore,
  linkNames,
  checkIssue,
  onBack,
}) => {
  const update = (updater: (prev: ChildTemplate) => ChildTemplate) =>
    setTemplate((prev) => updateChildTemplate(prev, child.id, updater));
  const childFields = getTemplateFields(child);
  const childTags = getTemplateTags(child);
  const childRelations = getTemplateRelations(child);

  return (
    <>
      <div>
        <Button icon={ArrowLeftIcon} inline onClick={onBack}>
          Back to template {template.name}
        </Button>
      </div>
      <Text size={Text.Size.S} info>
        {child.manual ? "Child template (inserted manually)" : "Child template (imported)"}
      </Text>
      {editing ? (
        <Input
          label="Child template name (subtask summary)"
          value={child.name}
          onChange={(e) => update((prev) => ({ ...prev, name: e.target.value }))}
          size={Size.M}
        />
      ) : (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Child template name (subtask summary)
          </Text>
          <Text size={Text.Size.M}>{child.name}</Text>
        </div>
      )}
      <div className="template-edit-field-panel">
        <Text size={Text.Size.S} info>
          Child article
        </Text>
        <Button href={`/articles/${child.articleId}`} target="_blank" icon={ArticleIcon}>
          Open {child.articleId}
        </Button>
      </div>
      <ChildAddConditionsPanel
        child={child}
        editing={editing}
        conditionFields={conditionFields}
        onChange={(addConditions) => update((prev) => ({ ...prev, addConditions }))}
      />
      <div className="template-edit-field-panel">
        {editing ? (
          <>
            <Checkbox
              label="Inherit fields from parent"
              checked={child.inheritParentFields}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const inheritParentFields = e.target.checked;
                update((prev) => ({ ...prev, inheritParentFields }));
              }}
            />
            <Checkbox
              label="Inherit fields from root ticket"
              checked={child.inheritRootFields}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const inheritRootFields = e.target.checked;
                update((prev) => ({ ...prev, inheritRootFields }));
              }}
            />
          </>
        ) : (
          <>
            <Text size={Text.Size.M}>
              {child.inheritParentFields
                ? "Inherits fields from parent."
                : "Does not inherit fields from parent."}
            </Text>
            <Text size={Text.Size.M}>
              {child.inheritRootFields
                ? "Inherits fields from root ticket."
                : "Does not inherit fields from root ticket."}
            </Text>
          </>
        )}
        <Text size={Text.Size.S} info>
          Inherited fields are the fields configured by the parent template (copied from the parent
          ticket) or by the root template (copied from the root ticket) when the hierarchy is
          created. Precedence: own fields, then the closest parent, then the root ticket. Fields,
          inheritance and add conditions only apply to ticket hierarchies, not to articles.
        </Text>
      </div>
      {editing ? (
        <TemplateFieldsPanel
          title="Ticket fields set by child template"
          fields={childFields}
          onFieldsChange={(fields) => update((prev) => ({ ...prev, fields }))}
          projectFields={projectFields}
          addCondition={null}
        />
      ) : (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Ticket fields set by child template
          </Text>
          {childFields.length === 0 && <Text size={Text.Size.M}>No fields set.</Text>}
          {childFields.map((field) => (
            <Text size={Text.Size.M} key={`child-field-text-${field.fieldName}`}>
              <Icon glyph={FieldIcon}/> {formatTemplateField(field, true)}
            </Text>
          ))}
        </div>
      )}
      {editing ? (
        <TemplateTagsPanel
          title="Tags added by child template"
          tags={childTags}
          onTagsChange={(tags) => update((prev) => ({ ...prev, tags }))}
          projectTags={projectTags}
          tagsLoading={tagsLoading}
          onTagsFilter={onTagsFilter}
          onTagsLoadMore={onTagsLoadMore}
        />
      ) : (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Tags added by child template
          </Text>
          {childTags.length === 0 && <Text size={Text.Size.M}>No tags set.</Text>}
          {childTags.map((tag) => (
            <Text size={Text.Size.M} key={`child-tag-text-${tag}`}>
              <Icon glyph={TagIcon}/> {formatTemplateTag(tag)}
            </Text>
          ))}
        </div>
      )}
      {editing ? (
        <TemplateRelationsPanel
          title="Relations added by child template"
          template={template}
          ownerChildId={child.id}
          relations={childRelations}
          onRelationsChange={(relations) => update((prev) => ({ ...prev, relations }))}
          linkNames={linkNames}
          checkIssue={checkIssue}
          hint="Relations are added when the hierarchy is created. Relations to subtasks that are not created are skipped."
        />
      ) : (
        <div className="template-edit-field-panel">
          <Text size={Text.Size.S} info>
            Relations added by child template
          </Text>
          {childRelations.length === 0 && <Text size={Text.Size.M}>No relations set.</Text>}
          {childRelations.map((relation, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text size={Text.Size.M} key={`child-relation-text-${idx}`}>
              <Icon glyph={RelationIcon}/> {formatTemplateRelation(relation, template)}
            </Text>
          ))}
        </div>
      )}
      {editing && (
        <ChildPositionPanel
          template={template}
          child={child}
          setTemplate={setTemplate}
          onRemoved={onBack}
        />
      )}
      {editing && (
        <ChildArticlesPanel
          template={template}
          child={child}
          setTemplate={setTemplate}
          fetchArticleTree={fetchArticleTree}
          templateArticleSelectItems={templateArticleSelectItems}
        />
      )}
    </>
  );
};

export default ChildTemplateEdit;
