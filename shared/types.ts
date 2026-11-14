// The shapes every part of Municipal Agents shares: the data files, the API and the
// display. Changes here are additive only, so no builder breaks another.

/** ISO 8601 date (2026-11-25) or date-time with offset (2026-11-25T19:00:00-05:00). */
export type IsoDate = string;

/** A document the agents read: a staff report, an agenda, a budget book, a plan. */
export interface SourceDoc {
  id: string; // "kitchener-2027-budget-book"
  title: string;
  publisher: string; // "City of Kitchener"
  url: string; // where it was downloaded from
  published: IsoDate; // the date the document carries
  retrieved: IsoDate; // when we downloaded it
  pages: number;
  licence: string; // "Open Government Licence – City of Kitchener", "Public record"
  kind: "staff-report" | "agenda" | "budget" | "plan" | "progress-report" | "dataset" | "notice" | "other";
}

/** A quote that must appear, word for word after normalising, on that page. */
export interface Citation {
  sourceId: string;
  page: number; // 1-based
  quote: string;
}

export type StatementKind = "fact" | "estimate" | "assumption" | "unknown" | "tradeoff" | "harm";

/** One sentence a resident reads, with its sources. */
export interface Statement {
  id: string;
  text: string;
  kind: StatementKind;
  citations: Citation[];
  /** True only when every citation's quote was found on its page by the checker. */
  verified: boolean;
  /** Staff review of this one statement. */
  review?: { action: "approved" | "edited" | "rejected"; by: string; at: IsoDate; note?: string; originalText?: string };
}

/** A number on screen. Every figure is a link to its page. */
export interface Figure {
  id: string;
  label: string; // "Property tax increase for an average home"
  value: number;
  unit: string; // "CAD", "%", "units", "minutes", "tCO2e/yr"
  display: string; // "$124 a year"
  citation?: Citation; // absent only when kind is "computed" or "assumption"
  kind: "cited" | "computed" | "assumption";
  /** For computed figures: the formula in words, and the figure ids it uses. */
  formula?: string;
  inputs?: string[];
}

export type AudienceId =
  | "renter"
  | "homeowner"
  | "transit-rider"
  | "driver"
  | "walk-cycle"
  | "business-owner"
  | "senior"
  | "student"
  | "parent"
  | "disability"
  | "newcomer";

export interface Participation {
  method: "speak" | "write" | "survey" | "attend" | "watch" | "contact-councillor";
  instructions: string; // plain words: "Register to speak by noon the Friday before"
  deadline?: IsoDate;
  url?: string;
  contact?: string; // "clerks@kitchener.ca, 519-741-2203" (public office contacts only)
}

export interface TimelineEvent {
  id: string;
  date: IsoDate;
  end?: IsoDate;
  kind: "report" | "committee" | "public-input" | "council" | "deadline" | "implementation" | "budget-vote" | "other";
  title: string; // "General Issues Committee"
  plain: string; // "Councillors discuss the draft budget. You can speak."
  location?: string;
  participation?: Participation[];
  citation?: Citation;
}

/** A proposed municipal decision. Hand-checked metadata; the brief is the agents'. */
export interface Decision {
  id: string;
  city: string; // city config id, "waterloo-region"
  title: string; // the official title
  plainTitle: string; // "Kitchener's 2027 budget: a 4.9% tax increase"
  decidedBy: string; // "Kitchener City Council"
  status: "proposed" | "in-consultation" | "decided";
  officialUrl: string; // the official notice or agenda page
  sources: string[]; // SourceDoc ids
  timeline: TimelineEvent[];
  /** GeoJSON (WGS84) of the area the decision touches, for the map. */
  area?: GeoJSON.FeatureCollection | GeoJSON.Feature;
  center: [number, number]; // [lng, lat]
  zoom: number;
  lenses: LensId[];
  tags?: string[];
}

export type LensId = "transit" | "cost" | "commitments" | "housing";

export interface AudienceImpact {
  audience: AudienceId;
  label: string; // "If you rent"
  statements: Statement[];
}

export interface Unknown {
  question: string; // "How many buses route 7 will run after 9 pm"
  why: string; // why it matters
  whoCanAnswer: string; // "Grand River Transit planning"
  contact?: string;
}

export interface GlossaryTerm {
  term: string;
  plain: string;
}

/** Transit lens (challenge 2). Computed from GTFS + destinations by lenses/transit. */
export interface TransitLens {
  feed: { name: string; url: string; retrieved: IsoDate; serviceDate: IsoDate; licence: string };
  /** Times the access was computed for, e.g. "weekday-0800". */
  scenarios: { id: string; label: string; departure: string; day: string }[];
  /** For each scenario and destination type, the share of the area's people (or origins) reaching one within the limit. */
  access: { scenario: string; destinationType: string; minutesLimit: number; shareReached: number; originsCounted: number }[];
  gaps: {
    id: string;
    kind: "no-service" | "late-start" | "early-end" | "low-frequency" | "first-last-mile" | "long-trip";
    title: string; // "No bus reaches Grand River Hospital by 8 am on Sundays from Mill Courtland"
    detail: string;
    scenario?: string;
    peopleAffected?: number;
    location?: [number, number];
  }[];
  fixes: {
    id: string;
    title: string; // "Start route 8 at 6 am on Sundays"
    benefit: string;
    tradeoff: string;
    rank: number;
    estimate?: string;
  }[];
  /** GeoJSON layers for the map: stops, gaps, destinations, isochrones. */
  layers: Record<string, GeoJSON.FeatureCollection>;
  method: string; // the algorithm in plain words, with its reference
  limits: string[];
}

/** Cost lens (challenge 3). */
export interface CostLens {
  asset: string; // "Kitchener's new indoor recreation complex"
  horizonYears: number;
  discountRate: number; // 0 or 0.03
  households?: number;
  figures: Figure[]; // upfront, annual operating, annual maintenance, renewal, emissions, carbon price
  /** Year-by-year, for the stacked chart. */
  series: { year: number; capital: number; operating: number; maintenance: number; renewal: number; environmental: number }[];
  totals: { capital: number; operating: number; maintenance: number; renewal: number; environmental: number; lifecycle: number; perHousehold?: number };
  statements: Statement[];
  assumptions: { id: string; label: string; value: number; unit: string; min: number; max: number; step: number; why: string }[];
}

/** Commitments lens (challenge 4). */
export interface CommitmentsLens {
  commitments: {
    id: string;
    title: string; // "Cut community greenhouse gas emissions 50% by 2030"
    madeBy: string;
    madeOn?: IsoDate;
    target: string;
    status: "on-track" | "behind" | "done" | "unclear";
    progress: Statement[];
    unclear: string[];
    relation: string; // how this decision touches it
  }[];
}

/** Housing lens (challenge 5). */
export interface HousingLens {
  city: string;
  stages: {
    id: "approved" | "site-plan" | "permit-issued" | "under-construction" | "completed";
    label: string;
    units: number | null;
    projects: number | null;
    source?: string; // dataset or document
    tracked: boolean; // false where no public data shows this stage
  }[];
  timeBetween: { from: string; to: string; medianDays: number | null; note: string }[];
  target?: { label: string; units: number; by: string; citation?: Citation };
  statements: Statement[];
  hardToTrack: string[];
  layers?: Record<string, GeoJSON.FeatureCollection>;
}

export interface Brief {
  decisionId: string;
  lang: string; // "en", "fr", ...
  generatedAt: IsoDate;
  models: string[];
  costUsd: number;
  readingGrade: number; // Flesch-Kincaid grade of the summary + impacts
  summary: Statement[];
  whyNow: Statement[];
  impacts: AudienceImpact[];
  haveYourSay: Statement[]; // plain-language framing of the timeline
  figures: Figure[];
  unknowns: Unknown[];
  tradeoffs: Statement[];
  glossary: GlossaryTerm[];
  lenses: { transit?: TransitLens; cost?: CostLens; commitments?: CommitmentsLens; housing?: HousingLens };
  review: { status: "draft" | "in-review" | "published"; by?: string; at?: IsoDate };
}

export interface DecisionCard {
  id: string;
  plainTitle: string;
  decidedBy: string;
  status: Decision["status"];
  next?: TimelineEvent; // next event with participation, if any
  center: [number, number];
  reviewStatus: Brief["review"]["status"] | "none";
  lenses: LensId[];
}

export interface DecisionDetail {
  decision: Decision;
  brief?: Brief;
  sources: SourceDoc[];
}

export interface CityConfig {
  id: string;
  name: string; // "Waterloo Region"
  municipalities: string[];
  center: [number, number];
  zoom: number;
  languages: string[]; // offered in the language menu
  officialNoticeUrl: string;
  clerkContact: string;
  gtfsUrl?: string;
  openData: { name: string; url: string; licence: string }[];
}

/** The log: append-only, each entry's hash covers the previous one's. */
export interface LogEntry {
  seq: number;
  at: IsoDate;
  actor: string; // "agent:lead", "agent:transit-access", "staff:ana", "visitor", "system"
  kind:
    | "source.added"
    | "brief.started"
    | "brief.generated"
    | "statement.recorded"
    | "statement.rejected"
    | "statement.reviewed"
    | "brief.published"
    | "question.asked"
    | "answer.given"
    | "translation.made"
    | "usage";
  decisionId?: string;
  payload: unknown;
  prevHash: string;
  hash: string; // sha256(prevHash + canonical JSON of {seq, at, actor, kind, decisionId, payload})
}

/** Server-sent events from /ask and /staff/briefs. */
export type AgentEvent =
  | { type: "plan"; agent: string; steps: { id: string; specialist: string; question: string }[] }
  | { type: "step.start"; id: string; specialist: string; question: string }
  | { type: "tool"; id: string; specialist: string; tool: string; summary: string }
  | { type: "statement"; id: string; statement: Statement }
  | { type: "step.end"; id: string; specialist: string; status: "done" | "failed"; summary: string }
  | { type: "answer"; text: string; statements: Statement[]; figures?: Figure[] }
  | { type: "brief"; brief: Brief }
  | { type: "usage"; calls: number; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: "error"; message: string }
  | { type: "done" };

export interface UsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  energyWh: number; // estimate, method in docs
  co2eGrams: number;
  byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }>;
  today: { costUsd: number; limitUsd: number };
}
