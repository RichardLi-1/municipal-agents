// Sample data for working without the live service. Made up, but shaped like the
// real thing: a Kitchener station-area plan with all four lenses. Shown on screen
// with a "Sample data" badge.
import type {
  AgentEvent,
  Brief,
  Citation,
  CityConfig,
  Decision,
  DecisionCard,
  DecisionDetail,
  Figure,
  LogEntry,
  SourceDoc,
  Statement,
  UsageSummary,
} from "../../../shared/types.ts";

// ---------------------------------------------------------------- pages and citations

const PAGE_TEXT: Record<string, Record<number, string[]>> = {};
const HEADERS: Record<string, string> = {};

function c(sourceId: string, page: number, quote: string): Citation {
  ((PAGE_TEXT[sourceId] ??= {})[page] ??= []).push(quote);
  return { sourceId, page, quote };
}

let sid = 0;
function st(text: string, citations: Citation[], kind: Statement["kind"] = "fact", verified = true): Statement {
  return { id: `s${++sid}`, text, kind, citations, verified };
}

// ---------------------------------------------------------------- city

export const city: CityConfig = {
  id: "waterloo-region",
  name: "Waterloo Region",
  municipalities: ["Kitchener", "Waterloo", "Cambridge", "Region of Waterloo"],
  center: [-80.49, 43.44],
  zoom: 10.6,
  languages: ["en", "fr", "es", "pa", "ar", "zh", "pt", "uk"],
  officialNoticeUrl: "https://www.kitchener.ca/en/council-and-city-administration/notices.aspx",
  clerkContact: "clerks@kitchener.ca, 519-741-2200",
  gtfsUrl: "https://www.regionofwaterloo.ca/opendatadownloads/GRT_GTFS.zip",
  openData: [
    { name: "Grand River Transit GTFS", url: "https://open-data-regionofwaterloo.opendata.arcgis.com/", licence: "Region of Waterloo Open Data Licence" },
    { name: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright", licence: "ODbL" },
    { name: "City of Kitchener Building Permits", url: "https://open-kitchenergis.opendata.arcgis.com/", licence: "Open Government Licence – City of Kitchener" },
  ],
};

// ---------------------------------------------------------------- sources

export const sources: SourceDoc[] = [
  {
    id: "kitchener-dsd-2026-112",
    title: "Fairway Major Transit Station Area: Recommended Land Use and Zoning (DSD-2026-112)",
    publisher: "City of Kitchener",
    url: "https://pub-kitchener.escribemeetings.com/",
    published: "2026-10-27",
    retrieved: "2026-11-12",
    pages: 48,
    licence: "Public record",
    kind: "staff-report",
  },
  {
    id: "kitchener-housing-pledge-q3-2026",
    title: "Building Faster: Housing Pledge Progress, Third Quarter 2026",
    publisher: "City of Kitchener",
    url: "https://www.kitchener.ca/",
    published: "2026-10-15",
    retrieved: "2026-11-12",
    pages: 12,
    licence: "Public record",
    kind: "progress-report",
  },
  {
    id: "grt-2027-business-plan",
    title: "Grand River Transit 2027 Business Plan",
    publisher: "Region of Waterloo",
    url: "https://www.regionofwaterloo.ca/",
    published: "2026-09-30",
    retrieved: "2026-11-12",
    pages: 36,
    licence: "Public record",
    kind: "plan",
  },
  {
    id: "kitchener-dc-study-2026",
    title: "Development Charges Background Study, 2026",
    publisher: "City of Kitchener",
    url: "https://www.kitchener.ca/",
    published: "2026-06-10",
    retrieved: "2026-11-12",
    pages: 142,
    licence: "Public record",
    kind: "budget",
  },
];
for (const s of sources) HEADERS[s.id] = `${s.publisher} — ${s.title}`;

const DSD = "kitchener-dsd-2026-112";
const PLEDGE = "kitchener-housing-pledge-q3-2026";
const GRT = "grt-2027-business-plan";
const DC = "kitchener-dc-study-2026";

// ---------------------------------------------------------------- geometry helpers

function blob(center: [number, number], rKm: number, wobble: number[], n = 28): GeoJSON.Polygon {
  const [lng, lat] = center;
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = rKm * (1 + wobble[i % wobble.length]);
    ring.push([lng + (r / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (r / 110.57) * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

function rand(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const FAIRWAY: [number, number] = [-80.4405, 43.4226];

const fairwayArea: GeoJSON.Feature = {
  type: "Feature",
  properties: { name: "Fairway station area" },
  geometry: blob(FAIRWAY, 0.82, [0.05, 0.12, 0.08, -0.04, -0.1, 0.02, 0.1, 0.16, 0.04, -0.06, -0.12, 0.0, 0.07]),
};

function accessGrid(): GeoJSON.FeatureCollection {
  const r = rand(42);
  const feats: GeoJSON.Feature[] = [];
  const step = 0.0032;
  for (let i = -6; i <= 6; i++)
    for (let j = -6; j <= 6; j++) {
      const lng = FAIRWAY[0] + i * step * 1.38;
      const lat = FAIRWAY[1] + j * step;
      const d = Math.hypot(i * 1.0, j * 1.0);
      if (d > 6.4) continue;
      const east = i > 2 ? 9 : 0;
      const minutes = Math.round(14 + d * 4.2 + east + r() * 8);
      const h = step / 2;
      const w = (step * 1.38) / 2;
      feats.push({
        type: "Feature",
        properties: { minutes, label: `${minutes} min to a hospital` },
        geometry: {
          type: "Polygon",
          coordinates: [[[lng - w, lat - h], [lng + w, lat - h], [lng + w, lat + h], [lng - w, lat + h], [lng - w, lat - h]]],
        },
      });
    }
  return { type: "FeatureCollection", features: feats };
}

const pt = (lng: number, lat: number, props: Record<string, unknown>): GeoJSON.Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Point", coordinates: [lng, lat] },
});

// ---------------------------------------------------------------- the Fairway brief

const summary = [
  st("Kitchener staff propose new rules for the land within about a 10-minute walk of the Fairway ION station.", [
    c(DSD, 1, "recommended land use designations and zoning for the Fairway Major Transit Station Area"),
  ]),
  st("The rules would allow up to 2,400 more homes, mostly in buildings of 8 to 25 storeys near the station.", [
    c(DSD, 4, "permit approximately 2,400 additional dwelling units"),
    c(DSD, 7, "building heights ranging from 8 to 25 storeys"),
  ]),
  st("Fairview Park Mall's parking lots could become new streets, a park of about 1.2 hectares and shops at street level.", [
    c(DSD, 12, "a new public park of approximately 1.2 hectares"),
  ]),
  st("Before anyone builds, the city may need about $86 million of new water pipes, sewers and street work.", [
    c(DC, 44, "Fairway MTSA servicing: $86.2 million (2026 dollars)"),
  ], "estimate"),
  st("Council does not approve any building today. Each project would still need its own site plan and permits.", [
    c(DSD, 14, "does not approve any specific development proposal"),
  ]),
];

const whyNow = [
  st("Ontario requires cities to plan for more homes near major transit stations.", [
    c(DSD, 4, "Provincial Planning Statement requires minimum densities in Major Transit Station Areas"),
  ]),
  st("Kitchener promised the province 35,000 new homes by 2031 and is behind that pace.", [
    c(PLEDGE, 2, "Kitchener's housing pledge of 35,000 new homes by 2031"),
    c(PLEDGE, 5, "below the pace needed to reach the 2031 target"),
  ]),
];

const impacts: Brief["impacts"] = [
  {
    audience: "renter",
    label: "If you rent",
    statements: [
      st("More apartments near the station may give renters more choice, but the plan does not set rents.", [
        c(DSD, 18, "the City cannot require specific rent levels through zoning"),
      ]),
      st("The plan asks builders to make 5% of homes affordable for 25 years in larger buildings, if the province allows it.", [
        c(DSD, 18, "5 per cent of units as affordable housing for a period of 25 years"),
      ], "estimate"),
    ],
  },
  {
    audience: "homeowner",
    label: "If you own your home",
    statements: [
      st("Homes on streets east of Wilson Avenue stay low-rise under the plan.", [
        c(DSD, 7, "lands east of Wilson Avenue are designated Low Rise Residential"),
      ]),
      st("Growth pays for most new pipes through development charges, but some costs may still reach the tax bill.", [
        c(DC, 61, "a portion of growth-related costs is funded from the tax levy"),
      ], "estimate"),
    ],
  },
  {
    audience: "transit-rider",
    label: "If you ride transit",
    statements: [
      st("More people near the station may bring more frequent buses, but Grand River Transit has not committed to that yet.", [
        c(GRT, 17, "service changes for the Fairway area will be reviewed in 2028"),
      ]),
    ],
  },
  {
    audience: "driver",
    label: "If you drive",
    statements: [
      st("New buildings near the station could have fewer parking spaces than today's rules ask for.", [
        c(DSD, 22, "no minimum parking requirement within the MTSA"),
      ]),
      st("Staff expect more traffic on Fairway Road and Wilson Avenue as the area grows.", [
        c(DSD, 22, "increased traffic volumes on Fairway Road and Wilson Avenue"),
      ]),
    ],
  },
  {
    audience: "walk-cycle",
    label: "If you walk or cycle",
    statements: [
      st("New streets through the mall lands would add sidewalks and a protected bike route to the station.", [
        c(DSD, 12, "protected cycling facility connecting to Fairway Station"),
      ]),
    ],
  },
  {
    audience: "business-owner",
    label: "If you run a business",
    statements: [
      st("The plan asks for shops on the ground floor of new buildings along Fairway Road.", [
        c(DSD, 12, "active commercial uses at grade along Fairway Road"),
      ]),
      st("Construction may disrupt access to some stores for several years.", [
        c(DSD, 31, "phased over approximately 15 to 20 years"),
      ], "estimate"),
    ],
  },
  {
    audience: "senior",
    label: "If you are a senior",
    statements: [
      st("The nearest hospital is a 30 to 45 minute bus trip from much of the area, and the plan does not change that.", [
        c(GRT, 9, "travel times to hospitals exceed 30 minutes for most of the Fairway area"),
      ], "estimate"),
    ],
  },
  {
    audience: "parent",
    label: "If you are a parent",
    statements: [
      st("The school board says nearby schools may need portables until a new school is funded.", [
        c(DSD, 31, "portable classrooms may be required until a new school is funded"),
      ]),
    ],
  },
  {
    audience: "disability",
    label: "If you have a disability",
    statements: [
      st("New buildings must meet accessibility rules, and the plan asks for step-free paths to the station.", [
        c(DSD, 12, "barrier-free pedestrian connections to the station platform"),
      ]),
    ],
  },
  {
    audience: "newcomer",
    label: "If you are new to Canada",
    statements: [
      st("You can take part in the public meeting whatever your citizenship status. You can ask for interpretation.", [
        c(DSD, 1, "Interpretation services are available on request"),
      ]),
    ],
  },
];

const haveYourSay = [
  st("The committee meeting on November 23 is the main chance to speak before council decides.", [
    c(DSD, 1, "statutory public meeting under the Planning Act"),
  ]),
  st("If you want to appeal council's decision later, you must speak or write before it decides.", [
    c(DSD, 1, "may not be entitled to appeal the decision"),
  ]),
];

const figures: Figure[] = [
  { id: "f-homes", label: "More homes allowed", value: 2400, unit: "units", display: "2,400", kind: "cited", citation: c(DSD, 4, "permit approximately 2,400 additional dwelling units") },
  { id: "f-height", label: "Tallest buildings", value: 25, unit: "storeys", display: "25 storeys", kind: "cited", citation: c(DSD, 7, "building heights ranging from 8 to 25 storeys") },
  { id: "f-park", label: "New park", value: 1.2, unit: "ha", display: "1.2 ha", kind: "cited", citation: c(DSD, 12, "a new public park of approximately 1.2 hectares") },
  { id: "f-servicing", label: "Pipes, sewers and streets", value: 86_200_000, unit: "CAD", display: "$86 million", kind: "cited", citation: c(DC, 44, "Fairway MTSA servicing: $86.2 million (2026 dollars)") },
];

const tradeoffs = [
  st("More homes near rapid transit can mean fewer car trips, but taller buildings bring shadows and more people to a small area.", [
    c(DSD, 22, "shadow studies will be required for buildings over 12 storeys"),
  ], "tradeoff"),
  st("Removing parking minimums can lower building costs, but may push parking onto nearby streets.", [
    c(DSD, 22, "no minimum parking requirement within the MTSA"),
  ], "tradeoff"),
  st("Some mall stores may close or move while the lands are rebuilt.", [
    c(DSD, 31, "phased over approximately 15 to 20 years"),
  ], "harm"),
  st("If transit service does not grow with the population, crowding on route 7 and ION may get worse.", [
    c(GRT, 17, "service changes for the Fairway area will be reviewed in 2028"),
  ], "harm", false),
];

// Lenses ------------------------------------------------------------------

const years = Array.from({ length: 41 }, (_, i) => 2027 + i);
const capitalProfile: Record<number, number> = { 2027: 18_000_000, 2028: 34_000_000, 2029: 24_200_000, 2030: 10_000_000 };
const series = years.map((year) => {
  const live = year >= 2030;
  return {
    year,
    capital: capitalProfile[year] ?? 0,
    operating: live ? 620_000 : 0,
    maintenance: live ? 1_150_000 : 0,
    renewal: year === 2055 ? 14_500_000 : year === 2062 ? 6_000_000 : 0,
    environmental: live ? 210_000 : 0,
  };
});
const sum = (k: keyof (typeof series)[number]) => series.reduce((a, s) => a + (k === "year" ? 0 : s[k]), 0);
const totals = {
  capital: sum("capital"),
  operating: sum("operating"),
  maintenance: sum("maintenance"),
  renewal: sum("renewal"),
  environmental: sum("environmental"),
  lifecycle: 0,
  perHousehold: 0,
};
totals.lifecycle = totals.capital + totals.operating + totals.maintenance + totals.renewal + totals.environmental;
totals.perHousehold = Math.round(totals.lifecycle / 98_400);

const brief: Brief = {
  decisionId: "fairway-station-area",
  lang: "en",
  generatedAt: "2026-11-13T22:41:00-05:00",
  models: ["gemini-3.6-flash"],
  costUsd: 0.31,
  readingGrade: 7.2,
  summary,
  whyNow,
  impacts,
  haveYourSay,
  figures,
  unknowns: [
    {
      question: "How many of the 2,400 homes will be affordable",
      why: "The 5% rule depends on a provincial approval that has not been given.",
      whoCanAnswer: "Kitchener Planning, Housing Policy team",
      contact: "planning@kitchener.ca",
    },
    {
      question: "When buses will run more often to the station",
      why: "More homes without more buses could crowd route 7 and the ION.",
      whoCanAnswer: "Grand River Transit service planning",
      contact: "transitplanning@regionofwaterloo.ca",
    },
    {
      question: "Who pays if pipe and sewer costs go over the estimate",
      why: "The $86 million estimate is in 2026 dollars and does not include a contingency.",
      whoCanAnswer: "Kitchener Financial Planning",
    },
  ],
  tradeoffs,
  glossary: [
    { term: "Major Transit Station Area (MTSA)", plain: "The land within about 800 m, or a 10-minute walk, of a rapid transit station." },
    { term: "Zoning", plain: "City rules for what can be built on a piece of land: how tall, how big, and for what use." },
    { term: "Development charges", plain: "Fees builders pay the city to help cover new pipes, roads and parks that growth needs." },
    { term: "Site plan", plain: "The detailed drawing of one building project that city staff must approve before a permit." },
  ],
  lenses: {
    transit: {
      feed: {
        name: "Grand River Transit GTFS",
        url: "https://www.regionofwaterloo.ca/opendatadownloads/GRT_GTFS.zip",
        retrieved: "2026-11-12",
        serviceDate: "2026-11-18",
        licence: "Region of Waterloo Open Data Licence",
      },
      scenarios: [
        { id: "weekday-0800", label: "Weekday 8 am", departure: "08:00", day: "weekday" },
        { id: "weekday-2200", label: "Weekday 10 pm", departure: "22:00", day: "weekday" },
        { id: "sunday-0800", label: "Sunday 8 am", departure: "08:00", day: "sunday" },
      ],
      access: [
        ["grocery", [0.94, 0.71, 0.62]],
        ["pharmacy", [0.91, 0.48, 0.55]],
        ["hospital", [0.38, 0.12, 0.09]],
        ["school", [0.97, 0.0, 0.0]],
        ["library", [0.83, 0.31, 0.44]],
        ["community-centre", [0.88, 0.36, 0.41]],
      ].flatMap(([type, shares]) =>
        (["weekday-0800", "weekday-2200", "sunday-0800"] as const).map((scenario, i) => ({
          scenario,
          destinationType: type as string,
          minutesLimit: 45,
          shareReached: (shares as number[])[i],
          originsCounted: 169,
        })),
      ),
      gaps: [
        {
          id: "g1",
          kind: "late-start",
          title: "No bus reaches a hospital by 8:45 am on Sundays from east of Wilson Avenue",
          detail: "The first Sunday trip on route 10 leaves at 8:14 am, and the transfer to route 7 adds 22 minutes.",
          scenario: "sunday-0800",
          peopleAffected: 3100,
          location: [-80.4318, 43.4196],
        },
        {
          id: "g2",
          kind: "early-end",
          title: "Last weekday bus on route 23 leaves Fairway at 10:12 pm",
          detail: "People finishing evening shifts at the mall have no bus home after 10:12 pm.",
          scenario: "weekday-2200",
          peopleAffected: 1800,
          location: [-80.4392, 43.4231],
        },
        {
          id: "g3",
          kind: "first-last-mile",
          title: "Homes south of Fairway Road are more than 800 m from frequent service",
          detail: "About 2,600 people live more than an 800 m walk from a stop with a bus every 15 minutes or better.",
          peopleAffected: 2600,
          location: [-80.4452, 43.4162],
        },
        {
          id: "g4",
          kind: "low-frequency",
          title: "Route 10 runs every 40 minutes on Sundays",
          detail: "Waits over 30 minutes make trips to the pharmacy or grocery store take much longer.",
          scenario: "sunday-0800",
          peopleAffected: 4200,
          location: [-80.4487, 43.4212],
        },
      ],
      fixes: [
        { id: "x1", rank: 1, title: "Start route 10 at 6:30 am on Sundays", benefit: "About 3,100 people could reach a hospital by 8 am on Sundays.", tradeoff: "Costs about 600 more service hours a year, which may come from another route.", estimate: "~$75,000 a year" },
        { id: "x2", rank: 2, title: "Run route 23 until midnight on weekdays", benefit: "Evening workers at the mall get a bus home.", tradeoff: "Late trips carry few riders; cost per rider is high.", estimate: "~$140,000 a year" },
        { id: "x3", rank: 3, title: "On-demand zone south of Fairway Road", benefit: "Covers the 800 m gap without a new fixed route.", tradeoff: "Riders must book ahead; trips can take longer than a regular bus.", estimate: "~$220,000 a year" },
      ],
      layers: {
        access: accessGrid(),
        stops: {
          type: "FeatureCollection",
          features: [
            pt(-80.4392, 43.4231, { name: "Fairway Station (ION)", frequent: true }),
            pt(-80.4465, 43.4196, { name: "Fairway / Manitou", frequent: false }),
            pt(-80.4338, 43.4262, { name: "Wilson / Fairway", frequent: true }),
            pt(-80.4318, 43.4196, { name: "Wilson / Kingsway", frequent: false }),
            pt(-80.4487, 43.4212, { name: "Manitou / Wabanaki", frequent: false }),
            pt(-80.4428, 43.4283, { name: "Fairview Park Mall", frequent: true }),
          ],
        },
        destinations: {
          type: "FeatureCollection",
          features: [
            pt(-80.4401, 43.4248, { name: "Grocery store", type: "grocery" }),
            pt(-80.4421, 43.4252, { name: "Pharmacy", type: "pharmacy" }),
            pt(-80.4451, 43.4105, { name: "Pioneer Park library", type: "library" }),
            pt(-80.4502, 43.4262, { name: "Community centre", type: "community-centre" }),
            pt(-80.4355, 43.4302, { name: "Elementary school", type: "school" }),
          ],
        },
        gaps: {
          type: "FeatureCollection",
          features: [
            pt(-80.4318, 43.4196, { id: "g1", name: "Late Sunday start" }),
            pt(-80.4392, 43.4231, { id: "g2", name: "Early last bus" }),
            pt(-80.4452, 43.4162, { id: "g3", name: "800 m gap" }),
            pt(-80.4487, 43.4212, { id: "g4", name: "40-minute waits" }),
          ],
        },
      },
      method:
        "We used the Grand River Transit timetable for one service day (Wednesday 18 November 2026, and Sunday 22 November) and the Connection Scan Algorithm (Dibbelt et al., 2013) to find the fastest trip from 169 points across the area to the nearest place of each kind, walking up to 800 m at 4.8 km/h to and between stops.",
      limits: [
        "Uses the timetable, not real arrival times. Late buses are not counted.",
        "Destinations come from OpenStreetMap and may be incomplete.",
        "People affected are estimated from 2021 census blocks, not counted directly.",
        "Schools are closed at 10 pm and on Sundays, so 0% there is expected.",
      ],
    },
    cost: {
      asset: "Water, sewer and street upgrades for the Fairway area",
      horizonYears: 40,
      discountRate: 0,
      households: 98_400,
      figures: [
        { id: "c-capital", label: "Upfront building cost", value: 86_200_000, unit: "CAD", display: "$86.2 million", kind: "cited", citation: c(DC, 44, "Fairway MTSA servicing: $86.2 million (2026 dollars)") },
        { id: "c-maint", label: "Maintenance each year", value: 1_150_000, unit: "CAD/yr", display: "$1.15 million a year", kind: "cited", citation: c(DC, 61, "annual maintenance estimated at $1.15 million") },
        { id: "c-oper", label: "Operating each year", value: 620_000, unit: "CAD/yr", display: "$620,000 a year", kind: "cited", citation: c(DC, 61, "operating costs of $620,000 per year") },
        { id: "c-renew", label: "Replacing worn parts (year 2055)", value: 14_500_000, unit: "CAD", display: "$14.5 million", kind: "cited", citation: c(DC, 61, "major renewal of $14.5 million in year 25") },
        { id: "c-env", label: "Emissions from building and running it", value: 1240, unit: "tCO2e/yr", display: "1,240 t CO2e a year", kind: "assumption", formula: "Estimated from similar projects; priced at $170 a tonne." },
        { id: "c-hh", label: "Households in Kitchener", value: 98_400, unit: "households", display: "98,400", kind: "cited", citation: c(DC, 44, "98,400 households") },
      ],
      series,
      totals,
      statements: [
        st("The upfront price is less than half of what these pipes and streets cost over 40 years.", [
          c(DC, 61, "lifecycle costs typically exceed initial capital costs"),
        ], "estimate"),
        st("Builders pay most of the upfront cost through development charges; later upkeep is paid from taxes and water bills.", [
          c(DC, 61, "a portion of growth-related costs is funded from the tax levy"),
        ]),
      ],
      assumptions: [
        { id: "horizonYears", label: "Years counted", value: 40, unit: "years", min: 20, max: 60, step: 5, why: "Pipes and sewers usually last 40 to 80 years." },
        { id: "discountRate", label: "Discount rate", value: 0, unit: "%", min: 0, max: 5, step: 0.5, why: "A discount rate counts future dollars as worth less than today's. 3% follows federal guidance." },
        { id: "maintenancePerYear", label: "Maintenance each year", value: 1_150_000, unit: "CAD", min: 500_000, max: 2_500_000, step: 50_000, why: "The study's estimate. Older pipes cost more to keep up." },
        { id: "capitalOverrun", label: "Cost overrun on construction", value: 0, unit: "%", min: 0, max: 50, step: 5, why: "Large projects often cost more than first estimated." },
        { id: "carbonPrice", label: "Price per tonne of emissions", value: 170, unit: "CAD", min: 0, max: 300, step: 10, why: "Canada's planned carbon price for 2030 is $170 a tonne." },
      ],
    },
    commitments: {
      commitments: [
        {
          id: "k1",
          title: "Build 35,000 new homes in Kitchener by 2031",
          madeBy: "City of Kitchener (housing pledge to Ontario)",
          madeOn: "2023-03-01",
          target: "35,000 homes by 2031",
          status: "behind",
          progress: [
            st("About 9,800 homes have started construction since 2022, about 28% of the target with 55% of the time gone.", [
              c(PLEDGE, 5, "9,812 housing starts since January 2022"),
            ]),
          ],
          unclear: ["How many of the starts are already finished and lived in."],
          relation: "Up to 2,400 more homes would count toward the pledge.",
        },
        {
          id: "k2",
          title: "Cut community greenhouse gas emissions 50% by 2030",
          madeBy: "TransformWR, endorsed by all Waterloo Region councils",
          madeOn: "2021-06-28",
          target: "50% below 2010 levels by 2030",
          status: "behind",
          progress: [
            st("Region-wide emissions were 16% below 2010 levels in the latest count.", [
              c(DSD, 31, "community emissions 16 per cent below 2010 levels"),
            ]),
          ],
          unclear: ["Whether new buildings near the station will be built to net-zero standards."],
          relation: "Homes near rapid transit can cut car trips, but construction itself creates emissions.",
        },
        {
          id: "k3",
          title: "Frequent service within 800 m of most homes",
          madeBy: "Region of Waterloo, Grand River Transit Business Plan",
          madeOn: "2024-01-01",
          target: "75% of homes within 800 m of a bus every 15 minutes by 2030",
          status: "on-track",
          progress: [
            st("71% of homes in the region are within 800 m of frequent service.", [c(GRT, 9, "71 per cent of households")]),
          ],
          unclear: [],
          relation: "Homes south of Fairway Road fall outside this today.",
        },
        {
          id: "k4",
          title: "Open the Fairway transit hub",
          madeBy: "Region of Waterloo",
          madeOn: "2019-06-01",
          target: "Hub open by 2025",
          status: "done",
          progress: [st("The hub opened in 2024.", [c(GRT, 9, "Fairway hub opened in 2024")])],
          unclear: [],
          relation: "The plan builds around the hub.",
        },
        {
          id: "k5",
          title: "Vision Zero: no deaths or serious injuries on city streets",
          madeBy: "City of Kitchener",
          madeOn: "2022-10-01",
          target: "Zero by an unstated year",
          status: "unclear",
          progress: [],
          unclear: ["No target year has been published.", "Collision data for Fairway Road are not broken out."],
          relation: "More people walking near busy Fairway Road raises safety questions.",
        },
      ],
    },
    housing: {
      city: "Kitchener",
      stages: [
        { id: "approved", label: "Approved", units: 18_420, projects: 96, source: "Development applications (open data)", tracked: true },
        { id: "site-plan", label: "Site plan", units: 11_260, projects: 61, source: "Site plan applications (open data)", tracked: true },
        { id: "permit-issued", label: "Permit issued", units: 6_930, projects: 74, source: "Building permits (open data)", tracked: true },
        { id: "under-construction", label: "Under construction", units: null, projects: null, tracked: false },
        { id: "completed", label: "Completed", units: 2_880, projects: 41, source: "Occupancy permits (open data)", tracked: true },
      ],
      timeBetween: [
        { from: "approved", to: "site-plan", medianDays: 214, note: "From council approval to site plan filed" },
        { from: "site-plan", to: "permit-issued", medianDays: 301, note: "Site plan filed to first building permit" },
        { from: "permit-issued", to: "under-construction", medianDays: null, note: "No public record of when building starts" },
        { from: "under-construction", to: "completed", medianDays: null, note: "Can't measure without a start date" },
      ],
      target: { label: "Housing pledge", units: 35_000, by: "2031", citation: c(PLEDGE, 2, "Kitchener's housing pledge of 35,000 new homes by 2031") },
      statements: [
        st("Fewer than 1 in 6 approved homes are finished so far.", [c(PLEDGE, 5, "2,880 units received occupancy")], "fact"),
      ],
      hardToTrack: [
        "There is no public record of when construction actually starts.",
        "Permits are counted by building, not always by number of homes.",
        "Projects that change owners can show up twice.",
      ],
    },
  },
  review: { status: "published", by: "Ana Torres, Planning Communications", at: "2026-11-13T16:20:00-05:00" },
};

// ---------------------------------------------------------------- decisions

const fairway: Decision = {
  id: "fairway-station-area",
  city: "waterloo-region",
  title: "Fairway Major Transit Station Area: Official Plan and Zoning By-law Amendments (DSD-2026-112)",
  plainTitle: "Up to 2,400 new homes around Fairway station",
  decidedBy: "Kitchener City Council",
  status: "in-consultation",
  officialUrl: "https://www.kitchener.ca/en/council-and-city-administration/notices.aspx",
  sources: [DSD, PLEDGE, GRT, DC],
  timeline: [
    { id: "t1", date: "2026-10-27", kind: "report", title: "Staff report published", plain: "City planners published their recommended plan.", citation: c(DSD, 1, "recommended land use designations and zoning for the Fairway Major Transit Station Area") },
    { id: "t2", date: "2026-11-04T18:00:00-05:00", kind: "public-input", title: "Open house at Fairview Park Mall", plain: "Planners showed the maps and took questions.", location: "Fairview Park Mall, lower level" },
    {
      id: "t3",
      date: "2026-11-23T19:00:00-05:00",
      kind: "committee",
      title: "Planning and Strategic Initiatives Committee",
      plain: "Councillors hear from the public and vote on a recommendation. You can speak or write.",
      location: "Council Chamber, Kitchener City Hall, 200 King Street West",
      participation: [
        { method: "speak", instructions: "Register to speak for up to 5 minutes, in person or by video.", deadline: "2026-11-20T12:00:00-05:00", url: "https://www.kitchener.ca/delegations", contact: "delegation@kitchener.ca, 519-741-2200" },
        { method: "write", instructions: "Send a written comment. It becomes part of the public record.", deadline: "2026-11-20T12:00:00-05:00", contact: "clerks@kitchener.ca" },
        { method: "watch", instructions: "Watch the meeting live online.", url: "https://www.youtube.com/@CityofKitchener" },
      ],
      citation: c(DSD, 1, "statutory public meeting under the Planning Act"),
    },
    {
      id: "t4",
      date: "2026-12-07T19:00:00-05:00",
      kind: "council",
      title: "Council decides",
      plain: "Council votes on the plan. Written comments are still accepted until noon that day.",
      location: "Council Chamber, Kitchener City Hall",
      participation: [
        { method: "contact-councillor", instructions: "Tell your ward councillor what you think before the vote.", url: "https://www.kitchener.ca/council" },
        { method: "watch", instructions: "Watch the vote live online.", url: "https://www.youtube.com/@CityofKitchener" },
      ],
    },
    { id: "t5", date: "2027-01-06", kind: "implementation", title: "Rules take effect, unless appealed", plain: "There is a 20-day window to appeal to the Ontario Land Tribunal." },
  ],
  area: { type: "FeatureCollection", features: [fairwayArea] },
  center: FAIRWAY,
  zoom: 14.3,
  lenses: ["transit", "cost", "commitments", "housing"],
  tags: ["housing", "zoning", "ION"],
};

const cambridge: Decision = {
  id: "grt-cambridge-evening-service",
  city: "waterloo-region",
  title: "Grand River Transit 2027 Service Plan: Cambridge Network Changes",
  plainTitle: "Later buses in Cambridge, fewer trips on two quiet routes",
  decidedBy: "Regional Council",
  status: "in-consultation",
  officialUrl: "https://www.grt.ca/",
  sources: [GRT],
  timeline: [
    { id: "c1", date: "2026-10-20", kind: "report", title: "Draft plan released", plain: "Grand River Transit shared the draft changes." },
    {
      id: "c2",
      date: "2026-11-30",
      kind: "public-input",
      title: "Online survey closes",
      plain: "Tell transit planners which trips matter to you.",
      participation: [{ method: "survey", instructions: "Answer a 10-minute survey online or by phone.", deadline: "2026-11-30", url: "https://www.engageregionofwaterloo.ca/", contact: "519-585-7555" }],
    },
    { id: "c3", date: "2027-01-20T13:00:00-05:00", kind: "council", title: "Regional Council decides", plain: "Council votes on the 2027 service plan." },
  ],
  area: {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { name: "Cambridge" }, geometry: blob([-80.318, 43.382], 3.6, [0.1, -0.05, 0.15, 0.05, -0.1, 0.0, 0.2, 0.1, -0.08]) }],
  },
  center: [-80.318, 43.382],
  zoom: 12,
  lenses: ["transit"],
};

const waterlooBudget: Decision = {
  id: "waterloo-2027-budget",
  city: "waterloo-region",
  title: "City of Waterloo 2027 Operating and Capital Budget",
  plainTitle: "Waterloo's 2027 budget: a 3.9% tax increase",
  decidedBy: "Waterloo City Council",
  status: "proposed",
  officialUrl: "https://www.waterloo.ca/",
  sources: [],
  timeline: [
    {
      id: "w1",
      date: "2026-12-02T18:00:00-05:00",
      kind: "public-input",
      title: "Budget public input night",
      plain: "Tell council what you think about the draft budget.",
      participation: [{ method: "speak", instructions: "Register to speak for up to 5 minutes.", deadline: "2026-12-01T12:00:00-05:00" }],
    },
    { id: "w2", date: "2027-01-26T18:00:00-05:00", kind: "budget-vote", title: "Budget vote", plain: "Council votes on the final budget." },
  ],
  area: {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { name: "Waterloo" }, geometry: blob([-80.535, 43.472], 4.2, [0.05, 0.15, -0.05, 0.1, 0.2, -0.1, 0.0, 0.08]) }],
  },
  center: [-80.535, 43.472],
  zoom: 12,
  lenses: ["cost", "commitments"],
};

const library: Decision = {
  id: "kitchener-king-street-bike-lanes",
  city: "waterloo-region",
  title: "King Street East Complete Street: Detailed Design",
  plainTitle: "Protected bike lanes on King Street East",
  decidedBy: "Kitchener City Council",
  status: "decided",
  officialUrl: "https://www.kitchener.ca/",
  sources: [],
  timeline: [{ id: "k1", date: "2026-09-15T19:00:00-04:00", kind: "council", title: "Council approved the design", plain: "Construction starts in spring 2027." }],
  area: {
    type: "Feature",
    properties: { name: "King Street East" },
    geometry: { type: "LineString", coordinates: [[-80.482, 43.447], [-80.47, 43.441], [-80.455, 43.433], [-80.44, 43.428]] },
  },
  center: [-80.462, 43.438],
  zoom: 13.5,
  lenses: [],
};

export const decisions: Decision[] = [fairway, cambridge, waterlooBudget, library];

const cambridgeBrief: Brief = {
  ...brief,
  decisionId: cambridge.id,
  readingGrade: 6.8,
  summary: [
    st("Grand River Transit proposes running buses later in Cambridge, until about midnight on four routes.", [c(GRT, 17, "extend evening service to approximately midnight on Routes 51, 52, 56 and 61")]),
    st("To pay for it, two routes with few riders would run every 60 minutes instead of every 30.", [c(GRT, 17, "reduce frequency on Routes 57 and 63 to 60 minutes")]),
  ],
  whyNow: [],
  impacts: [],
  haveYourSay: [],
  figures: [],
  unknowns: [],
  tradeoffs: [],
  glossary: [],
  lenses: {},
  review: { status: "draft" },
};

export function detail(id: string): DecisionDetail | undefined {
  const d = decisions.find((x) => x.id === id);
  if (!d) return undefined;
  const b = d.id === fairway.id ? brief : d.id === cambridge.id ? cambridgeBrief : undefined;
  return { decision: d, brief: b, sources: sources.filter((s) => d.sources.includes(s.id)) };
}

export function cards(now = Date.now()): DecisionCard[] {
  return decisions.map((d) => {
    const next = d.timeline.find((t) => t.participation?.length && new Date(t.date).getTime() > now);
    const b = detail(d.id)?.brief;
    return {
      id: d.id,
      plainTitle: d.plainTitle,
      decidedBy: d.decidedBy,
      status: d.status,
      next,
      center: d.center,
      reviewStatus: b ? b.review.status : "none",
      lenses: d.lenses,
    };
  });
}

// ---------------------------------------------------------------- page texts

const FILLER = [
  "This report is provided for the information of Council and the public. Figures are rounded and may not add due to rounding.",
  "Staff consulted with the Region of Waterloo, the Waterloo Region District School Board and the Waterloo Catholic District School Board in preparing this section.",
  "Further detail is provided in the attachments to this report, which form part of the public record.",
];

export function pageText(sourceId: string, page: number): string {
  const quotes = PAGE_TEXT[sourceId]?.[page] ?? [];
  const head = HEADERS[sourceId] ?? sourceId;
  const body = quotes.map((q, i) => `${FILLER[i % FILLER.length]} In summary, ${q}. ${FILLER[(i + 1) % FILLER.length]}`);
  if (!body.length) body.push(FILLER.join(" "));
  return `${head}\nPage ${page}\n\n${body.join("\n\n")}`;
}

export const pageTexts = PAGE_TEXT;

// ---------------------------------------------------------------- log, usage

export const usage: UsageSummary = {
  calls: 412,
  inputTokens: 3_812_400,
  outputTokens: 286_900,
  costUsd: 3.84,
  energyWh: 118,
  co2eGrams: 4.1,
  byModel: {
    "gemini-3.6-flash": { calls: 398, inputTokens: 3_640_000, outputTokens: 271_300, costUsd: 3.41 },
    "gemini-3.6-pro": { calls: 14, inputTokens: 172_400, outputTokens: 15_600, costUsd: 0.43 },
  },
  today: { costUsd: 1.27, limitUsd: 5 },
};

export function logEntries(): Omit<LogEntry, "prevHash" | "hash">[] {
  const base = new Date("2026-11-13T21:02:00-05:00").getTime();
  const e: [string, LogEntry["kind"], string | undefined, unknown][] = [
    ["system", "source.added", undefined, { sourceId: DSD, pages: 48 }],
    ["system", "source.added", undefined, { sourceId: PLEDGE, pages: 12 }],
    ["system", "source.added", undefined, { sourceId: GRT, pages: 36 }],
    ["system", "source.added", undefined, { sourceId: DC, pages: 142 }],
    ["staff:ana", "brief.started", fairway.id, { by: "staff:ana" }],
    ["agent:explainer", "statement.recorded", fairway.id, { statementId: "s2", verified: true }],
    ["agent:explainer", "statement.rejected", fairway.id, { reason: "Quote not found on page 9" }],
    ["agent:lifecycle-cost", "statement.recorded", fairway.id, { statementId: "s4", verified: true }],
    ["agent:transit-access", "statement.recorded", fairway.id, { gaps: 4, fixes: 3 }],
    ["agent:lead", "brief.generated", fairway.id, { statements: 41, readingGrade: 7.2 }],
    ["system", "usage", fairway.id, { calls: 37, costUsd: 0.31 }],
    ["staff:ana", "statement.reviewed", fairway.id, { statementId: "s4", action: "edited" }],
    ["staff:ana", "brief.published", fairway.id, { reviewer: "Ana Torres" }],
    ["visitor", "question.asked", fairway.id, { question: "Will my property taxes go up?" }],
    ["agent:lead", "answer.given", fairway.id, { statements: 3, verified: 3 }],
    ["system", "usage", fairway.id, { calls: 6, costUsd: 0.02 }],
    ["agent:translator", "translation.made", fairway.id, { lang: "fr" }],
  ];
  return e.map(([actor, kind, decisionId, payload], i) => ({
    seq: i + 1,
    at: new Date(base + i * 7 * 60_000).toISOString(),
    actor,
    kind,
    decisionId,
    payload,
  }));
}

// ---------------------------------------------------------------- scripted agents

export function askScript(question: string): { wait: number; event: AgentEvent }[] {
  const ans = [summary[3], brief.lenses.cost!.statements[1], impacts[1].statements[1]];
  return [
    { wait: 300, event: { type: "plan", agent: "lead", steps: [
      { id: "p1", specialist: "explainer", question: "What does the plan say about who pays?" },
      { id: "p2", specialist: "lifecycle-cost", question: "What do the new pipes and streets cost over their life?" },
    ] } },
    { wait: 250, event: { type: "step.start", id: "p1", specialist: "explainer", question: "What does the plan say about who pays?" } },
    { wait: 200, event: { type: "step.start", id: "p2", specialist: "lifecycle-cost", question: "What do the new pipes and streets cost over their life?" } },
    { wait: 500, event: { type: "tool", id: "p1", specialist: "explainer", tool: "search_pages", summary: `"tax levy" → 3 pages` } },
    { wait: 450, event: { type: "tool", id: "p2", specialist: "lifecycle-cost", tool: "read_page", summary: "Development Charges Study, p. 44" } },
    { wait: 500, event: { type: "tool", id: "p1", specialist: "explainer", tool: "read_page", summary: "Development Charges Study, p. 61" } },
    { wait: 400, event: { type: "tool", id: "p2", specialist: "lifecycle-cost", tool: "lifecycle_cost", summary: "40 years, 0% discount → $176 million" } },
    { wait: 350, event: { type: "statement", id: "p2", statement: ans[0] } },
    { wait: 300, event: { type: "tool", id: "p1", specialist: "explainer", tool: "record_statement", summary: "Quote found on p. 61 ✓" } },
    { wait: 200, event: { type: "statement", id: "p1", statement: ans[1] } },
    { wait: 300, event: { type: "step.end", id: "p2", specialist: "lifecycle-cost", status: "done", summary: "1 statement, verified" } },
    { wait: 250, event: { type: "step.end", id: "p1", specialist: "explainer", status: "done", summary: "2 statements, verified" } },
    { wait: 600, event: { type: "answer", text: "The plan itself does not raise taxes. Builders pay most of the upfront cost of new pipes and streets through development charges [2]. The city estimates that work at about $86 million [1], and about $176 million over 40 years once upkeep is counted [C1]. Some growth costs may still be paid from property taxes, and the documents don't say how much that would be for one home [3].", statements: ans, figures: [{ id: "fc1", label: "Lifetime cost of the pipes, sewers and streets over 40 years", value: 176_000_000, unit: "CAD", display: "$176 million", kind: "computed", formula: "Upfront cost ($86.2 million) plus operating, maintenance, renewal and emissions each year for 40 years, not discounted.", inputs: ["c-capital", "c-maint", "c-oper", "c-renew"] }] } },
    { wait: 100, event: { type: "usage", calls: 6, inputTokens: 21_400, outputTokens: 1_310, costUsd: 0.018 } },
    { wait: 50, event: { type: "done" } },
  ];
}

export function briefScript(decisionId: string): { wait: number; event: AgentEvent }[] {
  const b = detail(decisionId)?.brief ?? brief;
  const steps = [
    { id: "b1", specialist: "explainer", question: "Summary, who it affects, how to have a say" },
    { id: "b2", specialist: "transit-access", question: "Transit access from the area" },
    { id: "b3", specialist: "lifecycle-cost", question: "Lifetime cost of the servicing" },
    { id: "b4", specialist: "commitments", question: "Commitments this touches" },
    { id: "b5", specialist: "housing-pipeline", question: "Kitchener's housing pipeline" },
  ];
  const ev: { wait: number; event: AgentEvent }[] = [{ wait: 300, event: { type: "plan", agent: "lead", steps } }];
  const tools: Record<string, [string, string][]> = {
    b1: [["search_pages", `"public meeting" → 2 pages`], ["read_page", "DSD-2026-112, p. 1"], ["record_statement", "Quote found on p. 4 ✓"], ["record_statement", "Quote not found on p. 9 ✗"]],
    b2: [["transit_gaps", "169 origins × 3 times → 4 gaps"]],
    b3: [["read_page", "Development Charges Study, p. 44"], ["lifecycle_cost", "40 years → $176 million"]],
    b4: [["commitment_progress", "5 commitments, 2 behind"]],
    b5: [["housing_stages", "5 stages, 1 untracked"]],
  };
  for (const s of steps) ev.push({ wait: 220, event: { type: "step.start", ...s } });
  for (let round = 0; round < 4; round++)
    for (const s of steps) {
      const t = tools[s.id][round];
      if (t) ev.push({ wait: 380, event: { type: "tool", id: s.id, specialist: s.specialist, tool: t[0], summary: t[1] } });
    }
  for (const s of steps)
    ev.push({ wait: 300, event: { type: "step.end", id: s.id, specialist: s.specialist, status: "done", summary: "Statements recorded and checked" } });
  ev.push({ wait: 400, event: { type: "brief", brief: { ...b, review: { status: "draft" } } } });
  ev.push({ wait: 100, event: { type: "usage", calls: 37, inputTokens: 402_000, outputTokens: 31_200, costUsd: 0.31 } });
  ev.push({ wait: 50, event: { type: "done" } });
  return ev;
}
