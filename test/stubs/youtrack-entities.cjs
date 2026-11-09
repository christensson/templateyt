/* global module */
// Stand-in for @jetbrains/youtrack-scripting-api/entities, which only exists inside YouTrack.
// Unit tests of the backend helpers use fake issues and projects instead of the entities.
// onChange returns the rule definition, so tests can call a workflow's guard and action.
const onChange = (rule) => rule;
module.exports = {
  Article: { findById: () => null, onChange },
  Project: { findByKey: () => null },
  Issue: { findById: () => null, onChange },
  Tag: { findTagByName: () => null },
  User: { current: { login: "tester", timeZoneId: "UTC" } },
};
