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
  getAssignmentOverrides: (issue: unknown, assignments: Array<unknown>) => Record<string, string>;
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
