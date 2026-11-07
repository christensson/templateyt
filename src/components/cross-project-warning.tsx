import WarningIcon from "@jetbrains/icons/warning-empty";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import Text from "@jetbrains/ring-ui-built/components/text/text";
import React from "react";
import { type ChildTemplate, getTemplateScope, type Template } from "../../@types/template";
import {
  getOtherProjectArticles,
  isExplicitlySharedArticle,
  type OtherProjectArticle,
  useArticleProjects,
} from "./article-projects";

// What the template's content is copied into, for the warning text.
const getTargetWording = (template: Template): string => {
  const scope = getTemplateScope(template);
  if (scope.tickets && scope.articles) {
    return "tickets and articles";
  }
  return scope.articles ? "articles" : "tickets";
};

const uniqueProjectNames = (articles: Array<OtherProjectArticle>): Array<string> =>
  articles.map((a) => a.projectName).filter((name, i, all) => all.indexOf(name) === i);

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
// Articles from other projects that share them with this project explicitly get an informational
// note; the others, shared with all projects by default, get a warning.
export const CrossProjectWarning: React.FunctionComponent<CrossProjectWarningProps> = ({ template }) => {
  const projects = useArticleProjects();
  const others = getOtherProjectArticles(template, projects);
  if (others.length === 0) {
    return null;
  }
  const shared = others.filter((a) => a.isExplicitlyShared);
  const unshared = others.filter((a) => !a.isExplicitlyShared);
  const target = getTargetWording(template);
  const title = (articles: Array<OtherProjectArticle>) =>
    articles.length === 1 ? "Article from another project" : "Articles from another project";
  return (
    <>
      {unshared.length > 0 && (
        <Banner mode="warning" withIcon title={title(unshared)}>
          This template uses {describeArticles(unshared)}. When the template is added
          automatically, the content is copied into new {target} in this project. Everyone who can
          see those {target} can read it, also users without access to{" "}
          {joinNames(uniqueProjectNames(unshared))}.
        </Banner>
      )}
      {shared.length > 0 && (
        <Banner mode="info" withIcon title={title(shared)}>
          This template uses {describeArticles(shared)}, shared with this project. The content is
          copied into {target} in this project, visible to everyone who can see them.
        </Banner>
      )}
    </>
  );
};

interface NotSharedNoteProps {
  articleId: string;
}

// Error note next to an inserted child article whose template settings no longer allow this
// project to use it.
export const NotSharedNote: React.FunctionComponent<NotSharedNoteProps> = ({ articleId }) => {
  const projects = useArticleProjects();
  if (projects[articleId]?.isShared !== false) {
    return null;
  }
  return (
    <Banner mode="error" withIcon title="Article not shared with this project">
      Template article {articleId} can no longer be used in this project, see its &quot;Configure
      as template&quot; settings. The template still works, but can&apos;t be saved until the child
      template is removed or the article is shared with this project.
    </Banner>
  );
};

interface OtherProjectNoteProps {
  template: Template;
  child: ChildTemplate;
}

// Inline note next to a child template's article that belongs to another project: a warning, or
// informational when the other project shares it explicitly with this project.
export const OtherProjectNote: React.FunctionComponent<OtherProjectNoteProps> = ({ template, child }) => {
  const projects = useArticleProjects();
  const info = projects[child.articleId];
  if (!info?.isOtherProject) {
    return null;
  }
  if (isExplicitlySharedArticle(template, child.id, projects)) {
    return (
      <Text size={Text.Size.S} info>
        From project {info.projectName}, shared with this project.
      </Text>
    );
  }
  return (
    <Text size={Text.Size.S} className="template-other-project-note">
      <Icon glyph={WarningIcon} className="template-section-warning"/>
      From project {info.projectName}: its content is copied into this project, visible to everyone
      who can see the result.
    </Text>
  );
};
