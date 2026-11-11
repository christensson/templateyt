/* eslint-disable no-magic-numbers -- ids of fake entities are test data */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { callEndpoint, findEndpoint, type Endpoint } from "../test/fake-ctx";
import { entitiesStub, loadBackendScript } from "../test/load-backend-script.mjs";

// A hierarchical template can add a summary comment to the root ticket or article when its
// subtasks or sub-articles are created: who triggered it, the option answers, the text
// replacements, the entered values and which child templates were created or skipped, and why.

type Summary = {
  escapeMarkdown: (text: string) => string;
  explainChildConditions: (
    rootIssue: unknown,
    child: unknown,
    overrides: Record<string, string | Array<string> | null>,
    optionValues: Record<string, boolean>,
    options: Array<unknown>,
  ) => { conditional: boolean; matched: Array<string>; unmet: Array<string> };
  buildHierarchySummary: (summary: unknown) => string;
};

type FieldValue = { name: string; presentation: string; login?: string; fullName?: string };
type ProjectField = {
  name: string;
  typeName: string;
  isPublic?: boolean;
  findValueByName?: (name: string) => FieldValue | null;
  findValueByLogin?: (login: string) => FieldValue | null;
};
type FakeSet = Array<unknown> & { add: (v: unknown) => void; clear: () => void };

const stub = entitiesStub as Record<string, unknown> & {
  Article: { findById: (id: string) => unknown };
  Issue: unknown;
};
const originals = { Article: stub.Article, Issue: stub.Issue };

let summaryModule: Summary;
let endpoints: Array<Endpoint>;

beforeAll(() => {
  summaryModule = loadBackendScript("src/hierarchy-summary.js") as Summary;
  endpoints = (loadBackendScript("src/backend.js") as { httpHandler: { endpoints: Array<Endpoint> } })
    .httpHandler.endpoints;
});

afterEach(() => {
  stub.Article = originals.Article;
  stub.Issue = originals.Issue;
});

const fakeSet = (): FakeSet => {
  const items: Array<unknown> = [];
  return Object.assign(items, {
    add: (value: unknown) => {
      items.push(value);
    },
    clear: () => {
      items.length = 0;
    },
  });
};

const enumField = (name: string, typeName = "enum[1]", isPublic = true): ProjectField => ({
  name,
  typeName,
  isPublic,
  findValueByName: (value) => ({ name: value, presentation: value }),
});

const USERS: Record<string, FieldValue> = {
  jdoe: { name: "jdoe", login: "jdoe", fullName: "Jane Doe", presentation: "Jane Doe" },
};

const PROJECT_FIELDS: Array<ProjectField> = [
  enumField("Priority"),
  enumField("Customer"),
  {
    name: "Assignee",
    typeName: "user[1]",
    isPublic: true,
    findValueByLogin: (login) => USERS[login] ?? null,
  },
  // Private fields: readers without "Read private fields" must not learn their names or values.
  enumField("Budget", "enum[1]", false),
  {
    name: "Reviewer",
    typeName: "user[1]",
    isPublic: false,
    findValueByLogin: (login) => USERS[login] ?? null,
  },
];

const makeProject = (templates: Array<unknown>) => ({
  key: "DEMO",
  name: "Demo",
  fields: PROJECT_FIELDS,
  findFieldByName: (name: string) => PROJECT_FIELDS.find((field) => field.name === name) ?? null,
  extensionProperties: { templates: JSON.stringify(templates) },
});
type FakeProject = ReturnType<typeof makeProject>;

const user = {
  login: "jdoe",
  fullName: "Jane Doe",
  hasPermission: () => true,
  isInGroup: () => false,
};

type Comment = { text: string; author: unknown };

let nextId = 10;

const makeIssue = (project: FakeProject, summary: string, fields: Record<string, unknown> = {}) => {
  nextId += 1;
  const comments: Array<Comment> = [];
  const values: Record<string, unknown> = { ...fields };
  return {
    id: `DEMO-${nextId}`,
    project,
    summary,
    description: "",
    fields: values,
    links: { "parent for": fakeSet() } as Record<string, FakeSet>,
    tags: [] as Array<unknown>,
    extensionProperties: {} as Record<string, unknown>,
    comments,
    is: (fieldName: string, valueName: string) =>
      (values[fieldName] as FieldValue | undefined)?.name === valueName,
    hasTag: () => false,
    addTag: () => undefined,
    addComment: (text: string, author: unknown) => comments.push({ text, author }),
  };
};

const makeArticle = (id: string, project: FakeProject, summary: string) => {
  const comments: Array<Comment> = [];
  return {
    id,
    summary,
    project,
    content: `Content of ${id}`,
    author: { login: "author" },
    permittedUsers: [],
    permittedGroups: [],
    parentArticle: null as unknown,
    childArticles: [],
    extensionProperties: {} as Record<string, unknown>,
    comments,
    hasTag: () => false,
    addTag: () => undefined,
    addComment: (text: string, author: unknown) => comments.push({ text, author }),
  };
};

const child = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
  children: Array<unknown> = [],
) => ({
  id,
  articleId: `DEMO-A-${id.slice(1)}`,
  name,
  manual: false,
  fields: [],
  addConditions: [],
  inheritParentFields: false,
  inheritRootFields: false,
  children,
  ...extra,
});

const releaseTemplate = (entityType: string, summaryComment: boolean | undefined) => ({
  id: "t",
  name: "Release template",
  articleId: "DEMO-A-1",
  validCondition: [{ when: "entity_is", entityType }],
  addCondition: null,
  fields: [],
  hierarchical: true,
  ...(summaryComment === undefined ? {} : { summaryComment }),
  options: [
    { id: "o1", label: "Security review", default: false },
    { id: "o2", label: "Hotfix", default: true },
    { id: "o3", label: "Unused", default: null },
  ],
  replacements:
    entityType === "issue"
      ? [
        { search: "VERSION", mode: "user_input" },
        { search: "CUSTOMER", mode: "field", fieldName: "Customer" },
      ]
      : [{ search: "VERSION", mode: "user_input" }],
  children: [
    child("c2", "Build VERSION", { fields: [{ fieldName: "Assignee", mode: "user_input" }] }, [
      child("c3", "Smoke test VERSION", {
        addConditions: [{ when: "field_is", fieldName: "Priority", fieldValue: "Critical" }],
      }),
      child(
        "c4",
        "Security review",
        { addConditions: [{ when: "option_is", optionId: "o1", value: true }] },
        [child("c5", "Pen test"), child("c6", "Threat model")],
      ),
    ]),
    child("c7", entityType === "issue" ? "Release notes for CUSTOMER" : "Release notes"),
  ],
});

// Articles of the template and its children, all of the issue's project.
const stubTemplateArticles = (project: FakeProject) => {
  const articles = ["1", "2", "3", "4", "5", "6", "7"].map((n) =>
    makeArticle(`DEMO-A-${n}`, project, `Article ${n}`),
  );
  stub.Article = {
    ...originals.Article,
    findById: (id: string) => articles.find((a) => a.id === id) ?? null,
  };
};

const createTicketHierarchy = (
  summaryComment: boolean | undefined,
  body: Record<string, unknown> = {},
  template: unknown = releaseTemplate("issue", summaryComment),
) => {
  nextId = 10;
  const project = makeProject([template]);
  stubTemplateArticles(project);
  const created: Array<ReturnType<typeof makeIssue>> = [];
  stub.Issue = Object.assign(
    function FakeIssue(_user: unknown, issueProject: FakeProject, summary: string) {
      const issue = makeIssue(issueProject, summary);
      created.push(issue);
      return issue;
    },
    { findById: () => null },
  );
  const issue = makeIssue(project, "Release 2.1", {
    Priority: { name: "Normal", presentation: "Normal" },
    Customer: { name: "ACME", presentation: "ACME" },
    Budget: { name: "High", presentation: "High" },
  });
  issue.extensionProperties.usedTemplateIds = JSON.stringify(["t"]);
  const json = callEndpoint(
    findEndpoint(endpoints, "issue", "POST", "createHierarchy"),
    { issue, project, currentUser: user },
    {
      templateId: "t",
      childFieldValues: { c2: { Assignee: "jdoe" } },
      replacementTexts: { VERSION: "2.1" },
      conditionFieldValues: { Priority: "Critical" },
      optionValues: { o1: false },
      ...body,
    },
  );
  return { issue, json, created };
};

const TICKET_SUMMARY = [
  "**Subtasks created by Ticket Templates** from template *Release template*, triggered by Jane Doe.",
  "3 of 6 subtasks created.",
  "",
  "**Options**",
  "- Security review: No",
  "- Hotfix: Yes (default)",
  "- Unused: not asked",
  "",
  "**Text replacements**",
  "- `VERSION`: 2.1 (entered)",
  "- `CUSTOMER`: from ticket fields",
  "",
  "**Subtasks**",
  '- DEMO-12 "Build 2.1"',
  '  - DEMO-13 "Smoke test 2.1", created by a field condition',
  "  - [~~Article 4~~](/articles/DEMO-A-4) not created (with its 2 subtasks): needs Security review Yes (answered No)",
  '- DEMO-14 "Release notes for ACME"',
].join("\n");

describe("summary comment on tickets", () => {
  it("records options, entered texts and the created and skipped subtasks", () => {
    const { issue, json } = createTicketHierarchy(true);
    expect(json.success).toBe(true);
    expect(issue.comments).toHaveLength(1);
    expect(issue.comments[0].author).toBe(user);
    expect(issue.comments[0].text).toBe(TICKET_SUMMARY);
  });

  it.each([
    ["off", false],
    ["missing (templates of older versions)", undefined],
  ])("adds no comment when the setting is %s", (_name, setting) => {
    const { issue, json } = createTicketHierarchy(setting);
    expect(json.success).toBe(true);
    expect(issue.comments).toHaveLength(0);
  });

  it("adds no comment and creates nothing when the request is refused", () => {
    // The text for VERSION is required: without it the request fails before creating anything.
    const { issue, json, created } = createTicketHierarchy(true, { replacementTexts: {} });
    expect(json.success).toBe(false);
    expect(issue.comments).toHaveLength(0);
    expect(created).toHaveLength(0);
  });
});

describe("summary comment and ticket fields", () => {
  // The comment is readable by everyone who can read the ticket, and the scripting API cannot
  // tell which fields are private. This template sets, inserts, asks for and branches on public
  // and private fields.
  const fieldTemplate = () => ({
    ...releaseTemplate("issue", true),
    fields: [{ fieldName: "Budget", mode: "fixed", fieldValue: "High" }],
    options: [],
    replacements: [
      { search: "VERSION", mode: "user_input" },
      { search: "COST", mode: "field", fieldName: "Budget" },
      { search: "CUSTOMER", mode: "field", fieldName: "Customer" },
    ],
    children: [
      child("c2", "Build", {
        fields: [
          { fieldName: "Reviewer", mode: "user_input" },
          { fieldName: "Assignee", mode: "user_input" },
        ],
      }),
      child("c3", "Big budget review", {
        addConditions: [{ when: "field_is", fieldName: "Budget", fieldValue: "High" }],
      }),
      child("c4", "QA regression run", {
        addConditions: [
          { when: "field_is", fieldName: "Budget", fieldValue: "Low" },
          { when: "field_is", fieldName: "Priority", fieldValue: "Critical" },
        ],
      }),
    ],
  });

  it("never shows a ticket field name or value", () => {
    const { issue, json } = createTicketHierarchy(
      true,
      {
        childFieldValues: { c2: { Reviewer: "jdoe", Assignee: "jdoe" } },
        conditionFieldValues: {},
        optionValues: {},
      },
      fieldTemplate(),
    );
    expect(json.success).toBe(true);
    const text = issue.comments[0].text;
    // The header names the triggering user, who is also the value chosen for Assignee.
    const body = text.split("\n").slice(1).join("\n");
    expect(body).not.toMatch(/Budget|Reviewer|Assignee|Priority|Customer|High|Low|Normal|Critical|ACME|Jane Doe/);
    expect(text).toContain("- `VERSION`: 2.1 (entered)\n- `COST`, `CUSTOMER`: from ticket fields");
    expect(text).toContain('- DEMO-12 "Build"\n');
    expect(text).toContain('- DEMO-13 "Big budget review", created by a field condition');
    // Several field conditions read as one.
    expect(text).toContain("- [~~Article 4~~](/articles/DEMO-A-4) not created: field condition not met");
  });
});

describe("summary comment on articles", () => {
  it("records options, replacements and the created and skipped sub-articles", () => {
    const project = makeProject([releaseTemplate("article", true)]);
    stubTemplateArticles(project);
    let next = 100;
    stub.Article = Object.assign(
      function FakeArticle(_user: unknown, articleProject: FakeProject, summary: string) {
        next += 1;
        return makeArticle(`DEMO-A-${next}`, articleProject, summary);
      },
      { findById: (stub.Article as { findById: (id: string) => unknown }).findById },
    );
    const article = makeArticle("DEMO-A-50", project, "Release 2.1");
    article.extensionProperties.usedTemplateIds = JSON.stringify(["t"]);
    const json = callEndpoint(
      findEndpoint(endpoints, "article", "POST", "createHierarchy"),
      { article, project, currentUser: user },
      { templateId: "t", replacementTexts: { VERSION: "2.1" }, optionValues: { o1: true } },
    );
    expect(json.success).toBe(true);
    expect(article.comments).toHaveLength(1);
    expect(article.comments[0].text).toBe(
      [
        "**Sub-articles created by Ticket Templates** from template *Release template*, triggered by Jane Doe.",
        "6 of 6 sub-articles created.",
        "",
        "**Options**",
        "- Security review: Yes",
        "- Hotfix: Yes (default)",
        "- Unused: not asked",
        "",
        "**Text replacements**",
        "- `VERSION`: 2.1 (entered)",
        "",
        "**Sub-articles**",
        '- DEMO-A-101 "Build 2.1"',
        // Field conditions do not apply to articles, so Smoke test is created unconditionally.
        '  - DEMO-A-102 "Smoke test 2.1"',
        '  - DEMO-A-103 "Security review", created because Security review is Yes',
        '    - DEMO-A-104 "Pen test"',
        '    - DEMO-A-105 "Threat model"',
        '- DEMO-A-106 "Release notes"',
      ].join("\n"),
    );
  });
});

describe("buildHierarchySummary", () => {
  const base = {
    target: "ticket",
    templateName: "Plain",
    userName: "Jane Doe",
    total: 1,
    options: [],
    replacements: [],
    nodes: [
      {
        name: "Child",
        articleId: "DEMO-A-2",
        created: { id: "DEMO-2", summary: "Child" },
        conditional: false,
        matched: [],
        unmet: [],
        skippedCount: 0,
        children: [],
      },
    ],
  };
  const skipped = {
    ...base.nodes[0],
    name: "Extra review",
    articleId: "DEMO-A-3",
    articleTitle: "Extra *review*",
    articleUrl: "https://yt.example.com/articles/DEMO-A-3",
    created: null,
    conditional: true,
  };

  it("leaves out empty sections", () => {
    expect(summaryModule.buildHierarchySummary(base)).toBe(
      [
        "**Subtasks created by Ticket Templates** from template *Plain*, triggered by Jane Doe.",
        "1 of 1 subtask created.",
        "",
        "**Subtasks**",
        '- DEMO-2 "Child"',
      ].join("\n"),
    );
  });

  it("escapes user text so it cannot change the layout", () => {
    expect(summaryModule.escapeMarkdown("*bold* _it_ [link](x) `code` <b> a|b ~x~ \\")).toBe(
      "\\*bold\\* \\_it\\_ \\[link\\](x) \\`code\\` \\<b\\> a\\|b \\~x\\~ \\\\",
    );
    const text = summaryModule.buildHierarchySummary({
      ...base,
      templateName: "My *template*",
      replacements: [{ search: "WORD", value: "a_b", fromField: false }],
      nodes: [{ ...base.nodes[0], created: { id: "DEMO-2", summary: "Fix [x]" } }],
    });
    expect(text).toContain("*My \\*template\\**");
    expect(text).toContain("- `WORD`: a\\_b (entered)");
    expect(text).toContain('- DEMO-2 "Fix \\[x\\]"');
  });

  it("lists entered texts first and words from ticket fields on one line", () => {
    const text = summaryModule.buildHierarchySummary({
      ...base,
      replacements: [
        { search: "A", value: null, fromField: true },
        { search: "B", value: "typed", fromField: false },
        { search: "C", value: null, fromField: false },
        { search: "D", value: null, fromField: true },
      ],
    });
    expect(text).toContain(
      ["**Text replacements**", "- `B`: typed (entered)", "- `C`: not replaced", "- `A`, `D`: from ticket fields"].join(
        "\n",
      ),
    );
  });

  it.each([
    [["a field condition"], "not created: field condition not met"],
    [["Security review Yes (answered No)"], "not created: needs Security review Yes (answered No)"],
    [
      ["Security review Yes (answered No)", "a field condition"],
      "not created: needs Security review Yes (answered No) or a field condition",
    ],
  ])("explains a skipped child template from %j", (unmet, expected) => {
    const text = summaryModule.buildHierarchySummary({ ...base, total: 2, nodes: [base.nodes[0], { ...skipped, unmet }] });
    expect(text).toContain(`- [~~Extra \\*review\\*~~](https://yt.example.com/articles/DEMO-A-3) ${expected}`);
  });

  it.each([
    [["a field condition"], ", created by a field condition"],
    [["Security review is Yes"], ", created because Security review is Yes"],
    // Any matched condition creates it: the option says more than the field condition.
    [["Security review is Yes", "a field condition"], ", created because Security review is Yes"],
  ])("explains a created conditional child template from %j", (matched, expected) => {
    const text = summaryModule.buildHierarchySummary({
      ...base,
      nodes: [{ ...base.nodes[0], conditional: true, matched }],
    });
    expect(text).toContain(`- DEMO-2 "Child"${expected}`);
  });
});

describe("explainChildConditions", () => {
  const labels = (names: Array<string>) =>
    Object.assign(names.map((name) => ({ name, presentation: name })), {});
  const rootFields: Record<string, unknown> = {
    Priority: { name: "Normal", presentation: "Normal" },
    Components: labels(["Backend", "Docs"]),
  };
  const root = {
    fields: rootFields,
    is: (fieldName: string, valueName: string) =>
      (rootFields[fieldName] as FieldValue | undefined)?.name === valueName,
    project: {
      findFieldByName: (name: string) =>
        ({ Priority: enumField("Priority"), Components: enumField("Components", "enum[*]") })[name] ?? null,
    },
  };
  const options = [{ id: "o1", label: "Security review", default: null }];
  const cond = (fieldName: string, fieldValue: string) => ({ when: "field_is", fieldName, fieldValue });

  it("keeps option answers and reads any field condition as one field condition, last", () => {
    const conditional = {
      addConditions: [
        cond("Priority", "Critical"),
        cond("Components", "UI"),
        { when: "option_is", optionId: "o1", value: true },
      ],
    };
    expect(summaryModule.explainChildConditions(root, conditional, {}, {}, options)).toEqual({
      conditional: true,
      matched: [],
      unmet: ["Security review Yes (not answered)", "a field condition"],
    });
    expect(
      summaryModule.explainChildConditions(root, conditional, { Components: ["UI"] }, { o1: false }, options),
    ).toEqual({
      conditional: true,
      matched: ["a field condition"],
      unmet: ["Security review Yes (answered No)", "a field condition"],
    });
    expect(summaryModule.explainChildConditions(root, conditional, {}, { o1: true }, options).matched).toEqual([
      "Security review is Yes",
    ]);
  });

  it("treats child templates without conditions, and field conditions on articles, as unconditional", () => {
    expect(summaryModule.explainChildConditions(root, { addConditions: [] }, {}, {}, options).conditional).toBe(false);
    expect(
      summaryModule.explainChildConditions(null, { addConditions: [cond("Priority", "Critical")] }, {}, {}, options)
        .conditional,
    ).toBe(false);
  });
});
