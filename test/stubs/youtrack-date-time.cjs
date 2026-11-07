/* global module */
// Stand-in for @jetbrains/youtrack-scripting-api/date-time, which only exists inside YouTrack.
// format supports the "yyyy-MM-dd" and "yyyy-MM-dd HH:mm" patterns in UTC; toPeriod returns a
// fake Joda-Time Period parsed from a string like "1w2d4h30m".
const pad = (n) => String(n).padStart(2, "0");

module.exports = {
  format: (timestamp, pattern) => {
    const date = new Date(timestamp);
    const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    return pattern === "yyyy-MM-dd" ? day : `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  },
  toPeriod: (text) => {
    const part = (unit) => {
      const match = new RegExp(`(\\d+)${unit}`).exec(text);
      return match ? Number(match[1]) : 0;
    };
    const parts = { w: part("w"), d: part("d"), h: part("h"), m: part("m") };
    return {
      text,
      getWeeks: () => parts.w,
      getDays: () => parts.d,
      getHours: () => parts.h,
      getMinutes: () => parts.m,
    };
  },
};
