import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
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
import {
  floodZones,
  historicalSimulations,
  informFloodScores2026ByIso2,
  informRiskDataSource,
} from "../data/floodMockData";
import {
  eurostatPopulationSource,
  fetchLatestEurostatCountryPopulations,
  type EurostatCountryPopulation,
} from "../data/eurostatPopulation";
import { DraggableWindow } from "./DraggableWindow";
import { RiskMap } from "./RiskMap";
import { SwarmModeModal } from "./SwarmModeModal";
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

interface FloodSummary {
  status: "live" | "fallback" | "unavailable";
  source: string | null;
  scene_date: string | null;
  observed_flood_area_km2: number | null;
  polygons_detected: number | null;
  message: string;
}

interface OfficialCountryFeature {
  type: "Feature";
  properties: {
    CNTR_ID: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
}

interface OfficialCountryCollection {
  type: "FeatureCollection";
  features: OfficialCountryFeature[];
}

const SIDEBAR_WIDTH = 356;
const ECHOSWARM_API_URL =
  import.meta.env.VITE_ECHOSWARM_API_URL ?? "http://localhost:8000";

const loadingMessages = [
  "Extracting satellite data...",
  "Generating simulation...",
  "Creating evacuation plan...",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUnit(value: number | null | undefined, unit: string): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `${formatNumber(value)} ${unit}`;
}

function formatCurrencyMillions(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `EUR ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)}M`;
}

function formatMeters(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `${value.toFixed(1)} m`;
}

function formatCubicMeters(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `${formatNumber(value)} m3`;
}

function formatSquareKilometers(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value)} km2`;
}

function formatPercent(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `${value}%`;
}

function formatScore(value: number | null | undefined, maximum: number): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `${value.toFixed(1)} / ${maximum}`;
}

function formatScore100(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "-";
  }
  return `${Math.round(value)} / 100`;
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

function getRepresentativePolygon(region: ZoneRegion): LngLat[] {
  if (region.geometry?.type === "Polygon") {
    return region.geometry.coordinates[0] ?? region.polygon;
  }
  if (region.geometry?.type === "MultiPolygon") {
    return region.geometry.coordinates[0]?.[0] ?? region.polygon;
  }
  return region.polygon;
}

function collectCoordinatePoints(value: unknown, points: LngLat[]): void {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    points.push([value[0], value[1]]);
    return;
  }

  value.forEach((item) => collectCoordinatePoints(item, points));
}

function getGeometryBounds(
  geometry: { coordinates: unknown } | undefined | null,
): [number, number, number, number] | null {
  if (!geometry) {
    return null;
  }

  const points: LngLat[] = [];
  collectCoordinatePoints(geometry.coordinates, points);
  if (points.length === 0) {
    return null;
  }

  let minLon = points[0][0];
  let maxLon = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];

  points.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return [minLon, minLat, maxLon, maxLat];
}

function buildRegionsFromOfficialBoundaries(zone: FloodZone, candidateRegions: ZoneRegion[]): ZoneRegion[] {
  return candidateRegions.map((region) => ({
      id: region.id,
      name: region.name,
      countryCode: zone.countryCode,
      center: region.center,
      polygon: getRepresentativePolygon(region),
      geometry: region.geometry,
      population: null,
      baselineRiskLevel: zone.baselineRiskLevel,
      estimatedLossEurMillions: null,
      historicalEvents: [],
  }));
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
  const [floodSummary, setFloodSummary] = useState<FloodSummary | null>(null);
  const [countryBoundsByCode, setCountryBoundsByCode] = useState<
    Record<string, [number, number, number, number]>
  >({});
  const [countryPopulations, setCountryPopulations] = useState<
    Record<string, EurostatCountryPopulation>
  >({});
  const [countryPopulationsLoading, setCountryPopulationsLoading] = useState(true);
  const [openWindows, setOpenWindows] = useState<Record<WindowKey, boolean>>({
    past: false,
    create: false,
  });
  const [windowStack, setWindowStack] = useState<WindowKey[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationRunState>("idle");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [swarmOpen, setSwarmOpen] = useState(false);

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
      const projectedLossByZoneEurMillions: Record<string, null> = {};
      const projectedLossByRegionEurMillions: Record<string, null> = {};
      const avoidedLossByZoneEurMillions: Record<string, null> = {};
      const avoidedLossByRegionEurMillions: Record<string, null> = {};
      const savingsPctByZone: Record<string, null> = {};
      const savingsPctByRegion: Record<string, null> = {};

      floodZones.forEach((zone, zoneIndex) => {
        let zoneRiskAccumulator = 0;
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
          projectedLossByRegionEurMillions[region.id] = null;
          avoidedLossByRegionEurMillions[region.id] = null;
          savingsPctByRegion[region.id] = null;
          zoneRiskAccumulator += regionalRisk;
        });

        const derivedZoneRisk = clamp(
          regionsForZone.length > 0
            ? Math.round(zoneRiskAccumulator / regionsForZone.length)
            : zone.baselineRiskLevel,
          0,
          100,
        );
        riskByZone[zone.id] = derivedZoneRisk;
        projectedLossByZoneEurMillions[zone.id] = null;
        avoidedLossByZoneEurMillions[zone.id] = null;
        savingsPctByZone[zone.id] = null;
      });

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
        estimatedDisplacement: null,
        responseTimeMinutes: null,
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
    const generatedRiskByRegion =
      activeScenarioId === "generated" ? generatedSimulation?.riskByRegion : undefined;

    return zonesWithRisk.flatMap((zone) =>
      (officialRegionsByCountry[zone.countryCode] &&
        officialRegionsByCountry[zone.countryCode].length > 0
        ? officialRegionsByCountry[zone.countryCode]
        : zone.regions
      ).map((region) => {
        const generatedRisk = generatedRiskByRegion?.[region.id];
        const riskLevel = generatedRisk ?? region.baselineRiskLevel;
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
    const controller = new AbortController();
    const countryCodes = floodZones.map((zone) => zone.countryCode);

    fetchLatestEurostatCountryPopulations(countryCodes, controller.signal)
      .then((populations) => setCountryPopulations(populations))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setCountryPopulations({});
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCountryPopulationsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const countryCodes = new Set(floodZones.map((zone) => zone.countryCode));

    fetch("/data/eu-countries-2024.geojson")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Country boundaries request failed: ${response.status}`);
        }
        return response.json() as Promise<OfficialCountryCollection>;
      })
      .then((collection) => {
        if (cancelled) {
          return;
        }

        const nextBounds = collection.features.reduce<
          Record<string, [number, number, number, number]>
        >((accumulator, feature) => {
          const countryCode = feature.properties.CNTR_ID;
          if (!countryCodes.has(countryCode)) {
            return accumulator;
          }

          const bounds = getGeometryBounds(feature.geometry);
          if (bounds) {
            accumulator[countryCode] = bounds;
          }
          return accumulator;
        }, {});

        setCountryBoundsByCode(nextBounds);
      })
      .catch(() => {
        if (!cancelled) {
          setCountryBoundsByCode({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
            population: null,
            baselineRiskLevel: zone.baselineRiskLevel,
            estimatedLossEurMillions: null,
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
    if (!selectedZone) {
      return undefined;
    }

    const controller = new AbortController();
    const selectedGeometry = selectedRegion?.geometry;
    const selectedBounds =
      getGeometryBounds(selectedGeometry) ??
      (!selectedRegion ? countryBoundsByCode[selectedZone.countryCode] ?? null : null);

    fetch(`${ECHOSWARM_API_URL}/api/selected-area/flood-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area_id: selectedRegion?.id ?? selectedZone.id,
        name: selectedRegion?.name ?? selectedZone.name,
        country_code: selectedZone.countryCode,
        bbox: selectedBounds,
        geometry: selectedGeometry ?? null,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Flood summary request failed: ${response.status}`);
        }
        return response.json() as Promise<FloodSummary>;
      })
      .then((payload) => {
        setFloodSummary(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFloodSummary({
          status: "unavailable",
          source: null,
          scene_date: null,
          observed_flood_area_km2: null,
          polygons_detected: null,
          message: "No source-backed flood summary is available.",
        });
      });

    return () => {
      controller.abort();
    };
  }, [countryBoundsByCode, selectedRegion, selectedZone]);

  const selectedEntityFinancials = useMemo(
    () =>
      selectedZone
        ? {
            estimatedLoss: null,
            estimatedSaved: null,
            savingsPct: null,
            label: "No source-backed financial estimate available",
          }
        : null,
    [selectedZone],
  );

  const contextualHistoricalSimulations = useMemo<
    {
      simulation: (typeof historicalSimulations)[number];
      scopedRisk: number;
      scopedLoss: number | null;
      historyTitle: string;
    }[]
  >(() => [], []);

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
      setFloodSummary(null);
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
      setFloodSummary(null);
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

    setSwarmOpen(true);
  }, [selectedZoneId, showToast]);

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

  const selectedInformScore = selectedZone
    ? informFloodScores2026ByIso2[selectedZone.countryCode]
    : undefined;
  const selectedCountryPopulation = selectedCountryCode
    ? countryPopulations[selectedCountryCode]
    : undefined;
  const selectedPopulation = selectedRegion
    ? selectedRegion.population
    : selectedCountryPopulation?.value ?? null;
  const populationCardTitle = selectedRegion ? "Region population" : "Country population";
  const populationSourceLabel = selectedRegion
    ? "Source: -"
    : selectedCountryPopulation
      ? `Source: ${eurostatPopulationSource.dataset}${
          selectedCountryPopulation.timePeriod ? ` | ${selectedCountryPopulation.timePeriod}` : ""
        }`
      : countryPopulationsLoading
        ? "Loading Eurostat population..."
        : "Source: -";

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
            EU Flood Assessment & Simulation
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
                  selectedZone.riskLevel,
                )}`}
              >
                Country Risk Score {selectedZone.riskLevel}
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
                  {populationCardTitle}
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatNumber(selectedPopulation)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{populationSourceLabel}</p>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <ShieldAlert className="h-3.5 w-3.5 text-cyan-300" />
                  Combined flood score
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatScore100(selectedInformScore?.combinedFloodScore100)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Source: {informRiskDataSource.dataset}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Waves className="h-3.5 w-3.5 text-cyan-300" />
                    River flood
                  </div>
                  <p className="mt-2 text-lg font-semibold text-slate-100">
                    {formatScore(selectedInformScore?.riverFloodScore010, 10)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Waves className="h-3.5 w-3.5 text-cyan-300" />
                    Coastal flood
                  </div>
                  <p className="mt-2 text-lg font-semibold text-slate-100">
                    {formatScore(selectedInformScore?.coastalFloodScore010, 10)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-cyan-300" />
                  Average elevation
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatMeters(selectedZone.stats.averageElevationM)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Waves className="h-3.5 w-3.5 text-cyan-300" />
                  Water volume
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatCubicMeters(selectedZone.stats.waterVolumeM3)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Waves className="h-3.5 w-3.5 text-cyan-300" />
                  Observed flood area
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatSquareKilometers(floodSummary?.observed_flood_area_km2)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Source: {floodSummary?.source ?? "-"}
                  {floodSummary?.scene_date ? ` | ${floodSummary.scene_date}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Status: {floodSummary?.status ?? "loading"}
                </p>
                {floodSummary?.message ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    {floodSummary.message}
                  </p>
                ) : null}
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
                      {formatPercent(selectedEntityFinancials.savingsPct)} (
                      {formatCurrencyMillions(selectedEntityFinancials.estimatedSaved)})
                    </p>
                  </div>
                </>
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
                      Country risk {region.riskLevel} | Population {formatNumber(region.population)} | Loss{" "}
                      {formatCurrencyMillions(region.estimatedLossEurMillions)}
                    </p>
                  </button>
                ))}
                {selectedZoneRegions.length === 0 ? (
                  <div className="rounded-md border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-sm text-slate-300">
                    -
                  </div>
                ) : null}
              </div>
            </div>

            {selectedRegion ? (
              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <p className="text-sm font-medium text-slate-100">Historical records for {selectedRegion.name}</p>
                <div className="mt-2 space-y-2">
                  {selectedRegion.historicalEvents.length > 0 ? (
                    selectedRegion.historicalEvents.map((event) => (
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
                    ))
                  ) : (
                    <div className="rounded-md border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-sm text-slate-300">
                      -
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
              <p className="text-sm font-medium text-slate-100">Major flood incidents</p>
              <div className="mt-2 space-y-2">
                {selectedZone.majorIncidents.length > 0 ? (
                  selectedZone.majorIncidents.map((incident) => (
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
                        {formatNumber(incident.fatalities)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">{incident.summary}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-slate-700/80 bg-slate-900/75 px-3 py-2 text-sm text-slate-300">
                    -
                  </div>
                )}
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
                    {selectedZone.emergencyPlans.length === 0 ? (
                      <li className="rounded-md border border-slate-700/80 bg-slate-900/70 px-3 py-2">
                        -
                      </li>
                    ) : null}
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
                  className="flex w-full items-center justify-between rounded-lg border border-cyan-500/30 bg-cyan-500/12 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Create simulation
                  </span>
                  <span className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">
                    EchoSwarm
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
                  contextualHistoricalSimulations.length > 0 ? (
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
                      -
                    </div>
                  )
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
                        {formatUnit(generatedSimulation.estimatedDisplacement, "people")}
                      </span>
                    </p>
                    <p className="mt-2">
                      Predicted response time:{" "}
                      <span className="font-semibold text-slate-100">
                        {formatUnit(generatedSimulation.responseTimeMinutes, "minutes")}
                      </span>
                    </p>
                    {selectedRegion ? (
                      <p className="mt-2">
                        Estimated avoided loss ({selectedRegion.name}):{" "}
                        <span className="font-semibold text-emerald-200">
                          {formatCurrencyMillions(
                            generatedSimulation.avoidedLossByRegionEurMillions[selectedRegion.id],
                          )}
                        </span>
                      </p>
                    ) : selectedZone ? (
                      <p className="mt-2">
                        Estimated avoided loss ({selectedZone.name}):{" "}
                        <span className="font-semibold text-emerald-200">
                          {formatCurrencyMillions(
                            generatedSimulation.avoidedLossByZoneEurMillions[selectedZone.id],
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

        <SwarmModeModal
          isOpen={swarmOpen}
          onClose={() => setSwarmOpen(false)}
        />
      </div>
    </div>
  );
}
