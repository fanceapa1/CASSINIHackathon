import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Crown,
  Globe2,
  History,
  Landmark,
  Lock,
  LogOut,
  MapPinned,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User,
  Users,
  Waves,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getAllCountryAdminRegions } from "../data/adminBoundaries";
import { floodZones, historicalSimulations, informRiskDataSource } from "../data/floodMockData";
import { DraggableWindow } from "./DraggableWindow";
import { RiskMap } from "./RiskMap";
import type {
  FloodZone,
  FloodZoneWithRisk,
  GeneratedSimulationResult,
  LngLat,
  RectBounds,
  ZoneRegion,
  ZoneRegionWithRisk,
} from "../types/flood";

type WindowKey = "past" | "create";
type SimulationRunState = "idle" | "running" | "complete";

const SIDEBAR_WIDTH = 356;

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

function getRepresentativePolygon(region: ZoneRegion): LngLat[] {
  if (region.geometry?.type === "Polygon") {
    return region.geometry.coordinates[0] ?? region.polygon;
  }
  if (region.geometry?.type === "MultiPolygon") {
    return region.geometry.coordinates[0]?.[0] ?? region.polygon;
  }
  return region.polygon;
}

function geometryAreaProxy(region: ZoneRegion): number {
  const polygon = getRepresentativePolygon(region);
  if (polygon.length < 3) {
    return 1;
  }

  let minLon = polygon[0][0];
  let maxLon = polygon[0][0];
  let minLat = polygon[0][1];
  let maxLat = polygon[0][1];

  polygon.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return Math.max((maxLon - minLon) * (maxLat - minLat), 0.0004);
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

function buildRegionsFromOfficialBoundaries(zone: FloodZone, candidateRegions: ZoneRegion[]): ZoneRegion[] {
  const areaWeights = candidateRegions.map((region) => geometryAreaProxy(region));
  const totalAreaWeight = areaWeights.reduce((sum, value) => sum + value, 0);
  const safeTotalWeight = totalAreaWeight <= 0 ? 1 : totalAreaWeight;

  return candidateRegions.map((region, index) => {
    const weight = areaWeights[index] / safeTotalWeight;
    const hash = getStringHash(`${zone.countryCode}-${region.name}`);
    const riskShift = (hash % 15) - 7;
    const baselineRiskLevel = clamp(Math.round(zone.baselineRiskLevel + riskShift), 8, 100);
    const population = Math.max(1200, Math.round(zone.stats.populationAtRisk * weight));
    const estimatedLossEurMillions = roundToOneDecimal(
      zone.stats.estimatedHistoricalLossEurMillions * weight * (0.78 + baselineRiskLevel / 190),
    );
    return {
      id: region.id,
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
        region.id,
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
  const { user, isAdmin, logout } = useAuth();
  const isPremium = isAdmin || user?.accessScope === "global";

  const mapAreaRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("live");
  const [generatedSimulation, setGeneratedSimulation] =
    useState<GeneratedSimulationResult | null>(null);
  const [mapAreaSize, setMapAreaSize] = useState({ width: 1200, height: 800 });
  const [plansExpanded, setPlansExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [openWindows, setOpenWindows] = useState<Record<WindowKey, boolean>>({
    past: false,
    create: false,
  });
  const [windowStack, setWindowStack] = useState<WindowKey[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationRunState>("idle");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      (officialRegionsByCountry[zone.countryCode] &&
        officialRegionsByCountry[zone.countryCode].length > 0
        ? officialRegionsByCountry[zone.countryCode]
        : zone.regions
      ).map((region) => {
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

  const officialRegionsLoadedRef = useRef(false);
  useEffect(() => {
    if (officialRegionsLoadedRef.current) return;
    officialRegionsLoadedRef.current = true;

    const countryCodes = floodZones.map((zone) => zone.countryCode);

    setLoadingOfficialRegionsByCountry(
      Object.fromEntries(countryCodes.map((countryCode) => [countryCode, true])),
    );

    getAllCountryAdminRegions(countryCodes)
      .then((regionsByCountry) => {
        const normalizedRegionsByCountry = Object.entries(regionsByCountry).reduce<
          Record<string, ZoneRegion[]>
        >((accumulator, [countryCode, regions]) => {
          const zone = zoneSeedsByCountryCode.get(countryCode);
          if (!zone || regions.length === 0) {
            return accumulator;
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

          const normalizedRegions = buildRegionsFromOfficialBoundaries(zone, mappedRegions);
          if (normalizedRegions.length > 0) {
            accumulator[countryCode] = normalizedRegions;
          }
          return accumulator;
        }, {});

        setOfficialRegionsByCountry(normalizedRegionsByCountry);
      })
      .catch(() => {})
      .finally(() => {
        setLoadingOfficialRegionsByCountry(
          Object.fromEntries(countryCodes.map((countryCode) => [countryCode, false])),
        );
      });
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
    if (!selectedZone || !contextMenuVisible) {
      return null;
    }
    const menuWidth = 248;
    const menuHeight = 160;
    return {
      width: menuWidth,
      height: menuHeight,
      x: mapAreaSize.width - menuWidth - 24,
      y: mapAreaSize.height - menuHeight - 24,
    };
  }, [selectedZone, contextMenuVisible, mapAreaSize.width, mapAreaSize.height]);

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

  const handleZoneSelection = useCallback(
    (zoneId: string | null) => {
      setSelectedZoneId(zoneId);
      if (zoneId) {
        setSelectedRegionId(null);
        setContextMenuVisible(true);
        return;
      }
      setSelectedRegionId(null);
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

    if (!isPremium) {
      showToast("Upgrade required");
      return;
    }

    openWindow("create");
    setActiveScenarioId("live");
    setGeneratedSimulation(null);
    setSimulationState("running");
    setLoadingStepIndex(0);
  }, [openWindow, selectedZoneId, showToast]);

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

  const totalPopulationAtRisk = useMemo(
    () => floodZones.reduce((sum, zone) => sum + zone.stats.populationAtRisk, 0),
    [],
  );

  const successRatePct = useMemo(() => {
    if (activeScenarioId === "generated" && generatedSimulation) {
      return clamp(
        Math.round(
          ((totalPopulationAtRisk - generatedSimulation.estimatedDisplacement) /
            totalPopulationAtRisk) *
            100,
        ),
        0,
        100,
      );
    }
    return selectedEntityFinancials?.savingsPct ?? null;
  }, [activeScenarioId, generatedSimulation, totalPopulationAtRisk, selectedEntityFinancials]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <motion.aside
        animate={{ x: sidebarOpen ? 0 : -SIDEBAR_WIDTH }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="absolute inset-y-0 left-0 z-40 w-[356px] overflow-y-auto border-r border-slate-700/80 bg-slate-900/95 px-5 py-6 shadow-2xl backdrop-blur-sm"
      >
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
              aria-label="Collapse sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/85">
              Flood Risk Dashboard
            </p>
          </div>
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
              <p className="text-sm text-slate-300">Selected country</p>
              <p className="mt-1 text-base font-medium text-slate-100">{selectedZone.name}</p>
              {selectedRegion ? (
                <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-slate-900/80 px-2 py-1 text-xs text-cyan-200">
                  <MapPinned className="h-3.5 w-3.5" />
                  Region: {selectedRegion.name}
                </div>
              ) : null}
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
                </>
              ) : null}

              {successRatePct !== null ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />
                    {activeScenarioId === "generated" ? "People protected (global sim)" : "Est. intervention success rate"}
                  </div>
                  <p className="mt-2 text-lg font-semibold text-emerald-200">
                    {successRatePct}%
                  </p>
                  {activeScenarioId === "generated" && generatedSimulation ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatNumber(totalPopulationAtRisk - generatedSimulation.estimatedDisplacement)} of{" "}
                      {formatNumber(totalPopulationAtRisk)} at risk
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
              <p className="text-sm font-medium text-slate-100">Regional boundaries (click to select)</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {selectedZoneRegionsLoading
                  ? "The map is already using built-in ADM1 boundaries; the sidebar list is syncing."
                  : selectedZoneHasOfficialRegions
                    ? "Official administrative boundaries loaded."
                    : "Built-in ADM1 administrative boundaries are active on the map."}
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

        <div className="mt-5 rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-100">{user?.name ?? "User"}</p>
                <p className="text-[11px] text-slate-400">{user?.organization ?? ""}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="rounded-md p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
              aria-label="Account settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          {accountMenuOpen ? (
            <div className="mt-3 space-y-1 border-t border-slate-700/80 pt-3">
              <p className="px-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                {isPremium ? "Admin / Global access" : "Regional access"}
              </p>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-200 transition hover:bg-slate-700/80"
              >
                <Lock className="h-3.5 w-3.5" />
                Change password
              </button>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-rose-300 transition hover:bg-rose-500/15"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </motion.aside>

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="absolute left-4 top-4 z-50 rounded-md bg-slate-800/90 p-2 text-slate-300 shadow-lg backdrop-blur-sm transition hover:bg-slate-700 hover:text-slate-100"
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <div
        ref={mapAreaRef}
        className="absolute inset-y-0 right-0"
        style={{
          left: sidebarOpen ? `${SIDEBAR_WIDTH}px` : "0px",
          transition: "left 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <RiskMap
          zones={zonesWithRisk}
          regions={regionsWithRisk}
          selectedZoneId={selectedZone?.id ?? null}
          selectedRegionId={selectedRegionId}
          onSelectZone={handleZoneSelection}
          onSelectRegion={handleRegionSelection}
        />

        <AnimatePresence>
          {selectedZone && contextMenuVisible ? (
            <motion.div
              className="absolute bottom-6 right-6 z-50 w-[248px] rounded-xl border border-slate-700/85 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-sm"
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
                  {isPremium ? (
                    <span className="text-xs text-violet-200/75">Unlocked</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-violet-200">
                      <Lock className="h-3 w-3" />
                      Premium
                    </span>
                  )}
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {selectedZone && !contextMenuVisible ? (
          <button
            type="button"
            onClick={() => setContextMenuVisible(true)}
            className="absolute bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-lg border border-slate-600/85 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-xl backdrop-blur-sm transition hover:bg-slate-800"
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
