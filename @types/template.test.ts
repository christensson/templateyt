import { describe, expect, it } from "vitest";
import currentFixture from "../test/fixtures/templates-current.json";
import legacyFixture from "../test/fixtures/templates-legacy.json";
import {
  addConditionForKey,
  createEmptyTemplate,
  formatFieldValue,
  formatTemplateField,
  isValidSimpleFieldValue,
  duplicateTemplate,
  flattenChildTemplates,
  getAddConditionKey,
  evaluateChildInclusion,
  formatAddCondition,
  formatChildAddConditions,
  formatChildConditionNote,
  formatValidCondition,
  getConditionVerb,
  toConditionValues,
  getUsedOptions,
  getInitialOptionValues,
  getUnansweredOptions,
  getTemplateOptions,
  formatOptionDefault,
  formatTemplateHierarchy,
  validateTemplateOptions,
  formatChildTemplate,
  getChildAddConditions,
  getChildConditionFields,
  formatTemplateTag,
  formatTemplateTargetNoun,
  getTemplateScope,
  getTicketFeatureAvailability,
  formatTemplateEffectTokens,
  formatTemplateSummaryTokens,
  formatTemplateValidCondition,
  getChildTemplates,
  getTemplateFields,
  getTemplateRelations,
  getTemplateReplacements,
  getTemplateTags,
  getValidConditions,
  prepareTemplateForStore,
  pruneDanglingRelations,
  validateChildTemplate,
  validateChildTemplates,
  validateRelations,
  validateReplacements,
  validateTemplate,
  validateTemplateFields,
  type ChildTemplate,
  type Template,
} from "./template";

// Stored templates exactly as the backend returns them (project extension property `templates`).
const current = currentFixture as unknown as Array<Template>;
// Templates stored by older app versions, lacking keys that were added later.
const legacy = legacyFixture as unknown as Array<Template>;
const all = [...current, ...legacy];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// The validation chain of addOrUpdateTemplate before validateTemplate existed. validateTemplate
// must report this message first, so stored templates keep being accepted or rejected the same way.
const legacyFirstError = (template: Template): string | null => {
  const toStore = pruneDanglingRelations(template);
  if (toStore.name.trim() === "") {
    return "Template name is required.";
  }
  if (toStore.articleId.trim() === "") {
    return "Template article is required.";
  }
  if (getValidConditions(toStore).length === 0) {
    return "Template missing valid conditions, please define when valid.";
  }
  return (
    validateTemplateFields(toStore) ??
    validateChildTemplates(toStore) ??
    validateReplacements(toStore) ??
    validateRelations(toStore)
  );
};

const releaseTemplate = (): Template => {
  const template = current.find((t) => t.name === "Release template");
  if (!template) {
    throw new Error("Fixture is missing the Release template");
  }
  return clone(template);
};

const firstChild = (template: Template): ChildTemplate => getChildTemplates(template)[0];

// Broken variants of real templates, one problem each.
const brokenVariants: Array<[string, () => Template]> = [
  ["empty name", () => ({ ...releaseTemplate(), name: "  " })],
  ["no article", () => ({ ...releaseTemplate(), articleId: "" })],
  ["no validity condition", () => ({ ...releaseTemplate(), validCondition: [] })],
  [
    "field without value",
    () => ({ ...releaseTemplate(), fields: [{ fieldName: "Priority", mode: "fixed", fieldValue: "" }] }),
  ],
  [
    "duplicate replacement",
    () => ({
      ...releaseTemplate(),
      replacements: [
        { search: "VERSION", mode: "user_input" },
        { search: "VERSION", mode: "user_input" },
      ],
    }),
  ],
  [
    "child without name",
    () => {
      const template = releaseTemplate();
      firstChild(template).name = "";
      return template;
    },
  ],
  [
    "relation without target",
    () => ({ ...releaseTemplate(), relations: [{ linkName: "relates to", target: "fixed", issueId: "" }] }),
  ],
  [
    "hierarchical without children",
    () => ({ ...releaseTemplate(), children: [] }),
  ],
];

describe("stored template compatibility", () => {
  it("has the live fixture with a hierarchy, fields, tags and replacements", () => {
    expect(current.length).toBeGreaterThan(0);
    expect(current.some((t) => t.hierarchical && getChildTemplates(t).length > 0)).toBe(true);
    expect(current.some((t) => getTemplateFields(t).length > 0)).toBe(true);
    expect(current.some((t) => getTemplateTags(t).length > 0)).toBe(true);
    expect(current.some((t) => getTemplateReplacements(t).length > 0)).toBe(true);
  });

  it.each(current.map((t) => [t.name, t] as const))(
    "stores %s unchanged when saved without edits",
    (_name, template) => {
      const input = clone(template);
      const { template: payload, errors } = prepareTemplateForStore(input);
      expect(errors).toEqual([]);
      // Same keys, same values: saving must not add, drop or rename anything.
      expect(payload).toStrictEqual(template);
      expect(JSON.stringify(payload)).toBe(JSON.stringify(template));
      // The input is not mutated.
      expect(input).toStrictEqual(template);
    },
  );

  it.each(legacy.map((t) => [t.name, t] as const))(
    "reads legacy template %s without throwing",
    (_name, template) => {
      expect(Array.isArray(getValidConditions(template))).toBe(true);
      expect(getTemplateFields(template)).toEqual(template.fields ?? []);
      expect(getTemplateTags(template)).toEqual([]);
      expect(getTemplateRelations(template)).toEqual([]);
      expect(getTemplateReplacements(template)).toEqual(template.replacements ?? []);
      expect(getChildTemplates(template)).toEqual([]);
      expect(() => formatTemplateValidCondition(template)).not.toThrow();
    },
  );

  it.each(legacy.map((t) => [t.name, t] as const))(
    "stores legacy template %s with only the pre-existing children default added",
    (_name, template) => {
      const { template: payload } = prepareTemplateForStore(clone(template));
      // pruneDanglingRelations has always written `children`; nothing else may change.
      const { children, ...rest } = payload;
      const { children: originalChildren, ...originalRest } = template;
      expect(rest).toStrictEqual(originalRest);
      expect(children).toEqual(originalChildren ?? []);
    },
  );

  it("drops relations to removed child templates, as before", () => {
    const template = releaseTemplate();
    template.relations = [{ linkName: "relates to", target: "child", childId: "removed-child" }];
    const { template: payload } = prepareTemplateForStore(template);
    expect(payload.relations).toEqual([]);
  });
});

describe("validateTemplate", () => {
  it.each(all.map((t) => [t.name, t] as const))(
    "reports the same first error as before for %s",
    (_name, template) => {
      expect(validateTemplate(pruneDanglingRelations(template))[0]?.message ?? null).toBe(
        legacyFirstError(template),
      );
    },
  );

  it.each(brokenVariants)("reports the same first error as before for %s", (_name, make) => {
    const template = make();
    const expected = legacyFirstError(template);
    expect(expected).not.toBeNull();
    expect(validateTemplate(pruneDanglingRelations(template))[0]?.message).toBe(expected);
  });

  it("lists every problem of a template broken in several ways, by section", () => {
    const template: Template = {
      ...releaseTemplate(),
      name: "",
      fields: [{ fieldName: "Priority", mode: "fixed", fieldValue: "" }],
      replacements: [
        { search: "VERSION", mode: "user_input" },
        { search: "VERSION", mode: "user_input" },
      ],
    };
    expect(validateTemplate(template)).toEqual([
      { section: "general", message: "Template name is required." },
      { section: "effects", message: 'Template field "Priority" is missing a value.' },
      { section: "effects", message: 'Text replacement "VERSION" is listed more than once.' },
    ]);
  });
});

describe("createEmptyTemplate", () => {
  it("has the stored key set and starts available for tickets", () => {
    const template = createEmptyTemplate();
    const storedKeys = new Set(current.flatMap((t) => Object.keys(t)));
    for (const key of Object.keys(template)) {
      expect(storedKeys.has(key)).toBe(true);
    }
    expect(template.validCondition).toEqual([{ when: "entity_is", entityType: "issue" }]);
  });

  it("can be stored once named and given an article", () => {
    const template = { ...createEmptyTemplate(), name: "New", articleId: "SAN-A-1" };
    expect(prepareTemplateForStore(template).errors).toEqual([]);
  });
});

describe("list copy", () => {
  it.each([
    [[{ when: "entity_is", entityType: "issue" }], "Valid when ticket."],
    [
      [
        { when: "entity_is", entityType: "issue" },
        { when: "entity_is", entityType: "article" },
      ],
      "Valid when ticket or article.",
    ],
    [
      [
        { when: "field_is", fieldName: "Type", fieldValue: "New" },
        { when: "entity_is", entityType: "article" },
      ],
      "Valid when ticket field Type is New or article.",
    ],
    [[], "No validity condition set."],
  ])("formats validity conditions %j", (validCondition, expected) => {
    const template = { ...createEmptyTemplate(), validCondition } as Template;
    expect(formatTemplateValidCondition(template)).toBe(expected);
  });

  it("leaves child rows without settings empty instead of repeating 'No fields set.'", () => {
    const child = getChildTemplates(releaseTemplate()).find(
      (c) => !c.manual && getTemplateFields(c).length === 0 && !c.inheritParentFields,
    );
    expect(child).toBeDefined();
    expect(formatChildTemplate(child as ChildTemplate)).toBe("");
  });
});

describe("addConditionForKey", () => {
  it.each([
    ["none", null],
    ["field_becomes", { when: "field_becomes", fieldName: "", fieldValue: "" }],
    ["tag_added", { when: "tag_added", tagName: "" }],
  ] as const)("maps %s to the stored add condition", (key, expected) => {
    expect(addConditionForKey(key)).toEqual(expected);
  });

  it.each(all.map((t) => [t.name, t] as const))("reads the option of %s", (_name, template) => {
    expect(getAddConditionKey(template)).toBe(template.addCondition?.when ?? "none");
  });
});

describe("duplicateTemplate", () => {
  it("copies with new ids, keeps relations pointing at the copied child templates", () => {
    const original = releaseTemplate();
    const child = firstChild(original);
    original.relations = [{ linkName: "relates to", target: "child", childId: child.id }];
    const copy = duplicateTemplate(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Copy of Release template");
    const copiedChildIds = flattenChildTemplates(getChildTemplates(copy)).map(({ child: c }) => c.id);
    const originalChildIds = flattenChildTemplates(getChildTemplates(original)).map(({ child: c }) => c.id);
    expect(copiedChildIds).toHaveLength(originalChildIds.length);
    expect(copiedChildIds.some((id) => originalChildIds.includes(id))).toBe(false);
    expect(copy.relations).toEqual([
      { linkName: "relates to", target: "child", childId: firstChild(copy).id },
    ]);
    // Same stored shape: only ids and the name differ.
    const strip = (t: Template) =>
      JSON.parse(JSON.stringify(t).replace(/"(id|childId)":"[^"]*"/g, '"$1":""').replace(/"name":"Copy of /, '"name":"'));
    expect(strip(copy)).toStrictEqual(strip(original));
    expect(prepareTemplateForStore(copy).errors).toEqual([]);
  });
});

describe("formatTemplateSummaryTokens", () => {
  const byName = (name: string) => current.find((t) => t.name === name) as Template;

  it.each([
    ["Extra Software Review", ["Ticket or article", "Auto: tag Extra Review"]],
    ["Task template", ["Ticket", "Auto: Type → Task"]],
    ["Meeting minutes template", ["Article"]],
    ["Bug template", ["Ticket", "Auto: Type → Bug", "3 fields"]],
    ["Release template", ["Type is New or article", "2 fields", "1 tag", "3 replacements", "11 subtasks"]],
  ])("summarises %s", (name, expected) => {
    expect(formatTemplateSummaryTokens(byName(name))).toEqual(expected);
  });

  it("summarises legacy templates without optional keys", () => {
    expect(formatTemplateSummaryTokens(legacy[0])).toEqual(["Ticket"]);
    expect(formatTemplateSummaryTokens(legacy[2])).toEqual(["Auto: tag Extra Review"]);
  });
});

describe("child template validation", () => {
  const withChild = (change: (child: ChildTemplate) => void): Template => {
    const template = releaseTemplate();
    change(firstChild(template));
    return template;
  };

  it("finds no problems in the stored hierarchies", () => {
    for (const template of current) {
      for (const { child } of flattenChildTemplates(getChildTemplates(template))) {
        expect(validateChildTemplate(template, child)).toEqual([]);
      }
    }
  });

  // Exact messages of validateChildTemplates as they were before it used validateChildTemplate.
  it.each([
    [
      "missing name",
      (c: ChildTemplate) => {
        c.name = " ";
      },
      (c: ChildTemplate) => `Child template for article ${c.articleId} needs a name.`,
    ],
    [
      "condition without field",
      (c: ChildTemplate) => {
        c.addConditions = [{ when: "field_is", fieldName: "", fieldValue: "" }];
      },
      (c: ChildTemplate) => `Child template "${c.name}" condition is missing a field name.`,
    ],
    [
      "condition without value",
      (c: ChildTemplate) => {
        c.addConditions = [{ when: "field_is", fieldName: "Priority", fieldValue: "" }];
      },
      (c: ChildTemplate) => `Child template "${c.name}" condition is missing a value.`,
    ],
    [
      "field without value",
      (c: ChildTemplate) => {
        c.fields = [{ fieldName: "Priority", mode: "fixed", fieldValue: "" }];
      },
      (c: ChildTemplate) => `Child template "${c.name}" field "Priority" is missing a value.`,
    ],
  ])("keeps the stored-template message for %s", (_name, change, message) => {
    const template = withChild(change);
    expect(validateChildTemplates(template)).toBe(message(firstChild(template)));
  });

  it("lists every problem of a child template by section, including relations", () => {
    const template = withChild((c) => {
      c.addConditions = [{ when: "field_is", fieldName: "Priority", fieldValue: "" }];
      c.fields = [{ fieldName: "Priority", mode: "fixed", fieldValue: "" }];
      c.relations = [{ linkName: "", target: "root" }];
    });
    const child = firstChild(template);
    expect(validateChildTemplate(template, child)).toEqual([
      { section: "when", message: `Child template "${child.name}" condition is missing a value.` },
      { section: "effects", message: `Child template "${child.name}" field "Priority" is missing a value.` },
      { section: "effects", message: `Child template "${child.name}" has a relation without link type.` },
    ]);
  });

  it("ignores child templates of a template that is not hierarchical", () => {
    const template = withChild((c) => {
      c.name = "";
    });
    template.hierarchical = false;
    expect(validateChildTemplate(template, firstChild(template))).toEqual([]);
    expect(validateChildTemplates(template)).toBeNull();
  });

  it("reports child relation problems through validateRelations as before", () => {
    const template = withChild((c) => {
      c.relations = [{ linkName: "relates to", target: "fixed", issueId: "" }];
    });
    expect(validateRelations(template)).toBe(
      `Child template "${firstChild(template).name}" relation "relates to" needs a ticket id.`,
    );
  });
});

describe("formatTemplateEffectTokens", () => {
  const byName = (name: string): Template => {
    const template = all.find((t) => t.name === name);
    if (!template) {
      throw new Error(`No fixture ${name}`);
    }
    return template;
  };

  it.each([
    ["Extra Software Review", "ticket", ["Adds content only", "Auto when tagged Extra Review"]],
    ["Meeting minutes template", "ticket", ["Adds content only"]],
    ["Task template", "ticket", ["Adds content only", "Auto when Type → Task"]],
    [
      "Bug template",
      "ticket",
      ["Sets Priority", "Asks for Subsystem, Assignee", "Auto when Type → Bug"],
    ],
    [
      "Release template",
      "ticket",
      [
        "Asks for Assignee, Fix versions, CUSTOMER",
        "Tags test4",
        "Creates 11 subtasks (2 conditional)",
      ],
    ],
    ["Release template", "article", ["Asks for CUSTOMER", "Tags test4", "Creates 11 sub-articles"]],
    [
      "SW Module Documentation",
      "article",
      ["Asks for MODULE_NAME", "Tags SW_Module", "Creates 2 sub-articles"],
    ],
    ["Bug template", "article", ["Adds content only", "Auto when Type → Bug"]],
    ["Created before fields existed", "ticket", ["Adds content only"]],
    ["Created before tags, relations and hierarchy", "ticket", ["Sets Priority", "Auto when Type → Bug"]],
  ] as const)("%s for a %s", (name, target, expected) => {
    expect(formatTemplateEffectTokens(byName(name), target)).toEqual(expected);
  });

  it("counts links for tickets only and skips children of non-hierarchical templates", () => {
    const template: Template = {
      ...clone(byName("Created before fields existed")),
      relations: [
        { linkName: "relates to", target: "fixed", issueId: "SAN-1" },
        { linkName: "relates to", target: "fixed", issueId: "SAN-2" },
      ],
      hierarchical: false,
      children: [clone(getChildTemplates(byName("Release template"))[0])],
    };
    expect(formatTemplateEffectTokens(template, "ticket")).toEqual(["Adds 2 links"]);
    expect(formatTemplateEffectTokens(template, "article")).toEqual(["Adds content only"]);
  });

  it("never throws for any fixture", () => {
    for (const template of all) {
      expect(formatTemplateEffectTokens(template, "ticket").length).toBeGreaterThan(0);
      expect(formatTemplateEffectTokens(template, "article").length).toBeGreaterThan(0);
    }
  });
});

describe("conditional child templates", () => {
  const release = current.find((t) => t.name === "Release template") as Template;
  const childByName = (name: string): ChildTemplate => {
    const found = flattenChildTemplates(getChildTemplates(release)).find(
      ({ child }) => child.name === name,
    );
    if (!found) {
      throw new Error(`No child ${name}`);
    }
    return found.child;
  };
  const high = childByName("CUSTOMER: Review test results - high prio");
  const low = childByName("CUSTOMER: Review test results - low prio");

  it("lists the fields deciding which children are created", () => {
    expect(getChildConditionFields(release)).toEqual([
      { fieldName: "Priority", childIds: [high.id, low.id], values: ["Normal", "Minor"] },
    ]);
    expect(getChildConditionFields(current.find((t) => t.name === "Bug template") as Template)).toEqual([]);
  });

  it("merges conditions on the same field and children in nested levels", () => {
    const nested = clone(release);
    const nestedHigh = flattenChildTemplates(getChildTemplates(nested)).find(
      ({ child }) => child.id === high.id,
    )?.child as ChildTemplate;
    nestedHigh.addConditions = [
      { when: "field_is", fieldName: "Priority", fieldValue: "Normal" },
      { when: "field_is", fieldName: "Priority", fieldValue: "Major" },
      { when: "field_is", fieldName: "State", fieldValue: "Open" },
    ];
    expect(getChildConditionFields(nested)).toEqual([
      { fieldName: "Priority", childIds: [high.id, low.id], values: ["Normal", "Major", "Minor"] },
      { fieldName: "State", childIds: [high.id], values: ["Open"] },
    ]);
    expect(formatChildConditionNote(nestedHigh)).toBe("when Priority is Normal or Major, or State is Open");
    expect(formatChildConditionNote(childByName("CUSTOMER: Release tests"))).toBeNull();
  });

  it("re-evaluates inclusion, with subtrees following their parent", () => {
    const highChild = getChildTemplates(high)[0];
    const lowChild = getChildTemplates(low)[0];
    const normal = evaluateChildInclusion(release, { Priority: ["Normal"] });
    expect([normal[high.id].created, normal[highChild.id].created]).toEqual([true, true]);
    expect([normal[low.id].created, normal[lowChild.id].created]).toEqual([false, false]);
    const minor = evaluateChildInclusion(release, { Priority: ["Minor"] });
    expect([minor[high.id].created, minor[highChild.id].created]).toEqual([false, false]);
    expect([minor[low.id].created, minor[lowChild.id].created]).toEqual([true, true]);
  });

  it("evaluates the same as before for single values from older backends", () => {
    const fromOld = evaluateChildInclusion(release, toConditionValues({ Priority: "Normal" }));
    expect(fromOld).toEqual(evaluateChildInclusion(release, { Priority: ["Normal"] }));
    expect(evaluateChildInclusion(release, toConditionValues({ Priority: null }))[high.id]).toEqual({
      created: false,
      reason: "root ticket field Priority is empty, requires Normal.",
    });
  });
});

describe("conditions on multi-value fields", () => {
  const fieldInfos = [
    { name: "Components", typeName: "enum[*]", values: [] },
    { name: "Team", typeName: "ownedField[1]", values: [] },
    { name: "Areas", typeName: "ownedField[*]", values: [] },
  ];
  const parent = clone(current.find((t) => t.name === "Release template") as Template);
  const [first, second] = getChildTemplates(parent);
  first.addConditions = [{ when: "field_is", fieldName: "Components", fieldValue: "UI" }];
  second.addConditions = [
    { when: "field_is", fieldName: "Team", fieldValue: "Core" },
    { when: "field_is", fieldName: "Areas", fieldValue: "Backend" },
  ];

  it("matches when the field includes the value", () => {
    const both = evaluateChildInclusion(parent, { Components: ["Backend", "UI"], Team: [], Areas: [] }, fieldInfos);
    expect(both[first.id].created).toBe(true);
    const other = evaluateChildInclusion(parent, { Components: ["Backend"], Team: ["Core"] }, fieldInfos);
    expect(other[first.id]).toEqual({
      created: false,
      reason: "root ticket field Components has Backend, requires UI.",
    });
    expect(other[second.id].created).toBe(true);
    expect(evaluateChildInclusion(parent, { Areas: ["Backend", "UI"] }, fieldInfos)[second.id].created).toBe(true);
  });

  it("words multi-value conditions with includes and gains", () => {
    expect(formatChildConditionNote(first, fieldInfos)).toBe("when Components includes UI");
    expect(formatChildConditionNote(second, fieldInfos)).toBe("when Team is Core, or Areas includes Backend");
    expect(formatChildAddConditions(first, fieldInfos)).toBe(
      "Added when root ticket field Components includes UI.",
    );
    expect(formatValidCondition({ when: "field_is", fieldName: "Components", fieldValue: "UI" }, true, fieldInfos)).toBe(
      "Ticket field Components includes UI",
    );
    expect(
      formatAddCondition({ when: "field_becomes", fieldName: "Components", fieldValue: "UI" }, false, fieldInfos),
    ).toBe("ticket field Components gains UI.");
    expect(getConditionVerb("becomes", fieldInfos, "Team")).toBe("becomes");
  });

  it("keeps the single-value wording without field infos", () => {
    expect(formatChildConditionNote(first)).toBe("when Components is UI");
    expect(formatAddCondition({ when: "field_becomes", fieldName: "Components", fieldValue: "UI" })).toBe(
      "ticket field Components becomes UI.",
    );
  });

  it("allows adding values to the trigger field of a multi-value add condition", () => {
    const auto = clone(current.find((t) => t.name === "Release template") as Template);
    auto.addCondition = { when: "field_becomes", fieldName: "Components", fieldValue: "UI" };
    auto.fields = [{ fieldName: "Components", mode: "fixed", fieldValue: "Backend", additive: true }];
    expect(validateTemplateFields(auto)).toBeNull();
    auto.fields = [{ fieldName: "Components", mode: "fixed", fieldValue: "Backend" }];
    expect(validateTemplateFields(auto)).toContain("automatic add condition");
  });
});

describe("ticket-only features", () => {
  const byName = (name: string): Template => clone(current.find((t) => t.name === name) as Template);
  const entity = (entityType: "issue" | "article") => ({ when: "entity_is" as const, entityType });
  const fieldIs = { when: "field_is" as const, fieldName: "Type", fieldValue: "Bug" };
  const tagIs = { when: "tag_is" as const, tagName: "x" };

  it.each([
    [[entity("issue")], true, false, "allowed"],
    [[entity("article")], false, true, "unavailable"],
    [[fieldIs], true, false, "allowed"],
    [[tagIs], true, true, "marked"],
    [[entity("article"), fieldIs], true, true, "marked"],
    [[entity("article"), entity("issue")], true, true, "marked"],
    [[], true, true, "marked"],
  ] as const)("%j", (conditions, tickets, articles, availability) => {
    const template = { ...byName("Meeting minutes template"), validCondition: [...conditions] };
    expect(getTemplateScope(template)).toEqual({ tickets, articles });
    expect(getTicketFeatureAvailability(template)).toBe(availability);
  });

  it("classifies the stored templates", () => {
    expect(current.map((t) => [t.name, getTicketFeatureAvailability(t)])).toEqual([
      ["Extra Software Review", "marked"],
      ["Task template", "allowed"],
      ["Meeting minutes template", "unavailable"],
      ["Won't fix template", "allowed"],
      ["Bug template", "allowed"],
      ["Release template", "marked"],
      ["SW Module Documentation", "unavailable"],
    ]);
  });

  // Bug template's fields and trigger, made available for articles only.
  const articleOnlyBug = (): Template => ({
    ...byName("Bug template"),
    validCondition: [entity("article")],
  });

  it("rejects ticket-only settings of article-only templates", () => {
    const template: Template = {
      ...articleOnlyBug(),
      relations: [{ linkName: "relates to", target: "fixed", issueId: "SAN-1" }],
      replacements: [{ search: "WHO", mode: "field", fieldName: "Assignee" }],
    };
    expect(validateTemplate(template).map(({ section, message }) => `${section}: ${message.split(",")[0]}`)).toEqual([
      "when: Applying automatically when a ticket field changes is not available",
      "effects: Ticket fields are not available",
      "effects: Relations are not available",
      "effects: Text replacements with a root ticket field are not available",
    ]);
  });

  it("accepts the same settings when the template is also available for tickets", () => {
    const template: Template = {
      ...articleOnlyBug(),
      validCondition: [entity("article"), entity("issue")],
      relations: [{ linkName: "relates to", target: "fixed", issueId: "SAN-1" }],
      replacements: [{ search: "WHO", mode: "field", fieldName: "Assignee" }],
    };
    expect(validateTemplate(template)).toEqual([]);
  });

  it("rejects subtask-only settings of child templates of article-only templates", () => {
    const template: Template = { ...byName("Release template"), validCondition: [entity("article")] };
    // Release template's own fields and field replacements are reported too; check the children.
    const conditional = flattenChildTemplates(getChildTemplates(template)).find(
      ({ child }) => getChildAddConditions(child).length > 0,
    )?.child as ChildTemplate;
    conditional.inheritRootFields = true;
    const childErrors = validateChildTemplate(template, conditional).map((error) => error.section);
    expect(childErrors).toEqual(["when", "effects"]);
    expect(validateTemplate(template).some((error) => error.section === "hierarchy")).toBe(true);
    // Available for tickets as well: the same child is fine.
    const both = { ...template, validCondition: [entity("article"), entity("issue")] };
    expect(validateChildTemplate(both, conditional)).toEqual([]);
  });

  it("adds no errors to stored templates", () => {
    for (const template of current) {
      expect(validateTemplate(template)).toEqual([]);
    }
  });
});

describe("formatTemplateTargetNoun", () => {
  it.each([
    ["Bug template", "ticket", "subtask"],
    ["SW Module Documentation", "article", "sub-article"],
    ["Release template", "ticket or article", "subtask or sub-article"],
  ])("%s", (name, noun, childNoun) => {
    const template = current.find((t) => t.name === name) as Template;
    expect(formatTemplateTargetNoun(template)).toBe(noun);
    expect(formatTemplateTargetNoun(template, true)).toBe(childNoun);
    expect(formatTemplateTag("x", formatTemplateTargetNoun(template))).toBe(`Adds tag x to ${noun}.`);
  });
});

describe("simple field values", () => {
  it("validates fixed values and values chosen by the user", () => {
    expect(isValidSimpleFieldValue("date", "+14d", true)).toBe(true);
    expect(isValidSimpleFieldValue("date", "+1w 2d", true)).toBe(true);
    expect(isValidSimpleFieldValue("date", "+2d 4h", true)).toBe(false);
    expect(isValidSimpleFieldValue("date", "14d", true)).toBe(false);
    expect(isValidSimpleFieldValue("date", "2026-12-01", true)).toBe(false);
    expect(isValidSimpleFieldValue("date", "2026-12-01", false)).toBe(true);
    expect(isValidSimpleFieldValue("datetime", "+2d 4h 30m", true)).toBe(true);
    expect(isValidSimpleFieldValue("datetime", "+", true)).toBe(false);
    expect(isValidSimpleFieldValue("period", "1w 4h", true)).toBe(true);
    expect(isValidSimpleFieldValue("period", "4h 1w", true)).toBe(false);
    expect(isValidSimpleFieldValue("integer", "-3", true)).toBe(true);
    expect(isValidSimpleFieldValue("integer", "3.5", true)).toBe(false);
    expect(isValidSimpleFieldValue("float", "3.5", true)).toBe(true);
    expect(isValidSimpleFieldValue("float", "x", true)).toBe(false);
    expect(isValidSimpleFieldValue("string", "ABC", true)).toBe(true);
    expect(isValidSimpleFieldValue("string", " ", true)).toBe(false);
  });

  it("describes relative dates", () => {
    expect(formatFieldValue("date", "+1w 1d", true)).toBe("1 week 1 day after applying");
    expect(formatFieldValue("datetime", "+2h 30m", true)).toBe("2 hours 30 minutes after applying");
    expect(formatFieldValue("integer", "5", true)).toBe("5");
    expect(formatTemplateField({ fieldName: "Due date", mode: "fixed", fieldValue: "+14d" })).toBe(
      "sets ticket field Due date to 14 days after applying.",
    );
  });
});

describe("options", () => {
  const base = clone(current.find((t) => t.name === "Release template") as Template);
  const security = { id: "opt-sec", label: "Security review", default: true };
  const signOff = { id: "opt-sign", label: "Customer sign-off", default: null };
  const unused = { id: "opt-unused", label: "Unused", default: false };
  const make = (): { template: Template; first: ChildTemplate; second: ChildTemplate } => {
    const template = clone(base);
    template.options = [security, signOff, unused];
    const [first, second] = getChildTemplates(template);
    first.addConditions = [{ when: "option_is", optionId: security.id, value: true }];
    second.addConditions = [
      { when: "option_is", optionId: signOff.id, value: true },
      { when: "field_is", fieldName: "Priority", fieldValue: "Minor" },
    ];
    return { template, first, second };
  };

  it("lists used options with their children and starts from the defaults", () => {
    const { template, first, second } = make();
    expect(getUsedOptions(template).map(({ option, childIds }) => [option.id, childIds])).toEqual([
      [security.id, [first.id]],
      [signOff.id, [second.id]],
    ]);
    expect(getInitialOptionValues(template)).toEqual({ [security.id]: true, [signOff.id]: null });
    expect(getUnansweredOptions(template, getInitialOptionValues(template))).toEqual(["Customer sign-off"]);
    expect(getUnansweredOptions(template, { [security.id]: false, [signOff.id]: false })).toEqual([]);
    expect(getUsedOptions({ ...template, hierarchical: false })).toEqual([]);
  });

  it("creates, skips or leaves children undecided by the answers", () => {
    const { template, first, second } = make();
    const grandChild = getChildTemplates(second)[0];
    const waiting = evaluateChildInclusion(template, { Priority: ["Normal"] }, [], getInitialOptionValues(template));
    expect(waiting[first.id].created).toBe(true);
    expect(waiting[second.id]).toEqual({
      created: false,
      undecided: true,
      reason: "Depends on your answer to Customer sign-off.",
    });
    if (grandChild !== undefined) {
      expect(waiting[grandChild.id].undecided).toBe(true);
    }
    const no = evaluateChildInclusion(template, { Priority: ["Normal"] }, [], {
      [security.id]: false,
      [signOff.id]: false,
    });
    expect(no[first.id]).toEqual({ created: false, reason: "option Security review is No." });
    expect(no[second.id]).toEqual({
      created: false,
      reason: "root ticket field Priority is Normal, requires Minor; option Customer sign-off is No.",
    });
    // A matching field condition creates the child whatever the option answer.
    expect(
      evaluateChildInclusion(template, { Priority: ["Minor"] }, [], { [signOff.id]: null })[second.id].created,
    ).toBe(true);
  });

  it("ignores field conditions for articles", () => {
    const { template, second } = make();
    const answered = { [security.id]: true, [signOff.id]: false };
    expect(evaluateChildInclusion(template, {}, [], answered, true)[second.id].created).toBe(false);
    second.addConditions = [{ when: "field_is", fieldName: "Priority", fieldValue: "Minor" }];
    expect(evaluateChildInclusion(template, {}, [], answered, true)[second.id].created).toBe(true);
  });

  it("words option conditions with the option's label", () => {
    const { template, first, second } = make();
    const options = getTemplateOptions(template);
    expect(formatChildConditionNote(first, [], options)).toBe("when Security review is Yes");
    expect(formatChildAddConditions(second, [], options)).toBe(
      "Added when option Customer sign-off is Yes, or root ticket field Priority is Minor.",
    );
    expect(formatChildConditionNote(first)).toBe("when a removed option is Yes");
    expect(formatOptionDefault(signOff)).toBe("user must choose");
    expect(formatOptionDefault(unused)).toBe("No by default");
    expect(formatTemplateHierarchy(template)).toMatch(/and 3 options\.$/);
  });

  it("validates options and conditions on them", () => {
    const { template, first } = make();
    expect(validateTemplate(template)).toEqual([]);
    expect(validateTemplateOptions({ ...template, options: [security, { ...unused, label: " " }] })).toBe(
      "Every option needs a name.",
    );
    expect(validateTemplateOptions({ ...template, options: [security, { ...unused, label: "security REVIEW" }] })).toBe(
      'Option "security REVIEW" is defined twice.',
    );
    expect(validateTemplateOptions({ ...template, options: [security, { ...unused, id: security.id }] })).toBe(
      'Option "Unused" has a missing or duplicate id.',
    );
    template.options = [signOff, unused];
    expect(validateChildTemplate(template, first).map((error) => error.message)).toEqual([
      `Child template "${first.name}" has a condition on a removed option.`,
    ]);
  });

  it("allows option conditions in article-only templates", () => {
    const { template, first, second } = make();
    template.validCondition = [{ when: "entity_is", entityType: "article" }];
    second.addConditions = [{ when: "option_is", optionId: signOff.id, value: false }];
    const conditionErrors = [first, second]
      .flatMap((child) => validateChildTemplate(template, child))
      .filter((error) => error.message.includes("condition"));
    expect(conditionErrors).toEqual([]);
    second.addConditions = [{ when: "field_is", fieldName: "Priority", fieldValue: "Minor" }];
    expect(validateChildTemplate(template, second).map((error) => error.message).join(" ")).toContain(
      "conditions on ticket fields",
    );
  });

  it("keeps templates without options unchanged", () => {
    expect(getTemplateOptions(legacy[0])).toEqual([]);
    expect(getUsedOptions(base)).toEqual([]);
    expect(getInitialOptionValues(base)).toEqual({});
  });
});
