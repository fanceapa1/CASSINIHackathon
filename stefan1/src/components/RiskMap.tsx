import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import { Search, X } from "lucide-react";
import type { FormEvent } from "react";
import type { LayerProps, MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import type { FloodZoneWithRisk, MapAnchorPoint, ReportedIncident } from "../types/flood";
import "maplibre-gl/dist/maplibre-gl.css";

interface RiskMapProps {
  zones: FloodZoneWithRisk[];
  selectedZoneId: string | null;
  incidents: ReportedIncident[];
  onSelectZone: (zoneId: string | null) => void;
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

const BASE_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const EUROPE_GLOBE_VIEW = {
  longitude: 12.5,
  latitude: 50.5,
  zoom: 2.25,
  pitch: 0,
  bearing: 0,
};

function getRiskFillLayer(selectedZoneId: string | null): LayerProps {
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

function getDimUnselectedLayer(selectedZoneId: string): LayerProps {
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

const zoneOutlineLayer: LayerProps = {
  id: "risk-zone-outline",
  type: "line",
  paint: {
    "line-color": "rgba(148, 163, 184, 0.70)",
    "line-width": 1.2,
  },
};

function getSelectedOutlineLayer(selectedZoneId: string): LayerProps {
  return {
    id: "risk-zone-outline-selected",
    type: "line",
    filter: ["==", ["get", "id"], selectedZoneId] as unknown as never,
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

export function RiskMap({
  zones,
  selectedZoneId,
  incidents,
  onSelectZone,
  onFocusAnchorChange,
}: RiskMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [officialCountries, setOfficialCountries] = useState<OfficialCountryCollection | null>(
    null,
  );

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
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

    const merged = officialFeatures
      .map((feature) => {
        const zone = byCountryCode.get(feature.properties.CNTR_ID);
        if (!zone) {
          return null;
        }
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

    if (merged.length > 0) {
      return {
        type: "FeatureCollection",
        features: merged,
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

  const filteredZones = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return zones.slice(0, 7);
    }
    return zones.filter((zone) => zone.name.toLowerCase().includes(normalized)).slice(0, 7);
  }, [zones, searchQuery]);

  const updateFocusAnchor = useCallback(() => {
    if (!selectedZone || !mapRef.current || !onFocusAnchorChange) {
      onFocusAnchorChange?.(null);
      return;
    }
    const projected = mapRef.current.project(selectedZone.center);
    onFocusAnchorChange({ x: projected.x, y: projected.y });
  }, [selectedZone, onFocusAnchorChange]);

  useEffect(() => {
    if (!selectedZone || !mapRef.current) {
      onFocusAnchorChange?.(null);
      mapRef.current?.flyTo({
        center: [EUROPE_GLOBE_VIEW.longitude, EUROPE_GLOBE_VIEW.latitude],
        zoom: EUROPE_GLOBE_VIEW.zoom,
        pitch: EUROPE_GLOBE_VIEW.pitch,
        bearing: EUROPE_GLOBE_VIEW.bearing,
        duration: 1100,
        essential: true,
      });
      return;
    }

    mapRef.current.flyTo({
      center: selectedZone.center,
      zoom: 5.4,
      pitch: 48,
      bearing: 12,
      duration: 1500,
      essential: true,
    });

    const handle = window.setTimeout(() => {
      updateFocusAnchor();
    }, 220);

    return () => window.clearTimeout(handle);
  }, [selectedZone, onFocusAnchorChange, updateFocusAnchor]);

  useEffect(() => {
    if (selectedZone) {
      setSearchQuery(selectedZone.name);
      return;
    }
    setSearchQuery("");
  }, [selectedZone]);

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const exactMatch = zones.find(
        (zone) => zone.name.toLowerCase() === searchQuery.trim().toLowerCase(),
      );
      const fallbackMatch = filteredZones[0];
      const target = exactMatch ?? fallbackMatch;
      if (!target) {
        return;
      }
      onSelectZone(target.id);
      setSearchQuery(target.name);
      setShowSuggestions(false);
    },
    [zones, searchQuery, filteredZones, onSelectZone],
  );

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const clickedFeature = event.features?.find((feature) => feature.layer?.id === "risk-zone-fill");
      const featureId = clickedFeature?.properties?.id;

      if (typeof featureId === "string") {
        onSelectZone(featureId);
        const clickedZone = zones.find((zone) => zone.id === featureId);
        if (clickedZone) {
          setSearchQuery(clickedZone.name);
        }
        return;
      }

      onSelectZone(null);
      setShowSuggestions(false);
    },
    [onSelectZone, zones],
  );

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={BASE_MAP_STYLE}
        projection={selectedZoneId ? "mercator" : "globe"}
        initialViewState={EUROPE_GLOBE_VIEW}
        interactiveLayerIds={["risk-zone-fill"]}
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
          {selectedZoneId ? <Layer {...getDimUnselectedLayer(selectedZoneId)} /> : null}
          <Layer {...getRiskFillLayer(selectedZoneId)} />
          <Layer {...zoneOutlineLayer} />
          {selectedZoneId ? <Layer {...getSelectedOutlineLayer(selectedZoneId)} /> : null}
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
                Incident raportat
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
            placeholder="Cauta tara din UE si zoom..."
            className="w-full rounded-xl bg-transparent py-3 pl-10 pr-10 text-sm text-slate-100 outline-none placeholder:text-slate-400"
          />
          {selectedZoneId ? (
            <button
              type="button"
              onClick={() => {
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

          {showSuggestions && filteredZones.length > 0 ? (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/95">
              {filteredZones.map((zone) => (
                <button
                  type="button"
                  key={zone.id}
                  className="block w-full border-b border-slate-700/70 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800/90 last:border-b-0"
                  onClick={() => {
                    setSearchQuery(zone.name);
                    setShowSuggestions(false);
                    onSelectZone(zone.id);
                  }}
                >
                  {zone.name}
                </button>
              ))}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
