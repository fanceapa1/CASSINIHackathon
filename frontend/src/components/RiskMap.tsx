import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import { Globe2, Search } from "lucide-react";
import type { FormEvent } from "react";
import type { LayerProps, MapLayerMouseEvent, MapRef, ViewState } from "react-map-gl/maplibre";
import type {
  FloodZoneWithRisk,
  MapAnchorPoint,
  ReportedIncident,
  ZoneRegionWithRisk,
} from "../types/flood";
import "maplibre-gl/dist/maplibre-gl.css";

interface RiskMapProps {
  zones: FloodZoneWithRisk[];
  regions: ZoneRegionWithRisk[];
  selectedZoneId: string | null;
  selectedRegionId: string | null;
  incidents: ReportedIncident[];
  onSelectZone: (zoneId: string | null) => void;
  onSelectRegion: (regionId: string | null) => void;
  onFocusAnchorChange?: (anchor: MapAnchorPoint | null) => void;
}

interface OfficialCountryFeature {
  type: "Feature";
  properties: {
    CNTR_ID: string;
    NAME_ENGL: string;
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

interface SearchItem {
  id: string;
  kind: "country" | "region";
  label: string;
  countryId: string;
  subtitle: string;
}

interface MapFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
}

interface MapFeatureCollection {
  type: "FeatureCollection";
  features: MapFeature[];
}

type MapInteractionPhase = "world" | "countryZooming" | "countryReady" | "regionReady";

type PendingSelection =
  | {
      kind: "region";
      regionId: string;
      label: string;
    }
  | null;

const BASE_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const TRANSPARENT_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [],
};

const EUROPE_MAP_VIEW: ViewState = {
  longitude: 15.5,
  latitude: 53.4,
  zoom: 3.15,
  pitch: 0,
  bearing: 0,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
};

const COUNTRY_ZOOM_DURATION_MS = 1250;
const REGION_ZOOM_DURATION_MS = 900;
const WORLD_RETURN_DURATION_MS = 1050;

const RISK_FILL_COLOR_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["coalesce", ["to-number", ["get", "riskLevel"]], 0],
  0,
  "rgba(56, 189, 248, 0.20)",
  45,
  "rgba(34, 197, 94, 0.24)",
  70,
  "rgba(250, 204, 21, 0.30)",
  100,
  "rgba(244, 63, 94, 0.36)",
] as unknown as never;

function createEmptyFeatureCollection(): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function toControlledViewState(nextViewState: ViewState): ViewState {
  const { longitude, latitude, zoom, pitch, bearing, padding } = nextViewState;
  return {
    longitude,
    latitude,
    zoom,
    pitch,
    bearing,
    padding,
  };
}

function getBackgroundCountryFillLayer(): LayerProps {
  return {
    id: "background-country-fill",
    type: "fill",
    paint: {
      "fill-color": RISK_FILL_COLOR_EXPRESSION,
      "fill-opacity": 0.22,
    },
  };
}

function getBackgroundCountryOutlineLayer(isFocused: boolean): LayerProps {
  return {
    id: "background-country-outline",
    type: "line",
    paint: {
      "line-color": "rgba(226, 232, 240, 0.46)",
      "line-width": 1.2,
      "line-opacity": isFocused ? 0 : 0.82,
    },
  };
}

function getWorldCountryFillLayer(hoveredCountryId: string | null): LayerProps {
  return {
    id: "world-country-hit",
    type: "fill",
    paint: {
      "fill-color": RISK_FILL_COLOR_EXPRESSION,
      "fill-opacity": [
        "case",
        ["==", ["get", "id"], hoveredCountryId ?? ""],
        0.38,
        0.22,
      ] as unknown as never,
    },
  };
}

function getWorldCountryOutlineLayer(hoveredCountryId: string | null): LayerProps {
  return {
    id: "world-country-outline",
    type: "line",
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "id"], hoveredCountryId ?? ""],
        "rgba(125, 211, 252, 0.96)",
        "rgba(226, 232, 240, 0.80)",
      ] as unknown as never,
      "line-width": [
        "case",
        ["==", ["get", "id"], hoveredCountryId ?? ""],
        2.4,
        1.5,
      ] as unknown as never,
    },
  };
}

function getSelectedCountryFillLayer(phase: MapInteractionPhase): LayerProps {
  return {
    id: "selected-country-fill",
    type: "fill",
    paint: {
      "fill-color": "rgba(15, 23, 42, 0.18)",
      "fill-opacity": phase === "countryZooming" ? 0.34 : 0.24,
    },
  };
}

const selectedCountryOutlineLayer: LayerProps = {
  id: "selected-country-outline",
  type: "line",
  paint: {
    "line-color": "rgba(125, 211, 252, 0.96)",
    "line-width": 3,
  },
};

const selectedCountryHitLayer: LayerProps = {
  id: "selected-country-hit",
  type: "fill",
  paint: {
    "fill-color": "rgba(15, 23, 42, 0.01)",
    "fill-opacity": 0.01,
  },
};

function getRegionFillLayer(
  hoveredRegionId: string | null,
  selectedRegionId: string | null,
): LayerProps {
  return {
    id: "risk-region-fill",
    type: "fill",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "riskLevel"]], 0],
        0,
        "rgba(74, 222, 128, 0.34)",
        50,
        "rgba(250, 204, 21, 0.44)",
        100,
        "rgba(244, 63, 94, 0.62)",
      ] as unknown as never,
      "fill-opacity": [
        "case",
        ["==", ["get", "id"], selectedRegionId ?? ""],
        0.94,
        ["==", ["get", "id"], hoveredRegionId ?? ""],
        0.9,
        0.78,
      ] as unknown as never,
    },
  };
}

const regionOutlineLayer: LayerProps = {
  id: "risk-region-outline",
  type: "line",
  paint: {
    "line-color": "rgba(15, 23, 42, 0.58)",
    "line-width": 1.1,
  },
};

function getHoveredRegionOutlineLayer(hoveredRegionId: string | null): LayerProps | null {
  if (!hoveredRegionId) {
    return null;
  }

  return {
    id: "risk-region-outline-hovered",
    type: "line",
    filter: ["==", ["get", "id"], hoveredRegionId] as unknown as never,
    paint: {
      "line-color": "rgba(191, 219, 254, 0.98)",
      "line-width": 2.4,
    },
  };
}

function getSelectedRegionOutlineLayer(selectedRegionId: string | null): LayerProps | null {
  if (!selectedRegionId) {
    return null;
  }

  return {
    id: "risk-region-outline-selected",
    type: "line",
    filter: ["==", ["get", "id"], selectedRegionId] as unknown as never,
    paint: {
      "line-color": "rgba(251, 191, 36, 0.98)",
      "line-width": 2.8,
    },
  };
}

function closePolygonRing(coordinates: [number, number][]): [number, number][] {
  if (coordinates.length < 3) {
    return coordinates;
  }
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }
  return [...coordinates, first];
}

function normalizePolygonRings(rings: [number, number][][]): [number, number][][] {
  return rings
    .filter((ring) => ring.length >= 3)
    .map((ring) => closePolygonRing(ring));
}

function getRegionGeometry(
  region: ZoneRegionWithRisk,
): { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null {
  if (region.geometry?.type === "Polygon") {
    const rings = normalizePolygonRings(region.geometry.coordinates as [number, number][][]);
    if (rings.length > 0) {
      return {
        type: "Polygon",
        coordinates: rings,
      };
    }
  }

  if (region.geometry?.type === "MultiPolygon") {
    const polygons = (region.geometry.coordinates as [number, number][][][])
      .map((polygon) => normalizePolygonRings(polygon))
      .filter((polygon) => polygon.length > 0);

    if (polygons.length > 0) {
      return {
        type: "MultiPolygon",
        coordinates: polygons,
      };
    }
  }

  return null;
}

function getGeometryPolygons(
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null | undefined,
): [number, number][][][] {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    const rings = normalizePolygonRings(geometry.coordinates as [number, number][][]);
    return rings.length > 0 ? [rings] : [];
  }

  return (geometry.coordinates as [number, number][][][])
    .map((polygon) => normalizePolygonRings(polygon))
    .filter((polygon) => polygon.length > 0);
}

function getCountryGeometryFromRegions(
  zone: FloodZoneWithRisk,
  allRegions: ZoneRegionWithRisk[],
): { type: "MultiPolygon"; coordinates: [number, number][][][] } | null {
  const polygons = allRegions
    .filter((region) => region.countryCode === zone.countryCode)
    .flatMap((region) => getGeometryPolygons(region.geometry ?? getRegionGeometry(region)));

  if (polygons.length === 0) {
    return null;
  }

  return {
    type: "MultiPolygon",
    coordinates: polygons,
  };
}

function collectGeometryPoints(
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null | undefined,
): [number, number][] {
  if (!geometry) {
    return [];
  }
  return getGeometryPolygons(geometry).flatMap((polygon) => polygon.flatMap((ring) => ring));
}

function getBoundsFromPoints(points: [number, number][]): [[number, number], [number, number]] | null {
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

  if (minLon === maxLon || minLat === maxLat) {
    return null;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

export function RiskMap({
  zones,
  regions,
  selectedZoneId,
  selectedRegionId,
  incidents,
  onSelectZone,
  onSelectRegion,
  onFocusAnchorChange,
}: RiskMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  const activeZoneIdRef = useRef<string | null>(null);
  const activeRegionIdRef = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [officialCountries, setOfficialCountries] = useState<OfficialCountryCollection | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [phase, setPhase] = useState<MapInteractionPhase>("world");
  const [pendingSelection, setPendingSelection] = useState<PendingSelection>(null);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>(EUROPE_MAP_VIEW);

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/data/eu-countries-2024.geojson")
      .then((response) => response.json())
      .then((data: OfficialCountryCollection) => {
        if (!cancelled) {
          setOfficialCountries(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOfficialCountries({ type: "FeatureCollection", features: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const zonesGeoJson = useMemo<MapFeatureCollection>(() => {
    const byCountryCode = new globalThis.Map(zones.map((zone) => [zone.countryCode, zone]));
    const officialFeatures = officialCountries?.features ?? [];
    const matchedCountryCodes = new Set<string>();

    const merged = officialFeatures.flatMap((feature) => {
        const zone = byCountryCode.get(feature.properties.CNTR_ID);
        if (!zone) {
          return [];
        }

        matchedCountryCodes.add(zone.countryCode);
        return [
          {
            type: "Feature" as const,
            properties: {
              id: zone.id,
              countryCode: zone.countryCode,
              name: zone.name,
              riskLevel: zone.riskLevel,
              source: "GISCO CNTR_RG_20M_2024_4326",
            },
            geometry: feature.geometry,
          } satisfies MapFeature,
        ];
      });

    const fallbackUnmatched = zones
      .filter((zone) => !matchedCountryCodes.has(zone.countryCode))
      .flatMap((zone) => {
        const regionGeometry = getCountryGeometryFromRegions(zone, regions);
        const polygonGeometry =
          Array.isArray(zone.polygon) && zone.polygon.length >= 3
            ? {
                type: "Polygon" as const,
                coordinates: [closePolygonRing(zone.polygon as [number, number][])],
              }
            : null;
        const geometry = regionGeometry ?? polygonGeometry;

        if (zone.countryCode === "UK" && !regionGeometry) {
          return [];
        }
        if (!geometry) {
          return [];
        }

        return [
          {
            type: "Feature" as const,
            properties: {
              id: zone.id,
              countryCode: zone.countryCode,
              name: zone.name,
              riskLevel: zone.riskLevel,
              source: regionGeometry ? "regions-derived" : "fallback-unmatched",
            },
            geometry,
          } satisfies MapFeature,
        ];
      });

    if (merged.length > 0 || fallbackUnmatched.length > 0) {
      return {
        type: "FeatureCollection",
        features: [...merged, ...fallbackUnmatched],
      };
    }

    return {
      type: "FeatureCollection",
      features: zones
        .filter((zone) => Array.isArray(zone.polygon) && zone.polygon.length >= 3)
        .map((zone) => ({
          type: "Feature" as const,
          properties: {
            id: zone.id,
            countryCode: zone.countryCode,
            name: zone.name,
            riskLevel: zone.riskLevel,
            source: "fallback",
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [closePolygonRing(zone.polygon as [number, number][])],
          },
        }) satisfies MapFeature),
    };
  }, [zones, regions, officialCountries]);

  const regionFeatureList = useMemo<MapFeature[]>(
    () =>
      regions.flatMap((region) => {
          const geometry = getRegionGeometry(region);
          if (!geometry) {
            return [];
          }

          return [
            {
              type: "Feature" as const,
              properties: {
                id: region.id,
                zoneId: region.countryId,
                countryCode: region.countryCode,
                name: region.name,
                riskLevel: region.riskLevel,
              },
              geometry,
            } satisfies MapFeature,
          ];
        }),
    [regions],
  );

  const selectedZoneFeature = useMemo(
    () => zonesGeoJson.features.find((feature) => feature.properties.id === selectedZoneId) ?? null,
    [zonesGeoJson, selectedZoneId],
  );

  const selectedZoneGeoJson = useMemo<MapFeatureCollection>(
    () =>
      selectedZoneFeature
        ? {
            type: "FeatureCollection",
            features: [selectedZoneFeature],
          }
        : createEmptyFeatureCollection(),
    [selectedZoneFeature],
  );

  const visibleRegionsGeoJson = useMemo<MapFeatureCollection>(
    () =>
      selectedZoneId
        ? {
            type: "FeatureCollection",
            features: regionFeatureList.filter((feature) => feature.properties.zoneId === selectedZoneId),
          }
        : createEmptyFeatureCollection(),
    [regionFeatureList, selectedZoneId],
  );

  const selectedRegionBounds = useMemo(() => {
    if (!selectedRegion) {
      return null;
    }

    return getBoundsFromPoints(
      collectGeometryPoints(selectedRegion.geometry ?? getRegionGeometry(selectedRegion)),
    );
  }, [selectedRegion]);

  const selectedZoneBounds = useMemo(() => {
    if (!selectedZoneFeature) {
      return null;
    }

    return getBoundsFromPoints(collectGeometryPoints(selectedZoneFeature.geometry));
  }, [selectedZoneFeature]);

  const zonesById = useMemo(
    () => new globalThis.Map(zones.map((zone) => [zone.id, zone])),
    [zones],
  );

  const regionsById = useMemo(
    () => new globalThis.Map(regions.map((region) => [region.id, region])),
    [regions],
  );

  const searchItems = useMemo<SearchItem[]>(() => {
    const countryItems: SearchItem[] = zones.map((zone) => ({
      id: zone.id,
      kind: "country",
      label: zone.name,
      countryId: zone.id,
      subtitle: "Country",
    }));
    const regionItems: SearchItem[] = regions.map((region) => ({
      id: region.id,
      kind: "region",
      label: region.name,
      countryId: region.countryId,
      subtitle: region.countryName,
    }));

    return [...countryItems, ...regionItems];
  }, [zones, regions]);

  const filteredSearchItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return searchItems.slice(0, 10);
    }

    return searchItems
      .filter((item) => item.label.toLowerCase().includes(normalizedQuery))
      .slice(0, 12);
  }, [searchItems, searchQuery]);

  const clearAnimationTimeout = useCallback(() => {
    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
  }, []);

  const queueFocusAnchorUpdate = useCallback(
    (delay = 0) => {
      if (focusTimeoutRef.current) {
        window.clearTimeout(focusTimeoutRef.current);
      }
      focusTimeoutRef.current = window.setTimeout(() => {
        if (!mapRef.current || !onFocusAnchorChange) {
          onFocusAnchorChange?.(null);
          return;
        }

        if (selectedRegion) {
          const projected = mapRef.current.project(selectedRegion.center);
          onFocusAnchorChange({ x: projected.x, y: projected.y });
          return;
        }

        if (selectedZone) {
          const projected = mapRef.current.project(selectedZone.center);
          onFocusAnchorChange({ x: projected.x, y: projected.y });
          return;
        }

        onFocusAnchorChange(null);
      }, delay);
    },
    [onFocusAnchorChange, selectedRegion, selectedZone],
  );

  const focusCountry = useCallback(
    (zone: FloodZoneWithRisk, bounds: [[number, number], [number, number]] | null) => {
      if (!mapReady || !mapRef.current) {
        return;
      }

      clearAnimationTimeout();
      activeZoneIdRef.current = zone.id;
      activeRegionIdRef.current = null;
      setHoveredCountryId(null);
      setHoveredRegionId(null);
      setPhase("countryZooming");

      if (bounds) {
        mapRef.current.fitBounds(bounds, {
          padding: { top: 56, bottom: 56, left: 56, right: 56 },
          duration: COUNTRY_ZOOM_DURATION_MS,
          essential: true,
        });
      } else {
        mapRef.current.flyTo({
          center: zone.center,
          zoom: 5.8,
          pitch: 0,
          bearing: 0,
          duration: COUNTRY_ZOOM_DURATION_MS,
          essential: true,
        });
      }

      animationTimeoutRef.current = window.setTimeout(() => {
        setPhase("countryReady");
        queueFocusAnchorUpdate(100);
      }, COUNTRY_ZOOM_DURATION_MS + 40);
    },
    [clearAnimationTimeout, mapReady, queueFocusAnchorUpdate],
  );

  const focusRegion = useCallback(
    (
      region: ZoneRegionWithRisk,
      bounds: [[number, number], [number, number]] | null,
    ) => {
      if (!mapReady || !mapRef.current) {
        return;
      }

      clearAnimationTimeout();
      activeZoneIdRef.current = region.countryId;
      activeRegionIdRef.current = region.id;
      setHoveredRegionId(null);
      setPhase("regionReady");

      if (bounds) {
        mapRef.current.fitBounds(bounds, {
          padding: { top: 88, bottom: 88, left: 88, right: 88 },
          duration: REGION_ZOOM_DURATION_MS,
          essential: true,
        });
      } else {
        mapRef.current.flyTo({
          center: region.center,
          zoom: 7.8,
          pitch: 0,
          bearing: 0,
          duration: REGION_ZOOM_DURATION_MS,
          essential: true,
        });
      }

      animationTimeoutRef.current = window.setTimeout(() => {
        setPhase("regionReady");
        queueFocusAnchorUpdate(80);
      }, REGION_ZOOM_DURATION_MS + 40);
    },
    [clearAnimationTimeout, mapReady, queueFocusAnchorUpdate],
  );

  const returnToWorld = useCallback(() => {
    setPendingSelection(null);
    setHoveredCountryId(null);
    setHoveredRegionId(null);
    setShowSuggestions(false);
    onSelectRegion(null);
    onSelectZone(null);
  }, [onSelectRegion, onSelectZone]);

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    if (!selectedZone) {
      clearAnimationTimeout();
      activeZoneIdRef.current = null;
      activeRegionIdRef.current = null;
      setPhase("world");
      setHoveredCountryId(null);
      setHoveredRegionId(null);
      onFocusAnchorChange?.(null);
      mapRef.current?.flyTo({
        center: [EUROPE_MAP_VIEW.longitude, EUROPE_MAP_VIEW.latitude],
        zoom: EUROPE_MAP_VIEW.zoom,
        pitch: EUROPE_MAP_VIEW.pitch,
        bearing: EUROPE_MAP_VIEW.bearing,
        duration: WORLD_RETURN_DURATION_MS,
        essential: true,
      });
      return;
    }

    if (activeZoneIdRef.current !== selectedZone.id || phase === "world") {
      focusCountry(selectedZone, selectedZoneBounds);
    }
  }, [
    clearAnimationTimeout,
    focusCountry,
    mapReady,
    onFocusAnchorChange,
    phase,
    selectedZone,
    selectedZoneBounds,
  ]);

  useEffect(() => {
    if (!mapReady || !selectedZone) {
      return;
    }

    if (!selectedRegionId) {
      if (activeRegionIdRef.current) {
        activeRegionIdRef.current = null;
        focusCountry(selectedZone, selectedZoneBounds);
      }
      return;
    }

    if (!selectedRegion) {
      return;
    }

    if (phase === "countryZooming") {
      return;
    }

    if (activeRegionIdRef.current === selectedRegion.id && phase === "regionReady") {
      return;
    }

    focusRegion(selectedRegion, selectedRegionBounds);
  }, [
    focusCountry,
    focusRegion,
    mapReady,
    phase,
    selectedRegion,
    selectedRegionBounds,
    selectedRegionId,
    selectedZone,
    selectedZoneBounds,
  ]);

  useEffect(() => {
    if (!pendingSelection || phase !== "countryReady") {
      return;
    }

    if (pendingSelection.kind === "region" && selectedRegionId !== pendingSelection.regionId) {
      onSelectRegion(pendingSelection.regionId);
    }
    setPendingSelection(null);
  }, [onSelectRegion, pendingSelection, phase, selectedRegionId]);

  useEffect(() => {
    if (pendingSelection?.kind === "region" && !selectedRegion) {
      setSearchQuery(pendingSelection.label);
      return;
    }

    if (selectedRegion) {
      setSearchQuery(selectedRegion.name);
      return;
    }

    if (selectedZone) {
      setSearchQuery(selectedZone.name);
      return;
    }

    setSearchQuery("");
  }, [pendingSelection, selectedRegion, selectedZone]);

  useEffect(() => {
    if (!selectedRegionId) {
      activeRegionIdRef.current = null;
    }
  }, [selectedRegionId]);

  useEffect(
    () => () => {
      clearAnimationTimeout();
      if (focusTimeoutRef.current) {
        window.clearTimeout(focusTimeoutRef.current);
      }
    },
    [clearAnimationTimeout],
  );

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) {
      return;
    }

    canvas.style.cursor = hoveredCountryId || hoveredRegionId ? "pointer" : "grab";
  }, [hoveredCountryId, hoveredRegionId]);

  const selectSearchItem = useCallback(
    (item: SearchItem) => {
      setSearchQuery(item.label);
      setShowSuggestions(false);

      if (item.kind === "region") {
        const targetRegion = regionsById.get(item.id);
        if (item.id === selectedRegionId && targetRegion) {
          setPendingSelection(null);
          focusRegion(targetRegion, selectedRegionBounds);
          return;
        }

        if (item.countryId === selectedZoneId && phase !== "countryZooming") {
          setPendingSelection(null);
          onSelectRegion(item.id);
          return;
        }

        setPendingSelection({
          kind: "region",
          regionId: item.id,
          label: item.label,
        });
        onSelectRegion(null);
        onSelectZone(item.countryId);
        return;
      }

      const targetZone = zonesById.get(item.countryId);
      setPendingSelection(null);
      onSelectRegion(null);

      if (item.countryId === selectedZoneId && targetZone && phase !== "countryZooming") {
        focusCountry(targetZone, selectedZoneBounds);
        return;
      }

      onSelectZone(item.countryId);
    },
    [
      focusCountry,
      focusRegion,
      onSelectRegion,
      onSelectZone,
      phase,
      regionsById,
      selectedRegionBounds,
      selectedRegionId,
      selectedZoneBounds,
      selectedZoneId,
      zonesById,
    ],
  );

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const exactMatch = filteredSearchItems.find(
        (item) => item.label.toLowerCase() === searchQuery.trim().toLowerCase(),
      );
      const fallbackMatch = filteredSearchItems[0];
      const target = exactMatch ?? fallbackMatch;
      if (!target) {
        return;
      }

      selectSearchItem(target);
    },
    [filteredSearchItems, searchQuery, selectSearchItem],
  );

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      setShowSuggestions(false);

      if (selectedZoneId) {
        const clickedRegion = event.features?.find((feature) => feature.layer?.id === "risk-region-fill");
        const regionId = clickedRegion?.properties?.id;
        if (typeof regionId === "string" && phase !== "countryZooming") {
          onSelectRegion(regionId);
          const clickedRegionData = regionsById.get(regionId);
          if (clickedRegionData) {
            setSearchQuery(clickedRegionData.name);
          }
          return;
        }

        const clickedSelectedCountry = event.features?.find(
          (feature) => feature.layer?.id === "selected-country-hit",
        );
        if (clickedSelectedCountry) {
          return;
        }

        returnToWorld();
        return;
      }

      const clickedCountry = event.features?.find((feature) => feature.layer?.id === "world-country-hit");
      const countryId = clickedCountry?.properties?.id;
      if (typeof countryId === "string") {
        onSelectRegion(null);
        onSelectZone(countryId);
        const clickedCountryData = zonesById.get(countryId);
        if (clickedCountryData) {
          setSearchQuery(clickedCountryData.name);
        }
      }
    },
    [onSelectRegion, onSelectZone, phase, regionsById, returnToWorld, selectedZoneId, zonesById],
  );

  const handleMapMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      if (selectedZoneId) {
        const hoveredRegion = event.features?.find((feature) => feature.layer?.id === "risk-region-fill");
        const nextHoveredRegionId =
          typeof hoveredRegion?.properties?.id === "string" ? hoveredRegion.properties.id : null;
        setHoveredRegionId((current) => (current === nextHoveredRegionId ? current : nextHoveredRegionId));
        setHoveredCountryId(null);
        return;
      }

      const hoveredCountry = event.features?.find((feature) => feature.layer?.id === "world-country-hit");
      const nextHoveredCountryId =
        typeof hoveredCountry?.properties?.id === "string" ? hoveredCountry.properties.id : null;
      setHoveredCountryId((current) => (current === nextHoveredCountryId ? current : nextHoveredCountryId));
      setHoveredRegionId(null);
    },
    [selectedZoneId],
  );

  const interactiveLayerIds = useMemo(() => {
    if (selectedZoneId) {
      if (phase === "countryZooming") {
        return ["selected-country-hit"];
      }
      return ["selected-country-hit", "risk-region-fill"];
    }
    return ["world-country-hit"];
  }, [phase, selectedZoneId]);

  const hoveredRegionOutlineLayer = useMemo(
    () => getHoveredRegionOutlineLayer(hoveredRegionId),
    [hoveredRegionId],
  );

  const selectedRegionOutlineLayer = useMemo(
    () => getSelectedRegionOutlineLayer(selectedRegionId),
    [selectedRegionId],
  );

  const shouldRevealRegions = Boolean(selectedZoneId) && phase !== "world" && phase !== "countryZooming";
  const hasVisibleRegions = visibleRegionsGeoJson.features.length > 0;

  const backgroundMapClasses = selectedZoneId
    ? phase === "countryZooming"
      ? "scale-[1.03] blur-md saturate-[0.72] opacity-70"
      : "scale-[1.015] blur-[2px] saturate-[0.8] opacity-76"
    : "scale-100 blur-0 saturate-100 opacity-100";

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <div
        className={`pointer-events-none absolute inset-0 transition duration-700 ease-out ${backgroundMapClasses}`}
      >
        <Map
          mapLib={maplibregl}
          mapStyle={BASE_MAP_STYLE}
          projection="mercator"
          {...viewState}
          interactive={false}
          attributionControl={false}
        >
          <Source id="background-risk-zones" type="geojson" data={zonesGeoJson as never}>
            <Layer {...getBackgroundCountryFillLayer()} />
            <Layer {...getBackgroundCountryOutlineLayer(Boolean(selectedZoneId))} />
          </Source>
        </Map>
      </div>

      <div className="absolute inset-0">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          mapStyle={TRANSPARENT_MAP_STYLE}
          projection="mercator"
          {...viewState}
          onLoad={() => setMapReady(true)}
          interactiveLayerIds={interactiveLayerIds}
          onClick={handleMapClick}
          onMouseMove={handleMapMouseMove}
          onMouseLeave={() => {
            setHoveredCountryId(null);
            setHoveredRegionId(null);
          }}
          onMove={(event) => {
            setViewState(toControlledViewState(event.viewState));
            if (selectedZoneId) {
              queueFocusAnchorUpdate();
            }
          }}
          onMoveEnd={() => {
            if (selectedZoneId) {
              queueFocusAnchorUpdate();
            }
          }}
          attributionControl={false}
        >
          <NavigationControl position="top-right" />

          {!selectedZoneId ? (
            <Source id="world-risk-zones" type="geojson" data={zonesGeoJson as never}>
              <Layer {...getWorldCountryFillLayer(hoveredCountryId)} />
              <Layer {...getWorldCountryOutlineLayer(hoveredCountryId)} />
            </Source>
          ) : null}

          {selectedZoneId ? (
            <Source id="selected-risk-zone" type="geojson" data={selectedZoneGeoJson as never}>
              <Layer {...getSelectedCountryFillLayer(phase)} />
              <Layer {...selectedCountryOutlineLayer} />
              <Layer {...selectedCountryHitLayer} />
            </Source>
          ) : null}

          {selectedZoneId && shouldRevealRegions && hasVisibleRegions ? (
            <Source id="selected-risk-regions" type="geojson" data={visibleRegionsGeoJson as never}>
              <Layer {...getRegionFillLayer(hoveredRegionId, selectedRegionId)} />
              <Layer {...regionOutlineLayer} />
              {hoveredRegionOutlineLayer ? <Layer {...hoveredRegionOutlineLayer} /> : null}
              {selectedRegionOutlineLayer ? <Layer {...selectedRegionOutlineLayer} /> : null}
            </Source>
          ) : null}

          {shouldRevealRegions
            ? incidents.map((incident) => (
                <Marker
                  key={incident.id}
                  longitude={incident.location[0]}
                  latitude={incident.location[1]}
                  anchor="bottom"
                >
                  <div className="group relative">
                    <button
                      type="button"
                      className="h-4 w-4 rounded-full border border-rose-200 bg-rose-500 shadow-lg"
                      title={incident.description}
                    />
                    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 hidden -translate-x-1/2 rounded-md bg-slate-950/90 px-2 py-1 text-[11px] text-slate-100 shadow-xl group-hover:block">
                      Reported incident
                    </div>
                  </div>
                </Marker>
              ))
            : null}
        </Map>
      </div>

      {selectedZoneId ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/18 via-transparent to-slate-950/8" />
      ) : null}

      <div className="absolute left-4 top-4 z-20 w-full max-w-sm">
        <form
          onSubmit={submitSearch}
          className="relative rounded-xl border border-slate-600/70 bg-slate-900/88 shadow-lg backdrop-blur-md"
        >
          <Search className="pointer-events-none absolute bottom-0 left-3 top-0 my-auto h-4 w-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search country or region (Bacau, Vrancea, Galati)..."
            className="w-full rounded-xl bg-transparent py-3 pl-10 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-400"
          />

          {showSuggestions && filteredSearchItems.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] max-h-[320px] overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-900/96 shadow-2xl">
              {filteredSearchItems.map((item) => (
                <button
                  type="button"
                  key={`${item.kind}-${item.id}`}
                  className="block w-full border-b border-slate-700/70 px-3 py-2 text-left transition hover:bg-slate-800/90 last:border-b-0"
                  onClick={() => selectSearchItem(item)}
                >
                  <p className="text-sm text-slate-100">{item.label}</p>
                  <p className="text-[11px] text-slate-400">{item.subtitle}</p>
                </button>
              ))}
            </div>
          ) : null}
        </form>

        {selectedZoneId ? (
          <button
            type="button"
            onClick={returnToWorld}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-600/75 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-100 shadow-lg backdrop-blur-md transition hover:bg-slate-800"
          >
            <Globe2 className="h-3.5 w-3.5 text-cyan-300" />
            Return to world map
          </button>
        ) : null}
      </div>
    </div>
  );
}
