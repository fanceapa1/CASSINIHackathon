export type LngLat = [number, number];

export interface PolygonRegionGeometry {
  type: "Polygon";
  coordinates: LngLat[][];
}

export interface MultiPolygonRegionGeometry {
  type: "MultiPolygon";
  coordinates: LngLat[][][];
}

export type RegionGeometry = PolygonRegionGeometry | MultiPolygonRegionGeometry;

export interface ZoneStats {
  populationAtRisk: number | null;
  averageElevationM: number | null;
  waterVolumeM3: number | null;
  estimatedHistoricalLossEurMillions: number | null;
  estimatedPlanSavingsPct: number | null;
  estimatedPlanSavingsEurMillions: number | null;
}

export interface ZoneRegion {
  id: string;
  name: string;
  countryCode: string;
  center: LngLat;
  polygon: LngLat[];
  geometry?: RegionGeometry;
  population: number | null;
  baselineRiskLevel: number;
  estimatedLossEurMillions: number | null;
  historicalEvents: RegionalHistoricalEvent[];
}

export interface RegionalHistoricalEvent {
  id: string;
  title: string;
  eventDate: string;
  estimatedLossEurMillions: number | null;
  peakWaterLevelM: number;
  summary: string;
}

export interface MajorFloodIncident {
  id: string;
  title: string;
  eventDate: string;
  affectedRegion: string;
  estimatedLossEurMillions: number | null;
  fatalities: number | null;
  summary: string;
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
  regions: ZoneRegion[];
  majorIncidents: MajorFloodIncident[];
}

export interface FloodZoneWithRisk extends FloodZone {
  riskLevel: number;
}

export interface ZoneRegionWithRisk extends ZoneRegion {
  riskLevel: number;
  countryId: string;
  countryName: string;
}

export interface HistoricalSimulation {
  id: string;
  label: string;
  eventDate: string;
  notes: string;
  riskByZone: Record<string, number>;
  estimatedLossByZoneEurMillions: Record<string, number | null>;
  riskByRegion: Record<string, number>;
  estimatedLossByRegionEurMillions: Record<string, number | null>;
}

export interface GeneratedSimulationResult {
  id: string;
  label: string;
  createdAt: string;
  riskByZone: Record<string, number>;
  riskByRegion: Record<string, number>;
  projectedLossByZoneEurMillions: Record<string, number | null>;
  projectedLossByRegionEurMillions: Record<string, number | null>;
  avoidedLossByZoneEurMillions: Record<string, number | null>;
  avoidedLossByRegionEurMillions: Record<string, number | null>;
  savingsPctByZone: Record<string, number | null>;
  savingsPctByRegion: Record<string, number | null>;
  estimatedDisplacement: number | null;
  responseTimeMinutes: number | null;
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
