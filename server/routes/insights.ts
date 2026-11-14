// "What residents are asking": an aggregated view of the questions asked about a
// decision, for staff (passcode needed). It answers "what do people want to know, and
// did we answer it?" without exposing any one person's question.
//
// Privacy rule (k-anonymity, k = 3):
//   - Counts only: questions per day, languages, audiences, topics, unanswered and
//     offline answers, the source pages answers cited.
//   - Question wording is shown only for a group of at least 3 similar questions
//     (word overlap, Jaccard >= 0.5 after dropping common words). Even then the shown
//     wording is the group's most typical question with emails, phone numbers, web
//     addresses, postal codes and long numbers (street numbers, account numbers)
//     replaced by [removed], beside the words at least 3 of the questions share.
//   - Groups smaller than 3 are only counted ("suppressed").
// Questions are never tied to a person (no accounts, IPs are not stored), so "3 people"
// means 3 separate questions.
import type { Brief, Decision, LensId, LogEntry, Statement } from "../../shared/types.ts";
import type { App } from "../app.ts";
import { HttpError, type Router, sendJson } from "../http.ts";
import { siteOrigin } from "../site.ts";
import { torontoDay } from "../time.ts";
import { requireStaff } from "./staff.ts";

export const K_ANONYMITY = 3;
const SIMILAR = 0.5;

export const PRIVACY_RULE =
  `Counts only. Question wording is shown only for a group of at least ${K_ANONYMITY} similar questions ` +
  `(word overlap of ${SIMILAR * 100}% or more, common words ignored), with emails, phone numbers, web addresses, ` +
  `postal codes and long numbers removed. Smaller groups are counted, never shown. Questions are not tied to anyone.`;

const STOP = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my " +
    "of on or our so than that the their them then there these they this to was we were what when where which who " +
    "why will with would you your about any some just get got going go much many more most also please tell know " +
    "want need does dont doesnt im ive isnt arent there here us"
  ).split(" "),
);

/** Lowercase, keep letters and digits, drop common words, crude plural/-ing stem. */
export function keywords(text: string): string[] {
  // Contact details and long numbers never count towards similarity.
  return redact(text)
    .replace(/\[removed\]/g, " ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("es") && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Replace things that could identify someone with [removed]. */
export function redact(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, "[removed]")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[removed]")
    .replace(/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi, "[removed]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[removed]")
    .replace(/\b\d{3,}\b/g, (m) => (/^(19|20)\d\d$/.test(m) ? m : "[removed]"))
    .replace(/\s+/g, " ")
    .trim();
}

interface Topic {
  id: string;
  label: string;
  from: "glossary" | "lens" | "have-your-say" | "other";
  words: Set<string>;
}

const LENS_WORDS: Record<LensId, { label: string; words: string }> = {
  transit: { label: "Transit", words: "transit bus buses route stop ion lrt train grt ride rider service frequency schedule commute" },
  cost: { label: "Costs and taxes", words: "cost costs tax taxes levy property bill fee fees rate rates price pay paying afford budget spend spending dollar money increase household" },
  commitments: { label: "Commitments", words: "commitment commitments promise promised target targets goal climate emission emissions plan pledge progress" },
  housing: { label: "Housing", words: "housing house home homes unit units rent renter renting apartment permit permits affordable build building development" },
  construction: { label: "Construction", words: "construction tunnel tunnelling boring dig digging excavation noise truck trucks closure closures detour site shaft dust vibration" },
};

const HAVE_YOUR_SAY = "speak speaking delegate delegation comment comments survey meeting meetings council vote voting when deadline register attend say input feedback consultation hearing councillor email write";

/** Topics for a decision: its glossary terms, its lenses, and "having your say". */
export function topicsFor(decision: Decision | undefined, brief: Brief | undefined): Topic[] {
  const out: Topic[] = [];
  for (const g of brief?.glossary ?? []) {
    const words = new Set(keywords(g.term));
    if (words.size) out.push({ id: `glossary:${[...words].join("-")}`, label: g.term, from: "glossary", words });
  }
  const lenses = decision ? (decision.lenses ?? []) : (Object.keys(LENS_WORDS) as LensId[]);
  for (const l of lenses) {
    const def = LENS_WORDS[l];
    if (def) out.push({ id: `lens:${l}`, label: def.label, from: "lens", words: new Set(keywords(def.words)) });
  }
  out.push({ id: "have-your-say", label: "Having a say (meetings, deadlines, how to take part)", from: "have-your-say", words: new Set(keywords(HAVE_YOUR_SAY)) });
  return out;
}

/** The topic whose words a question shares most of; glossary terms win ties (they're specific). */
export function topicOf(words: string[], topics: Topic[]): Topic | undefined {
  let best: Topic | undefined;
  let bestScore = 0;
  for (const t of topics) {
    let score = 0;
    for (const w of new Set(words)) if (t.words.has(w)) score++;
    // A multi-word glossary term counts fully only when most of its words are there.
    if (t.from === "glossary" && t.words.size > 1 && score < Math.ceil(t.words.size / 2)) score = 0;
    if (score > bestScore) (best = t), (bestScore = score);
  }
  return best;
}

interface Asked {
  seq: number;
  at: string;
  decisionId?: string;
  question: string;
  lang: string;
  audiences: string[];
  words: string[];
}

/** Group similar questions greedily: each joins the first group whose seed it overlaps enough. */
export function groupSimilar<T extends { words: string[] }>(items: T[], threshold = SIMILAR): T[][] {
  const groups: { seed: Set<string>; members: T[] }[] = [];
  for (const it of items) {
    const set = new Set(it.words);
    const g = groups.find((x) => jaccard(x.seed, set) >= threshold);
    if (g) g.members.push(it);
    else groups.push({ seed: set, members: [it] });
  }
  return groups.map((g) => g.members);
}

/** The member most similar to the rest of its group. */
function medoid<T extends { words: string[] }>(group: T[]): T {
  let best = group[0];
  let bestScore = -1;
  for (const a of group) {
    const sa = new Set(a.words);
    let s = 0;
    for (const b of group) if (a !== b) s += jaccard(sa, new Set(b.words));
    if (s > bestScore) (best = a), (bestScore = s);
  }
  return best;
}

function countBy<T>(items: T[], key: (x: T) => string | string[]): { key: string; n: number }[] {
  const m = new Map<string, number>();
  for (const it of items) for (const k of ([] as string[]).concat(key(it))) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

export function buildInsights(app: App, opts: { decisionId?: string; days: number; origin: string; now?: number }) {
  const now = opts.now ?? Date.now();
  const since = new Date(now - opts.days * 86_400_000).toISOString();
  const inRange = (e: LogEntry) => e.at >= since;
  const asked: Asked[] = app.log
    .list({ kind: "question.asked", decisionId: opts.decisionId, limit: 10_000 })
    .filter(inRange)
    .map((e) => {
      const p = (e.payload ?? {}) as { question?: unknown; lang?: unknown; audiences?: unknown };
      const question = typeof p.question === "string" ? p.question : "";
      return {
        seq: e.seq,
        at: e.at,
        decisionId: e.decisionId,
        question,
        lang: typeof p.lang === "string" && p.lang ? p.lang.toLowerCase() : "unspecified",
        audiences: Array.isArray(p.audiences) ? p.audiences.filter((a): a is string => typeof a === "string") : [],
        words: keywords(question),
      };
    })
    .filter((q) => q.question);
  const answers = app.log.list({ kind: "answer.given", decisionId: opts.decisionId, limit: 10_000 }).filter(inRange);

  // Match each answer to the earliest unanswered question with the same text and decision.
  const waiting = new Map<string, Asked[]>();
  for (const q of asked) {
    const k = `${q.decisionId}\u0000${q.question}`;
    (waiting.get(k) ?? waiting.set(k, []).get(k)!).push(q);
  }
  let answered = 0;
  let offline = 0;
  let replayed = 0;
  const cited = new Map<string, { sourceId: string; page: number; citations: number }>();
  for (const a of answers) {
    const p = (a.payload ?? {}) as { question?: unknown; offline?: unknown; replay?: unknown; replayOf?: unknown; statements?: unknown };
    const queue = typeof p.question === "string" ? waiting.get(`${a.decisionId}\u0000${p.question}`) : undefined;
    const i = queue?.findIndex((q) => q.seq < a.seq) ?? -1;
    if (queue && i >= 0) {
      queue.splice(i, 1);
      answered++;
    }
    if (p.offline === true) offline++;
    // A replay from the answer cache is logged with replayOf (the saved run it came from).
    if (p.replay || p.replayOf) replayed++;
    for (const s of Array.isArray(p.statements) ? (p.statements as Statement[]) : []) {
      for (const c of Array.isArray(s?.citations) ? s.citations : []) {
        if (typeof c?.sourceId !== "string" || !Number.isInteger(c.page)) continue;
        const k = `${c.sourceId}#${c.page}`;
        const hit = cited.get(k) ?? { sourceId: c.sourceId, page: c.page, citations: 0 };
        hit.citations++;
        cited.set(k, hit);
      }
    }
  }

  const decision = opts.decisionId ? app.store.decision(opts.decisionId) : undefined;
  const brief = opts.decisionId ? app.store.brief(opts.decisionId) : undefined;
  const topics = topicsFor(decision, brief);
  const topicCounts = new Map<string, number>();
  const topicOfQ = new Map<Asked, Topic | undefined>();
  for (const q of asked) {
    const t = topicOf(q.words, topics);
    topicOfQ.set(q, t);
    topicCounts.set(t?.id ?? "other", (topicCounts.get(t?.id ?? "other") ?? 0) + 1);
  }

  const groups = groupSimilar(asked);
  const shown = groups.filter((g) => g.length >= K_ANONYMITY);
  const hidden = groups.filter((g) => g.length < K_ANONYMITY);
  const titles = new Map(app.store.sources().map((s) => [s.id, s.title]));

  const perDay = countBy(asked, (q) => torontoDay(new Date(q.at)))
    .map(({ key, n }) => ({ day: key, questions: n }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    decision: opts.decisionId ?? null,
    ...(opts.decisionId
      ? {}
      : { decisions: countBy(asked, (q) => q.decisionId ?? "none").map(({ key, n }) => ({ id: key, plainTitle: app.store.decision(key)?.plainTitle ?? key, questions: n })) }),
    period: { from: since, to: new Date(now).toISOString(), days: opts.days },
    totals: { questions: asked.length, answered, unanswered: asked.length - answered, offline, replayed },
    perDay,
    languages: countBy(asked, (q) => q.lang).map(({ key, n }) => ({ lang: key, questions: n })),
    audiences: countBy(asked, (q) => (q.audiences.length ? q.audiences : ["none chosen"])).map(({ key, n }) => ({ audience: key, questions: n })),
    topics: [...topics, { id: "other", label: "Other", from: "other" as const, words: new Set<string>() }]
      .map((t) => ({ id: t.id, label: t.label, from: t.from, questions: topicCounts.get(t.id) ?? 0 }))
      .filter((t) => t.questions > 0)
      .sort((a, b) => b.questions - a.questions),
    similar: shown
      .map((g) => {
        const m = medoid(g);
        const shared = countBy(g, (q) => [...new Set(q.words)])
          .filter((x) => x.n >= K_ANONYMITY)
          .slice(0, 8)
          .map((x) => x.key);
        const t = topicOfQ.get(m);
        return { questions: g.length, example: redact(m.question), sharedWords: shared, topic: t?.label ?? "Other" };
      })
      .sort((a, b) => b.questions - a.questions)
      .slice(0, 20),
    suppressed: { groups: hidden.length, questions: hidden.reduce((n, g) => n + g.length, 0) },
    citedPages: [...cited.values()]
      .sort((a, b) => b.citations - a.citations || a.sourceId.localeCompare(b.sourceId) || a.page - b.page)
      .slice(0, 10)
      .map((c) => ({ ...c, source: titles.get(c.sourceId) ?? c.sourceId, url: `${opts.origin}/source/${encodeURIComponent(c.sourceId)}/${c.page}` })),
    privacy: { k: K_ANONYMITY, rule: PRIVACY_RULE },
  };
}

export function insightRoutes(app: App, r: Router): void {
  r.get("/api/staff/insights", ({ req, res, url }) => {
    requireStaff(app, req);
    const id = url.searchParams.get("decision") || undefined;
    if (id && !app.store.decision(id)) throw new HttpError(404, `No decision with id "${id}"`);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 1), 3650);
    sendJson(req, res, 200, buildInsights(app, { decisionId: id, days, origin: siteOrigin(app, req) }));
  });
}
