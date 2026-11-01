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
  validateChildTemplate,
  type ChildTemplate,
  type FieldStateCondition,
  type ImportedArticle,
  type InsertedArticle,
  type Template,
  type TemplateSection as TemplateSectionKey,
} from "../../@types/template";
import FieldValueConditionInput from "./field-value-condition-input";
import type { TemplateArticleSelectItem } from "./template-article-select-items";
import TemplateFieldsPanel from "./template-fields-panel";
import TemplateRelationsPanel, { type IssueChecker } from "./template-relations-panel";
import TemplateSection from "./template-section";
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
  const items = useMemo(
    () =>
      templateArticleSelectItems.filter(
        (item) =>
          item.templateArticleItem.articleId !== template.articleId &&
          findChildByArticleId(template, item.templateArticleItem.articleId) === null,
      ),
    [templateArticleSelectItems, template],
  );

  return (
    <div className="template-edit-field-panel">
      <div className="template-add-row">
        <Icon glyph={AddIcon} className="template-add-row-icon"/>
        <Select
          key={`insert-article-${items.length}`}
          filter
          type={Select.Type.INLINE}
          size={Select.Size.AUTO}
          label="Insert article as child template"
          data={items}
          selected={null}
          onChange={(item: TemplateArticleSelectItem | null) => {
            if (item !== null) {
              onInsert(item.templateArticleItem);
            }
          }}
        />
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
        Created when any of these match the root ticket (the ticket the hierarchy is created from)
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
          Follows the article tree; re-import at the template to refresh.
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

interface ChildLabeledValueProps {
  label: string;
  children: React.ReactNode;
}

const ChildLabeledValue: React.FunctionComponent<ChildLabeledValueProps> = ({ label, children }) => (
  <div className="template-edit-field-panel">
    <Text size={Text.Size.S} info>
      {label}
    </Text>
    {children}
  </div>
);

const formatInheritance = (child: ChildTemplate): string => {
  if (child.inheritParentFields && child.inheritRootFields) {
    return "From the parent and the root ticket.";
  }
  if (child.inheritParentFields) {
    return "From the parent.";
  }
  if (child.inheritRootFields) {
    return "From the root ticket.";
  }
  return "None.";
};

interface ChildEffectsViewProps {
  template: Template;
  child: ChildTemplate;
}

// Read-only fields, tags and relations of a child template; lists only configured kinds.
const ChildEffectsView: React.FunctionComponent<ChildEffectsViewProps> = ({ template, child }) => {
  const fields = getTemplateFields(child);
  const tags = getTemplateTags(child);
  const relations = getTemplateRelations(child);
  const kinds: Array<[string, number]> = [
    ["fields", fields.length],
    ["tags", tags.length],
    ["relations", relations.length],
  ];
  const notConfigured = kinds.filter(([, count]) => count === 0).map(([name]) => name);
  return (
    <>
      {fields.length > 0 && (
        <ChildLabeledValue label="Ticket fields">
          {fields.map((field) => (
            <Text size={Text.Size.M} key={`child-field-text-${field.fieldName}`}>
              <Icon glyph={FieldIcon}/> {formatTemplateField(field, true)}
            </Text>
          ))}
        </ChildLabeledValue>
      )}
      {tags.length > 0 && (
        <ChildLabeledValue label="Tags">
          {tags.map((tag) => (
            <Text size={Text.Size.M} key={`child-tag-text-${tag}`}>
              <Icon glyph={TagIcon}/> {formatTemplateTag(tag)}
            </Text>
          ))}
        </ChildLabeledValue>
      )}
      {relations.length > 0 && (
        <ChildLabeledValue label="Relations">
          {relations.map((relation, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text size={Text.Size.M} key={`child-relation-text-${idx}`}>
              <Icon glyph={RelationIcon}/> {formatTemplateRelation(relation, template)}
            </Text>
          ))}
        </ChildLabeledValue>
      )}
      {notConfigured.length > 0 && (
        <Text size={Text.Size.S} info>
          Not configured: {notConfigured.join(", ")}.
        </Text>
      )}
    </>
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
  // Show the child template's problems (after the user tried to save).
  showErrors: boolean;
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
  showErrors,
}) => {
  const update = (updater: (prev: ChildTemplate) => ChildTemplate) =>
    setTemplate((prev) => updateChildTemplate(prev, child.id, updater));
  const childFields = getTemplateFields(child);
  const childTags = getTemplateTags(child);
  const childRelations = getTemplateRelations(child);
  const childCount = getChildTemplates(child).length;
  // Problems are shown once the user tried to save, like those of the template itself.
  const errors = showErrors ? validateChildTemplate(template, child) : [];
  const hasError = (section: TemplateSectionKey) => errors.some((error) => error.section === section);

  return (
    <>
      <div>
        <Button icon={ArrowLeftIcon} inline onClick={onBack}>
          {template.name.trim() || "New template"}
        </Button>
      </div>
      <TemplateSection title="General" hasError={hasError("general")}>
        {editing ? (
          <Input
            label="Name (subtask summary)"
            value={child.name}
            onChange={(e) => update((prev) => ({ ...prev, name: e.target.value }))}
            size={Size.L}
          />
        ) : (
          <ChildLabeledValue label="Name (subtask summary)">
            <Text size={Text.Size.M}>{child.name}</Text>
          </ChildLabeledValue>
        )}
        <ChildLabeledValue
          label={child.manual ? "Article (inserted manually)" : "Article (imported from the article tree)"}
        >
          <div>
            <Button href={`/articles/${child.articleId}`} target="_blank" icon={ArticleIcon} inline>
              Open {child.articleId}
            </Button>
          </div>
        </ChildLabeledValue>
      </TemplateSection>
      <TemplateSection title="When created" hasError={hasError("when")}>
        <ChildAddConditionsPanel
          child={child}
          editing={editing}
          conditionFields={conditionFields}
          onChange={(addConditions) => update((prev) => ({ ...prev, addConditions }))}
        />
      </TemplateSection>
      <TemplateSection title="What it does" hasError={hasError("effects")}>
        <ChildLabeledValue label="Inherited fields">
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
              <Text size={Text.Size.S} info>
                Copies the values of the fields the parent or root template sets. Tickets only; see
                Help for precedence.
              </Text>
            </>
          ) : (
            <Text size={Text.Size.M}>{formatInheritance(child)}</Text>
          )}
        </ChildLabeledValue>
        {editing ? (
          <>
            <TemplateFieldsPanel
              title="Ticket fields"
              fields={childFields}
              onFieldsChange={(fields) => update((prev) => ({ ...prev, fields }))}
              projectFields={projectFields}
              addCondition={null}
            />
            <TemplateTagsPanel
              title="Tags"
              tags={childTags}
              onTagsChange={(tags) => update((prev) => ({ ...prev, tags }))}
              projectTags={projectTags}
              tagsLoading={tagsLoading}
              onTagsFilter={onTagsFilter}
              onTagsLoadMore={onTagsLoadMore}
            />
            <TemplateRelationsPanel
              title="Relations"
              template={template}
              ownerChildId={child.id}
              relations={childRelations}
              onRelationsChange={(relations) => update((prev) => ({ ...prev, relations }))}
              linkNames={linkNames}
              checkIssue={checkIssue}
              hint="Relations to subtasks that are not created are skipped."
            />
          </>
        ) : (
          <ChildEffectsView template={template} child={child}/>
        )}
      </TemplateSection>
      <TemplateSection title="Position and child templates">
        {editing ? (
          <>
            <ChildPositionPanel
              template={template}
              child={child}
              setTemplate={setTemplate}
              onRemoved={onBack}
            />
            <ChildArticlesPanel
              template={template}
              child={child}
              setTemplate={setTemplate}
              fetchArticleTree={fetchArticleTree}
              templateArticleSelectItems={templateArticleSelectItems}
            />
          </>
        ) : (
          <Text size={Text.Size.M}>
            {child.manual ? "Inserted manually." : "Follows the article tree."}{" "}
            {childCount === 0
              ? "No child templates below this one."
              : `${childCount} direct child template${childCount === 1 ? "" : "s"} below this one.`}
          </Text>
        )}
      </TemplateSection>
    </>
  );
};

export default ChildTemplateEdit;
