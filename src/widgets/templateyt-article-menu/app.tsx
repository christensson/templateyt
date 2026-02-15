import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Checkbox from "@jetbrains/ring-ui-built/components/checkbox/checkbox";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import React, { memo, useCallback, useEffect, useState } from "react";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

export type ArticleInfo = {
  articleId: string;
  isTemplate: boolean;
  hasTemplates: boolean;
};

const AppComponent: React.FunctionComponent = () => {
  const [articleInfo, setArticleInfo] = useState<ArticleInfo | null>(null);
  const [isDraft, setIsDraft] = useState<boolean>(false);
  const [failMessage, setFailMessage] = useState<string>("");
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
        setIsDraft(false);
      });
  }, [host]);

  const saveInfo = useCallback(async () => {
    const result = await host.fetchApp<{
      success: Boolean;
      message?: string;
    }>("backend/setArticleInfo", {
      scope: true,
      method: "POST",
      body: articleInfo,
    });
    // eslint-disable-next-line no-console
    console.log("Set article info result", result);
    if (!result.success) {
      setFailMessage(result.message || `Failed to save article info.`);
      return;
    }
    setFailMessage("");
    setIsDraft(false);
  }, [host, articleInfo]);

  return (
    <div className="widget">
      {!articleInfo && <Loader message="Loading article info..." />}
      {articleInfo && articleInfo.hasTemplates && (
        <Banner mode="info" withIcon>
          Article uses templates, cannot configure as template.
        </Banner>
      )}
      {articleInfo && !articleInfo.hasTemplates && (
        <div className="article-template-config">
          <Checkbox
            label="Use article as ticket template."
            checked={articleInfo.isTemplate}
            onChange={(e: any) => {
              setArticleInfo(
                (prev) => ({ ...prev, isTemplate: e.target.checked as boolean }) as ArticleInfo,
              );
              setIsDraft(true);
            }}
          />
        </div>
      )}
      {failMessage && (
        <Banner mode="error" title="Failed to save" withIcon>
          {failMessage}
        </Banner>
      )}
      <Panel className="article-template-config-bottom-panel">
        <Button
          primary
          onClick={saveInfo}
          disabled={!isDraft || articleInfo === null || articleInfo.hasTemplates}
        >
          Save info
        </Button>
      </Panel>
    </div>
  );
};

export const App = memo(AppComponent);
