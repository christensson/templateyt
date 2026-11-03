import { useSyncExternalStore } from "react";
import {
  flattenChildTemplates,
  getChildTemplates,
  type ImportedArticle,
  type Template,
} from "../../@types/template";
import type { ArticleProjectInfo } from "../../@types/template-article";

// Projects of the articles seen by the template configuration, keyed by article id. Filled from
// the backend responses (stored templates, template articles, imported article trees) so that
// every component can flag articles from other projects without passing them down.
type ArticleProjects = Readonly<Record<string, ArticleProjectInfo>>;

let current: ArticleProjects = {};
const listeners = new Set<() => void>();

export const addArticleProjects = (entries: Record<string, ArticleProjectInfo> | undefined) => {
  if (!entries || Object.keys(entries).length === 0) {
    return;
  }
  current = { ...current, ...entries };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useArticleProjects = (): ArticleProjects =>
  useSyncExternalStore(subscribe, () => current);

type ArticleTreeNode = ImportedArticle & Partial<ArticleProjectInfo>;

// Records the projects of all articles in an imported article tree.
export const addArticleTreeProjects = (node: ArticleTreeNode) => {
  const entries: Record<string, ArticleProjectInfo> = {};
  const visit = (n: ArticleTreeNode) => {
    if (typeof n.projectKey === "string") {
      entries[n.articleId] = {
        projectKey: n.projectKey,
        projectName: n.projectName ?? n.projectKey,
        isOtherProject: n.isOtherProject === true,
      };
    }
    (Array.isArray(n.children) ? n.children : []).forEach(visit);
  };
  visit(node);
  addArticleProjects(entries);
};

export type OtherProjectArticle = { articleId: string; projectName: string };

// Root and child articles of the template that belong to another project, in tree order.
export const getOtherProjectArticles = (
  template: Template,
  projects: ArticleProjects,
): Array<OtherProjectArticle> => {
  const articleIds = [
    template.articleId,
    ...flattenChildTemplates(getChildTemplates(template)).map(({ child }) => child.articleId),
  ];
  return articleIds
    .filter((id, index) => id && articleIds.indexOf(id) === index && projects[id]?.isOtherProject)
    .map((id) => ({ articleId: id, projectName: projects[id].projectName }));
};
