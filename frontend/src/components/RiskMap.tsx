import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Map, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import { Search, X } from "lucide-react";
import type { FormEvent } from "react";
import type { LayerProps, MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
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

const BASE_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const EUROPE_GLOBE_VIEW = {
  longitude: 15.5,
  latitude: 53.4,
  zoom: 3.15,
  pitch: 0,
  bearing: 0,
};

function getCountryHitLayer(): LayerProps {
  return {
    id: "risk-zone-fill",
    type: "fill",
    paint: {
      "fill-color": "rgba(15, 23, 42, 0.01)",
      "fill-opacity": 0.01,
    },
  };
}

const countryOutlineLayer: LayerProps = {
  id: "risk-zone-outline",
  type: "line",
  paint: {
    "line-color": "rgba(226, 232, 240, 0.72)",
    "line-width": 2.2,
  },
};

function getSelectedCountryOutlineLayer(selectedZoneId: string): LayerProps {
  return {
    id: "risk-zone-outline-selected",
    type: "line",
    filter: ["==", ["get", "id"], selectedZoneId] as unknown as never,
    paint: {
      "line-color": "rgba(251, 191, 36, 0.95)",
      "line-width": 2.8,
    },
  };
}

function getRegionFillLayer(selectedZoneId: string | null, selectedRegionId: string | null): LayerProps {
  return {
    id: "risk-region-fill",
    type: "fill",
      paint: {
        "fill-color": [
          "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "riskLevel"]], 0],
        0,
        "rgba(74, 222, 128, 0.32)",
        50,
        "rgba(250, 204, 21, 0.42)",
        100,
        "rgba(244, 63, 94, 0.58)",
      ] as unknown as never,
        "fill-opacity": [
          "case",
          ["==", ["get", "id"], selectedRegionId ?? ""],
          0.94,
          ["==", ["get", "zoneId"], selectedZoneId ?? ""],
          0.88,
          0.82,
        ] as unknown as never,
      },
    };
}

function getRegionDimLayer(selectedZoneId: string | null, selectedRegionId: string | null): LayerProps | null {
  if (selectedRegionId) {
    return {
      id: "risk-region-dim",
      type: "fill",
      filter: ["!=", ["get", "id"], selectedRegionId] as unknown as never,
      paint: {
        "fill-color": "rgba(15, 23, 42, 0.56)",
        "fill-opacity": 0.34,
      },
    };
  }

  if (selectedZoneId) {
    return {
      id: "risk-region-dim",
      type: "fill",
      filter: ["!=", ["get", "zoneId"], selectedZoneId] as unknown as never,
      paint: {
        "fill-color": "rgba(15, 23, 42, 0.48)",
        "fill-opacity": 0.28,
      },
    };
  }

  return null;
}

const regionOutlineLayer: LayerProps = {
  id: "risk-region-outline",
  type: "line",
  paint: {
    "line-color": "rgba(226, 232, 240, 0.8)",
    "line-width": 1.35,
  },
};

function getSelectedRegionOutlineLayer(selectedRegionId: string): LayerProps {
  return {
    id: "risk-region-outline-selected",
    type: "line",
    filter: ["==", ["get", "id"], selectedRegionId] as unknown as never,
    paint: {
      "line-color": "rgba(253, 224, 71, 0.95)",
      "line-width": 2.6,
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
  const lastFlownRegionIdRef = useRef<string | null>(null);
  const justManualFlewRef = useRef(false);
  const regionFeatureListRef = useRef<typeof regionFeatureList>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [officialCountries, setOfficialCountries] = useState<OfficialCountryCollection | null>(null);
  const [officialAdm1Regions, setOfficialAdm1Regions] = useState<OfficialAdm1Collection | null>(null);

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

  const zonesGeoJson = useMemo(() => {
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
          type: "Feature",
          properties: {
            id: zone.id,
            countryCode: zone.countryCode,
            name: zone.name,
            riskLevel: zone.riskLevel,
            source: "GISCO CNTR_RG_20M_2024_4326",
          },
          geometry: feature.geometry,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    const fallbackUnmatched = zones
      .filter(
        (zone) =>
          !matchedCountryCodes.has(zone.countryCode) &&
          zone.countryCode !== "UK" &&
          Array.isArray(zone.polygon) &&
          zone.polygon.length >= 3,
      )
      .map((zone) => ({
        type: "Feature",
        properties: {
          id: zone.id,
          countryCode: zone.countryCode,
          name: zone.name,
          riskLevel: zone.riskLevel,
          source: "fallback-unmatched",
        },
        geometry: {
          type: "Polygon",
          coordinates: [closePolygonRing(zone.polygon as [number, number][])],
        },
      }));

    if (merged.length > 0 || fallbackUnmatched.length > 0) {
      return {
        type: "FeatureCollection",
        features: [...merged, ...fallbackUnmatched],
      };
    }

    const fallbackFeatures = zones
      .filter((zone) => Array.isArray(zone.polygon) && zone.polygon.length >= 3)
      .map((zone) => ({
        type: "Feature",
        properties: {
          id: zone.id,
          countryCode: zone.countryCode,
          name: zone.name,
          riskLevel: zone.riskLevel,
          source: "fallback",
        },
        geometry: {
          type: "Polygon",
          coordinates: [closePolygonRing(zone.polygon as [number, number][])],
        },
      }));

    return {
      type: "FeatureCollection",
      features: fallbackFeatures,
    };
  }, [zones, officialCountries]);

  const regionFeatureList = useMemo(() => {
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
            type: "Feature",
            properties: {
              id: featureId,
              zoneId: zone.id,
              countryCode,
              name: regionName,
              riskLevel: matchedRegion?.riskLevel ?? zone.riskLevel,
            },
            geometry: feature.geometry,
          };
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
          type: "Feature",
          properties: {
            id: region.id,
            zoneId: region.countryId,
            countryCode: region.countryCode,
            name: region.name,
            riskLevel: region.riskLevel,
          },
          geometry,
        };
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
  }, [officialAdm1Regions, regions, zones]);

  const regionsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: regionFeatureList,
    }),
    [regionFeatureList],
  );

  // Keep a non-reactive ref so the zoom effect can read the latest feature list
  // without triggering re-runs when the GeoJSON data loads.
  regionFeatureListRef.current = regionFeatureList;

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

  const updateFocusAnchor = useCallback(() => {
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
  }, [selectedRegion, selectedZone, onFocusAnchorChange]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    if (selectedRegion) {
      // Guard: if we already flew to this exact region ID (e.g. from a map click that
      // triggered a manual flyTo before data was loaded), don't fly again when the
      // data resolves — that would cause a visible revert animation.
      if (lastFlownRegionIdRef.current === selectedRegionId) {
        return;
      }
      lastFlownRegionIdRef.current = selectedRegionId;

      // Try to use fitBounds on the actual rendered GeoJSON feature for accurate
      // centering. Falls back to pre-computed center if geometry isn't available.
      const feature = regionFeatureListRef.current.find(
        (f) => f.properties.id === selectedRegionId,
      );
      const bbox = feature ? computeGeometryBbox(feature.geometry as { type: string; coordinates: unknown }) : null;
      if (bbox) {
        mapRef.current.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 80, maxZoom: 9, duration: 1100, pitch: 42, bearing: 12, essential: true },
        );
      } else {
        mapRef.current.flyTo({
          center: selectedRegion.center,
          zoom: 7.8,
          pitch: 42,
          bearing: 12,
          duration: 1100,
          essential: true,
        });
      }
      return;
    }

    if (selectedZone) {
      if (justManualFlewRef.current) {
        justManualFlewRef.current = false;
        return;
      }
      lastFlownRegionIdRef.current = null;
      mapRef.current.flyTo({
        center: selectedZone.center,
        zoom: 5.4,
        pitch: 44,
        bearing: 10,
        duration: 1300,
        essential: true,
      });
      return;
    }

    lastFlownRegionIdRef.current = null;
    onFocusAnchorChange?.(null);
    mapRef.current.flyTo({
      center: [EUROPE_GLOBE_VIEW.longitude, EUROPE_GLOBE_VIEW.latitude],
      zoom: EUROPE_GLOBE_VIEW.zoom,
      pitch: EUROPE_GLOBE_VIEW.pitch,
      bearing: EUROPE_GLOBE_VIEW.bearing,
      duration: 1100,
      essential: true,
    });
  }, [selectedZone, selectedRegion, selectedRegionId, onFocusAnchorChange]);

  useEffect(() => {
    if (selectedRegion) {
      setSearchQuery(selectedRegion.name);
      return;
    }
    if (selectedZone) {
      setSearchQuery(selectedZone.name);
      return;
    }
    setSearchQuery("");
  }, [selectedZone, selectedRegion]);

  const selectSearchItem = useCallback(
    (item: SearchItem) => {
      onSelectZone(item.countryId);
      if (item.kind === "region") {
        onSelectRegion(item.id);
      } else {
        onSelectRegion(null);
      }
      setSearchQuery(item.label);
      setShowSuggestions(false);
    },
    [onSelectZone, onSelectRegion],
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
      const clickedRegion = event.features?.find((feature) => feature.layer?.id === "risk-region-fill");
      const regionId = clickedRegion?.properties?.id;
      const regionCountryId = clickedRegion?.properties?.zoneId;
      const regionName = clickedRegion?.properties?.name;
      if (typeof regionId === "string" && typeof regionCountryId === "string") {
        onSelectZone(regionCountryId);
        const clickedRegionData = regions.find((region) => region.id === regionId);
        if (clickedRegionData) {
          onSelectRegion(regionId);
          setSearchQuery(clickedRegionData.name);
        } else {
          // Region feature has no matching data entry — fly manually and skip
          // the zone-level flyTo that would otherwise override us.
          onSelectRegion(null);
          if (typeof regionName === "string") {
            setSearchQuery(regionName);
          }
          justManualFlewRef.current = true;
          mapRef.current?.flyTo({
            center: [event.lngLat.lng, event.lngLat.lat],
            zoom: 7.8,
            pitch: 42,
            bearing: 12,
            duration: 1100,
            essential: true,
          });
        }
        return;
      }

      const clickedCountry = event.features?.find((feature) => feature.layer?.id === "risk-zone-fill");
      const countryId = clickedCountry?.properties?.id;
      if (typeof countryId === "string") {
        onSelectZone(countryId);
        onSelectRegion(null);
        const clickedCountryData = zones.find((zone) => zone.id === countryId);
        if (clickedCountryData) {
          setSearchQuery(clickedCountryData.name);
        }
        return;
      }

      onSelectRegion(null);
      onSelectZone(null);
      setShowSuggestions(false);
    },
    [onSelectZone, onSelectRegion, zones, regions],
  );

  const interactiveLayerIds = useMemo(() => ["risk-region-fill", "risk-zone-fill"], []);
  const regionDimLayer = useMemo(
    () => getRegionDimLayer(selectedZoneId, selectedRegionId),
    [selectedRegionId, selectedZoneId],
  );

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={BASE_MAP_STYLE}
        projection="mercator"
        initialViewState={EUROPE_GLOBE_VIEW}
        minZoom={2.8}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleMapClick}
        onMove={() => {
          if (selectedZoneId) {
            updateFocusAnchor();
          }
        }}
        onMoveEnd={() => {
          if (selectedZoneId) {
            updateFocusAnchor();
          }
        }}
        attributionControl={false}
      >
        <NavigationControl position="top-right" />

        <Source id="risk-zones" type="geojson" data={zonesGeoJson as never}>
          <Layer {...getCountryHitLayer()} />
          <Layer {...countryOutlineLayer} />
          {selectedZoneId ? <Layer {...getSelectedCountryOutlineLayer(selectedZoneId)} /> : null}
        </Source>

        <Source id="risk-regions" type="geojson" data={regionsGeoJson as never}>
          <Layer {...getRegionFillLayer(selectedZoneId, selectedRegionId)} />
          {regionDimLayer ? <Layer {...regionDimLayer} /> : null}
          <Layer {...regionOutlineLayer} />
          {selectedRegionId ? <Layer {...getSelectedRegionOutlineLayer(selectedRegionId)} /> : null}
        </Source>

      </Map>

      {selectedZoneId ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-slate-950/20" />
      ) : null}

      <div className="absolute left-14 top-4 z-20 w-full max-w-sm">
        <form
          onSubmit={submitSearch}
          className="relative flex items-center rounded-xl border border-slate-600/70 bg-slate-900/85 shadow-lg backdrop-blur-sm"
        >
          <Search className="pointer-events-none ml-3 h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search country or region (Bacau, Vrancea, Galati)..."
            className="min-w-0 flex-1 bg-transparent py-3 pl-3 pr-2 text-sm text-slate-100 outline-none placeholder:text-slate-400"
          />
          {selectedZoneId ? (
            <button
              type="button"
              onClick={() => {
                onSelectRegion(null);
                onSelectZone(null);
                setSearchQuery("");
                setShowSuggestions(false);
              }}
              className="mr-2 shrink-0 rounded-md p-1 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}

          {showSuggestions && filteredSearchItems.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] max-h-[320px] overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-900/95">
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
    </div>
  );
}
