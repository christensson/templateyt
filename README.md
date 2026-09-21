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
  - *Optional condition when template is added automatically*:
    - Added when ticket *field*[^1] is assigned a specific value.
    - Added when ticket or article is tagged with a specific *tag*.

    If the template is added automatically when a field becomes a specific value, the template
    may not set that field to any other value.

[^1]: *Note! Currently only state and enum fields are supported in conditions.*
[^2]: *Single-value state, enum, user, version and owned fields are supported. Users are picked
from the users configured for the field.*

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

The *"Applied templates"* panel below the ticket fields lists the templates applied to the ticket.
Templates that set fields have a *"Set fields"* button that shows what will be set and applies
(or re-applies) the fields directly in the panel. The button carries a warning icon while
user-chosen fields have not been set yet (because the template was added automatically, or the
values were left empty when adding it); the mark is cleared once the fields have been confirmed or
the template is removed.

> [!IMPORTANT]
> YouTrack does not notify app widgets when a ticket changes, so the *"Applied templates"* panel
> shows the state from when the ticket page was opened. Use the refresh icon in the panel after a
> template has been added or removed automatically.

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

