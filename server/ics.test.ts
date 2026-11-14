import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { Decision } from "../shared/types.ts";
import { decisionCalendar, escapeText, foldLine } from "./ics.ts";

const decision = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "fixtures/data/decisions/fixture-budget.json"), "utf8"),
) as Decision;
const NOW = Date.parse("2099-11-01T12:00:00Z");

test("text values escape commas, semicolons, backslashes and newlines", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});

test("long lines fold at 75 octets without splitting UTF-8 characters", () => {
  const folded = foldLine("DESCRIPTION:" + "é".repeat(100));
  for (const line of folded.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.equal(folded.replace(/\r\n /g, ""), "DESCRIPTION:" + "é".repeat(100));
});

test("calendar holds only future events with participation, plus their deadlines", () => {
  const ics = decisionCalendar(decision, { now: NOW, siteUrl: "https://example.org" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every line ends with CRLF");
  const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(uids, ["fixture-budget.input@municipal-agents", "fixture-budget.input.deadline-0@municipal-agents", "fixture-budget.council@municipal-agents"]);
  assert.equal((ics.match(/^DTSTAMP:\d{8}T\d{6}Z\r$/gm) ?? []).length, 3);
  // 18:00 EST is 23:00 UTC; the all-day vote spans one date.
  assert.match(ics, /DTSTART:20991120T230000Z\r\nDTEND:20991121T020000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20991125\r\nDTEND;VALUE=DATE:20991126/);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /Register to speak\\, by noon the day before/);
  assert.match(unfolded, /https:\/\/example.org\/delegate/);
  assert.match(unfolded, /Not the official notice/);
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
});

test("an event already open goes in on its closing day", () => {
  const open = structuredClone(decision);
  open.timeline = [
    { id: "survey", date: "2099-09-14", end: "2099-12-26T23:59:00-05:00", kind: "public-input", title: "Survey", plain: "Fill it in.", participation: [{ method: "survey", instructions: "Online." }] },
  ];
  const ics = decisionCalendar(open, { now: NOW });
  assert.match(ics, /DTSTART;VALUE=DATE:20991226\r\nDTEND;VALUE=DATE:20991227/);
  assert.match(ics, /SUMMARY:Last day: Survey/);
});

test("no future events gives an empty but valid calendar", () => {
  const ics = decisionCalendar(decision, { now: Date.parse("2100-01-01T00:00:00Z") });
  assert.ok(!ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("PRODID:"));
});

test("an estimated date is tentative and says \"At the latest\"", () => {
  const est = structuredClone(decision);
  est.timeline = [
    {
      id: "amend",
      date: "2099-12-03",
      kind: "deadline",
      title: "Council amendments due",
      plain: "Council has 30 days to amend the proposed budget.",
      estimated: true,
      participation: [{ method: "contact-councillor", instructions: "Ask your councillor to move an amendment.", deadline: "2099-12-01" }],
    },
    { id: "vote", date: "2099-12-10", kind: "council", title: "Council vote", plain: "Council votes.", participation: [{ method: "watch", instructions: "Watch." }] },
  ];
  const ics = decisionCalendar(est, { now: NOW }).replace(/\r\n /g, "");
  const events = ics.split("BEGIN:VEVENT").slice(1);
  assert.equal(events.length, 3);
  assert.match(events[0], /SUMMARY:At the latest: Council amendments due/);
  assert.match(events[0], /STATUS:TENTATIVE/);
  assert.match(events[0], /Estimated date: worked out from a rule/);
  assert.match(events[1], /SUMMARY:At the latest: Deadline to contact your councillor/);
  assert.match(events[1], /STATUS:TENTATIVE/);
  assert.match(events[2], /SUMMARY:Council vote/);
  assert.match(events[2], /STATUS:CONFIRMED/);
});

test("Add to calendar holds the next 3 dates with a way to take part; deadlines get a day-before reminder", async () => {
  const { calendarFeed } = await import("./ics.ts");
  const day = (n: number) => `2099-12-${String(n).padStart(2, "0")}`;
  const many: Decision = {
    ...decision,
    timeline: [1, 5, 9, 13, 17].map((n, i) => ({
      id: `m${i}`, date: `${day(n)}T18:00:00-05:00`, kind: "council" as const, title: `Meeting ${i}`, plain: "Council meets.",
      participation: [{ method: "speak" as const, instructions: "Register to speak.", deadline: `${day(n - 0 || 1)}T12:00:00-05:00` }],
      ...(i === 1 ? { estimated: true } : {}),
    })),
  };
  many.timeline[0].participation![0].deadline = "2099-11-28T12:00:00-05:00";
  const ics = decisionCalendar(many, { now: NOW }).replace(/\r\n /g, "");
  const meetings = [...ics.matchAll(/^UID:fixture-budget\.(m\d)@/gm)].map((m) => m[1]);
  assert.deepEqual(meetings, ["m0", "m1", "m2"]);
  const deadline = ics.split("BEGIN:VEVENT").find((b) => b.includes("UID:fixture-budget.m0.deadline-0"))!;
  assert.match(deadline, /BEGIN:VALARM[\s\S]*TRIGGER:-P1D[\s\S]*END:VALARM/);
  assert.match(deadline, /STATUS:CONFIRMED/);
  const est = ics.split("BEGIN:VEVENT").find((b) => b.includes("UID:fixture-budget.m1@"))!;
  assert.match(est, /STATUS:TENTATIVE/);
  const feed = calendarFeed([many], { now: NOW, name: "All" });
  assert.equal([...feed.matchAll(/^UID:fixture-budget\.m\d@/gm)].length, 5, "the subscription feed keeps every date");
});
