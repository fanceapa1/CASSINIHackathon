#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache", "geoboundaries");
const OUTPUT_DIR = path.join(ROOT, "public", "generated");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "europe-administrative-map.svg");

const VIEW = {
  minLon: -28,
  maxLon: 62,
  minLat: 33,
  maxLat: 72.5,
};

const CANVAS = {
  width: 5200,
  height: 3600,
  marginTop: 290,
  marginRight: 150,
  marginBottom: 170,
  marginLeft: 150,
};

const INCLUDED_COUNTRIES = [
  { iso3: "ALB", name: "Albania" },
  { iso3: "AND", name: "Andorra" },
  { iso3: "ARM", name: "Armenia" },
  { iso3: "AUT", name: "Austria" },
  { iso3: "AZE", name: "Azerbaijan" },
  { iso3: "BEL", name: "Belgium" },
  { iso3: "BGR", name: "Bulgaria" },
  { iso3: "BIH", name: "Bosnia and Herzegovina" },
  { iso3: "BLR", name: "Belarus" },
  { iso3: "CHE", name: "Switzerland" },
  { iso3: "CYP", name: "Cyprus" },
  { iso3: "CZE", name: "Czechia" },
  { iso3: "DEU", name: "Germany" },
  { iso3: "DNK", name: "Denmark" },
  { iso3: "ESP", name: "Spain" },
  { iso3: "EST", name: "Estonia" },
  { iso3: "FIN", name: "Finland" },
  { iso3: "FRA", name: "France" },
  { iso3: "GBR", name: "United Kingdom" },
  { iso3: "GEO", name: "Georgia" },
  { iso3: "GRC", name: "Greece" },
  { iso3: "HRV", name: "Croatia" },
  { iso3: "HUN", name: "Hungary" },
  { iso3: "IRL", name: "Ireland" },
  { iso3: "ISL", name: "Iceland" },
  { iso3: "ITA", name: "Italy" },
  { iso3: "LIE", name: "Liechtenstein" },
  { iso3: "LTU", name: "Lithuania" },
  { iso3: "LUX", name: "Luxembourg" },
  { iso3: "LVA", name: "Latvia" },
  { iso3: "MCO", name: "Monaco" },
  { iso3: "MDA", name: "Moldova" },
  { iso3: "MKD", name: "North Macedonia" },
  { iso3: "MLT", name: "Malta" },
  { iso3: "MNE", name: "Montenegro" },
  { iso3: "NLD", name: "Netherlands" },
  { iso3: "NOR", name: "Norway" },
  { iso3: "POL", name: "Poland" },
  { iso3: "PRT", name: "Portugal" },
  { iso3: "ROU", name: "Romania" },
  { iso3: "RUS", name: "Russia" },
  { iso3: "SMR", name: "San Marino" },
  { iso3: "SRB", name: "Serbia" },
  { iso3: "SVK", name: "Slovakia" },
  { iso3: "SVN", name: "Slovenia" },
  { iso3: "SWE", name: "Sweden" },
  { iso3: "TUR", name: "Turkey" },
  { iso3: "UKR", name: "Ukraine" },
  { iso3: "VAT", name: "Vatican City" },
  { iso3: "XKX", name: "Kosovo" },
];

const MAJOR_COUNTRY_LABELS = [
  { iso3: "GBR", label: "UNITED KINGDOM", coords: [-2.2, 54.8], size: 52 },
  { iso3: "FRA", label: "FRANȚA", coords: [2.1, 46.4], size: 58 },
  { iso3: "DEU", label: "GERMANIA", coords: [10.4, 51.0], size: 54 },
  { iso3: "ESP", label: "SPANIA", coords: [-3.7, 40.2], size: 56 },
  { iso3: "ITA", label: "ITALIA", coords: [12.3, 42.8], size: 52 },
  { iso3: "POL", label: "POLONIA", coords: [19.0, 52.2], size: 50 },
  { iso3: "ROU", label: "ROMÂNIA", coords: [24.8, 45.8], size: 50 },
  { iso3: "UKR", label: "UCRAINA", coords: [31.1, 49.2], size: 52 },
  { iso3: "RUS", label: "RUSIA", coords: [37.5, 57.5], size: 48 },
  { iso3: "TUR", label: "TURCIA", coords: [34.0, 39.1], size: 42 },
  { iso3: "NOR", label: "NORVEGIA", coords: [13.0, 63.7], size: 42 },
  { iso3: "SWE", label: "SUEDIA", coords: [16.5, 61.5], size: 42 },
  { iso3: "GRC", label: "GRECIA", coords: [22.4, 39.3], size: 40 },
];

const CAPITAL_MARKERS = [
  { iso3: "ROU", capital: "BUCUREȘTI", flag: "🇷🇴", coords: [26.1025, 44.4268], dx: 24, dy: -10 },
  { iso3: "GBR", capital: "LONDON", flag: "🇬🇧", coords: [-0.1276, 51.5072], dx: 22, dy: -10 },
  { iso3: "FRA", capital: "PARIS", flag: "🇫🇷", coords: [2.3522, 48.8566], dx: 22, dy: -10 },
  { iso3: "DEU", capital: "BERLIN", flag: "🇩🇪", coords: [13.405, 52.52], dx: 24, dy: -12 },
  { iso3: "ITA", capital: "ROMA", flag: "🇮🇹", coords: [12.4964, 41.9028], dx: 24, dy: -10 },
  { iso3: "ESP", capital: "MADRID", flag: "🇪🇸", coords: [-3.7038, 40.4168], dx: 24, dy: -10 },
  { iso3: "POL", capital: "WARSZAWA", flag: "🇵🇱", coords: [21.0122, 52.2297], dx: 24, dy: -10 },
  { iso3: "UKR", capital: "KYIV", flag: "🇺🇦", coords: [30.5234, 50.4501], dx: 24, dy: -10 },
  { iso3: "MDA", capital: "CHIȘINĂU", flag: "🇲🇩", coords: [28.8638, 47.0105], dx: 24, dy: -10 },
  { iso3: "GRC", capital: "ATHENS", flag: "🇬🇷", coords: [23.7275, 37.9838], dx: 24, dy: -10 },
  { iso3: "SWE", capital: "STOCKHOLM", flag: "🇸🇪", coords: [18.0686, 59.3293], dx: 24, dy: -10 },
  { iso3: "NOR", capital: "OSLO", flag: "🇳🇴", coords: [10.7522, 59.9139], dx: 24, dy: -10 },
  { iso3: "TUR", capital: "ANKARA", flag: "🇹🇷", coords: [32.8597, 39.9334], dx: 24, dy: -10 },
  { iso3: "RUS", capital: "MOSCOW", flag: "🇷🇺", coords: [37.6173, 55.7558], dx: 24, dy: -10 },
];

const SUBDIVISION_LABEL_PREFERENCES = {
  ROU: ["Bucuresti", "București", "Cluj", "Timiș", "Timis", "Iași", "Iasi"],
  GBR: ["Greater London", "Highland", "North Yorkshire", "Kent", "Essex"],
  FRA: ["Ile-de-France", "Île-de-France", "Auvergne-Rhone-Alpes", "Nouvelle-Aquitaine", "Bretagne"],
  DEU: ["Bayern", "Nordrhein-Westfalen", "Niedersachsen", "Baden-Wurttemberg", "Berlin"],
  ESP: ["Cataluna", "Cataluña", "Andalucia", "Andalucía", "Comunidad de Madrid", "Castilla y Leon", "Castilla y León"],
  ITA: ["Lombardia", "Lazio", "Piemonte", "Sicilia"],
  POL: ["Mazowieckie", "Malopolskie", "Małopolskie", "Dolnoslaskie", "Dolnośląskie", "Slaskie", "Śląskie"],
  UKR: ["Kyiv", "Kyiv City", "Lviv", "Odesa", "Kharkiv"],
  SWE: ["Stockholms", "Vastra Gotaland", "Västra Götaland", "Skane", "Skåne"],
  NOR: ["Oslo", "Vestland", "Nordland", "Troms", "Finnmark"],
  GRC: ["Attica", "Central Macedonia", "Crete", "Thessaly"],
  TUR: ["Istanbul", "Ankara", "Izmir", "Antalya"],
  MDA: ["Chisinau", "Chișinău", "Balti", "Bălți", "Gagauzia"],
};

const title = "MAPA ADMINISTRATIVĂ A EUROPEI (ADMINISTRATIVE MAP OF EUROPE)";
const subtitle = "(COUNTRIES AND THEIR FIRST-LEVEL SUBDIVISIONS / COUNTIES)";

const mapFrame = {
  x: CANVAS.marginLeft,
  y: CANVAS.marginTop,
  width: CANVAS.width - CANVAS.marginLeft - CANVAS.marginRight,
  height: CANVAS.height - CANVAS.marginTop - CANVAS.marginBottom,
};

const viewMinMercY = mercatorY(VIEW.maxLat);
const viewMaxMercY = mercatorY(VIEW.minLat);

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const countries = [];
  for (const country of INCLUDED_COUNTRIES) {
    const adm0 = await getBoundaryData(country.iso3, "ADM0");
    if (!adm0) {
      continue;
    }

    const adm1 = await getBoundaryData(country.iso3, "ADM1");
    countries.push({
      ...country,
      adm0,
      adm1,
    });
  }

  if (countries.length === 0) {
    throw new Error("No boundary data was downloaded.");
  }

  const countryPaths = [];
  const regionPaths = [];

  for (const country of countries) {
    const countryFeature = buildFeatureRecord(country.adm0.features[0], country.iso3, country.name);
    if (countryFeature) {
      countryPaths.push({
        iso3: country.iso3,
        path: countryFeature.path,
      });
    }

    if (!country.adm1) {
      continue;
    }

    for (const feature of country.adm1.features) {
      const record = buildFeatureRecord(feature, country.iso3, country.name);
      if (!record || record.area < 18) {
        continue;
      }
      regionPaths.push({
        iso3: country.iso3,
        name: record.name,
        path: record.path,
        area: record.area,
        labelPoint: record.labelPoint,
        color: regionColor(country.iso3, record.name),
      });
    }
  }

  regionPaths.sort((left, right) => right.area - left.area);

  const labelBoxes = [];
  const countryLabelsSvg = [];
  for (const label of MAJOR_COUNTRY_LABELS) {
    const point = project(label.coords);
    if (!point) {
      continue;
    }

    const placed = placeText(labelBoxes, point.x, point.y, label.label, label.size, 0, 0, 18);
    if (!placed) {
      continue;
    }

    countryLabelsSvg.push(
      `<g class="country-label">` +
        `<text x="${fixed(placed.x)}" y="${fixed(placed.y)}" class="country-label-shadow" font-size="${label.size}" text-anchor="middle">${escapeXml(label.label)}</text>` +
        `<text x="${fixed(placed.x)}" y="${fixed(placed.y)}" class="country-label-fill" font-size="${label.size}" text-anchor="middle">${escapeXml(label.label)}</text>` +
      `</g>`,
    );
  }

  const capitalLabelsSvg = [];
  for (const capital of CAPITAL_MARKERS) {
    const point = project(capital.coords);
    if (!point) {
      continue;
    }

    const placed = placeText(
      labelBoxes,
      point.x + capital.dx,
      point.y + capital.dy,
      `${capital.flag} ${capital.capital}`,
      22,
      0,
      0,
      10,
    );
    if (!placed) {
      continue;
    }

    capitalLabelsSvg.push(
      `<g class="capital-label">` +
        `<circle cx="${fixed(point.x)}" cy="${fixed(point.y)}" r="7" class="capital-dot" />` +
        `<circle cx="${fixed(point.x)}" cy="${fixed(point.y)}" r="12" class="capital-halo" />` +
        `<text x="${fixed(placed.x)}" y="${fixed(placed.y)}" class="capital-shadow" font-size="22" text-anchor="middle">${escapeXml(`${capital.flag} ${capital.capital}`)}</text>` +
        `<text x="${fixed(placed.x)}" y="${fixed(placed.y)}" class="capital-fill" font-size="22" text-anchor="middle">${escapeXml(`${capital.flag} ${capital.capital}`)}</text>` +
      `</g>`,
    );
  }

  const subdivisionLabelsSvg = [];
  for (const country of INCLUDED_COUNTRIES) {
    const countryRegions = regionPaths.filter((region) => region.iso3 === country.iso3);
    if (countryRegions.length === 0) {
      continue;
    }

    const selected = selectSubdivisionLabels(country.iso3, countryRegions);
    for (const region of selected) {
      const placed = placeText(
        labelBoxes,
        region.labelPoint.x,
        region.labelPoint.y,
        region.name.toUpperCase(),
        region.area > 1200 ? 18 : 15,
        0,
        0,
        8,
      );
      if (!placed) {
        continue;
      }

      subdivisionLabelsSvg.push(
        `<g class="subdivision-label">` +
          `<text x="${fixed(placed.x)}" y="${fixed(placed.y)}" class="subdivision-shadow" font-size="${region.area > 1200 ? 18 : 15}" text-anchor="middle">${escapeXml(region.name.toUpperCase())}</text>` +
          `<text x="${fixed(placed.x)}" y="${fixed(placed.y)}" class="subdivision-fill" font-size="${region.area > 1200 ? 18 : 15}" text-anchor="middle">${escapeXml(region.name.toUpperCase())}</text>` +
        `</g>`,
      );
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">`,
    `<defs>`,
    `<linearGradient id="seaGradient" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="#07131f" />`,
    `<stop offset="48%" stop-color="#112538" />`,
    `<stop offset="100%" stop-color="#0b1d2d" />`,
    `</linearGradient>`,
    `<linearGradient id="titleGradient" x1="0%" y1="0%" x2="100%" y2="0%">`,
    `<stop offset="0%" stop-color="#f7fbff" />`,
    `<stop offset="100%" stop-color="#d5e8ff" />`,
    `</linearGradient>`,
    `<filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">`,
    `<feGaussianBlur stdDeviation="5" result="blur" />`,
    `<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>`,
    `</filter>`,
    `<clipPath id="mapClip">`,
    `<rect x="${mapFrame.x}" y="${mapFrame.y}" width="${mapFrame.width}" height="${mapFrame.height}" rx="28" />`,
    `</clipPath>`,
    `</defs>`,
    `<style>`,
    `text { font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; }`,
    `.title { font-size: 62px; font-weight: 800; letter-spacing: 1.5px; fill: url(#titleGradient); }`,
    `.subtitle { font-size: 26px; font-weight: 600; letter-spacing: 1.4px; fill: #9ac3f7; }`,
    `.source-note { font-size: 20px; fill: #7ea2cf; }`,
    `.country-label-shadow, .capital-shadow, .subdivision-shadow { fill: rgba(5, 10, 18, 0.84); stroke: rgba(5, 10, 18, 0.84); stroke-width: 12px; paint-order: stroke; stroke-linejoin: round; }`,
    `.country-label-fill { fill: rgba(236, 244, 255, 0.92); font-weight: 800; letter-spacing: 4px; }`,
    `.capital-fill { fill: #eef7ff; font-weight: 800; letter-spacing: 1px; }`,
    `.subdivision-fill { fill: rgba(240, 246, 255, 0.86); font-weight: 700; letter-spacing: 0.8px; }`,
    `.capital-dot { fill: #f9fafb; stroke: #1f2937; stroke-width: 2px; }`,
    `.capital-halo { fill: none; stroke: rgba(249, 250, 251, 0.25); stroke-width: 3px; }`,
    `.frame { fill: none; stroke: rgba(255, 255, 255, 0.18); stroke-width: 2px; }`,
    `.grid { stroke: rgba(148, 163, 184, 0.18); stroke-width: 1.3px; stroke-dasharray: 6 10; }`,
    `</style>`,
    `<rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#seaGradient)" />`,
    buildBackdrop(),
    `<text x="${CANVAS.marginLeft}" y="96" class="title">${escapeXml(title)}</text>`,
    `<text x="${CANVAS.marginLeft}" y="140" class="subtitle">${escapeXml(subtitle)}</text>`,
    `<text x="${CANVAS.marginLeft}" y="${CANVAS.height - 44}" class="source-note">Official boundaries: geoBoundaries gbOpen (ADM0 + ADM1 simplified GeoJSON). Styling and labeling generated locally.</text>`,
    `<rect x="${mapFrame.x}" y="${mapFrame.y}" width="${mapFrame.width}" height="${mapFrame.height}" rx="28" fill="rgba(6, 16, 26, 0.28)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />`,
    buildGrid(),
    `<g clip-path="url(#mapClip)">`,
    ...regionPaths.map((region) => `<path d="${region.path}" fill="${region.color}" fill-opacity="0.92" fill-rule="evenodd" stroke="rgba(14, 23, 37, 0.72)" stroke-width="1.2" stroke-linejoin="round" />`),
    `</g>`,
    `<g clip-path="url(#mapClip)">`,
    ...countryPaths.map((country) => `<path d="${country.path}" fill="none" fill-rule="evenodd" stroke="rgba(248, 250, 252, 0.92)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#softGlow)" />`),
    ...countryPaths.map((country) => `<path d="${country.path}" fill="none" fill-rule="evenodd" stroke="rgba(253, 224, 71, 0.7)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />`),
    `</g>`,
    ...countryLabelsSvg,
    ...capitalLabelsSvg,
    ...subdivisionLabelsSvg,
    `<rect x="${mapFrame.x}" y="${mapFrame.y}" width="${mapFrame.width}" height="${mapFrame.height}" rx="28" class="frame" />`,
    `</svg>`,
  ].join("");

  await writeFile(OUTPUT_FILE, svg, "utf8");
  console.log(`Saved ${OUTPUT_FILE}`);
}

function buildBackdrop() {
  const ornaments = [];
  for (let index = 0; index < 10; index += 1) {
    const cx = 600 + index * 460;
    const cy = index % 2 === 0 ? 520 : 3280;
    const radius = index % 2 === 0 ? 260 : 220;
    ornaments.push(
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgba(56, 189, 248, 0.03)" />`,
      `<circle cx="${cx + 120}" cy="${cy + (index % 2 === 0 ? 80 : -80)}" r="${radius * 0.45}" fill="rgba(251, 191, 36, 0.03)" />`,
    );
  }
  return ornaments.join("");
}

function buildGrid() {
  const lines = [];
  const verticalSteps = 8;
  const horizontalSteps = 6;
  for (let index = 1; index < verticalSteps; index += 1) {
    const x = mapFrame.x + (mapFrame.width * index) / verticalSteps;
    lines.push(`<line x1="${fixed(x)}" y1="${mapFrame.y}" x2="${fixed(x)}" y2="${mapFrame.y + mapFrame.height}" class="grid" />`);
  }
  for (let index = 1; index < horizontalSteps; index += 1) {
    const y = mapFrame.y + (mapFrame.height * index) / horizontalSteps;
    lines.push(`<line x1="${mapFrame.x}" y1="${fixed(y)}" x2="${mapFrame.x + mapFrame.width}" y2="${fixed(y)}" class="grid" />`);
  }
  return lines.join("");
}

async function getBoundaryData(iso3, level) {
  const metadataCache = path.join(CACHE_DIR, `${iso3}-${level}-metadata.json`);
  const geometryCache = path.join(CACHE_DIR, `${iso3}-${level}.geojson`);

  let metadata = await readJsonIfExists(metadataCache);
  if (!metadata) {
    metadata = await fetchJson(`https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${level}/`);
    if (!metadata) {
      return null;
    }
    await writeFile(metadataCache, JSON.stringify(metadata, null, 2));
  }

  let geometry = await readJsonIfExists(geometryCache);
  if (!geometry) {
    const downloadUrl = metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL;
    geometry = await fetchJson(downloadUrl);
    if (!geometry) {
      return null;
    }
    await writeFile(geometryCache, JSON.stringify(geometry));
  }

  return geometry;
}

async function readJsonIfExists(filePath) {
  try {
    await stat(filePath);
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "codex-europe-admin-map-generator",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

function buildFeatureRecord(feature, iso3, fallbackName) {
  if (!feature?.geometry) {
    return null;
  }

  const name = getFeatureName(feature, fallbackName);
  const polygons = geometryToPolygons(feature.geometry)
    .map((polygon) => polygon.map((ring) => ring.map(project).filter(Boolean)))
    .filter((polygon) => polygon.length > 0 && polygon[0].length >= 3);

  if (polygons.length === 0) {
    return null;
  }

  const path = polygonsToPath(polygons);
  if (!path) {
    return null;
  }

  let largestRing = null;
  let largestArea = 0;
  let area = 0;

  for (const polygon of polygons) {
    const outerRing = polygon[0];
    const ringArea = Math.abs(polygonArea(outerRing));
    area += ringArea;
    if (ringArea > largestArea) {
      largestArea = ringArea;
      largestRing = outerRing;
    }
  }

  if (!largestRing) {
    return null;
  }

  const centroid = polygonCentroid(largestRing) ?? bboxCenter(largestRing);
  return {
    iso3,
    name,
    path,
    area,
    labelPoint: centroid,
  };
}

function geometryToPolygons(geometry) {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return [];
}

function polygonsToPath(polygons) {
  const segments = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) {
        continue;
      }
      const [first, ...rest] = ring;
      if (!first) {
        continue;
      }
      segments.push(`M${fixed(first.x)} ${fixed(first.y)}`);
      for (const point of rest) {
        if (!point) {
          continue;
        }
        segments.push(`L${fixed(point.x)} ${fixed(point.y)}`);
      }
      segments.push("Z");
    }
  }
  return segments.join(" ");
}

function getFeatureName(feature, fallbackName) {
  const candidates = [
    feature.properties?.shapeName,
    feature.properties?.shapeName_en,
    feature.properties?.name,
    feature.properties?.NAME_1,
    feature.properties?.NAME_ENGL,
    feature.properties?.adm1_name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return repairMojibake(candidate.trim());
    }
  }

  return fallbackName;
}

function repairMojibake(value) {
  const looksBroken =
    value.includes("Ã") ||
    value.includes("â€") ||
    value.includes("â€™") ||
    value.includes("â€œ") ||
    value.includes("â€") ||
    value.includes("â€“") ||
    value.includes("â€”") ||
    value.includes("Ð");

  if (!looksBroken) {
    return value;
  }

  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function project(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [lon, lat] = coordinates;
  if (typeof lon !== "number" || typeof lat !== "number") {
    return null;
  }

  if (lon < VIEW.minLon - 10 || lon > VIEW.maxLon + 30 || lat < VIEW.minLat - 10 || lat > VIEW.maxLat + 10) {
    return null;
  }

  const xRatio = (lon - VIEW.minLon) / (VIEW.maxLon - VIEW.minLon);
  const mercY = mercatorY(lat);
  const yRatio = (mercY - viewMinMercY) / (viewMaxMercY - viewMinMercY);

  return {
    x: mapFrame.x + xRatio * mapFrame.width,
    y: mapFrame.y + yRatio * mapFrame.height,
  };
}

function mercatorY(lat) {
  const clamped = Math.max(-85, Math.min(85, lat));
  const radians = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function polygonArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    total += current.x * next.y - next.x * current.y;
  }
  return total / 2;
}

function polygonCentroid(ring) {
  const area = polygonArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) < 0.0001) {
    return null;
  }

  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }

  const factor = 1 / (6 * area);
  return { x: x * factor, y: y * factor };
}

function bboxCenter(ring) {
  let minX = ring[0].x;
  let maxX = ring[0].x;
  let minY = ring[0].y;
  let maxY = ring[0].y;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function regionColor(iso3, name) {
  const seed = hashString(`${iso3}-${name}`);
  const hue = seed % 360;
  const saturation = 66 + (seed % 8);
  const lightness = 51 + (seed % 10);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function selectSubdivisionLabels(iso3, regions) {
  const preferredNames = SUBDIVISION_LABEL_PREFERENCES[iso3] ?? [];
  const preferred = [];
  const used = new Set();

  for (const preferredName of preferredNames) {
    const normalizedTarget = normalizeText(preferredName);
    const match = regions.find((region) => {
      const normalizedRegion = normalizeText(region.name);
      return normalizedRegion === normalizedTarget || normalizedRegion.includes(normalizedTarget);
    });
    if (match && !used.has(match.name)) {
      preferred.push(match);
      used.add(match.name);
    }
  }

  const targetCount = preferred.length > 0 ? Math.max(preferred.length, defaultRegionLabelCount(regions.length)) : defaultRegionLabelCount(regions.length);
  const fallback = regions
    .slice()
    .sort((left, right) => right.area - left.area)
    .filter((region) => !used.has(region.name))
    .slice(0, targetCount);

  return [...preferred, ...fallback].slice(0, Math.max(targetCount, preferred.length));
}

function defaultRegionLabelCount(regionCount) {
  if (regionCount >= 20) {
    return 4;
  }
  if (regionCount >= 10) {
    return 3;
  }
  if (regionCount >= 4) {
    return 2;
  }
  return 1;
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function placeText(boxes, x, y, text, fontSize, initialDx, initialDy, padding) {
  const attempts = [
    [initialDx, initialDy],
    [12, -12],
    [-12, 12],
    [0, -18],
    [0, 18],
    [18, 0],
    [-18, 0],
    [24, -20],
    [-24, 20],
  ];
  const width = approximateTextWidth(text, fontSize);
  const height = fontSize * 1.1;

  for (const [dx, dy] of attempts) {
    const candidate = {
      x: x + dx,
      y: y + dy,
      left: x + dx - width / 2 - padding,
      right: x + dx + width / 2 + padding,
      top: y + dy - height / 2 - padding,
      bottom: y + dy + height / 2 + padding,
    };

    if (
      candidate.left < mapFrame.x ||
      candidate.right > mapFrame.x + mapFrame.width ||
      candidate.top < mapFrame.y ||
      candidate.bottom > mapFrame.y + mapFrame.height
    ) {
      continue;
    }

    const overlaps = boxes.some((box) => {
      return !(candidate.right < box.left || candidate.left > box.right || candidate.bottom < box.top || candidate.top > box.bottom);
    });

    if (!overlaps) {
      boxes.push(candidate);
      return candidate;
    }
  }

  return null;
}

function approximateTextWidth(text, fontSize) {
  return text.length * fontSize * 0.62;
}

function fixed(value) {
  return Number(value).toFixed(1);
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
