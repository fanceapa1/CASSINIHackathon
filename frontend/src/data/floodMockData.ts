import type { FloodZone, HistoricalSimulation, LngLat } from "../types/flood";

interface EUZoneSeed {
  countryCode: string;
  name: string;
  center: LngLat;
}

export interface InformFloodScore {
  riverFloodScore010: number;
  coastalFloodScore010: number;
  combinedFloodScore010: number;
  combinedFloodScore100: number;
}

const euZoneSeeds: EUZoneSeed[] = [
  { countryCode: "AT", name: "Austria", center: [14.5, 47.5] },
  { countryCode: "BE", name: "Belgium", center: [4.7, 50.8] },
  { countryCode: "BG", name: "Bulgaria", center: [25.3, 42.7] },
  { countryCode: "HR", name: "Croatia", center: [16.4, 45.3] },
  { countryCode: "CY", name: "Cyprus", center: [33.0, 35.0] },
  { countryCode: "CZ", name: "Czechia", center: [15.4, 49.8] },
  { countryCode: "DK", name: "Denmark", center: [10.0, 56.1] },
  { countryCode: "EE", name: "Estonia", center: [25.5, 58.8] },
  { countryCode: "FI", name: "Finland", center: [25.5, 64.5] },
  { countryCode: "FR", name: "France", center: [2.5, 46.3] },
  { countryCode: "DE", name: "Germany", center: [10.4, 51.1] },
  { countryCode: "EL", name: "Greece", center: [22.9, 39.1] },
  { countryCode: "HU", name: "Hungary", center: [19.2, 47.2] },
  { countryCode: "IE", name: "Ireland", center: [-8.0, 53.4] },
  { countryCode: "IT", name: "Italy", center: [12.4, 42.9] },
  { countryCode: "LV", name: "Latvia", center: [24.8, 56.9] },
  { countryCode: "LT", name: "Lithuania", center: [23.9, 55.3] },
  { countryCode: "LU", name: "Luxembourg", center: [6.1, 49.8] },
  { countryCode: "MT", name: "Malta", center: [14.4, 35.9] },
  { countryCode: "NL", name: "Netherlands", center: [5.4, 52.2] },
  { countryCode: "PL", name: "Poland", center: [19.3, 52.2] },
  { countryCode: "PT", name: "Portugal", center: [-8.1, 39.6] },
  { countryCode: "RO", name: "Romania", center: [24.9, 45.9] },
  { countryCode: "SK", name: "Slovakia", center: [19.5, 48.7] },
  { countryCode: "SI", name: "Slovenia", center: [14.9, 46.1] },
  { countryCode: "ES", name: "Spain", center: [-3.7, 40.2] },
  { countryCode: "SE", name: "Sweden", center: [16.9, 62.3] },
];

export const informRiskDataSource = {
  dataset: "INFORM Risk Index 2026 (JRC/DRMKC)",
  workbook: "INFORM_Risk_2026_v072.xlsx",
  url: "https://drmkc.jrc.ec.europa.eu/inform-index/INFORM-Risk/Results-and-data",
  scoringMethod:
    "combinedFloodScore010 = max(River Flood, Coastal flood), rescaled to 0-100",
};

export const informFloodScores2026ByIso2: Record<string, InformFloodScore> = {
  AT: { riverFloodScore010: 7.2, coastalFloodScore010: 0.0, combinedFloodScore010: 7.2, combinedFloodScore100: 72 },
  BE: { riverFloodScore010: 6.2, coastalFloodScore010: 7.7, combinedFloodScore010: 7.7, combinedFloodScore100: 77 },
  BG: { riverFloodScore010: 5.1, coastalFloodScore010: 2.9, combinedFloodScore010: 5.1, combinedFloodScore100: 51 },
  HR: { riverFloodScore010: 6.8, coastalFloodScore010: 5.0, combinedFloodScore010: 6.8, combinedFloodScore100: 68 },
  CY: { riverFloodScore010: 0.0, coastalFloodScore010: 2.9, combinedFloodScore010: 2.9, combinedFloodScore100: 29 },
  CZ: { riverFloodScore010: 5.7, coastalFloodScore010: 0.0, combinedFloodScore010: 5.7, combinedFloodScore100: 57 },
  DK: { riverFloodScore010: 0.0, coastalFloodScore010: 7.1, combinedFloodScore010: 7.1, combinedFloodScore100: 71 },
  EE: { riverFloodScore010: 5.4, coastalFloodScore010: 2.2, combinedFloodScore010: 5.4, combinedFloodScore100: 54 },
  FI: { riverFloodScore010: 6.2, coastalFloodScore010: 5.3, combinedFloodScore010: 6.2, combinedFloodScore100: 62 },
  FR: { riverFloodScore010: 7.5, coastalFloodScore010: 7.4, combinedFloodScore010: 7.5, combinedFloodScore100: 75 },
  DE: { riverFloodScore010: 7.8, coastalFloodScore010: 8.0, combinedFloodScore010: 8.0, combinedFloodScore100: 80 },
  EL: { riverFloodScore010: 3.8, coastalFloodScore010: 5.0, combinedFloodScore010: 5.0, combinedFloodScore100: 50 },
  HU: { riverFloodScore010: 7.3, coastalFloodScore010: 0.0, combinedFloodScore010: 7.3, combinedFloodScore100: 73 },
  IE: { riverFloodScore010: 3.5, coastalFloodScore010: 5.9, combinedFloodScore010: 5.9, combinedFloodScore100: 59 },
  IT: { riverFloodScore010: 6.2, coastalFloodScore010: 6.5, combinedFloodScore010: 6.5, combinedFloodScore100: 65 },
  LV: { riverFloodScore010: 6.6, coastalFloodScore010: 3.6, combinedFloodScore010: 6.6, combinedFloodScore100: 66 },
  LT: { riverFloodScore010: 5.8, coastalFloodScore010: 3.3, combinedFloodScore010: 5.8, combinedFloodScore100: 58 },
  LU: { riverFloodScore010: 2.9, coastalFloodScore010: 0.0, combinedFloodScore010: 2.9, combinedFloodScore100: 29 },
  MT: { riverFloodScore010: 0.0, coastalFloodScore010: 0.7, combinedFloodScore010: 0.7, combinedFloodScore100: 7 },
  NL: { riverFloodScore010: 8.6, coastalFloodScore010: 10.0, combinedFloodScore010: 10.0, combinedFloodScore100: 100 },
  PL: { riverFloodScore010: 5.9, coastalFloodScore010: 5.7, combinedFloodScore010: 5.9, combinedFloodScore100: 59 },
  PT: { riverFloodScore010: 3.8, coastalFloodScore010: 4.6, combinedFloodScore010: 4.6, combinedFloodScore100: 46 },
  RO: { riverFloodScore010: 6.2, coastalFloodScore010: 2.9, combinedFloodScore010: 6.2, combinedFloodScore100: 62 },
  SK: { riverFloodScore010: 6.8, coastalFloodScore010: 0.0, combinedFloodScore010: 6.8, combinedFloodScore100: 68 },
  SI: { riverFloodScore010: 5.5, coastalFloodScore010: 3.0, combinedFloodScore010: 5.5, combinedFloodScore100: 55 },
  ES: { riverFloodScore010: 6.4, coastalFloodScore010: 4.9, combinedFloodScore010: 6.4, combinedFloodScore100: 64 },
  SE: { riverFloodScore010: 6.3, coastalFloodScore010: 5.8, combinedFloodScore010: 6.3, combinedFloodScore100: 63 },
};

export const floodZones: FloodZone[] = euZoneSeeds.map((seed) => {
  const informScore = informFloodScores2026ByIso2[seed.countryCode];
  const baselineRiskLevel = informScore?.combinedFloodScore100 ?? 0;

  return {
    id: `eu-${seed.countryCode.toLowerCase()}`,
    name: seed.name,
    countryCode: seed.countryCode,
    center: seed.center,
    baselineRiskLevel,
    stats: {
      populationAtRisk: null,
      averageElevationM: null,
      waterVolumeM3: null,
      estimatedHistoricalLossEurMillions: null,
      estimatedPlanSavingsPct: null,
      estimatedPlanSavingsEurMillions: null,
    },
    emergencyPlans: [],
    regions: [],
    majorIncidents: [],
  };
});

export const historicalSimulations: HistoricalSimulation[] = [];
