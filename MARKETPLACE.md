# Ticket Templates for YouTrack

Write tickets and articles that look the same every time. Ticket Templates turns ordinary
knowledge base articles into reusable templates. They can fill in the description, set fields,
add tags, link tickets and even create a whole tree of subtasks, either automatically or with a
couple of clicks.

## Why use it

- **Consistent tickets.** Every bug report, release checklist or meeting note starts from the
  same structure, so nothing important is forgotten.
- **Less typing.** Field values, tags, links and recurring text are filled in for you.
- **Repeatable processes.** A single click turns a release or onboarding ticket into the full set
  of subtasks your team always needs.
- **Templates anyone can edit.** Template content lives in normal knowledge base articles, written
  with the YouTrack editor your team already knows.

## What you can do

### Add templates automatically
- Add a template when a ticket field changes to a value. For example, add the bug report
  template when *Type* becomes *Bug*, or the task template when it becomes *Task*.
- Add a template when a ticket or article gets a tag.
- When the trigger changes, for example a ticket changing from *Task* to *Bug*, the previous
  template text is replaced, as long as nobody has edited it.

### Apply templates on demand
Open **Apply template** from the "…" menu of a ticket or article. The dialog shows:
- the templates already applied;
- those still waiting for input;
- the templates you can add, each with a short summary of what it will do, e.g.
  *"Sets Priority · Asks for Assignee · Creates 11 subtasks"*.

Only the actions that make sense for the selected template are offered, and you get a
confirmation when it's done.

### Set fields and tags
- Set ticket fields to a fixed value, or ask the user to choose a value when the template is
  applied.
- Replace or add to the values of multi-value fields, such as *Fix versions*.
- Add tags to tickets and articles.
- If a template was added automatically and still needs values from the user, it is listed as
  *Needs input*. **Set fields** fills them in.

### Fill in placeholders
Use placeholder words in the template, such as `CUSTOMER` or `VERSION`. They are replaced in the
summary and the content with:
- text the user types when applying the template, or
- the value of a ticket field, such as the *Fix versions* of the ticket.

Typed texts are remembered on the ticket or article, so they are offered again when you
continue later, for example when you create the subtasks.

### Create subtask hierarchies
Arrange template articles in a tree, and one template can create a complete hierarchy of
subtasks below a ticket, or sub-articles below an article.
- **Conditional subtasks:** only create a subtask when a field of the ticket has a given value,
  for example an extra review only for *Critical* priority. Before creating, you see which
  subtasks will be made, and you can change the deciding field right in the dialog.
- **Inherited fields:** subtasks can copy field values from their parent or from the root ticket.
- **Links:** link the root ticket, the subtasks and other existing tickets to each other
  automatically.

### Link tickets
Add links, such as *relates to* or *depends on*, from the ticket to fixed tickets, to the root
ticket or to the created subtasks.

## Getting started
1. **Write the template.** Create a knowledge base article with the template content, publish
   it, then choose **Configure as template** in the article's "…" menu.
2. **Configure it for a project.** Open *Project settings → Ticket Templates Config*, add a
   template, pick the article and decide:
   - where it is available (tickets, articles, or tickets with a certain field value or tag);
   - whether it is added automatically;
   - what it sets: fields, tags, links, placeholders and subtasks.
3. **Use it.** Change the ticket field or tag that triggers the template, or apply it from the
   **Apply template** menu.

The configuration page shows a summary of every template and flags incomplete ones. Features
that only work on tickets, such as fields and links, are clearly marked.

## Good to know
- **Permissions:** configuring templates requires permission to update the project. Applying
  them requires permission to update the ticket or article.
- **Articles:** articles have no fields or links. For articles, templates add content, tags,
  placeholders and sub-articles.
- **Article content refresh:** after a template is added to an article, reload the article page
  to see the new content.
- **Removing templates:** removing a template takes its text out of the ticket again, as long as
  that text hasn't been edited. Fields, tags and subtasks are kept.

## Requirements
YouTrack 2024.4 or later, Cloud or Server.
