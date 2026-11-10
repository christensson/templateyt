// Summary comment added to the root ticket or article when a hierarchical template creates its
// subtasks or sub-articles, if the template enables it (summaryComment). It records what was
// done for later reference: who triggered it, the answers to the options, the text replacements,
// the values entered and which child templates were created or skipped, and why.
// The functions here only format collected data; backend.js collects it and adds the comment.
var utils = require("./template-utils");

// Backslash-escapes characters that would change the Markdown layout of user-provided text.
const escapeMarkdown = (text) => String(text).replace(/[\\`*_[\]<>|~]/g, "\\$&");

// The display text of a root ticket field for a condition: the value being set in the same
// request (valueOverrides, see utils.isChildTemplateAdded), else the current value; null if empty.
const getConditionFieldText = (rootIssue, fieldName, valueOverrides) => {
  const override = valueOverrides ? valueOverrides[fieldName] : undefined;
  if (Array.isArray(override)) {
    return override.length > 0 ? override.join(", ") : null;
  }
  if (typeof override === "string") {
    return override === "" ? null : override;
  }
  if (override === null) {
    return null;
  }
  const typeName = utils.getIssueFieldTypeName(rootIssue, fieldName);
  return typeName === null ? null : utils.getFieldPresentationText(rootIssue, typeName, fieldName);
};

const formatAnswer = (value) => (value ? "Yes" : "No");

const getOptionLabel = (options, optionId) => {
  const option = (Array.isArray(options) ? options : []).find((o) => o && o.id === optionId);
  return option && typeof option.label === "string" && option.label.trim() !== ""
    ? option.label.trim()
    : "a removed option";
};

// Text of one add condition of a child template: what it requires, and when not met, the actual
// value in parentheses, e.g. "Priority Critical (is Normal)" or "Security review Yes (answered No)".
const formatCondition = (cond, met, context) => {
  const { rootIssue, valueOverrides, optionValues, options } = context;
  if (cond.when === "option_is") {
    const label = escapeMarkdown(getOptionLabel(options, cond.optionId));
    if (met) {
      return `${label} is ${formatAnswer(cond.value)}`;
    }
    const answer = optionValues ? optionValues[cond.optionId] : undefined;
    const actual = typeof answer === "boolean" ? `answered ${formatAnswer(answer)}` : "not answered";
    return `${label} ${formatAnswer(cond.value)} (${actual})`;
  }
  const field = escapeMarkdown(cond.fieldName);
  const value = escapeMarkdown(cond.fieldValue);
  const multi = utils.isMultiValueType(utils.getIssueFieldTypeName(rootIssue, cond.fieldName));
  if (met) {
    return multi ? `${field} includes ${value}` : `${field} is ${value}`;
  }
  const text = getConditionFieldText(rootIssue, cond.fieldName, valueOverrides);
  const actual = text === null ? "is empty" : `${multi ? "has" : "is"} ${escapeMarkdown(text)}`;
  return multi ? `${field} includes ${value} (${actual})` : `${field} ${value} (${actual})`;
};

// Why a child template was created or skipped. rootIssue is null for articles.
// Returns { conditional, matched: [text], unmet: [text] }.
const explainChildConditions = (rootIssue, child, valueOverrides, optionValues, options) => {
  const conditions = utils.getChildActiveConditions(rootIssue, child);
  const context = { rootIssue, valueOverrides, optionValues, options };
  const matched = [];
  const unmet = [];
  for (const cond of conditions) {
    if (!cond || (cond.when !== "option_is" && cond.when !== "field_is")) {
      continue;
    }
    const met = utils.isChildConditionMet(rootIssue, cond, valueOverrides, optionValues);
    (met ? matched : unmet).push(formatCondition(cond, met, context));
  }
  return { conditional: conditions.length > 0, matched: matched, unmet: unmet };
};

// Answers to all options of the template, for the summary: the answer used (given or default),
// whether it is the default, or not asked for options no child template depends on and that
// have no default. Returns [{ label, answer: boolean | null, isDefault }].
const describeOptions = (template, resolvedValues, chosen) =>
  (Array.isArray(template.options) ? template.options : []).filter(Boolean).map((option) => {
    const given = chosen ? chosen[option.id] : undefined;
    const resolved = resolvedValues ? resolvedValues[option.id] : undefined;
    let answer = null;
    if (typeof resolved === "boolean") {
      answer = resolved;
    } else if (typeof option.default === "boolean") {
      answer = option.default;
    }
    return {
      label: typeof option.label === "string" ? option.label.trim() : "",
      answer: answer,
      isDefault: answer !== null && typeof given !== "boolean",
    };
  });

// The template's text replacements with the values used: [{ search, value: string | null,
// fieldName: string | null }]; fieldName is set for field replacements.
const describeReplacements = (template, values) =>
  (Array.isArray(template.replacements) ? template.replacements : []).map((replacement) => {
    const found = values.find((value) => value.search === replacement.search);
    return {
      search: replacement.search,
      value: found ? found.value : null,
      fieldName: replacement.mode === "field" ? replacement.fieldName : null,
    };
  });

// Root ticket fields the template sets or uses in child conditions, with their display text after
// the hierarchy was created; changedNames are fields set in the same request.
// Returns [{ name, value: string | null, changed }].
const describeRootFields = (rootIssue, template, changedNames) => {
  const names = [];
  const add = (name) => {
    if (typeof name === "string" && name !== "" && !names.includes(name)) {
      names.push(name);
    }
  };
  (Array.isArray(template.fields) ? template.fields : []).forEach((field) => add(field && field.fieldName));
  utils.getChildConditionFieldNames(template).forEach(add);
  return names
    .filter((name) => utils.getIssueFieldTypeName(rootIssue, name) !== null)
    .map((name) => ({
      name: name,
      value: utils.getFieldPresentationText(rootIssue, utils.getIssueFieldTypeName(rootIssue, name), name),
      changed: changedNames.includes(name),
    }));
};

// Values the user entered for a child template's user-input fields: [{ name, value }], several
// values of one field joined. assignments are the child's resolved field assignments.
const describeEnteredValues = (child, assignments) => {
  const userFields = (Array.isArray(child.fields) ? child.fields : [])
    .filter((field) => field && field.mode === "user_input")
    .map((field) => field.fieldName);
  const result = [];
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    if (!userFields.includes(assignment.fieldName) || assignment.value == null) {
      continue;
    }
    const text = utils.getFieldValuePresentation(assignment.typeName, assignment.value);
    const existing = result.find((entry) => entry.name === assignment.fieldName);
    if (existing) {
      existing.value += `, ${text}`;
    } else {
      result.push({ name: assignment.fieldName, value: String(text) });
    }
  }
  return result;
};

const plural = (count, singular, pluralText) => `${count} ${count === 1 ? singular : pluralText}`;

const formatNode = (node, nouns, depth) => {
  const indent = "  ".repeat(depth);
  if (node.created === null) {
    const subtree =
      node.skippedCount > 0 ? ` (with its ${plural(node.skippedCount, nouns.one, nouns.many)})` : "";
    const needs = node.unmet.length > 0 ? `: needs ${node.unmet.join(" or ")}` : "";
    // Identified by its template article, linked: there is no ticket or article to point to.
    const label = node.articleTitle
      ? `[~~${escapeMarkdown(node.articleTitle)}~~](${node.articleUrl})`
      : `~~${node.articleId}~~`;
    return [`${indent}- ${label} not created${subtree}${needs}`];
  }
  let line = `${indent}- ${node.created.id} "${escapeMarkdown(node.created.summary)}"`;
  if (node.conditional && node.matched.length > 0) {
    line += `, created because ${node.matched.join(" and ")}`;
  }
  if (node.created.entered.length > 0) {
    line += `. Entered: ${node.created.entered
      .map((entry) => `${escapeMarkdown(entry.name)}: ${escapeMarkdown(entry.value)}`)
      .join(", ")}`;
  }
  return [line, ...node.children.flatMap((child) => formatNode(child, nouns, depth + 1))];
};

const countCreated = (nodes) =>
  nodes.reduce((sum, node) => sum + (node.created === null ? 0 : 1 + countCreated(node.children)), 0);

const section = (title, lines) => (lines.length > 0 ? [`**${title}**`, ...lines] : []);

// The Markdown text of the summary comment.
// summary: { target: "ticket" | "article", templateName, userName, total (number of child
// templates), options (describeOptions), replacements (describeReplacements), rootFields
// (describeRootFields; tickets only), nodes: [{ name, articleId, articleTitle, articleUrl,
// created: { id, summary, entered }
// | null, conditional, matched, unmet, skippedCount, children }] }.
const buildHierarchySummary = (summary) => {
  const forTicket = summary.target === "ticket";
  const nouns = forTicket
    ? { one: "subtask", many: "subtasks", title: "Subtasks" }
    : { one: "sub-article", many: "sub-articles", title: "Sub-articles" };
  const created = countCreated(summary.nodes);
  const header = [
    `**${nouns.title} created by Ticket Templates** from template *${escapeMarkdown(
      summary.templateName,
    )}*, triggered by ${escapeMarkdown(summary.userName)}.`,
    `${created} of ${plural(summary.total, nouns.one, nouns.many)} created.`,
  ];
  const options = summary.options.map((option) => {
    if (option.answer === null) {
      return `- ${escapeMarkdown(option.label)}: not asked`;
    }
    return `- ${escapeMarkdown(option.label)}: ${formatAnswer(option.answer)}${option.isDefault ? " (default)" : ""}`;
  });
  const replacements = summary.replacements.map((replacement) => {
    const word = `\`${replacement.search}\``;
    if (replacement.value === null) {
      return `- ${word}: not replaced`;
    }
    const source =
      replacement.fieldName === null ? "entered" : `from field ${escapeMarkdown(replacement.fieldName)}`;
    return `- ${word}: ${escapeMarkdown(replacement.value)} (${source})`;
  });
  const rootFields = forTicket
    ? (summary.rootFields || []).map(
      (field) =>
        `- ${escapeMarkdown(field.name)}: ${field.value === null ? "empty" : escapeMarkdown(field.value)}${
          field.changed ? " (changed when creating subtasks)" : ""
        }`,
    )
    : [];
  const blocks = [
    header,
    section("Options", options),
    section("Text replacements", replacements),
    section("Ticket fields", rootFields),
    section(nouns.title, summary.nodes.flatMap((node) => formatNode(node, nouns, 0))),
  ].filter((block) => block.length > 0);
  return blocks.map((block) => block.join("\n")).join("\n\n");
};

module.exports = {
  escapeMarkdown,
  explainChildConditions,
  describeOptions,
  describeReplacements,
  describeRootFields,
  describeEnteredValues,
  buildHierarchySummary,
};
