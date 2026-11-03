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
  formatTemplateTargetNoun,
  formatTemplateRelation,
  getChildAddConditions,
  getChildTemplates,
  getMoveTargets,
  getSiblingPosition,
  getTemplateFields,
  getTemplateTags,
  getTemplateRelations,
  getTicketFeatureAvailability,
  insertManualChild,
  mergeImportedChildren,
  moveChild,
  moveChildUnder,
  removeChild,
  SUBTASKS_ONLY_HINT,
  updateChildTemplate,
  validateChildTemplate,
  type ChildTemplate,
  type FieldStateCondition,
  type ImportedArticle,
  type InsertedArticle,
  type Template,
  type TemplateSection as TemplateSectionKey,
  type TicketFeatureAvailability,
} from "../../@types/template";
import { OtherProjectNote } from "./cross-project-warning";
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
  const ticketFeatures = getTicketFeatureAvailability(template);
  // Fields and relations cannot be configured for sub-articles, so they are not listed as "not
  // configured" for article-only templates.
  const kinds: Array<[string, number]> = [
    ...(ticketFeatures !== "unavailable" || fields.length > 0
      ? [["fields", fields.length] as [string, number]]
      : []),
    ["tags", tags.length],
    ...(ticketFeatures !== "unavailable" || relations.length > 0
      ? [["relations", relations.length] as [string, number]]
      : []),
  ];
  const suffix = ticketFeatures === "allowed" ? "" : " (subtasks only)";
  const notConfigured = kinds.filter(([, count]) => count === 0).map(([name]) => name);
  return (
    <>
      {fields.length > 0 && (
        <ChildLabeledValue label={`Ticket fields${suffix}`}>
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
              <Icon glyph={TagIcon}/> {formatTemplateTag(tag, formatTemplateTargetNoun(template, true))}
            </Text>
          ))}
        </ChildLabeledValue>
      )}
      {relations.length > 0 && (
        <ChildLabeledValue label={`Relations${suffix}`}>
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

const ARTICLE_CHILD_NOTE = "Sub-articles get the template's text replacements and their own tags.";

// Hint for a subtask-only setting: marked when the template is also for articles, or asking to
// remove leftovers when it is only for articles.
const getSubtaskOnlyHint = (
  ticketFeatures: TicketFeatureAvailability,
  what: string,
): string | undefined => {
  if (ticketFeatures === "marked") {
    return SUBTASKS_ONLY_HINT;
  }
  return ticketFeatures === "unavailable"
    ? `Not available for sub-articles: remove these ${what}, or make the template available for tickets.`
    : undefined;
};

interface ChildWhenSectionProps {
  child: ChildTemplate;
  editing: boolean;
  conditionFields: Array<ProjectFieldInfo>;
  ticketFeatures: TicketFeatureAvailability;
  onChange: (addConditions: Array<FieldStateCondition>) => void;
}

// When a child template is created: conditions on root ticket fields, which only apply to subtasks.
const ChildWhenSection: React.FunctionComponent<ChildWhenSectionProps> = ({
  child,
  editing,
  conditionFields,
  ticketFeatures,
  onChange,
}) => {
  const hasConditions = getChildAddConditions(child).length > 0;
  if (ticketFeatures === "unavailable" && !hasConditions) {
    return (
      <Text size={Text.Size.M}>
        Sub-articles are always created; conditions on ticket fields only apply to subtasks.
      </Text>
    );
  }
  const hint = getSubtaskOnlyHint(ticketFeatures, "conditions");
  return (
    <>
      <ChildAddConditionsPanel
        child={child}
        editing={editing}
        conditionFields={conditionFields}
        onChange={onChange}
      />
      {hint && (
        <Text size={Text.Size.S} info>
          {hint}
        </Text>
      )}
    </>
  );
};

interface ChildInheritanceProps {
  child: ChildTemplate;
  editing: boolean;
  ticketFeatures: TicketFeatureAvailability;
  update: (updater: (prev: ChildTemplate) => ChildTemplate) => void;
}

// Field inheritance of a child template; subtasks only.
const ChildInheritance: React.FunctionComponent<ChildInheritanceProps> = ({
  child,
  editing,
  ticketFeatures,
  update,
}) => {
  const inherits = child.inheritParentFields || child.inheritRootFields;
  if (ticketFeatures === "unavailable" && !inherits) {
    return null;
  }
  const hint = getSubtaskOnlyHint(ticketFeatures, "settings");
  return (
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
            Copies the values of the fields the parent or root template sets. See Help for
            precedence.{hint ? ` ${hint}` : ""}
          </Text>
        </>
      ) : (
        <Text size={Text.Size.M}>{formatInheritance(child)}</Text>
      )}
    </ChildLabeledValue>
  );
};

interface ChildEffectsEditProps {
  template: Template;
  child: ChildTemplate;
  ticketFeatures: TicketFeatureAvailability;
  update: (updater: (prev: ChildTemplate) => ChildTemplate) => void;
  projectFields: Array<ProjectFieldInfo>;
  projectTags: Array<TagInfo>;
  tagsLoading: boolean;
  onTagsFilter: (filter: string) => void;
  onTagsLoadMore: () => void;
  linkNames: Array<string>;
  checkIssue: IssueChecker;
}

// Editable fields, tags and relations of a child template. Fields and relations only apply to
// subtasks: for article-only templates they are shown only to remove leftovers.
const ChildEffectsEdit: React.FunctionComponent<ChildEffectsEditProps> = ({
  template,
  child,
  ticketFeatures,
  update,
  projectFields,
  projectTags,
  tagsLoading,
  onTagsFilter,
  onTagsLoadMore,
  linkNames,
  checkIssue,
}) => {
  const childFields = getTemplateFields(child);
  const childRelations = getTemplateRelations(child);
  const unavailable = ticketFeatures === "unavailable";
  return (
    <>
      {unavailable && <Text size={Text.Size.S} info>{ARTICLE_CHILD_NOTE}</Text>}
      {(!unavailable || childFields.length > 0) && (
        <TemplateFieldsPanel
          title="Ticket fields"
          fields={childFields}
          onFieldsChange={(fields) => update((prev) => ({ ...prev, fields }))}
          projectFields={projectFields}
          addCondition={null}
          hint={getSubtaskOnlyHint(ticketFeatures, "fields")}
        />
      )}
      <TemplateTagsPanel
        title="Tags"
        tags={getTemplateTags(child)}
        onTagsChange={(tags) => update((prev) => ({ ...prev, tags }))}
        projectTags={projectTags}
        tagsLoading={tagsLoading}
        onTagsFilter={onTagsFilter}
        onTagsLoadMore={onTagsLoadMore}
      />
      {(!unavailable || childRelations.length > 0) && (
        <TemplateRelationsPanel
          title="Relations"
          template={template}
          ownerChildId={child.id}
          relations={childRelations}
          onRelationsChange={(relations) => update((prev) => ({ ...prev, relations }))}
          linkNames={linkNames}
          checkIssue={checkIssue}
          hint={[
            "Relations to subtasks that are not created are skipped.",
            getSubtaskOnlyHint(ticketFeatures, "relations"),
          ].filter(Boolean).join(" ")}
        />
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
  const childCount = getChildTemplates(child).length;
  const ticketFeatures = getTicketFeatureAvailability(template);
  const nameLabel = {
    allowed: "Name (subtask summary)",
    marked: "Name (subtask summary or sub-article title)",
    unavailable: "Name (sub-article title)",
  }[ticketFeatures];
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
            label={nameLabel}
            value={child.name}
            onChange={(e) => update((prev) => ({ ...prev, name: e.target.value }))}
            size={Size.L}
          />
        ) : (
          <ChildLabeledValue label={nameLabel}>
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
          <OtherProjectNote articleId={child.articleId}/>
        </ChildLabeledValue>
      </TemplateSection>
      <TemplateSection title="When created" hasError={hasError("when")}>
        <ChildWhenSection
          child={child}
          editing={editing}
          conditionFields={conditionFields}
          ticketFeatures={ticketFeatures}
          onChange={(addConditions) => update((prev) => ({ ...prev, addConditions }))}
        />
      </TemplateSection>
      <TemplateSection title="What it does" hasError={hasError("effects")}>
        <ChildInheritance
          child={child}
          editing={editing}
          ticketFeatures={ticketFeatures}
          update={update}
        />
        {editing ? (
          <ChildEffectsEdit
            template={template}
            child={child}
            ticketFeatures={ticketFeatures}
            update={update}
            projectFields={projectFields}
            projectTags={projectTags}
            tagsLoading={tagsLoading}
            onTagsFilter={onTagsFilter}
            onTagsLoadMore={onTagsLoadMore}
            linkNames={linkNames}
            checkIssue={checkIssue}
          />
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
