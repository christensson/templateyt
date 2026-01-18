import WarningIcon from "@jetbrains/icons/warning-empty";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import React, { useMemo } from "react";
import {
  Template,
  formatTemplateAddCondition,
  formatTemplateValidCondition,
} from "../../@types/template";

interface TemplateListProps {
  templates: Array<Template>;
  selectedTemplate: Template | null;
  setSelectedTemplate: (selectedTemplate: Template | null) => void;
  templateIdGroupMap?: { [key: string]: string };
  groupOrder?: Array<string>;
  onlyShowGrouped?: boolean;
  className?: string;
  disabled?: boolean;
}

const TemplateList: React.FunctionComponent<TemplateListProps> = ({
  templates,
  selectedTemplate,
  setSelectedTemplate,
  templateIdGroupMap,
  groupOrder,
  onlyShowGrouped,
  className,
  disabled,
}) => {
  const getListItems = (
    data: Array<Template>,
    templateIdGroupMap?: { [key: string]: string },
    groupOrder?: Array<string>,
    onlyShowGrouped?: boolean,
    disabled?: boolean,
    selectedTemplate: Template | null = null
  ): Array<ListDataItem<{ templateItem?: Template }>> => {
    const getDetails = (template: Template): [string, boolean] => {
      if (!template?.validCondition) {
        return ["Incomplete configuration! No validity condition set.", true];
      }
      const validCond = template.validCondition;

      let description = formatTemplateValidCondition(template);

      if (template.addCondition !== null) {
        description += " " + formatTemplateAddCondition(template);
      }
      return [description, false];
    };

    const makeListItem = (template: Template): ListDataItem<{ templateItem?: Template }> => {
      const [details, hasWarning] = getDetails(template);
      return {
        disabled: template.id === selectedTemplate?.id ? false : disabled,
        key: template.id,
        rgItemType: 2,
        label: template.name,
        details: details,
        templateItem: template,
        rightGlyph: hasWarning ? WarningIcon : undefined,
      };
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
    const items: Array<ListDataItem<{ templateItem?: Template }>> = [];
    for (const group of groupOrderAll) {
      items.push({
        rgItemType: 5,
        label: group,
      });
      items.push(...templatesInGroups[group].map(makeListItem));
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
    items.push(...nonGroupedTemplates.map(makeListItem));

    return items;
  };

  const listItems = useMemo(
    () =>
      getListItems(
        templates,
        templateIdGroupMap,
        groupOrder,
        onlyShowGrouped,
        disabled,
        selectedTemplate
      ),
    [templates, templateIdGroupMap, groupOrder, onlyShowGrouped, disabled, selectedTemplate]
  );

  return (
    <List
      data={listItems}
      activeIndex={
        selectedTemplate != null && selectedTemplate.id !== ""
          ? listItems.findIndex(
              (item) => item?.templateItem && item.templateItem.id === selectedTemplate?.id
            )
          : -1
      }
      onSelect={(item: ListDataItem<{ templateItem?: Template }>) => {
        if (item.templateItem) {
          setSelectedTemplate(item.templateItem);
        }
      }}
      restoreActiveIndex={false}
      className={className}
    />
  );
};

export default TemplateList;
