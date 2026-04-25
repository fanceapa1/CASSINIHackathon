import type { LngLat, RegionGeometry } from "../types/flood";

interface BoundaryFeature {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
}

interface BoundaryCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

export interface AdminBoundaryRegion {
  id: string;
  name: string;
  countryCode: string;
  center: LngLat;
  geometry: RegionGeometry;
}

const iso2ToIso3: Record<string, string> = {
  AT: "AUT",
  BE: "BEL",
  BG: "BGR",
  HR: "HRV",
  CY: "CYP",
  CZ: "CZE",
  DK: "DNK",
  EE: "EST",
  FI: "FIN",
  FR: "FRA",
  DE: "DEU",
  EL: "GRC",
  HU: "HUN",
  IE: "IRL",
  IT: "ITA",
  LV: "LVA",
  LT: "LTU",
  LU: "LUX",
  MT: "MLT",
  NL: "NLD",
  PL: "POL",
  PT: "PRT",
  RO: "ROU",
  SK: "SVK",
  SI: "SVN",
  ES: "ESP",
  SE: "SWE",
  UK: "GBR",
};

const boundaryCache = new globalThis.Map<string, Promise<AdminBoundaryRegion[]>>();

function closeRing(ring: LngLat[]): LngLat[] {
  if (ring.length < 3) {
    return ring;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }
  return [...ring, first];
}

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function parsePolygonCoordinates(value: unknown): LngLat[][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rings: LngLat[][] = [];
  for (const ringValue of value) {
    if (!Array.isArray(ringValue)) {
      return null;
    }
    const ring: LngLat[] = [];
    for (const point of ringValue) {
      if (!isPosition(point)) {
        return null;
      }
      ring.push([point[0], point[1]]);
    }
    if (ring.length < 3) {
      continue;
    }
    rings.push(closeRing(ring));
  }

  return rings.length > 0 ? rings : null;
}

function parseMultiPolygonCoordinates(value: unknown): LngLat[][][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const polygons: LngLat[][][] = [];
  for (const polygonValue of value) {
    const polygonRings = parsePolygonCoordinates(polygonValue);
    if (!polygonRings) {
      return null;
    }
    polygons.push(polygonRings);
  }

  return polygons.length > 0 ? polygons : null;
}

function parseRegionGeometry(feature: BoundaryFeature): RegionGeometry | null {
  if (!feature.geometry || !feature.geometry.type) {
    return null;
  }

  if (feature.geometry.type === "Polygon") {
    const polygon = parsePolygonCoordinates(feature.geometry.coordinates);
    if (!polygon) {
      return null;
    }
    return {
      type: "Polygon",
      coordinates: polygon,
    };
  }

  if (feature.geometry.type === "MultiPolygon") {
    const multiPolygon = parseMultiPolygonCoordinates(feature.geometry.coordinates);
    if (!multiPolygon) {
      return null;
    }
    return {
      type: "MultiPolygon",
      coordinates: multiPolygon,
    };
  }

  return null;
}

function collectGeometryPoints(geometry: RegionGeometry): LngLat[] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flatMap((ring) => ring);
  }
  return geometry.coordinates.flatMap((polygon) => polygon.flatMap((ring) => ring));
}

function getCenterFromGeometry(geometry: RegionGeometry): LngLat {
  const points = collectGeometryPoints(geometry);
  if (points.length === 0) {
    return [0, 0];
  }

  let minLon = points[0][0];
  let maxLon = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];

  points.forEach((point) => {
    minLon = Math.min(minLon, point[0]);
    maxLon = Math.max(maxLon, point[0]);
    minLat = Math.min(minLat, point[1]);
    maxLat = Math.max(maxLat, point[1]);
  });

  return [Number(((minLon + maxLon) / 2).toFixed(6)), Number(((minLat + maxLat) / 2).toFixed(6))];
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function toRegionName(properties: Record<string, unknown>, index: number): string {
  const candidateKeys = [
    "shapeName",
    "shapeName_en",
    "name",
    "NAME_1",
    "NL_NAME_1",
    "adm1_name",
  ];

  for (const key of candidateKeys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return `Region ${index + 1}`;
}

function toRegionId(
  countryCode: string,
  name: string,
  properties: Record<string, unknown>,
  index: number,
): string {
  const preferredId = properties.shapeID ?? properties.shapeISO ?? properties.id;
  if (typeof preferredId === "string" && preferredId.trim().length > 0) {
    return `${countryCode.toLowerCase()}-adm1-${normalizeText(preferredId)}`;
  }
  return `${countryCode.toLowerCase()}-adm1-${normalizeText(name)}-${index + 1}`;
}

function getBoundaryUrls(iso3: string): string[] {
  return [
    `https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/${iso3}/ADM1/geoBoundaries-${iso3}-ADM1.geojson`,
    `https://cdn.jsdelivr.net/gh/wmgeolab/geoBoundaries@main/releaseData/gbOpen/${iso3}/ADM1/geoBoundaries-${iso3}-ADM1.geojson`,
  ];
}

async function fetchBoundaryCollection(url: string): Promise<BoundaryCollection | null> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as BoundaryCollection;
  if (!payload || !Array.isArray(payload.features)) {
    return null;
  }
  return payload;
}

function mapBoundaryFeatures(
  countryCode: string,
  collection: BoundaryCollection,
): AdminBoundaryRegion[] {
  return collection.features
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const geometry = parseRegionGeometry(feature);
      if (!geometry) {
        return null;
      }

      const name = toRegionName(properties, index);
      return {
        id: toRegionId(countryCode, name, properties, index),
        name,
        countryCode,
        center: getCenterFromGeometry(geometry),
        geometry,
      };
    })
    .filter((region): region is AdminBoundaryRegion => region !== null);
}

async function loadCountryAdminRegions(countryCode: string): Promise<AdminBoundaryRegion[]> {
  const iso3 = iso2ToIso3[countryCode];
  if (!iso3) {
    return [];
  }

  const urls = getBoundaryUrls(iso3);
  for (const url of urls) {
    try {
      const collection = await fetchBoundaryCollection(url);
      if (!collection) {
        continue;
      }
      const regions = mapBoundaryFeatures(countryCode, collection);
      if (regions.length > 0) {
        return regions;
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function getCountryAdminRegions(countryCode: string): Promise<AdminBoundaryRegion[]> {
  const normalizedCode = countryCode.toUpperCase();
  const existing = boundaryCache.get(normalizedCode);
  if (existing) {
    return existing;
  }

  const request = loadCountryAdminRegions(normalizedCode).catch(() => []);
  boundaryCache.set(normalizedCode, request);
  return request;
}
