/* eslint-disable no-magic-numbers -- timestamps and field values are test data */
import { beforeAll, describe, expect, it } from "vitest";
import { loadBackendScript } from "../test/load-backend-script.mjs";

type Utils = {
  resolveReplacements: (
    issue: unknown,
    template: unknown,
    texts: Record<string, string>,
    includeUserInput: boolean,
    overrides?: Record<string, string>,
  ) => {
    values: Array<{ search: string; value: string }>;
    errors: Array<string>;
    missingInputs: Array<string>;
    emptyFields: Array<string>;
  };
  resolveReplacementFieldInputs: (
    issue: unknown,
    template: unknown,
    values: unknown,
  ) => {
    assignments: Array<{ fieldName: string; value: unknown; multi: boolean; additive: boolean }>;
    overrides: Record<string, string>;
    errors: Array<string>;
  };
  getAssignmentOverrides: (issue: unknown, assignments: Array<unknown>) => Record<string, string | null>;
  isChildTemplateAdded: (
    issue: unknown,
    child: unknown,
    overrides?: Record<string, string | Array<string>>,
    optionValues?: Record<string, boolean>,
  ) => boolean;
  resolveOptionValues: (
    template: unknown,
    chosen: unknown,
  ) => { values: Record<string, boolean>; errors: Array<string> };
  issueFieldHasValue: (issue: unknown, fieldName: string, valueName: string) => boolean;
  issueFieldBecomes: (issue: unknown, fieldName: string, valueName: string) => boolean;
  issueFieldWas: (issue: unknown, fieldName: string, valueName: string) => boolean;
  newIssueFieldHasValue: (issue: unknown, fieldName: string, valueName: string) => boolean;
  getIssueFieldValueLists: (
    issue: unknown,
    fieldInfos: Array<{ name: string; typeName: string }>,
  ) => Record<string, Array<string>>;
  applyFieldAssignments: (issue: unknown, assignments: Array<unknown>) => void;
  resolveConditionFieldInputs: (
    issue: unknown,
    template: unknown,
    values: unknown,
  ) => {
    assignments: Array<{ fieldName: string; multi: boolean; additive: boolean; value: unknown }>;
    valueOverrides: Record<string, string | Array<string>>;
    errors: Array<string>;
  };
  getStoredReplacementTexts: (entity: unknown) => Record<string, Record<string, string>>;
  storeReplacementTexts: (entity: unknown, template: unknown, texts: unknown) => void;
  clearStoredReplacementTexts: (entity: unknown, templateId: string) => void;
};

let utils: Utils;

beforeAll(() => {
  utils = loadBackendScript("src/template-utils.js") as Utils;
});

type FakeValue = { name: string; presentation: string };

// A project with an enum field Approver, a multi-value version field Fix versions and an enum
// field Priority, and an issue in it.
const makeIssue = (fields: Record<string, FakeValue | Array<FakeValue> | null>) => {
  const values: Record<string, Array<FakeValue>> = {
    Approver: [{ name: "jane", presentation: "Jane Doe" }],
    "Fix versions": [
      { name: "1.0", presentation: "1.0" },
      { name: "2.0", presentation: "2.0" },
    ],
    Priority: [{ name: "Major", presentation: "Major" }],
  };
  const types: Record<string, string> = {
    Approver: "enum[1]",
    "Fix versions": "version[*]",
    Priority: "enum[1]",
  };
  return {
    project: {
      findFieldByName: (name: string) =>
        name in types
          ? {
              typeName: types[name],
              findValueByName: (valueName: string) =>
                values[name].find((value) => value.name === valueName) ?? null,
            }
          : null,
    },
    fields: { "Fix versions": [], ...fields },
  };
};

const template = {
  id: "t",
  replacements: [
    { search: "CUSTOMER", mode: "user_input" },
    { search: "APPROVER", mode: "field", fieldName: "Approver" },
    { search: "VERSION", mode: "field", fieldName: "Fix versions" },
  ],
};

describe("resolveReplacements", () => {
  it("reports empty root ticket fields", () => {
    const result = utils.resolveReplacements(makeIssue({ Approver: null }), template, {}, false);
    expect(result.values).toEqual([]);
    expect(result.emptyFields).toEqual(["Approver", "Fix versions"]);
    expect(result.errors).toEqual([
      'Root ticket field "Approver" is empty.',
      'Root ticket field "Fix versions" is empty.',
    ]);
  });

  it("uses overrides for values set in the same request", () => {
    const issue = makeIssue({
      Approver: { name: "joe", presentation: "Joe" },
      "Fix versions": [{ name: "1.0", presentation: "1.0" }],
    });
    const result = utils.resolveReplacements(issue, template, { CUSTOMER: "ACME" }, true, {
      Approver: "Jane Doe",
    });
    expect(result.values).toEqual([
      { search: "CUSTOMER", value: "ACME" },
      { search: "APPROVER", value: "Jane Doe" },
      { search: "VERSION", value: "1.0" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.emptyFields).toEqual([]);
  });

  it("still rejects field replacements for articles", () => {
    const result = utils.resolveReplacements(null, template, {}, false, { Approver: "Jane Doe" });
    expect(result.errors).toHaveLength(2);
    expect(result.emptyFields).toEqual([]);
  });
});

describe("resolveReplacementFieldInputs", () => {
  it("accepts values for empty fields used by field replacements", () => {
    const result = utils.resolveReplacementFieldInputs(makeIssue({ Approver: null }), template, {
      Approver: "jane",
      "Fix versions": "2.0",
    });
    expect(result.errors).toEqual([]);
    expect(result.overrides).toEqual({ Approver: "Jane Doe", "Fix versions": "2.0" });
    expect(
      result.assignments.map(({ fieldName, multi, additive }) => ({ fieldName, multi, additive })),
    ).toEqual([
      { fieldName: "Approver", multi: false, additive: false },
      { fieldName: "Fix versions", multi: true, additive: false },
    ]);
  });

  it("ignores fields that are filled or not used by a field replacement", () => {
    const issue = makeIssue({ Approver: { name: "joe", presentation: "Joe" } });
    const result = utils.resolveReplacementFieldInputs(issue, template, {
      Approver: "jane",
      Priority: "Major",
      CUSTOMER: "x",
    });
    expect(result).toEqual({ assignments: [], overrides: {}, errors: [] });
    expect(utils.resolveReplacementFieldInputs(issue, template, undefined).assignments).toEqual([]);
  });

  it("rejects unknown values", () => {
    const result = utils.resolveReplacementFieldInputs(makeIssue({ Approver: null }), template, {
      Approver: "nobody",
    });
    expect(result.errors).toEqual(['Value "nobody" not found for field "Approver".']);
    expect(result.assignments).toEqual([]);
  });
});

describe("getAssignmentOverrides", () => {
  it("uses the new value, appended for additive multi-value fields", () => {
    const issue = makeIssue({ "Fix versions": [{ name: "1.0", presentation: "1.0" }] });
    const version = { name: "2.0", presentation: "2.0" };
    expect(
      utils.getAssignmentOverrides(issue, [
        { fieldName: "Fix versions", typeName: "version[*]", value: version, multi: true, additive: true },
        { fieldName: "Approver", typeName: "enum[1]", value: { presentation: "Jane Doe" }, multi: false, additive: false },
      ]),
    ).toEqual({ "Fix versions": "1.0, 2.0", Approver: "Jane Doe" });
    expect(
      utils.getAssignmentOverrides(issue, [
        { fieldName: "Fix versions", typeName: "version[*]", value: version, multi: true, additive: false },
      ]),
    ).toEqual({ "Fix versions": "2.0" });
  });
});

describe("stored replacement texts", () => {
  // An issue or article whose extension property writes are counted.
  const makeEntity = (json?: string) => {
    let value = json;
    let writes = 0;
    return {
      extensionProperties: {
        get templateReplacementTexts() {
          return value;
        },
        set templateReplacementTexts(next: string | undefined) {
          writes += 1;
          value = next;
        },
      },
      writes: () => writes,
      raw: () => value,
    };
  };

  it("reads unset or invalid JSON as empty", () => {
    for (const json of [undefined, "", "not json", "[]", "null", "42"]) {
      expect(utils.getStoredReplacementTexts(makeEntity(json))).toEqual({});
    }
  });

  it("stores only the template's non-empty user-input texts", () => {
    const entity = makeEntity();
    utils.storeReplacementTexts(entity, template, {
      CUSTOMER: "ACME",
      APPROVER: "not a user-input replacement",
      OTHER: "unknown word",
    });
    expect(utils.getStoredReplacementTexts(entity)).toEqual({ t: { CUSTOMER: "ACME" } });

    utils.storeReplacementTexts(entity, template, { CUSTOMER: "  " });
    expect(utils.getStoredReplacementTexts(entity)).toEqual({});
  });

  it("keeps other templates and only writes on changes", () => {
    const entity = makeEntity(JSON.stringify({ other: { NAME: "x" } }));
    utils.storeReplacementTexts(entity, template, { CUSTOMER: "ACME" });
    expect(entity.writes()).toBe(1);
    utils.storeReplacementTexts(entity, template, { CUSTOMER: "ACME" });
    utils.storeReplacementTexts(entity, { id: "none", replacements: [] }, {});
    expect(entity.writes()).toBe(1);
    expect(utils.getStoredReplacementTexts(entity)).toEqual({
      other: { NAME: "x" },
      t: { CUSTOMER: "ACME" },
    });
  });

  it("clears one template", () => {
    const entity = makeEntity(JSON.stringify({ other: { NAME: "x" }, t: { CUSTOMER: "ACME" } }));
    utils.clearStoredReplacementTexts(entity, "t");
    expect(utils.getStoredReplacementTexts(entity)).toEqual({ other: { NAME: "x" } });
    utils.clearStoredReplacementTexts(entity, "t");
    expect(entity.writes()).toBe(1);
  });
});

describe("conditional child templates", () => {
  // Root ticket with single-value condition fields Priority (enum) and State (state), a user field
  // and a multi-value enum field.
  const values: Record<string, Array<{ name: string; login?: string }>> = {
    Priority: [{ name: "Normal" }, { name: "Minor" }],
    State: [{ name: "Open" }, { name: "Fixed" }],
    Assignee: [{ name: "jane", login: "jane" }],
    Labels: [{ name: "a" }],
  };
  const types: Record<string, string> = {
    Priority: "enum[1]",
    State: "state[1]",
    Assignee: "user[1]",
    Labels: "enum[*]",
  };
  const makeRoot = (fields: Record<string, { name: string } | null>) => ({
    fields,
    is: (fieldName: string, valueName: string) => fields[fieldName]?.name === valueName,
    project: {
      findFieldByName: (name: string) =>
        name in types
          ? {
              typeName: types[name],
              findValueByName: (n: string) => values[name].find((v) => v.name === n) ?? null,
              findValueByLogin: (n: string) => values[name].find((v) => v.login === n) ?? null,
            }
          : null,
    },
  });
  const cond = (fieldName: string, fieldValue: string) => ({ when: "field_is", fieldName, fieldValue });
  const conditional = {
    id: "t",
    children: [
      { id: "a", addConditions: [cond("Priority", "Minor")], children: [] },
      {
        id: "b",
        addConditions: [],
        children: [
          { id: "c", addConditions: [cond("State", "Fixed"), cond("Assignee", "jane")], children: [] },
          { id: "d", addConditions: [cond("Labels", "a")], children: [] },
        ],
      },
    ],
  };

  it("uses value overrides instead of the root ticket's values", () => {
    const root = makeRoot({ Priority: { name: "Normal" } });
    const child = conditional.children[0];
    expect(utils.isChildTemplateAdded(root, child)).toBe(false);
    expect(utils.isChildTemplateAdded(root, child, { Priority: "Minor" })).toBe(true);
    expect(utils.isChildTemplateAdded(makeRoot({ Priority: { name: "Minor" } }), child, { Priority: "Normal" })).toBe(false);
    expect(utils.isChildTemplateAdded(root, conditional.children[1], { Priority: "x" })).toBe(true);
  });

  it("accepts changed values of condition fields only", () => {
    const root = makeRoot({ Priority: { name: "Normal" }, State: { name: "Open" } });
    const result = utils.resolveConditionFieldInputs(root, conditional, {
      Priority: "Minor",
      State: "Open",
      Assignee: "jane",
      Labels: "a",
      Unrelated: "x",
    });
    expect(result.errors).toEqual([]);
    // A single name for a multi-value field is taken as a one-value list.
    expect(result.valueOverrides).toEqual({ Priority: "Minor", Labels: ["a"] });
    expect(result.assignments.map(({ fieldName, multi }) => ({ fieldName, multi }))).toEqual([
      { fieldName: "Priority", multi: false },
      { fieldName: "Labels", multi: true },
    ]);
    expect(utils.resolveConditionFieldInputs(root, conditional, undefined).assignments).toEqual([]);
  });

  it("rejects unknown values and accepts values for empty fields", () => {
    const root = makeRoot({ Priority: null, State: null });
    const result = utils.resolveConditionFieldInputs(root, conditional, {
      Priority: "Urgent",
      State: "Fixed",
    });
    expect(result.errors).toEqual(['Value "Urgent" not found for field "Priority".']);
    expect(result.valueOverrides).toEqual({ State: "Fixed" });
  });
});

describe("conditions on multi-value fields", () => {
  type V = { name: string };
  // A workflow Set: an array with the added and removed values of the current change.
  const makeSet = (values: Array<V>, added: Array<V> = [], removed: Array<V> = []) => {
    const set = [...values] as Array<V> & {
      added: Array<V>;
      removed: Array<V>;
      clear: () => void;
      add: (v: V) => void;
    };
    set.added = added;
    set.removed = removed;
    set.clear = () => set.splice(0, set.length);
    set.add = (v: V) => set.push(v);
    return set;
  };
  const values: Record<string, Array<V>> = {
    Type: [{ name: "Bug" }, { name: "Task" }],
    Team: [{ name: "Core" }, { name: "Web" }],
    Components: [{ name: "UI" }, { name: "Backend" }, { name: "Docs" }],
    Areas: [{ name: "North" }, { name: "South" }],
  };
  const types: Record<string, string> = {
    Type: "enum[1]",
    Team: "ownedField[1]",
    Components: "enum[*]",
    Areas: "ownedField[*]",
  };
  const calls: Array<string> = [];
  const makeRootIssue = (fields: Record<string, unknown>, changed: Array<string> = []) => ({
    fields: {
      ...fields,
      becomes: (fieldName: string, valueName: string) => {
        calls.push(`becomes ${fieldName}`);
        return (fields[fieldName] as V | null)?.name === valueName;
      },
    },
    is: (fieldName: string, valueName: string) => {
      calls.push(`is ${fieldName}`);
      return (fields[fieldName] as V | null)?.name === valueName;
    },
    was: (fieldName: string, valueName: string) => {
      calls.push(`was ${fieldName}`);
      return valueName === "Task";
    },
    isChanged: (fieldName: string) => changed.includes(fieldName),
    project: {
      findFieldByName: (name: string) =>
        name in types
          ? {
              typeName: types[name],
              findValueByName: (n: string) => values[name].find((v) => v.name === n) ?? null,
            }
          : null,
    },
  });

  it("uses the workflow API for single-value fields, as before", () => {
    calls.length = 0;
    const issue = makeRootIssue({ Type: { name: "Bug" }, Team: { name: "Core" } }, ["Type"]);
    expect(utils.issueFieldHasValue(issue, "Type", "Bug")).toBe(true);
    expect(utils.issueFieldHasValue(issue, "Team", "Web")).toBe(false);
    expect(utils.issueFieldBecomes(issue, "Type", "Bug")).toBe(true);
    expect(utils.issueFieldWas(issue, "Type", "Task")).toBe(true);
    // Unchanged fields neither become nor were anything, without asking the API.
    expect(utils.issueFieldBecomes(issue, "Team", "Core")).toBe(false);
    expect(utils.issueFieldWas(issue, "Team", "Task")).toBe(false);
    expect(calls).toEqual(["is Type", "is Team", "becomes Type", "was Type"]);
    expect(utils.newIssueFieldHasValue(issue, "Team", "Core")).toBe(true);
    expect(utils.newIssueFieldHasValue(makeRootIssue({ Type: null }), "Type", "Bug")).toBe(false);
  });

  it("matches multi-value fields by membership, added and removed values", () => {
    const issue = makeRootIssue(
      {
        Components: makeSet([{ name: "UI" }, { name: "Backend" }], [{ name: "Backend" }], [{ name: "Docs" }]),
        Areas: makeSet([]),
      },
      ["Components"],
    );
    expect(utils.issueFieldHasValue(issue, "Components", "UI")).toBe(true);
    expect(utils.issueFieldHasValue(issue, "Components", "Docs")).toBe(false);
    expect(utils.issueFieldHasValue(issue, "Areas", "North")).toBe(false);
    expect(utils.issueFieldBecomes(issue, "Components", "Backend")).toBe(true);
    expect(utils.issueFieldBecomes(issue, "Components", "UI")).toBe(false);
    expect(utils.issueFieldWas(issue, "Components", "Docs")).toBe(true);
    expect(utils.issueFieldWas(issue, "Components", "UI")).toBe(false);
    expect(utils.newIssueFieldHasValue(issue, "Components", "UI")).toBe(true);
    expect(
      utils.getIssueFieldValueLists(issue, [
        { name: "Components", typeName: "enum[*]" },
        { name: "Areas", typeName: "ownedField[*]" },
      ]),
    ).toEqual({ Components: ["UI", "Backend"], Areas: [] });
  });

  it("adds child templates when the root ticket's field includes the value", () => {
    const child = {
      id: "c",
      addConditions: [{ when: "field_is", fieldName: "Components", fieldValue: "Docs" }],
      children: [],
    };
    const root = makeRootIssue({ Components: makeSet([{ name: "UI" }, { name: "Docs" }]) });
    expect(utils.isChildTemplateAdded(root, child)).toBe(true);
    expect(utils.isChildTemplateAdded(root, child, { Components: ["UI"] })).toBe(false);
    expect(utils.isChildTemplateAdded(makeRootIssue({ Components: makeSet([]) }), child, { Components: ["Docs"] })).toBe(
      true,
    );
  });

  const conditionTemplate = {
    id: "t",
    children: [
      {
        id: "a",
        addConditions: [
          { when: "field_is", fieldName: "Components", fieldValue: "UI" },
          { when: "field_is", fieldName: "Team", fieldValue: "Web" },
        ],
        children: [],
      },
    ],
  };

  it("replaces the values of multi-value condition fields with the chosen list", () => {
    const root = makeRootIssue({ Components: makeSet([{ name: "UI" }, { name: "Docs" }]), Team: { name: "Core" } });
    expect(
      utils.resolveConditionFieldInputs(root, conditionTemplate, { Components: ["Docs", "UI"], Team: "Core" }).assignments,
    ).toEqual([]);

    const changed = utils.resolveConditionFieldInputs(root, conditionTemplate, {
      Components: ["Backend", "UI", "Backend"],
      Team: "Web",
    });
    expect(changed.errors).toEqual([]);
    expect(changed.valueOverrides).toEqual({ Components: ["Backend", "UI"], Team: "Web" });
    expect(
      changed.assignments.map(({ fieldName, multi, additive, value }) => [fieldName, multi, additive, (value as V).name]),
    ).toEqual([
      ["Components", true, false, "Backend"],
      ["Components", true, true, "UI"],
      ["Team", false, false, "Web"],
    ]);
    utils.applyFieldAssignments(root, changed.assignments);
    expect(((root.fields as Record<string, unknown>).Components as Array<V>).map((v) => v.name)).toEqual(["Backend", "UI"]);
  });

  it("clears a multi-value field when no values are chosen", () => {
    const root = makeRootIssue({ Components: makeSet([{ name: "UI" }]) });
    const cleared = utils.resolveConditionFieldInputs(root, conditionTemplate, { Components: [] });
    expect(cleared.valueOverrides).toEqual({ Components: [] });
    expect(cleared.assignments.map(({ multi, additive, value }) => [multi, additive, value])).toEqual([
      [true, false, null],
    ]);
    expect(utils.getAssignmentOverrides(root, cleared.assignments)).toEqual({ Components: null });
    utils.applyFieldAssignments(root, cleared.assignments);
    expect(((root.fields as Record<string, unknown>).Components as Array<V>).length).toBe(0);
  });

  it("rejects the whole list when a value is unknown", () => {
    const root = makeRootIssue({ Components: makeSet([]) });
    const result = utils.resolveConditionFieldInputs(root, conditionTemplate, { Components: ["UI", "Nope"] });
    expect(result.errors).toEqual(['Value "Nope" not found for field "Components".']);
    expect(result.assignments).toEqual([]);
    expect(result.valueOverrides).toEqual({});
  });
});

describe("simple field types", () => {
  type Assignment = { fieldName: string; typeName: string; value: unknown; multi: boolean };
  type SimpleUtils = {
    getValueKind: (typeName: string) => string;
    parseSimpleFieldValue: (kind: string, text: unknown, isFixed: boolean) => { value?: unknown; error?: string };
    resolveTemplateFieldValues: (
      project: unknown,
      template: unknown,
      userValues: unknown,
      includeUserInput: boolean,
    ) => { assignments: Array<Assignment>; errors: Array<string> };
    getFixedValueErrors: (project: unknown, template: unknown) => Array<string>;
    getIssueFieldValues: (issue: unknown, infos: Array<{ name: string; typeName: string }>) => Record<string, string | null>;
    getIssueFieldPresentations: (
      issue: unknown,
      infos: Array<{ name: string; typeName: string }>,
    ) => Record<string, string | null>;
    getAssignmentOverrides: (issue: unknown, assignments: Array<Assignment>) => Record<string, string>;
    copyFieldValue: (from: unknown, to: unknown, fieldName: string) => void;
    getProjectFieldInfo: (project: unknown) => Array<{ name: string; typeName: string; values: Array<unknown> }>;
  };
  let simple: SimpleUtils;
  beforeAll(() => {
    simple = utils as unknown as SimpleUtils;
  });

  const types: Record<string, string> = {
    Due: "date",
    Deadline: "date and time",
    Estimation: "period",
    Points: "integer",
    Ratio: "float",
    Code: "string",
  };
  const project = {
    findFieldByName: (name: string) => (name in types ? { typeName: types[name] } : null),
    fields: Object.entries(types).map(([name, typeName]) => ({ name, typeName })),
  };
  const DAY = 24 * 60 * 60 * 1000;
  const noonToday = () => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  };

  it("knows the value kinds", () => {
    expect(simple.getValueKind("date and time")).toBe("datetime");
    expect(simple.getValueKind("enum[1]")).toBe("list");
  });

  it("offers simple fields without a value list", () => {
    const infos = simple.getProjectFieldInfo(project);
    expect(infos.map((info) => info.name)).toEqual(Object.keys(types));
    expect(infos.every((info) => info.values.length === 0)).toBe(true);
  });

  it("parses fixed relative dates as offsets from today and now", () => {
    expect(simple.parseSimpleFieldValue("date", "+1w 2d", true).value).toBe(noonToday() + 9 * DAY);
    expect(simple.parseSimpleFieldValue("date", "+2d 4h", true).error).toBeDefined();
    expect(simple.parseSimpleFieldValue("date", "14d", true).error).toBeDefined();
    const before = Date.now();
    const value = simple.parseSimpleFieldValue("datetime", "+1d 2h 30m", true).value as number;
    const offset = DAY + 150 * 60 * 1000;
    expect(value).toBeGreaterThanOrEqual(before + offset);
    expect(value).toBeLessThanOrEqual(Date.now() + offset);
  });

  it("parses values chosen by the user", () => {
    expect(simple.parseSimpleFieldValue("date", "2026-12-01", false).value).toBe(Date.UTC(2026, 11, 1, 12));
    expect(simple.parseSimpleFieldValue("date", "2026-02-31", false).error).toBeDefined();
    expect(simple.parseSimpleFieldValue("date", "+2d", false).error).toBeDefined();
    expect(simple.parseSimpleFieldValue("datetime", "1700000000000", false).value).toBe(1700000000000);
    expect(simple.parseSimpleFieldValue("integer", "-12", false).value).toBe(-12);
    expect(simple.parseSimpleFieldValue("integer", "1.5", false).error).toBeDefined();
    expect(simple.parseSimpleFieldValue("float", "1.5", false).value).toBe(1.5);
    expect(simple.parseSimpleFieldValue("float", "abc", false).error).toBeDefined();
    expect(simple.parseSimpleFieldValue("string", "ABC-1", true).value).toBe("ABC-1");
    expect(simple.parseSimpleFieldValue("string", " ", true).error).toBeDefined();
    const period = simple.parseSimpleFieldValue("period", "1w 4h", true).value as { text: string };
    expect(period.text).toBe("1w4h");
    expect(simple.parseSimpleFieldValue("period", "4h 1w", true).error).toBeDefined();
  });

  it("resolves fixed and user-input template fields", () => {
    const result = simple.resolveTemplateFieldValues(
      project,
      {
        fields: [
          { fieldName: "Due", mode: "fixed", fieldValue: "+3d" },
          { fieldName: "Points", mode: "user_input" },
          { fieldName: "Ratio", mode: "fixed", fieldValue: "x" },
          { fieldName: "Code", mode: "user_input" },
        ],
      },
      { Points: "5" },
      true,
    );
    expect(result.errors).toEqual(['Invalid float value "x" for field "Ratio".']);
    expect(result.assignments.map(({ fieldName, value, multi }) => ({ fieldName, value, multi }))).toEqual([
      { fieldName: "Due", value: noonToday() + 3 * DAY, multi: false },
      { fieldName: "Points", value: 5, multi: false },
    ]);
  });

  it("reports bad fixed values of the template and its children", () => {
    const errors = simple.getFixedValueErrors(project, {
      fields: [{ fieldName: "Points", mode: "fixed", fieldValue: "many" }],
      children: [
        { name: "Sub", fields: [{ fieldName: "Due", mode: "fixed", fieldValue: "tomorrow" }], children: [] },
      ],
    });
    expect(errors).toEqual([
      'Invalid integer value "many" for field "Points".',
      'Child template "Sub": Invalid date value "tomorrow" for field "Due".',
    ]);
  });

  it("presents current values for replacements, including zero", () => {
    const period = { getWeeks: () => 0, getDays: () => 1, getHours: () => 4, getMinutes: () => 0 };
    const issue = {
      fields: {
        Due: Date.UTC(2026, 11, 1, 12),
        Deadline: Date.UTC(2026, 11, 1, 9, 30),
        Estimation: period,
        Points: 0,
        Ratio: null,
        Code: "X",
      },
    };
    const infos = project.fields;
    expect(simple.getIssueFieldPresentations(issue, infos)).toEqual({
      Due: "2026-12-01",
      Deadline: "2026-12-01 09:30",
      Estimation: "1d 4h",
      Points: "0",
      Ratio: null,
      Code: "X",
    });
    expect(simple.getIssueFieldValues(issue, infos).Deadline).toBe(String(Date.UTC(2026, 11, 1, 9, 30)));
    expect(
      simple.getAssignmentOverrides(issue, [{ fieldName: "Points", typeName: "integer", value: 7, multi: false }]),
    ).toEqual({ Points: "7" });
  });

  it("copies simple values to subtasks", () => {
    const period = { getWeeks: () => 1 };
    const from = { fields: { Code: "X", Points: 3, Estimation: period, Due: null } };
    const to = { fields: {} as Record<string, unknown> };
    for (const name of ["Code", "Points", "Estimation", "Due"]) {
      simple.copyFieldValue(from, to, name);
    }
    expect(to.fields).toEqual({ Code: "X", Points: 3, Estimation: period, Due: null });
  });
});

describe("options", () => {
  const optionTemplate = {
    id: "t",
    hierarchical: true,
    options: [
      { id: "sec", label: "Security review", default: true },
      { id: "sign", label: "Customer sign-off", default: null },
      { id: "unused", label: "Unused", default: null },
    ],
    children: [
      { id: "a", addConditions: [{ when: "option_is", optionId: "sec", value: true }], children: [] },
      {
        id: "b",
        addConditions: [],
        children: [
          {
            id: "c",
            addConditions: [
              { when: "option_is", optionId: "sign", value: false },
              { when: "field_is", fieldName: "Priority", fieldValue: "Minor" },
            ],
            children: [],
          },
        ],
      },
    ],
  };
  const [childA, childB] = optionTemplate.children;
  const childC = childB.children[0];

  it("resolves answers from choices and defaults, asking only for used options", () => {
    expect(utils.resolveOptionValues(optionTemplate, { sign: false })).toEqual({
      values: { sec: true, sign: false },
      errors: [],
    });
    expect(utils.resolveOptionValues(optionTemplate, { sec: false, sign: true, unused: true })).toEqual({
      values: { sec: false, sign: true },
      errors: [],
    });
    expect(utils.resolveOptionValues(optionTemplate, undefined)).toEqual({
      values: { sec: true },
      errors: ['Choose Yes or No for option "Customer sign-off".'],
    });
    // Answers that are not booleans count as not answered.
    expect(utils.resolveOptionValues(optionTemplate, { sign: "yes" }).errors).toHaveLength(1);
    expect(utils.resolveOptionValues({ id: "x", children: [] }, {})).toEqual({ values: {}, errors: [] });
  });

  it("adds children by their option conditions", () => {
    const root = { is: (fieldName: string, valueName: string) => fieldName === "Priority" && valueName === "Minor" };
    expect(utils.isChildTemplateAdded(root, childA, {}, { sec: true })).toBe(true);
    expect(utils.isChildTemplateAdded(root, childA, {}, { sec: false })).toBe(false);
    expect(utils.isChildTemplateAdded(root, childA, {}, undefined)).toBe(false);
    // Either condition creates the child.
    expect(utils.isChildTemplateAdded(root, childC, {}, { sign: true })).toBe(true);
    expect(utils.isChildTemplateAdded(root, childB, {}, {})).toBe(true);
  });

  it("ignores field conditions for articles, as before", () => {
    expect(utils.isChildTemplateAdded(null, childC, {}, { sign: true })).toBe(false);
    expect(utils.isChildTemplateAdded(null, childC, {}, { sign: false })).toBe(true);
    const fieldOnly = { id: "f", addConditions: [{ when: "field_is", fieldName: "Priority", fieldValue: "Minor" }] };
    expect(utils.isChildTemplateAdded(null, fieldOnly, {}, {})).toBe(true);
  });
});
