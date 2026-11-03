import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { entitiesStub, loadBackendScript } from "../test/load-backend-script.mjs";

type FakeUser = {
  login: string;
  hasPermission: (key: string, project: FakeProject) => boolean;
  isInGroup: (name: string) => boolean;
};
type FakeProject = { key: string; name: string };
type FakeArticle = {
  id: string;
  summary: string;
  project: FakeProject;
  author: { login: string } | null;
  permittedUsers: Array<{ login: string }>;
  permittedGroups: Array<{ name: string }>;
  parentArticle: FakeArticle | null;
  childArticles: Array<FakeArticle>;
  extensionProperties: { isTemplate?: boolean };
};

type Utils = {
  isArticleReadableBy: (article: FakeArticle | null, user: FakeUser) => boolean;
  findReadableArticle: (articleId: unknown, user: FakeUser) => FakeArticle | null;
  getArticleTree: (article: FakeArticle, user: FakeUser, project: FakeProject) => unknown;
  getTemplateArticleError: (template: unknown, user: FakeUser) => string | null;
};

// The entities stub is shared with the loaded script, so tests can decide what
// Article.findById returns.
const entities = entitiesStub as {
  Article: { findById: (id: string) => FakeArticle | null };
};
const originalFindById = entities.Article.findById;

let utils: Utils;

beforeAll(() => {
  utils = loadBackendScript("src/template-utils.js") as Utils;
});

afterEach(() => {
  entities.Article.findById = originalFindById;
});

const DEMO: FakeProject = { key: "DEMO", name: "Demo" };
const DOCS: FakeProject = { key: "DOCS", name: "Docs" };

// A user with READ_ARTICLE in the given projects, member of the given groups.
const makeUser = (login: string, readable: Array<FakeProject>, groups: Array<string> = []): FakeUser => ({
  login,
  hasPermission: (key, project) =>
    key === "READ_ARTICLE" && readable.some((p) => p.key === project.key),
  isInGroup: (name) => groups.includes(name),
});

const makeArticle = (
  id: string,
  project: FakeProject,
  options: Partial<Omit<FakeArticle, "id" | "project">> = {},
): FakeArticle => ({
  id,
  summary: `Summary of ${id}`,
  project,
  author: { login: "author" },
  permittedUsers: [],
  permittedGroups: [],
  parentArticle: null,
  childArticles: [],
  extensionProperties: {},
  ...options,
});

// Links children to their parent, both ways.
const withChildren = (parent: FakeArticle, children: Array<FakeArticle>): FakeArticle => {
  parent.childArticles = children;
  children.forEach((child) => (child.parentArticle = parent));
  return parent;
};

const stubArticles = (articles: Array<FakeArticle>) => {
  entities.Article.findById = (id) => articles.find((a) => a.id === id) ?? null;
};

describe("isArticleReadableBy", () => {
  it("requires READ_ARTICLE in the article's project", () => {
    const article = makeArticle("DOCS-A-1", DOCS);
    expect(utils.isArticleReadableBy(article, makeUser("jane", [DEMO]))).toBe(false);
    expect(utils.isArticleReadableBy(article, makeUser("jane", [DOCS]))).toBe(true);
    expect(utils.isArticleReadableBy(null, makeUser("jane", [DOCS]))).toBe(false);
  });

  it("respects restricted visibility: permitted users, groups and the author", () => {
    const article = makeArticle("DOCS-A-1", DOCS, {
      permittedUsers: [{ login: "bob" }],
      permittedGroups: [{ name: "writers" }],
    });
    expect(utils.isArticleReadableBy(article, makeUser("jane", [DOCS]))).toBe(false);
    expect(utils.isArticleReadableBy(article, makeUser("bob", [DOCS]))).toBe(true);
    expect(utils.isArticleReadableBy(article, makeUser("jane", [DOCS], ["writers"]))).toBe(true);
    expect(utils.isArticleReadableBy(article, makeUser("author", [DOCS]))).toBe(true);
    // Being permitted does not replace the project permission.
    expect(utils.isArticleReadableBy(article, makeUser("bob", []))).toBe(false);
  });
});

describe("findReadableArticle", () => {
  it("returns null for missing, unreadable and invalid ids alike", () => {
    stubArticles([makeArticle("DOCS-A-1", DOCS)]);
    const user = makeUser("jane", [DEMO]);
    expect(utils.findReadableArticle("DOCS-A-1", user)).toBeNull();
    expect(utils.findReadableArticle("DOCS-A-2", user)).toBeNull();
    expect(utils.findReadableArticle("", user)).toBeNull();
    expect(utils.findReadableArticle(undefined, user)).toBeNull();
    expect(utils.findReadableArticle("DOCS-A-1", makeUser("jane", [DOCS]))?.id).toBe("DOCS-A-1");
  });
});

describe("getArticleTree", () => {
  it("leaves out unreadable children and flags articles from other projects", () => {
    const hidden = makeArticle("DOCS-A-3", DOCS, { permittedUsers: [{ login: "bob" }] });
    const grandChild = makeArticle("DOCS-A-4", DOCS);
    const visible = withChildren(makeArticle("DOCS-A-2", DOCS), [grandChild]);
    const root = withChildren(makeArticle("DOCS-A-1", DOCS), [visible, hidden]);
    expect(utils.getArticleTree(root, makeUser("jane", [DOCS]), DEMO)).toEqual({
      articleId: "DOCS-A-1",
      summary: "Summary of DOCS-A-1",
      projectKey: "DOCS",
      projectName: "Docs",
      isOtherProject: true,
      children: [
        {
          articleId: "DOCS-A-2",
          summary: "Summary of DOCS-A-2",
          projectKey: "DOCS",
          projectName: "Docs",
          isOtherProject: true,
          children: [
            {
              articleId: "DOCS-A-4",
              summary: "Summary of DOCS-A-4",
              projectKey: "DOCS",
              projectName: "Docs",
              isOtherProject: true,
              children: [],
            },
          ],
        },
      ],
    });
  });
});

describe("getTemplateArticleError", () => {
  const child = (articleId: string, children: Array<unknown> = []) => ({
    id: `id-${articleId}`,
    name: `Child ${articleId}`,
    articleId,
    children,
  });

  const setup = () => {
    const grandChild = makeArticle("DEMO-A-3", DEMO);
    const imported = withChildren(makeArticle("DEMO-A-2", DEMO), [grandChild]);
    const root = withChildren(makeArticle("DEMO-A-1", DEMO, { extensionProperties: { isTemplate: true } }), [
      imported,
    ]);
    const inserted = makeArticle("DOCS-A-1", DOCS, { extensionProperties: { isTemplate: true } });
    const unrelated = makeArticle("DOCS-A-2", DOCS);
    stubArticles([root, imported, grandChild, inserted, unrelated]);
  };
  const admin = makeUser("admin", [DEMO, DOCS]);

  it("accepts imported children below their parent's article and inserted template articles", () => {
    setup();
    const template = {
      articleId: "DEMO-A-1",
      children: [child("DEMO-A-2", [child("DEMO-A-3")]), child("DOCS-A-1")],
    };
    expect(utils.getTemplateArticleError(template, admin)).toBeNull();
  });

  it("rejects child articles that are neither template articles nor below the parent", () => {
    setup();
    const template = { articleId: "DEMO-A-1", children: [child("DOCS-A-2")] };
    expect(utils.getTemplateArticleError(template, admin)).toBe(
      'Child template "Child DOCS-A-2": article DOCS-A-2 is neither a template article nor below DEMO-A-1.',
    );
  });

  it("rejects root and child articles the user cannot read", () => {
    setup();
    const demoOnly = makeUser("admin", [DEMO]);
    expect(utils.getTemplateArticleError({ articleId: "DOCS-A-1", children: [] }, demoOnly)).toBe(
      "Template article DOCS-A-1 not found or not accessible.",
    );
    expect(
      utils.getTemplateArticleError({ articleId: "DEMO-A-1", children: [child("DOCS-A-1")] }, demoOnly),
    ).toBe('Child template "Child DOCS-A-1": article DOCS-A-1 not found or not accessible.');
  });
});
