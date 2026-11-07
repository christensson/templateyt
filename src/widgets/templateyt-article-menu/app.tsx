import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Checkbox from "@jetbrains/ring-ui-built/components/checkbox/checkbox";
import Loader from "@jetbrains/ring-ui-built/components/loader/loader";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";
import Select, { type SelectItem } from "@jetbrains/ring-ui-built/components/select/select";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

// Register widget in YouTrack. To learn more, see https://www.jetbrains.com/help/youtrack/devportal-apps/apps-host-api.html
const host = await YTApp.register();

export type ArticleInfo = {
  articleId: string;
  isTemplate: boolean;
  hasTemplates: boolean;
  // Project of the article.
  projectKey: string;
  // Projects that may use the article as template; null when not restricted (articles marked as
  // template before project restrictions existed).
  templateProjectKeys: Array<string> | null;
};

type ProjectInfo = { shortName: string; name: string; archived: boolean };

type ProjectSelectItem = SelectItem<{ projectKey: string }>;

interface ProjectSelectionProps {
  projects: Array<ProjectInfo>;
  projectKeys: Array<string>;
  // The article was marked as template before project restrictions and has none yet.
  isLegacy: boolean;
  onChange: (projectKeys: Array<string>) => void;
}

// Selects the projects that can use the template article.
const ProjectSelection: React.FunctionComponent<ProjectSelectionProps> = ({
  projects,
  projectKeys,
  isLegacy,
  onChange,
}) => {
  // Archived projects are only listed while selected, so they can be removed.
  const projectItems = useMemo<Array<ProjectSelectItem>>(
    () =>
      projects
        .filter((p) => !p.archived || projectKeys.includes(p.shortName))
        .map((p) => ({
          key: p.shortName,
          label: `${p.name} (${p.shortName})`,
          projectKey: p.shortName,
        })),
    [projects, projectKeys],
  );

  // Selected projects, including those not in the list (e.g. not visible to the user).
  const selectedItems = useMemo<Array<ProjectSelectItem>>(
    () =>
      projectKeys.map(
        (key) =>
          projectItems.find((item) => item.projectKey === key) ?? {
            key,
            label: key,
            projectKey: key,
          },
      ),
    [projectKeys, projectItems],
  );

  return (
    <>
      {isLegacy && (
        <Banner mode="info" withIcon>
          Any project can use this template (set before project restrictions). Saving limits it
          to the projects selected below.
        </Banner>
      )}
      <Select
        multiple
        filter
        size={Select.Size.FULL}
        selectedLabel="Projects that can use this template"
        label="Select projects..."
        data={projectItems}
        selected={selectedItems}
        onChange={(selected: Array<ProjectSelectItem>) =>
          onChange(selected.map((item) => item.projectKey))
        }
      />
      {projectKeys.length === 0 && (
        <Banner mode="warning" withIcon>
          Select at least one project.
        </Banner>
      )}
    </>
  );
};

const AppComponent: React.FunctionComponent = () => {
  const [articleInfo, setArticleInfo] = useState<ArticleInfo | null>(null);
  // Projects selected in the form; starts with the stored ones or only the article's project.
  const [projectKeys, setProjectKeys] = useState<Array<string>>([]);
  const [projects, setProjects] = useState<Array<ProjectInfo>>([]);
  const [isDraft, setIsDraft] = useState<boolean>(false);
  const [failMessage, setFailMessage] = useState<string>("");
  useEffect(() => {
    host
      .fetchApp<ArticleInfo>("backend/getArticleInfo", {
        scope: true,
        method: "GET",
      })
      .then((result) => {
        console.log("Article info", result);
        setArticleInfo(result);
        setProjectKeys(result.templateProjectKeys ?? [result.projectKey]);
        setIsDraft(false);
      });
    // Projects the user can see; the list the template can be shared with.
    host
      .fetchYouTrack<Array<ProjectInfo>>("admin/projects", {
        query: { fields: "shortName,name,archived", $top: -1 },
      })
      .then((result) => setProjects(result));
  }, []);

  const saveInfo = useCallback(async () => {
    if (articleInfo === null) {
      return;
    }
    const result = await host.fetchApp<{
      success: boolean;
      message?: string;
    }>("backend/setArticleInfo", {
      scope: true,
      method: "POST",
      body: {
        articleId: articleInfo.articleId,
        isTemplate: articleInfo.isTemplate,
        ...(articleInfo.isTemplate ? { templateProjectKeys: projectKeys } : {}),
      },
    });
    console.log("Set article info result", result);
    if (!result.success) {
      setFailMessage(result.message || `Failed to save article info.`);
      return;
    }
    if (articleInfo.isTemplate) {
      setArticleInfo({ ...articleInfo, templateProjectKeys: projectKeys });
    }
    setFailMessage("");
    setIsDraft(false);
  }, [articleInfo, projectKeys]);

  const isLegacy = articleInfo?.isTemplate === true && articleInfo.templateProjectKeys === null;
  // A legacy article can be saved as is, to apply the preselected restriction.
  const canSave =
    (isDraft || isLegacy) &&
    articleInfo !== null &&
    !articleInfo.hasTemplates &&
    (!articleInfo.isTemplate || projectKeys.length > 0);

  return (
    <div className="widget">
      {!articleInfo && <Loader message="Loading article info..."/>}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setArticleInfo(
                (prev) => ({ ...prev, isTemplate: e.target.checked }) as ArticleInfo,
              );
              setIsDraft(true);
            }}
          />
          {articleInfo.isTemplate && (
            <ProjectSelection
              projects={projects}
              projectKeys={projectKeys}
              isLegacy={isLegacy}
              onChange={(keys) => {
                setProjectKeys(keys);
                setIsDraft(true);
              }}
            />
          )}
        </div>
      )}
      {failMessage && (
        <Banner mode="error" title="Failed to save" withIcon>
          {failMessage}
        </Banner>
      )}
      <Panel className="article-template-config-bottom-panel">
        <Button primary onClick={saveInfo} disabled={!canSave}>
          Save info
        </Button>
      </Panel>
    </div>
  );
};

export const App = memo(AppComponent);
