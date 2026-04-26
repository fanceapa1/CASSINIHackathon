import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Map, { Layer, Marker, Popup, NavigationControl, Source } from "react-map-gl/maplibre";
import { Globe2, Search, X } from "lucide-react";
import type { FormEvent } from "react";
import type { LayerProps, MapLayerMouseEvent, MapRef, ViewState } from "react-map-gl/maplibre";
import type {
  FloodZoneWithRisk,
  MapAnchorPoint,
  ZoneRegionWithRisk,
} from "../types/flood";
import "maplibre-gl/dist/maplibre-gl.css";

interface RiskMapProps {
  zones: FloodZoneWithRisk[];
  regions: ZoneRegionWithRisk[];
  selectedZoneId: string | null;
  selectedRegionId: string | null;
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

interface OfficialAdm1Feature {
  type: "Feature";
  properties: {
    countryCode: string;
    shapeName?: string;
    shapeISO?: string;
    shapeID?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
}

interface OfficialAdm1Collection {
  type: "FeatureCollection";
  features: OfficialAdm1Feature[];
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

type CountryLabelBucket = "large" | "medium" | "small" | "tiny";

const BASEMAP_COUNTRY_LABEL_LAYER_IDS = [
  "place_country_1",
  "place_country_2",
  "place_state",
];

const COUNTRY_LABEL_LAYER_CONFIGS: Array<{
  id: string;
  bucket: CountryLabelBucket;
  minzoom: number;
}> = [
  { id: "eu-country-labels-large", bucket: "large", minzoom: 2.8 },
  { id: "eu-country-labels-medium", bucket: "medium", minzoom: 3.9 },
  { id: "eu-country-labels-small", bucket: "small", minzoom: 5.0 },
  { id: "eu-country-labels-tiny", bucket: "tiny", minzoom: 6.1 },
];

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

const TEST_PINPOINTS = [
  { id: 'bucharest', location: [26.1025, 44.4268] as [number, number], countryCode: 'RO', title: 'Bucharest Simulation', details: 'A flood simulation tracking water levels along the Dâmbovița river. Scenario parameters: Extreme rainfall.' },
  { id: 'rome', location: [12.4964, 41.9028] as [number, number], countryCode: 'IT', title: 'Rome Simulation', details: 'Historical flood scenario of the Tiber river affecting the historic center. Water level peaked at 1.8m above normal.' },
  { id: 'cluj', location: [23.5914, 46.7712] as [number, number], countryCode: 'RO', title: 'Cluj Simulation', details: 'Simulation of flash floods near Someșul Mic catching nearby residential zones.' }
];

function hideBasemapCountryLabels(map: maplibregl.Map): void {
  BASEMAP_COUNTRY_LABEL_LAYER_IDS.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }
  });
}

function getCountryLabelLayer(
  id: string,
  bucket: CountryLabelBucket,
  minzoom: number,
): LayerProps {
  const baseSize = bucket === "large" ? 9 : bucket === "medium" ? 8 : 7;

  return {
    id,
    type: "symbol",
    minzoom,
    filter: ["==", ["get", "labelBucket"], bucket] as unknown as never,
    layout: {
      "symbol-placement": "point",
      "text-field": ["get", "name"] as unknown as never,
      "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        minzoom,
        baseSize,
        5.8,
        baseSize + 1,
        7.2,
        baseSize + 2,
      ] as unknown as never,
      "text-transform": "uppercase",
      "text-max-width": bucket === "large" ? 9 : bucket === "medium" ? 7 : 5,
      "text-padding": 10,
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": "rgba(226, 232, 240, 0.88)",
      "text-halo-color": "rgba(2, 6, 23, 0.92)",
      "text-halo-width": 1.1,
      "text-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        minzoom,
        0,
        minzoom + 0.35,
        1,
      ] as unknown as never,
    },
  };
}

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

function getWorldCountryFillLayer(hoveredCountryId: string | null, selectedZoneId: string | null): LayerProps {
  return {
    id: "world-country-hit",
    type: "fill",
    paint: {
      "fill-color": RISK_FILL_COLOR_EXPRESSION,
      "fill-opacity": selectedZoneId ? 0 : [
        "case",
        ["==", ["get", "id"], hoveredCountryId ?? ""],
        0.38,
        0.22,
      ] as unknown as never,
      "fill-opacity-transition": { duration: 800 } as any,
    },
  };
}

function getWorldCountryOutlineLayer(hoveredCountryId: string | null, selectedZoneId: string | null): LayerProps {
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
      "line-opacity": selectedZoneId ? 0.15 : 1,
      "line-opacity-transition": { duration: 800 } as any,
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

function computeGeometryBbox(
  geometry: { type: string; coordinates: unknown },
): [number, number, number, number] | null {
  let rings: [number, number][][] = [];
  if (geometry.type === "Polygon") {
    const first = (geometry.coordinates as [number, number][][])[0];
    if (first) rings = [first];
  } else if (geometry.type === "MultiPolygon") {
    rings = (geometry.coordinates as [number, number][][][]).map((poly) => poly[0]).filter(Boolean);
    if (rings.length > 1) {
      let maxPoints = 0;
      let largestRing = rings[0];
      for (const ring of rings) {
        if (ring.length > maxPoints) {
          maxPoints = ring.length;
          largestRing = ring;
        }
      }
      rings = largestRing ? [largestRing] : [];
    }
  }
  if (rings.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

function getCountryLabelBucket(
  geometry: { type: string; coordinates: unknown },
  label: string,
): CountryLabelBucket {
  const bbox = computeGeometryBbox(geometry);
  if (!bbox) {
    return "tiny";
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  const width = Math.max(0, maxLng - minLng);
  const height = Math.max(0, maxLat - minLat);
  const areaScore = width * height;
  const namePenalty = Math.max(0, label.length - 8) * 2.2;
  const fitScore = areaScore - namePenalty;

  if (fitScore >= 54) {
    return "large";
  }
  if (fitScore >= 18) {
    return "medium";
  }
  if (fitScore >= 5) {
    return "small";
  }
  return "tiny";
}

function normalizeLookupText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getRegionGeometry(region: ZoneRegionWithRisk): { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null {
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

export function RiskMap({
  zones,
  regions,
  selectedZoneId,
  selectedRegionId,
  onSelectZone,
  onSelectRegion,
  onFocusAnchorChange,
}: RiskMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  const activeZoneIdRef = useRef<string | null>(null);
  const activeRegionIdRef = useRef<string | null>(null);
  const previousZoneFeatureRef = useRef<MapFeature | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [officialCountries, setOfficialCountries] = useState<OfficialCountryCollection | null>(null);
  const [officialAdm1Regions, setOfficialAdm1Regions] = useState<OfficialAdm1Collection | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [phase, setPhase] = useState<MapInteractionPhase>("world");
  const [pendingSelection, setPendingSelection] = useState<PendingSelection>(null);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>(EUROPE_MAP_VIEW);

  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch("/data/europe-adm1.geojson")
      .then((response) => response.json())
      .then((data: OfficialAdm1Collection) => {
        if (!cancelled) {
          setOfficialAdm1Regions(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOfficialAdm1Regions({ type: "FeatureCollection", features: [] });
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

    const merged = officialFeatures
      .map((feature) => {
        const zone = byCountryCode.get(feature.properties.CNTR_ID);
        if (!zone) {
          return null;
        }
        matchedCountryCodes.add(zone.countryCode);
        return {
          type: "Feature" as const,
          properties: {
            id: zone.id,
            countryCode: zone.countryCode,
            name: zone.name,
            riskLevel: zone.riskLevel,
            labelBucket: getCountryLabelBucket(feature.geometry, zone.name),
            source: "GISCO CNTR_RG_20M_2024_4326",
          },
          geometry: feature.geometry,
        } satisfies MapFeature;
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    const fallbackUnmatched = zones
      .filter(
        (zone) =>
          !matchedCountryCodes.has(zone.countryCode) &&
          Array.isArray(zone.polygon) &&
          zone.polygon.length >= 3,
      )
      .map((zone) => ({
        type: "Feature" as const,
        properties: {
          id: zone.id,
          countryCode: zone.countryCode,
          name: zone.name,
          riskLevel: zone.riskLevel,
          labelBucket: getCountryLabelBucket(
            {
              type: "Polygon",
              coordinates: [closePolygonRing(zone.polygon as [number, number][])],
            },
            zone.name,
          ),
          source: "fallback-unmatched",
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [closePolygonRing(zone.polygon as [number, number][])],
        },
      } satisfies MapFeature));

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
            labelBucket: getCountryLabelBucket(
              {
                type: "Polygon",
                coordinates: [closePolygonRing(zone.polygon as [number, number][])],
              },
              zone.name,
            ),
            source: "fallback",
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [closePolygonRing(zone.polygon as [number, number][])],
          },
        } satisfies MapFeature)),
    };
  }, [zones, officialCountries]);

  const regionFeatureList = useMemo<MapFeature[]>(() => {
    const regionsByCountryAndName = new globalThis.Map(
      regions.map((region) => [
        `${region.countryCode}:${normalizeLookupText(region.name)}`,
        region,
      ]),
    );

    const zonesByCountryCode = new globalThis.Map(
      zones.map((zone) => [zone.countryCode, zone]),
    );

    const officialFeatures = officialAdm1Regions?.features ?? [];
    if (officialFeatures.length > 0) {
      return officialFeatures
        .map((feature) => {
          const countryCode = feature.properties.countryCode;
          const zone = zonesByCountryCode.get(countryCode);
          if (!zone) {
            return null;
          }

          const regionName = feature.properties.shapeName?.trim() || "Region";
          const matchedRegion = regionsByCountryAndName.get(
            `${countryCode}:${normalizeLookupText(regionName)}`,
          );
          const featureId =
            matchedRegion?.id ??
            `${countryCode.toLowerCase()}-adm1-${normalizeLookupText(feature.properties.shapeID ?? regionName)}`;

          return {
            type: "Feature" as const,
            properties: {
              id: featureId,
              zoneId: zone.id,
              countryCode,
              name: regionName,
              riskLevel: matchedRegion?.riskLevel ?? zone.riskLevel,
            },
            geometry: feature.geometry,
          } satisfies MapFeature;
        })
        .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
    }

    return regions
      .map((region) => {
        const geometry = getRegionGeometry(region);
        if (!geometry) {
          return null;
        }
        return {
          type: "Feature" as const,
          properties: {
            id: region.id,
            zoneId: region.countryId,
            countryCode: region.countryCode,
            name: region.name,
            riskLevel: region.riskLevel,
          },
          geometry,
        } satisfies MapFeature;
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
  }, [officialAdm1Regions, regions, zones]);

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

  useEffect(() => {
    if (selectedZoneFeature) {
      previousZoneFeatureRef.current = selectedZoneFeature;
    }
  }, [selectedZoneFeature]);
  
  const maskFeature = selectedZoneFeature || previousZoneFeatureRef.current;
  
  const invertedMaskGeoJson = useMemo<MapFeatureCollection>(() => {
    if (!maskFeature) return createEmptyFeatureCollection();

    const earthRing: [number, number][] = [
      [-180, 90],
      [180, 90],
      [180, -90],
      [-180, -90],
      [-180, 90],
    ];

    const holes: [number, number][][] = [];
    const geom = maskFeature.geometry;
    if (geom.type === "Polygon") {
      holes.push(...(geom.coordinates as [number, number][][]));
    } else if (geom.type === "MultiPolygon") {
      (geom.coordinates as [number, number][][][]).forEach((poly) => {
        holes.push(...poly);
      });
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [earthRing, ...holes], // Outer ring, then holes
          },
        },
      ],
    };
  }, [maskFeature]);

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
    if (!selectedRegionId) {
      return null;
    }
    const feature = regionFeatureList.find(f => f.properties.id === selectedRegionId);
    if (!feature) return null;
    const bbox = computeGeometryBbox(feature.geometry as { type: string; coordinates: unknown });
    if (!bbox) return null;
    return [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] as [[number, number], [number, number]];
  }, [selectedRegionId, regionFeatureList]);

  const selectedZoneBounds = useMemo(() => {
    if (!selectedZoneFeature) return null;
    const bbox = computeGeometryBbox(selectedZoneFeature.geometry as { type: string; coordinates: unknown });
    if (!bbox) return null;
    return [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] as [[number, number], [number, number]];
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
    const normalized = normalizeForSearch(searchQuery.trim());
    if (!normalized) {
      return searchItems.slice(0, 10);
    }
    return searchItems
      .filter((item) => normalizeForSearch(item.label).includes(normalized))
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
          pitch: 0,
          bearing: 0,
          essential: true,
        });
      } else {
        mapRef.current.flyTo({
          center: zone.center,
          zoom: 5.4,
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
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          duration: REGION_ZOOM_DURATION_MS,
          pitch: 0,
          bearing: 0,
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
    setSelectedPinId(null);
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

  useEffect(() => {
    if (!selectedZoneId) {
      setSelectedPinId(null);
    }
  }, [selectedZoneId]);

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
        (item) => normalizeForSearch(item.label) === normalizeForSearch(searchQuery.trim()),
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

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          mapStyle={BASE_MAP_STYLE}
          projection="mercator"
          {...viewState}
          onLoad={(event) => {
            hideBasemapCountryLabels(event.target);
            setMapReady(true);
          }}
          interactiveLayerIds={interactiveLayerIds}
          onClick={handleMapClick}
          onMouseMove={handleMapMouseMove}
          onMouseLeave={() => {
            setHoveredCountryId(null);
            setHoveredRegionId(null);
          }}
          onMove={(event) => {
            setViewState(toControlledViewState(event.viewState));
            
            if (!selectedZoneId && event.viewState.zoom >= 5.6 && (event as any).originalEvent) {
              const bounds = mapRef.current?.getMap().getContainer().getBoundingClientRect();
              if (bounds) {
                const x = bounds.width / 2;
                const y = bounds.height / 2;
                const features = mapRef.current?.queryRenderedFeatures([x, y], { layers: ["world-country-hit"] });
                if (features && features.length > 0) {
                  const countryId = features[0].properties?.id;
                  if (typeof countryId === "string") {
                    onSelectZone(countryId);
                  }
                }
              }
            }

            if (selectedZoneId && event.viewState.zoom <= 3.8 && (event as any).originalEvent) {
              onSelectZone(null);
              onSelectRegion(null);
              setSearchQuery("");
              setShowSuggestions(false);
              setSelectedPinId(null);
            }

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

          <Source 
            id="esri-satellite" 
            type="raster" 
            tiles={["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"]} 
            tileSize={256}
          >
            <Layer 
              id="satellite-layer" 
              type="raster" 
              paint={{ 
                "raster-opacity": selectedZoneId ? 1 : 0, 
                "raster-opacity-transition": { duration: 1000 } as any
              }} 
            />
          </Source>

          <Source id="world-risk-zones" type="geojson" data={zonesGeoJson as never}>
            <Layer {...getWorldCountryFillLayer(hoveredCountryId, selectedZoneId)} />
            <Layer {...getWorldCountryOutlineLayer(hoveredCountryId, selectedZoneId)} />
            {!selectedZoneId
              ? COUNTRY_LABEL_LAYER_CONFIGS.map((layerConfig) => (
                  <Layer
                    key={layerConfig.id}
                    {...getCountryLabelLayer(
                      layerConfig.id,
                      layerConfig.bucket,
                      layerConfig.minzoom,
                    )}
                  />
                ))
              : null}
          </Source>

          <Source id="inverted-mask" type="geojson" data={invertedMaskGeoJson as never}>
            <Layer
              id="inverted-mask-fill"
              type="fill"
              paint={{
                "fill-color": "#09090b", 
                "fill-opacity": selectedZoneId ? 0.78 : 0,
                "fill-opacity-transition": { duration: 800 } as any
              }}
            />
          </Source>

          {selectedZoneId && selectedZoneGeoJson ? (
            <Source id="selected-risk-zone" type="geojson" data={selectedZoneGeoJson as never}>
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

          {shouldRevealRegions && selectedZone
            ? TEST_PINPOINTS.filter(pin => pin.countryCode === selectedZone.countryCode).map((pin) => (
                <Marker
                  key={pin.id}
                  longitude={pin.location[0]}
                  latitude={pin.location[1]}
                  anchor="bottom"
                  onClick={e => {
                    e.originalEvent.stopPropagation();
                    setSelectedPinId(pin.id);
                  }}
                >
                  <div className="group relative cursor-pointer pt-3 px-3">
                    <button
                      type="button"
                      className="h-4 w-4 rounded-full border border-rose-200 bg-rose-500 shadow-lg hover:scale-110 transition-transform"
                      title={pin.title}
                    />
                    <div className="pointer-events-none absolute bottom-[calc(100%-8px)] left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/90 px-2 py-1 text-[11px] text-slate-100 shadow-xl group-hover:block">
                      {pin.title}
                    </div>
                  </div>
                </Marker>
              ))
            : null}

          {selectedPinId && selectedZone ? (() => {
            const pin = TEST_PINPOINTS.find(p => p.id === selectedPinId);
            if (!pin) return null;
            return (
              <Popup
                longitude={pin.location[0]}
                latitude={pin.location[1]}
                anchor="bottom"
                onClose={() => setSelectedPinId(null)}
                offset={15}
                closeButton={true}
                className="custom-popup bg-transparent"
                style={{ borderRadius: '12px', overflow: 'hidden' }}
                maxWidth="300px"
              >
                <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
                  <h3 className="mb-2 text-sm font-semibold text-white">{pin.title}</h3>
                  <p className="text-xs leading-relaxed text-slate-300">{pin.details}</p>
                </div>
              </Popup>
            )
          })() : null}
        </Map>
      </div>

      <style>{`
        .custom-popup .maplibregl-popup-content {
          background: transparent;
          box-shadow: none;
          padding: 0;
        }
        .custom-popup .maplibregl-popup-tip {
          border-top-color: rgb(15 23 42 / 0.95);
        }
        .custom-popup .maplibregl-popup-close-button {
          color: #94a3b8;
          right: 4px;
          top: 4px;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .custom-popup .maplibregl-popup-close-button:hover {
          background-color: rgb(51 65 85 / 0.5);
          color: white;
        }
      `}</style>

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
            className="w-full rounded-xl bg-transparent py-3 pl-10 pr-9 text-sm text-slate-100 outline-none placeholder:text-slate-400"
          />
          {selectedZoneId && searchQuery ? (
            <button
              type="button"
              onClick={() => {
                onSelectRegion(null);
                onSelectZone(null);
                setSearchQuery("");
                setShowSuggestions(false);
                setSelectedPinId(null);
              }}
              className="absolute bottom-0 right-3 top-0 my-auto shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}

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
      </div>

      {selectedZoneId ? (
        <button
          type="button"
          onClick={returnToWorld}
          className="absolute bottom-6 left-6 z-20 inline-flex items-center gap-2 rounded-lg border border-slate-600/75 bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-lg backdrop-blur-md transition hover:bg-slate-800/90"
        >
          <Globe2 className="h-4 w-4 text-cyan-300" />
          Return to world map
        </button>
      ) : null}
    </div>
  );
}
