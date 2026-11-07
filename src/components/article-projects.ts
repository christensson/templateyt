import { useSyncExternalStore } from "react";
import {
  type ChildTemplate,
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
        isExplicitlyShared: n.isExplicitlyShared === true,
      };
    }
    (Array.isArray(n.children) ? n.children : []).forEach(visit);
  };
  visit(node);
  addArticleProjects(entries);
};

// Template articles of the template that are not shared with the project: the template article
// and inserted child articles (imported ones are covered by the article they come from).
export const getNotSharedArticleIds = (template: Template, projects: ArticleProjects): Array<string> => {
  const articleIds = [
    template.articleId,
    ...flattenChildTemplates(getChildTemplates(template))
      .filter(({ child }) => child.manual)
      .map(({ child }) => child.articleId),
  ];
  return articleIds.filter(
    (id, index) => id && articleIds.indexOf(id) === index && projects[id]?.isShared === false,
  );
};

// Template article whose settings decide how the article of the child template is shared: the
// child's own when inserted, otherwise that of the nearest inserted ancestor, otherwise the
// template article (imported articles come from the tree of that article).
export const findSharingArticleId = (template: Template, childId: string): string => {
  const visit = (children: Array<ChildTemplate>, coveringId: string): string | null => {
    for (const child of children) {
      const own = child.manual ? child.articleId : coveringId;
      if (child.id === childId) {
        return own;
      }
      const found = visit(getChildTemplates(child), own);
      if (found !== null) {
        return found;
      }
    }
    return null;
  };
  return visit(getChildTemplates(template), template.articleId) ?? template.articleId;
};

// True if the article of the child template (the template article when childId is null) comes
// from another project that explicitly shares it with this project.
export const isExplicitlySharedArticle = (
  template: Template,
  childId: string | null,
  projects: ArticleProjects,
): boolean => {
  const sharingId = childId === null ? template.articleId : findSharingArticleId(template, childId);
  return projects[sharingId]?.isExplicitlyShared === true;
};

export type OtherProjectArticle = {
  articleId: string;
  projectName: string;
  // The other project shares the article explicitly with this project.
  isExplicitlyShared: boolean;
};

// Root and child articles of the template that belong to another project, in tree order.
export const getOtherProjectArticles = (
  template: Template,
  projects: ArticleProjects,
): Array<OtherProjectArticle> => {
  const entries: Array<{ articleId: string; childId: string | null }> = [
    { articleId: template.articleId, childId: null },
    ...flattenChildTemplates(getChildTemplates(template)).map(({ child }) => ({
      articleId: child.articleId,
      childId: child.id,
    })),
  ];
  const seen = new Set<string>();
  return entries
    .filter(({ articleId }) => {
      if (!articleId || seen.has(articleId) || !projects[articleId]?.isOtherProject) {
        return false;
      }
      seen.add(articleId);
      return true;
    })
    .map(({ articleId, childId }) => ({
      articleId,
      projectName: projects[articleId].projectName,
      isExplicitlyShared: isExplicitlySharedArticle(template, childId, projects),
    }));
};
