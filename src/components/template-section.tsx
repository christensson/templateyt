import WarningIcon from "@jetbrains/icons/warning-empty";
import { H3 } from "@jetbrains/ring-ui-built/components/heading/heading";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import React from "react";

interface TemplateSectionProps {
  title: string;
  // Marks the section as having validation errors.
  hasError?: boolean;
  children: React.ReactNode;
}

// Titled group of related settings in the template editor and view, e.g. "When to use".
const TemplateSection: React.FunctionComponent<TemplateSectionProps> = ({
  title,
  hasError,
  children,
}) => (
  <section className="template-section">
    <H3 className="template-section-title">
      {title}
      {hasError && (
        <Icon glyph={WarningIcon} className="template-section-warning" title="Needs attention"/>
      )}
    </H3>
    <div className="template-section-body">{children}</div>
  </section>
);

export default TemplateSection;
