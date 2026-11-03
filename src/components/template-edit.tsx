import AddIcon from "@jetbrains/icons/add-12px";
import ArticleIcon from "@jetbrains/icons/article";
import ConditionIcon from "@jetbrains/icons/buildType-12px";
import CodeIcon from "@jetbrains/icons/code";
import CopyIcon from "@jetbrains/icons/copy";
import ImportIcon from "@jetbrains/icons/download";
import RelationIcon from "@jetbrains/icons/link-12px";
import MoreOptionsIcon from "@jetbrains/icons/more-options";
import EditIcon from "@jetbrains/icons/pencil";
import ReplaceIcon from "@jetbrains/icons/pencil-12px";
import FieldIcon from "@jetbrains/icons/settings-12px";
import TagIcon from "@jetbrains/icons/tag-12px";
import TrashIcon from "@jetbrains/icons/trash";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Checkbox from "@jetbrains/ring-ui-built/components/checkbox/checkbox";
import Confirm from "@jetbrains/ring-ui-built/components/confirm/confirm";
import DropdownMenu from "@jetbrains/ring-ui-built/components/dropdown-menu/dropdown-menu";
import { H2 } from "@jetbrains/ring-ui-built/components/heading/heading";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import Radio from "@jetbrains/ring-ui-built/components/radio/radio";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isConditionField, type ProjectFieldInfo, type TagInfo } from "../../@types/project-info";
import {
  addConditionForKey,
  collectManualArticleIds,
  createNullTemplate,
  duplicateTemplate,
  findChildTemplate,
  flattenChildTemplates,
  formatAddCondition,
  formatReplacement,
  formatTemplateField,
  formatTemplateTag,
  formatTemplateTargetNoun,
  formatTemplateRelation,
  formatValidCondition,
  getAddConditionKey,
  getChildTemplates,
  getTemplateFields,
  getTemplateTags,
  getTemplateRelations,
  getRelationLinkNames,
  getTemplateReplacements,
  getValidConditions,
  insertManualChild,
  mergeImportedChildren,
  prepareTemplateForStore,
  type AddConditionKey,
  type ChildTemplate,
  type IssueLinkTypeInfo,
  type Template,
  type TemplateSection as TemplateSectionKey,
  type TemplateValidationError,
  type ValidCondition,
  getTicketFeatureAvailability,
  TICKETS_ONLY_HINT,
  type TicketFeatureAvailability,
} from "../../@types/template";
import type { TemplateArticle } from "../../@types/template-article";
import { addArticleTreeProjects } from "./article-projects";
import { CrossProjectWarning } from "./cross-project-warning";
import ChildTemplateEdit, {
  InsertChildArticle,
  type ArticleTreeFetcher,
  type ArticleTreeResponse,
} from "./child-template-edit";
import EntityTypeConditionInput from "./entity-type-condition-input";
import FieldConditionInput from "./field-condition-input";
import TagConditionInput from "./tag-condition-input";
import {
  getTemplateArticleSelectItems,
  type TemplateArticleSelectItem,
} from "./template-article-select-items";
import TemplateFieldsPanel from "./template-fields-panel";
import TemplateJsonDialog from "./template-json-dialog";
import TemplateRelationsPanel, { type IssueChecker } from "./template-relations-panel";
import TemplateReplacementsPanel from "./template-replacements-panel";
import TemplateSection from "./template-section";
import TemplateTagsPanel from "./template-tags-panel";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

// Reads an article's title and child article tree from the backend (project scope), recording
// the projects of the articles for the cross-project warning.
const fetchArticleTree: ArticleTreeFetcher = async (articleId) => {
  const result = await host.fetchApp<ArticleTreeResponse>("backend/getChildArticles", {
    scope: true,
    method: "POST",
    body: { articleId },
  });
  if (result.success !== false) {
    addArticleTreeProjects(result);
  }
  return result;
};

interface ArticleAccessErrorProps {
  articleId: string;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
}

// Shown when the stored template article is not among the articles the user may read, so the
// template cannot be saved until another article is selected.
const ArticleAccessError: React.FunctionComponent<ArticleAccessErrorProps> = ({
  articleId,
  templateArticleSelectItems,
}) =>
  articleId &&
  templateArticleSelectItems.length > 0 &&
  !templateArticleSelectItems.some((item) => item.key === articleId) ? (
    <Banner mode="error" withIcon title="Template article not accessible">
      Template article {articleId} is not a template article you can read. Select another article
      to save the template.
    </Banner>
  ) : null;

const TAG_PAGE_SIZE = 50;

// Transient confirmation in YouTrack; best effort, the result is already visible on the page.
const notify = (message: string) => {
  try {
    host.alert(message);
  } catch (error) {
    console.warn("Failed to show notification", error);
  }
};

const SELECT_VALID_CONDITION = [
  { key: "entity_is", label: "Ticket or article" },
  { key: "field_is", label: "Ticket field has a value" },
  { key: "tag_is", label: "Ticket or article has a tag" },
];

const ADD_CONDITION_OPTIONS: Array<{ key: AddConditionKey; label: string }> = [
  { key: "none", label: "Never, only from the Apply template menu" },
  { key: "field_becomes", label: "When a ticket field changes to a value" },
  { key: "tag_added", label: "When a ticket or article gets a tag" },
];

// Label of an automatic add option; the ticket field option is marked as tickets only when the
// template is (also) available for articles.
const formatAddConditionOption = (
  key: AddConditionKey,
  label: string,
  ticketFeatures: TicketFeatureAvailability,
): string => (key === "field_becomes" && ticketFeatures !== "allowed" ? `${label} (tickets only)` : label);

const ARTICLE_ONLY_NOTE =
  "Ticket fields and relations are not available: this template is only available for articles.";

// Hint for a ticket-only panel: marked when the template is also for articles, or asking to
// remove leftovers when it is only for articles.
const getTicketOnlyHint = (ticketFeatures: TicketFeatureAvailability, what: string): string | undefined => {
  if (ticketFeatures === "marked") {
    return TICKETS_ONLY_HINT;
  }
  return ticketFeatures === "unavailable"
    ? `Not available for articles: remove these ${what}, or make the template available for tickets.`
    : undefined;
};

const VALID_CONDITIONS_TITLE = "Available in the Apply template menu when any of these match";
const ADD_CONDITION_TITLE = "Apply automatically";

const createValidCondition = (key: string): ValidCondition => {
  if (key === "entity_is") {
    return { when: "entity_is", entityType: "issue" };
  }
  if (key === "field_is") {
    return { when: "field_is", fieldName: "", fieldValue: "" };
  }
  return { when: "tag_is", tagName: "" };
};

const hasSectionError = (errors: Array<TemplateValidationError>, section: TemplateSectionKey) =>
  errors.some((error) => error.section === section);

interface LabeledValueProps {
  label: string;
  children: React.ReactNode;
}

// Small grey label above its content, as used for every setting in the view.
const LabeledValue: React.FunctionComponent<LabeledValueProps> = ({ label, children }) => (
  <div className="template-edit-field-panel">
    <Text size={Text.Size.S} info>
      {label}
    </Text>
    {children}
  </div>
);

interface EffectsViewProps {
  template: Template;
}

// Read-only list of what a template does when applied; lists only configured kinds.
const EffectsView: React.FunctionComponent<EffectsViewProps> = ({ template }) => {
  const templateFields = getTemplateFields(template);
  const tags = getTemplateTags(template);
  const relations = getTemplateRelations(template);
  const replacements = getTemplateReplacements(template);
  const ticketFeatures = getTicketFeatureAvailability(template);
  // Fields and relations cannot be configured for article-only templates, so they are not
  // listed as "not configured" there.
  const kinds: Array<[string, number]> = [
    ...(ticketFeatures !== "unavailable" || templateFields.length > 0
      ? [["fields", templateFields.length] as [string, number]]
      : []),
    ["tags", tags.length],
    ...(ticketFeatures !== "unavailable" || relations.length > 0
      ? [["relations", relations.length] as [string, number]]
      : []),
    ["text replacements", replacements.length],
  ];
  const ticketOnlySuffix = ticketFeatures === "allowed" ? "" : " (tickets only)";
  const notConfigured = kinds.filter(([, count]) => count === 0).map(([name]) => name);

  return (
    <>
      {templateFields.length > 0 && (
        <LabeledValue label={`Ticket fields${ticketOnlySuffix}`}>
          {templateFields.map((field) => (
            <Text size={Text.Size.M} key={`field-text-${field.fieldName}`}>
              <Icon glyph={FieldIcon}/> {formatTemplateField(field, true)}
            </Text>
          ))}
        </LabeledValue>
      )}
      {tags.length > 0 && (
        <LabeledValue label="Tags">
          {tags.map((tag) => (
            <Text size={Text.Size.M} key={`tag-text-${tag}`}>
              <Icon glyph={TagIcon}/> {formatTemplateTag(tag, formatTemplateTargetNoun(template))}
            </Text>
          ))}
        </LabeledValue>
      )}
      {relations.length > 0 && (
        <LabeledValue label={`Relations${ticketOnlySuffix}`}>
          {relations.map((relation, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text size={Text.Size.M} key={`relation-text-${idx}`}>
              <Icon glyph={RelationIcon}/> {formatTemplateRelation(relation, template)}
            </Text>
          ))}
        </LabeledValue>
      )}
      {replacements.length > 0 && (
        <LabeledValue label="Text replacements">
          {replacements.map((replacement) => (
            <Text size={Text.Size.M} key={`replacement-text-${replacement.search}`}>
              <Icon glyph={ReplaceIcon}/> {formatReplacement(replacement)}
            </Text>
          ))}
        </LabeledValue>
      )}
      {notConfigured.length === kinds.length && (
        <Text size={Text.Size.M}>Only adds the template article content.</Text>
      )}
      {notConfigured.length > 0 && notConfigured.length < kinds.length && (
        <Text size={Text.Size.S} info>
          Not configured: {notConfigured.join(", ")}.
        </Text>
      )}
    </>
  );
};

interface TemplateViewProps {
  template: Template;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
}

// Read-only presentation of a template, grouped like the edit form.
const TemplateView: React.FunctionComponent<TemplateViewProps> = ({
  template,
  templateArticleSelectItems,
}) => {
  const validConditions = getValidConditions(template);
  const childCount = flattenChildTemplates(getChildTemplates(template)).length;

  return (
    <>
      <TemplateSection title="General">
        <LabeledValue label="Template article">
          <Text size={Text.Size.M}>
            {templateArticleSelectItems.find((item) => item.key === template?.articleId)?.label ||
              "Not set"}
          </Text>
          {template?.articleId && (
            <div>
              <Button href={`/articles/${template.articleId}`} target="_blank" icon={ArticleIcon} inline>
                Open {template.articleId}
              </Button>
            </div>
          )}
        </LabeledValue>
        <CrossProjectWarning template={template}/>
      </TemplateSection>
      <TemplateSection title="When to use">
        <LabeledValue label={VALID_CONDITIONS_TITLE}>
          {validConditions.length === 0 ? (
            <Text size={Text.Size.M}>Never, no conditions set.</Text>
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
        </LabeledValue>
        <LabeledValue label={ADD_CONDITION_TITLE}>
          <Text size={Text.Size.M}>
            {template.addCondition == null ? (
              ADD_CONDITION_OPTIONS[0].label + "."
            ) : (
              <>
                <Icon glyph={ConditionIcon}/> When {formatAddCondition(template.addCondition)}
              </>
            )}
          </Text>
        </LabeledValue>
      </TemplateSection>
      <TemplateSection title="What it does">
        <EffectsView template={template}/>
      </TemplateSection>
      <TemplateSection title="Hierarchy">
        <Text size={Text.Size.M}>
          {template.hierarchical
            ? `Creates subtasks from ${childCount} child template${childCount === 1 ? "" : "s"}. Select one in the list to see it.`
            : "Not hierarchical."}
        </Text>
      </TemplateSection>
    </>
  );
};

interface HierarchyPanelProps {
  template: Template;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
}

// Hierarchy settings of a template: the enable checkbox and the child article import.
const HierarchyPanel: React.FunctionComponent<HierarchyPanelProps> = ({
  template,
  templateArticleSelectItems,
  setTemplate,
}) => {
  const [importing, setImporting] = useState<boolean>(false);
  const [importMessage, setImportMessage] = useState<string>("");
  const childCount = flattenChildTemplates(getChildTemplates(template)).length;

  const importChildren = async () => {
    setImporting(true);
    setImportMessage("");
    try {
      const result = await fetchArticleTree(template.articleId);
      console.log("Child articles", result);
      if (result.success === false) {
        setImportMessage(result.message || "Failed to import child articles.");
        return;
      }
      setTemplate((prev) => ({
        ...prev,
        children: mergeImportedChildren(
          getChildTemplates(prev),
          result.children,
          collectManualArticleIds(prev),
        ),
      }));
      setImportMessage("Child articles imported.");
    } catch (error) {
      console.error("Failed to import child articles", error);
      setImportMessage("Failed to import child articles.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Checkbox
        label="Create a subtask for each child article (from the Apply template menu)"
        checked={template.hierarchical}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const hierarchical = e.target.checked;
          setTemplate((prev) => ({ ...prev, hierarchical }));
        }}
      />
      {template.hierarchical && (
        <>
          <Text size={Text.Size.M}>
            {childCount === 0
              ? "No child templates yet."
              : `${childCount} child template${childCount === 1 ? "" : "s"}. Select one in the list to configure it.`}
          </Text>
          <LabeledValue label="Child articles of the template article">
            <div>
              <Button
                onClick={importChildren}
                disabled={!template.articleId || importing}
                loader={importing}
                icon={ImportIcon}
                inline
              >
                {childCount === 0 ? "Import child articles" : "Re-import child articles"}
              </Button>
            </div>
            {importMessage && (
              <Text size={Text.Size.S} info>
                {importMessage}
              </Text>
            )}
          </LabeledValue>
          <LabeledValue label="Any other template article">
            <InsertChildArticle
              template={template}
              templateArticleSelectItems={templateArticleSelectItems}
              onInsert={(article) => setTemplate((prev) => insertManualChild(prev, null, article))}
            />
          </LabeledValue>
          <Text size={Text.Size.S} info>
            For articles, sub-articles get text replacements and tags only.
          </Text>
        </>
      )}
    </>
  );
};

interface TicketOnlyPanelProps {
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  ticketFeatures: TicketFeatureAvailability;
}

// Ticket fields of a template; for article-only templates only a note, plus any leftover fields
// so that they can be removed.
const TicketFieldsPanel: React.FunctionComponent<
  TicketOnlyPanelProps & { projectFields: Array<ProjectFieldInfo> }
> = ({ template, setTemplate, ticketFeatures, projectFields }) => (
  <>
    {ticketFeatures === "unavailable" && (
      <Text size={Text.Size.S} info>
        {ARTICLE_ONLY_NOTE}
      </Text>
    )}
    {(ticketFeatures !== "unavailable" || getTemplateFields(template).length > 0) && (
      <TemplateFieldsPanel
        title="Ticket fields"
        fields={getTemplateFields(template)}
        onFieldsChange={(fields) => setTemplate((prev) => ({ ...prev, fields }))}
        projectFields={projectFields}
        addCondition={template.addCondition}
        hint={getTicketOnlyHint(ticketFeatures, "fields")}
      />
    )}
  </>
);

// Relations of a template; hidden for article-only templates unless there are leftovers.
const TicketRelationsPanel: React.FunctionComponent<
  TicketOnlyPanelProps & { linkNames: Array<string>; checkIssue: IssueChecker }
> = ({ template, setTemplate, ticketFeatures, linkNames, checkIssue }) =>
  ticketFeatures !== "unavailable" || getTemplateRelations(template).length > 0 ? (
    <TemplateRelationsPanel
      title="Relations"
      template={template}
      ownerChildId={null}
      relations={getTemplateRelations(template)}
      onRelationsChange={(relations) => setTemplate((prev) => ({ ...prev, relations }))}
      linkNames={linkNames}
      checkIssue={checkIssue}
      hint={[
        "Relations to subtasks are added when the hierarchy is created.",
        getTicketOnlyHint(ticketFeatures, "relations"),
      ].filter(Boolean).join(" ")}
    />
  ) : null;

interface TemplateEditFormProps {
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  templateArticleSelectItems: Array<TemplateArticleSelectItem>;
  projectFields: Array<ProjectFieldInfo>;
  conditionFields: Array<ProjectFieldInfo>;
  projectTags: Array<TagInfo>;
  tagsLoading: boolean;
  onTagsFilter: (filter: string) => void;
  onTagsLoadMore: () => void;
  linkNames: Array<string>;
  checkIssue: IssueChecker;
  errors: Array<TemplateValidationError>;
}

// Editable form for a template.
const TemplateEditForm: React.FunctionComponent<TemplateEditFormProps> = ({
  template,
  setTemplate,
  templateArticleSelectItems,
  projectFields,
  conditionFields,
  projectTags,
  tagsLoading,
  onTagsFilter,
  onTagsLoadMore,
  linkNames,
  checkIssue,
  errors,
}) => {
  const validConditions = getValidConditions(template);
  const addConditionKey = getAddConditionKey(template);
  const ticketFeatures = getTicketFeatureAvailability(template);

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
          fields={conditionFields}
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
      <TemplateSection title="General" hasError={hasSectionError(errors, "general")}>
        <Input
          label="Name"
          value={template.name}
          onChange={(e) =>
            setTemplate((prev) => (prev !== null ? { ...prev, name: e.target.value } : prev))
          }
          size={Size.L}
        />
        <div className="template-edit-field-panel">
          <Select
            filter
            size={Select.Size.L}
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
          {templateArticleSelectItems.length === 0 && (
            <Text size={Text.Size.S} info>
              No template articles yet. Open an article&apos;s &quot;...&quot; menu and select
              &quot;Configure as template&quot; to make it available here.
            </Text>
          )}
          {template?.articleId && (
            <div>
              <Button href={`/articles/${template.articleId}`} target="_blank" icon={ArticleIcon} inline>
                Open {template.articleId}
              </Button>
            </div>
          )}
        </div>
        <ArticleAccessError
          articleId={template.articleId}
          templateArticleSelectItems={templateArticleSelectItems}
        />
        <CrossProjectWarning template={template}/>
      </TemplateSection>
      <TemplateSection title="When to use" hasError={hasSectionError(errors, "when")}>
        <LabeledValue label={VALID_CONDITIONS_TITLE}>
          {validConditions.length === 0 && (
            <Text size={Text.Size.M}>No conditions yet, add at least one.</Text>
          )}
          {validConditions.map((cond, idx) => (
            // Conditions have no identity of their own and the inputs are fully controlled by
            // `template`, so the position is the only stable key.
            // eslint-disable-next-line react/no-array-index-key
            <div key={`valid-cond-${idx}`} className="template-replacement-row">
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
          <div>
            <DropdownMenu
              anchor={(
                <Button icon={AddIcon} inline>
                  Add condition
                </Button>
              )}
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
        </LabeledValue>
        <LabeledValue label={ADD_CONDITION_TITLE}>
          <Radio
            value={addConditionKey}
            onChange={(key: string) =>
              setTemplate((prev) => ({
                ...prev,
                addCondition: addConditionForKey(key as AddConditionKey),
              }))
            }
          >
            {ADD_CONDITION_OPTIONS.map((option) => (
              <Radio.Item
                key={option.key}
                value={option.key}
                // An option already chosen stays selectable, so that the error can be seen.
                disabled={
                  option.key === "field_becomes" &&
                  ticketFeatures === "unavailable" &&
                  addConditionKey !== "field_becomes"
                }
              >
                {formatAddConditionOption(option.key, option.label, ticketFeatures)}
              </Radio.Item>
            ))}
          </Radio>
          {template?.addCondition?.when === "field_becomes" && (
            <FieldConditionInput
              fields={conditionFields}
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
        </LabeledValue>
      </TemplateSection>
      <TemplateSection title="What it does" hasError={hasSectionError(errors, "effects")}>
        <TicketFieldsPanel
          template={template}
          setTemplate={setTemplate}
          projectFields={projectFields}
          ticketFeatures={ticketFeatures}
        />
        <TemplateTagsPanel
          title="Tags"
          tags={getTemplateTags(template)}
          onTagsChange={(tags) => setTemplate((prev) => ({ ...prev, tags }))}
          projectTags={projectTags}
          tagsLoading={tagsLoading}
          onTagsFilter={onTagsFilter}
          onTagsLoadMore={onTagsLoadMore}
          hint={`Only added when applied manually from the Apply template menu of a ${formatTemplateTargetNoun(template)}.`}
        />
        <TicketRelationsPanel
          template={template}
          setTemplate={setTemplate}
          linkNames={linkNames}
          checkIssue={checkIssue}
          ticketFeatures={ticketFeatures}
        />
        <TemplateReplacementsPanel
          replacements={getTemplateReplacements(template)}
          onReplacementsChange={(replacements) => setTemplate((prev) => ({ ...prev, replacements }))}
          projectFields={projectFields}
          ticketFields={ticketFeatures}
        />
      </TemplateSection>
      <TemplateSection title="Hierarchy" hasError={hasSectionError(errors, "hierarchy")}>
        <HierarchyPanel
          template={template}
          templateArticleSelectItems={templateArticleSelectItems}
          setTemplate={setTemplate}
        />
      </TemplateSection>
    </>
  );
};

interface EditorTitleProps {
  template: Template;
  // Child template shown in the editor, if any.
  child: ChildTemplate | null;
}

// "Template name" or "Template name › Child template name" in the editor header.
const EditorTitle: React.FunctionComponent<EditorTitleProps> = ({ template, child }) => {
  const templateName = template.name.trim() || "New template";
  const childName = child !== null ? child.name.trim() || child.articleId : null;
  return (
    <H2
      className="template-edit-header-title"
      title={childName !== null ? `${templateName} › ${childName}` : templateName}
    >
      {templateName}
      {childName !== null && <span className="template-edit-header-child"> › {childName}</span>}
    </H2>
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
  // Child template selected in the list, shown instead of the template itself.
  selectedChildId: string | null;
  setSelectedChildId: (childId: string | null) => void;
  // Starts editing the given template as a new, unsaved draft (used by Duplicate).
  startDraft?: (template: Template) => void;
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
  selectedChildId,
  setSelectedChildId,
  startDraft,
}) => {
  const [projectFields, setProjectFields] = useState<Array<ProjectFieldInfo>>([]);
  const [projectTags, setProjectTags] = useState<Array<TagInfo>>([]);
  const [tagsLoading, setTagsLoading] = useState<boolean>(false);
  const [tagsHasMore, setTagsHasMore] = useState<boolean>(false);
  const tagsFilterRef = useRef<string>("");
  const tagsSkipRef = useRef<number>(0);
  // Error returned by the backend when storing or removing failed.
  const [backendError, setBackendError] = useState<string | null>(null);
  // Validation errors are shown, and kept up to date, once the user tried to save.
  const [saveAttempted, setSaveAttempted] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [templateSnapshot, setTemplateSnapshot] = useState<Template>(template);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState<boolean>(false);
  const [jsonDialogOpen, setJsonDialogOpen] = useState<boolean>(false);
  const [linkNames, setLinkNames] = useState<Array<string>>([]);

  // Keep a fresh snapshot when parent `template` changes and we're not editing.
  useEffect(() => {
    if (!editing) {
      setTemplateSnapshot(template);
      setSaveAttempted(false);
    }
  }, [template, editing]);

  const validationErrors = useMemo(
    () => (editing && saveAttempted ? prepareTemplateForStore(template).errors : []),
    [editing, saveAttempted, template],
  );

  const hasUnsavedChanges =
    editing && (isDraft || JSON.stringify(template) !== JSON.stringify(templateSnapshot));

  // Warn before reloading or closing the page with unsaved changes.
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

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
      .fetchApp<{ fields: Array<ProjectFieldInfo> }>("backend/getProjectInfo", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        console.log("Project info", result);
        setProjectFields(result.fields);
      });
    fetchTags("", true);
    host
      .fetchYouTrack<Array<IssueLinkTypeInfo>>("issueLinkTypes", {
        query: { fields: "name,directed,aggregation,readOnly,sourceToTarget,targetToSource" },
      })
      .then((types) => setLinkNames(getRelationLinkNames(types)));
  }, [fetchTags]);

  // A ticket can be a relation target only when the user can read it.
  const checkIssue: IssueChecker = useCallback(async (issueId) => {
    try {
      const issue = await host.fetchYouTrack<{ idReadable: string; summary: string }>(
        `issues/${encodeURIComponent(issueId)}`,
        { query: { fields: "idReadable,summary" } },
      );
      return `${issue.idReadable}: ${issue.summary}`;
    } catch (error) {
      console.log(`Ticket ${issueId} not accessible`, error);
      return null;
    }
  }, []);

  const conditionFields = useMemo(() => projectFields.filter(isConditionField), [projectFields]);

  const addOrUpdateTemplate = async (editedTemplate: Template) => {
    const { template: templateToStore, errors } = prepareTemplateForStore(editedTemplate);
    setBackendError(null);
    if (errors.length > 0) {
      setSaveAttempted(true);
      return;
    }

    setSaving(true);
    try {
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
        notify(isDraft ? "Template added." : "Template saved.");
        setSaveAttempted(false);
        setIsDraft(false);
        setEditing(false);
        // Saved, store snapshot.
        setTemplate(templateToStore);
        setTemplateSnapshot(templateToStore);
        if (setTemplates) {
          setTemplates(result.templates || []);
        }
      } else {
        setBackendError(result.message || "Failed to add or update template.");
      }
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (templateToRemove: Template) => {
    setConfirmRemoveOpen(false);
    if (templateToRemove.id.trim() === "") {
      setBackendError("Template has no id, cannot remove.");
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
      notify(`Template "${templateToRemove.name}" removed.`);
      setBackendError(null);
      setIsDraft(false);
      setEditing(false);
      setTemplate(createNullTemplate());
      if (setTemplates) {
        setTemplates(result.templates || []);
      }
    } else {
      setBackendError(result.message || "Failed to remove template.");
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
    setBackendError(null);
    setSaveAttempted(false);
  }, [isDraft, templateSnapshot, setTemplate, setIsDraft, setEditing]);

  const startEdit = () => {
    // Capture current state as snapshot before entering edit mode.
    setTemplateSnapshot(template);
    setEditing(true);
  };

  const templateArticleSelectItems = useMemo(
    () => getTemplateArticleSelectItems(templateArticles),
    [templateArticles],
  );

  const selectedChild =
    selectedChildId !== null ? findChildTemplate(template, selectedChildId) : null;

  const renderBody = () => {
    if (selectedChild !== null) {
      return (
        <ChildTemplateEdit
          template={template}
          child={selectedChild}
          editing={editing}
          setTemplate={setTemplate}
          projectFields={projectFields}
          conditionFields={conditionFields}
          fetchArticleTree={fetchArticleTree}
          templateArticleSelectItems={templateArticleSelectItems}
          projectTags={projectTags}
          tagsLoading={tagsLoading}
          onTagsFilter={onTagsFilter}
          onTagsLoadMore={onTagsLoadMore}
          linkNames={linkNames}
          checkIssue={checkIssue}
          onBack={() => setSelectedChildId(null)}
          showErrors={editing && saveAttempted}
        />
      );
    }
    if (editing) {
      return (
        <TemplateEditForm
          template={template}
          setTemplate={setTemplate}
          templateArticleSelectItems={templateArticleSelectItems}
          projectFields={projectFields}
          conditionFields={conditionFields}
          projectTags={projectTags}
          tagsLoading={tagsLoading}
          onTagsFilter={onTagsFilter}
          onTagsLoadMore={onTagsLoadMore}
          linkNames={linkNames}
          checkIssue={checkIssue}
          errors={validationErrors}
        />
      );
    }
    return (
      <TemplateView template={template} templateArticleSelectItems={templateArticleSelectItems}/>
    );
  };

  const moreActions = [
    { label: "Show JSON", glyph: CodeIcon, onClick: () => setJsonDialogOpen(true) },
    ...(!editing && startDraft
      ? [
          {
            label: "Duplicate template",
            glyph: CopyIcon,
            onClick: () => startDraft(duplicateTemplate(template)),
          },
        ]
      : []),
    ...(!isDraft
      ? [
          {
            label: "Remove template",
            glyph: TrashIcon,
            onClick: () => setConfirmRemoveOpen(true),
          },
        ]
      : []),
  ];

  const editActions = (
    <>
      <Button onClick={() => addOrUpdateTemplate(template)} primary loader={saving} disabled={saving}>
        {isDraft ? "Add template" : "Save"}
      </Button>
      <Button onClick={() => cancelEdit()}>Cancel</Button>
    </>
  );

  return (
    <div className="template-edit">
      <div className="template-edit-header">
        <EditorTitle template={template} child={selectedChild}/>
        <div className="template-edit-actions">
          {editing ? (
            editActions
          ) : (
            <Button onClick={startEdit} icon={EditIcon}>
              Edit
            </Button>
          )}
          <DropdownMenu
            className="template-edit-more-actions"
            anchor={<Button icon={MoreOptionsIcon} title="More actions"/>}
            data={moreActions}
          />
        </div>
      </div>
      {validationErrors.length > 0 && (
        <Banner mode="error" title="Fix the following before saving" withIcon>
          <ul className="template-error-list">
            {validationErrors.map((error) => (
              <li key={`${error.section}-${error.message}`}>{error.message}</li>
            ))}
          </ul>
        </Banner>
      )}
      {backendError !== null && (
        <Banner mode="error" title="Failed to store template" withIcon onClose={() => setBackendError(null)}>
          {backendError}
        </Banner>
      )}
      {renderBody()}
      {editing && <div className="template-edit-actions">{editActions}</div>}
      {!isDraft && (
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
      <TemplateJsonDialog
        template={template}
        show={jsonDialogOpen}
        onClose={() => setJsonDialogOpen(false)}
      />
    </div>
  );
};

export default TemplateEdit;
