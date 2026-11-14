/**
 * Neighbourhoods and main streets in Waterloo Region, for the search box.
 * Kept in the page so what people type never leaves their browser.
 */
export const PLACES: { name: string; area: string; at: [number, number] }[] = [
  { name: "Downtown Kitchener", area: "Kitchener", at: [-80.4925, 43.4516] },
  { name: "Uptown Waterloo", area: "Waterloo", at: [-80.5222, 43.4643] },
  { name: "Galt (Downtown Cambridge)", area: "Cambridge", at: [-80.3123, 43.3601] },
  { name: "Hespeler", area: "Cambridge", at: [-80.3093, 43.4325] },
  { name: "Preston", area: "Cambridge", at: [-80.3537, 43.3995] },
  { name: "Fairview", area: "Kitchener", at: [-80.4396, 43.4246] },
  { name: "Fairway Road", area: "Kitchener", at: [-80.4405, 43.4226] },
  { name: "Wilson Avenue", area: "Kitchener", at: [-80.4335, 43.4232] },
  { name: "Mill Courtland", area: "Kitchener", at: [-80.4719, 43.4386] },
  { name: "Victoria Park", area: "Kitchener", at: [-80.4999, 43.4466] },
  { name: "Stanley Park", area: "Kitchener", at: [-80.4545, 43.4589] },
  { name: "Forest Heights", area: "Kitchener", at: [-80.5266, 43.4297] },
  { name: "Doon", area: "Kitchener", at: [-80.4304, 43.3979] },
  { name: "Pioneer Park", area: "Kitchener", at: [-80.4467, 43.4097] },
  { name: "Huron Park", area: "Kitchener", at: [-80.4709, 43.4003] },
  { name: "Laurentian Hills", area: "Kitchener", at: [-80.5012, 43.4205] },
  { name: "Bridgeport", area: "Kitchener", at: [-80.4859, 43.4808] },
  { name: "Grand River Hospital", area: "Kitchener", at: [-80.5135, 43.4569] },
  { name: "Belmont Village", area: "Kitchener", at: [-80.5052, 43.4376] },
  { name: "King Street", area: "Kitchener–Waterloo", at: [-80.4925, 43.4516] },
  { name: "Victoria Street", area: "Kitchener", at: [-80.4987, 43.4585] },
  { name: "Weber Street", area: "Kitchener–Waterloo", at: [-80.4885, 43.4579] },
  { name: "Highland Road", area: "Kitchener", at: [-80.5153, 43.4387] },
  { name: "Ottawa Street", area: "Kitchener", at: [-80.4769, 43.4344] },
  { name: "University of Waterloo", area: "Waterloo", at: [-80.5449, 43.4723] },
  { name: "Wilfrid Laurier University", area: "Waterloo", at: [-80.5265, 43.4738] },
  { name: "Lakeshore", area: "Waterloo", at: [-80.5354, 43.4859] },
  { name: "Beechwood", area: "Waterloo", at: [-80.5546, 43.4612] },
  { name: "Westvale", area: "Waterloo", at: [-80.5737, 43.4524] },
  { name: "Eastbridge", area: "Waterloo", at: [-80.5047, 43.4907] },
  { name: "Columbia Street", area: "Waterloo", at: [-80.5439, 43.4847] },
  { name: "Hespeler Road", area: "Cambridge", at: [-80.3197, 43.3933] },
  { name: "Southwood", area: "Cambridge", at: [-80.3299, 43.3496] },
  { name: "East Galt", area: "Cambridge", at: [-80.2942, 43.3597] },
  { name: "Elmira", area: "Woolwich", at: [-80.5576, 43.5998] },
  { name: "New Hamburg", area: "Wilmot", at: [-80.7076, 43.3801] },
  { name: "Ayr", area: "North Dumfries", at: [-80.4526, 43.2856] },
];

export function searchPlaces(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return PLACES.filter((p) => p.name.toLowerCase().includes(s) || p.area.toLowerCase().startsWith(s))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s)))
    .slice(0, 6);
}

export function km(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Is the point inside the decision's area (Polygon or MultiPolygon features)? */
export function inArea(pt: [number, number], geo: GeoJSON.GeoJSON | undefined): boolean {
  if (!geo) return false;
  const inRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inPoly = (rings: number[][][]) => rings.length > 0 && inRing(rings[0]) && !rings.slice(1).some(inRing);
  switch (geo.type) {
    case "FeatureCollection":
      return geo.features.some((f) => inArea(pt, f));
    case "Feature":
      return inArea(pt, geo.geometry ?? undefined);
    case "Polygon":
      return inPoly(geo.coordinates);
    case "MultiPolygon":
      return geo.coordinates.some(inPoly);
    case "GeometryCollection":
      return geo.geometries.some((g) => inArea(pt, g));
    default:
      return false;
  }
}
