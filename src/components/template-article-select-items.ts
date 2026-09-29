import type { SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import type { TemplateArticle } from "../../@types/template-article";

export type TemplateArticleSelectItem = SelectItem<{ templateArticleItem: TemplateArticle }>;

// Select items for picking a template article, labelled with id and summary.
export const getTemplateArticleSelectItems = (
  data: Array<TemplateArticle>,
): Array<TemplateArticleSelectItem> =>
  data.map((templateArticle: TemplateArticle) => ({
    key: templateArticle.articleId,
    rgItemType: 2,
    label: `${templateArticle.articleId}: ${templateArticle.summary}`,
    templateArticleItem: templateArticle,
  }));
