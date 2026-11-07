# YouTrack Ticket and Article Template App

![templateyt icon](./public/icon.svg)

YouTrack app to add templates to tickets or articles, both manually and automatically when for
example a ticket has a specific type or is assigned a tag. This helps teams with writing consistent
tickets.

![Honored YouTrack App Creator Badge](https://api.accredible.com/v1/frontend/credential_website_embed_image/badge/168044274)

## Features

- Automatic addition of template if ticket field has a specific value.
  - Example use-case: Define specific templates for Task or Bug tickets.
- Automatic addition of template if ticket or article is assigned a specific tag.
- Manually add templates on demand.
- Templates can set ticket fields, either to a fixed value or to a value chosen by the user when
  the template is applied manually.
- Configuration of templates per project.

## How to configure and use templates

### Overview

Each template consists of:

- An *article* defining the template content, refered to as *template article*.
- A per-project *template configuration*.

The *template configuration* defines when the template is valid, if the template shall be added
automatically to tickets or articles, and which ticket fields the template sets.

### Configure a template

#### Define article content

- Create a knowledge base article defining the template content.
- Publish article (Important! Article must be published before next step).
- Select *"Configure as template"* available under the "..."-menu for the article.
- Check *"Use article as ticket template."* checkbox, select the projects that can use the
  template (by default only the article's own project) and press *"Save info"*.

#### Configure template

> [!IMPORTANT]
> Requires project admin role (*Update project*), see [Permission model](#permission-model).

- Navigate to project.
- Open *"Ticket Templates Config"*.
- Click *"Add new template"*. The editor groups the settings into *General*, *When to use*,
  *What it does* and *Hierarchy*.
- Set template properties:
  - *Name*: Give the template a name for easy identication.
  - *Template article*: Select template article, note that only template articles configured to be
    used as ticket templates are available in drop-down.
  - *Available in the Apply template menu when any of these match* (under *When to use*): Add
    conditions when the template is valid. New templates start as available for tickets. Multiple
    conditions can be selected and template is valid when any of the condition matches. Possible
    conditions are:
    - When entity is *ticket* or *article*.
    - When ticket *field*[^1] is assigned a specific value.
    - When ticket or article is assigned a specific *tag*.

    Articles have no fields or links, so ticket fields, relations, applying automatically when a
    ticket field changes, root ticket field replacements and the child template settings for
    subtasks (conditions, inherited fields, fields, relations) only work on tickets. They cannot
    be configured for templates only available for articles, and are marked *tickets only* (or
    *subtasks only*) for templates available for both.
  - *Ticket fields* (under *What it does*): Optionally add ticket *fields*[^2] that the template sets when
    it is applied. Each field is set either:
    - To a *fixed value* configured in the template. Fixed values are set both when the template
      is added automatically and when it is applied manually, and always overwrite the current
      value.
    - To a *value chosen by the user*. The user is asked for the value when the template is
      applied manually using *"Apply template"*. Leaving a value empty leaves the ticket field
      untouched. These fields are skipped when the template is added automatically; use
      *"Set fields"* in the *"Apply template"* menu to fill them in afterwards.
    For multi-value fields such as *Fix versions*, each entry can either replace the field's
    values or add an *additional value*, both for fixed values and values chosen by the user.
  - *Apply automatically* (under *When to use*): *Never*, or:
    - Added when ticket *field*[^1] is assigned a specific value.
    - Added when ticket or article is tagged with a specific *tag*.

    If the template is added automatically when a field becomes a specific value, the template
    may not set that field to any other value.

[^1]: *Note! Currently only state and enum fields are supported in conditions.*
[^2]: *State, enum, user, version, build and owned fields are supported, single-value and
multi-value. Users are picked from the users configured for the field. Date, date and time,
period, integer, float and string fields are supported too. Fixed values of date and date and
time fields are relative to when the template is applied: `+14d` or `+1w 2d` for dates, and
`+2d 4h 30m` for date and time (calendar time). Users choosing the value pick an actual date.
Periods are entered as `1w 2d 4h 30m` and follow the project's working time settings.*

### Text replacements

A template can replace placeholder words when it is applied, both in the ticket summary and in
the template content, and for hierarchical templates in every subtask summary and description.
Configure them in the template's *"Text replacements"* panel. Each replacement names the word to
replace and what to insert:

- *Text entered by user*: asked for when the template is applied manually, and required.
- *Root ticket field*: the display text of a field of the ticket the template is applied to (for a
  hierarchy, the ticket it is created from); a multi-value field inserts all its values separated
  by commas. If the template itself sets the field, the new value is inserted. If the field is
  empty, the *"Apply template"* dialog asks for a value, which is also set on the ticket.

Only whole words are replaced, on every occurrence. Words are delimited by whitespace, line breaks
and punctuation such as commas, colons or brackets; hyphens and underscores do not delimit, so
`VERSION` matches in `Release VERSION.` but not in `VERSION-1` or `MY_VERSION`.

When a template is added automatically, field replacements are applied and user-entered
placeholders stay in place; *"Set fields"* in the *"Apply template"* menu then asks for the texts
and replaces the words in the ticket. An empty field is skipped and logged, and the template is
listed under *Needs input*, so that *"Set fields"* asks for the field value. Texts entered by the user are remembered on the ticket or article for each applied template, so
that *"Set fields"* and *"Create subtasks"* / *"Create sub-articles"* offer them again later;
removing the template forgets them. Article templates
support user-entered replacements on manual application only; templates with root ticket field
replacements cannot be applied to articles, and the dialog says why.

### Hierarchical templates

A template whose template article has child articles can create a ticket hierarchy: one subtask
per child article, nested like the articles, with the article title as summary and the article
content as description.

- In the template configuration, under *Hierarchy*, check *"Create a subtask for each child
  article"* and click
  *"Import child articles"*. The child templates appear indented below the template in the list.
  Re-importing refreshes the tree from the knowledge base while keeping the configuration of
  articles already imported.
- Select a child template in the list to configure it: its name (the subtask summary), whether it
  *inherits fields from parent* (the fields configured by the parent template are copied from the
  parent ticket when the hierarchy is created) and/or *inherits fields from root ticket* (the
  fields configured by the root template are copied from the root ticket), and its own ticket
  fields, which work like the fields of a template. Precedence is own fields first, then the
  closest parent, then the root ticket.
- Any knowledge base article can be *inserted* as a child template by its article id, below the
  template or below any child template, without being part of the article tree. Inserted child
  templates keep their place when child articles are re-imported, an inserted article is never
  imported a second time, and they can be moved (up, down or under another node), removed, and
  can import their own child articles. Imported child templates always follow the article tree.
- A child template can have *conditions when it is added*: one or more "ticket field is value"
  checks against the ticket the hierarchy is created from. It is created when any condition
  matches, or always when it has none. A skipped child template takes its own children with it.
  The *"Create subtasks"* form lists the fields that decide which subtasks are created, and marks
  conditional subtasks with their condition. Changing a field there updates the preview; the new
  value is set on the ticket when the subtasks are created (which may trigger other workflows,
  such as templates added automatically).
- The hierarchy is created manually from *"Create subtasks"* (*"Create sub-articles"* for
  articles) in the *"Apply template"* menu. It is offered right after the template is applied,
  with the texts just entered for text replacements filled in, and later for the applied
  template. The form shows the subtasks that will be created, marks the ones that will not be
  created and why, and asks for the values of user-chosen fields. Creating the hierarchy again is
  possible after a warning and adds another set of subtasks.
- Subtasks created this way do not get templates added automatically on creation, even if their
  fields match an automatic add condition.

### Use templates

Imagine that two templates has been configured:

- One automatically added when ticket type becomes *Task*.
- One automatically added when ticket type becomes *Bug*.

In order to use these templates, simply create or edit a ticket using normal YouTrack procedures.
When type is changed to *Task* or *Bug* the respective template is appended to the ticket
description. Note that the app attempts to remove previous templates, but can only do that if the
template hasn't been modified after it has been added. If it has, the previous template will not be
removed.

Templates can also be applied manually using *"Apply template"* in the ticket or article
"..."-menu. The dialog lists the templates in three groups: *Needs input* (added automatically,
user-chosen fields not set yet), *Applied to this ticket* and *Available*. Each row says what the
template does, e.g. "Sets Priority · Asks for Assignee · Creates 11 subtasks". Selecting a
template shows only the actions that apply to it:

- *"Apply"* for an available template.
- *"Set fields"* (for tickets) sets or re-sets only the fields, tags and text replacements of the
  template, without touching the description. This is how values chosen by the user are filled in
  for templates that were added automatically.
- *"Create subtasks"* / *"Create sub-articles"* for an applied hierarchical template.
- *"Remove"*, after a confirmation, removes the template text from the description if it has not
  been edited. Fields, tags and subtasks are kept.

The dialog closes after a template is applied, unless it continues with the subtasks of a
hierarchical template.

> [!IMPORTANT]
> The usability of templates applied to articles can be improved. When a template is added to
> an article (either manually or automatically), the article content will not automatically updated
> in the browser. Unfortunately, currently, a manual reload of the article is required in the browser.

## Permission model

YouTrack only checks that the caller can *read* the ticket, article or project of a scoped app
endpoint. The app therefore declares the permissions needed for every endpoint that changes
something, and checks article access itself. Requires YouTrack 2026.1 or later, for
`User.hasPermission` (2025.3) and the article visibility restrictions `Article.permittedUsers` /
`permittedGroups` (2026.1).

### Endpoint permissions

Each endpoint declares one permission in `permissions`. Project permissions are checked in the
project of the endpoint's ticket, article or project. Where a second permission is needed
(*checked in code* below), the handler checks it with `User.hasPermission` and responds 403:
a `permissions` list means *any* of the listed permissions, and the `{ allOf: [...] }` form that
requires all of them is not accepted by YouTrack 2026.2.

| Scope | Endpoint | Used by | Permissions |
| --- | --- | --- | --- |
| project | `templates` (GET), `getProjectInfo`, `getTemplateArticles`, `getChildArticles`, `addTemplate`, `removeTemplate` | Ticket Templates Config | `UPDATE_PROJECT` |
| article | `getArticleInfo` (GET) | Configure as template | read access only |
| article | `setArticleInfo` | Configure as template | `UPDATE_ARTICLE`, `UPDATE_PROJECT` checked in code |
| issue | `templates` (GET) | Apply template (ticket) | read access only |
| issue | `addTemplate`, `applyTemplateFields`, `removeTemplate` | Apply template (ticket) | `UPDATE_ISSUE` |
| issue | `createHierarchy` | Apply template (ticket) | `UPDATE_ISSUE`, `CREATE_ISSUE` checked in code |
| article | `templates` (GET) | Apply template (article) | read access only |
| article | `addTemplate`, `removeTemplate` | Apply template (article) | `UPDATE_ARTICLE` |
| article | `createHierarchy` | Apply template (article) | `UPDATE_ARTICLE`, `CREATE_ARTICLE` checked in code |

### Article access

Article ids from requests and from the stored configuration are never trusted. An article is used
only if the current user has `READ_ARTICLE` in the article's project and, when the article's
visibility is restricted, is its author, one of its permitted users or a member of one of its
permitted groups (`isArticleReadableBy` in `src/template-utils.js`). A missing article and an
article the user can't read give the same error, so the existence of articles is not revealed.

- **Configuration** (project `addTemplate`): the template article and every child article must be
  readable by the project admin. A child article must also either be a template article
  (*inserted*; marking an article as template requires `UPDATE_PROJECT` in its own project) or be
  below the article of its parent in the article tree (*imported*).
- **Article lists** (`getTemplateArticles`, `getChildArticles`): only articles the user can read
  are returned; child articles the user can't read are left out with their subtrees.
- **Manual use** (issue and article `addTemplate`, `removeTemplate`, `createHierarchy`): the user
  applying the template must be able to read the template article and the child articles.
- **Automatic use** (the *Add template to ticket* and *Add template to article* workflows): the
  user who edits the ticket or article is *not* checked. Templates are added automatically for
  everyone, and the content is copied into the ticket or article. The project admin is
  responsible for the configuration, which is why the configuration only accepts articles the
  admin can read and flags articles from other projects: the editor shows a warning banner, and
  the template list and child templates show a warning icon. Articles whose settings explicitly
  share them with this project (see below) get an informational note instead, since the other
  project's admin chose to share them. Imported child articles follow the template article they
  are imported from.

### Sharing template articles

*Configure as template* stores the projects that can use a template article in the article
extension property `templateProjectKeys` (JSON list of project IDs, `Project.key`). The selection
lists the projects the admin can see; by default only the article's own project is selected.

- The *Template article* and *Insert article as child template* lists of *Ticket Templates
  Config* only offer template articles shared with the project (`getTemplateArticles`).
- Saving a template (project `addTemplate`) is refused when its template article, or an inserted
  child template article, is not shared with the project. Imported child articles are covered by
  the article they are imported from.
- Templates already configured in a project that is no longer shared keep working, both
  automatically and from the menu. The configuration flags them, and they can't be saved until
  the article is shared again or replaced.
- Articles marked as template before this setting existed have no `templateProjectKeys` and stay
  usable in all projects, until the setting is saved for them.
- Projects are stored by ID. If a project's ID is changed, it loses access to the article until
  the setting is saved again with the new ID.

## Installation and Setup

### Local install

```
npm install
npm run build
```

### Upload to specific youtrack instance

```
npm run upload -- --host <YOUTRACK_URL> --token <YOUTRACK_TOKEN>
```

