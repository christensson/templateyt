import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import { H3 } from "@jetbrains/ring-ui-built/components/heading/heading";
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
  type TextReplacement,
} from "../../@types/template";
import { formatHierarchyLabel } from "../apply-template";
import {
  ACTION_LABELS,
  formatPendingTitle,
  hasMissingReplacementTexts,
  type ChildFieldValues,
  type FieldValues,
  type PendingApply,
  type ReplacementTexts,
} from "../template-client";

const EMPTY_FIELDS_HINT = "Fields left empty are not changed.";
const MISSING_TEXTS_HINT = "Fill in all texts to continue.";

interface EffectRowProps {
  label: string;
  // Show the label as code, for the words that text replacements replace.
  code?: boolean;
  children?: React.ReactNode;
}

// One row of a two-column list of what a template does: what is changed, and to what.
const EffectRow: React.FunctionComponent<EffectRowProps> = ({ label, code = false, children }) => (
  <>
    <Text size={Text.Size.M} info className={code ? "template-effect-code" : undefined}>
      {label}
    </Text>
    <div className="template-effect-value">{children}</div>
  </>
);

const EffectList: React.FunctionComponent<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="template-effect-list">{children}</div>
);

interface ReplacementRowProps {
  replacement: TextReplacement;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // Display texts of the root ticket's fields; null values mean the field is empty. Undefined
  // when there is no root ticket (articles).
  currentFieldPresentations?: Record<string, string | null>;
}

// A text replacement: the text a field replacement inserts, or a required input for user text.
const ReplacementRow: React.FunctionComponent<ReplacementRowProps> = ({
  replacement,
  texts,
  setTexts,
  currentFieldPresentations,
}) => {
  if (replacement.mode === "user_input") {
    return (
      <EffectRow label={replacement.search} code>
        <Input
          value={texts[replacement.search] ?? ""}
          placeholder="Required"
          size={Size.M}
          onChange={(e) => {
            const value = e.target.value;
            setTexts((prev) => ({ ...prev, [replacement.search]: value }));
          }}
        />
      </EffectRow>
    );
  }
  const text = currentFieldPresentations?.[replacement.fieldName];
  let value: React.ReactNode;
  if (currentFieldPresentations === undefined) {
    value = (
      <Text size={Text.Size.M} info>
        Not replaced: ticket field {replacement.fieldName} is not available for articles.
      </Text>
    );
  } else if (text) {
    value = (
      <Text size={Text.Size.M}>
        {text}{" "}
        <Text size={Text.Size.S} info>
          from {replacement.fieldName}
        </Text>
      </Text>
    );
  } else {
    value = (
      <Text size={Text.Size.M} info>
        Not replaced: {replacement.fieldName} is empty.
      </Text>
    );
  }
  return (
    <EffectRow label={replacement.search} code>
      {value}
    </EffectRow>
  );
};

interface ReplacementInputsProps {
  template: Template;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  currentFieldPresentations?: Record<string, string | null>;
}

// What a template's text replacements will insert.
export const ReplacementInputs: React.FunctionComponent<ReplacementInputsProps> = ({
  template,
  texts,
  setTexts,
  currentFieldPresentations,
}) => (
  <EffectList>
    {getTemplateReplacements(template).map((replacement) => (
      <ReplacementRow
        key={`replacement-${replacement.search}`}
        replacement={replacement}
        texts={texts}
        setTexts={setTexts}
        currentFieldPresentations={currentFieldPresentations}
      />
    ))}
  </EffectList>
);

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
    <Select
      clear
      filter
      label={field.additive ? "Add a value…" : "Choose…"}
      type={Select.Type.INLINE}
      size={Select.Size.AUTO}
      data={items}
      selected={selected}
      onSelect={(item: SelectItem | null) =>
        onChange(field.fieldName, item ? String(item.key) : null)
      }
    />
  );
};

interface EffectRowsProps {
  template: Template;
  // The template or child template whose fields, tags and relations are listed.
  owner: { fields?: Array<TemplateField>; tags?: Array<string> };
  relations: Array<TemplateRelation>;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  onChange: (fieldName: string, value: string | null) => void;
  // Which child templates will be created; relations to the others are skipped.
  inclusion?: Record<string, ChildInclusion>;
}

// What a template or child template sets: fixed field values as text, user-input fields as
// selects, then its tags and relations.
const EffectRows: React.FunctionComponent<EffectRowsProps> = ({
  template,
  owner,
  relations,
  fieldInfos,
  values,
  onChange,
  inclusion,
}) => {
  const tags = getTemplateTags(owner);
  return (
    <>
      {getTemplateFields(owner).map((field) => (
        <EffectRow key={`field-${field.fieldName}`} label={field.fieldName}>
          {field.mode === "fixed" ? (
            <Text size={Text.Size.M}>
              {field.additive ? `+ ${field.fieldValue}` : field.fieldValue}
            </Text>
          ) : (
            <UserInputFieldSelect
              field={field}
              fieldInfos={fieldInfos}
              value={values[field.fieldName] ?? null}
              onChange={onChange}
            />
          )}
        </EffectRow>
      ))}
      {tags.length > 0 && (
        <EffectRow label={tags.length === 1 ? "Tag" : "Tags"}>
          <Text size={Text.Size.M}>{tags.join(", ")}</Text>
        </EffectRow>
      )}
      {relations.map((relation, idx) => {
        const skipped =
          relation.target === "child" &&
          inclusion !== undefined &&
          !inclusion[relation.childId]?.created;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <EffectRow key={`relation-${idx}`} label={relation.linkName}>
            <Text size={Text.Size.M} info={skipped}>
              {formatRelationTarget(relation, template)}
              {skipped ? " (skipped, not created)" : ""}
            </Text>
          </EffectRow>
        );
      })}
    </>
  );
};

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

interface FormActionsProps {
  label: string;
  submitting: boolean;
  missingTexts: boolean;
  onConfirm: () => void;
  onBack: () => void;
  backLabel: string;
}

// Confirm and back buttons of a form, saying why the confirm button is disabled.
const FormActions: React.FunctionComponent<FormActionsProps> = ({
  label,
  submitting,
  missingTexts,
  onConfirm,
  onBack,
  backLabel,
}) => (
  <Panel className="template-fields-form-actions">
    <Button primary loader={submitting} disabled={submitting || missingTexts} onClick={onConfirm}>
      {label}
    </Button>
    <Button disabled={submitting} onClick={onBack}>
      {backLabel}
    </Button>
    {missingTexts && (
      <Text size={Text.Size.S} info>
        {MISSING_TEXTS_HINT}
      </Text>
    )}
  </Panel>
);

const formatApplyDescription = (pending: PendingApply, forArticle: boolean): string => {
  if (pending.mode === "fields") {
    return "Sets the values below again. The description is not changed.";
  }
  return forArticle
    ? "Adds the template content to the article."
    : "Adds the template content to the description and sets the values below.";
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
  // Applying to an article: ticket fields and relations are skipped.
  forArticle?: boolean;
}

// Form for applying a template that needs input: lists what the template sets, with selects for
// user-input fields and inputs for user-input text replacements.
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
  forArticle = false,
}) => {
  const onChange = useCallback(
    (fieldName: string, value: string | null) =>
      setValues((prev) => ({ ...prev, [fieldName]: value })),
    [setValues],
  );
  const template = pending.template;
  const hasFields = getTemplateFields(template).length > 0;
  // Relations to fixed tickets are added when the template is applied (not for articles).
  const fixedRelations = forArticle
    ? []
    : getTemplateRelations(template).filter((relation) => relation.target === "fixed");
  const hasChanges =
    (hasFields && !forArticle) || getTemplateTags(template).length > 0 || fixedRelations.length > 0;
  const hasReplacements = getTemplateReplacements(template).length > 0;

  return (
    <>
      <div className="template-fields-form">
        <div>
          <H3>{formatPendingTitle(pending)}</H3>
          <Text size={Text.Size.M} info>
            {formatApplyDescription(pending, forArticle)}
          </Text>
        </div>
        {hasChanges && (
          <FormSection title={forArticle ? "Article changes" : "Ticket changes"}>
            <EffectList>
              <EffectRows
                template={template}
                owner={forArticle ? { tags: template.tags } : template}
                relations={fixedRelations}
                fieldInfos={fieldInfos}
                values={values}
                onChange={onChange}
              />
            </EffectList>
            {!forArticle && hasUserInputFields(template) && (
              <Text size={Text.Size.S} info>
                {EMPTY_FIELDS_HINT}
              </Text>
            )}
          </FormSection>
        )}
        {forArticle && hasFields && (
          <Text size={Text.Size.S} info>
            Ticket fields in this template are skipped for articles.
          </Text>
        )}
        {hasReplacements && (
          <FormSection title="Text replacements">
            <ReplacementInputs
              template={template}
              texts={texts}
              setTexts={setTexts}
              currentFieldPresentations={currentFieldPresentations}
            />
          </FormSection>
        )}
      </div>
      <FormActions
        label={ACTION_LABELS[pending.mode]}
        submitting={submitting}
        missingTexts={hasMissingReplacementTexts(template, texts)}
        onConfirm={onConfirm}
        onBack={onBack}
        backLabel="Back"
      />
    </>
  );
};

// Indentation per tree depth, in --ring-unit steps.
const UNITS_PER_DEPTH = 3;

const indentStyle = (depth: number): React.CSSProperties => ({
  marginLeft: `calc(var(--ring-unit) * ${depth * UNITS_PER_DEPTH})`,
});

const formatInheritance = (child: ChildTemplate): string | null => {
  const sources = [
    ...(child.inheritParentFields ? ["parent"] : []),
    ...(child.inheritRootFields ? ["root ticket"] : []),
  ];
  return sources.length > 0 ? `Inherits fields from ${sources.join(" and ")}` : null;
};

interface ChildTitleProps {
  child: ChildTemplate;
  skipped?: boolean;
  note?: string | null;
}

const ChildTitle: React.FunctionComponent<ChildTitleProps> = ({ child, skipped = false, note }) => (
  <div className="template-hierarchy-child-title">
    <Text
      size={Text.Size.M}
      bold
      className={skipped ? "template-hierarchy-child-title-skipped" : undefined}
    >
      {child.name}
    </Text>{" "}
    <Text size={Text.Size.S} info>
      {child.articleId}
      {note ? ` · ${note}` : ""}
    </Text>
  </div>
);

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
  if (!inclusion.created) {
    return (
      <div className="template-hierarchy-child template-hierarchy-child-skipped" style={indentStyle(depth)}>
        <ChildTitle child={child} skipped note={`Not created: ${inclusion.reason}`}/>
      </div>
    );
  }
  const relations = getTemplateRelations(child);
  const hasRows =
    getTemplateFields(child).length > 0 || getTemplateTags(child).length > 0 || relations.length > 0;
  return (
    <div className="template-hierarchy-child" style={indentStyle(depth)}>
      <ChildTitle child={child} note={formatInheritance(child)}/>
      {hasRows && (
        <div className="template-hierarchy-child-body">
          <EffectList>
            <EffectRows
              template={template}
              owner={child}
              relations={relations}
              fieldInfos={fieldInfos}
              values={values}
              onChange={onFieldChange}
              inclusion={allInclusion}
            />
          </EffectList>
        </div>
      )}
    </div>
  );
};

const formatCreatedCount = (created: number, total: number): string => {
  if (created === total) {
    return total === 1 ? "1 subtask is created below this ticket" : `${total} subtasks are created below this ticket`;
  }
  return `${created} of ${total} subtasks are created below this ticket`;
};

const formatArticleCount = (total: number): string =>
  total === 1
    ? "1 sub-article is created below this article"
    : `${total} sub-articles are created below this article`;

const AlreadyCreatedBanner: React.FunctionComponent<{ noun: string; parent: string }> = ({
  noun,
  parent,
}) => (
  <Banner mode="warning" withIcon>
    {noun.charAt(0).toUpperCase() + noun.slice(1)} from this template were already created for this{" "}
    {parent}. Creating them again adds another set.
  </Banner>
);

interface ArticleHierarchyFormProps {
  template: Template;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // A hierarchy for this template was created for the article before.
  alreadyCreated: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  backLabel?: string;
}

// Form for creating the sub-articles of a template, with their tags. Articles have no fields, so
// fields and add conditions do not apply.
export const ArticleHierarchyForm: React.FunctionComponent<ArticleHierarchyFormProps> = ({
  template,
  texts,
  setTexts,
  alreadyCreated,
  submitting,
  onConfirm,
  onBack,
  backLabel = "Back",
}) => {
  const flat = flattenChildTemplates(getChildTemplates(template));
  const hasReplacements = getTemplateReplacements(template).length > 0;

  return (
    <>
      <div className="template-fields-form">
        <H3>Create sub-articles from {template.name}</H3>
        {alreadyCreated && <AlreadyCreatedBanner noun="sub-articles" parent="article"/>}
        {hasReplacements && (
          <FormSection title="Text replacements, used in every sub-article">
            <ReplacementInputs template={template} texts={texts} setTexts={setTexts}/>
          </FormSection>
        )}
        <FormSection title={formatArticleCount(flat.length)}>
          <div className="template-hierarchy-list">
            {flat.map(({ child, depth }) => (
              <div key={child.id} className="template-hierarchy-child" style={indentStyle(depth)}>
                <ChildTitle
                  child={child}
                  note={getTemplateTags(child).length > 0 ? `Tags ${getTemplateTags(child).join(", ")}` : null}
                />
              </div>
            ))}
          </div>
        </FormSection>
      </div>
      <FormActions
        label={formatHierarchyLabel("article", alreadyCreated)}
        submitting={submitting}
        missingTexts={hasMissingReplacementTexts(template, texts)}
        onConfirm={onConfirm}
        onBack={onBack}
        backLabel={backLabel}
      />
    </>
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
  backLabel?: string;
}

// Form for creating the subtasks of a template: shows the subtasks that will be created with
// their fields and lets the user pick values for user-input fields.
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
  backLabel = "Back",
}) => {
  const flat = flattenChildTemplates(getChildTemplates(template));
  const inclusion = evaluateChildInclusion(template, currentFieldValues);
  const createdCount = flat.filter(({ child }) => inclusion[child.id]?.created).length;
  const hasReplacements = getTemplateReplacements(template).length > 0;
  const rootRelations = getTemplateRelations(template);
  const onChange = useCallback(
    (childId: string, fieldName: string, value: string | null) =>
      setValues((prev) => ({
        ...prev,
        [childId]: { ...(prev[childId] ?? {}), [fieldName]: value },
      })),
    [setValues],
  );
  const noopChange = useCallback(() => undefined, []);

  return (
    <>
      <div className="template-fields-form">
        <H3>Create subtasks from {template.name}</H3>
        {alreadyCreated && <AlreadyCreatedBanner noun="subtasks" parent="ticket"/>}
        {hasReplacements && (
          <FormSection title="Text replacements, used in every subtask">
            <ReplacementInputs
              template={template}
              texts={texts}
              setTexts={setTexts}
              currentFieldPresentations={currentFieldPresentations}
            />
          </FormSection>
        )}
        {rootRelations.length > 0 && (
          <FormSection title="Links added to this ticket">
            <EffectList>
              <EffectRows
                template={template}
                owner={{}}
                relations={rootRelations}
                fieldInfos={fieldInfos}
                values={{}}
                onChange={noopChange}
                inclusion={inclusion}
              />
            </EffectList>
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
              {EMPTY_FIELDS_HINT}
            </Text>
          )}
        </FormSection>
      </div>
      <FormActions
        label={formatHierarchyLabel("ticket", alreadyCreated)}
        submitting={submitting}
        missingTexts={hasMissingReplacementTexts(template, texts)}
        onConfirm={onConfirm}
        onBack={onBack}
        backLabel={backLabel}
      />
    </>
  );
};
