// The construction sequence for the scenario, in plain words, with the arithmetic for
// spoil and trucks stated as assumptions. Durations are typical ranges, not a schedule.

import type { ConstructionStep } from "../../shared/types.ts";
import type { LngLat } from "./geo.ts";

export const SPOIL = {
  /** Loose soil takes more room than in the ground: bulking factor (assumption). */
  bulking: 1.3,
  /** Loose cubic metres one tandem or tri-axle dump truck carries (assumption). */
  truckM3: 10,
  /** Average advance of each machine, metres per working day, in glacial soils (assumption). */
  advanceMPerDay: 12,
  /** Machines boring at once: two, one per bore, launched a few weeks apart (assumption). */
  machines: 2,
  /** Hours a day trucks may leave the site: 7 am to 7 pm, Kitchener's construction-noise hours. */
  haulHours: 12,
} as const;

/** Volume dug out of one bore, cubic metres in the ground. */
export function boreVolumeM3(lengthM: number, diameterM: number): number {
  return Math.PI * (diameterM / 2) ** 2 * lengthM;
}

export function spoilPlan(boredLengthM: number, diameterM: number, s = SPOIL) {
  const perBore = boreVolumeM3(boredLengthM, diameterM);
  const inSitu = perBore * 2;
  const loose = inSitu * s.bulking;
  const truckloads = loose / s.truckM3;
  const perDay = (Math.PI * (diameterM / 2) ** 2 * s.advanceMPerDay * s.machines * s.bulking) / s.truckM3;
  const boringDays = boredLengthM / s.advanceMPerDay;
  return {
    perBoreM3: Math.round(perBore),
    inSituM3: Math.round(inSitu),
    looseM3: Math.round(loose),
    truckloads: Math.round(truckloads),
    trucksPerDay: Math.round(perDay),
    trucksPerHour: +(perDay / s.haulHours).toFixed(1),
    boringDays: Math.round(boringDays),
    boringMonths: Math.round(boringDays / 21), // about 21 working days a month
  };
}

/**
 * Local construction-noise rules along the section (checked 2026-11-14). The launch site
 * is in Kitchener (Sportsworld); the extraction site is in Cambridge (Preston).
 */
export const NOISE_RULES = {
  kitchener: {
    rule: "Kitchener allows construction noise from 7 am to 7 pm, seven days a week; work outside those hours needs a noise exemption from the City",
    source: "City of Kitchener, Noise complaints and exemptions (kitchener.ca/bylaws-and-enforcement/noise-complaints-and-exemptions/): \"Construction noise is allowed between 7 a.m. and 7 p.m. seven days a week.\"",
  },
  cambridge: {
    rule: "Cambridge's Noise By-law 32-04 bans noise from heavy equipment (it names excavators, cranes, pile drivers, loaders and trucks) from 8 pm Saturday to 7 am Monday, except in an emergency",
    source: "City of Cambridge, By-law 32-04 (Noise By-law), s. 2 (b): \"Sound or noise arising from the use of material handling equipment is prohibited between the hours of 8:00 p.m. Saturday and 7:00 a.m. Monday, except in the case of emergency.\" Definitions in s. 1 (a).",
  },
} as const;

export interface StepContext {
  launchName: string;
  extractionName: string;
  launch: LngLat;
  extraction: LngLat;
  middle: LngLat;
  highway: LngLat;
  river: LngLat;
  /** Direction of the line, degrees from north. */
  bearing: number;
  boredLengthM: number;
  diameterM: number;
  launchDepthM: number;
  extractionDepthM: number;
  boreholes: number;
  crossPassages: number;
  coverM: { min: number; max: number };
  crossings: string[]; // "Highway 401", "Speed River"
}

const n0 = (x: number) => x.toLocaleString("en-CA");

/** Layer names the map should show for each step (prefixes of the MapLibre layer ids). */
export const L = {
  stage2: "cx-stage2",
  alignment: "cx-alignment",
  bores: "cx-bores",
  shafts: "cx-shafts",
  sites: "cx-sites",
  boreholes: "cx-boreholes",
  crossPassages: "cx-cross-passages",
  sensitive: "cx-sensitive",
  crossings: "cx-crossings",
} as const;

export function buildSteps(c: StepContext): ConstructionStep[] {
  const sp = spoilPlan(c.boredLengthM, c.diameterM);
  const b = Math.round(c.bearing);
  const side = (deg: number) => (b + deg + 360) % 360;
  const steps: Omit<ConstructionStep, "n">[] = [
    {
      id: "investigate",
      title: "Drill boreholes to read the ground",
      plain: `Crews drill about ${c.boreholes} boreholes: one every 75 m along the line, three at each shaft, and two on each side of ${c.crossings.map((x) => (/river/i.test(x) ? `the ${x}` : x)).join(" and ")}. Each goes down past the bottom of the future tunnel by at least 1.5 tunnel widths, to learn what the soil, rock and groundwater are like. This decides whether a tunnel here is practical at all.`,
      duration: "about 3 to 4 months (assumption)",
      whatResidentsNotice: "A drill truck parked in a coned-off lane or on a boulevard for one to three days at each spot, daytime only. Some noise from the drill engine. Short lane closures on King Street East.",
      mapFocus: { center: c.highway, zoom: 15.6, pitch: 55, bearing: side(-25), layers: [L.stage2, L.alignment, L.boreholes, L.crossings] },
    },
    {
      id: "set-up",
      title: "Fence the work sites and move utilities",
      plain: `The launch site, ${c.launchName}, and the extraction site, ${c.extractionName}, are fenced with tall hoarding. Site offices, a wheel wash and a power supply go in. Pipes, cables and wires under the shaft footprints are moved out of the way first.`,
      duration: "about 4 to 6 months (assumption)",
      whatResidentsNotice: `Tall hoarding around the sites, lost parking, utility crews digging along nearby streets, and temporary lane shifts. Work hours follow each city's rule. At the launch site in Kitchener: ${NOISE_RULES.kitchener.rule}. At the extraction site in Preston: ${NOISE_RULES.cambridge.rule}.`,
      mapFocus: { center: c.launch, zoom: 16.4, pitch: 60, bearing: side(-40), layers: [L.stage2, L.alignment, L.sites, L.shafts, L.sensitive] },
    },
    {
      id: "shaft",
      title: "Dig the launch shaft",
      plain: `A ring of interlocking concrete piles (secant piles) is drilled into the ground to hold back soil and water. Then the ground inside is dug out, about ${c.launchDepthM} m deep, with steel braces added as it goes down. Pumps lower the groundwater around the shaft and the water is treated before it is discharged. The smaller extraction shaft (about ${c.extractionDepthM} m deep) is built the same way.`,
      duration: "about 6 to 9 months (assumption)",
      whatResidentsNotice: "The loudest stage on site: piling rigs and excavators from 7 am to 7 pm at the Kitchener site; at the Preston shaft, not from 8 pm Saturday to 7 am Monday (Cambridge By-law 32-04). Dump trucks leave through the wheel wash. Pumps that run day and night would need a noise exemption from the City of Kitchener. Vibration is monitored at nearby buildings.",
      mapFocus: { center: c.launch, zoom: 17, pitch: 62, bearing: side(35), layers: [L.stage2, L.alignment, L.shafts, L.sites] },
    },
    {
      id: "launch",
      title: "Lower and launch the boring machines",
      plain: `Two tunnel boring machines, each about ${c.diameterM} m across and well over 100 m long with their trailing gear, arrive in pieces. Big cranes lower the cutterhead and shield into the shaft, where they are put together and pushed off a steel frame into the ground. Behind the cutterhead, the machine lines the tunnel with rings of precast concrete segments.`,
      duration: "about 2 to 3 months (assumption)",
      whatResidentsNotice: "Oversize loads on Highway 401 and Highway 8, usually at night with a police escort. One or two heavy crane lifts that may close a lane for a night. A gantry crane on site that works around the clock once boring starts, which would need a noise exemption from the City of Kitchener outside 7 am to 7 pm.",
      mapFocus: { center: c.launch, zoom: 17.2, pitch: 65, bearing: side(-70), layers: [L.stage2, L.alignment, L.shafts, L.bores] },
    },
    {
      id: "bore",
      title: `Bore ${n0(c.boredLengthM)} m under ${c.crossings.map((x) => (/river/i.test(x) ? `the ${x}` : x)).join(" and ")}`,
      plain: `The two machines bore side by side, ${c.crossings.length ? `passing ${c.coverM.min.toFixed(0)} to ${c.coverM.max.toFixed(0)} m below the surface` : ""}, deeper under ${c.crossings.map((x) => (/river/i.test(x) ? `the ${x}` : x)).join(" and ")}. At about ${SPOIL.advanceMPerDay} m a day each, that is roughly ${sp.boringMonths} months of boring. They dig out about ${n0(sp.inSituM3)} m³ of soil, about ${n0(sp.looseM3)} m³ once loosened: some ${n0(sp.truckloads)} truckloads in all. Settlement is measured at the surface, on the highway and at buildings above the tunnels.`,
      duration: `about ${sp.boringMonths} to ${sp.boringMonths + 4} months (assumption: ${SPOIL.advanceMPerDay} m a day per machine)`,
      whatResidentsNotice: `About ${Math.round(sp.trucksPerDay / 10) * 10} dump trucks a day (an estimate) leave the launch site while both machines run, about ${Math.round(sp.trucksPerHour)} an hour from 7 am to 7 pm (Kitchener's construction-noise hours), heading straight to Highway 8 and Highway 401. Boring itself goes on underground 24 hours a day and is rarely felt above. Spoil is stored on site overnight.`,
      mapFocus: { center: c.middle, zoom: 13.9, pitch: 60, bearing: side(-65), layers: [L.stage2, L.alignment, L.bores, L.shafts, L.crossings, L.sensitive] },
    },
    {
      id: "breakthrough",
      title: "Break through at Preston and link the bores",
      plain: `Each machine breaks through the wall of the extraction shaft and is lifted out in pieces. Between the two bores, ${c.crossPassages} cross-passages are dug by hand-held equipment, no more than 244 m apart, so people can walk from one tunnel to the other in an emergency. Near the river the ground around a cross-passage may be frozen or grouted first to keep water out.`,
      duration: "about 4 to 6 months (assumption)",
      whatResidentsNotice: "Crane lifts at the extraction site in Preston to remove the machines. Cambridge's Noise By-law 32-04 bans heavy equipment there from 8 pm Saturday to 7 am Monday, except in an emergency. Ground-freezing plant may hum day and night for a few weeks. Little else shows above ground.",
      mapFocus: { center: c.extraction, zoom: 16.8, pitch: 60, bearing: side(160), layers: [L.stage2, L.alignment, L.bores, L.crossPassages, L.shafts] },
    },
    {
      id: "restore",
      title: "Fit out, then give the land back",
      plain: "Track, power, signals, ventilation and fire safety systems go in through the shafts. Each shaft becomes an emergency exit, a ventilation building or part of a station entrance. Then the hoarding comes down and the parking lots, streets and trees are put back.",
      duration: "about 12 to 18 months for fit-out and restoration (assumption)",
      whatResidentsNotice: "Fewer trucks. Deliveries of rail and equipment. At the end, new paving, landscaping and a small exit or vent building where each shaft was.",
      mapFocus: { center: c.launch, zoom: 16.2, pitch: 52, bearing: side(20), layers: [L.stage2, L.alignment, L.bores, L.shafts] },
    },
  ];
  return steps.map((s, i) => ({ ...s, n: i + 1 }));
}
