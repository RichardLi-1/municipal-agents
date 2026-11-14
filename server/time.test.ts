import assert from "node:assert/strict";
import { test } from "node:test";
import type { Decision, TimelineEvent } from "../shared/types.ts";
import { endMs, nextParticipation, openParticipation, startMs, torontoOffset } from "./time.ts";

const take = [{ method: "speak" as const, instructions: "Register." }];
const ev = (id: string, date: string, end?: string, participation = take): TimelineEvent => ({ id, date, end, kind: "council", title: id, plain: id, participation });
const decision = (timeline: TimelineEvent[]) => ({ id: "d", timeline }) as Decision;
const NOW = Date.parse("2026-11-14T06:30:00Z"); // 1:30 am in Toronto

test("Toronto offsets follow daylight time", () => {
  assert.equal(torontoOffset("2026-11-14"), "-05:00");
  assert.equal(torontoOffset("2026-07-01"), "-04:00");
  assert.equal(startMs("2026-11-14"), Date.parse("2026-11-14T05:00:00Z"));
  assert.equal(endMs("2026-11-14"), Date.parse("2026-11-15T04:59:59Z"));
});

test("next prefers an event that hasn't begun over one already open", () => {
  const d = decision([
    ev("past", "2026-10-01"),
    ev("survey", "2026-09-14", "2027-02-26T23:59:00-05:00"),
    ev("no-say", "2026-11-20", undefined, []),
    ev("council", "2026-12-16"),
  ]);
  assert.equal(nextParticipation(d, NOW)?.id, "council");
  assert.deepEqual(openParticipation(d, NOW).map((e) => e.id), ["survey"]);
});

test("a date-only event today still counts as next, and an open one is the fallback", () => {
  assert.equal(nextParticipation(decision([ev("today", "2026-11-14"), ev("later", "2026-12-01")]), NOW)?.id, "today");
  assert.equal(nextParticipation(decision([ev("survey", "2026-09-14", "2027-02-26")]), NOW)?.id, "survey");
  assert.equal(nextParticipation(decision([ev("past", "2026-11-13")]), NOW), undefined);
});
