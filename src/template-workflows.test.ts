import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { entitiesStub, loadBackendScript } from "../test/load-backend-script.mjs";

// The workflows apply templates automatically for whoever edits a matching ticket or article, so
// they must check again that the template article may be used by the project: its sharing may
// have been restricted, or the article unmarked as template, since the template was saved.

type FakeProject = { key: string; name: string; extensionProperties: { templates?: string } };
type FakeArticle = {
  id: string;
  project: FakeProject;
  content: string;
  extensionProperties: { isTemplate?: boolean; templateProjectKeys?: string };
};
type Rule = { action: (ctx: unknown) => void };

const entities = entitiesStub as { Article: { findById: (id: string) => FakeArticle | null } };
const originalFindById = entities.Article.findById;

let issueRule: Rule;
let articleRule: Rule;

beforeAll(() => {
  issueRule = (loadBackendScript("src/add-issue-template-wf.js") as { rule: Rule }).rule;
  articleRule = (loadBackendScript("src/add-article-template-wf.js") as { rule: Rule }).rule;
});

afterEach(() => {
  entities.Article.findById = originalFindById;
});

const makeProject = (key: string, templates: Array<unknown> = []): FakeProject => ({
  key,
  name: key,
  extensionProperties: { templates: JSON.stringify(templates) },
});

const DEMO = makeProject("DEMO");

const makeArticle = (
  id: string,
  project: FakeProject,
  extensionProperties: FakeArticle["extensionProperties"] = {},
): FakeArticle => ({ id, project, content: `Content of ${id}`, extensionProperties });

const stubArticles = (articles: Array<FakeArticle>) => {
  entities.Article.findById = (id) => articles.find((a) => a.id === id) ?? null;
};

// Templates added when the tag "go" is on a new ticket or article.
const template = (id: string, articleId: string, entityType: string) => ({
  id,
  name: `Template ${id}`,
  articleId,
  validCondition: [{ when: "entity_is", entityType }],
  addCondition: { when: "tag_added", tagName: "go" },
});

const tagSet = () => {
  const tags = [{ name: "go" }];
  return Object.assign(tags, { added: [], removed: [] });
};

const makeIssue = (project: FakeProject) => ({
  id: `${project.key}-1`,
  isNew: true,
  project,
  summary: "Summary",
  description: "",
  tags: tagSet(),
  hasTag: (name: string) => name === "go",
  fields: {},
  extensionProperties: {} as Record<string, string>,
});

const makeTargetArticle = (project: FakeProject) => ({
  id: `${project.key}-A-100`,
  isNew: true,
  project,
  content: "",
  tags: tagSet(),
  hasTag: (name: string) => name === "go",
  extensionProperties: {} as Record<string, unknown>,
});

describe("auto-apply workflows check template article sharing", () => {
  const setup = () => {
    // Shared with OTHER, restricted to DEMO, never marked, unmarked after sharing with OTHER.
    stubArticles([
      makeArticle("DEMO-A-1", DEMO, { isTemplate: true, templateProjectKeys: JSON.stringify(["OTHER"]) }),
      makeArticle("DEMO-A-2", DEMO, { isTemplate: true, templateProjectKeys: JSON.stringify(["DEMO"]) }),
      makeArticle("DEMO-A-6", DEMO),
      makeArticle("DEMO-A-7", DEMO, { isTemplate: false, templateProjectKeys: JSON.stringify(["OTHER"]) }),
    ]);
  };

  it("applies shared articles and skips unshared ones on tickets", () => {
    setup();
    const other = makeProject(
      "OTHER",
      ["DEMO-A-1", "DEMO-A-2", "DEMO-A-6", "DEMO-A-7"].map((a, i) => template(`t${i}`, a, "issue")),
    );
    const issue = makeIssue(other);
    expect(() => issueRule.action({ issue, project: other })).not.toThrow();
    expect(issue.description).toBe("Content of DEMO-A-1");
    expect(JSON.parse(issue.extensionProperties.usedTemplateIds)).toEqual(["t0"]);
  });

  it("applies shared articles and skips unshared ones on articles", () => {
    setup();
    const other = makeProject(
      "OTHER",
      ["DEMO-A-1", "DEMO-A-2", "DEMO-A-6", "DEMO-A-7"].map((a, i) => template(`t${i}`, a, "article")),
    );
    const article = makeTargetArticle(other);
    expect(() => articleRule.action({ article, project: other })).not.toThrow();
    expect(article.content).toBe("Content of DEMO-A-1");
    expect(JSON.parse(article.extensionProperties.usedTemplateIds as string)).toEqual(["t0"]);
  });

  it("does not throw when a template article no longer exists", () => {
    stubArticles([]);
    const other = makeProject("OTHER", [template("t0", "DEMO-A-404", "issue")]);
    const issue = makeIssue(other);
    expect(() => issueRule.action({ issue, project: other })).not.toThrow();
    expect(issue.description).toBe("");
  });
});
