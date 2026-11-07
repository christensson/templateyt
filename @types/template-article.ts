// Project of an article, relative to the project whose templates are configured.
export type ArticleProjectInfo = {
  projectKey: string;
  projectName: string;
  isOtherProject: boolean;
  // The article's template settings list the project, so the other project's admin chose to
  // share it; false for articles without settings (shared with all projects).
  isExplicitlyShared?: boolean;
  // False when the article's template settings don't allow this project to use it; set for the
  // articles of stored templates only.
  isShared?: boolean;
};

export type TemplateArticle = ArticleProjectInfo & {
  articleId: string;
  summary: string;
};
