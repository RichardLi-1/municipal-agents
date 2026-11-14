# Construction scout lens

**Illustrative scenario: not a Region plan.** For a line in a decision, the scout finds
candidate work sites for a tunnel launch shaft and an extraction shaft, lays out twin
bores, cross-passages and geotechnical boreholes, and stages the work step by step with
illustrative renders. It ranks candidates by a stated rule. It never picks a site:
engineers and staff evaluate, and people decide.

```
node --env-file=.env lenses/construction/render.ts          # renders (Gemini image model), once
node --env-file=.env lenses/construction/build.ts row-2027-budget
node --test lenses/construction/construction.test.ts
```

Output: `data/lenses/construction-row-2027-budget.json` (`ConstructionLens` in
`shared/types.ts`, plus `numbers` with the inputs behind the steps), renders in
`data/renders/construction-<step>-<hash>.jpg`, and their prompts and model in
`data/renders/construction-renders.json`. Downloads are cached in `data/cache/construction/`.

## The 2027 budget scenario

The Region's 10-year capital forecast includes project 68030 "RT to Cambridge" (ION
Stage 2): $85.0 million in 2027 and $2.05 billion over 10 years (2026 Budget Book, p. 43).
The approved Stage 2 route runs mostly at street level. The scenario asks what it would
take to put the stretch between **Sportsworld and Preston stations** underground. That
stretch crosses Highway 401 and the Speed River, and the ground drops about 35 m into
the river valley at Preston. It is a what-if for engineers, staff and residents to weigh.

## Method

1. **Line.** Region of Waterloo Open Data, *ION Routes* (segments with `Stage2 = LRT` and
   `RouteStatus = Planned`), joined end to end from Fairway. The *ION Stops* layer gives the
   Sportsworld (LRT) and Preston (LRT) stations. The section runs from 120 m past
   Sportsworld to 100 m before Preston. The shafts sit on the line beside the top-ranked
   sites, at most 400 m in from those ends.
2. **Crossings.** OpenStreetMap motorways and rivers that intersect the line.
3. **Candidate sites** (`scout.ts`). One Overpass query covers the stretch plus about 600 m on
   each side. It looks for surface parking (`amenity=parking`, but not underground,
   multi-storey or rooftop parking) and land tagged `landuse=` brownfield, industrial,
   commercial, retail, railway, greenfield or grass. Land tagged `landuse=construction` is
   left out because it is usually someone else's project. A site is ruled out if its
   centre falls in a park, wetland, water, wood, cemetery, residential area, school,
   hospital or care home. A retail or commercial parcel that contains a parking lot is
   replaced by the lot. Open area is the polygon minus the buildings inside it. The role
   comes from the site's position along the line: launch near the west end, extraction
   near the east end, and laydown in between.
4. **Score, 0 to 100** (weights shown in the lens and the panel):
   | Factor | Weight | Full marks | None |
   |---|---|---|---|
   | Open area fits the role | 25 | launch 1.5 ha, extraction 0.45 ha, laydown 0.3 ha | launch 0.4 ha, extraction 0.15 ha, laydown 0.1 ha |
   | Distance to the line | 25 | 30 m or less | 400 m or more |
   | Buffer from homes, schools, care homes, hospitals, parks, rivers | 20 | 250 m or more | 30 m or less |
   | Distance to a motorway, trunk or primary road | 15 | 100 m or less | 1 km or more |
   | Ease of taking over the land | 15 | brownfield 1.0, parking 0.85, greenfield 0.65, grass 0.6, railway 0.6, industrial 0.45, commercial and retail 0.35 | |

   Each site gets plain-words reasons and concerns (floodplain, contamination, owners,
   utilities).
5. **Layout** (`layout.ts`, rules in `RULES`):
   - TBM diameter 6.5 m, typical for light rail. Metrolinx's Eglinton Crosstown machines
     were about that size. Bores sit 7.5 m either side of the line (15 m centre to centre).
   - Crown cover: at least 2 diameters (13 m), 2.5 diameters (16.3 m) under Highway 401, and
     2 diameters below the riverbed under the Speed River. The riverbed is assumed to be 3 m
     below the water surface in the elevation model.
   - Grades no steeper than 4% (assumption). The profile is the shallowest one that meets the
     cover rules within that grade: `crown(x) = min_j(required_j + 0.04·|x − x_j|)`.
   - Cross-passages are evenly spaced and **no more than 244 m (800 ft) apart**, per
     NFPA 130, *Standard for Fixed Guideway Transit and Passenger Rail Systems*.
   - Geotechnical boreholes go every ~75 m along the line, 3 at each shaft, and 2 on each
     side of each crossing. FHWA-NHI-10-034, *Technical Manual for Design and Construction of
     Road Tunnels — Civil Elements* (FHWA, 2009), s. 3.5.2.1, p. 3-16, says: "In general,
     borings should be extended to at least 1.5 tunnel diameters below the proposed tunnel
     invert" and "Borings at shafts should extend at least 1.5 times the depth of the shaft".
     Both rules are applied. The 75 m spacing is a planning assumption: the guide's Table 3-4
     (after AASHTO, 1988) gives 50 to 100 ft (15 to 30 m) for soft ground in adverse
     conditions and 300 to 500 ft (90 to 150 m) in favourable conditions. Boreholes are
     drilled between the bores, so no grouted hole sits in a machine's path.
   - Ground levels come from NRCan's CDEM altitude service, sampled every 50 m and at each crossing.
   - Shaft boxes (assumed): launch 45 × 24 m, extraction 22 × 24 m. Each floor sits 2 m below
     the invert.
6. **Steps** (`steps.ts`): 7 steps with plain words, an assumed duration, what residents
   would notice, and a map camera. Work hours follow each city's noise rule (`NOISE_RULES`).
   Kitchener, where the launch site is, allows construction noise from 7 am to 7 pm, seven
   days a week (City of Kitchener, *Noise complaints and exemptions*). Cambridge, where the
   extraction site is in Preston, has By-law 32-04, s. 2 (b): no noise from material
   handling equipment from 8 pm Saturday to 7 am Monday, except in an emergency. Spoil estimate: bore volume π(D/2)²L for each bore,
   bulking 1.3, 10 m³ per truck, 12 m a day per machine, two machines, trucks leaving
   7 am to 7 pm.
7. **Renders** (`render.ts`): one per step from `gemini-3.1-flash-image`, falling back to
   `gemini-3-pro-image` and then `nano-banana-pro-preview`. 16:9 at 1K, resized to 1600 px
   and saved as JPEG under 350 KB. The style prompt asks for clean public-information
   illustration with no text or logos. Spend is capped at US$1.50 and logged in
   `data/cache/construction/render-spend.json`. This build cost about $0.64: 8 images,
   including one regeneration.

## Data sources and licences

- Region of Waterloo Open Data, *ION Routes* (OpenData MapServer layer 6) and *ION Stops*
  (layer 5). Region of Waterloo Open Data Licence v.2.0.
- OpenStreetMap via the Overpass API (overpass.kumi.systems, overpass-api.de).
  © OpenStreetMap contributors, Open Database Licence (ODbL) 1.0.
- Natural Resources Canada, Canadian Digital Elevation Model, altitude service
  (geogratis.gc.ca/services/elevation/cdem/altitude). Open Government Licence – Canada.
- Region of Waterloo, 2026 Plan and Budget (Budget Book), p. 43 (project 68030).
- City of Kitchener, Noise complaints and exemptions (kitchener.ca). City of Cambridge,
  By-law 32-04 (Noise By-law), cambridge.ca/media/1gvdnrdg/noise-by-law-032-04.pdf.
- Ontario Regulation 231/08, Transit and Rail Project Assessment Process, s. 15 (addendum
  after the statement of completion). Region of Waterloo, Stage 2 ION Notice of Completion
  of Environmental Project Report (review April 6 to May 6, 2021).

## Limits

- A scenario only. The Region has not proposed a tunnel here.
- Approvals: Stage 2 went through the Transit Project Assessment Process, and its
  Environmental Project Report was completed in 2021. A tunnel would be a change that is
  inconsistent with that report. It would need an addendum under O. Reg. 231/08 s. 15 (1).
  If the change is significant, it would also need a public notice with 30 days for written
  objections to the Minister (s. 15 (3) and (12)).
- The 75 m borehole spacing is an assumption that a geotechnical engineer would set.
- No geotechnical data. Soil, rock and groundwater stay unknown until boreholes are drilled.
- No utilities data. Pipes, cables and the Highway 401 bridge foundations are not mapped.
- No property ownership data. OpenStreetMap tags can be out of date.
- Distances are straight lines, not truck routes.
- Elevations come from a ~20 m national model rounded to 1 m. The riverbed depth is assumed.
- Durations, advance rate, bulking and truck size are typical assumptions, not a schedule.
  Cost is not estimated.
- Portals, ramps and stations are not designed.
- Renders are illustrations. They show the kind of work, not a design.
