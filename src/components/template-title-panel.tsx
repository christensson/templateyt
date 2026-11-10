import Radio from "@jetbrains/ring-ui-built/components/radio/radio";
import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import Select from "@jetbrains/ring-ui-built/components/select/select";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";
import {
  formatTemplateTargetNoun,
  getTemplateTitle,
  type Template,
  type TemplateTitle,
  type TitleWhen,
} from "../../@types/template";

type TitleSourceKey = "keep" | TemplateTitle["source"];

type TitleSourceItem = SelectItem<{ sourceKey: TitleSourceKey }>;

interface TemplateTitlePanelProps {
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  // Title of the selected template article, when the user may see it; null otherwise.
  articleTitle: string | null;
}

// How the template sets the title of the ticket or article it is applied to: keep the title, or
// use the template article's title, always or only when the title is empty.
const TemplateTitlePanel: React.FunctionComponent<TemplateTitlePanelProps> = ({
  template,
  setTemplate,
  articleTitle,
}) => {
  const title = getTemplateTitle(template);
  const noun = formatTemplateTargetNoun(template);
  const items: Array<TitleSourceItem> = [
    { key: "keep", label: "Keep the current title", sourceKey: "keep" },
    {
      key: "article",
      label: articleTitle ? `Use the template article title: ${articleTitle}` : "Use the template article title",
      sourceKey: "article",
    },
  ];
  const selected = items.find((item) => item.sourceKey === (title?.source ?? "keep")) ?? items[0];

  const setTitle = (next: TemplateTitle | null) => setTemplate((prev) => ({ ...prev, title: next }));

  return (
    <div className="template-edit-field-panel">
      <Text size={Text.Size.S} info>
        Title
      </Text>
      <Select
        data={items}
        selected={selected}
        size={Select.Size.L}
        onChange={(item: TitleSourceItem | null) => {
          if (item === null || item.sourceKey === "keep") {
            setTitle(null);
          } else {
            // A new title setting starts as "only when empty", the safer choice.
            setTitle({ source: item.sourceKey, when: title?.when ?? "if_empty" });
          }
        }}
      />
      {title !== null && (
        <>
          <Radio
            value={title.when}
            onChange={(when: string) => setTitle({ ...title, when: when as TitleWhen })}
          >
            <Radio.Item value="if_empty">Only when the title is empty</Radio.Item>
            <Radio.Item value="always">Always</Radio.Item>
          </Radio>
          <Text size={Text.Size.S} info>
            {title.when === "always"
              ? `Replaces the ${noun} title when added automatically. The Apply template menu asks before replacing an existing title, preselected to replace.`
              : `An existing ${noun} title is kept when added automatically. The Apply template menu offers to replace it, preselected to keep.`}{" "}
            Words listed under Text replacements are filled in.
          </Text>
        </>
      )}
    </div>
  );
};

export default TemplateTitlePanel;
