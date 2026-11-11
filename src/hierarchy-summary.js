// Summary comment added to the root ticket or article when a hierarchical template creates its
// subtasks or sub-articles, if the template enables it (summaryComment). It records what was
// done for later reference: who triggered it, the answers to the options, the texts entered and
// which child templates were created or skipped, and why. It shows no ticket field values.
// The functions here only format collected data; backend.js collects it and adds the comment.
var utils = require("./template-utils");

// Backslash-escapes characters that would change the Markdown layout of user-provided text.
const escapeMarkdown = (text) => String(text).replace(/[\\`*_[\]<>|~]/g, "\\$&");

// The comment has default visibility: everyone who can read the ticket can read it, also users who
// may not read private fields, and the scripting API cannot tell which fields are private. So it
// never shows ticket field names or values: field conditions only count as "a field condition",
// and replacements from fields are listed without their field and value.
const FIELD_CONDITION = "a field condition";

const formatAnswer = (value) => (value ? "Yes" : "No");

const getOptionLabel = (options, optionId) => {
  const option = (Array.isArray(options) ? options : []).find((o) => o && o.id === optionId);
  return option && typeof option.label === "string" && option.label.trim() !== ""
    ? option.label.trim()
    : "a removed option";
};

// Text of one add condition of a child template. Options keep their answer, e.g. "Security review
// is Yes" or "Security review Yes (answered No)"; any field condition reads FIELD_CONDITION.
const formatCondition = (cond, met, options, optionValues) => {
  if (cond.when !== "option_is") {
    return FIELD_CONDITION;
  }
  const label = escapeMarkdown(getOptionLabel(options, cond.optionId));
  if (met) {
    return `${label} is ${formatAnswer(cond.value)}`;
  }
  const answer = optionValues ? optionValues[cond.optionId] : undefined;
  const actual = typeof answer === "boolean" ? `answered ${formatAnswer(answer)}` : "not answered";
  return `${label} ${formatAnswer(cond.value)} (${actual})`;
};

// Why a child template was created or skipped. rootIssue is null for articles.
// Returns { conditional, matched: [text], unmet: [text] }, option texts first and
// FIELD_CONDITION at most once, last.
const explainChildConditions = (rootIssue, child, valueOverrides, optionValues, options) => {
  const conditions = utils.getChildActiveConditions(rootIssue, child);
  const matched = [];
  const unmet = [];
  for (const cond of conditions) {
    if (!cond || (cond.when !== "option_is" && cond.when !== "field_is")) {
      continue;
    }
    const met = utils.isChildConditionMet(rootIssue, cond, valueOverrides, optionValues);
    const list = met ? matched : unmet;
    const text = formatCondition(cond, met, options, optionValues);
    if (!list.includes(text)) {
      list.push(text);
    }
  }
  const fieldLast = (list) =>
    list.filter((text) => text !== FIELD_CONDITION).concat(list.filter((text) => text === FIELD_CONDITION));
  return { conditional: conditions.length > 0, matched: fieldLast(matched), unmet: fieldLast(unmet) };
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

// The template's text replacements: [{ search, value: string | null, fromField }]. Only texts
// entered by the user carry their value; replacements from ticket fields are only flagged.
const describeReplacements = (template, values) =>
  (Array.isArray(template.replacements) ? template.replacements : []).map((replacement) => {
    const fromField = replacement.mode === "field";
    const found = fromField ? undefined : values.find((value) => value.search === replacement.search);
    return { search: replacement.search, value: found ? found.value : null, fromField: fromField };
  });

const plural = (count, singular, pluralText) => `${count} ${count === 1 ? singular : pluralText}`;

// Why a skipped child template was not created: the option conditions it needed, then a field
// condition, e.g. "needs Security review Yes (answered No) or a field condition".
const formatUnmet = (unmet) => {
  if (unmet.length === 0) {
    return "";
  }
  if (unmet.length === 1 && unmet[0] === FIELD_CONDITION) {
    return ": field condition not met";
  }
  return `: needs ${unmet.join(" or ")}`;
};

// Why a conditional child template was created: the matched options, else a field condition. Any
// matched condition creates it, so the options (which say more) are enough.
const formatMatched = (matched) => {
  const optionTexts = matched.filter((text) => text !== FIELD_CONDITION);
  if (optionTexts.length > 0) {
    return `, created because ${optionTexts.join(" and ")}`;
  }
  return matched.length > 0 ? ", created by a field condition" : "";
};

const formatNode = (node, nouns, depth) => {
  const indent = "  ".repeat(depth);
  if (node.created === null) {
    const subtree =
      node.skippedCount > 0 ? ` (with its ${plural(node.skippedCount, nouns.one, nouns.many)})` : "";
    // Identified by its template article, linked: there is no ticket or article to point to.
    const label = node.articleTitle
      ? `[~~${escapeMarkdown(node.articleTitle)}~~](${node.articleUrl})`
      : `~~${node.articleId}~~`;
    return [`${indent}- ${label} not created${subtree}${formatUnmet(node.unmet)}`];
  }
  const reason = node.conditional ? formatMatched(node.matched) : "";
  const line = `${indent}- ${node.created.id} "${escapeMarkdown(node.created.summary)}"${reason}`;
  return [line, ...node.children.flatMap((child) => formatNode(child, nouns, depth + 1))];
};

const countCreated = (nodes) =>
  nodes.reduce((sum, node) => sum + (node.created === null ? 0 : 1 + countCreated(node.children)), 0);

const section = (title, lines) => (lines.length > 0 ? [`**${title}**`, ...lines] : []);

// The Markdown text of the summary comment.
// summary: { target: "ticket" | "article", templateName, userName, total (number of child
// templates), options (describeOptions), replacements (describeReplacements), nodes: [{ name,
// articleId, articleTitle, articleUrl, created: { id, summary } | null, conditional, matched,
// unmet, skippedCount, children }] }.
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
  const entered = summary.replacements
    .filter((replacement) => !replacement.fromField)
    .map((replacement) =>
      replacement.value === null
        ? `- \`${replacement.search}\`: not replaced`
        : `- \`${replacement.search}\`: ${escapeMarkdown(replacement.value)} (entered)`,
    );
  const fromFields = summary.replacements
    .filter((replacement) => replacement.fromField)
    .map((replacement) => `\`${replacement.search}\``);
  const replacements =
    fromFields.length > 0 ? [...entered, `- ${fromFields.join(", ")}: from ticket fields`] : entered;
  const blocks = [
    header,
    section("Options", options),
    section("Text replacements", replacements),
    section(nouns.title, summary.nodes.flatMap((node) => formatNode(node, nouns, 0))),
  ].filter((block) => block.length > 0);
  return blocks.map((block) => block.join("\n")).join("\n\n");
};

module.exports = {
  escapeMarkdown,
  explainChildConditions,
  describeOptions,
  describeReplacements,
  buildHierarchySummary,
};
