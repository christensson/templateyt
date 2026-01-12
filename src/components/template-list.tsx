import WarningIcon from "@jetbrains/icons/warning-empty";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import List, { ListDataItem } from "@jetbrains/ring-ui-built/components/list/list";
import React, { memo, useEffect, useMemo, useState } from "react";
import type { Template } from "../../@types/template";
import type { TemplateArticle } from "../../@types/template-article";

interface TemplateListProps {
  templates: Array<Template>;
  selectedTemplate: Template;
  setSelectedTemplate: (selectedTemplate: Template) => void;
}

const TemplateList: React.FunctionComponent<TemplateListProps> = ({
  templates,
  selectedTemplate,
  setSelectedTemplate,
}) => {
  const getListItems = (data: Array<Template>): Array<ListDataItem<{ templateItem: Template }>> => {
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

    const items: Array<ListDataItem<{ templateItem: Template }>> = data.map(
      (template: Template) => {
        const [details, hasWarning] = getDetails(template);
        return {
          key: template.id,
          rgItemType: 2,
          label: template.name,
          details: details,
          templateItem: template,
          rightGlyph: hasWarning ? WarningIcon : undefined,
        };
      }
    );
    return items;
  };

  const listItems = useMemo(() => getListItems(templates), [templates]);

  return (
    <List
      data={listItems}
      activeIndex={listItems.findIndex((item) => item.templateItem.id === selectedTemplate?.id)}
      onSelect={(item: ListDataItem<{ templateItem: Template }>) =>
        setSelectedTemplate(item.templateItem)
      }
      activateSingleItem
    />
  );
};

export default TemplateList;
