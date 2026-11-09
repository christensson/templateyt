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
  extensionProperties: { isTemplate?: boolean; templateProjectKeys?: string };
};

type Utils = {
  isArticleReadableBy: (article: FakeArticle | null, user: FakeUser) => boolean;
  findReadableArticle: (articleId: unknown, user: FakeUser) => FakeArticle | null;
  getArticleTree: (article: FakeArticle, user: FakeUser, project: FakeProject) => unknown;
  getTemplateArticleError: (template: unknown, user: FakeUser, project: FakeProject) => string | null;
  isArticleSharedWithProject: (article: FakeArticle, project: FakeProject) => boolean;
  isUsableTemplateArticle: (article: FakeArticle, project: FakeProject) => boolean;
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
      isExplicitlyShared: false,
      children: [
        {
          articleId: "DOCS-A-2",
          summary: "Summary of DOCS-A-2",
          projectKey: "DOCS",
          projectName: "Docs",
          isOtherProject: true,
          isExplicitlyShared: false,
          children: [
            {
              articleId: "DOCS-A-4",
              summary: "Summary of DOCS-A-4",
              projectKey: "DOCS",
              projectName: "Docs",
              isOtherProject: true,
              isExplicitlyShared: false,
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
    expect(utils.getTemplateArticleError(template, admin, DEMO)).toBeNull();
  });

  it("rejects child articles that are neither template articles nor below the parent", () => {
    setup();
    const template = { articleId: "DEMO-A-1", children: [child("DOCS-A-2")] };
    expect(utils.getTemplateArticleError(template, admin, DEMO)).toBe(
      'Child template "Child DOCS-A-2": article DOCS-A-2 is from another project and not a template article.',
    );
  });

  it("rejects root and child articles the user cannot read", () => {
    setup();
    const demoOnly = makeUser("admin", [DEMO]);
    expect(utils.getTemplateArticleError({ articleId: "DOCS-A-1", children: [] }, demoOnly, DEMO)).toBe(
      "Template article DOCS-A-1 not found or not accessible.",
    );
    expect(
      utils.getTemplateArticleError({ articleId: "DEMO-A-1", children: [child("DOCS-A-1")] }, demoOnly, DEMO),
    ).toBe('Child template "Child DOCS-A-1": article DOCS-A-1 not found or not accessible.');
  });

  it("requires the template article and inserted children to be shared with the project", () => {
    const shared = JSON.stringify(["DEMO"]);
    const docsOnly = JSON.stringify(["DOCS"]);
    const imported = makeArticle("DOCS-A-2", DOCS);
    const root = withChildren(
      makeArticle("DOCS-A-1", DOCS, { extensionProperties: { isTemplate: true, templateProjectKeys: shared } }),
      [imported],
    );
    const inserted = makeArticle("DOCS-A-3", DOCS, {
      extensionProperties: { isTemplate: true, templateProjectKeys: docsOnly },
    });
    const restrictedRoot = makeArticle("DOCS-A-4", DOCS, {
      extensionProperties: { isTemplate: true, templateProjectKeys: docsOnly },
    });
    stubArticles([root, imported, inserted, restrictedRoot]);
    // Imported children are covered by the shared article they come from.
    expect(
      utils.getTemplateArticleError({ articleId: "DOCS-A-1", children: [child("DOCS-A-2")] }, admin, DEMO),
    ).toBeNull();
    expect(
      utils.getTemplateArticleError({ articleId: "DOCS-A-1", children: [child("DOCS-A-3")] }, admin, DEMO),
    ).toBe('Child template "Child DOCS-A-3": article DOCS-A-3 is not shared with project Demo.');
    expect(utils.getTemplateArticleError({ articleId: "DOCS-A-4", children: [] }, admin, DEMO)).toBe(
      "Template article DOCS-A-4 is not shared with project Demo.",
    );
  });

  // Review of 0.3.0: an article never marked as template has no project list, which must not
  // count as shared with every project.
  it("rejects a root article from another project that is not a template article", () => {
    const unmarked = makeArticle("DEMO-A-6", DEMO);
    const unmarkedRestricted = makeArticle("DEMO-A-2", DEMO, {
      extensionProperties: { isTemplate: false, templateProjectKeys: JSON.stringify(["DOCS"]) },
    });
    stubArticles([unmarked, unmarkedRestricted]);
    expect(utils.getTemplateArticleError({ articleId: "DEMO-A-6", children: [] }, admin, DOCS)).toBe(
      "Template article DEMO-A-6 is from another project and not a template article.",
    );
    expect(utils.getTemplateArticleError({ articleId: "DEMO-A-2", children: [] }, admin, DOCS)).toBe(
      "Template article DEMO-A-2 is from another project and not a template article.",
    );
    // Articles of the project itself need no template marking or sharing.
    expect(utils.getTemplateArticleError({ articleId: "DEMO-A-6", children: [] }, admin, DEMO)).toBeNull();
  });
});

describe("isUsableTemplateArticle", () => {
  it("allows the project's own articles and template articles shared with it", () => {
    const own = makeArticle("DEMO-A-1", DEMO);
    const ownNotListed = makeArticle("DEMO-A-2", DEMO, {
      extensionProperties: { isTemplate: true, templateProjectKeys: JSON.stringify(["DOCS"]) },
    });
    const legacy = makeArticle("DOCS-A-1", DOCS, { extensionProperties: { isTemplate: true } });
    const listed = makeArticle("DOCS-A-2", DOCS, {
      extensionProperties: { isTemplate: true, templateProjectKeys: JSON.stringify(["DEMO"]) },
    });
    expect(utils.isUsableTemplateArticle(own, DEMO)).toBe(true);
    expect(utils.isUsableTemplateArticle(ownNotListed, DEMO)).toBe(true);
    expect(utils.isUsableTemplateArticle(legacy, DEMO)).toBe(true);
    expect(utils.isUsableTemplateArticle(listed, DEMO)).toBe(true);
  });

  it("rejects other projects' articles that are not shared or no longer marked as template", () => {
    const neverMarked = makeArticle("DOCS-A-1", DOCS);
    const notListed = makeArticle("DOCS-A-2", DOCS, {
      extensionProperties: { isTemplate: true, templateProjectKeys: JSON.stringify(["DOCS"]) },
    });
    const unmarked = makeArticle("DOCS-A-3", DOCS, {
      extensionProperties: { isTemplate: false, templateProjectKeys: JSON.stringify(["DEMO"]) },
    });
    expect(utils.isUsableTemplateArticle(neverMarked, DEMO)).toBe(false);
    expect(utils.isUsableTemplateArticle(notListed, DEMO)).toBe(false);
    expect(utils.isUsableTemplateArticle(unmarked, DEMO)).toBe(false);
  });
});

describe("isArticleSharedWithProject", () => {
  it("allows all projects without a setting, otherwise only the listed ones", () => {
    const legacy = makeArticle("DOCS-A-1", DOCS, { extensionProperties: { isTemplate: true } });
    const restricted = makeArticle("DOCS-A-2", DOCS, {
      extensionProperties: { isTemplate: true, templateProjectKeys: JSON.stringify(["DOCS"]) },
    });
    expect(utils.isArticleSharedWithProject(legacy, DEMO)).toBe(true);
    expect(utils.isArticleSharedWithProject(restricted, DOCS)).toBe(true);
    expect(utils.isArticleSharedWithProject(restricted, DEMO)).toBe(false);
  });
});

describe("getArticleProjectInfo", () => {
  it("flags articles whose settings list the project as explicitly shared", () => {
    const utilsWithInfo = utils as unknown as {
      getArticleProjectInfo: (article: FakeArticle, project: FakeProject) => unknown;
    };
    const legacy = makeArticle("DOCS-A-1", DOCS, { extensionProperties: { isTemplate: true } });
    const listed = makeArticle("DOCS-A-2", DOCS, {
      extensionProperties: { isTemplate: true, templateProjectKeys: JSON.stringify(["DOCS", "DEMO"]) },
    });
    expect(utilsWithInfo.getArticleProjectInfo(legacy, DEMO)).toEqual({
      projectKey: "DOCS",
      projectName: "Docs",
      isOtherProject: true,
      isExplicitlyShared: false,
    });
    expect(utilsWithInfo.getArticleProjectInfo(listed, DEMO)).toEqual({
      projectKey: "DOCS",
      projectName: "Docs",
      isOtherProject: true,
      isExplicitlyShared: true,
    });
  });
});
