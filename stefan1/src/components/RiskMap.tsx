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

const EUROPE_GLOBE_VIEW = {
  longitude: 12.5,
  latitude: 50.5,
  zoom: 2.25,
  pitch: 0,
  bearing: 0,
};

function getCountryFillLayer(selectedZoneId: string | null): LayerProps {
  return {
    id: "risk-zone-fill",
    type: "fill",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "riskLevel"]], 0],
        0,
        "rgba(34, 197, 94, 0.34)",
        50,
        "rgba(245, 158, 11, 0.46)",
        100,
        "rgba(239, 68, 68, 0.62)",
      ] as unknown as never,
      "fill-opacity": [
        "case",
        ["==", ["get", "id"], selectedZoneId ?? ""],
        0.9,
        0.58,
      ] as unknown as never,
      "fill-outline-color": "rgba(241, 245, 249, 0.24)",
    },
  };
}

function getDimUnselectedCountriesLayer(selectedZoneId: string): LayerProps {
  return {
    id: "risk-zone-dim",
    type: "fill",
    filter: ["!=", ["get", "id"], selectedZoneId] as unknown as never,
    paint: {
      "fill-color": "rgba(2, 6, 23, 0.70)",
      "fill-opacity": 0.4,
    },
  };
}

const countryOutlineLayer: LayerProps = {
  id: "risk-zone-outline",
  type: "line",
  paint: {
    "line-color": "rgba(148, 163, 184, 0.70)",
    "line-width": 1.2,
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

const regionFillLayer: LayerProps = {
  id: "risk-region-fill",
  type: "fill",
  paint: {
    "fill-color": [
      "interpolate",
      ["linear"],
      ["coalesce", ["to-number", ["get", "riskLevel"]], 0],
      0,
      "rgba(74, 222, 128, 0.24)",
      50,
      "rgba(250, 204, 21, 0.30)",
      100,
      "rgba(244, 63, 94, 0.42)",
    ] as unknown as never,
    "fill-opacity": 0.78,
  },
};

function getRegionDimLayer(selectedRegionId: string): LayerProps {
  return {
    id: "risk-region-dim",
    type: "fill",
    filter: ["!=", ["get", "id"], selectedRegionId] as unknown as never,
    paint: {
      "fill-color": "rgba(15, 23, 42, 0.55)",
      "fill-opacity": 0.42,
    },
  };
}

const regionOutlineLayer: LayerProps = {
  id: "risk-region-outline",
  type: "line",
  paint: {
    "line-color": "rgba(148, 163, 184, 0.72)",
    "line-width": 1.1,
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

  if (Array.isArray(region.polygon) && region.polygon.length >= 3) {
    return {
      type: "Polygon",
      coordinates: [closePolygonRing(region.polygon as [number, number][])],
    };
  }

  return null;
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
      .filter(
        (zone) =>
          !matchedCountryCodes.has(zone.countryCode) &&
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
    if (!selectedZone) {
      return [];
    }
    return regions
      .filter((region) => region.countryId === selectedZone.id)
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
  }, [selectedZone, regions]);

  const regionsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: regionFeatureList,
    }),
    [regionFeatureList],
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
      mapRef.current.flyTo({
        center: selectedRegion.center,
        zoom: 7.8,
        pitch: 42,
        bearing: 12,
        duration: 1100,
        essential: true,
      });
      const handle = window.setTimeout(updateFocusAnchor, 220);
      return () => window.clearTimeout(handle);
    }

    if (selectedZone) {
      mapRef.current.flyTo({
        center: selectedZone.center,
        zoom: 5.4,
        pitch: 44,
        bearing: 10,
        duration: 1300,
        essential: true,
      });
      const handle = window.setTimeout(updateFocusAnchor, 220);
      return () => window.clearTimeout(handle);
    }

    onFocusAnchorChange?.(null);
    mapRef.current.flyTo({
      center: [EUROPE_GLOBE_VIEW.longitude, EUROPE_GLOBE_VIEW.latitude],
      zoom: EUROPE_GLOBE_VIEW.zoom,
      pitch: EUROPE_GLOBE_VIEW.pitch,
      bearing: EUROPE_GLOBE_VIEW.bearing,
      duration: 1100,
      essential: true,
    });
  }, [selectedZone, selectedRegion, onFocusAnchorChange, updateFocusAnchor]);

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
      if (typeof regionId === "string" && typeof regionCountryId === "string") {
        onSelectZone(regionCountryId);
        onSelectRegion(regionId);
        const clickedRegionData = regions.find((region) => region.id === regionId);
        if (clickedRegionData) {
          setSearchQuery(clickedRegionData.name);
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

  const interactiveLayerIds = useMemo(() => {
    const ids = ["risk-zone-fill"];
    if (selectedZone) {
      ids.unshift("risk-region-fill");
    }
    return ids;
  }, [selectedZone]);

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={BASE_MAP_STYLE}
        projection={selectedZoneId ? "mercator" : "globe"}
        initialViewState={EUROPE_GLOBE_VIEW}
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
          {selectedZoneId ? <Layer {...getDimUnselectedCountriesLayer(selectedZoneId)} /> : null}
          <Layer {...getCountryFillLayer(selectedZoneId)} />
          <Layer {...countryOutlineLayer} />
          {selectedZoneId ? <Layer {...getSelectedCountryOutlineLayer(selectedZoneId)} /> : null}
        </Source>

        {selectedZone ? (
          <Source id="risk-regions" type="geojson" data={regionsGeoJson as never}>
            {selectedRegionId ? <Layer {...getRegionDimLayer(selectedRegionId)} /> : null}
            <Layer {...regionFillLayer} />
            <Layer {...regionOutlineLayer} />
            {selectedRegionId ? <Layer {...getSelectedRegionOutlineLayer(selectedRegionId)} /> : null}
          </Source>
        ) : null}

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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
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
