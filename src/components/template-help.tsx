import ChevronDownIcon from "@jetbrains/icons/chevron-down";
import ChevronUpIcon from "@jetbrains/icons/chevron-up";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Collapse from "@jetbrains/ring-ui-built/components/collapse/collapse";
import CollapseContent from "@jetbrains/ring-ui-built/components/collapse/collapse-content";
import Link from "@jetbrains/ring-ui-built/components/link/link";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";

interface TemplateHelpProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  createNewTemplate: () => void;
}

const TemplateHelp: React.FunctionComponent<TemplateHelpProps> = ({
  collapsed,
  setCollapsed,
  createNewTemplate,
}) => {
  return (
    <div className="template-edit-help">
      <div>
        <Button
          icon={collapsed ? ChevronDownIcon : ChevronUpIcon}
          onClick={() => setCollapsed(!collapsed)}
          inline
        >
          {collapsed ? "Show help" : "Hide help"}
        </Button>
      </div>
      <Collapse collapsed={collapsed}>
        <CollapseContent>
          <div className="template-edit-help-content">
            <Text size={Text.Size.M}>
              Configure a template using the following steps:
              <ol>
                <li>
                  Create template article:
                  <ul>
                    <li>Add a knowledge base article to your project.</li>
                    <li>Edit article content to define the template.</li>
                    <li>
                      Configure the article as a template by clicking the ...-menu and then
                      selecting "Configure as Ticket Template".
                    </li>
                  </ul>
                </li>
                <li>
                  Configure the template:
                  <ul>
                    <li>
                      On the <i>Ticket Templats Config</i> page (current page) click{" "}
                      <Link onClick={() => createNewTemplate()}>add new template</Link>.
                    </li>
                    <li>
                      Name the template and search for the knowledge base article in the template
                      article dropdown.
                    </li>
                    <li>
                      Define when template is valid:
                      <ul>
                        <li>When ticket or article?</li>
                        <li>When ticket field has a specific value.</li>
                        <li>When ticket or article has a specific tag.</li>
                      </ul>
                    </li>
                    <li>
                      Define if template should be automatically applied:
                      <ul>
                        <li>When ticket field becomes a specific value.</li>
                        <li>When ticket or article is assigned a specific tag.</li>
                        <li>
                          If not automatically applied, apply template using "Apply template" menu
                          item available from ticket or article ...-menu.
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
              </ol>
            </Text>
          </div>
        </CollapseContent>
      </Collapse>
    </div>
  );
};

export default TemplateHelp;
