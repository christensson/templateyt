import Button from "@jetbrains/ring-ui-built/components/button/button";
import Code from "@jetbrains/ring-ui-built/components/code/code";
import Dialog from "@jetbrains/ring-ui-built/components/dialog/dialog";
import Content from "@jetbrains/ring-ui-built/components/island/content";
import Header from "@jetbrains/ring-ui-built/components/island/header";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import React, { useMemo } from "react";
import type { Template } from "../../@types/template";

interface TemplateJsonDialogProps {
  template: Template;
  show: boolean;
  onClose: () => void;
}

// Shows the raw JSON of a template, as it is stored in the project configuration.
const TemplateJsonDialog: React.FunctionComponent<TemplateJsonDialogProps> = ({
  template,
  show,
  onClose,
}) => {
  const json = useMemo(() => JSON.stringify(template, null, 2), [template]);
  return (
    <Dialog
      show={show}
      label={`JSON for ${template.name}`}
      showCloseButton
      trapFocus
      onCloseAttempt={onClose}
      contentClassName="template-json-dialog"
    >
      <Header>JSON for {template.name}</Header>
      <Content>
        <Code language="json" code={json} className="template-json-code"/>
      </Content>
      <Panel>
        <Button onClick={onClose}>Close</Button>
      </Panel>
    </Dialog>
  );
};

export default TemplateJsonDialog;
