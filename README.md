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
- Configuration of templates per project.

## How to configure and use templates

### Overview

Each template consists of:

- An *article* defining the template content, refered to as *template article*.
- A per-project *template configuration*.

The *template configuration* defines when the template is valid and if the template shall be added
automatically to tickets or articles.

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
  - *Optional condition when template is added automatically*:
    - Added when ticket *field*[^1] is assigned a specific value.
    - Added when ticket or article is tagged with a specific *tag*.

[^1]: *Note! Currently only state and enum fields are supported.*

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
*"Apply template"* available under the ticket or article "..."-menu.

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

