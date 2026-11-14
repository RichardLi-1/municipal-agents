# Open data used by the lenses

Every dataset the lenses compute from: where it came from, when we downloaded it, and
under what licence. Raw downloads live in `data/cache/` (not committed); this folder
keeps only small derived files.

## Transit

All retrieved 2026-11-14 by `node lenses/transit/fetch.ts` into `data/cache/` (dates kept in
`data/cache/retrieved.json`).

- **Grand River Transit GTFS, buses**, Region of Waterloo (Grand River Transit).
  https://webapps.regionofwaterloo.ca/api/grt-routes/api/staticfeeds/1 (GTFS.zip, files dated
  2026-11-06), linked from GRT's open data page https://www.grt.ca/about-grt/open-data/ through
  https://webapps.regionofwaterloo.ca/api/grt-routes/. Retrieved 2026-11-14. Licence: Region of Waterloo
  Open Data Licence v.2.0 (https://www.regionofwaterloo.ca/government-and-council/transparency-and-accountability/open-data/);
  attribution: "Contains information provided by the Regional Municipality of Waterloo under licence".
  Files used: stops, routes, trips, stop_times, calendar_dates (service 2026-11-09 to 2026-12-20; no
  calendar.txt). 51 bus routes, 2,266 stops.
- **Grand River Transit GTFS, ION light rail (route 301)**, same publisher and licence.
  https://webapps.regionofwaterloo.ca/api/grt-routes/api/staticfeeds/2. Retrieved 2026-11-14. Service
  dates 2026-07-05 to 2028-07-03. (staticfeeds/0 is an older bus feed from February 2026, not used.)
  The lens uses Tuesday 17 November 2026 (weekday) and Sunday 15 November 2026, both covered by the two feeds.
- **Essential destinations**, OpenStreetMap contributors, via one Overpass API query
  (https://overpass-api.de/api/interpreter; query in `lenses/transit/fetch.ts`) over the region's bounding
  box, data as of 2026-11-14T06:31Z. Licence: Open Database Licence (ODbL) 1.0,
  "© OpenStreetMap contributors", https://www.openstreetmap.org/copyright.
  Derived file: **`destinations.geojson`** (626 points inside the region: hospital with an emergency department 3
  (WRHN @ Queen's Blvd., WRHN @ Midtown, Cambridge Memorial Hospital), clinic or doctor 116, pharmacy 106, grocery 111, school 204, college or university 13,
  library 31, community centre 41; WRHN @ Chicopee is kept as `hospital-other` because OSM tags it
  emergency=no). Tags used: amenity=hospital|clinic|doctors|pharmacy|school|college|university|library|community_centre,
  shop=supermarket|grocery|greengrocer, healthcare=hospital|clinic|pharmacy. Two features tagged as
  hospitals that are a dental office and a physiotherapy clinic are counted as clinics. The derived file is
  also under the ODbL.
- **2021 Census population by dissemination area**, Statistics Canada, Census Profile SDMX API:
  https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5..1.1.1?startPeriod=2021
  (characteristic 1, "Population, 2021"; all DAs nationally, filtered to Waterloo Region, census division 3530:
  766 areas, 587,165 people). Retrieved 2026-11-14. Licence: Statistics Canada Open Licence
  (https://www.statcan.gc.ca/en/reference/licence). Adapted from Statistics Canada; this does not
  constitute an endorsement by Statistics Canada.
- **2021 dissemination area boundaries**, Statistics Canada boundary file as served by Esri Canada
  ("Canadian Dissemination Area (DA) Boundaries - 2021"):
  https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/DisseminationAreas/FeatureServer/0,
  queried for DAUID 3530*, simplified to about 30 m. Retrieved 2026-11-14. Licence: Statistics Canada Open
  Licence. (www12.statcan.gc.ca refused scripted downloads, so this mirror was used.)
  Derived file: **`population-da-2021.geojson`**: one point per DA (centroid of its largest part) with its
  2021 population and land area.

## Cost

- **2021 Census private households by dissemination area**, Statistics Canada, Census Profile SDMX
  API, characteristic 5 ("Private dwellings occupied by usual residents"):
  https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5..1.5.1?startPeriod=2021.
  Retrieved 2026-11-14. Licence: Statistics Canada Open Licence. Summed over Waterloo Region's 766
  dissemination areas: 222,426 households. This is the `households` figure in `data/lenses/cost-*.json`.
  Every other cost input is quoted from a page in `data/sources/`.

## Housing

All retrieved 2026-11-14 by `lenses/housing/fetch.ts` into `data/cache/housing/`. The lens
counts from 2022-01-01 (first year of Ontario's 2022–2031 targets) to each dataset's latest date.

- **Building Permits**, City of Kitchener. https://www.arcgis.com/home/item.html?id=c486d37abe2948d884a159cba20bec8c
  (service `services1.arcgis.com/qAo1OsXi67t7XgmS/.../Building_Permits/FeatureServer/0`, updated daily).
  Retrieved 2026-11-14. Licence: Open Government Licence – City of Kitchener (text on the item page).
  Fields: PERMITNO, PERMIT_TYPE, WORK_TYPE, PERMIT_STATUS, APPLICATION_DATE, ISSUE_DATE, FINAL_DATE,
  OCCUPANCY_PERMITTED_DT, UNITS_CREATED, FOLDERNAME, point location. Downloaded permits issued
  2015-01-01 to 2026-10-29 with UNITS_CREATED filled in (35,691 records); lens window 2022-01-01 to 2026-10-29.
- **Planning Applications Active**, City of Kitchener. https://www.arcgis.com/home/item.html?id=b7e2f8feda7340eaa5f4dd7b9c4d5ac0.
  Retrieved 2026-11-14. Licence: Open Government Licence – City of Kitchener. Fields: FOLDERTYPE, STATUS,
  DESCRIPTION, COUNCIL_MEETING_DATE, DRAFT_APPROVAL_DATE, PROP_MAX_RES_UNITS_DA / _INCIR (empty in all
  213 records). Snapshot of the city's active list; lens counts approvals dated 2022-01-01 to 2026-08-24.
- **Application Status Report Site Plan** (CSV), City of Kitchener.
  https://app2.kitchener.ca/appdocs/opendata/AMANDADataSets/Application_Status_Site_Plan.csv.
  Retrieved 2026-11-14. Licence: Open Government Licence – City of Kitchener. Fields: APPLICATION_NO,
  DESCRIPTION, INDATE, STATUS (no unit counts). Lens window: received 2022-01-01 to 2026-11-05.
- **City of Waterloo Building Permits**, City of Waterloo. https://www.arcgis.com/home/item.html?id=9319ff78ff074327acb9e2e084e30b2c
  (service `services.arcgis.com/ZpeBVw5o1kjit7LT/.../City_of_Waterloo_Building_Permits/FeatureServer/0`).
  Retrieved 2026-11-14. Licence: City of Waterloo open data terms (data.waterloo.ca); the item names no
  licence. Fields: PERMIT_NUM, ADDRESS, STATUS, PERMITDESC, WORKDESC, ISSUEDATE, UNITS, LONGITUDE, LATITUDE
  (no completion date). Downloaded permits with UNITS > 0 issued 2015-01-01 onward (2,829 records); lens
  window 2022-01-01 to 2026-11-10.
- **Building Permits**, City of Cambridge (GeoHub). https://www.arcgis.com/home/item.html?id=9093dbbced88444fb61134187737c547
  (service `services5.arcgis.com/LTaPSxJTf948f8sm/.../Building%20Permits/FeatureServer/0`). Retrieved 2026-11-14.
  Licence: City of Cambridge Open Data Licence v2.1 (https://www.cambridge.ca/mayor-city-council-government/open-data/;
  the item itself names no licence). Fields: folder number parts, FOLDERDESC, WORKDESC, STATUSDESC,
  ISSUEDATE, FINALDATE, PROP_NEW_UNITS, address, parcel centroid. Downloaded permits with PROP_NEW_UNITS
  filled in (8,740 records, dataset starts 2016); lens window 2022-01-01 to 2026-11-06.
- **Site Plans**, City of Cambridge (GeoHub). https://www.arcgis.com/home/item.html?id=a73c7cb57adc4384ad1b3765abfa00ff.
  Retrieved 2026-11-14. Licence: City of Cambridge Open Data Licence v2.1. Fields: REFERENCEFILE, STATUSDESC,
  WORKDESC, INDATE (no unit counts). Lens window: received 2022-01-01 to 2026-03-20.
- **Table 34-10-0154-01, CMHC housing starts, under construction and completions in selected census
  metropolitan areas, monthly**, Statistics Canada (data from Canada Mortgage and Housing Corporation).
  https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410015401, via the WDS API
  (getDataFromCubePidCoordAndLatestNPeriods, vectors 42127670, 42127675, 42127680). Retrieved 2026-11-14.
  Licence: Statistics Canada Open Licence. Series: Kitchener-Cambridge-Waterloo CMA, total units: starts,
  under construction, completions, 2021-10 to 2026-09 (lens uses 2022-01 to 2026-09).
- **Ontario's housing supply progress**, Government of Ontario (Ministry of Municipal Affairs and Housing).
  https://data.ontario.ca/dataset/ontario-s-housing-supply-progress. Retrieved 2026-11-14. Licence: Open
  Government Licence – Ontario. Files: "Ontario's housing supply: January – December 2024" and the 2023 file
  (English CSVs). Fields: Municipality, Ten-year housing target, Total housing progress since 2022, Target
  for 2024, Total 2024 housing progress, Housing target status. Gives the 2031 targets (Kitchener 35,000,
  Waterloo 16,000, Cambridge 19,000) and progress 2022 through 2024.
