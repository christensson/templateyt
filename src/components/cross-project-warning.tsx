import WarningIcon from "@jetbrains/icons/warning-empty";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";
import { getTemplateScope, type Template } from "../../@types/template";
import { getOtherProjectArticles, useArticleProjects } from "./article-projects";

// What the template's content is copied into, for the warning text.
const getTargetWording = (template: Template): string => {
  const scope = getTemplateScope(template);
  if (scope.tickets && scope.articles) {
    return "tickets and articles";
  }
  return scope.articles ? "articles" : "tickets";
};

const joinNames = (names: Array<string>): string =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// Article ids grouped by project, e.g. "DOC-A-1 and DOC-A-2 from project Docs".
const describeArticles = (articles: Array<{ articleId: string; projectName: string }>): string => {
  const byProject: Record<string, Array<string>> = {};
  for (const { articleId, projectName } of articles) {
    (byProject[projectName] ??= []).push(articleId);
  }
  return joinNames(
    Object.entries(byProject).map(([projectName, ids]) => `${joinNames(ids)} from project ${projectName}`),
  );
};

interface CrossProjectWarningProps {
  template: Template;
}

// Warns that a template uses articles (root or child) from other projects, whose content is
// copied into this project regardless of the access of the user the template is applied for.
export const CrossProjectWarning: React.FunctionComponent<CrossProjectWarningProps> = ({ template }) => {
  const projects = useArticleProjects();
  const others = getOtherProjectArticles(template, projects);
  if (others.length === 0) {
    return null;
  }
  const projectNames = joinNames(
    others.map((a) => a.projectName).filter((name, i, all) => all.indexOf(name) === i),
  );
  const target = getTargetWording(template);
  return (
    <Banner
      mode="warning"
      withIcon
      title={others.length === 1 ? "Article from another project" : "Articles from another project"}
    >
      This template uses {describeArticles(others)}. When the template is added automatically, the
      content is copied into new {target} in this project. Everyone who can see those {target} can
      read it, also users without access to {projectNames}.
    </Banner>
  );
};

interface OtherProjectNoteProps {
  articleId: string;
}

// Inline note next to a single article that belongs to another project.
export const OtherProjectNote: React.FunctionComponent<OtherProjectNoteProps> = ({ articleId }) => {
  const projects = useArticleProjects();
  const info = projects[articleId];
  if (!info?.isOtherProject) {
    return null;
  }
  return (
    <Text size={Text.Size.S} className="template-other-project-note">
      <Icon glyph={WarningIcon} className="template-section-warning"/>
      From project {info.projectName}: its content is copied into this project, visible to everyone
      who can see the result.
    </Text>
  );
};
