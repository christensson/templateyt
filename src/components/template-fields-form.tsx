import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import type { ProjectFieldInfo } from "../../@types/project-info";
import {
  evaluateChildInclusion,
  flattenChildTemplates,
  getChildTemplates,
  getTemplateFields,
  getTemplateReplacements,
  getTemplateTags,
  getTemplateRelations,
  formatRelationTarget,
  hasUserInputFields,
  hierarchyHasUserInputFields,
  type ChildInclusion,
  type ChildTemplate,
  type Template,
  type TemplateField,
  type TemplateRelation,
} from "../../@types/template";
import {
  ACTION_LABELS,
  formatPendingTitle,
  hasMissingReplacementTexts,
  type ChildFieldValues,
  type FieldValues,
  type PendingApply,
  type ReplacementTexts,
} from "../template-client";

interface ReplacementInputsProps {
  template: Template;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // Display texts of the root ticket's fields; null values mean the field is empty. Undefined
  // when there is no root ticket (articles).
  currentFieldPresentations?: Record<string, string | null>;
}

// What a template's text replacements will insert: field replacements as text, user-input
// replacements as required text inputs.
export const ReplacementInputs: React.FunctionComponent<ReplacementInputsProps> = ({
  template,
  texts,
  setTexts,
  currentFieldPresentations,
}) => {
  const replacements = getTemplateReplacements(template);
  if (replacements.length === 0) {
    return null;
  }
  const describeFieldReplacement = (search: string, fieldName: string): string => {
    if (currentFieldPresentations === undefined) {
      return `Cannot replace ${search}: root ticket field ${fieldName} is not available for articles.`;
    }
    const text = currentFieldPresentations[fieldName];
    return text
      ? `Will replace ${search} with ${text}.`
      : `Cannot replace ${search}: root ticket field ${fieldName} is empty.`;
  };
  return (
    <>
      {replacements.map((replacement) =>
        replacement.mode === "field" ? (
          <Text size={Text.Size.M} info key={`replacement-${replacement.search}`}>
            {describeFieldReplacement(replacement.search, replacement.fieldName)}
          </Text>
        ) : (
          <div className="template-replacement-input-row" key={`replacement-${replacement.search}`}>
            <Text size={Text.Size.M}>Text for {replacement.search}</Text>
            <Input
              value={texts[replacement.search] ?? ""}
              size={Size.M}
              onChange={(e) => {
                const value = e.target.value;
                setTexts((prev) => ({ ...prev, [replacement.search]: value }));
              }}
            />
          </div>
        ),
      )}
    </>
  );
};

interface UserInputFieldSelectProps {
  field: TemplateField;
  fieldInfos: Array<ProjectFieldInfo>;
  value: string | null;
  onChange: (fieldName: string, value: string | null) => void;
}

const UserInputFieldSelect: React.FunctionComponent<UserInputFieldSelectProps> = ({
  field,
  fieldInfos,
  value,
  onChange,
}) => {
  const items = useMemo(() => {
    const info = fieldInfos.find((f) => f.name === field.fieldName);
    return info ? info.values.map((v) => ({ key: v.name, label: v.presentation })) : [];
  }, [fieldInfos, field.fieldName]);
  const selected = items.find((item) => item.key === value) || null;
  return (
    <div>
      <Text size={Text.Size.M}>
        {field.additive ? `Add to ${field.fieldName} ` : `Set ${field.fieldName} to `}
      </Text>
      <Select
        clear
        filter
        label="..."
        type={Select.Type.INLINE}
        size={Select.Size.AUTO}
        data={items}
        selected={selected}
        onSelect={(item: SelectItem | null) =>
          onChange(field.fieldName, item ? String(item.key) : null)
        }
      />
    </div>
  );
};

interface FieldPreviewListProps {
  fields: Array<TemplateField>;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  onChange: (fieldName: string, value: string | null) => void;
  // Articles have no fields: every field is listed as not set instead.
  forArticle?: boolean;
}

// What a template will set: fixed fields as text, user-input fields as selects.
const FieldPreviewList: React.FunctionComponent<FieldPreviewListProps> = ({
  fields,
  fieldInfos,
  values,
  onChange,
  forArticle = false,
}) => {
  const renderField = (field: TemplateField) => {
    if (forArticle) {
      return (
        <Text size={Text.Size.M} info key={field.fieldName}>
          Cannot set {field.fieldName}: ticket fields are not available for articles.
        </Text>
      );
    }
    if (field.mode === "fixed") {
      return (
        <Text size={Text.Size.M} info key={field.fieldName}>
          {field.additive
            ? `Will add ${field.fieldValue} to ${field.fieldName}.`
            : `Will set ${field.fieldName} to ${field.fieldValue}.`}
        </Text>
      );
    }
    return (
      <UserInputFieldSelect
        key={field.fieldName}
        field={field}
        fieldInfos={fieldInfos}
        value={values[field.fieldName] ?? null}
        onChange={onChange}
      />
    );
  };
  return <>{fields.map(renderField)}</>;
};

interface TagPreviewListProps {
  tags: Array<string>;
}

// What a template will add besides fields: its tags.
const TagPreviewList: React.FunctionComponent<TagPreviewListProps> = ({ tags }) => (
  <>
    {tags.map((tag) => (
      <Text size={Text.Size.M} info key={`tag-${tag}`}>
        Will add tag {tag}.
      </Text>
    ))}
  </>
);

interface RelationPreviewListProps {
  relations: Array<TemplateRelation>;
  template: Template;
  // Which child templates will be created; relations to the others are skipped.
  inclusion?: Record<string, ChildInclusion>;
}

// What a template will link: its relations, with skipped targets marked.
const RelationPreviewList: React.FunctionComponent<RelationPreviewListProps> = ({
  relations,
  template,
  inclusion,
}) => (
  <>
    {relations.map((relation, idx) => {
      const skipped =
        relation.target === "child" && inclusion !== undefined && !inclusion[relation.childId]?.created;
      return (
        // eslint-disable-next-line react/no-array-index-key
        <Text size={Text.Size.M} info key={`relation-${idx}`}>
          Will add relation {relation.linkName} to {formatRelationTarget(relation, template)}
          {skipped ? " (skipped, target not created)." : "."}
        </Text>
      );
    })}
  </>
);

interface FormSectionProps {
  title: string;
  children?: React.ReactNode;
}

// A titled part of a form; consecutive sections are separated by a line (see widget CSS).
const FormSection: React.FunctionComponent<FormSectionProps> = ({ title, children }) => (
  <div className="template-form-section">
    <Text size={Text.Size.S} info>
      {title}
    </Text>
    {children}
  </div>
);

const formatPreviewTitle = (hasTags: boolean, hasRelations: boolean): string => {
  if (hasRelations) {
    return hasTags ? "Fields, tags and relations" : "Fields and relations";
  }
  return hasTags ? "Fields and tags" : "Fields";
};

interface TemplateFieldsFormProps {
  pending: PendingApply;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  setValues: React.Dispatch<React.SetStateAction<FieldValues>>;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  currentFieldPresentations?: Record<string, string | null>;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  // Hide the title when the surrounding container already shows it.
  showTitle?: boolean;
  cancelLabel?: string;
  // Applying to an article: fields are not set, only described as unavailable.
  forArticle?: boolean;
}

// Form for applying a template with user-input fields: shows the fixed fields and lets the user
// pick values for the user-input fields.
export const TemplateFieldsForm: React.FunctionComponent<TemplateFieldsFormProps> = ({
  pending,
  fieldInfos,
  values,
  setValues,
  texts,
  setTexts,
  currentFieldPresentations,
  submitting,
  onConfirm,
  onBack,
  showTitle = true,
  cancelLabel = "Back",
  forArticle = false,
}) => {
  const onChange = useCallback(
    (fieldName: string, value: string | null) =>
      setValues((prev) => ({ ...prev, [fieldName]: value })),
    [setValues],
  );
  const confirmDisabled = submitting || hasMissingReplacementTexts(pending.template, texts);
  const fields = getTemplateFields(pending.template);
  const tags = getTemplateTags(pending.template);
  // Relations to fixed tickets are added when the template is applied (not for articles).
  const fixedRelations = forArticle
    ? []
    : getTemplateRelations(pending.template).filter((relation) => relation.target === "fixed");
  const hasReplacements = getTemplateReplacements(pending.template).length > 0;

  return (
    <>
      {showTitle && <Text size={Text.Size.M}>{formatPendingTitle(pending)}</Text>}
      <div className="template-fields-form">
        {(fields.length > 0 || tags.length > 0 || fixedRelations.length > 0) && (
          <FormSection title={formatPreviewTitle(tags.length > 0, fixedRelations.length > 0)}>
            <FieldPreviewList
              fields={fields}
              fieldInfos={fieldInfos}
              values={values}
              onChange={onChange}
              forArticle={forArticle}
            />
            <TagPreviewList tags={tags}/>
            <RelationPreviewList relations={fixedRelations} template={pending.template}/>
            {!forArticle && hasUserInputFields(pending.template) && (
              <Text size={Text.Size.S} info>
                Fields left empty are not changed.
              </Text>
            )}
          </FormSection>
        )}
        {hasReplacements && (
          <FormSection title="Text replacements">
            <ReplacementInputs
              template={pending.template}
              texts={texts}
              setTexts={setTexts}
              currentFieldPresentations={currentFieldPresentations}
            />
          </FormSection>
        )}
      </div>
      <Panel className="template-fields-form-actions">
        <Button primary loader={submitting} disabled={confirmDisabled} onClick={onConfirm}>
          {ACTION_LABELS[pending.mode]}
        </Button>
        <Button disabled={submitting} onClick={onBack}>
          {cancelLabel}
        </Button>
      </Panel>
    </>
  );
};

// Indentation per tree depth, in --ring-unit steps.
const UNITS_PER_DEPTH = 3;

interface ChildTemplatePreviewProps {
  template: Template;
  child: ChildTemplate;
  depth: number;
  inclusion: ChildInclusion;
  // Inclusion of every child template, for relations to skipped subtasks.
  allInclusion: Record<string, ChildInclusion>;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  onChange: (childId: string, fieldName: string, value: string | null) => void;
}

const ChildTemplatePreview: React.FunctionComponent<ChildTemplatePreviewProps> = ({
  template,
  child,
  depth,
  inclusion,
  allInclusion,
  fieldInfos,
  values,
  onChange,
}) => {
  const onFieldChange = useCallback(
    (fieldName: string, value: string | null) => onChange(child.id, fieldName, value),
    [child.id, onChange],
  );
  const fields = getTemplateFields(child);
  const tags = getTemplateTags(child);
  const skippedClass = inclusion.created ? "" : " template-hierarchy-child-skipped";
  if (!inclusion.created) {
    return (
      <div
        className={`template-hierarchy-child${skippedClass}`}
        style={{ marginLeft: `calc(var(--ring-unit) * ${depth * UNITS_PER_DEPTH})` }}
      >
        <div className="template-hierarchy-child-title">
          <Text size={Text.Size.M} bold className="template-hierarchy-child-title-skipped">
            {child.name}
          </Text>{" "}
          <Text size={Text.Size.S} info>
            {child.articleId}
          </Text>
        </div>
        <div className="template-hierarchy-child-body">
          <Text size={Text.Size.S} info>
            Not created: {inclusion.reason}
          </Text>
        </div>
      </div>
    );
  }
  return (
    <div
      className="template-hierarchy-child"
      style={{ marginLeft: `calc(var(--ring-unit) * ${depth * UNITS_PER_DEPTH})` }}
    >
      <div className="template-hierarchy-child-title">
        <Text size={Text.Size.M} bold>
          {child.name}
        </Text>{" "}
        <Text size={Text.Size.S} info>
          {child.articleId}
        </Text>
      </div>
      <div className="template-hierarchy-child-body">
        {child.inheritParentFields && (
          <Text size={Text.Size.S} info>
            Inherits template controlled fields from parent.
          </Text>
        )}
        {child.inheritRootFields && (
          <Text size={Text.Size.S} info>
            Inherits template controlled fields from root ticket.
          </Text>
        )}
        {fields.length === 0 &&
          tags.length === 0 &&
          getTemplateRelations(child).length === 0 &&
          !child.inheritParentFields &&
          !child.inheritRootFields && (
          <Text size={Text.Size.S} info>
            No fields set.
          </Text>
        )}
        <FieldPreviewList
          fields={fields}
          fieldInfos={fieldInfos}
          values={values}
          onChange={onFieldChange}
        />
        <TagPreviewList tags={tags}/>
        <RelationPreviewList
          relations={getTemplateRelations(child)}
          template={template}
          inclusion={allInclusion}
        />
      </div>
    </div>
  );
};

interface HierarchyFormProps {
  template: Template;
  fieldInfos: Array<ProjectFieldInfo>;
  // Current field values of the root ticket, used to preview which subtasks will be created.
  currentFieldValues: FieldValues;
  currentFieldPresentations: Record<string, string | null>;
  values: ChildFieldValues;
  setValues: React.Dispatch<React.SetStateAction<ChildFieldValues>>;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // A hierarchy for this template was created for the ticket before.
  alreadyCreated: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  cancelLabel?: string;
}

// Form for creating the ticket hierarchy of a template: shows the subtasks that will be created
// with their fields and lets the user pick values for user-input fields.
const formatCreatedCount = (created: number, total: number): string => {
  if (created === total) {
    return total === 1
      ? "The following subtask will be created below the ticket:"
      : `The following ${total} subtasks will be created below the ticket:`;
  }
  return `${created} of ${total} subtasks will be created below the ticket:`;
};

interface ArticleHierarchyFormProps {
  template: Template;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // A hierarchy for this template was created for the article before.
  alreadyCreated: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

const formatArticleCount = (total: number): string =>
  total === 1
    ? "The following sub-article will be created below the article:"
    : `The following ${total} sub-articles will be created below the article:`;

// Form for creating the article hierarchy of a template: shows the sub-articles that will be
// created with their tags. Articles have no fields, so fields and add conditions do not apply.
export const ArticleHierarchyForm: React.FunctionComponent<ArticleHierarchyFormProps> = ({
  template,
  texts,
  setTexts,
  alreadyCreated,
  submitting,
  onConfirm,
  onBack,
}) => {
  const flat = flattenChildTemplates(getChildTemplates(template));
  const confirmDisabled = submitting || hasMissingReplacementTexts(template, texts);
  const hasReplacements = getTemplateReplacements(template).length > 0;

  return (
    <>
      {alreadyCreated && (
        <Banner mode="warning" withIcon>
          A hierarchy for this template was already created for this article. Creating it again
          adds another set of sub-articles.
        </Banner>
      )}
      <div className="template-fields-form">
        {hasReplacements && (
          <FormSection title="Text replacements (applied to every sub-article)">
            <ReplacementInputs template={template} texts={texts} setTexts={setTexts}/>
          </FormSection>
        )}
        <FormSection title={formatArticleCount(flat.length)}>
          <div className="template-hierarchy-list">
            {flat.map(({ child, depth }) => (
              <div
                key={child.id}
                className="template-hierarchy-child"
                style={{ marginLeft: `calc(var(--ring-unit) * ${depth * UNITS_PER_DEPTH})` }}
              >
                <div className="template-hierarchy-child-title">
                  <Text size={Text.Size.M} bold>
                    {child.name}
                  </Text>{" "}
                  <Text size={Text.Size.S} info>
                    {child.articleId}
                  </Text>
                </div>
                {getTemplateTags(child).length > 0 && (
                  <div className="template-hierarchy-child-body">
                    <TagPreviewList tags={getTemplateTags(child)}/>
                  </div>
                )}
              </div>
            ))}
          </div>
        </FormSection>
      </div>
      <Panel className="template-fields-form-actions">
        <Button primary loader={submitting} disabled={confirmDisabled} onClick={onConfirm}>
          {alreadyCreated ? "Create hierarchy again" : "Create hierarchy"}
        </Button>
        <Button disabled={submitting} onClick={onBack}>
          Back
        </Button>
      </Panel>
    </>
  );
};

export const HierarchyForm: React.FunctionComponent<HierarchyFormProps> = ({
  template,
  fieldInfos,
  currentFieldValues,
  currentFieldPresentations,
  values,
  setValues,
  texts,
  setTexts,
  alreadyCreated,
  submitting,
  onConfirm,
  onBack,
  cancelLabel = "Back",
}) => {
  const flat = flattenChildTemplates(getChildTemplates(template));
  const inclusion = evaluateChildInclusion(template, currentFieldValues);
  const createdCount = flat.filter(({ child }) => inclusion[child.id]?.created).length;
  const confirmDisabled = submitting || hasMissingReplacementTexts(template, texts);
  const hasReplacements = getTemplateReplacements(template).length > 0;
  const onChange = useCallback(
    (childId: string, fieldName: string, value: string | null) =>
      setValues((prev) => ({
        ...prev,
        [childId]: { ...(prev[childId] ?? {}), [fieldName]: value },
      })),
    [setValues],
  );

  return (
    <>
      {alreadyCreated && (
        <Banner mode="warning" withIcon>
          A hierarchy for this template was already created for this ticket. Creating it again adds
          another set of subtasks.
        </Banner>
      )}
      <div className="template-fields-form">
        {hasReplacements && (
          <FormSection title="Text replacements (applied to every subtask)">
            <ReplacementInputs
              template={template}
              texts={texts}
              setTexts={setTexts}
              currentFieldPresentations={currentFieldPresentations}
            />
          </FormSection>
        )}
        {getTemplateRelations(template).length > 0 && (
          <FormSection title="Relations added to the ticket">
            <RelationPreviewList
              relations={getTemplateRelations(template)}
              template={template}
              inclusion={inclusion}
            />
          </FormSection>
        )}
        <FormSection title={formatCreatedCount(createdCount, flat.length)}>
          <div className="template-hierarchy-list">
            {flat.map(({ child, depth }) => (
              <ChildTemplatePreview
                key={child.id}
                template={template}
                child={child}
                depth={depth}
                inclusion={inclusion[child.id] ?? { created: true, reason: null }}
                allInclusion={inclusion}
                fieldInfos={fieldInfos}
                values={values[child.id] ?? {}}
                onChange={onChange}
              />
            ))}
          </div>
          {hierarchyHasUserInputFields(template) && (
            <Text size={Text.Size.S} info>
              Fields left empty are not set.
            </Text>
          )}
        </FormSection>
      </div>
      <Panel className="template-fields-form-actions">
        <Button primary loader={submitting} disabled={confirmDisabled} onClick={onConfirm}>
          {alreadyCreated ? "Create hierarchy again" : "Create hierarchy"}
        </Button>
        <Button disabled={submitting} onClick={onBack}>
          {cancelLabel}
        </Button>
      </Panel>
    </>
  );
};
