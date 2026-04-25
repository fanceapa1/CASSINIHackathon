import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  Crown,
  Globe2,
  History,
  Landmark,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getCountryAdminRegions } from "../data/adminBoundaries";
import { buildDisplayRegionsFromAdminBoundaries } from "../data/displayRegions";
import { floodZones, historicalSimulations, informRiskDataSource } from "../data/floodMockData";
import { DraggableWindow } from "./DraggableWindow";
import { RiskMap } from "./RiskMap";
import type {
  FloodZone,
  FloodZoneWithRisk,
  GeneratedSimulationResult,
  LngLat,
  MapAnchorPoint,
  RectBounds,
  ZoneRegion,
  ZoneRegionWithRisk,
} from "../types/flood";

type WindowKey = "past" | "create";
type SimulationRunState = "idle" | "running" | "complete";

const SIDEBAR_WIDTH = 356;
const DEFAULT_AGGREGATED_REGION_COUNT = 5;
const aggregatedRegionCountByCountryCode: Partial<Record<string, number>> = {
  DE: 6,
  ES: 6,
  FR: 6,
  IT: 6,
  PL: 6,
  UK: 5,
};

interface AggregateRegionSeed {
  label: string;
  anchor: [number, number];
}

const priorityRegionTermsByCountryCode: Partial<Record<string, string[]>> = {
  DE: [
    "dortmund",
    "munster",
    "muenster",
    "münster",
    "arnsberg",
    "dusseldorf",
    "düsseldorf",
    "koln",
    "köln",
    "cologne",
    "aachen",
    "bonn",
    "ahrweiler",
  ],
  RO: ["bucuresti", "ialomita", "bacau", "buzau", "galati", "vrancea", "cluj", "timis"],
  UK: ["england", "scotland", "wales", "northern ireland"],
};

const loadingMessages = [
  "Extracting satellite data...",
  "Generating simulation...",
  "Creating evacuation plan...",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrencyMillions(value: number): string {
  return `EUR ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)}M`;
}

function formatAccountRole(role: string | undefined): string {
  if (role === "admin") {
    return "Global admin";
  }
  if (role === "paid_client") {
    return "Paid client";
  }
  return "Regional user";
}

function formatAccountPlan(plan: string | undefined): string {
  if (plan === "enterprise") {
    return "Enterprise";
  }
  if (plan === "paid") {
    return "Paid";
  }
  return "Free";
}

function formatIncidentDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getRiskChipClasses(riskLevel: number): string {
  if (riskLevel < 35) {
    return "bg-emerald-500/25 text-emerald-200";
  }
  if (riskLevel < 70) {
    return "bg-amber-500/25 text-amber-200";
  }
  return "bg-rose-500/30 text-rose-100";
}

function getStringHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
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
  const area = getRegionPolygons(region).reduce(
    (sum, polygon) => sum + polygonAreaProxy(polygon),
    0,
  );
  return Math.max(area, 0.0004);
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
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function getMappedRegionLimit(countryCode: string): number {
  return aggregatedRegionCountByCountryCode[countryCode] ?? DEFAULT_AGGREGATED_REGION_COUNT;
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

  const sixRegionSeeds: AggregateRegionSeed[] = [
    { label: "North-Western", anchor: [0.2, 0.82] },
    { label: "North-Eastern", anchor: [0.8, 0.82] },
    { label: "Western", anchor: [0.15, 0.48] },
    { label: "Central", anchor: [0.5, 0.5] },
    { label: "Eastern", anchor: [0.85, 0.48] },
    { label: "Southern", anchor: [0.5, 0.14] },
  ];
  return sixRegionSeeds.slice(0, count);
}

function getRegionsBounds(regions: ZoneRegion[]): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
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
    const firstRegion = regions[0];
    return firstRegion?.center ?? [0, 0];
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

export function aggregateMappedRegions(zone: FloodZone, candidateRegions: ZoneRegion[]): ZoneRegion[] {
  const aggregateCount = Math.min(getMappedRegionLimit(zone.countryCode), candidateRegions.length);
  if (candidateRegions.length <= aggregateCount) {
    return candidateRegions;
  }

  const bounds = getRegionsBounds(candidateRegions);
  const seeds = getAggregateRegionSeeds(aggregateCount);
  const priorityTerms = getRegionPriorityTerms(zone);
  const groups = seeds.map((seed) => ({
    seed,
    members: [] as ZoneRegion[],
  }));

  candidateRegions.forEach((region) => {
    const normalizedCenter = normalizeRegionCenter(region, bounds);
    const relevance = getRegionRelevanceScore(region, priorityTerms);
    const groupIndex = groups.reduce(
      (bestIndex, group, index) => {
        const relevanceNudge = relevance > 0 && group.seed.label === "Central" ? 0.08 : 0;
        const distance = squaredDistance(normalizedCenter, group.seed.anchor) - relevanceNudge;
        const bestGroup = groups[bestIndex];
        const bestDistance =
          squaredDistance(normalizedCenter, bestGroup.seed.anchor) -
          (relevance > 0 && bestGroup.seed.label === "Central" ? 0.08 : 0);
        return distance < bestDistance ? index : bestIndex;
      },
      0,
    );
    groups[groupIndex].members.push(region);
  });

  return groups
    .filter((group) => group.members.length > 0)
    .map((group, index) => {
      const geometry = getAggregatedGeometry(group.members);
      const name = `${group.seed.label} ${zone.name}`;
      const fallbackPolygon = getRepresentativePolygon(group.members[0]);

      return {
        id: `${zone.countryCode.toLowerCase()}-aggregate-${slugify(group.seed.label)}-${index + 1}`,
        name,
        countryCode: zone.countryCode,
        center: getAggregatedCenter(group.members),
        polygon: geometry ? getRepresentativePolygon({ ...group.members[0], geometry }) : fallbackPolygon,
        geometry,
        population: 0,
        baselineRiskLevel: zone.baselineRiskLevel,
        estimatedLossEurMillions: 0,
        historicalEvents: [],
      };
    });
}

function buildRegionalHistory(regionName: string, regionId: string, baselineRisk: number, estimatedLoss: number) {
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

export function buildRegionsFromOfficialBoundaries(zone: FloodZone, candidateRegions: ZoneRegion[]): ZoneRegion[] {
  const areaWeights = candidateRegions.map((region) => geometryAreaProxy(region));
  const totalAreaWeight = areaWeights.reduce((sum, value) => sum + value, 0);
  const safeTotalWeight = totalAreaWeight <= 0 ? 1 : totalAreaWeight;
  const roundedPopulations = areaWeights.map((weight) =>
    Math.round(zone.stats.populationAtRisk * (weight / safeTotalWeight)),
  );
  const populationCorrection =
    zone.stats.populationAtRisk - roundedPopulations.reduce((sum, value) => sum + value, 0);

  return candidateRegions.map((region, index) => {
    const weight = areaWeights[index] / safeTotalWeight;
    const hash = getStringHash(`${zone.countryCode}-${region.name}`);
    const riskShift = (hash % 15) - 7;
    const baselineRiskLevel = clamp(Math.round(zone.baselineRiskLevel + riskShift), 8, 100);
    const population = Math.max(
      0,
      roundedPopulations[index] + (index === candidateRegions.length - 1 ? populationCorrection : 0),
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

function deriveHistoricalRegionRisk(
  zoneRisk: number | undefined,
  region: ZoneRegion,
): number | undefined {
  if (zoneRisk === undefined) {
    return undefined;
  }
  const hash = getStringHash(region.id);
  const spread = (hash % 11) - 5;
  return clamp(Math.round(zoneRisk + spread), 8, 100);
}

export default function Dashboard() {
  const mapAreaRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const { user, logout, canCreateSimulation } = useAuth();

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("live");
  const [generatedSimulation, setGeneratedSimulation] =
    useState<GeneratedSimulationResult | null>(null);
  const [focusAnchor, setFocusAnchor] = useState<MapAnchorPoint | null>(null);
  const [mapAreaSize, setMapAreaSize] = useState({ width: 1200, height: 800 });
  const [plansExpanded, setPlansExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(true);
  const [openWindows, setOpenWindows] = useState<Record<WindowKey, boolean>>({
    past: false,
    create: false,
  });
  const [windowStack, setWindowStack] = useState<WindowKey[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationRunState>("idle");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  const [officialRegionsByCountry, setOfficialRegionsByCountry] = useState<
    Record<string, ZoneRegion[]>
  >({});
  const [loadingOfficialRegionsByCountry, setLoadingOfficialRegionsByCountry] = useState<
    Record<string, boolean>
  >({});

  const buildGeneratedSimulation = useCallback(
    (focusZoneId: string | null, focusRegionId: string | null): GeneratedSimulationResult => {
      const createdAt = new Date().toISOString();
      const riskByZone: Record<string, number> = {};
      const riskByRegion: Record<string, number> = {};
      const projectedLossByZoneEurMillions: Record<string, number> = {};
      const projectedLossByRegionEurMillions: Record<string, number> = {};
      const avoidedLossByZoneEurMillions: Record<string, number> = {};
      const avoidedLossByRegionEurMillions: Record<string, number> = {};
      const savingsPctByZone: Record<string, number> = {};
      const savingsPctByRegion: Record<string, number> = {};

      floodZones.forEach((zone, zoneIndex) => {
        let zoneRiskAccumulator = 0;
        let zoneProjectedLoss = 0;
        let zoneAvoidedLoss = 0;
        const officialRegions = officialRegionsByCountry[zone.countryCode];
        const regionsForZone =
          officialRegions && officialRegions.length > 0 ? officialRegions : zone.regions;

        regionsForZone.forEach((region, regionIndex) => {
          const zoneBoost = zone.id === focusZoneId ? 12 : 5;
          const regionBoost = region.id === focusRegionId ? 11 : 0;
          const variability = ((zoneIndex + 1) * 3 + (regionIndex + 1) * 5) % 13;
          const regionalRisk = clamp(
            Math.round(region.baselineRiskLevel + zoneBoost + regionBoost + variability - 4),
            0,
            100,
          );
          riskByRegion[region.id] = regionalRisk;

          const projectedRegionalLoss = roundToOneDecimal(
            region.estimatedLossEurMillions * (0.62 + regionalRisk / 140),
          );
          const regionalSavingsPct = clamp(
            20 + Math.round(regionalRisk * 0.21) + (region.id === focusRegionId ? 6 : 0),
            18,
            60,
          );
          const avoidedRegionalLoss = roundToOneDecimal(
            projectedRegionalLoss * (regionalSavingsPct / 100),
          );

          projectedLossByRegionEurMillions[region.id] = projectedRegionalLoss;
          savingsPctByRegion[region.id] = regionalSavingsPct;
          avoidedLossByRegionEurMillions[region.id] = avoidedRegionalLoss;

          zoneRiskAccumulator += regionalRisk;
          zoneProjectedLoss += projectedRegionalLoss;
          zoneAvoidedLoss += avoidedRegionalLoss;
        });

        const derivedZoneRisk = clamp(
          Math.round(zoneRiskAccumulator / Math.max(regionsForZone.length, 1)),
          0,
          100,
        );
        riskByZone[zone.id] = derivedZoneRisk;
        projectedLossByZoneEurMillions[zone.id] = roundToOneDecimal(zoneProjectedLoss);
        avoidedLossByZoneEurMillions[zone.id] = roundToOneDecimal(zoneAvoidedLoss);
        savingsPctByZone[zone.id] =
          zoneProjectedLoss > 0
            ? clamp(Math.round((zoneAvoidedLoss / zoneProjectedLoss) * 100), 0, 100)
            : zone.stats.estimatedPlanSavingsPct;
      });

      const estimatedDisplacement = Math.round(
        floodZones.reduce((sum, zone) => {
          const risk = riskByZone[zone.id] ?? zone.baselineRiskLevel;
          return sum + zone.stats.populationAtRisk * (risk / 100) * 0.2;
        }, 0),
      );

      return {
        id: "generated",
        label: "Generated Scenario",
        createdAt,
        riskByZone,
        riskByRegion,
        projectedLossByZoneEurMillions,
        projectedLossByRegionEurMillions,
        avoidedLossByZoneEurMillions,
        avoidedLossByRegionEurMillions,
        savingsPctByZone,
        savingsPctByRegion,
        estimatedDisplacement,
        responseTimeMinutes: 47,
      };
    },
    [officialRegionsByCountry],
  );

  const zonesWithRisk = useMemo<FloodZoneWithRisk[]>(() => {
    const selectedHistorical = historicalSimulations.find(
      (simulation) => simulation.id === activeScenarioId,
    );
    const generatedRiskByZone =
      activeScenarioId === "generated" ? generatedSimulation?.riskByZone : undefined;

    return floodZones.map((zone) => {
      const historicalRisk = selectedHistorical?.riskByZone[zone.id];
      const generatedRisk = generatedRiskByZone?.[zone.id];
      const riskLevel = generatedRisk ?? historicalRisk ?? zone.baselineRiskLevel;

      return {
        ...zone,
        riskLevel: clamp(riskLevel, 0, 100),
      };
    });
  }, [activeScenarioId, generatedSimulation]);

  const zonesById = useMemo(
    () => new globalThis.Map(zonesWithRisk.map((zone) => [zone.id, zone])),
    [zonesWithRisk],
  );

  const selectedHistoricalScenario = useMemo(
    () => historicalSimulations.find((simulation) => simulation.id === activeScenarioId) ?? null,
    [activeScenarioId],
  );

  const regionsWithRisk = useMemo<ZoneRegionWithRisk[]>(() => {
    const selectedHistorical = historicalSimulations.find(
      (simulation) => simulation.id === activeScenarioId,
    );
    const generatedRiskByRegion =
      activeScenarioId === "generated" ? generatedSimulation?.riskByRegion : undefined;

    return zonesWithRisk.flatMap((zone) =>
      (officialRegionsByCountry[zone.countryCode] ?? []).map((region) => {
        const historicalRisk = selectedHistorical?.riskByRegion[region.id];
        const zoneHistoricalRisk = selectedHistorical?.riskByZone[zone.id];
        const derivedHistoricalRisk = deriveHistoricalRegionRisk(zoneHistoricalRisk, region);
        const generatedRisk = generatedRiskByRegion?.[region.id];
        const riskLevel =
          generatedRisk ?? historicalRisk ?? derivedHistoricalRisk ?? region.baselineRiskLevel;
        return {
          ...region,
          riskLevel: clamp(riskLevel, 0, 100),
          countryId: zone.id,
          countryName: zone.name,
        };
      }),
    );
  }, [zonesWithRisk, activeScenarioId, generatedSimulation, officialRegionsByCountry]);

  const regionsById = useMemo(
    () => new globalThis.Map(regionsWithRisk.map((region) => [region.id, region])),
    [regionsWithRisk],
  );

  const selectedRegion = useMemo(
    () => (selectedRegionId ? regionsById.get(selectedRegionId) ?? null : null),
    [selectedRegionId, regionsById],
  );

  const selectedZone = useMemo(() => {
    if (selectedZoneId) {
      return zonesById.get(selectedZoneId) ?? null;
    }
    if (selectedRegion) {
      return zonesById.get(selectedRegion.countryId) ?? null;
    }
    return null;
  }, [selectedZoneId, selectedRegion, zonesById]);

  const zoneSeedsByCountryCode = useMemo(
    () => new globalThis.Map(floodZones.map((zone) => [zone.countryCode, zone])),
    [],
  );

  const selectedCountryCode = selectedZone?.countryCode ?? null;
  const selectedZoneHasOfficialRegions = selectedCountryCode
    ? Boolean(officialRegionsByCountry[selectedCountryCode]?.length)
    : false;
  const selectedZoneRegionsLoading = selectedCountryCode
    ? Boolean(loadingOfficialRegionsByCountry[selectedCountryCode])
    : false;

  useEffect(() => {
    const countryCodes = floodZones.map((zone) => zone.countryCode);
    let cancelled = false;

    setLoadingOfficialRegionsByCountry(
      Object.fromEntries(countryCodes.map((countryCode) => [countryCode, true])),
    );

    countryCodes.forEach((countryCode) => {
      getCountryAdminRegions(countryCode)
        .then((regions) => {
        if (cancelled) {
          return;
        }

          const zone = zoneSeedsByCountryCode.get(countryCode);
          if (!zone) {
            return;
          }

          const mappedRegions: ZoneRegion[] = regions.map((region) => ({
            id: region.id,
            name: region.name,
            countryCode: region.countryCode,
            center: region.center,
            polygon:
              region.geometry.type === "Polygon"
                ? region.geometry.coordinates[0]
                : region.geometry.coordinates[0]?.[0] ?? [],
            geometry: region.geometry,
            population: 0,
            baselineRiskLevel: zone.baselineRiskLevel,
            estimatedLossEurMillions: 0,
            historicalEvents: [],
          }));

          const normalizedRegions = buildDisplayRegionsFromAdminBoundaries(zone, mappedRegions);
          setOfficialRegionsByCountry((current) => ({
            ...current,
            [countryCode]: normalizedRegions,
          }));
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setOfficialRegionsByCountry((current) => ({
            ...current,
            [countryCode]: [],
          }));
        })
        .finally(() => {
        if (cancelled) {
          return;
        }
          setLoadingOfficialRegionsByCountry((current) => ({
            ...current,
            [countryCode]: false,
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [zoneSeedsByCountryCode]);

  useEffect(() => {
    if (!selectedRegionId) {
      return;
    }
    if (regionsById.has(selectedRegionId)) {
      return;
    }
    setSelectedRegionId(null);
  }, [selectedRegionId, regionsById]);

  const selectedEntityFinancials = useMemo(() => {
    if (selectedRegion) {
      const fallbackLoss = selectedRegion.estimatedLossEurMillions;
      const fallbackSavingsPct = selectedZone?.stats.estimatedPlanSavingsPct ?? 30;

      if (activeScenarioId === "generated" && generatedSimulation) {
        const estimatedLoss =
          generatedSimulation.projectedLossByRegionEurMillions[selectedRegion.id] ?? fallbackLoss;
        const estimatedSaved =
          generatedSimulation.avoidedLossByRegionEurMillions[selectedRegion.id] ??
          roundToOneDecimal(estimatedLoss * (fallbackSavingsPct / 100));
        const savingsPct =
          generatedSimulation.savingsPctByRegion[selectedRegion.id] ?? fallbackSavingsPct;
        return {
          estimatedLoss,
          estimatedSaved,
          savingsPct,
          label: `Regional generated estimate (${selectedRegion.name})`,
        };
      }

      if (selectedHistoricalScenario) {
        const zoneHistoricalLoss =
          selectedZone?.id
            ? selectedHistoricalScenario.estimatedLossByZoneEurMillions[selectedZone.id]
            : undefined;
        const populationShare =
          selectedZone && selectedZone.stats.populationAtRisk > 0
            ? selectedRegion.population / selectedZone.stats.populationAtRisk
            : 0.15;
        const derivedLoss =
          zoneHistoricalLoss !== undefined
            ? roundToOneDecimal(
              zoneHistoricalLoss *
              populationShare *
              (0.82 + (selectedRegion.riskLevel ?? selectedRegion.baselineRiskLevel) / 230),
            )
            : fallbackLoss;

        const estimatedLoss =
          selectedHistoricalScenario.estimatedLossByRegionEurMillions[selectedRegion.id] ??
          derivedLoss;
        const savingsPct = clamp(fallbackSavingsPct + 5, 18, 64);
        const estimatedSaved = roundToOneDecimal(estimatedLoss * (savingsPct / 100));
        return {
          estimatedLoss,
          estimatedSaved,
          savingsPct,
          label: `Regional historical estimate (${selectedHistoricalScenario.label})`,
        };
      }

      return {
        estimatedLoss: fallbackLoss,
        estimatedSaved: roundToOneDecimal(fallbackLoss * (fallbackSavingsPct / 100)),
        savingsPct: fallbackSavingsPct,
        label: "Regional baseline estimate",
      };
    }

    if (!selectedZone) {
      return null;
    }

    const fallbackLoss = selectedZone.stats.estimatedHistoricalLossEurMillions;
    const fallbackSavingsPct = selectedZone.stats.estimatedPlanSavingsPct;

    if (activeScenarioId === "generated" && generatedSimulation) {
      const estimatedLoss =
        generatedSimulation.projectedLossByZoneEurMillions[selectedZone.id] ?? fallbackLoss;
      const estimatedSaved =
        generatedSimulation.avoidedLossByZoneEurMillions[selectedZone.id] ??
        roundToOneDecimal(estimatedLoss * (fallbackSavingsPct / 100));
      const savingsPct =
        generatedSimulation.savingsPctByZone[selectedZone.id] ?? fallbackSavingsPct;
      return {
        estimatedLoss,
        estimatedSaved,
        savingsPct,
        label: "Country generated estimate",
      };
    }

    if (selectedHistoricalScenario) {
      const estimatedLoss =
        selectedHistoricalScenario.estimatedLossByZoneEurMillions[selectedZone.id] ?? fallbackLoss;
      const savingsPct = clamp(fallbackSavingsPct + 4, 18, 60);
      const estimatedSaved = roundToOneDecimal(estimatedLoss * (savingsPct / 100));
      return {
        estimatedLoss,
        estimatedSaved,
        savingsPct,
        label: `Country historical estimate (${selectedHistoricalScenario.label})`,
      };
    }

    return {
      estimatedLoss: fallbackLoss,
      estimatedSaved: selectedZone.stats.estimatedPlanSavingsEurMillions,
      savingsPct: fallbackSavingsPct,
      label: "Country baseline estimate",
    };
  }, [selectedRegion, selectedZone, activeScenarioId, generatedSimulation, selectedHistoricalScenario]);

  const simulationSuccessStats = useMemo(() => {
    const peopleAtRisk = selectedRegion?.population ?? selectedZone?.stats.populationAtRisk ?? 0;
    const successPct = selectedEntityFinancials?.savingsPct ?? 0;
    const peopleHelped = Math.round(peopleAtRisk * (successPct / 100));
    const successRate =
      peopleAtRisk > 0 ? clamp(Math.round((peopleHelped / peopleAtRisk) * 100), 0, 100) : 0;

    return {
      peopleAtRisk,
      peopleHelped,
      successRate,
    };
  }, [selectedEntityFinancials, selectedRegion, selectedZone]);

  const contextualHistoricalSimulations = useMemo(() => {
    if (!selectedZone) {
      return [];
    }

    return historicalSimulations.map((simulation) => {
      if (selectedRegion) {
        const scopedRisk =
          simulation.riskByRegion[selectedRegion.id] ??
          deriveHistoricalRegionRisk(simulation.riskByZone[selectedZone.id], selectedRegion) ??
          selectedRegion.baselineRiskLevel;

        const zoneScenarioLoss =
          simulation.estimatedLossByZoneEurMillions[selectedZone.id] ??
          selectedZone.stats.estimatedHistoricalLossEurMillions;
        const populationShare =
          selectedZone.stats.populationAtRisk > 0
            ? selectedRegion.population / selectedZone.stats.populationAtRisk
            : 0.15;
        const derivedLoss = roundToOneDecimal(
          zoneScenarioLoss * populationShare * (0.85 + scopedRisk / 220),
        );

        const scopedLoss =
          simulation.estimatedLossByRegionEurMillions[selectedRegion.id] ?? derivedLoss;
        const historicalRecord = selectedRegion.historicalEvents[0];

        return {
          simulation,
          scopedRisk,
          scopedLoss,
          historyTitle: historicalRecord
            ? `${historicalRecord.title} (${formatIncidentDate(historicalRecord.eventDate)})`
            : `${selectedRegion.name} historical archive`,
        };
      }

      const scopedRisk = simulation.riskByZone[selectedZone.id] ?? selectedZone.baselineRiskLevel;
      const scopedLoss =
        simulation.estimatedLossByZoneEurMillions[selectedZone.id] ??
        selectedZone.stats.estimatedHistoricalLossEurMillions;
      const historicalRecord = selectedZone.majorIncidents[0];

      return {
        simulation,
        scopedRisk,
        scopedLoss,
        historyTitle: historicalRecord
          ? `${historicalRecord.title} (${formatIncidentDate(historicalRecord.eventDate)})`
          : `${selectedZone.name} major flood archive`,
      };
    });
  }, [selectedZone, selectedRegion]);

  const activeScenarioLabel = useMemo(() => {
    if (activeScenarioId === "live") {
      return "Live Risk Feed";
    }
    if (activeScenarioId === "generated") {
      return generatedSimulation?.label ?? "Generated Scenario";
    }
    return selectedHistoricalScenario?.label ?? "Historical Scenario";
  }, [activeScenarioId, generatedSimulation, selectedHistoricalScenario]);

  const contextMenuRect = useMemo<RectBounds | null>(() => {
    if (!selectedZone || !focusAnchor || !contextMenuVisible) {
      return null;
    }
    const menuWidth = 248;
    const menuHeight = 144;
    return {
      width: menuWidth,
      height: menuHeight,
      x: clamp(focusAnchor.x + 24, 12, Math.max(12, mapAreaSize.width - menuWidth - 12)),
      y: clamp(focusAnchor.y + 24, 12, Math.max(12, mapAreaSize.height - menuHeight - 12)),
    };
  }, [selectedZone, focusAnchor, contextMenuVisible, mapAreaSize.width, mapAreaSize.height]);

  const avoidRects = useMemo<RectBounds[]>(
    () => (contextMenuRect ? [contextMenuRect] : []),
    [contextMenuRect],
  );

  const windowBounds = useMemo(
    () => ({
      width: mapAreaSize.width,
      height: mapAreaSize.height,
    }),
    [mapAreaSize.width, mapAreaSize.height],
  );

  const initialWindowPositions = useMemo(() => {
    const rightAlignedX = clamp(
      mapAreaSize.width - 470,
      18,
      Math.max(18, mapAreaSize.width - 448),
    );
    return {
      past: { x: 24, y: 92 },
      create: { x: rightAlignedX, y: 108 },
    };
  }, [mapAreaSize.width]);

  const bringToFront = useCallback((windowKey: WindowKey) => {
    setWindowStack((current) => [...current.filter((key) => key !== windowKey), windowKey]);
  }, []);

  const closeWindow = useCallback((windowKey: WindowKey) => {
    setOpenWindows((current) => ({ ...current, [windowKey]: false }));
    setWindowStack((current) => current.filter((key) => key !== windowKey));
  }, []);

  const closeAllWindows = useCallback(() => {
    setOpenWindows({ past: false, create: false });
    setWindowStack([]);
  }, []);

  const openWindow = useCallback(
    (windowKey: WindowKey) => {
      setOpenWindows((current) => ({ ...current, [windowKey]: true }));
      bringToFront(windowKey);
    },
    [bringToFront],
  );

  const getWindowZIndex = useCallback(
    (windowKey: WindowKey) => {
      const index = windowStack.indexOf(windowKey);
      return index === -1 ? 60 : 70 + index;
    },
    [windowStack],
  );

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/");
  }, [logout, navigate]);

  const handleZoneSelection = useCallback(
    (zoneId: string | null) => {
      setSelectedZoneId(zoneId);
      if (zoneId) {
        setSelectedRegionId(null);
        setContextMenuVisible(true);
        return;
      }
      setSelectedRegionId(null);
      setFocusAnchor(null);
      setContextMenuVisible(false);
      closeAllWindows();
    },
    [closeAllWindows],
  );

  const handleRegionSelection = useCallback(
    (regionId: string | null) => {
      setSelectedRegionId(regionId);
      if (!regionId) {
        return;
      }
      const targetRegion = regionsById.get(regionId);
      if (targetRegion) {
        setSelectedZoneId(targetRegion.countryId);
        setContextMenuVisible(true);
      }
    },
    [regionsById],
  );

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapAreaRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      setMapAreaSize({ width: rect.width, height: rect.height });
    });
    observer.observe(mapAreaRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (simulationState !== "running") {
      return;
    }

    const textTicker = window.setInterval(() => {
      setLoadingStepIndex((current) => (current + 1) % loadingMessages.length);
    }, 2000);

    const completionTimer = window.setTimeout(() => {
      const result = buildGeneratedSimulation(selectedZoneId, selectedRegionId);
      setGeneratedSimulation(result);
      setActiveScenarioId("generated");
      setSimulationState("complete");
    }, 6000);

    return () => {
      window.clearInterval(textTicker);
      window.clearTimeout(completionTimer);
    };
  }, [simulationState, buildGeneratedSimulation, selectedZoneId, selectedRegionId]);

  const handleCreateSimulationClick = useCallback(() => {
    if (!selectedZoneId) {
      showToast("Select a country or region first.");
      return;
    }

    if (!canCreateSimulation) {
      navigate("/#contact");
      return;
    }

    openWindow("create");
    setActiveScenarioId("live");
    setGeneratedSimulation(null);
    setSimulationState("running");
    setLoadingStepIndex(0);
  }, [canCreateSimulation, navigate, openWindow, selectedZoneId, showToast]);

  const rerunSimulation = useCallback(() => {
    if (!selectedZoneId) {
      showToast("Select a country or region first.");
      return;
    }
    setActiveScenarioId("live");
    setGeneratedSimulation(null);
    setSimulationState("running");
    setLoadingStepIndex(0);
  }, [selectedZoneId, showToast]);

  const selectedZoneRegions = useMemo(
    () =>
      selectedZone
        ? regionsWithRisk
          .filter((region) => region.countryId === selectedZone.id)
          .sort((left, right) => left.name.localeCompare(right.name))
        : [],
    [regionsWithRisk, selectedZone],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <aside className="absolute inset-y-0 left-0 z-40 flex w-[356px] flex-col overflow-y-auto border-r border-slate-700/80 bg-slate-900/95 px-5 py-6 shadow-2xl backdrop-blur-sm">
        <div className="flex-1">
          <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/85">
            Flood Risk Dashboard
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">
            EU + UK Assessment & Simulation
          </h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-800/90 px-3 py-1 text-xs text-slate-200">
            <ShieldAlert className="h-3.5 w-3.5 text-cyan-300" />
            {activeScenarioLabel}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Baseline risk source: {informRiskDataSource.dataset}
          </p>
          </div>

          {selectedZone ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-4">
              {selectedRegion ? (
                <div className="mb-4 rounded-xl border border-cyan-400/40 bg-cyan-500/12 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                    Selected region
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-50">{selectedRegion.name}</p>
                  <p className="mt-1 text-xs text-slate-300">{selectedZone.name}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-100">
                    <span
                      className={`rounded-md px-2 py-1 font-medium ${getRiskChipClasses(
                        selectedRegion.riskLevel,
                      )}`}
                    >
                      Risk {selectedRegion.riskLevel}
                    </span>
                    <span className="rounded-md bg-slate-950/75 px-2 py-1">
                      Population {formatNumber(selectedRegion.population)}
                    </span>
                    <span className="rounded-md bg-slate-950/75 px-2 py-1">
                      Loss {formatCurrencyMillions(selectedRegion.estimatedLossEurMillions)}
                    </span>
                  </div>
                </div>
              ) : null}

              <p className="text-sm text-slate-300">
                {selectedRegion ? "Country context" : "Selected country"}
              </p>
              <p className="mt-1 text-base font-medium text-slate-100">{selectedZone.name}</p>
              <span
                className={`mt-3 inline-flex rounded-md px-2 py-1 text-xs font-medium ${getRiskChipClasses(
                  selectedRegion?.riskLevel ?? selectedZone.riskLevel,
                )}`}
              >
                Risk Score {selectedRegion?.riskLevel ?? selectedZone.riskLevel}
              </span>
              <button
                type="button"
                onClick={() => handleZoneSelection(null)}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-600/80 bg-slate-900/75 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
              >
                <Globe2 className="h-3.5 w-3.5" />
                Back to global map
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Users className="h-3.5 w-3.5 text-cyan-300" />
                  Population at risk
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatNumber(selectedRegion?.population ?? selectedZone.stats.populationAtRisk)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-cyan-300" />
                  Average elevation
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {selectedZone.stats.averageElevationM.toFixed(1)} m
                </p>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Waves className="h-3.5 w-3.5 text-cyan-300" />
                  Water volume (est.)
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatNumber(selectedZone.stats.waterVolumeM3)} m3
                </p>
              </div>

              {selectedEntityFinancials ? (
                <>
                  <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Landmark className="h-3.5 w-3.5 text-cyan-300" />
                      Estimated financial loss
                    </div>
                    <p className="mt-2 text-lg font-semibold text-slate-100">
                      {formatCurrencyMillions(selectedEntityFinancials.estimatedLoss)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">{selectedEntityFinancials.label}</p>
                  </div>

                  <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <TrendingUp className="h-3.5 w-3.5 text-cyan-300" />
                      Estimated avoided loss with simulation plan
                    </div>
                    <p className="mt-2 text-lg font-semibold text-emerald-200">
                      {selectedEntityFinancials.savingsPct}% (
                      {formatCurrencyMillions(selectedEntityFinancials.estimatedSaved)})
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Users className="h-3.5 w-3.5 text-cyan-300" />
                      Simulation success rate
                    </div>
                    <p className="mt-2 text-lg font-semibold text-emerald-200">
                      {simulationSuccessStats.successRate}%
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatNumber(simulationSuccessStats.peopleHelped)} helped /{" "}
                      {formatNumber(simulationSuccessStats.peopleAtRisk)} at risk
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
              <p className="text-sm font-medium text-slate-100">Display regions (click to inspect)</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {selectedZoneRegionsLoading
                  ? "Loading administrative boundaries for this country."
                  : selectedZoneHasOfficialRegions
                    ? "Administrative boundaries balanced into map-friendly regions."
                    : "No official administrative boundaries are available for this country yet."}
              </p>
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                {selectedZoneRegions.map((region) => (
                  <button
                    type="button"
                    key={region.id}
                    onClick={() => handleRegionSelection(region.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition ${selectedRegion?.id === region.id
                        ? "border-cyan-400/80 bg-cyan-500/20"
                        : "border-slate-700/80 bg-slate-900/75 hover:bg-slate-800/90"
                      }`}
                  >
                    <p className="text-sm text-slate-100">{region.name}</p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      Risk {region.riskLevel} | Population {formatNumber(region.population)} | Loss{" "}
                      {formatCurrencyMillions(region.estimatedLossEurMillions)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {selectedRegion ? (
              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <p className="text-sm font-medium text-slate-100">Historical records for {selectedRegion.name}</p>
                <div className="mt-2 space-y-2">
                  {selectedRegion.historicalEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-md border border-slate-700/80 bg-slate-900/75 px-3 py-2"
                    >
                      <p className="text-sm text-slate-100">{event.title}</p>
                      <p className="mt-1 text-[11px] text-slate-300">
                        {formatIncidentDate(event.eventDate)} | Peak water {event.peakWaterLevelM} m
                      </p>
                      <p className="mt-1 text-[11px] text-slate-300">
                        Loss: {formatCurrencyMillions(event.estimatedLossEurMillions)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">{event.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
              <p className="text-sm font-medium text-slate-100">Major flood incidents</p>
              <div className="mt-2 space-y-2">
                {selectedZone.majorIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="rounded-md border border-slate-700/80 bg-slate-900/75 px-3 py-2"
                  >
                    <p className="text-sm text-slate-100">{incident.title}</p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      {formatIncidentDate(incident.eventDate)} | {incident.affectedRegion}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      Loss: {formatCurrencyMillions(incident.estimatedLossEurMillions)} | Fatalities:{" "}
                      {incident.fatalities}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">{incident.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
              <button
                type="button"
                onClick={() => setPlansExpanded((current) => !current)}
                className="flex w-full items-center justify-between rounded-md bg-cyan-500/20 px-3 py-2 text-left text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/30"
              >
                <span>Emergency action plans</span>
                <ChevronDown
                  className={`h-4 w-4 transition ${plansExpanded ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {plansExpanded ? (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 space-y-2 overflow-hidden text-sm text-slate-200"
                  >
                    {selectedZone.emergencyPlans.map((plan) => (
                      <li
                        key={plan}
                        className="rounded-md border border-slate-700/80 bg-slate-900/70 px-3 py-2"
                      >
                        {plan}
                      </li>
                    ))}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-4 text-sm text-slate-300">
            Select a county, region, or country from the map (for example Bacau, Galati, Vrancea)
            to inspect the original ADM1 boundaries and historical data for that area.
          </div>
        )}

        </div>

        <section className="mt-5 rounded-xl border border-slate-700/80 bg-slate-800/70 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Account</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">
            {user?.name ?? "Demo user"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2">
              <p className="text-slate-400">Role</p>
              <p className="mt-1 font-medium text-slate-100">{formatAccountRole(user?.role)}</p>
            </div>
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2">
              <p className="text-slate-400">Plan</p>
              <p className="mt-1 font-medium text-cyan-200">{formatAccountPlan(user?.plan)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600/80 bg-slate-900/75 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </section>
      </aside>

      <div
        ref={mapAreaRef}
        className="absolute inset-y-0 right-0"
        style={{ left: `${SIDEBAR_WIDTH}px` }}
      >
        <RiskMap
          zones={zonesWithRisk}
          regions={regionsWithRisk}
          selectedZoneId={selectedZone?.id ?? null}
          selectedRegionId={selectedRegionId}
          incidents={[]}
          onSelectZone={handleZoneSelection}
          onSelectRegion={handleRegionSelection}
          onFocusAnchorChange={setFocusAnchor}
        />

        <AnimatePresence>
          {contextMenuRect && selectedZone ? (
            <motion.div
              className="absolute z-50 w-[248px] rounded-xl border border-slate-700/85 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-sm"
              style={{ left: contextMenuRect.x, top: contextMenuRect.y }}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">
                  Contextual actions
                </p>
                <button
                  type="button"
                  onClick={() => setContextMenuVisible(false)}
                  className="rounded-md p-1 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
                  aria-label="Hide actions"
                >
                  <PanelRightClose className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => openWindow("past")}
                  className="flex w-full items-center justify-between rounded-lg bg-cyan-500/20 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/35"
                >
                  <span className="inline-flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Past simulations
                  </span>
                  <span className="text-xs text-cyan-200/85">Free</span>
                </button>

                <button
                  type="button"
                  onClick={handleCreateSimulationClick}
                  className="flex w-full items-center justify-between rounded-lg bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/35"
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Create simulation
                  </span>
                  <span className="text-xs text-violet-200">
                    {canCreateSimulation ? "Unlocked" : "Contact"}
                  </span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {selectedZone && !contextMenuVisible ? (
          <button
            type="button"
            onClick={() => setContextMenuVisible(true)}
            className="absolute right-4 top-20 z-50 inline-flex items-center gap-2 rounded-lg border border-slate-600/85 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-xl backdrop-blur-sm transition hover:bg-slate-800"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
            Show actions
          </button>
        ) : null}

        <AnimatePresence>
          {openWindows.past ? (
            <DraggableWindow
              id="past-simulations-window"
              title="Past simulations"
              width={432}
              height={344}
              bounds={windowBounds}
              initialPosition={initialWindowPositions.past}
              avoidRects={avoidRects}
              zIndex={getWindowZIndex("past")}
              onFocus={() => bringToFront("past")}
              onClose={() => closeWindow("past")}
            >
              <div className="space-y-2">
                <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Selected scope</p>
                  <p className="mt-1 text-sm text-slate-100">
                    {selectedRegion && selectedZone
                      ? `${selectedRegion.name}, ${selectedZone.name}`
                      : selectedZone?.name ?? "No country selected"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${activeScenarioId === "live"
                      ? "border-cyan-400/80 bg-cyan-500/15 text-cyan-100"
                      : "border-slate-700/80 bg-slate-800/70 text-slate-200 hover:bg-slate-700/80"
                    }`}
                  onClick={() => setActiveScenarioId("live")}
                >
                  Live feed
                </button>
                {selectedZone ? (
                  contextualHistoricalSimulations.map((item) => (
                    <button
                      type="button"
                      key={item.simulation.id}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${activeScenarioId === item.simulation.id
                          ? "border-cyan-400/80 bg-cyan-500/15 text-cyan-100"
                          : "border-slate-700/80 bg-slate-800/70 text-slate-200 hover:bg-slate-700/80"
                        }`}
                      onClick={() => setActiveScenarioId(item.simulation.id)}
                    >
                      <p className="font-medium">{item.simulation.label}</p>
                      <p className="mt-1 text-xs text-slate-300">{item.simulation.notes}</p>
                      <p className="mt-1 text-xs text-cyan-200">
                        Risk {item.scopedRisk} | Est. loss {formatCurrencyMillions(item.scopedLoss)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">{item.historyTitle}</p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                    Select a country or region to load historical records for that specific area.
                  </div>
                )}
              </div>
            </DraggableWindow>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {openWindows.create ? (
            <DraggableWindow
              id="create-simulation-window"
              title="Create simulation"
              width={444}
              height={340}
              bounds={windowBounds}
              initialPosition={initialWindowPositions.create}
              avoidRects={avoidRects}
              zIndex={getWindowZIndex("create")}
              onFocus={() => bringToFront("create")}
              onClose={() => closeWindow("create")}
            >
              {simulationState === "running" ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-300/80 border-t-transparent" />
                  <p className="text-sm text-slate-200">{loadingMessages[loadingStepIndex]}</p>
                </div>
              ) : null}

              {simulationState === "idle" ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    Simulation engine is ready. Start a new run for{" "}
                    {selectedRegion?.name ?? selectedZone?.name ?? "the selected area"}.
                  </p>
                  <button
                    type="button"
                    onClick={rerunSimulation}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/30 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/45"
                  >
                    <Sparkles className="h-4 w-4" />
                    Start simulation
                  </button>
                </div>
              ) : null}

              {simulationState === "complete" && generatedSimulation ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-3 text-sm text-emerald-100">
                    Simulation complete
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/70 p-3 text-sm text-slate-200">
                    <p>
                      Estimated displacement:{" "}
                      <span className="font-semibold text-slate-100">
                        {formatNumber(generatedSimulation.estimatedDisplacement)} people
                      </span>
                    </p>
                    <p className="mt-2">
                      Predicted response time:{" "}
                      <span className="font-semibold text-slate-100">
                        {generatedSimulation.responseTimeMinutes} minutes
                      </span>
                    </p>
                    {selectedRegion ? (
                      <p className="mt-2">
                        Estimated avoided loss ({selectedRegion.name}):{" "}
                        <span className="font-semibold text-emerald-200">
                          {formatCurrencyMillions(
                            generatedSimulation.avoidedLossByRegionEurMillions[selectedRegion.id] ??
                            0,
                          )}
                        </span>
                      </p>
                    ) : selectedZone ? (
                      <p className="mt-2">
                        Estimated avoided loss ({selectedZone.name}):{" "}
                        <span className="font-semibold text-emerald-200">
                          {formatCurrencyMillions(
                            generatedSimulation.avoidedLossByZoneEurMillions[selectedZone.id] ?? 0,
                          )}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={rerunSimulation}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/30 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/45"
                  >
                    <Sparkles className="h-4 w-4" />
                    Run again
                  </button>
                </div>
              ) : null}
            </DraggableWindow>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {toastMessage ? (
            <motion.div
              className="absolute left-1/2 top-4 z-[120] -translate-x-1/2 rounded-lg border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 shadow-lg backdrop-blur-sm"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <span className="inline-flex items-center gap-2">
                <Crown className="h-4 w-4" />
                {toastMessage}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
