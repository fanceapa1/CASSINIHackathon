export type LngLat = [number, number];

export interface ZoneStats {
  populationAtRisk: number;
  averageElevationM: number;
  waterVolumeM3: number;
}

export interface FloodZone {
  id: string;
  name: string;
  countryCode: string;
  center: LngLat;
  polygon?: LngLat[];
  baselineRiskLevel: number;
  stats: ZoneStats;
  emergencyPlans: string[];
}

export interface FloodZoneWithRisk extends FloodZone {
  riskLevel: number;
}

export interface HistoricalSimulation {
  id: string;
  label: string;
  eventDate: string;
  notes: string;
  riskByZone: Record<string, number>;
}

export interface GeneratedSimulationResult {
  id: string;
  label: string;
  createdAt: string;
  riskByZone: Record<string, number>;
  estimatedDisplacement: number;
  responseTimeMinutes: number;
}

export interface ReportedIncident {
  id: string;
  createdAt: string;
  description: string;
  location: LngLat;
  imagePreviews: string[];
  zoneId: string | null;
}

export interface MapAnchorPoint {
  x: number;
  y: number;
}

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
