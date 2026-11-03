import ChevronDownIcon from "@jetbrains/icons/chevron-down";
import ChevronRightIcon from "@jetbrains/icons/chevron-right";
import WarningIcon from "@jetbrains/icons/warning-empty";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import React, { useMemo } from "react";
import type { ArticleProjectInfo } from "../../@types/template-article";
import { getOtherProjectArticles, useArticleProjects } from "./article-projects";
import {
  ChildTemplate,
  Template,
  flattenChildTemplates,
  formatChildTemplate,
  formatTemplateAddCondition,
  formatTemplateFields,
  formatTemplateHierarchy,
  formatTemplateReplacements,
  formatTemplateEffectTokens,
  formatTemplateSummaryTokens,
  formatTemplateValidCondition,
  getChildTemplates,
  type TemplateTarget,
  validateChildTemplate,
  validateTemplate,
} from "../../@types/template";

// How list rows describe a template: the full configuration sentence ("config", default), compact
// configuration tokens with validation warnings ("compact", configuration page), or what applying
// it does ("effect", apply dialogs).
export type TemplateDetailsMode = "config" | "compact" | "effect";

// Status note shown before the details of a row, optionally flagged with a warning icon.
export type TemplateRowStatus = { text: string; warning: boolean };

// Ring UI indents list items by one --ring-unit (8px) per level; use several per tree depth so
// the hierarchy is visible at a glance.
const LEVELS_PER_DEPTH = 3;

// Invisible glyph of the same size as the chevrons, so that rows without a chevron keep the
// same label indent as expandable rows.
const BLANK_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"></svg>';

// Left glyph of a template row in tree mode: chevron for hierarchical templates, blank otherwise.
const getTreeGlyph = (template: Template, isSelected: boolean): string => {
  if (!template.hierarchical) {
    return BLANK_GLYPH;
  }
  return isSelected ? ChevronDownIcon : ChevronRightIcon;
};

type TemplateListItem = ListDataItem<{
  templateItem?: Template;
  // Set on rows that represent a child template of `templateItem`.
  childTemplateItem?: ChildTemplate;
}>;

interface TemplateListProps {
  templates: Array<Template>;
  selectedTemplate: Template | null;
  setSelectedTemplate: (selectedTemplate: Template | null) => void;
  templateIdGroupMap?: { [key: string]: string };
  groupOrder?: Array<string>;
  onlyShowGrouped?: boolean;
  className?: string;
  disabled?: boolean;
  // Show the child templates of the selected hierarchical template as indented rows below it.
  // Other hierarchical templates show a chevron to indicate that they expand when selected.
  showChildren?: boolean;
  selectedChildId?: string | null;
  onSelectChild?: (template: Template, child: ChildTemplate) => void;
  detailsMode?: TemplateDetailsMode;
  // What the templates are applied to, for "effect" details.
  target?: TemplateTarget;
  // Status notes by template id, shown before the details.
  rowStatus?: { [templateId: string]: TemplateRowStatus };
  // Unsaved new template: labelled as new and not flagged as incomplete while being filled in.
  draftTemplateId?: string;
}

const getDetails = (template: Template): [string, boolean] => {
  const hasNoValid =
    !template?.validCondition ||
    (Array.isArray(template.validCondition) && template.validCondition.length === 0);
  if (hasNoValid) {
    return ["Incomplete configuration! No validity condition set.", true];
  }

  const parts = [formatTemplateValidCondition(template)];
  if (template.addCondition !== null) {
    parts.push(formatTemplateAddCondition(template));
  }
  const fieldsDescription = formatTemplateFields(template);
  if (fieldsDescription) {
    parts.push(fieldsDescription);
  }
  const replacementsDescription = formatTemplateReplacements(template);
  if (replacementsDescription) {
    parts.push(replacementsDescription);
  }
  const hierarchyDescription = formatTemplateHierarchy(template);
  if (hierarchyDescription) {
    parts.push(hierarchyDescription);
  }
  return [parts.join(" "), false];
};

// Compact row details: summary tokens, or the first problem of an incomplete template.
const getCompactDetails = (template: Template, isDraft: boolean): [string, boolean] => {
  if (isDraft) {
    return ["Not saved yet.", false];
  }
  const errors = validateTemplate(template);
  if (errors.length > 0) {
    return [`Incomplete: ${errors[0].message}`, true];
  }
  return [formatTemplateSummaryTokens(template).join(" · "), false];
};

// Indented row of a child template below its template; flags problems in compact mode.
const makeChildItem = (
  template: Template,
  child: ChildTemplate,
  depth: number,
  disabled: boolean | undefined,
  compact: boolean | undefined,
  articleProjects: Readonly<Record<string, ArticleProjectInfo>>,
): TemplateListItem => {
  const errors = compact ? validateChildTemplate(template, child) : [];
  const otherProject = articleProjects[child.articleId]?.isOtherProject
    ? articleProjects[child.articleId].projectName
    : null;
  let details = formatChildTemplate(child);
  if (errors.length > 0) {
    details = `Incomplete: ${errors[0].message}`;
  } else if (otherProject !== null) {
    details = `Article from project ${otherProject} · ${details}`;
  }
  return {
    disabled,
    key: child.id,
    rgItemType: 2,
    level: (depth + 1) * LEVELS_PER_DEPTH,
    glyph: BLANK_GLYPH,
    label: child.name.trim() || child.articleId,
    details: details,
    rightGlyph: errors.length > 0 || otherProject !== null ? WarningIcon : undefined,
    templateItem: template,
    childTemplateItem: child,
  };
};

type ListOptions = {
  detailsMode?: TemplateDetailsMode;
  target?: TemplateTarget;
  rowStatus?: { [templateId: string]: TemplateRowStatus };
  draftTemplateId?: string;
  // Projects of the template articles; rows using articles from other projects are flagged.
  articleProjects?: Readonly<Record<string, ArticleProjectInfo>>;
};

const getRowDetails = (
  template: Template,
  isDraft: boolean,
  { detailsMode, target, rowStatus }: ListOptions,
): [string, boolean] => {
  if (detailsMode === "compact") {
    return getCompactDetails(template, isDraft);
  }
  if (detailsMode !== "effect") {
    return getDetails(template);
  }
  const status = rowStatus?.[template.id];
  const tokens = formatTemplateEffectTokens(template, target ?? "ticket");
  return [[...(status ? [status.text] : []), ...tokens].join(" · "), status?.warning ?? false];
};

const getListItems = (
  data: Array<Template>,
  templateIdGroupMap?: { [key: string]: string },
  groupOrder?: Array<string>,
  onlyShowGrouped?: boolean,
  disabled?: boolean,
  selectedTemplate: Template | null = null,
  showChildren?: boolean,
  options: ListOptions = {},
): Array<TemplateListItem> => {
  const { detailsMode, draftTemplateId } = options;
  const articleProjects = options.articleProjects ?? {};
  const compact = detailsMode === "compact";
  const makeListItems = (template: Template): Array<TemplateListItem> => {
    const isDraft = template.id === draftTemplateId;
    const [rowDetails, hasRowWarning] = getRowDetails(template, isDraft, options);
    // Incomplete templates keep their own message; otherwise articles from other projects are
    // flagged, since their content is copied into this project.
    const otherProjects = hasRowWarning ? [] : getOtherProjectArticles(template, articleProjects);
    const hasWarning = hasRowWarning || otherProjects.length > 0;
    const details =
      otherProjects.length > 0
        ? `Uses articles from other projects · ${rowDetails}`
        : rowDetails;
    const isSelected = template.id === selectedTemplate?.id;
    const itemDisabled = isSelected ? false : disabled;
    const expandable = showChildren && template.hierarchical;
    const items: Array<TemplateListItem> = [
      {
        disabled: itemDisabled,
        key: template.id,
        rgItemType: 2,
        label: isDraft && template.name.trim() === "" ? "New template" : template.name,
        details: details,
        templateItem: template,
        glyph: showChildren ? getTreeGlyph(template, isSelected) : undefined,
        rightGlyph: hasWarning ? WarningIcon : undefined,
      },
    ];
    if (expandable && isSelected) {
      for (const { child, depth } of flattenChildTemplates(getChildTemplates(template))) {
        items.push(makeChildItem(template, child, depth, itemDisabled, compact, articleProjects));
      }
    }
    return items;
  };

  const templatesInGroups: Record<string, Template[]> = {};
  const nonGroupedTemplates: Template[] = [];

  for (const template of data) {
    const group = templateIdGroupMap ? templateIdGroupMap[template.id] : null;
    if (group) {
      if (!(group in templatesInGroups)) {
        templatesInGroups[group] = [];
      }
      templatesInGroups[group].push(template);
    } else {
      nonGroupedTemplates.push(template);
    }
  }

  // Find group order.
  const allGroups = Object.keys(templatesInGroups);
  const groupOrderLocal = (groupOrder || []).filter((g) => g in templatesInGroups);
  const remainingGroups = allGroups.filter((g) => !groupOrderLocal.includes(g));
  const groupOrderAll = [...groupOrderLocal, ...remainingGroups];

  // Add grouped templates.
  const items: Array<TemplateListItem> = [];
  for (const group of groupOrderAll) {
    const templatesInGroup = templatesInGroups[group];
    if (templatesInGroup.length === 0) {
      continue;
    }
    items.push({
      rgItemType: 5,
      label: group,
    });
    items.push(...templatesInGroup.flatMap(makeListItems));
  }

  if (onlyShowGrouped) {
    return items;
  }

  // Add non-grouped templates.
  if (items.length > 0) {
    items.push({
      rgItemType: 5,
      label: "Other templates",
    });
  }
  items.push(...nonGroupedTemplates.flatMap(makeListItems));

  return items;
};

const findActiveIndex = (
  items: Array<TemplateListItem>,
  selectedTemplate: Template | null,
  selectedChildId: string | null | undefined,
): number => {
  if (selectedTemplate === null || selectedTemplate.id === "") {
    return -1;
  }
  if (selectedChildId) {
    return items.findIndex((item) => item?.childTemplateItem?.id === selectedChildId);
  }
  return items.findIndex(
    (item) => item?.templateItem?.id === selectedTemplate.id && !item.childTemplateItem,
  );
};

const TemplateList: React.FunctionComponent<TemplateListProps> = ({
  templates,
  selectedTemplate,
  setSelectedTemplate,
  templateIdGroupMap,
  groupOrder,
  onlyShowGrouped,
  className,
  disabled,
  showChildren,
  selectedChildId,
  onSelectChild,
  detailsMode,
  target,
  rowStatus,
  draftTemplateId,
}) => {
  const articleProjects = useArticleProjects();
  const listItems = useMemo(
    () =>
      getListItems(
        templates,
        templateIdGroupMap,
        groupOrder,
        onlyShowGrouped,
        disabled,
        selectedTemplate,
        showChildren,
        { detailsMode, target, rowStatus, draftTemplateId, articleProjects },
      ),
    [
      articleProjects,
      detailsMode,
      target,
      rowStatus,
      draftTemplateId,
      templates,
      templateIdGroupMap,
      groupOrder,
      onlyShowGrouped,
      disabled,
      selectedTemplate,
      showChildren,
    ],
  );

  return (
    <List
      data={listItems}
      activeIndex={findActiveIndex(listItems, selectedTemplate, selectedChildId)}
      onSelect={(item: TemplateListItem) => {
        if (!item.templateItem) {
          return;
        }
        if (item.childTemplateItem) {
          onSelectChild?.(item.templateItem, item.childTemplateItem);
        } else {
          setSelectedTemplate(item.templateItem);
        }
      }}
      restoreActiveIndex={false}
      className={className}
    />
  );
};

export default TemplateList;
