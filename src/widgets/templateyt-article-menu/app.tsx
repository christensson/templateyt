import Button from "@jetbrains/ring-ui-built/components/button/button";
import Checkbox from "@jetbrains/ring-ui-built/components/checkbox/checkbox";
import Loarder from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import React, { memo, useCallback, useEffect, useState } from "react";
import type { ArticleInfo, TemplateArticle } from "../../../@types/template-article";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

const AppComponent: React.FunctionComponent = () => {
  const [articleInfo, setArticleInfo] = useState<ArticleInfo | null>(null);
  useEffect(() => {
    host
      .fetchApp<ArticleInfo>("backend/getArticleInfo", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        // eslint-disable-next-line no-console
        console.log("Article info", result);
        setArticleInfo(result);
      });
  }, [host]);

  const saveInfo = useCallback(async () => {
    const result = await host.fetchApp("backend/setArticleInfo", {
      scope: true,
      method: "POST",
      body: articleInfo,
    });
    // eslint-disable-next-line no-console
    console.log("Set article info result", result);
  }, [host, articleInfo]);

  return (
    <div className="widget">
      {!articleInfo && <Loarder message="Loading article info..." />}
      {articleInfo && (
        <div className="article-template-config">
          <Checkbox
            label="Use article as ticket template."
            checked={articleInfo.isTemplate}
            onChange={(e: any) =>
              setArticleInfo(
                (prev) => ({ ...prev, isTemplate: e.target.checked as boolean } as ArticleInfo)
              )
            }
          />
        </div>
      )}
      <Panel className="article-template-config-bottom-panel">
        <Button primary onClick={saveInfo}>
          {"Save info"}
        </Button>
      </Panel>
    </div>
  );
};

export const App = memo(AppComponent);
