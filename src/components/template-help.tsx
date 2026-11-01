import { H3 } from "@jetbrains/ring-ui-built/components/heading/heading";
import Link from "@jetbrains/ring-ui-built/components/link/link";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";

interface TemplateHelpProps {
  // Omitted while a template is being edited, so the link cannot discard the edits.
  createNewTemplate?: () => void;
}

// How templates work and how to set one up. Shown when no template is selected, or on demand.
const TemplateHelp: React.FunctionComponent<TemplateHelpProps> = ({ createNewTemplate }) => (
  <div className="template-edit-help-content">
    <H3 className="template-section-title">Getting started</H3>
    <Text size={Text.Size.M}>
      <ol>
        <li>
          Write the template content in a knowledge base article. Publish it, open its
          &quot;...&quot; menu and select &quot;Configure as template&quot;.
        </li>
        <li>
          {createNewTemplate ? (
            <Link onClick={() => createNewTemplate()}>Add a new template</Link>
          ) : (
            "Add a new template"
          )}
          , name it and pick the article.
        </li>
        <li>
          Under <i>When to use</i>, choose where the template is available in the Apply template
          menu, and optionally when it is applied automatically.
        </li>
        <li>Optionally, under <i>What it does</i>, set fields, tags, relations and text replacements.</li>
      </ol>
    </Text>
    <H3 className="template-section-title">Good to know</H3>
    <Text size={Text.Size.M}>
      <ul>
        <li>
          Templates applied automatically are added when a ticket field changes to a value, or
          when a ticket or article gets a tag. Fixed field values are set then too; fields chosen
          by the user and tags are only set when the template is applied manually.
        </li>
        <li>
          Text replacements replace whole words only: VERSION matches in &quot;Release
          VERSION.&quot; but not in VERSION-1 or MY_VERSION. They apply to the ticket summary, the
          template content and all subtasks. Text entered by the user is required when applying
          manually; a root ticket field inserts the display text of that field.
        </li>
        <li>
          Hierarchical templates create one subtask per child article, from &quot;Create
          hierarchy&quot; in the Apply template menu. Child templates can inherit fields from
          their parent or the root ticket (own fields first, then the closest parent, then the
          root ticket), and can be skipped based on root ticket fields. For articles, sub-articles
          get text replacements and tags only.
        </li>
      </ul>
    </Text>
  </div>
);

export default TemplateHelp;
