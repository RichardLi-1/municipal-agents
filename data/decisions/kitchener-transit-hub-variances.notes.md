# Kitchener Central Transit Hub minor variances: where the facts are

Pages are 1-based pages of `data/sources/<id>.pages.json`. Budget tables are in $ thousands.

## What is being decided

- City of Kitchener **Committee of Adjustment**, Tue 17 Nov 2026, 10:00 a.m., Council
  Chambers, Kitchener City Hall (`kitchener-cofa-2026-11-17` p1).
- Application **A 2026-070, 50 Victoria Street North** (formerly 490-520 King St W,
  510 King St W, 16, 50 and 60 Victoria St N): six minor variances to Zoning By-law
  2019-051 "to facilitate the development of a the Region of Waterloo's Transit Hub"
  under Site Plan Application SPF26/025/K (`kitchener-cofa-2026-11-17` p1):
  1. surface parking 3 m from the street line (minimum 6 m)
  2. front yard setback 0 m for the first storey (minimum 4.5 m)
  3. landscaped area 13% (minimum 30%)
  4. rear yard landscaped area 4% (minimum 40%)
  5. Floor Space Ratio 0.3 (minimum 0.6)
  6. building length 115 m (maximum 36 m)
- The applicant is the Region of Waterloo's project; the Committee (not Regional
  Council) decides the variances. The same hearing has 10 other applications (pp1-3),
  several about homes: e.g. A 2026-073 duplex with an additional dwelling unit, A
  2026-075 a 10-unit building, B 2026-032 two lots each with a house plus an ADU,
  B 2026-033 Heiman St with 7 + 23 existing units.
- Taking part (`kitchener-cofa-2026-11-17` p1, p3): anyone may speak at the meeting or
  send a written submission; submissions are posted the Friday afternoon before
  (13 Nov) in the online Council and Committee calendar; no written deadline is given;
  livestream at kitchener.ca/watchnow; to be notified of the decision, write to the
  Secretary-Treasurer. Only the applicant, the Minister, a specified person or a public
  body can appeal (p3) — residents cannot appeal a minor variance decision.

## The law the Committee applies (checked on e-Laws, 14 Nov 2026)

- **Four tests, Planning Act s. 45(1)** (`planning-act-s45` p2): the Committee may
  "authorize such minor variance from the provisions of the by-law" that in its opinion is
  (1) **minor**, (2) "desirable for the appropriate development or use of the land,
  building or structure", and keeps (3) the general intent and purpose of the **official
  plan** and (4) of the **zoning by-law** ("the general intent and purpose of the by-law and
  of the official plan, if any, are maintained"). s. 45(1.0.1) (same source) adds any
  prescribed criteria and any criteria the city sets by by-law; none are in our sources.
- **Appeals, s. 45(12)** (`planning-act-s45` p5): only "The applicant, the Minister or a
  specified person or public body that has an interest in the matter may within 20 days of
  the making of the decision" appeal to the Ontario Land Tribunal. The text cites the
  amendment "2022, c. 21, Sched. 9, s. 13 (2)", the More Homes Built Faster Act, 2022
  ("Bill 23"; named in s. 45(12.1), same page). e-Laws lists it in force 28 Nov 2022 (the
  amendment table is hidden in our PDF). "Specified
  person" (s. 1(1), `planning-act-s45` p1) is a closed list: utilities, OPG, Hydro One,
  pipelines, a railway within 300 m, telecom providers, NAV Canada, airports and a few
  others; not neighbours. The notice says the same (`kitchener-cofa-2026-11-17` p3).
- The JSON's appeal deadline (7 Dec 2026) is **estimated**: 20 days after 17 Nov, assuming
  the Committee decides that day (it can defer).
- **Notice timing**: O. Reg. 200/96 s. 3(1) requires notice "At least 10 days before the day
  of the hearing" (`oreg-200-96` p3). The City's notice is dated 30 Oct 2026 ("Dated the 30th
  day of October, 2026.", `kitchener-cofa-2026-11-17` p3; posted "Oct 30, 2026", p1):
  **18 days** before the 17 Nov hearing. The posting date is confirmed; the mailing date to
  neighbours within 60 m (s. 3(2)) is not in our sources.

## The project (transit lens)

- Hub will connect ION light rail and GRT buses, GO Transit rail and bus, VIA Rail and
  intercity buses, with separated cycling and walking paths and transit priority lanes
  (`row-kcth-update-2026` p1-2; `row-kcth-update-2024` p2).
- Status May 2026: design 60% done; **substantial completion expected in 2030**;
  Metrolinx contract award expected fall 2026 (`row-kcth-update-2026` p2). Transit hub
  and related site works targeted for completion by the end of 2031 (p3). Note the two
  different dates.
- Victoria Street, King to Weber: four car lanes to two, adding transit priority lanes
  and cycling/walking space; tender Sept 2026, construction 2027 (`row-kcth-update-2026` p4).
- Rumpel Felt partial demolition, 60 Victoria St N, from about 12 Nov 2026 to late March
  2027; 1913 portion kept; temporary sidewalk and lane closures (`row-kcth-rumpel-notice` p1).
- Network context: GRT Business Plan (`grt-business-plan-2025` p2-3) and LRT to Cambridge
  ("will also support future planned light rail expansion to Cambridge",
  `row-kcth-update-2026` p3).

## Costs (cost lens)

- `row-kcth-update-2026` p5: Phase 1 budget **$35 million** (2026: $2.23M), funded $33M
  province (MTO) + $0.8M development-charge debenture + $1.2M tax-supported debentures;
  Phase 2 budget **$129 million** (2026: $3.3M), funded $42M province + $52M federal
  + $14M development-charge debenture + $21M tax-supported debentures.
  p4: MTO agreement up to $33M (Phase 1: pedestrian bridge and ramp); ICIP Public
  Transit stream $93M federal and provincial (hub, bus loop expansion, plaza).
- `row-2026-budget-book` p87: 90170 KCTH Early Works and 90179 Kitchener Central Transit
  Hub, year by year 2026-2030 (e.g. 90179: 2027 $22,991K, 2028 $59,425K; 10-yr
  $128,566K). p41: 66158 Kitchener Central Canopy Shelter. p177-178: debenture financing.
- `row-kcth-update-2024` p2: Province gave $43M in 2016; p5: a funding shortfall then
  "currently around $9 million".
- **Unknown:** operating and maintenance cost of the hub building and bus loop once open,
  and who pays which share (the 2024 report p5 says the agreement "provides for future
  licence, operations and maintenance agreements"). The GRT Business Plan's operating
  table excludes ION Stage 2 and Kitchener Central Station (`grt-business-plan-2025` p5).

## Commitments and housing

- Region says the hub supports Homes for All, Climate-aligned Growth, Equitable Services
  and a Resilient organization (`row-kcth-update-2026` p1).
- After the hub is built, the Region plans to partner with a private developer on the
  leftover land; "Development opportunities include commercial, and residential
  (including affordable housing)" (`row-kcth-update-2024` p1, p3). No unit numbers or
  dates: an unknown.
