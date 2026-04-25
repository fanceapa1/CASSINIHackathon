import type { FloodZone, HistoricalSimulation, LngLat } from "../types/flood";

interface EUZoneSeed {
  countryCode: string;
  name: string;
  center: LngLat;
  baselineRiskLevel: number;
  populationAtRisk: number;
  averageElevationM: number;
  waterVolumeM3: number;
}

const euZoneSeeds: EUZoneSeed[] = [
  { countryCode: "AT", name: "Austria", center: [14.5, 47.5], baselineRiskLevel: 45, populationAtRisk: 1_130_000, averageElevationM: 910, waterVolumeM3: 10_200_000 },
  { countryCode: "BE", name: "Belgium", center: [4.7, 50.8], baselineRiskLevel: 52, populationAtRisk: 1_980_000, averageElevationM: 181, waterVolumeM3: 12_100_000 },
  { countryCode: "BG", name: "Bulgaria", center: [25.3, 42.7], baselineRiskLevel: 61, populationAtRisk: 1_490_000, averageElevationM: 470, waterVolumeM3: 15_700_000 },
  { countryCode: "HR", name: "Croatia", center: [16.4, 45.3], baselineRiskLevel: 63, populationAtRisk: 1_020_000, averageElevationM: 331, waterVolumeM3: 9_800_000 },
  { countryCode: "CY", name: "Cyprus", center: [33.0, 35.0], baselineRiskLevel: 58, populationAtRisk: 290_000, averageElevationM: 152, waterVolumeM3: 2_900_000 },
  { countryCode: "CZ", name: "Czechia", center: [15.4, 49.8], baselineRiskLevel: 49, populationAtRisk: 1_670_000, averageElevationM: 433, waterVolumeM3: 11_600_000 },
  { countryCode: "DK", name: "Denmark", center: [10.0, 56.1], baselineRiskLevel: 44, populationAtRisk: 960_000, averageElevationM: 31, waterVolumeM3: 7_500_000 },
  { countryCode: "EE", name: "Estonia", center: [25.5, 58.8], baselineRiskLevel: 47, populationAtRisk: 280_000, averageElevationM: 50, waterVolumeM3: 4_200_000 },
  { countryCode: "FI", name: "Finland", center: [25.5, 64.5], baselineRiskLevel: 39, populationAtRisk: 730_000, averageElevationM: 164, waterVolumeM3: 13_900_000 },
  { countryCode: "FR", name: "France", center: [2.5, 46.3], baselineRiskLevel: 57, populationAtRisk: 10_100_000, averageElevationM: 375, waterVolumeM3: 39_400_000 },
  { countryCode: "DE", name: "Germany", center: [10.4, 51.1], baselineRiskLevel: 50, populationAtRisk: 12_400_000, averageElevationM: 263, waterVolumeM3: 45_800_000 },
  { countryCode: "EL", name: "Greece", center: [22.9, 39.1], baselineRiskLevel: 66, populationAtRisk: 2_060_000, averageElevationM: 498, waterVolumeM3: 16_200_000 },
  { countryCode: "HU", name: "Hungary", center: [19.2, 47.2], baselineRiskLevel: 55, populationAtRisk: 1_840_000, averageElevationM: 143, waterVolumeM3: 12_700_000 },
  { countryCode: "IE", name: "Ireland", center: [-8.0, 53.4], baselineRiskLevel: 46, populationAtRisk: 830_000, averageElevationM: 118, waterVolumeM3: 8_100_000 },
  { countryCode: "IT", name: "Italy", center: [12.4, 42.9], baselineRiskLevel: 68, populationAtRisk: 8_920_000, averageElevationM: 538, waterVolumeM3: 33_700_000 },
  { countryCode: "LV", name: "Latvia", center: [24.8, 56.9], baselineRiskLevel: 51, populationAtRisk: 350_000, averageElevationM: 87, waterVolumeM3: 5_300_000 },
  { countryCode: "LT", name: "Lithuania", center: [23.9, 55.3], baselineRiskLevel: 52, populationAtRisk: 540_000, averageElevationM: 110, waterVolumeM3: 6_700_000 },
  { countryCode: "LU", name: "Luxembourg", center: [6.1, 49.8], baselineRiskLevel: 43, populationAtRisk: 120_000, averageElevationM: 325, waterVolumeM3: 1_500_000 },
  { countryCode: "MT", name: "Malta", center: [14.4, 35.9], baselineRiskLevel: 62, populationAtRisk: 150_000, averageElevationM: 76, waterVolumeM3: 900_000 },
  { countryCode: "NL", name: "Netherlands", center: [5.4, 52.2], baselineRiskLevel: 74, populationAtRisk: 4_320_000, averageElevationM: 30, waterVolumeM3: 25_600_000 },
  { countryCode: "PL", name: "Poland", center: [19.3, 52.2], baselineRiskLevel: 56, populationAtRisk: 6_100_000, averageElevationM: 173, waterVolumeM3: 29_700_000 },
  { countryCode: "PT", name: "Portugal", center: [-8.1, 39.6], baselineRiskLevel: 59, populationAtRisk: 1_910_000, averageElevationM: 372, waterVolumeM3: 13_400_000 },
  { countryCode: "RO", name: "Romania", center: [24.9, 45.9], baselineRiskLevel: 67, populationAtRisk: 4_060_000, averageElevationM: 414, waterVolumeM3: 26_900_000 },
  { countryCode: "SK", name: "Slovakia", center: [19.5, 48.7], baselineRiskLevel: 53, populationAtRisk: 990_000, averageElevationM: 458, waterVolumeM3: 8_200_000 },
  { countryCode: "SI", name: "Slovenia", center: [14.9, 46.1], baselineRiskLevel: 58, populationAtRisk: 390_000, averageElevationM: 492, waterVolumeM3: 3_800_000 },
  { countryCode: "ES", name: "Spain", center: [-3.7, 40.2], baselineRiskLevel: 64, populationAtRisk: 7_310_000, averageElevationM: 660, waterVolumeM3: 31_300_000 },
  { countryCode: "SE", name: "Sweden", center: [16.9, 62.3], baselineRiskLevel: 41, populationAtRisk: 1_110_000, averageElevationM: 320, waterVolumeM3: 15_600_000 },
];

interface InformFloodScore {
  riverFloodScore010: number;
  coastalFloodScore010: number;
  combinedFloodScore010: number;
  combinedFloodScore100: number;
}

export const informRiskDataSource = {
  dataset: "INFORM Risk Index 2026 (JRC/DRMKC)",
  workbook: "INFORM_Risk_2026_v072.xlsx",
  scoringMethod:
    "combinedFloodScore010 = max(River Flood, Coastal flood), rescaled to 0-100",
};

export const informFloodScores2026ByIso2: Record<string, InformFloodScore> = {
  AT: { riverFloodScore010: 7.2, coastalFloodScore010: 0, combinedFloodScore010: 7.2, combinedFloodScore100: 72 },
  BE: { riverFloodScore010: 6.2, coastalFloodScore010: 7.7, combinedFloodScore010: 7.7, combinedFloodScore100: 77 },
  BG: { riverFloodScore010: 5.1, coastalFloodScore010: 2.9, combinedFloodScore010: 5.1, combinedFloodScore100: 51 },
  HR: { riverFloodScore010: 6.8, coastalFloodScore010: 5.0, combinedFloodScore010: 6.8, combinedFloodScore100: 68 },
  CY: { riverFloodScore010: 0, coastalFloodScore010: 2.9, combinedFloodScore010: 2.9, combinedFloodScore100: 29 },
  CZ: { riverFloodScore010: 5.7, coastalFloodScore010: 0, combinedFloodScore010: 5.7, combinedFloodScore100: 57 },
  DK: { riverFloodScore010: 0, coastalFloodScore010: 7.1, combinedFloodScore010: 7.1, combinedFloodScore100: 71 },
  EE: { riverFloodScore010: 5.4, coastalFloodScore010: 2.2, combinedFloodScore010: 5.4, combinedFloodScore100: 54 },
  FI: { riverFloodScore010: 6.2, coastalFloodScore010: 5.3, combinedFloodScore010: 6.2, combinedFloodScore100: 62 },
  FR: { riverFloodScore010: 7.5, coastalFloodScore010: 7.4, combinedFloodScore010: 7.5, combinedFloodScore100: 75 },
  DE: { riverFloodScore010: 7.8, coastalFloodScore010: 8.0, combinedFloodScore010: 8.0, combinedFloodScore100: 80 },
  EL: { riverFloodScore010: 3.8, coastalFloodScore010: 5.0, combinedFloodScore010: 5.0, combinedFloodScore100: 50 },
  HU: { riverFloodScore010: 7.3, coastalFloodScore010: 0, combinedFloodScore010: 7.3, combinedFloodScore100: 73 },
  IE: { riverFloodScore010: 3.5, coastalFloodScore010: 5.9, combinedFloodScore010: 5.9, combinedFloodScore100: 59 },
  IT: { riverFloodScore010: 6.2, coastalFloodScore010: 6.5, combinedFloodScore010: 6.5, combinedFloodScore100: 65 },
  LV: { riverFloodScore010: 6.6, coastalFloodScore010: 3.6, combinedFloodScore010: 6.6, combinedFloodScore100: 66 },
  LT: { riverFloodScore010: 5.8, coastalFloodScore010: 3.3, combinedFloodScore010: 5.8, combinedFloodScore100: 58 },
  LU: { riverFloodScore010: 2.9, coastalFloodScore010: 0, combinedFloodScore010: 2.9, combinedFloodScore100: 29 },
  MT: { riverFloodScore010: 0, coastalFloodScore010: 0.7, combinedFloodScore010: 0.7, combinedFloodScore100: 7 },
  NL: { riverFloodScore010: 8.6, coastalFloodScore010: 10.0, combinedFloodScore010: 10.0, combinedFloodScore100: 100 },
  PL: { riverFloodScore010: 5.9, coastalFloodScore010: 5.7, combinedFloodScore010: 5.9, combinedFloodScore100: 59 },
  PT: { riverFloodScore010: 3.8, coastalFloodScore010: 4.6, combinedFloodScore010: 4.6, combinedFloodScore100: 46 },
  RO: { riverFloodScore010: 6.2, coastalFloodScore010: 2.9, combinedFloodScore010: 6.2, combinedFloodScore100: 62 },
  SK: { riverFloodScore010: 6.8, coastalFloodScore010: 0, combinedFloodScore010: 6.8, combinedFloodScore100: 68 },
  SI: { riverFloodScore010: 5.5, coastalFloodScore010: 3.0, combinedFloodScore010: 5.5, combinedFloodScore100: 55 },
  ES: { riverFloodScore010: 6.4, coastalFloodScore010: 4.9, combinedFloodScore010: 6.4, combinedFloodScore100: 64 },
  SE: { riverFloodScore010: 6.3, coastalFloodScore010: 5.8, combinedFloodScore010: 6.3, combinedFloodScore100: 63 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildEmergencyPlans(country: string): string[] {
  return [
    `Evacuation Route Alpha - ${country}`,
    "Medical and Clean Water Checklist (72h)",
    "Critical Infrastructure Isolation Procedure",
  ];
}

export const floodZones: FloodZone[] = euZoneSeeds.map((seed) => ({
  id: `eu-${seed.countryCode.toLowerCase()}`,
  name: seed.name,
  countryCode: seed.countryCode,
  center: seed.center,
  baselineRiskLevel:
    informFloodScores2026ByIso2[seed.countryCode]?.combinedFloodScore100 ??
    seed.baselineRiskLevel,
  stats: {
    populationAtRisk: seed.populationAtRisk,
    averageElevationM: seed.averageElevationM,
    waterVolumeM3: seed.waterVolumeM3,
  },
  emergencyPlans: buildEmergencyPlans(seed.name),
}));

function buildHistoricalRiskMap(
  offset: number,
  affectedCountryCodes: string[],
): Record<string, number> {
  const affected = new Set(affectedCountryCodes);
  return floodZones.reduce<Record<string, number>>((acc, zone, index) => {
    const seasonalVariance = ((index * 5) % 9) - 4;
    const hotspotBoost = affected.has(zone.countryCode) ? 16 : 0;
    acc[zone.id] = clamp(
      Math.round(zone.baselineRiskLevel + offset + seasonalVariance + hotspotBoost),
      18,
      100,
    );
    return acc;
  }, {});
}

export const historicalSimulations: HistoricalSimulation[] = [
  {
    id: "hist-2013-06-14",
    label: "Central Europe Floods - Jun 14, 2013",
    eventDate: "2013-06-14",
    notes:
      "Event reference: Copernicus EMSR044 (Germany) and ERCC monitoring for Danube/Elbe basins.",
    riskByZone: buildHistoricalRiskMap(6, ["AT", "CZ", "DE", "HU", "SK", "RO", "BG", "HR"]),
  },
  {
    id: "hist-2021-07-15",
    label: "Western Europe Floods - Jul 15, 2021",
    eventDate: "2021-07-15",
    notes:
      "Event reference: severe flood impacts in Germany, Belgium, Luxembourg, Netherlands and nearby regions.",
    riskByZone: buildHistoricalRiskMap(8, ["BE", "DE", "LU", "NL", "FR", "AT"]),
  },
  {
    id: "hist-2024-09-25",
    label: "Storm Boris Floods - Sep 25, 2024",
    eventDate: "2024-09-25",
    notes:
      "Event reference: Copernicus EMS Information Bulletin 173 (Central/Eastern Europe floods).",
    riskByZone: buildHistoricalRiskMap(9, ["PL", "CZ", "SK", "RO", "DE", "AT", "HU", "IT"]),
  },
];
