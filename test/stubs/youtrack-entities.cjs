/* global module */
// Stand-in for @jetbrains/youtrack-scripting-api/entities, which only exists inside YouTrack.
// Unit tests of the backend helpers use fake issues and projects instead of the entities.
module.exports = {
  Article: { findById: () => null },
  Project: { findByKey: () => null },
  Issue: { findById: () => null },
  Tag: { findTagByName: () => null },
  User: { current: { login: "tester", timeZoneId: "UTC" } },
};
