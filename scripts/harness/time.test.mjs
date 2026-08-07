import assert from "node:assert/strict";
import test from "node:test";
import { localCalendarParts, localDate, utcTimestamp } from "./time.mjs";

test("local calendar date follows the requested time zone across a UTC date boundary", () => {
  const instant = new Date("2026-08-04T15:30:00.000Z");
  assert.equal(localDate(instant, "Asia/Tokyo"), "2026-08-05");
  assert.equal(localDate(instant, "UTC"), "2026-08-04");
});

test("local calendar parts include the IANA time zone", () => {
  const parts = localCalendarParts(new Date("2026-08-04T15:30:00.000Z"), "Asia/Tokyo");
  assert.deepEqual(parts, {
    date: "2026-08-05",
    month: "2026-08",
    time: "00:30:00",
    timeZone: "Asia/Tokyo",
  });
});

test("machine timestamps remain UTC ISO 8601", () => {
  assert.equal(utcTimestamp(new Date("2026-08-05T00:00:00Z")), "2026-08-05T00:00:00.000Z");
});
