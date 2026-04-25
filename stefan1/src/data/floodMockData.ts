import type { FloodZone, HistoricalSimulation } from "../types/flood";

export const floodZones: FloodZone[] = [
  {
    id: "zone-lower-ninth",
    name: "Lower Ninth Ward",
    center: [-89.973, 29.962],
    polygon: [
      [-89.997, 29.948],
      [-89.949, 29.948],
      [-89.949, 29.976],
      [-89.997, 29.976],
    ],
    baselineRiskLevel: 72,
    stats: {
      populationAtRisk: 18400,
      averageElevationM: 1.8,
      waterVolumeM3: 1_260_000,
    },
    emergencyPlans: [
      "Evacuation Route A via Claiborne Ave",
      "Medical Kit Checklist (72h)",
      "Sandbag Deployment Team - Sector 4",
    ],
  },
  {
    id: "zone-metairie-basin",
    name: "Metairie Basin",
    center: [-90.182, 29.999],
    polygon: [
      [-90.214, 29.984],
      [-90.146, 29.984],
      [-90.146, 30.019],
      [-90.214, 30.019],
    ],
    baselineRiskLevel: 43,
    stats: {
      populationAtRisk: 22100,
      averageElevationM: 3.4,
      waterVolumeM3: 880_000,
    },
    emergencyPlans: [
      "Evacuation Route B via Airline Dr",
      "Power Grid Isolation Protocol",
      "Family Reunification Contact Chain",
    ],
  },
  {
    id: "zone-lakeview-perimeter",
    name: "Lakeview Perimeter",
    center: [-90.11, 30.013],
    polygon: [
      [-90.148, 29.995],
      [-90.072, 29.995],
      [-90.072, 30.033],
      [-90.148, 30.033],
    ],
    baselineRiskLevel: 56,
    stats: {
      populationAtRisk: 13750,
      averageElevationM: 2.6,
      waterVolumeM3: 1_020_000,
    },
    emergencyPlans: [
      "Evacuation Route C via West End Blvd",
      "Rapid Drainage Pump Sequence",
      "Shelter Allocation Plan - District North",
    ],
  },
  {
    id: "zone-industrial-canal",
    name: "Industrial Canal Edge",
    center: [-90.024, 29.945],
    polygon: [
      [-90.061, 29.927],
      [-89.99, 29.927],
      [-89.99, 29.964],
      [-90.061, 29.964],
    ],
    baselineRiskLevel: 81,
    stats: {
      populationAtRisk: 19620,
      averageElevationM: 1.3,
      waterVolumeM3: 1_470_000,
    },
    emergencyPlans: [
      "Evacuation Route D via St. Claude Ave",
      "Critical Medication Distribution",
      "Portable Barrier Reinforcement",
    ],
  },
];

export const historicalSimulations: HistoricalSimulation[] = [
  {
    id: "hist-2002-05-21",
    label: "Flood - May 21, 2002",
    eventDate: "2002-05-21",
    notes: "Rapid levee overtopping after 14h extreme rainfall.",
    riskByZone: {
      "zone-lower-ninth": 86,
      "zone-metairie-basin": 58,
      "zone-lakeview-perimeter": 67,
      "zone-industrial-canal": 93,
    },
  },
  {
    id: "hist-2010-09-03",
    label: "Hurricane Surge - Sep 03, 2010",
    eventDate: "2010-09-03",
    notes: "Storm surge pushed water inland through eastern corridors.",
    riskByZone: {
      "zone-lower-ninth": 79,
      "zone-metairie-basin": 46,
      "zone-lakeview-perimeter": 74,
      "zone-industrial-canal": 98,
    },
  },
  {
    id: "hist-2017-08-19",
    label: "Extreme Rainfall - Aug 19, 2017",
    eventDate: "2017-08-19",
    notes: "Pump network was over capacity for 5h.",
    riskByZone: {
      "zone-lower-ninth": 88,
      "zone-metairie-basin": 65,
      "zone-lakeview-perimeter": 72,
      "zone-industrial-canal": 90,
    },
  },
];
