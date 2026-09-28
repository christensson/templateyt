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
- Check *"Use article as ticket template."* checkbox and press *"Save info"*.

#### Configure template

> [!IMPORTANT]
> Requires project admin role.

- Navigate to project.
- Open *"Ticket Templates Config"*.
- Click *"Add new template"*.
- Set template properties:
  - *Name*: Give the template a name for easy identication.
  - *Template article*: Select template article, note that only template articles configured to be
    used as ticket templates are available in drop-down.
  - *Conditions when template is valid*: Add conditions when the template is valid. Multiple
    conditions can be selected and template is valid when any of the condition matches. Possible
    conditions are:
    - When entity is *ticket* or *article*.
    - When ticket *field*[^1] is assigned a specific value.
    - When ticket or article is assigned a specific *tag*.
  - *Ticket fields set by template*: Optionally add ticket *fields*[^2] that the template sets when
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
  - *Optional condition when template is added automatically*:
    - Added when ticket *field*[^1] is assigned a specific value.
    - Added when ticket or article is tagged with a specific *tag*.

    If the template is added automatically when a field becomes a specific value, the template
    may not set that field to any other value.

[^1]: *Note! Currently only state and enum fields are supported in conditions.*
[^2]: *State, enum, user, version, build and owned fields are supported, single-value and
multi-value. Users are picked from the users configured for the field.*

### Text replacements

A template can replace placeholder words when it is applied, both in the ticket summary and in
the template content, and for hierarchical templates in every subtask summary and description.
Configure them in the template's *"Text replacements"* panel. Each replacement names the word to
replace and what to insert:

- *Text entered by user*: asked for when the template is applied manually, and required.
- *Root ticket field*: the display text of a field of the ticket the template is applied to (for a
  hierarchy, the ticket it is created from); a multi-value field inserts all its values separated
  by commas. Applying manually with an empty field is rejected.

Only whole words are replaced, on every occurrence. Words are delimited by whitespace, line breaks
and punctuation such as commas, colons or brackets; hyphens and underscores do not delimit, so
`VERSION` matches in `Release VERSION.` but not in `VERSION-1` or `MY_VERSION`.

When a template is added automatically, field replacements are applied and user-entered
placeholders stay in place; *"Set fields"* in the *"Apply template"* menu then asks for the texts
and replaces the words in the ticket. An empty field is skipped and logged. Article templates
support user-entered replacements on manual application only.

### Hierarchical templates

A template whose template article has child articles can create a ticket hierarchy: one subtask
per child article, nested like the articles, with the article title as summary and the article
content as description.

- In the template configuration, check *"Enable hierarchical template"* and click
  *"Import child articles"*. The child templates appear indented below the template in the list.
  Re-importing refreshes the tree from the knowledge base while keeping the configuration of
  articles already imported.
- Select a child template in the list to configure it: its name (the subtask summary), whether it
  *inherits fields from parent* (the fields configured by the parent template are copied from the
  parent ticket when the hierarchy is created), and its own ticket fields, which work like the
  fields of a template and take precedence over inherited ones. Child templates have no
  conditions.
- A child template can have *conditions when it is added*: one or more "ticket field is value"
  checks against the ticket the hierarchy is created from. It is created when any condition
  matches, or always when it has none. A skipped child template takes its own children with it.
- The hierarchy is created manually, for tickets only, from *"Create hierarchy"* in the
  *"Apply template"* menu, once the template has been applied to the ticket. The form shows the subtasks that will be created, marks the ones that
  will not be created and why, and asks for the values of user-chosen fields. Creating the
  hierarchy again is possible after a warning and adds another set of subtasks.
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

If a template is configured to be valid for tickets, the template can be added manually using
*"Apply template"* available under the ticket or article "..."-menu. For tickets, the menu also
offers *"Set fields"*, which sets (or re-sets) only the fields defined by the selected template
without touching the description. This is how values chosen by the user are filled in for
templates that were added automatically.

> [!IMPORTANT]
> The usability of templates applied to articles can be improved. When a template is added to
> an article (either manually or automatically), the article content will not automatically updated
> in the browser. Unfortunately, currently, a manual reload of the article is required in the browser.

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

