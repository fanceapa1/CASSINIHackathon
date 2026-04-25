import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import { Search, X } from "lucide-react";
import type { FormEvent } from "react";
import type { LayerProps, MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
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

const BASE_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const EUROPE_MAP_VIEW = {
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [officialCountries, setOfficialCountries] = useState<OfficialCountryCollection | null>(null);

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
      .filter((zone) => !matchedCountryCodes.has(zone.countryCode))
      .map((zone) => {
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
          return null;
        }

        if (!geometry) {
          return null;
        }

        return {
          type: "Feature",
          properties: {
            id: zone.id,
            countryCode: zone.countryCode,
            name: zone.name,
            riskLevel: zone.riskLevel,
            source: regionGeometry ? "regions-derived" : "fallback-unmatched",
          },
          geometry,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

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
  }, [zones, regions, officialCountries]);

  const regionFeatureList = useMemo(() => {
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
  }, [regions]);

  const regionsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: regionFeatureList,
    }),
    [regionFeatureList],
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
    if (!selectedZone) {
      return null;
    }
    const selectedFeature = zonesGeoJson.features.find(
      (feature) => feature.properties.id === selectedZone.id,
    );
    const selectedGeometry = selectedFeature?.geometry as
      | { type: "Polygon" | "MultiPolygon"; coordinates: unknown }
      | undefined;
    return getBoundsFromPoints(collectGeometryPoints(selectedGeometry));
  }, [selectedZone, zonesGeoJson]);

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
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return searchItems.slice(0, 10);
    }
    return searchItems
      .filter((item) => item.label.toLowerCase().includes(normalized))
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
      if (selectedRegionBounds) {
        mapRef.current.fitBounds(selectedRegionBounds, {
          padding: { top: 86, bottom: 86, left: 86, right: 86 },
          duration: 1100,
          essential: true,
        });
      } else {
        mapRef.current.flyTo({
          center: selectedRegion.center,
          zoom: 7.8,
          pitch: 0,
          bearing: 0,
          duration: 1100,
          essential: true,
        });
      }
      const handle = window.setTimeout(updateFocusAnchor, 220);
      return () => window.clearTimeout(handle);
    }

    if (selectedZone) {
      if (selectedZoneBounds) {
        mapRef.current.fitBounds(selectedZoneBounds, {
          padding: { top: 72, bottom: 72, left: 72, right: 72 },
          duration: 1300,
          essential: true,
        });
      } else {
        mapRef.current.flyTo({
          center: selectedZone.center,
          zoom: 5.4,
          pitch: 0,
          bearing: 0,
          duration: 1300,
          essential: true,
        });
      }
      const handle = window.setTimeout(updateFocusAnchor, 220);
      return () => window.clearTimeout(handle);
    }

    onFocusAnchorChange?.(null);
    mapRef.current.flyTo({
      center: [EUROPE_MAP_VIEW.longitude, EUROPE_MAP_VIEW.latitude],
      zoom: EUROPE_MAP_VIEW.zoom,
      pitch: EUROPE_MAP_VIEW.pitch,
      bearing: EUROPE_MAP_VIEW.bearing,
      duration: 1100,
      essential: true,
    });
  }, [
    selectedZone,
    selectedRegion,
    selectedRegionBounds,
    selectedZoneBounds,
    onFocusAnchorChange,
    updateFocusAnchor,
  ]);

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
          onSelectRegion(null);
          if (typeof regionName === "string") {
            setSearchQuery(regionName);
          }
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
        initialViewState={EUROPE_MAP_VIEW}
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
        </Source>

        {incidents.map((incident) => (
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
        ))}
      </Map>

      {selectedZoneId ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-slate-950/20" />
      ) : null}

      <div className="absolute left-4 top-4 z-20 w-full max-w-sm">
        <form
          onSubmit={submitSearch}
          className="relative rounded-xl border border-slate-600/70 bg-slate-900/85 shadow-lg backdrop-blur-sm"
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
            className="w-full rounded-xl bg-transparent py-3 pl-10 pr-10 text-sm text-slate-100 outline-none placeholder:text-slate-400"
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
              className="absolute bottom-0 right-2 top-0 my-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
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
