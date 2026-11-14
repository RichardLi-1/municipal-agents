// The public datasets the housing lens reads. One place for URLs, publishers and
// licences, so fetch.ts, build.ts and the open-data record agree.

export interface HousingDataset {
  id: string;
  name: string;
  publisher: string;
  /** Human page (portal item or dataset page). */
  page: string;
  /** What fetch.ts actually calls. */
  endpoint: string;
  licence: string;
  /** File name under data/cache/housing/. */
  file: string;
}

const KITCHENER_LICENCE = "Open Government Licence – City of Kitchener (licence text on the item page)";
const CAMBRIDGE_LICENCE =
  "City of Cambridge Open Data Licence v2.1 (https://www.cambridge.ca/mayor-city-council-government/open-data/)";
const WATERLOO_LICENCE =
  "City of Waterloo open data terms (data.waterloo.ca); the portal item itself names no licence";

export const DATASETS = {
  kitchenerPermits: {
    id: "kitchener-building-permits",
    name: "Building Permits (City of Kitchener)",
    publisher: "City of Kitchener",
    page: "https://www.arcgis.com/home/item.html?id=c486d37abe2948d884a159cba20bec8c",
    endpoint:
      "https://services1.arcgis.com/qAo1OsXi67t7XgmS/arcgis/rest/services/Building_Permits/FeatureServer/0",
    licence: KITCHENER_LICENCE,
    file: "kitchener-permits.json",
  },
  kitchenerPlanningApps: {
    id: "kitchener-planning-applications-active",
    name: "Planning Applications Active (City of Kitchener)",
    publisher: "City of Kitchener",
    page: "https://www.arcgis.com/home/item.html?id=b7e2f8feda7340eaa5f4dd7b9c4d5ac0",
    endpoint:
      "https://services1.arcgis.com/qAo1OsXi67t7XgmS/arcgis/rest/services/Planning_Applications_Active/FeatureServer/0",
    licence: KITCHENER_LICENCE,
    file: "kitchener-planning-applications.json",
  },
  kitchenerSitePlans: {
    id: "kitchener-site-plan-status",
    name: "Application Status Report Site Plan (City of Kitchener)",
    publisher: "City of Kitchener",
    page: "https://app2.kitchener.ca/appdocs/opendata/AMANDADataSets/Application_Status_Site_Plan.csv",
    endpoint: "https://app2.kitchener.ca/appdocs/opendata/AMANDADataSets/Application_Status_Site_Plan.csv",
    licence: KITCHENER_LICENCE,
    file: "kitchener-site-plans.csv",
  },
  waterlooPermits: {
    id: "waterloo-building-permits",
    name: "City of Waterloo Building Permits",
    publisher: "City of Waterloo",
    page: "https://www.arcgis.com/home/item.html?id=9319ff78ff074327acb9e2e084e30b2c",
    endpoint:
      "https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/City_of_Waterloo_Building_Permits/FeatureServer/0",
    licence: WATERLOO_LICENCE,
    file: "waterloo-permits.json",
  },
  cambridgePermits: {
    id: "cambridge-building-permits",
    name: "Building Permits (City of Cambridge GeoHub)",
    publisher: "City of Cambridge",
    page: "https://www.arcgis.com/home/item.html?id=9093dbbced88444fb61134187737c547",
    endpoint:
      "https://services5.arcgis.com/LTaPSxJTf948f8sm/arcgis/rest/services/Building%20Permits/FeatureServer/0",
    licence: CAMBRIDGE_LICENCE,
    file: "cambridge-permits.json",
  },
  cambridgeSitePlans: {
    id: "cambridge-site-plans",
    name: "Site Plans (City of Cambridge GeoHub)",
    publisher: "City of Cambridge",
    page: "https://www.arcgis.com/home/item.html?id=a73c7cb57adc4384ad1b3765abfa00ff",
    endpoint: "https://services5.arcgis.com/LTaPSxJTf948f8sm/arcgis/rest/services/SitePlans/FeatureServer/0",
    licence: CAMBRIDGE_LICENCE,
    file: "cambridge-site-plans.json",
  },
  cmhc: {
    id: "statcan-34-10-0154",
    name:
      "Table 34-10-0154-01: CMHC housing starts, under construction and completions in selected census metropolitan areas, monthly",
    publisher: "Statistics Canada (data from Canada Mortgage and Housing Corporation)",
    page: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410015401",
    endpoint: "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromCubePidCoordAndLatestNPeriods",
    licence: "Statistics Canada Open Licence",
    file: "statcan-34100154.json",
  },
  ontarioProgress: {
    id: "ontario-housing-supply-progress",
    name: "Ontario's housing supply progress",
    publisher: "Government of Ontario (Ministry of Municipal Affairs and Housing)",
    page: "https://data.ontario.ca/dataset/ontario-s-housing-supply-progress",
    endpoint: "https://data.ontario.ca/api/3/action/package_show?id=ontario-s-housing-supply-progress",
    licence: "Open Government Licence – Ontario",
    file: "ontario-progress.json",
  },
} satisfies Record<string, HousingDataset>;

/** Statistics Canada 34-10-0154 coordinates: geography 7 = Kitchener-Cambridge-Waterloo CMA, type 1 = total units. */
export const CMHC_SERIES = [
  { key: "starts", coordinate: "7.1.1.0.0.0.0.0.0.0" },
  { key: "underConstruction", coordinate: "7.2.1.0.0.0.0.0.0.0" },
  { key: "completions", coordinate: "7.3.1.0.0.0.0.0.0.0" },
] as const;

/** Start of every count window: the first year of Ontario's 2022-2031 housing targets. */
export const WINDOW_START = "2022-01-01";

export const CITIES = ["kitchener", "waterloo", "cambridge"] as const;
export type CityId = (typeof CITIES)[number];
