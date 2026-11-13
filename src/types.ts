export type Severity = 'baixa' | 'media' | 'urgente';
export type MicroareaStatus = 'saudavel' | 'atencao' | 'critico';
export type ReportCategory = 'praga' | 'doenca' | 'irrigacao' | 'clima' | 'nutricao' | 'geral';
export type TreatmentEfficiency = 'eficiente' | 'parcial' | 'ineficiente';

export interface ProducerProfile {
  uid: string;
  displayName: string;
  farmName: string;
  region: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Microarea {
  id: string;
  ownerId: string;
  name: string;
  crop: string;
  sector: string;
  status: MicroareaStatus;
  latitude: number;
  longitude: number;
  lastReportSummary: string;
  lastSeverity: 'nenhuma' | Severity;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FieldReport {
  id: string;
  ownerId: string;
  microareaId: string;
  microareaName: string;
  crop: string;
  transcript: string;
  pestProblem: string;
  pestCount: string;
  currentTreatment: string;
  treatmentEfficiency: TreatmentEfficiency;
  recommendedSolution: string;
  severity: Severity;
  category: ReportCategory;
  detectedKeywords: string[];
  latitude: number;
  longitude: number;
  resolved: boolean;
  seasonMonth: string; // YYYY-MM
  createdAtMs: number;
  updatedAtMs: number;
}

export interface WeatherDay {
  date: string;
  label: string;
  tempMin: number;
  tempMax: number;
  humidityMean: number;
  precipitationProb: number;
  weatherCode: number;
  conditionText: string;
}

export interface WeatherSnapshot {
  locationLabel: string;
  latitude: number;
  longitude: number;
  currentTemp: number;
  currentHumidity: number;
  currentCondition: string;
  fetchedAt: string;
  days: WeatherDay[];
}

export interface PhytosanitaryAlert {
  level: 'baixo' | 'moderado' | 'alto';
  title: string;
  recommendation: string;
  factors: string[];
}

export interface ClassificationResult {
  severity: Severity;
  category: ReportCategory;
  detectedKeywords: string[];
  suggestedProblem: string;
  suggestedTreatment: string;
  suggestedSolution: string;
}
