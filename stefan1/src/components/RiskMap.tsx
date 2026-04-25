import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Map, {
  Layer,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import { Search } from "lucide-react";
import type { FormEvent } from "react";
import type { LayerProps, MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import type { FloodZoneWithRisk, MapAnchorPoint } from "../types/flood";
import "maplibre-gl/dist/maplibre-gl.css";

interface RiskMapProps {
  zones: FloodZoneWithRisk[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  onFocusAnchorChange?: (anchor: MapAnchorPoint | null) => void;
}

const BASE_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const DEFAULT_VIEW_STATE = {
  longitude: -90.0715,
  latitude: 29.9732,
  zoom: 10.1,
  pitch: 38,
  bearing: 11,
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
        0.88,
        0.6,
      ] as unknown as never,
      "fill-outline-color": "rgba(241, 245, 249, 0.22)",
    },
  };
}

function getDimUnselectedLayer(selectedZoneId: string): LayerProps {
  return {
    id: "risk-zone-dim",
    type: "fill",
    filter: ["!=", ["get", "id"], selectedZoneId] as unknown as never,
    paint: {
      "fill-color": "rgba(2, 6, 23, 0.66)",
      "fill-opacity": 0.36,
    },
  };
}

const zoneOutlineLayer: LayerProps = {
  id: "risk-zone-outline",
  type: "line",
  paint: {
    "line-color": "rgba(148, 163, 184, 0.65)",
    "line-width": 1.25,
  },
};

function getSelectedOutlineLayer(selectedZoneId: string): LayerProps {
  return {
    id: "risk-zone-outline-selected",
    type: "line",
    filter: ["==", ["get", "id"], selectedZoneId] as unknown as never,
    paint: {
      "line-color": "rgba(251, 191, 36, 0.95)",
      "line-width": 3,
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
  onSelectZone,
  onFocusAnchorChange,
}: RiskMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  const zonesGeoJson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: zones.map((zone) => ({
        type: "Feature",
        properties: {
          id: zone.id,
          name: zone.name,
          riskLevel: zone.riskLevel,
        },
        geometry: {
          type: "Polygon",
          coordinates: [closePolygonRing(zone.polygon)],
        },
      })),
    }),
    [zones],
  );

  const filteredZones = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return zones.slice(0, 5);
    }
    return zones
      .filter((zone) => zone.name.toLowerCase().includes(normalized))
      .slice(0, 5);
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
      return;
    }

    mapRef.current.flyTo({
      center: selectedZone.center,
      zoom: 12.8,
      pitch: 54,
      bearing: 20,
      duration: 1600,
      essential: true,
    });

    const handle = window.setTimeout(() => {
      updateFocusAnchor();
    }, 200);

    return () => window.clearTimeout(handle);
  }, [selectedZone, onFocusAnchorChange, updateFocusAnchor]);

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
      const clickedFeature = event.features?.find(
        (feature) => feature.layer?.id === "risk-zone-fill",
      );

      const featureId = clickedFeature?.properties?.id;
      if (typeof featureId === "string") {
        onSelectZone(featureId);
        const clickedZone = zones.find((zone) => zone.id === featureId);
        if (clickedZone) {
          setSearchQuery(clickedZone.name);
        }
      }
    },
    [onSelectZone, zones],
  );

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={BASE_MAP_STYLE}
        initialViewState={DEFAULT_VIEW_STATE}
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
      </Map>

      {selectedZoneId ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-slate-950/20" />
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
            placeholder="Search zone and zoom..."
            className="w-full rounded-xl bg-transparent py-3 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-400"
          />

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
