import WarningIcon from "@jetbrains/icons/warning-empty";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import React, { useMemo } from "react";
import type { Template } from "../../@types/template";

interface TemplateListProps {
  templates: Array<Template>;
  selectedTemplate: Template | null;
  setSelectedTemplate: (selectedTemplate: Template) => void;
  templateIdGroupMap?: { [key: string]: string };
  groupOrder?: Array<string>;
  onlyShowGrouped?: boolean;
  className?: string;
}

const TemplateList: React.FunctionComponent<TemplateListProps> = ({
  templates,
  selectedTemplate,
  setSelectedTemplate,
  templateIdGroupMap,
  groupOrder,
  onlyShowGrouped,
  className,
}) => {
  const getListItems = (
    data: Array<Template>,
    templateIdGroupMap?: { [key: string]: string },
    groupOrder?: Array<string>,
    onlyShowGrouped?: boolean
  ): Array<ListDataItem<{ templateItem?: Template }>> => {
    const getDetails = (template: Template): [string, boolean] => {
      if (!template?.validCondition) {
        return ["Incomplete configuration! No validity condition set.", true];
      }
      const validCond = template.validCondition;

      let description = "";
      if (validCond.when === "entity_is") {
        description +=
          validCond.entityType === "issue" ? "Valid when ticket" : "Valid when article";
      } else if (validCond.when === "field_is") {
        description += `Valid when ticket field ${validCond.fieldName} is ${validCond.fieldValue}`;
      } else if (validCond.when === "tag_is") {
        description += `Valid when tagged with ${validCond.tagName}`;
      }

      if (template.addCondition === null) {
        description += ".";
      } else {
        const addCond = template.addCondition;
        description += ", ";
        if (addCond.when === "field_becomes") {
          description += `added when ticket field ${addCond.fieldName} becomes ${addCond.fieldValue}`;
        } else if (addCond.when === "tag_added") {
          description += `added when tagged with ${addCond.tagName}`;
        }
        description += ".";
      }
      return [description, false];
    };

    const makeListItem = (template: Template): ListDataItem<{ templateItem?: Template }> => {
      const [details, hasWarning] = getDetails(template);
      return {
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
    () => getListItems(templates, templateIdGroupMap, groupOrder, onlyShowGrouped),
    [templates, templateIdGroupMap, groupOrder, onlyShowGrouped]
  );

  return (
    <List
      data={listItems}
      activeIndex={
        selectedTemplate != null
          ? listItems.findIndex(
              (item) => item?.templateItem && item.templateItem.id === selectedTemplate?.id
            )
          : null
      }
      onSelect={(item: ListDataItem<{ templateItem?: Template }>) => {
        if (item.templateItem) {
          setSelectedTemplate(item.templateItem);
        }
      }}
      activateSingleItem
      className={className}
    />
  );
};

export default TemplateList;
