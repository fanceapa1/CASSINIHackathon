export interface EurostatCountryPopulation {
  value: number;
  timePeriod: string | null;
}

interface JsonStatDimension {
  category?: {
    index?: Record<string, number> | string[];
    label?: Record<string, string>;
  };
}

interface JsonStatDataset {
  id?: string[];
  size?: number[];
  value?: Record<string, number | null> | Array<number | null>;
  dimension?: Record<string, JsonStatDimension>;
}

export const eurostatPopulationSource = {
  dataset: "Eurostat demo_r_pjanaggr3",
  label: "Population on 1 January by broad age group, sex and NUTS 3 region",
  url:
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_r_pjanaggr3?sex=T&age=TOTAL&geoLevel=country&lastTimePeriod=1&lang=EN",
};

function invertCategoryIndex(index: Record<string, number> | string[] | undefined): Map<number, string> {
  const byPosition = new Map<number, string>();
  if (!index) {
    return byPosition;
  }

  if (Array.isArray(index)) {
    index.forEach((code, position) => byPosition.set(position, code));
    return byPosition;
  }

  Object.entries(index).forEach(([code, position]) => {
    byPosition.set(position, code);
  });
  return byPosition;
}

function getFirstTimePeriod(dataset: JsonStatDataset): string | null {
  const timeCategory = dataset.dimension?.time?.category;
  const timeLabels = timeCategory?.label;
  if (timeLabels) {
    const firstLabel = Object.values(timeLabels)[0];
    if (firstLabel) {
      return firstLabel;
    }
  }

  const timeIndex = timeCategory?.index;
  if (Array.isArray(timeIndex)) {
    return timeIndex[0] ?? null;
  }

  return timeIndex ? Object.keys(timeIndex)[0] ?? null : null;
}

export async function fetchLatestEurostatCountryPopulations(
  countryCodes: string[],
  signal?: AbortSignal,
): Promise<Record<string, EurostatCountryPopulation>> {
  const response = await fetch(eurostatPopulationSource.url, { signal });
  if (!response.ok) {
    throw new Error(`Eurostat population request failed: ${response.status}`);
  }

  const dataset = (await response.json()) as JsonStatDataset;
  const ids = dataset.id ?? [];
  const sizes = dataset.size ?? [];
  const geoDimensionIndex = ids.indexOf("geo");
  const geoSize = sizes[geoDimensionIndex] ?? 0;
  const value = dataset.value;

  if (geoDimensionIndex === -1 || geoSize === 0 || !value) {
    return {};
  }

  const requestedCodes = new Set(countryCodes.map((code) => code.toUpperCase()));
  const geoCodesByPosition = invertCategoryIndex(dataset.dimension?.geo?.category?.index);
  const stride = sizes
    .slice(geoDimensionIndex + 1)
    .reduce((product, size) => product * Math.max(1, size), 1);
  const timePeriod = getFirstTimePeriod(dataset);
  const populations: Record<string, EurostatCountryPopulation> = {};

  Object.entries(value).forEach(([flatIndex, rawPopulation]) => {
    if (typeof rawPopulation !== "number" || !Number.isFinite(rawPopulation)) {
      return;
    }

    const numericIndex = Number(flatIndex);
    if (!Number.isInteger(numericIndex)) {
      return;
    }

    const geoPosition = Math.floor(numericIndex / stride) % geoSize;
    const countryCode = geoCodesByPosition.get(geoPosition);
    if (!countryCode || !requestedCodes.has(countryCode)) {
      return;
    }

    populations[countryCode] = {
      value: rawPopulation,
      timePeriod,
    };
  });

  return populations;
}
