import type { FloodZone, LngLat, ZoneRegion } from "../types/flood";

const manualDisplayRegionLimitByCountryCode: Partial<Record<string, number>> = {
  DE: 8,
  ES: 8,
  FR: 8,
  IT: 8,
  PL: 8,
  RO: 8,
  UK: 6,
};

const priorityRegionTermsByCountryCode: Partial<Record<string, string[]>> = {
  DE: ["dortmund", "munster", "muenster", "dusseldorf", "koln", "cologne", "aachen", "bonn", "ahrweiler"],
  RO: ["bucuresti", "ialomita", "bacau", "buzau", "galati", "vrancea", "cluj", "timis"],
  UK: ["england", "scotland", "wales", "northern ireland"],
};

interface AggregateRegionSeed {
  label: string;
  anchor: [number, number];
}

export interface DisplayRegionGroup extends ZoneRegion {
  memberRegionIds: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function getStringHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeRegionText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss")
    .replace(/\u00e6/g, "ae")
    .replace(/\u00f8/g, "o")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function getRegionPolygons(region: ZoneRegion): LngLat[][][] {
  if (region.geometry?.type === "Polygon") {
    return [region.geometry.coordinates];
  }
  if (region.geometry?.type === "MultiPolygon") {
    return region.geometry.coordinates;
  }
  return region.polygon.length >= 3 ? [[region.polygon]] : [];
}

function ringAreaProxy(ring: LngLat[]): number {
  if (ring.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const latitudeScale = Math.cos((((current[1] + next[1]) / 2) * Math.PI) / 180);
    area += (current[0] * latitudeScale * next[1]) - (next[0] * latitudeScale * current[1]);
  }

  return Math.abs(area / 2);
}

function polygonAreaProxy(polygon: LngLat[][]): number {
  const [outerRing, ...innerRings] = polygon;
  if (!outerRing) {
    return 0;
  }

  const outerArea = ringAreaProxy(outerRing);
  const innerArea = innerRings.reduce((sum, ring) => sum + ringAreaProxy(ring), 0);
  return Math.max(outerArea - innerArea, 0);
}

function geometryAreaProxy(region: ZoneRegion): number {
  const area = getRegionPolygons(region).reduce((sum, polygon) => sum + polygonAreaProxy(polygon), 0);
  return Math.max(area, 0.0004);
}

function getRepresentativePolygon(region: ZoneRegion): LngLat[] {
  const polygons = getRegionPolygons(region);
  const largestPolygon = polygons.reduce<LngLat[] | null>((largest, polygon) => {
    const exteriorRing = polygon[0] ?? [];
    if (!largest || ringAreaProxy(exteriorRing) > ringAreaProxy(largest)) {
      return exteriorRing;
    }
    return largest;
  }, null);

  return largestPolygon ?? region.polygon;
}

function getRegionPriorityTerms(zone: FloodZone): string[] {
  const terms = [
    ...(priorityRegionTermsByCountryCode[zone.countryCode] ?? []),
    ...zone.regions.map((region) => region.name),
    ...zone.majorIncidents.map((incident) => incident.affectedRegion),
  ];

  return [...new Set(terms.map(normalizeRegionText).filter(Boolean))];
}

function getRegionRelevanceScore(region: ZoneRegion, priorityTerms: string[]): number {
  const regionName = normalizeRegionText(region.name);
  return priorityTerms.reduce((score, term) => {
    if (regionName === term) {
      return score + 120;
    }
    if (regionName.includes(term) || term.includes(regionName)) {
      return score + 70;
    }
    return score;
  }, 0);
}

function getAggregateRegionSeeds(count: number): AggregateRegionSeed[] {
  if (count <= 3) {
    return [
      { label: "Northern", anchor: [0.5, 0.9] },
      { label: "Central", anchor: [0.5, 0.5] },
      { label: "Southern", anchor: [0.5, 0.1] },
    ];
  }

  if (count === 4) {
    return [
      { label: "Northern", anchor: [0.5, 0.9] },
      { label: "Western", anchor: [0.15, 0.5] },
      { label: "Eastern", anchor: [0.85, 0.5] },
      { label: "Southern", anchor: [0.5, 0.1] },
    ];
  }

  if (count === 5) {
    return [
      { label: "Northern", anchor: [0.5, 0.9] },
      { label: "Western", anchor: [0.15, 0.5] },
      { label: "Central", anchor: [0.5, 0.5] },
      { label: "Eastern", anchor: [0.85, 0.5] },
      { label: "Southern", anchor: [0.5, 0.1] },
    ];
  }

  const seeds: AggregateRegionSeed[] = [
    { label: "North-Western", anchor: [0.2, 0.82] },
    { label: "North-Eastern", anchor: [0.8, 0.82] },
    { label: "Western", anchor: [0.15, 0.48] },
    { label: "Central", anchor: [0.5, 0.5] },
    { label: "Eastern", anchor: [0.85, 0.48] },
    { label: "Southern", anchor: [0.5, 0.14] },
  ];
  return seeds.slice(0, count);
}

function getRegionsBounds(
  regions: ZoneRegion[],
): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  const points = regions.flatMap((region) => getRegionPolygons(region).flatMap((polygon) => polygon[0] ?? []));
  if (points.length === 0) {
    return { minLon: -1, maxLon: 1, minLat: -1, maxLat: 1 };
  }

  return points.reduce(
    (bounds, [lon, lat]) => ({
      minLon: Math.min(bounds.minLon, lon),
      maxLon: Math.max(bounds.maxLon, lon),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    {
      minLon: points[0][0],
      maxLon: points[0][0],
      minLat: points[0][1],
      maxLat: points[0][1],
    },
  );
}

function normalizeRegionCenter(
  region: ZoneRegion,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
): [number, number] {
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.0001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);

  return [
    clamp((region.center[0] - bounds.minLon) / lonSpan, 0, 1),
    clamp((region.center[1] - bounds.minLat) / latSpan, 0, 1),
  ];
}

function squaredDistance(left: [number, number], right: [number, number]): number {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  return dx * dx + dy * dy;
}

function getAggregatedGeometry(regions: ZoneRegion[]): ZoneRegion["geometry"] | undefined {
  const polygons = regions.flatMap((region) => getRegionPolygons(region));
  if (polygons.length === 0) {
    return undefined;
  }

  if (polygons.length === 1) {
    return {
      type: "Polygon",
      coordinates: polygons[0],
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: polygons,
  };
}

function getAggregatedCenter(regions: ZoneRegion[]): LngLat {
  const weightedRegions = regions.map((region) => ({
    region,
    weight: geometryAreaProxy(region),
  }));
  const totalWeight = weightedRegions.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return regions[0]?.center ?? [0, 0];
  }

  const [weightedLon, weightedLat] = weightedRegions.reduce(
    (totals, item) => [
      totals[0] + item.region.center[0] * item.weight,
      totals[1] + item.region.center[1] * item.weight,
    ],
    [0, 0] as LngLat,
  );

  return [
    Number((weightedLon / totalWeight).toFixed(6)),
    Number((weightedLat / totalWeight).toFixed(6)),
  ];
}

function buildRegionalHistory(
  regionName: string,
  regionId: string,
  baselineRisk: number,
  estimatedLoss: number,
) {
  const hash = getStringHash(regionId);
  const firstEventYear = 2003 + (hash % 11);
  const secondEventYear = 2015 + (hash % 9);

  const firstEventLoss = roundToOneDecimal(estimatedLoss * (0.72 + baselineRisk / 200));
  const secondEventLoss = roundToOneDecimal(estimatedLoss * (0.58 + baselineRisk / 210));

  return [
    {
      id: `${regionId}-hist-1`,
      title: `${regionName} river flood`,
      eventDate: `${firstEventYear}-05-14`,
      estimatedLossEurMillions: firstEventLoss,
      peakWaterLevelM: roundToOneDecimal(1.2 + baselineRisk * 0.028),
      summary: "Recorded high river discharge and floodplain overflow across administrative settlements.",
    },
    {
      id: `${regionId}-hist-2`,
      title: `${regionName} flash flooding`,
      eventDate: `${secondEventYear}-09-22`,
      estimatedLossEurMillions: secondEventLoss,
      peakWaterLevelM: roundToOneDecimal(0.9 + baselineRisk * 0.025),
      summary: "Short-duration high-intensity precipitation impacted urban and peri-urban drainage basins.",
    },
  ];
}

function getDisplayRegionLimit(countryCode: string, candidateCount: number): number {
  const manualLimit = manualDisplayRegionLimitByCountryCode[countryCode];
  if (manualLimit) {
    return Math.min(manualLimit, candidateCount);
  }
  if (candidateCount <= 12) {
    return candidateCount;
  }
  if (candidateCount <= 24) {
    return 10;
  }
  if (candidateCount <= 40) {
    return 8;
  }
  return 6;
}

export function aggregateRegionsForDisplay(
  zone: FloodZone,
  candidateRegions: ZoneRegion[],
): DisplayRegionGroup[] {
  const displayCount = getDisplayRegionLimit(zone.countryCode, candidateRegions.length);
  if (candidateRegions.length <= displayCount) {
    return candidateRegions.map((region) => ({
      ...region,
      memberRegionIds: [region.id],
    }));
  }

  const bounds = getRegionsBounds(candidateRegions);
  const seeds = getAggregateRegionSeeds(displayCount);
  const priorityTerms = getRegionPriorityTerms(zone);
  const groups = seeds.map((seed) => ({
    seed,
    members: [] as ZoneRegion[],
  }));

  candidateRegions.forEach((region) => {
    const normalizedCenter = normalizeRegionCenter(region, bounds);
    const relevance = getRegionRelevanceScore(region, priorityTerms);
    const groupIndex = groups.reduce((bestIndex, group, index) => {
      const relevanceNudge = relevance > 0 && group.seed.label === "Central" ? 0.08 : 0;
      const distance = squaredDistance(normalizedCenter, group.seed.anchor) - relevanceNudge;
      const bestGroup = groups[bestIndex];
      const bestDistance =
        squaredDistance(normalizedCenter, bestGroup.seed.anchor) -
        (relevance > 0 && bestGroup.seed.label === "Central" ? 0.08 : 0);

      return distance < bestDistance ? index : bestIndex;
    }, 0);

    groups[groupIndex].members.push(region);
  });

  return groups
    .filter((group) => group.members.length > 0)
    .map((group, index) => {
      const geometry = getAggregatedGeometry(group.members);
      const representativeRegion = geometry
        ? { ...group.members[0], geometry }
        : group.members[0];

      return {
        id: `${zone.countryCode.toLowerCase()}-display-${slugify(group.seed.label)}-${index + 1}`,
        name: `${group.seed.label} ${zone.name}`,
        countryCode: zone.countryCode,
        center: getAggregatedCenter(group.members),
        polygon: getRepresentativePolygon(representativeRegion),
        geometry,
        population: 0,
        baselineRiskLevel: zone.baselineRiskLevel,
        estimatedLossEurMillions: 0,
        historicalEvents: [],
        memberRegionIds: group.members.map((region) => region.id),
      };
    });
}

export function buildDisplayRegionsFromAdminBoundaries(
  zone: FloodZone,
  candidateRegions: ZoneRegion[],
): ZoneRegion[] {
  const displayGroups = aggregateRegionsForDisplay(zone, candidateRegions);
  const areaWeights = displayGroups.map((region) => geometryAreaProxy(region));
  const totalAreaWeight = areaWeights.reduce((sum, value) => sum + value, 0);
  const safeTotalWeight = totalAreaWeight <= 0 ? 1 : totalAreaWeight;
  const roundedPopulations = areaWeights.map((weight) =>
    Math.round(zone.stats.populationAtRisk * (weight / safeTotalWeight)),
  );
  const populationCorrection =
    zone.stats.populationAtRisk - roundedPopulations.reduce((sum, value) => sum + value, 0);

  return displayGroups.map((region, index) => {
    const weight = areaWeights[index] / safeTotalWeight;
    const hash = getStringHash(`${zone.countryCode}-${region.name}`);
    const riskShift = (hash % 15) - 7;
    const baselineRiskLevel = clamp(Math.round(zone.baselineRiskLevel + riskShift), 8, 100);
    const population = Math.max(
      0,
      roundedPopulations[index] + (index === displayGroups.length - 1 ? populationCorrection : 0),
    );
    const estimatedLossEurMillions = roundToOneDecimal(
      zone.stats.estimatedHistoricalLossEurMillions * weight * (0.78 + baselineRiskLevel / 190),
    );
    const regionId =
      region.id || `${zone.countryCode.toLowerCase()}-admin-${slugify(region.name)}-${index + 1}`;

    return {
      id: regionId,
      name: region.name,
      countryCode: zone.countryCode,
      center: region.center,
      polygon: getRepresentativePolygon(region),
      geometry: region.geometry,
      population,
      baselineRiskLevel,
      estimatedLossEurMillions,
      historicalEvents: buildRegionalHistory(
        region.name,
        regionId,
        baselineRiskLevel,
        estimatedLossEurMillions,
      ),
    };
  });
}
