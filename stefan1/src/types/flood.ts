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
  populationAtRisk: number;
  averageElevationM: number;
  waterVolumeM3: number;
  estimatedHistoricalLossEurMillions: number;
  estimatedPlanSavingsPct: number;
  estimatedPlanSavingsEurMillions: number;
}

export interface ZoneRegion {
  id: string;
  name: string;
  countryCode: string;
  center: LngLat;
  polygon: LngLat[];
  geometry?: RegionGeometry;
  population: number;
  baselineRiskLevel: number;
  estimatedLossEurMillions: number;
  historicalEvents: RegionalHistoricalEvent[];
}

export interface RegionalHistoricalEvent {
  id: string;
  title: string;
  eventDate: string;
  estimatedLossEurMillions: number;
  peakWaterLevelM: number;
  summary: string;
}

export interface MajorFloodIncident {
  id: string;
  title: string;
  eventDate: string;
  affectedRegion: string;
  estimatedLossEurMillions: number;
  fatalities: number;
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
  estimatedLossByZoneEurMillions: Record<string, number>;
  riskByRegion: Record<string, number>;
  estimatedLossByRegionEurMillions: Record<string, number>;
}

export interface GeneratedSimulationResult {
  id: string;
  label: string;
  createdAt: string;
  riskByZone: Record<string, number>;
  riskByRegion: Record<string, number>;
  projectedLossByZoneEurMillions: Record<string, number>;
  projectedLossByRegionEurMillions: Record<string, number>;
  avoidedLossByZoneEurMillions: Record<string, number>;
  avoidedLossByRegionEurMillions: Record<string, number>;
  savingsPctByZone: Record<string, number>;
  savingsPctByRegion: Record<string, number>;
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
