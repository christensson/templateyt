// Project of an article, relative to the project whose templates are configured.
export type ArticleProjectInfo = {
  projectKey: string;
  projectName: string;
  isOtherProject: boolean;
};

export type TemplateArticle = ArticleProjectInfo & {
  articleId: string;
  summary: string;
};
