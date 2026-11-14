// Downloads the housing lens's raw public data into data/cache/housing/ (gitignored).
// Usage: node lenses/housing/fetch.ts
// Everything downloaded is treated as data only: parsed as JSON/CSV, never executed.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CMHC_SERIES, DATASETS } from "./sources.ts";

export const CACHE_DIR = join(import.meta.dirname, "..", "..", "data", "cache", "housing");
const UA = { "User-Agent": "municipal-agents-housing-lens/0.1 (civic hackathon; open data)" };

async function getJson(url: string, init?: RequestInit): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

/** Pages through an ArcGIS feature layer query. Returns the raw features. */
async function arcgisAll(layerUrl: string, params: Record<string, string>, pageSize = 1000): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const qs = new URLSearchParams({
      f: "json",
      outSR: "4326",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      ...params,
    });
    const j = await getJson(`${layerUrl}/query?${qs}`);
    if (j.error) throw new Error(`ArcGIS error from ${layerUrl}: ${JSON.stringify(j.error)}`);
    const feats: any[] = j.features ?? [];
    out.push(...feats);
    if (feats.length === 0 || (!j.exceededTransferLimit && feats.length < pageSize)) break;
  }
  return out;
}

async function save(file: string, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  await writeFile(join(CACHE_DIR, file), text);
  console.log(`  wrote ${file} (${(text.length / 1024).toFixed(0)} KB)`);
}

export async function fetchAll() {
  await mkdir(CACHE_DIR, { recursive: true });
  const retrieved = new Date().toISOString();
  const manifest: Record<string, { url: string; retrieved: string; records?: number }> = {};

  // Kitchener building permits that record units created, issued 2015 onward.
  {
    const d = DATASETS.kitchenerPermits;
    console.log(d.name);
    const feats = await arcgisAll(d.endpoint, {
      where: "ISSUE_DATE >= DATE '2015-01-01' AND UNITS_CREATED IS NOT NULL",
      outFields:
        "OBJECTID,PERMITNO,PERMIT_TYPE,PERMIT_STATUS,APPLICATION_DATE,ISSUE_DATE,FINAL_DATE,OCCUPANCY_PERMITTED_DT,WORK_TYPE,SUB_WORK_TYPE,UNITS_CREATED,UNITS_LOST,UNITS_NET_CHANGE,FOLDERNAME",
      returnGeometry: "true",
    });
    await save(d.file, feats);
    manifest[d.id] = { url: d.endpoint, retrieved, records: feats.length };
  }

  // Waterloo building permits with a unit count, issued 2015 onward.
  {
    const d = DATASETS.waterlooPermits;
    console.log(d.name);
    const feats = await arcgisAll(d.endpoint, {
      where: "UNITS > 0 AND ISSUEDATE >= DATE '2015-01-01'",
      outFields:
        "OBJECTID,PERMIT_NUM,ADDRESS,ISSUE_YEAR,STATUS,PERMITTYPE,PERMITDESC,SUBDESC,WORKDESC,ISSUEDATE,UNITS,LONGITUDE,LATITUDE",
      returnGeometry: "false",
    });
    await save(d.file, feats);
    manifest[d.id] = { url: d.endpoint, retrieved, records: feats.length };
  }

  // Cambridge building permits with proposed new units (dataset starts 2016). Polygons: ask for centroids only.
  {
    const d = DATASETS.cambridgePermits;
    console.log(d.name);
    const feats = await arcgisAll(d.endpoint, {
      where: "PROP_NEW_UNITS IS NOT NULL",
      outFields:
        "OBJECTID,HOUSE_NUMBER,STREET_NAME,FOLDERYEAR,FOLDERSEQUENCE,FOLDERSECTION,FOLDERREVISION,FOLDERDESC,STATUSDESC,ISSUEDATE,FINALDATE,SUBDESC,WORKDESC,PROP_NEW_UNITS,NEW_SS_SUITE",
      returnGeometry: "false",
      returnCentroid: "true",
    });
    await save(d.file, feats);
    manifest[d.id] = { url: d.endpoint, retrieved, records: feats.length };
  }

  // Cambridge site plans (status snapshot, no unit counts).
  {
    const d = DATASETS.cambridgeSitePlans;
    console.log(d.name);
    const feats = await arcgisAll(d.endpoint, {
      where: "1=1",
      outFields: "OBJECTID,REFERENCEFILE,STATUSDESC,PROPHOUSE,PROPSTREET,PROPSTREETTYPE,PROP_LAND_USE,SUBDESC,WORKDESC,INDATE",
      returnGeometry: "false",
    });
    await save(d.file, feats);
    manifest[d.id] = { url: d.endpoint, retrieved, records: feats.length };
  }

  // Kitchener active planning applications (zoning, official plan, subdivision).
  {
    const d = DATASETS.kitchenerPlanningApps;
    console.log(d.name);
    const feats = await arcgisAll(d.endpoint, {
      where: "1=1",
      outFields:
        "OBJECTID,APPLICATION_NO,FOLDERTYPE,SUBTYPE,STATUS,PUBLIC_STATUS_DESC,DESCRIPTION,INDATE,DRAFT_APPROVAL_DATE,COUNCIL_MEETING_DATE,FINAL_DATE,PROP_MAX_RES_UNITS_INCIR,PROP_MAX_RES_UNITS_DA,ADDRESS",
      returnGeometry: "false",
    });
    await save(d.file, feats);
    manifest[d.id] = { url: d.endpoint, retrieved, records: feats.length };
  }

  // Kitchener site plan status report (CSV).
  {
    const d = DATASETS.kitchenerSitePlans;
    console.log(d.name);
    const csv = await getText(d.endpoint);
    await save(d.file, csv);
    manifest[d.id] = { url: d.endpoint, retrieved };
  }

  // CMHC starts / under construction / completions for the Kitchener-Cambridge-Waterloo CMA, last 60 months.
  {
    const d = DATASETS.cmhc;
    console.log(d.name);
    const body = CMHC_SERIES.map((s) => ({ productId: 34100154, coordinate: s.coordinate, latestN: 60 }));
    const j = await getJson(d.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await save(d.file, j);
    manifest[d.id] = { url: d.endpoint, retrieved };
  }

  // Ontario housing supply progress: the dataset record plus every English CSV in it.
  {
    const d = DATASETS.ontarioProgress;
    console.log(d.name);
    const pkg = await getJson(d.endpoint);
    const resources: any[] = pkg?.result?.resources ?? [];
    const csvs: { name: string; url: string; text: string }[] = [];
    for (const r of resources) {
      if (String(r.format).toUpperCase() !== "CSV" || !/_en\.csv$/i.test(String(r.url))) continue;
      csvs.push({ name: String(r.name), url: String(r.url), text: await getText(String(r.url)) });
    }
    await save(d.file, { package: { title: pkg?.result?.title, metadata_modified: pkg?.result?.metadata_modified }, csvs });
    manifest[d.id] = { url: d.page, retrieved, records: csvs.length };
  }

  await save("manifest.json", manifest);
}

if (import.meta.main) {
  await fetchAll();
}
