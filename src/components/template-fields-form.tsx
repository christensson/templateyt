import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import { H3 } from "@jetbrains/ring-ui-built/components/heading/heading";
import Input, { Size } from "@jetbrains/ring-ui-built/components/input/input";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React, { useCallback, useMemo } from "react";
import { getFieldValueKind, type ProjectFieldInfo } from "../../@types/project-info";
import {
  evaluateChildInclusion,
  flattenChildTemplates,
  formatChildConditionNote,
  getChildConditionFields,
  getChildTemplates,
  getTemplateFields,
  getTemplateReplacements,
  getTemplateTags,
  getTemplateRelations,
  formatRelationTarget,
  formatFieldValue,
  hasUserInputFields,
  hierarchyHasUserInputFields,
  isMultiValueFieldName,
  getChildAddConditions,
  getTemplateOptions,
  getUnansweredOptions,
  isOptionCondition,
  getUsedOptions,
  type ChildInclusion,
  type OptionValues,
  type ConditionValues,
  type ChildTemplate,
  type Template,
  type TemplateField,
  type TemplateRelation,
  type TextReplacement,
} from "../../@types/template";
import {
  formatHierarchyLabel,
  formatValueListChange,
  getChangedConditionValues,
  getReplacementPreconditions,
  hasMissingRequiredInput,
  type ReplacementPrecondition,
  type ReplacementPreconditions,
  type MultiFieldValues,
} from "../apply-template";
import {
  ACTION_LABELS,
  formatPendingTitle,
  type ChildFieldValues,
  type FieldValues,
  type PendingApply,
  type ReplacementTexts,
} from "../template-client";
import FieldValueInput from "./field-value-input";
import OptionAnswerInput from "./option-input";

const EMPTY_FIELDS_HINT = "Fields left empty are not changed.";
const MISSING_INPUT_HINT = "Fill in all required values to continue.";

// Shown when replacement texts were filled in from the texts stored on the ticket or article.
const RememberedTextsHint: React.FunctionComponent<{ show?: boolean }> = ({ show }) =>
  show ? (
    <Text size={Text.Size.S} info>
      Filled in with the texts used when the template was applied.
    </Text>
  ) : null;

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

interface UserInputFieldSelectProps {
  field: TemplateField;
  fieldInfos: Array<ProjectFieldInfo>;
  value: string | null;
  onChange: (fieldName: string, value: string | null) => void;
  label?: string;
}

// Input for a value chosen by the user: a select for list fields, a date picker or text input
// for simple fields.
const UserInputFieldSelect: React.FunctionComponent<UserInputFieldSelectProps> = ({
  field,
  fieldInfos,
  value,
  onChange,
  label,
}) => (
  <FieldValueInput
    fieldInfo={fieldInfos.find((f) => f.name === field.fieldName)}
    value={value}
    isFixed={false}
    onChange={(newValue) => onChange(field.fieldName, newValue)}
    label={label ?? (field.additive ? "Add a value…" : "Choose…")}
  />
);

// Display text of a fixed template field value, e.g. "14 days after applying" for a date field.
const formatFixedValue = (fieldInfos: Array<ProjectFieldInfo>, field: TemplateField & { mode: "fixed" }): string =>
  formatFieldValue(
    getFieldValueKind(fieldInfos.find((info) => info.name === field.fieldName)),
    field.fieldValue,
    true,
  );

// Values chosen for empty ticket fields that field replacements use, keyed by field name.
export type ReplacementFieldInput = {
  values: FieldValues;
  setValues: React.Dispatch<React.SetStateAction<FieldValues>>;
};

interface ReplacementRowProps {
  template: Template;
  replacement: TextReplacement;
  // How a field replacement gets its text; undefined for user-input replacements.
  precondition?: ReplacementPrecondition;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // Display texts of the root ticket's fields; null values mean the field is empty. Undefined
  // when there is no root ticket (articles).
  currentFieldPresentations?: Record<string, string | null>;
  fieldInfos: Array<ProjectFieldInfo>;
  fieldInput?: ReplacementFieldInput;
}

// Text of a field replacement that does not need a value from the user.
const describeFieldReplacement = (
  template: Template,
  fieldName: string,
  precondition: ReplacementPrecondition | undefined,
  currentFieldPresentations: Record<string, string | null> | undefined,
  fieldInfos: Array<ProjectFieldInfo>,
): React.ReactNode => {
  if (precondition?.kind === "set_by_template") {
    const setter = getTemplateFields(template).find((field) => field.fieldName === fieldName);
    return (
      <Text size={Text.Size.M}>
        {setter?.mode === "fixed" ? formatFixedValue(fieldInfos, setter) : "The value chosen above"}{" "}
        <Text size={Text.Size.S} info>
          from {fieldName}, set by this template
        </Text>
      </Text>
    );
  }
  if (precondition?.kind === "article" || currentFieldPresentations === undefined) {
    return (
      <Text size={Text.Size.M} info>
        Not available: articles have no ticket field {fieldName}.
      </Text>
    );
  }
  if (precondition?.kind === "missing_field") {
    return (
      <Text size={Text.Size.M} info>
        Not available: this project has no field {fieldName}.
      </Text>
    );
  }
  return (
    <Text size={Text.Size.M}>
      {currentFieldPresentations[fieldName]}{" "}
      <Text size={Text.Size.S} info>
        from {fieldName}
      </Text>
    </Text>
  );
};

// A text replacement: the text a field replacement inserts, or a required input for user text.
const ReplacementRow: React.FunctionComponent<ReplacementRowProps> = ({
  template,
  replacement,
  precondition,
  texts,
  setTexts,
  currentFieldPresentations,
  fieldInfos,
  fieldInput,
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
  const fieldName = replacement.fieldName;
  if (precondition?.kind === "empty" && fieldInput !== undefined) {
    return (
      <EffectRow label={replacement.search} code>
        <UserInputFieldSelect
          field={{ fieldName, mode: "user_input" }}
          fieldInfos={fieldInfos}
          value={fieldInput.values[fieldName] ?? null}
          onChange={(name, value) => fieldInput.setValues((prev) => ({ ...prev, [name]: value }))}
          label="Choose… (required)"
        />{" "}
        <Text size={Text.Size.S} info>
          {fieldName} is empty; the value is also set on this ticket
        </Text>
      </EffectRow>
    );
  }
  const value = describeFieldReplacement(
    template,
    fieldName,
    precondition,
    currentFieldPresentations,
    fieldInfos,
  );
  return (
    <EffectRow label={replacement.search} code>
      {value}
    </EffectRow>
  );
};

interface ReplacementInputsProps {
  template: Template;
  preconditions: ReplacementPreconditions;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  currentFieldPresentations?: Record<string, string | null>;
  fieldInfos: Array<ProjectFieldInfo>;
  fieldInput?: ReplacementFieldInput;
}

// What a template's text replacements will insert, asking for texts and empty field values.
export const ReplacementInputs: React.FunctionComponent<ReplacementInputsProps> = ({
  template,
  preconditions,
  texts,
  setTexts,
  currentFieldPresentations,
  fieldInfos,
  fieldInput,
}) => (
  <EffectList>
    {getTemplateReplacements(template).map((replacement) => (
      <ReplacementRow
        key={`replacement-${replacement.search}`}
        template={template}
        replacement={replacement}
        precondition={preconditions.items.find((item) => item.search === replacement.search)}
        texts={texts}
        setTexts={setTexts}
        currentFieldPresentations={currentFieldPresentations}
        fieldInfos={fieldInfos}
        fieldInput={fieldInput}
      />
    ))}
  </EffectList>
);

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
  // User-input fields that must be chosen, because a text replacement needs their value.
  requiredFields?: Array<string>;
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
  requiredFields = [],
}) => {
  const tags = getTemplateTags(owner);
  return (
    <>
      {getTemplateFields(owner).map((field) => (
        <EffectRow key={`field-${field.fieldName}`} label={field.fieldName}>
          {field.mode === "fixed" ? (
            <Text size={Text.Size.M}>
              {field.additive ? `+ ${field.fieldValue}` : formatFixedValue(fieldInfos, field)}
            </Text>
          ) : (
            <UserInputFieldSelect
              field={field}
              fieldInfos={fieldInfos}
              value={values[field.fieldName] ?? null}
              onChange={onChange}
              label={requiredFields.includes(field.fieldName) ? "Choose… (required)" : undefined}
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
        const target = relation.target === "child" ? inclusion?.[relation.childId] : undefined;
        const skipped = target !== undefined && !target.created;
        let suffix = "";
        if (skipped) {
          suffix = target.undecided ? " (depends on your answers)" : " (skipped, not created)";
        }
        return (
          // eslint-disable-next-line react/no-array-index-key
          <EffectRow key={`relation-${idx}`} label={relation.linkName}>
            <Text size={Text.Size.M} info={skipped}>
              {formatRelationTarget(relation, template)}
              {suffix}
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
  // Why the confirm button is disabled, instead of the generic hint.
  missingHint?: string;
  onConfirm: () => void;
  onBack: () => void;
  backLabel: string;
}

// Confirm and back buttons of a form, saying why the confirm button is disabled.
const FormActions: React.FunctionComponent<FormActionsProps> = ({
  label,
  submitting,
  missingTexts,
  missingHint,
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
        {missingHint ?? MISSING_INPUT_HINT}
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

const NO_VALUES: FieldValues = {};

// What the apply form has to show for a template.
const getFormContent = (template: Template, forArticle: boolean) => {
  const hasFields = getTemplateFields(template).length > 0;
  // Relations to fixed tickets are added when the template is applied (not for articles).
  const fixedRelations = forArticle
    ? []
    : getTemplateRelations(template).filter((relation) => relation.target === "fixed");
  return {
    hasFields,
    fixedRelations,
    hasChanges:
      (hasFields && !forArticle) ||
      getTemplateTags(template).length > 0 ||
      fixedRelations.length > 0,
    hasReplacements: getTemplateReplacements(template).length > 0,
  };
};

interface TemplateFieldsFormProps {
  pending: PendingApply;
  fieldInfos: Array<ProjectFieldInfo>;
  values: FieldValues;
  setValues: React.Dispatch<React.SetStateAction<FieldValues>>;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  currentFieldPresentations?: Record<string, string | null>;
  // Values for empty ticket fields that field replacements use (tickets only).
  fieldInput?: ReplacementFieldInput;
  // The texts were filled in from the texts stored when the template was applied.
  textsRemembered?: boolean;
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
  fieldInput,
  textsRemembered = false,
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
  const { hasFields, fixedRelations, hasChanges, hasReplacements } = getFormContent(
    template,
    forArticle,
  );
  const replacementValues = fieldInput?.values ?? NO_VALUES;
  const preconditions = getReplacementPreconditions(
    template,
    forArticle ? "article" : "ticket",
    fieldInfos,
    currentFieldPresentations,
    true,
  );
  const requiredFields = preconditions.items
    .filter((item) => item.required && item.kind === "set_by_template")
    .map((item) => item.fieldName);

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
                requiredFields={requiredFields}
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
            <RememberedTextsHint show={textsRemembered}/>
            <ReplacementInputs
              template={template}
              preconditions={preconditions}
              texts={texts}
              setTexts={setTexts}
              currentFieldPresentations={currentFieldPresentations}
              fieldInfos={fieldInfos}
              fieldInput={fieldInput}
            />
          </FormSection>
        )}
      </div>
      <FormActions
        label={ACTION_LABELS[pending.mode]}
        submitting={submitting}
        missingTexts={hasMissingRequiredInput(
          template,
          texts,
          preconditions,
          values,
          replacementValues,
        )}
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
  // Not created: struck through.
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
  if (inclusion.undecided) {
    return (
      <div className="template-hierarchy-child template-hierarchy-child-undecided" style={indentStyle(depth)}>
        <ChildTitle child={child} note={inclusion.reason}/>
      </div>
    );
  }
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
      <ChildTitle
        child={child}
        note={[formatChildConditionNote(child, fieldInfos, getTemplateOptions(template)), formatInheritance(child)]
          .filter(Boolean)
          .join(" · ")}
      />
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

// "3 of 5 subtasks are created below this ticket, 2 depend on your answers".
const formatCreatedCount = (
  created: number,
  total: number,
  undecided: number,
  noun: "subtask" | "sub-article",
  parent: "ticket" | "article",
): string => {
  let text: string;
  if (created === total) {
    text = total === 1 ? `1 ${noun} is created` : `${total} ${noun}s are created`;
  } else {
    text = `${created} of ${total} ${noun}s are created`;
  }
  text += ` below this ${parent}`;
  if (undecided > 0) {
    text += `, ${undecided} depend${undecided === 1 ? "s" : ""} on your answers`;
  }
  return text;
};

const countInclusion = (flat: ReadonlyArray<{ child: ChildTemplate }>, inclusion: Record<string, ChildInclusion>) => ({
  created: flat.filter(({ child }) => inclusion[child.id]?.created).length,
  undecided: flat.filter(({ child }) => inclusion[child.id]?.undecided).length,
});

const UNANSWERED_HINT = "Answer all options to continue.";

// Answers given to the template's options, keyed by option id.
export type OptionInput = {
  values: OptionValues;
  setValues: React.Dispatch<React.SetStateAction<OptionValues>>;
};

interface OptionsSectionProps {
  template: Template;
  optionInput: OptionInput;
  noun: "subtask" | "sub-article";
}

// The template's options that decide which subtasks are created, each answered Yes or No. Options
// without a default start unanswered and must be answered.
const OptionsSection: React.FunctionComponent<OptionsSectionProps> = ({ template, optionInput, noun }) => {
  const used = getUsedOptions(template);
  if (used.length === 0) {
    return null;
  }
  return (
    <FormSection title="Options">
      <EffectList>
        {used.map(({ option, childIds }) => {
          const value = optionInput.values[option.id];
          const answered = typeof value === "boolean";
          return (
            <EffectRow key={option.id} label={option.label}>
              <OptionAnswerInput
                label={option.label}
                value={answered ? value : null}
                onChange={(answer) => optionInput.setValues((prev) => ({ ...prev, [option.id]: answer }))}
              />{" "}
              <Text size={Text.Size.S} info>
                {answered
                  ? `decides ${childIds.length === 1 ? `1 ${noun}` : `${childIds.length} ${noun}s`}`
                  : "Choose Yes or No"}
              </Text>
            </EffectRow>
          );
        })}
      </EffectList>
    </FormSection>
  );
};

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
  // Answers to the template's options, which decide which sub-articles are created.
  optionInput: OptionInput;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // A hierarchy for this template was created for the article before.
  alreadyCreated: boolean;
  // The texts were filled in from the texts stored when the template was applied.
  textsRemembered?: boolean;
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
  optionInput,
  textsRemembered = false,
  submitting,
  onConfirm,
  onBack,
  backLabel = "Back",
}) => {
  const flat = flattenChildTemplates(getChildTemplates(template));
  const hasReplacements = getTemplateReplacements(template).length > 0;
  const preconditions = getReplacementPreconditions(template, "article", [], undefined, false);
  // Articles have no fields: only option conditions decide.
  const inclusion = evaluateChildInclusion(template, {}, [], optionInput.values, true);
  const counts = countInclusion(flat, inclusion);
  const unanswered = getUnansweredOptions(template, optionInput.values);
  const options = getTemplateOptions(template);

  return (
    <>
      <div className="template-fields-form">
        <H3>Create sub-articles from {template.name}</H3>
        {alreadyCreated && <AlreadyCreatedBanner noun="sub-articles" parent="article"/>}
        <OptionsSection template={template} optionInput={optionInput} noun="sub-article"/>
        {hasReplacements && (
          <FormSection title="Text replacements, used in every sub-article">
            <RememberedTextsHint show={textsRemembered}/>
            <ReplacementInputs
              template={template}
              preconditions={preconditions}
              texts={texts}
              setTexts={setTexts}
              fieldInfos={[]}
            />
          </FormSection>
        )}
        <FormSection
          title={formatCreatedCount(counts.created, flat.length, counts.undecided, "sub-article", "article")}
        >
          <div className="template-hierarchy-list">
            {flat.map(({ child, depth }) => {
              const state = inclusion[child.id] ?? { created: true, reason: null };
              if (state.undecided) {
                return (
                  <div
                    key={child.id}
                    className="template-hierarchy-child template-hierarchy-child-undecided"
                    style={indentStyle(depth)}
                  >
                    <ChildTitle child={child} note={state.reason}/>
                  </div>
                );
              }
              if (!state.created) {
                return (
                  <div
                    key={child.id}
                    className="template-hierarchy-child template-hierarchy-child-skipped"
                    style={indentStyle(depth)}
                  >
                    <ChildTitle child={child} skipped note={`Not created: ${state.reason}`}/>
                  </div>
                );
              }
              const tags = getTemplateTags(child);
              const note = [
                formatChildConditionNote(
                  { ...child, addConditions: getChildAddConditions(child).filter(isOptionCondition) },
                  [],
                  options,
                ),
                tags.length > 0 ? `Tags ${tags.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={child.id} className="template-hierarchy-child" style={indentStyle(depth)}>
                  <ChildTitle child={child} note={note || null}/>
                </div>
              );
            })}
          </div>
        </FormSection>
      </div>
      <FormActions
        label={formatHierarchyLabel("article", alreadyCreated)}
        submitting={submitting}
        missingTexts={
          unanswered.length > 0 || hasMissingRequiredInput(template, texts, preconditions, {}, {})
        }
        missingHint={unanswered.length > 0 ? UNANSWERED_HINT : undefined}
        onConfirm={onConfirm}
        onBack={onBack}
        backLabel={backLabel}
      />
    </>
  );
};

// Values chosen for multi-value root ticket fields that decide which subtasks are created.
export type MultiConditionInput = {
  values: MultiFieldValues;
  setValues: React.Dispatch<React.SetStateAction<MultiFieldValues>>;
};

// Display text of a field value name, falling back to the name itself.
const getValuePresentation = (
  fieldInfos: ReadonlyArray<ProjectFieldInfo>,
  fieldName: string,
  valueName: string,
): string =>
  fieldInfos.find((info) => info.name === fieldName)?.values.find((value) => value.name === valueName)
    ?.presentation ?? valueName;

interface MultiValueConditionSelectProps {
  fieldInfo: ProjectFieldInfo | undefined;
  fieldName: string;
  valueNames: ReadonlyArray<string>;
  onChange: (fieldName: string, valueNames: Array<string>) => void;
}

// Multi-select over the values of a multi-value field; the chosen values replace the field's
// values. Looks like the single-value select next to it.
const MultiValueConditionSelect: React.FunctionComponent<MultiValueConditionSelectProps> = ({
  fieldInfo,
  fieldName,
  valueNames,
  onChange,
}) => {
  const items = useMemo(
    () => (fieldInfo ? fieldInfo.values.map((v) => ({ key: v.name, label: v.presentation })) : []),
    [fieldInfo],
  );
  // Values the field holds that the project no longer offers are kept as they are.
  const selected = useMemo(
    () =>
      valueNames.map(
        (name) => items.find((item) => item.key === name) ?? { key: name, label: name },
      ),
    [items, valueNames],
  );
  return (
    <Select
      multiple
      filter
      clear
      label="None"
      id={`condition-field-${fieldName}`}
      type={Select.Type.INLINE}
      size={Select.Size.AUTO}
      data={items}
      selected={selected}
      onChange={(chosen: Array<SelectItem>) => onChange(fieldName, chosen.map((item) => String(item.key)))}
    />
  );
};

interface ConditionFieldsSectionProps {
  template: Template;
  fieldInfos: Array<ProjectFieldInfo>;
  currentFieldValues: FieldValues;
  currentConditionValues: ConditionValues;
  currentFieldPresentations: Record<string, string | null>;
  fieldInput: ReplacementFieldInput;
  multiInput: MultiConditionInput;
}

// The root ticket fields that decide which conditional subtasks are created, with selects to
// change them; changed values are set on the ticket when the subtasks are created. Multi-value
// fields get a multi-select whose chosen values replace the field's values.
const ConditionFieldsSection: React.FunctionComponent<ConditionFieldsSectionProps> = ({
  template,
  fieldInfos,
  currentFieldValues,
  currentConditionValues,
  currentFieldPresentations,
  fieldInput,
  multiInput,
}) => {
  const fields = getChildConditionFields(template);
  if (fields.length === 0) {
    return null;
  }
  const changed = getChangedConditionValues(
    template,
    fieldInput.values,
    currentConditionValues,
    multiInput.values,
    fieldInfos,
  );
  const describe = (fieldName: string, childCount: number): string => {
    const decides = `decides ${childCount === 1 ? "1 subtask" : `${childCount} subtasks`}`;
    if (!(fieldName in changed)) {
      return decides;
    }
    const value = changed[fieldName];
    if (Array.isArray(value)) {
      const current = currentConditionValues[fieldName] ?? [];
      const change = formatValueListChange(
        value.filter((name) => !current.includes(name)).map((name) => getValuePresentation(fieldInfos, fieldName, name)),
        current.filter((name) => !value.includes(name)).map((name) => getValuePresentation(fieldInfos, fieldName, name)),
      );
      return change ? `${change} on this ticket` : decides;
    }
    return `Changes ${fieldName} from ${currentFieldPresentations[fieldName] ?? "empty"} to ${getValuePresentation(fieldInfos, fieldName, value)} on this ticket`;
  };
  return (
    <FormSection title="Decides which subtasks are created">
      <EffectList>
        {fields.map(({ fieldName, childIds }) => (
          <EffectRow key={`condition-${fieldName}`} label={fieldName}>
            {isMultiValueFieldName(fieldInfos, fieldName) ? (
              <MultiValueConditionSelect
                fieldInfo={fieldInfos.find((info) => info.name === fieldName)}
                fieldName={fieldName}
                valueNames={multiInput.values[fieldName] ?? currentConditionValues[fieldName] ?? []}
                onChange={(name, valueNames) =>
                  multiInput.setValues((prev) => ({ ...prev, [name]: valueNames }))
                }
              />
            ) : (
              <UserInputFieldSelect
                field={{ fieldName, mode: "user_input" }}
                fieldInfos={fieldInfos}
                value={fieldInput.values[fieldName] ?? currentFieldValues[fieldName] ?? null}
                onChange={(name, value) =>
                  fieldInput.setValues((prev) => ({ ...prev, [name]: value }))
                }
              />
            )}{" "}
            <Text size={Text.Size.S} info>
              {describe(fieldName, childIds.length)}
            </Text>
          </EffectRow>
        ))}
      </EffectList>
      {Object.keys(changed).length > 0 && (
        <Text size={Text.Size.S} info>
          Changing these fields may trigger other workflows, e.g. templates added automatically.
        </Text>
      )}
    </FormSection>
  );
};

// Field values and display texts of the root ticket with the changed condition fields applied,
// for previewing which subtasks are created and what replacements insert.
const withChangedConditions = (
  template: Template,
  fieldInfos: Array<ProjectFieldInfo>,
  currentConditionValues: ConditionValues,
  currentFieldPresentations: Record<string, string | null>,
  chosen: FieldValues,
  chosenMulti: MultiFieldValues,
) => {
  const changed = getChangedConditionValues(
    template,
    chosen,
    currentConditionValues,
    chosenMulti,
    fieldInfos,
  );
  const values: ConditionValues = { ...currentConditionValues };
  const presentations = { ...currentFieldPresentations };
  for (const [fieldName, value] of Object.entries(changed)) {
    const names = Array.isArray(value) ? value : [value];
    values[fieldName] = names;
    presentations[fieldName] =
      names.length === 0
        ? null
        : names.map((name) => getValuePresentation(fieldInfos, fieldName, name)).join(", ");
  }
  return { values, presentations };
};

interface HierarchyFormProps {
  template: Template;
  fieldInfos: Array<ProjectFieldInfo>;
  // Current field values of the root ticket (the first value of multi-value fields).
  currentFieldValues: FieldValues;
  // All current values of the root ticket's fields, used to preview which subtasks are created.
  currentConditionValues: ConditionValues;
  currentFieldPresentations: Record<string, string | null>;
  values: ChildFieldValues;
  setValues: React.Dispatch<React.SetStateAction<ChildFieldValues>>;
  texts: ReplacementTexts;
  setTexts: React.Dispatch<React.SetStateAction<ReplacementTexts>>;
  // A hierarchy for this template was created for the ticket before.
  alreadyCreated: boolean;
  // Values for empty root ticket fields that field replacements use.
  fieldInput: ReplacementFieldInput;
  // Values chosen for multi-value root ticket fields that decide which subtasks are created.
  multiConditionInput: MultiConditionInput;
  // Answers to the template's options, which decide which subtasks are created.
  optionInput: OptionInput;
  // The texts were filled in from the texts stored when the template was applied.
  textsRemembered?: boolean;
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
  currentConditionValues,
  currentFieldPresentations,
  values,
  setValues,
  texts,
  setTexts,
  alreadyCreated,
  fieldInput,
  multiConditionInput,
  optionInput,
  textsRemembered = false,
  submitting,
  onConfirm,
  onBack,
  backLabel = "Back",
}) => {
  const flat = flattenChildTemplates(getChildTemplates(template));
  // Preview with the condition fields the user changed in this form.
  const effective = withChangedConditions(
    template,
    fieldInfos,
    currentConditionValues,
    currentFieldPresentations,
    fieldInput.values,
    multiConditionInput.values,
  );
  const preconditions = getReplacementPreconditions(
    template,
    "ticket",
    fieldInfos,
    effective.presentations,
    false,
  );
  const inclusion = evaluateChildInclusion(template, effective.values, fieldInfos, optionInput.values);
  const counts = countInclusion(flat, inclusion);
  const unanswered = getUnansweredOptions(template, optionInput.values);
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
        <OptionsSection template={template} optionInput={optionInput} noun="subtask"/>
        <ConditionFieldsSection
          template={template}
          fieldInfos={fieldInfos}
          currentFieldValues={currentFieldValues}
          currentConditionValues={currentConditionValues}
          currentFieldPresentations={currentFieldPresentations}
          fieldInput={fieldInput}
          multiInput={multiConditionInput}
        />
        {hasReplacements && (
          <FormSection title="Text replacements, used in every subtask">
            <RememberedTextsHint show={textsRemembered}/>
            <ReplacementInputs
              template={template}
              preconditions={preconditions}
              texts={texts}
              setTexts={setTexts}
              currentFieldPresentations={effective.presentations}
              fieldInfos={fieldInfos}
              fieldInput={fieldInput}
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
        <FormSection
          title={formatCreatedCount(counts.created, flat.length, counts.undecided, "subtask", "ticket")}
        >
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
        missingTexts={
          unanswered.length > 0 ||
          hasMissingRequiredInput(template, texts, preconditions, {}, fieldInput.values)
        }
        missingHint={unanswered.length > 0 ? UNANSWERED_HINT : undefined}
        onConfirm={onConfirm}
        onBack={onBack}
        backLabel={backLabel}
      />
    </>
  );
};
