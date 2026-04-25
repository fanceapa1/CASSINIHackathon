import type {
  FloodZone,
  HistoricalSimulation,
  LngLat,
  MajorFloodIncident,
  RegionalHistoricalEvent,
  ZoneRegion,
} from "../types/flood";

interface EUZoneSeed {
  countryCode: string;
  name: string;
  center: LngLat;
  polygon?: LngLat[];
  baselineRiskLevel: number;
  populationAtRisk: number;
  averageElevationM: number;
  waterVolumeM3: number;
}

interface InformFloodScore {
  riverFloodScore010: number;
  coastalFloodScore010: number;
  combinedFloodScore010: number;
  combinedFloodScore100: number;
}

interface IncidentSeed {
  title: string;
  eventDate: string;
  affectedRegion: string;
  estimatedLossEurMillions: number;
  fatalities: number;
  summary: string;
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
  {
    countryCode: "UK",
    name: "United Kingdom",
    center: [-2.8, 54.5],
    polygon: [
      [-8.7, 50.0],
      [1.9, 50.0],
      [1.9, 58.9],
      [-8.7, 58.9],
    ],
    baselineRiskLevel: 63,
    populationAtRisk: 8_420_000,
    averageElevationM: 162,
    waterVolumeM3: 27_500_000,
  },
];

const regionNamesByIso2: Record<string, string[]> = {
  AT: ["Vienna", "Lower Austria", "Styria", "Tyrol", "Salzburg"],
  BE: ["Flanders", "Wallonia", "Brussels-Capital", "Limburg"],
  BG: ["Sofia", "Plovdiv", "Varna", "Burgas", "Ruse"],
  HR: ["Slavonia", "Central Croatia", "Dalmatia", "Istria"],
  CY: ["Nicosia", "Limassol", "Larnaca", "Paphos"],
  CZ: ["Prague", "South Bohemia", "South Moravia", "Moravia-Silesia"],
  DK: ["Capital Region", "Zealand", "Southern Denmark", "Central Jutland", "North Jutland"],
  EE: ["Harju", "Tartu", "Ida-Viru", "Parnu"],
  FI: ["Uusimaa", "Southwest Finland", "Ostrobothnia", "Lapland"],
  FR: ["Ile-de-France", "Hauts-de-France", "Nouvelle-Aquitaine", "Occitanie", "Provence-Alpes-Cote d'Azur"],
  DE: ["North Rhine-Westphalia", "Bavaria", "Baden-Wurttemberg", "Lower Saxony", "Saxony"],
  EL: ["Attica", "Central Macedonia", "Thessaly", "Crete", "Western Greece"],
  HU: ["Central Hungary", "Northern Great Plain", "Southern Great Plain", "Transdanubia"],
  IE: ["Dublin", "Cork", "Galway", "Limerick"],
  IT: ["Lombardy", "Emilia-Romagna", "Veneto", "Tuscany", "Sicily"],
  LV: ["Riga", "Kurzeme", "Zemgale", "Latgale"],
  LT: ["Vilnius", "Kaunas", "Klaipeda", "Siauliai"],
  LU: ["Luxembourg City", "Esch-sur-Alzette", "Diekirch", "Grevenmacher"],
  MT: ["Northern Harbour", "Southern Harbour", "Gozo", "Western Malta"],
  NL: ["North Holland", "South Holland", "Utrecht", "North Brabant", "Gelderland"],
  PL: ["Masovian", "Silesian", "Lower Silesian", "Lesser Poland", "Pomeranian"],
  PT: ["Lisbon", "Norte", "Centro", "Alentejo", "Algarve"],
  RO: ["Bucuresti", "Slobozia (Ialomita)", "Bacau", "Buzau", "Galati", "Vrancea", "Cluj", "Timis"],
  SK: ["Bratislava", "Trnava", "Kosice", "Presov", "Zilina"],
  SI: ["Ljubljana", "Drava", "Savinja", "Coastal-Karst"],
  ES: ["Andalusia", "Catalonia", "Valencia", "Madrid", "Galicia"],
  SE: ["Stockholm", "Vastra Gotaland", "Skane", "Uppsala", "Norrbotten"],
  UK: ["England South East", "England North West", "Scotland", "Wales", "Northern Ireland"],
};

const countryRegionScaleByIso2: Record<string, number> = {
  MT: 0.35,
  LU: 0.42,
  CY: 0.5,
  BE: 0.56,
  NL: 0.58,
  DK: 0.68,
  IE: 0.72,
  HR: 0.76,
  SI: 0.54,
  SK: 0.62,
  CZ: 0.7,
  AT: 0.72,
  HU: 0.7,
  RO: 0.95,
  BG: 0.88,
  PL: 1.0,
  FR: 1.15,
  ES: 1.12,
  IT: 1.08,
  DE: 1.1,
  SE: 1.26,
  FI: 1.2,
  EL: 0.95,
  PT: 0.86,
  UK: 1.0,
};

const majorIncidentCatalogByIso2: Record<string, IncidentSeed[]> = {
  AT: [{ title: "Danube Flooding", eventDate: "2013-06-10", affectedRegion: "Lower Austria", estimatedLossEurMillions: 1_120, fatalities: 8, summary: "High Danube discharge impacted transport and housing." }],
  BE: [{ title: "Wallonia Floods", eventDate: "2021-07-15", affectedRegion: "Wallonia", estimatedLossEurMillions: 2_600, fatalities: 41, summary: "Extreme rainfall caused river overflow and urban flooding." }],
  BG: [{ title: "Varna Flash Flood", eventDate: "2014-06-19", affectedRegion: "Varna", estimatedLossEurMillions: 340, fatalities: 14, summary: "Rapid runoff affected dense urban neighborhoods." }],
  HR: [{ title: "Sava River Floods", eventDate: "2014-05-18", affectedRegion: "Slavonia", estimatedLossEurMillions: 620, fatalities: 5, summary: "Prolonged rainfall expanded floodplain inundation." }],
  CY: [{ title: "Paphos Winter Flooding", eventDate: "2019-01-08", affectedRegion: "Paphos", estimatedLossEurMillions: 120, fatalities: 2, summary: "Storm cells generated severe local runoff." }],
  CZ: [{ title: "Prague Flood Event", eventDate: "2002-08-13", affectedRegion: "Prague", estimatedLossEurMillions: 3_200, fatalities: 17, summary: "Vltava overflow impacted transport and utilities." }],
  DK: [{ title: "Baltic Storm Surge", eventDate: "2023-10-21", affectedRegion: "Zealand", estimatedLossEurMillions: 460, fatalities: 1, summary: "Coastal inundation and wave overtopping affected ports." }],
  EE: [{ title: "Parnu Storm Flood", eventDate: "2005-01-09", affectedRegion: "Parnu", estimatedLossEurMillions: 140, fatalities: 1, summary: "Storm surge flooded low-lying districts." }],
  FI: [{ title: "Northern River Flood", eventDate: "2020-05-20", affectedRegion: "Lapland", estimatedLossEurMillions: 210, fatalities: 0, summary: "Snowmelt and rain amplified river basin response." }],
  FR: [{ title: "Seine Basin Flood", eventDate: "2016-06-02", affectedRegion: "Ile-de-France", estimatedLossEurMillions: 2_100, fatalities: 5, summary: "Extended rainfall period triggered major transport disruptions." }],
  DE: [{ title: "Ahr Valley Flood", eventDate: "2021-07-14", affectedRegion: "North Rhine-Westphalia", estimatedLossEurMillions: 29_200, fatalities: 180, summary: "Unprecedented flash flooding devastated settlements." }],
  EL: [{ title: "Storm Daniel Floods", eventDate: "2023-09-06", affectedRegion: "Thessaly", estimatedLossEurMillions: 3_400, fatalities: 17, summary: "Extreme rainfall flooded agricultural and urban zones." }],
  HU: [{ title: "Danube High Water", eventDate: "2013-06-07", affectedRegion: "Central Hungary", estimatedLossEurMillions: 550, fatalities: 2, summary: "Sustained high levels stressed protective infrastructure." }],
  IE: [{ title: "Cork City Flood", eventDate: "2009-11-20", affectedRegion: "Cork", estimatedLossEurMillions: 730, fatalities: 0, summary: "Tidal and river interaction flooded city center areas." }],
  IT: [{ title: "Emilia-Romagna Flood", eventDate: "2023-05-17", affectedRegion: "Emilia-Romagna", estimatedLossEurMillions: 8_800, fatalities: 17, summary: "Repeated heavy rainfall caused landslides and flooding." }],
  LV: [{ title: "Latgale Flooding", eventDate: "2017-08-24", affectedRegion: "Latgale", estimatedLossEurMillions: 180, fatalities: 0, summary: "Persistent rainfall overwhelmed drainage in eastern districts." }],
  LT: [{ title: "Nemunas Overflow", eventDate: "2010-03-26", affectedRegion: "Klaipeda", estimatedLossEurMillions: 160, fatalities: 0, summary: "Spring melt elevated river levels in low plains." }],
  LU: [{ title: "National Flood Event", eventDate: "2021-07-15", affectedRegion: "Diekirch", estimatedLossEurMillions: 420, fatalities: 1, summary: "Cross-border rainfall event impacted transport corridors." }],
  MT: [{ title: "Island Flash Flood", eventDate: "2022-11-22", affectedRegion: "Northern Harbour", estimatedLossEurMillions: 95, fatalities: 0, summary: "Urban runoff surged through narrow basins." }],
  NL: [{ title: "Limburg Flooding", eventDate: "2021-07-15", affectedRegion: "South Holland", estimatedLossEurMillions: 1_500, fatalities: 2, summary: "High river levels and peak discharge pressures caused severe impacts." }],
  PL: [{ title: "Vistula-Odra Flood", eventDate: "2010-05-19", affectedRegion: "Masovian", estimatedLossEurMillions: 3_100, fatalities: 25, summary: "Multi-basin flooding affected major transport links." }],
  PT: [{ title: "Lisbon Urban Flood", eventDate: "2022-12-13", affectedRegion: "Lisbon", estimatedLossEurMillions: 320, fatalities: 2, summary: "High-intensity rain triggered extensive urban inundation." }],
  RO: [{ title: "Banat-Danube Floods", eventDate: "2005-04-18", affectedRegion: "Vrancea", estimatedLossEurMillions: 1_300, fatalities: 24, summary: "Major river overflow affected multiple counties." }],
  SK: [{ title: "Eastern Slovakia Floods", eventDate: "2010-06-04", affectedRegion: "Presov", estimatedLossEurMillions: 380, fatalities: 2, summary: "Rainfall accumulation drove basin-wide flooding." }],
  SI: [{ title: "National Flash Floods", eventDate: "2023-08-04", affectedRegion: "Savinja", estimatedLossEurMillions: 7_100, fatalities: 6, summary: "Extreme runoff caused severe infrastructure damage." }],
  ES: [{ title: "Mediterranean DANA Flood", eventDate: "2019-09-13", affectedRegion: "Valencia", estimatedLossEurMillions: 2_200, fatalities: 8, summary: "Convective storms generated widespread flash flooding." }],
  SE: [{ title: "Central Sweden Flooding", eventDate: "2021-08-20", affectedRegion: "Vastra Gotaland", estimatedLossEurMillions: 270, fatalities: 1, summary: "Sustained rainfall overwhelmed local river channels." }],
  UK: [{ title: "Storm Desmond Floods", eventDate: "2015-12-06", affectedRegion: "England North West", estimatedLossEurMillions: 2_100, fatalities: 3, summary: "Historic rainfall caused severe flooding across northern catchments." }],
};

export const informRiskDataSource = {
  dataset: "INFORM Risk Index 2026 (JRC/DRMKC)",
  workbook: "INFORM_Risk_2026_v072.xlsx",
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
  UK: { riverFloodScore010: 6.4, coastalFloodScore010: 7.1, combinedFloodScore010: 7.1, combinedFloodScore100: 71 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function closeRing(points: LngLat[]): LngLat[] {
  if (points.length < 3) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return points;
  }
  return [...points, first];
}

function estimateHistoricalLossEurMillions(seed: EUZoneSeed, baselineRiskLevel: number): number {
  const populationComponent = seed.populationAtRisk * 0.00009;
  const waterVolumeComponent = seed.waterVolumeM3 * 0.0000026;
  const riskComponent = baselineRiskLevel * 7.4;
  return roundToOneDecimal(populationComponent + waterVolumeComponent + riskComponent);
}

function estimatePlanSavingsPct(baselineRiskLevel: number): number {
  return clamp(Math.round(18 + baselineRiskLevel * 0.27), 16, 48);
}

function buildEmergencyPlans(country: string): string[] {
  return [
    `Evacuation Route Alpha - ${country}`,
    "Medical and Clean Water Checklist (72h)",
    "Critical Infrastructure Isolation Procedure",
    "Public Alert and School Shelter Coordination",
  ];
}

function buildRegionGeometry(seed: EUZoneSeed, index: number, total: number): { center: LngLat; polygon: LngLat[] } {
  const scale = countryRegionScaleByIso2[seed.countryCode] ?? 0.78;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const ring = Math.floor(index / Math.max(3, Math.ceil(total / 2)));
  const radialFactor = 0.7 + ring * 0.35;
  const lonOffset = Math.cos(angle) * scale * radialFactor;
  const latOffset = Math.sin(angle) * scale * radialFactor * 0.7;

  const center: LngLat = [
    roundToOneDecimal(clamp(seed.center[0] + lonOffset, -179.9, 179.9)),
    roundToOneDecimal(clamp(seed.center[1] + latOffset, -80, 80)),
  ];

  const width = scale * 0.34 * (0.84 + (index % 3) * 0.1);
  const height = scale * 0.24 * (0.82 + (index % 4) * 0.08);
  const halfW = width / 2;
  const halfH = height / 2;

  return {
    center,
    polygon: [
      [center[0] - halfW, center[1] - halfH],
      [center[0] + halfW, center[1] - halfH],
      [center[0] + halfW, center[1] + halfH],
      [center[0] - halfW, center[1] + halfH],
    ],
  };
}

function buildRegionHistoricalEvents(
  region: ZoneRegion,
  seed: EUZoneSeed,
  baselineCountryRisk: number,
): RegionalHistoricalEvent[] {
  const rollingOffset = ((seed.countryCode.charCodeAt(0) + region.name.length) % 8) - 3;
  const historicalRisk = clamp(region.baselineRiskLevel + rollingOffset, 10, 100);
  const baseLoss = region.estimatedLossEurMillions;

  const firstLoss = roundToOneDecimal(baseLoss * (0.72 + historicalRisk / 180));
  const secondLoss = roundToOneDecimal(baseLoss * (0.52 + baselineCountryRisk / 220));

  return [
    {
      id: `${region.id}-event-1`,
      title: `${region.name} flood wave`,
      eventDate: "2010-06-18",
      estimatedLossEurMillions: firstLoss,
      peakWaterLevelM: roundToOneDecimal(1.1 + historicalRisk * 0.03),
      summary: "Regional rivers exceeded warning thresholds after multi-day rainfall.",
    },
    {
      id: `${region.id}-event-2`,
      title: `${region.name} urban flash flooding`,
      eventDate: "2021-07-16",
      estimatedLossEurMillions: secondLoss,
      peakWaterLevelM: roundToOneDecimal(0.8 + baselineCountryRisk * 0.025),
      summary: "Short-duration intense precipitation impacted urban drainage basins.",
    },
  ];
}

function buildRegions(
  seed: EUZoneSeed,
  baselineRiskLevel: number,
  estimatedHistoricalLossEurMillions: number,
): ZoneRegion[] {
  const regionNames = regionNamesByIso2[seed.countryCode] ?? [`${seed.name} Central Region`];
  const rawWeights = regionNames.map((_, index) => {
    const codeBias = (seed.countryCode.charCodeAt(0) + seed.countryCode.charCodeAt(1)) % 4;
    return 1 + ((index + codeBias) % 5) * 0.18;
  });
  const totalWeight = rawWeights.reduce((sum, value) => sum + value, 0);

  return regionNames.map((regionName, index) => {
    const weight = rawWeights[index] / totalWeight;
    const population = Math.round(seed.populationAtRisk * weight);
    const riskShift = ((index * 7 + seed.countryCode.charCodeAt(0)) % 13) - 6;
    const baselineRisk = clamp(Math.round(baselineRiskLevel + riskShift), 12, 100);
    const estimatedLoss = roundToOneDecimal(
      estimatedHistoricalLossEurMillions * weight * (0.82 + baselineRisk / 210),
    );
    const geometry = buildRegionGeometry(seed, index, regionNames.length);

    const region: ZoneRegion = {
      id: `${seed.countryCode.toLowerCase()}-region-${index + 1}`,
      name: regionName,
      countryCode: seed.countryCode,
      center: geometry.center,
      polygon: geometry.polygon,
      geometry: {
        type: "Polygon",
        coordinates: [closeRing(geometry.polygon)],
      },
      population,
      baselineRiskLevel: baselineRisk,
      estimatedLossEurMillions: estimatedLoss,
      historicalEvents: [],
    };

    region.historicalEvents = buildRegionHistoricalEvents(region, seed, baselineRiskLevel);
    return region;
  });
}

function buildMajorIncidents(seed: EUZoneSeed): MajorFloodIncident[] {
  const regionNames = regionNamesByIso2[seed.countryCode] ?? [seed.name];
  const fallbackIncident: IncidentSeed = {
    title: `${seed.name} Major Flood Event`,
    eventDate: "2018-10-11",
    affectedRegion: regionNames[0],
    estimatedLossEurMillions: roundToOneDecimal(seed.populationAtRisk * 0.00011),
    fatalities: Math.max(0, Math.round(seed.populationAtRisk / 850_000)),
    summary: "Significant flood impacts based on aggregated historical reporting.",
  };
  const incidents = majorIncidentCatalogByIso2[seed.countryCode] ?? [fallbackIncident];

  return incidents.map((incident, index) => ({
    id: `${seed.countryCode.toLowerCase()}-incident-${index + 1}`,
    title: incident.title,
    eventDate: incident.eventDate,
    affectedRegion: incident.affectedRegion,
    estimatedLossEurMillions: incident.estimatedLossEurMillions,
    fatalities: incident.fatalities,
    summary: incident.summary,
  }));
}

export const floodZones: FloodZone[] = euZoneSeeds.map((seed) => {
  const baselineRiskLevel =
    informFloodScores2026ByIso2[seed.countryCode]?.combinedFloodScore100 ??
    seed.baselineRiskLevel;
  const estimatedHistoricalLossEurMillions = estimateHistoricalLossEurMillions(
    seed,
    baselineRiskLevel,
  );
  const estimatedPlanSavingsPct = estimatePlanSavingsPct(baselineRiskLevel);
  const estimatedPlanSavingsEurMillions = roundToOneDecimal(
    estimatedHistoricalLossEurMillions * (estimatedPlanSavingsPct / 100),
  );

  return {
    id: `eu-${seed.countryCode.toLowerCase()}`,
    name: seed.name,
    countryCode: seed.countryCode,
    center: seed.center,
    polygon: seed.polygon,
    baselineRiskLevel,
    stats: {
      populationAtRisk: seed.populationAtRisk,
      averageElevationM: seed.averageElevationM,
      waterVolumeM3: seed.waterVolumeM3,
      estimatedHistoricalLossEurMillions,
      estimatedPlanSavingsPct,
      estimatedPlanSavingsEurMillions,
    },
    emergencyPlans: buildEmergencyPlans(seed.name),
    regions: buildRegions(seed, baselineRiskLevel, estimatedHistoricalLossEurMillions),
    majorIncidents: buildMajorIncidents(seed),
  };
});

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

function buildHistoricalRegionRiskMap(
  riskByZone: Record<string, number>,
  offset: number,
  affectedCountryCodes: string[],
): Record<string, number> {
  const affected = new Set(affectedCountryCodes);
  return floodZones.reduce<Record<string, number>>((acc, zone) => {
    const zoneRisk = riskByZone[zone.id] ?? zone.baselineRiskLevel;
    zone.regions.forEach((region, index) => {
      const variability = ((index * 11 + zone.countryCode.charCodeAt(0)) % 12) - 5;
      const hotspot = affected.has(zone.countryCode) ? 7 : 0;
      acc[region.id] = clamp(
        Math.round(zoneRisk + variability + hotspot + offset * 0.4),
        12,
        100,
      );
    });
    return acc;
  }, {});
}

function buildHistoricalLossMap(
  riskByZone: Record<string, number>,
  eventMultiplier: number,
  affectedCountryCodes: string[],
): Record<string, number> {
  const affected = new Set(affectedCountryCodes);
  return floodZones.reduce<Record<string, number>>((acc, zone) => {
    const scenarioRisk = riskByZone[zone.id] ?? zone.baselineRiskLevel;
    const intensityFactor = 0.54 + scenarioRisk / 128;
    const hotspotFactor = affected.has(zone.countryCode) ? 1.22 : 0.88;
    const estimatedLoss =
      zone.stats.estimatedHistoricalLossEurMillions *
      intensityFactor *
      eventMultiplier *
      hotspotFactor;
    acc[zone.id] = roundToOneDecimal(estimatedLoss);
    return acc;
  }, {});
}

function buildHistoricalRegionLossMap(
  riskByRegion: Record<string, number>,
  eventMultiplier: number,
  affectedCountryCodes: string[],
): Record<string, number> {
  const affected = new Set(affectedCountryCodes);
  return floodZones.reduce<Record<string, number>>((acc, zone) => {
    zone.regions.forEach((region) => {
      const regionRisk = riskByRegion[region.id] ?? region.baselineRiskLevel;
      const intensityFactor = 0.58 + regionRisk / 140;
      const hotspotFactor = affected.has(zone.countryCode) ? 1.18 : 0.9;
      acc[region.id] = roundToOneDecimal(
        region.estimatedLossEurMillions * intensityFactor * eventMultiplier * hotspotFactor,
      );
    });
    return acc;
  }, {});
}

const affected2013 = ["AT", "CZ", "DE", "HU", "SK", "RO", "BG", "HR"];
const affected2021 = ["BE", "DE", "LU", "NL", "FR", "AT", "IE", "UK"];
const affected2024 = ["PL", "CZ", "SK", "RO", "DE", "AT", "HU", "IT", "SI"];

const risk2013 = buildHistoricalRiskMap(6, affected2013);
const risk2021 = buildHistoricalRiskMap(8, affected2021);
const risk2024 = buildHistoricalRiskMap(9, affected2024);

const regionRisk2013 = buildHistoricalRegionRiskMap(risk2013, 6, affected2013);
const regionRisk2021 = buildHistoricalRegionRiskMap(risk2021, 8, affected2021);
const regionRisk2024 = buildHistoricalRegionRiskMap(risk2024, 9, affected2024);

export const historicalSimulations: HistoricalSimulation[] = [
  {
    id: "hist-2013-06-14",
    label: "Central Europe Floods - Jun 14, 2013",
    eventDate: "2013-06-14",
    notes:
      "Event reference: Copernicus EMSR044 and ERCC monitoring for Danube/Elbe basins.",
    riskByZone: risk2013,
    estimatedLossByZoneEurMillions: buildHistoricalLossMap(risk2013, 1.08, affected2013),
    riskByRegion: regionRisk2013,
    estimatedLossByRegionEurMillions: buildHistoricalRegionLossMap(
      regionRisk2013,
      1.08,
      affected2013,
    ),
  },
  {
    id: "hist-2021-07-15",
    label: "Western Europe Floods - Jul 15, 2021",
    eventDate: "2021-07-15",
    notes:
      "Event reference: severe flood impacts in Germany, Belgium, Luxembourg, Netherlands, and UK catchments.",
    riskByZone: risk2021,
    estimatedLossByZoneEurMillions: buildHistoricalLossMap(risk2021, 1.18, affected2021),
    riskByRegion: regionRisk2021,
    estimatedLossByRegionEurMillions: buildHistoricalRegionLossMap(
      regionRisk2021,
      1.18,
      affected2021,
    ),
  },
  {
    id: "hist-2024-09-25",
    label: "Storm Boris Floods - Sep 25, 2024",
    eventDate: "2024-09-25",
    notes:
      "Event reference: Copernicus EMS Information Bulletin 173 (Central/Eastern Europe floods).",
    riskByZone: risk2024,
    estimatedLossByZoneEurMillions: buildHistoricalLossMap(risk2024, 1.24, affected2024),
    riskByRegion: regionRisk2024,
    estimatedLossByRegionEurMillions: buildHistoricalRegionLossMap(
      regionRisk2024,
      1.24,
      affected2024,
    ),
  },
];
