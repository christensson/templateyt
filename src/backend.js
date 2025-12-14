var entities = require('@jetbrains/youtrack-scripting-api/entities');

exports.httpHandler = {
  endpoints: [
    {
      scope: "project",
      method: 'GET',
      path: 'templates',
      handle: function handle(ctx) {
        const props = ctx.project.extensionProperties;
        const templates = JSON.parse(props.templates) || [];
        ctx.response.json({
          templates: templates,
        });
      }
    },
    {
      scope: "project",
      method: 'POST',
      path: 'addTemplate',
      handle: function handle(ctx) {
        const body = JSON.parse(ctx.request.body);
        const newTemplate = body.template;
        if (newTemplate.hasOwnProperty('id') === false || newTemplate.id === '') {
          ctx.response.status = 400;
          ctx.response.json({ success: false, message: 'Template must have a valid id.' });
          return;
        }

        const articleId = newTemplate?.articleId;
        if (articleId === undefined || articleId === '') {
          ctx.response.status = 400;
          ctx.response.json({ success: false, message: 'Template must have a valid articleId.' });
          return;
        }

        const article = entities.Article.findById(articleId);
        if (article === null) {
          ctx.response.status = 400;
          ctx.response.json({ success: false, message: `No article found with articleId ${articleId}.` });
          return;
        }

        let props = ctx.project.extensionProperties;
        let templates = JSON.parse(props.templates) || [];
        let template = templates.find((t) => t.id === newTemplate.id);
        if (template) {
          // Update existing entry.
          Object.assign(template, newTemplate);
        } else {
          // Add new entry.
          templates.push(newTemplate);
        }
        props.templates = JSON.stringify(templates);
        ctx.response.json({ success: true, templates: templates });
      }
    },
    {
      scope: "project",
      method: 'DELETE',
      path: 'removeTemplate',
      handle: function handle(ctx) {
        const body = JSON.parse(ctx.request.body);
        if (body.hasOwnProperty('id') === false || body.id === '') {
          ctx.response.status = 400;
          ctx.response.json({ success: false, message: 'Id missing in request.' });
          return;
        }
        const id = body.id;
        let props = ctx.project.extensionProperties;
        const oldTemplates = JSON.parse(props.templates) || [];
        const updatedTemplates = oldTemplates.filter((t) => t.id !== id);
        props.templates = JSON.stringify(updatedTemplates);
        ctx.response.json({ success: true });
      }
    },
    {
      scope: "project",
      method: 'GET',
      path: 'getProjectInfo',
      handle: function handle(ctx) {
        const project = ctx.project;
        const stateFields = project.fields.map((x) => x).filter((x) => x.typeName === 'state[1]');
        const enumFields = project.fields.map((x) => x).filter((x) => x.typeName === 'enum[1]');
        const stateFieldInfo = stateFields.map((x) => ({
          name: x.name,
          values: x.values.map((v) => ({
            name: v.name,
            presentation: v.presentation,
          }))
        }));
        const enumFieldInfo = enumFields.map((x) => ({
          name: x.name,
          values: x.values.map((v) => ({
            name: v.name,
            presentation: v.presentation,
          }))
        }));

        ctx.response.json({ stateFields: stateFieldInfo, enumFields: enumFieldInfo });
      }
    }
  ]
};
