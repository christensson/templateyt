import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { callEndpoint, findEndpoint as findIn, type Endpoint } from "../test/fake-ctx";
import { entitiesStub, loadBackendScript } from "../test/load-backend-script.mjs";

// Templates can set the title (summary) of the ticket or article they are applied to, from the
// title of the template article. The article title follows the same access rules as its content:
// it is only used when the article may be used by the project (and read by the user applying it
// manually), so that titles of articles that are not shared never leak.

type FakeProject = { key: string; name: string; extensionProperties: { templates?: string } };
type FakeUser = {
  login: string;
  hasPermission: (key: string, project: { key: string }) => boolean;
  isInGroup: (name: string) => boolean;
};
type FakeArticle = {
  id: string;
  summary: string;
  project: FakeProject;
  content: string;
  author: { login: string } | null;
  permittedUsers: Array<{ login: string }>;
  permittedGroups: Array<{ name: string }>;
  extensionProperties: { isTemplate?: boolean; templateProjectKeys?: string };
};
type Rule = { action: (ctx: unknown) => void };
type TitleSetting = { source: string; when: string } | null;
type Utils = {
  getTemplateTitleSetting: (template: unknown) => TitleSetting;
  getTemplateTitleText: (template: unknown, article: unknown) => string | null;
  shouldSetTitle: (current: string, setting: TitleSetting, choice?: boolean) => boolean;
  pickTemplateTitle: (current: string, template: unknown, article: unknown, choice?: boolean) => string;
};

const entities = entitiesStub as { Article: { findById: (id: string) => FakeArticle | null } };
const originalFindById = entities.Article.findById;

let utils: Utils;
let issueRule: Rule;
let articleRule: Rule;
let endpoints: Array<Endpoint>;

beforeAll(() => {
  utils = loadBackendScript("src/template-utils.js") as Utils;
  issueRule = (loadBackendScript("src/add-issue-template-wf.js") as { rule: Rule }).rule;
  articleRule = (loadBackendScript("src/add-article-template-wf.js") as { rule: Rule }).rule;
  endpoints = (loadBackendScript("src/backend.js") as { httpHandler: { endpoints: Array<Endpoint> } })
    .httpHandler.endpoints;
});

afterEach(() => {
  entities.Article.findById = originalFindById;
});

const findEndpoint = (scope: string, method: string, path: string): Endpoint =>
  findIn(endpoints, scope, method, path);

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
  options: Partial<FakeArticle> = {},
): FakeArticle => ({
  id,
  summary: `Title of ${id}`,
  project,
  content: `Content of ${id}`,
  author: { login: "author" },
  permittedUsers: [],
  permittedGroups: [],
  extensionProperties,
  ...options,
});

const stubArticles = (articles: Array<FakeArticle>) => {
  entities.Article.findById = (id) => articles.find((a) => a.id === id) ?? null;
};

// A user with READ_ARTICLE in all projects but the listed ones.
const makeUser = (unreadable: Array<string> = []): FakeUser => ({
  login: "jane",
  hasPermission: (key, project) => key === "READ_ARTICLE" && !unreadable.includes(project.key),
  isInGroup: () => false,
});

// Template added when the tag "go" is on a new ticket or article, setting the title.
const template = (
  id: string,
  articleId: string,
  entityType: string,
  title: TitleSetting | undefined,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name: `Template ${id}`,
  articleId,
  validCondition: [{ when: "entity_is", entityType }],
  addCondition: { when: "tag_added", tagName: "go" },
  ...(title === undefined ? {} : { title }),
  ...extra,
});

const tagSet = () => Object.assign([{ name: "go" }], { added: [], removed: [] });

const makeIssue = (project: FakeProject, summary: string) => ({
  id: `${project.key}-1`,
  isNew: true,
  project,
  summary,
  description: "",
  tags: tagSet(),
  hasTag: (name: string) => name === "go",
  addTag: () => undefined,
  fields: {},
  links: {},
  extensionProperties: {} as Record<string, unknown>,
});

const makeTargetArticle = (project: FakeProject, summary: string) => ({
  id: `${project.key}-A-100`,
  isNew: true,
  project,
  summary,
  content: "",
  tags: tagSet(),
  hasTag: (name: string) => name === "go",
  addTag: () => undefined,
  extensionProperties: {} as Record<string, unknown>,
});

const call = callEndpoint;

const ALWAYS = { source: "article", when: "always" };
const IF_EMPTY = { source: "article", when: "if_empty" };

describe("title setting helpers", () => {
  it("reads missing, null and malformed settings as keeping the title", () => {
    expect(utils.getTemplateTitleSetting({})).toBeNull();
    expect(utils.getTemplateTitleSetting({ title: null })).toBeNull();
    expect(utils.getTemplateTitleSetting({ title: "article" })).toBeNull();
    expect(utils.getTemplateTitleSetting({ title: { source: "fixed", when: "always" } })).toBeNull();
    expect(utils.getTemplateTitleSetting({ title: { source: "article", when: "sometimes" } })).toBeNull();
    expect(utils.getTemplateTitleSetting({ title: ALWAYS })).toEqual(ALWAYS);
  });

  it.each([
    // current title, setting, user's choice, expected
    ["", ALWAYS, undefined, true],
    ["", IF_EMPTY, undefined, true],
    ["  ", IF_EMPTY, false, true],
    ["Typed", ALWAYS, undefined, true],
    ["Typed", IF_EMPTY, undefined, false],
    ["Typed", ALWAYS, false, false],
    ["Typed", IF_EMPTY, true, true],
    ["", null, true, false],
  ])("shouldSetTitle(%j, %j, %j) is %j", (current, setting, choice, expected) => {
    expect(utils.shouldSetTitle(current, setting, choice)).toBe(expected);
  });

  it("uses no title without a checked article or with an empty article title", () => {
    const t = { title: ALWAYS };
    expect(utils.getTemplateTitleText(t, null)).toBeNull();
    expect(utils.getTemplateTitleText(t, { summary: "  " })).toBeNull();
    expect(utils.getTemplateTitleText({}, { summary: "Title" })).toBeNull();
    expect(utils.getTemplateTitleText(t, { summary: " Title " })).toBe("Title");
    expect(utils.pickTemplateTitle("Typed", t, null, true)).toBe("Typed");
  });
});

describe("auto-apply workflows set the title", () => {
  const OTHER_SHARED = () =>
    makeArticle("DEMO-A-1", DEMO, { isTemplate: true, templateProjectKeys: JSON.stringify(["OTHER"]) });

  it.each([
    ["sets an empty title", IF_EMPTY, "", "Title of DEMO-A-1"],
    ["keeps an existing title when only empty titles are set", IF_EMPTY, "Typed", "Typed"],
    ["replaces an existing title when always set", ALWAYS, "Typed", "Title of DEMO-A-1"],
    ["keeps the title of legacy templates", undefined, "", ""],
  ])("on tickets: %s", (_name, title, summary, expected) => {
    stubArticles([OTHER_SHARED()]);
    const other = makeProject("OTHER", [template("t0", "DEMO-A-1", "issue", title as TitleSetting)]);
    const issue = makeIssue(other, summary);
    issueRule.action({ issue, project: other });
    expect(issue.summary).toBe(expected);
    expect(issue.description).toBe("Content of DEMO-A-1");
  });

  it.each([
    ["sets an empty title", IF_EMPTY, "", "Title of DEMO-A-1"],
    ["keeps an existing title when only empty titles are set", IF_EMPTY, "Typed", "Typed"],
    ["replaces an existing title when always set", ALWAYS, "Typed", "Title of DEMO-A-1"],
    ["keeps the title of legacy templates", undefined, "Typed", "Typed"],
  ])("on articles: %s", (_name, title, summary, expected) => {
    stubArticles([OTHER_SHARED()]);
    const other = makeProject("OTHER", [template("t0", "DEMO-A-1", "article", title as TitleSetting)]);
    const article = makeTargetArticle(other, summary);
    articleRule.action({ article, project: other });
    expect(article.summary).toBe(expected);
  });

  it("uses the title of articles of older versions without project restrictions", () => {
    stubArticles([makeArticle("DEMO-A-3", DEMO, { isTemplate: true })]);
    const other = makeProject("OTHER", [template("t0", "DEMO-A-3", "issue", ALWAYS)]);
    const issue = makeIssue(other, "Typed");
    issueRule.action({ issue, project: other });
    expect(issue.summary).toBe("Title of DEMO-A-3");
  });

  it.each([
    ["not shared with the project", { isTemplate: true, templateProjectKeys: JSON.stringify(["DEMO"]) }],
    ["no longer marked as template", { isTemplate: false, templateProjectKeys: JSON.stringify(["OTHER"]) }],
    ["never marked as template", {}],
  ])("never uses the title of an article %s", (_name, props) => {
    stubArticles([makeArticle("DEMO-A-2", DEMO, props)]);
    const other = makeProject("OTHER", [
      template("t0", "DEMO-A-2", "issue", ALWAYS),
      template("t1", "DEMO-A-2", "article", ALWAYS),
    ]);
    const issue = makeIssue(other, "");
    issueRule.action({ issue, project: other });
    expect(issue.summary).toBe("");
    const article = makeTargetArticle(other, "");
    articleRule.action({ article, project: other });
    expect(article.summary).toBe("");
  });
});

describe("manual apply sets the title", () => {
  const replacement = { replacements: [{ search: "WHAT", mode: "user_input" }] };

  const setup = (title: TitleSetting | undefined, articleOptions: Partial<FakeArticle> = {}) => {
    stubArticles([
      makeArticle(
        "DEMO-A-1",
        DEMO,
        { isTemplate: true, templateProjectKeys: JSON.stringify(["OTHER"]) },
        { summary: "Review WHAT", ...articleOptions },
      ),
    ]);
    return makeProject("OTHER", [
      template("t0", "DEMO-A-1", "issue", title as TitleSetting, replacement),
      template("t1", "DEMO-A-1", "article", title as TitleSetting, replacement),
    ]);
  };

  const applyToIssue = (project: FakeProject, summary: string, body: Record<string, unknown>, user = makeUser()) => {
    const issue = makeIssue(project, summary);
    const json = call(
      findEndpoint("issue", "POST", "addTemplate"),
      { issue, project, currentUser: user },
      { templateId: "t0", replacementTexts: { WHAT: "login" }, ...body },
    );
    return { issue, json };
  };

  const applyToArticle = (project: FakeProject, summary: string, body: Record<string, unknown>, user = makeUser()) => {
    const article = makeTargetArticle(project, summary);
    const json = call(
      findEndpoint("article", "POST", "addTemplate"),
      { article, project, currentUser: user },
      { templateId: "t1", replacementTexts: { WHAT: "login" }, ...body },
    );
    return { article, json };
  };

  it.each([
    // setting, current title, replaceTitle, expected title
    [IF_EMPTY, "", undefined, "Review login"],
    [IF_EMPTY, "Typed WHAT", false, "Typed login"],
    [IF_EMPTY, "Typed", true, "Review login"],
    [ALWAYS, "Typed", false, "Typed"],
    [ALWAYS, "Typed", true, "Review login"],
    // Older clients send no choice: the setting decides.
    [ALWAYS, "Typed", undefined, "Review login"],
    [IF_EMPTY, "Typed", undefined, "Typed"],
    // Legacy templates keep the title; replacements still apply to it.
    [undefined, "Typed WHAT", true, "Typed login"],
  ])("setting %j, title %j, replaceTitle %j gives %j", (title, summary, replaceTitle, expected) => {
    const project = setup(title as TitleSetting | undefined);
    const ticket = applyToIssue(project, summary, { replaceTitle });
    expect(ticket.json.success).toBe(true);
    expect(ticket.issue.summary).toBe(expected);
    const article = applyToArticle(project, summary, { replaceTitle });
    expect(article.json.success).toBe(true);
    expect(article.article.summary).toBe(expected);
  });

  it("does not use or reveal the title of an article the user cannot read", () => {
    const project = setup(ALWAYS);
    const user = makeUser(["DEMO"]);
    for (const { json, entity } of [
      (() => {
        const r = applyToIssue(project, "", { replaceTitle: true }, user);
        return { json: r.json, entity: r.issue };
      })(),
      (() => {
        const r = applyToArticle(project, "", { replaceTitle: true }, user);
        return { json: r.json, entity: r.article };
      })(),
    ]) {
      expect(json.success).toBe(false);
      expect(entity.summary).toBe("");
      expect(JSON.stringify(json)).not.toContain("Review");
    }
  });

  it("does not use the title of an article no longer shared with the project", () => {
    stubArticles([
      makeArticle("DEMO-A-1", DEMO, { isTemplate: true, templateProjectKeys: JSON.stringify(["DEMO"]) }),
    ]);
    const project = makeProject("OTHER", [template("t0", "DEMO-A-1", "issue", ALWAYS)]);
    const { issue, json } = applyToIssue(project, "", { replaceTitle: true });
    expect(json.success).toBe(false);
    expect(issue.summary).toBe("");
    expect(JSON.stringify(json)).not.toContain("Title of");
  });
});

describe("apply dialog info lists template titles", () => {
  it("lists only titles of articles the user may read and the project may use", () => {
    stubArticles([
      makeArticle("DEMO-A-1", DEMO, { isTemplate: true, templateProjectKeys: JSON.stringify(["OTHER"]) }),
      makeArticle("DEMO-A-2", DEMO, { isTemplate: true, templateProjectKeys: JSON.stringify(["DEMO"]) }),
      makeArticle("DEMO-A-3", DEMO, { isTemplate: true }),
      makeArticle("DEMO-A-4", DEMO, { isTemplate: false }),
      makeArticle("SECRET-A-1", makeProject("SECRET"), { isTemplate: true }),
    ]);
    const project = makeProject("OTHER", [
      template("t1", "DEMO-A-1", "issue", ALWAYS),
      template("t2", "DEMO-A-2", "issue", ALWAYS),
      template("t3", "DEMO-A-3", "issue", IF_EMPTY),
      template("t4", "DEMO-A-4", "issue", ALWAYS),
      template("t5", "SECRET-A-1", "issue", ALWAYS),
      template("t6", "DEMO-A-1", "issue", undefined),
    ]);
    // The ticket's field info is not under test: a project without fields.
    const issue = { ...makeIssue({ ...project, fields: [] } as FakeProject, "Typed"), isNew: false };
    const json = call(
      findEndpoint("issue", "GET", "templates"),
      { issue, project, currentUser: makeUser(["SECRET"]) },
    );
    expect(json.currentTitle).toBe("Typed");
    expect(json.templateTitles).toEqual({ t1: "Title of DEMO-A-1", t3: "Title of DEMO-A-3" });
  });
});

describe("storing templates validates the title setting", () => {
  it.each([
    [undefined, true],
    [null, true],
    [ALWAYS, true],
    [IF_EMPTY, true],
    [{ source: "fixed", when: "always" }, false],
    [{ source: "article", when: "sometimes" }, false],
  ])("title %j is accepted: %j", (title, accepted) => {
    stubArticles([makeArticle("OTHER-A-1", makeProject("OTHER"))]);
    const project = makeProject("OTHER", []);
    const json = call(
      findEndpoint("project", "POST", "addTemplate"),
      { project, currentUser: makeUser() },
      {
        template: {
          ...template("t0", "OTHER-A-1", "issue", undefined),
          fields: [],
          replacements: [],
          ...(title === undefined ? {} : { title }),
        },
      },
    );
    expect(json.success === true).toBe(accepted);
  });
});
