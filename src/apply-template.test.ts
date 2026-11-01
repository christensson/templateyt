import { describe, expect, it } from "vitest";
import currentFixture from "../test/fixtures/templates-current.json";
import type { Template, TemplateTarget } from "../@types/template";
import {
  formatCreatedMessage,
  formatRowStatus,
  getApplyActions,
  getApplyGroupMap,
  getApplyStatus,
  type ApplyInfo,
  type ApplyStatus,
} from "./apply-template";

const templates = currentFixture as unknown as Array<Template>;
const byName = (name: string): Template => {
  const template = templates.find((t) => t.name === name);
  if (!template) {
    throw new Error(`No fixture ${name}`);
  }
  return template;
};
const bug = byName("Bug template");
const release = byName("Release template");
const meeting = byName("Meeting minutes template");
const task = byName("Task template");
const wontFix = byName("Won't fix template");

// Bug: applied, waiting for input. Release: applied, subtasks created. Meeting: applied.
// Task: available. Won't fix: neither applied nor available.
const info: ApplyInfo = {
  templates,
  usedTemplateIds: [bug.id, release.id, meeting.id],
  validTemplateIds: [task.id, bug.id, release.id, meeting.id],
  pendingTemplateIds: [bug.id],
  createdHierarchyTemplateIds: [release.id],
};

describe("getApplyStatus", () => {
  it.each([
    [bug, "needs_input"],
    [release, "children_created"],
    [meeting, "applied"],
    [task, "available"],
    [wontFix, null],
  ] as const)("%#", (template, expected) => {
    expect(getApplyStatus(info, template)).toBe(expected);
  });

  it("treats missing pending ids (articles) as nothing pending", () => {
    const { pendingTemplateIds: _ignored, ...articleInfo } = info;
    expect(getApplyStatus(articleInfo, bug)).toBe("applied");
  });
});

describe("getApplyGroupMap", () => {
  it("groups by status and leaves out templates that do not apply", () => {
    expect(getApplyGroupMap(info, "ticket")).toEqual({
      [bug.id]: "Needs input",
      [release.id]: "Applied to this ticket",
      [meeting.id]: "Applied to this ticket",
      [task.id]: "Available",
    });
    expect(getApplyGroupMap(info, "article")[meeting.id]).toBe("Applied to this article");
    expect(getApplyGroupMap(null, "ticket")).toEqual({});
  });
});

describe("formatRowStatus", () => {
  it("flags only templates that need input", () => {
    expect(formatRowStatus("needs_input", "ticket")).toEqual({ text: "Needs input", warning: true });
    expect(formatRowStatus("children_created", "article")).toEqual({
      text: "Sub-articles created",
      warning: false,
    });
    expect(formatRowStatus("applied", "ticket")).toBeNull();
    expect(formatRowStatus(null, "ticket")).toBeNull();
  });
});

describe("getApplyActions", () => {
  const actions = (template: Template, status: ApplyStatus, target: TemplateTarget) =>
    getApplyActions(template, status, target).map(
      (action) => `${action.primary ? "*" : ""}${action.label}`,
    );

  it.each([
    [task, "available", "ticket", ["*Apply"]],
    [bug, "needs_input", "ticket", ["*Set fields", "Remove"]],
    [release, "needs_input", "ticket", ["*Set fields", "Create subtasks", "Remove"]],
    [release, "applied", "ticket", ["*Create subtasks", "Set fields again", "Remove"]],
    [release, "children_created", "ticket", ["Set fields again", "Create subtasks again", "Remove"]],
    [bug, "applied", "ticket", ["Set fields again", "Remove"]],
    [meeting, "applied", "ticket", ["Remove"]],
    [release, "applied", "article", ["*Create sub-articles", "Remove"]],
    [release, "children_created", "article", ["Create sub-articles again", "Remove"]],
    [meeting, "applied", "article", ["Remove"]],
  ] as const)("%#: %s", (template, status, target, expected) => {
    expect(actions(template, status, target)).toEqual(expected);
  });

  it("has at most one primary action and never offers Set fields for articles", () => {
    const statuses: Array<ApplyStatus> = ["available", "needs_input", "applied", "children_created"];
    for (const template of templates) {
      for (const status of statuses) {
        for (const target of ["ticket", "article"] as const) {
          const list = getApplyActions(template, status, target);
          expect(list.filter((action) => action.primary).length).toBeLessThanOrEqual(1);
          if (target === "article" && status !== "needs_input") {
            expect(list.some((action) => action.key === "fields")).toBe(false);
          }
        }
      }
    }
  });
});

describe("formatCreatedMessage", () => {
  it.each([
    [undefined, "ticket", "Created subtasks."],
    [[], "article", "Created sub-articles."],
    [["SAN-1"], "ticket", "Created 1 subtask: SAN-1."],
    [["A-1", "A-2"], "article", "Created 2 sub-articles: A-1, A-2."],
    [["SAN-1", "SAN-2", "SAN-3", "SAN-4", "SAN-5"], "ticket", "Created 5 subtasks: SAN-1 … SAN-5."],
  ] as const)("%j", (ids, target, expected) => {
    expect(formatCreatedMessage(ids as Array<string> | undefined, target)).toBe(expected);
  });
});
