export enum SeverityLevel {
  HEALTHY = "Healthy",
  MINOR = "Minor",
  MODERATE = "Moderate",
  CRITICAL = "Critical"
}

export interface SeriesStatistics {
  average: number;
  median: number;
  std_dev: number;
  rolling_mean: number[];
  rolling_std: number[];
  z_scores: number[];
  mad: number;
  iqr: number;
  slope: number;
  outlier_count: number;
  trend: "stable" | "increasing" | "decreasing";
}

export interface DetectorRecord {
  detector_id: string;
  page_numbers: number[];
  event_rate: number[];
  adc: number[];
  tdc: number[];
  pedestal_mean: number[];
  pedestal_rms: number[];
  gain: number[];
  timestamps: number[]; // seconds relative to start or epoch
  source_text?: string[];
  graph_titles?: string[];
}

export interface DetectorFinding {
  detector_id: string;
  health_score: number;
  status: string;
  severity: SeverityLevel;
  reason: string;
  suggested_cause: string;
  confidence: number;
  details: string[];
  recommendations: string[];
  metrics: {
    event_rate?: number[];
    adc?: number[];
    tdc?: number[];
    pedestal_mean?: number[];
    pedestal_rms?: number[];
    gain?: number[];
  };
  statistics: {
    event_rate?: SeriesStatistics;
    adc?: SeriesStatistics;
    tdc?: SeriesStatistics;
    pedestal_mean?: SeriesStatistics;
    pedestal_rms?: SeriesStatistics;
    gain?: SeriesStatistics;
    neighbor_event_rate_deviation_percent: number;
  };
}

export interface AnalysisResult {
  detectors: DetectorFinding[];
  extraction_notes: string[];
}

export interface DetectorAnalysisConfig {
  event_rate_drop_percent: number;
  event_rate_spike_percent: number;
  adc_drift_percent: number;
  pedestal_mean_shift_sigma: number;
  pedestal_rms_increase_sigma: number;
  gain_drift_percent: number;
  gain_loss_percent: number;
  neighbor_deviation_percent: number;
  sudden_change_sigma: number;
}

export const DEFAULT_CONFIG: DetectorAnalysisConfig = {
  event_rate_drop_percent: 70.0,
  event_rate_spike_percent: 70.0,
  adc_drift_percent: 15.0,
  pedestal_mean_shift_sigma: 3.0,
  pedestal_rms_increase_sigma: 3.0,
  gain_drift_percent: 15.0,
  gain_loss_percent: 30.0,
  neighbor_deviation_percent: 25.0,
  sudden_change_sigma: 3.0
};
