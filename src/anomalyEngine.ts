import {
  AnalysisResult,
  DetectorAnalysisConfig,
  DetectorFinding,
  DetectorRecord,
  DEFAULT_CONFIG,
  SeverityLevel,
  SeriesStatistics,
} from "./types";
import { StatisticalAnalyzer } from "./statistics";

export class AnomalyEngine {
  private config: DetectorAnalysisConfig;
  private stats: StatisticalAnalyzer;

  constructor(config?: Partial<DetectorAnalysisConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = new StatisticalAnalyzer();
  }

  public analyzeDocument(
    detectors: DetectorRecord[],
    extractionNotes: string[] = []
  ): AnalysisResult {
    if (!detectors || detectors.length === 0) {
      return { detectors: [], extraction_notes: extractionNotes };
    }

    // Sort detectors by numeric ID (equivalent to _detector_sort_key in python)
    const sortedDetectors = [...detectors].sort((a, b) => {
      const aNum = parseInt(a.detector_id.replace(/\D/g, ""), 10) || 9999;
      const bNum = parseInt(b.detector_id.replace(/\D/g, ""), 10) || 9999;
      if (aNum !== bNum) return aNum - bNum;
      return a.detector_id.localeCompare(b.detector_id);
    });

    const findings: DetectorFinding[] = [];
    for (let i = 0; i < sortedDetectors.length; i++) {
      const leftNeighbor = i > 0 ? sortedDetectors[i - 1] : undefined;
      const rightNeighbor = i + 1 < sortedDetectors.length ? sortedDetectors[i + 1] : undefined;
      findings.push(this.analyzeDetector(sortedDetectors[i], leftNeighbor, rightNeighbor));
    }

    return {
      detectors: findings,
      extraction_notes: extractionNotes,
    };
  }

  public analyzeDetector(
    detector: DetectorRecord,
    leftNeighbor?: DetectorRecord,
    rightNeighbor?: DetectorRecord
  ): DetectorFinding {
    const event_rate = detector.event_rate || [];
    const adc = detector.adc || [];
    const tdc = detector.tdc || [];
    const pedestal_mean = detector.pedestal_mean || [];
    const pedestal_rms = detector.pedestal_rms || [];
    const gain = detector.gain || [];

    // Calculate Series Statistics
    const event_rate_stats = this.stats.summarize(event_rate);
    const adc_stats = this.stats.summarize(adc);
    const tdc_stats = this.stats.summarize(tdc);
    const pedestal_mean_stats = this.stats.summarize(pedestal_mean);
    const pedestal_rms_stats = this.stats.summarize(pedestal_rms);
    const gain_stats = this.stats.summarize(gain);

    // Neighbor calculations
    const neighbors: number[][] = [];
    if (leftNeighbor && leftNeighbor.event_rate && leftNeighbor.event_rate.length > 0) {
      neighbors.push(leftNeighbor.event_rate);
    }
    if (rightNeighbor && rightNeighbor.event_rate && rightNeighbor.event_rate.length > 0) {
      neighbors.push(rightNeighbor.event_rate);
    }
    const neighbor_dev = this.stats.neighborDeviation(event_rate, neighbors);

    const signals: string[] = [];
    const causes: string[] = [];
    const recommendations: string[] = [];
    let score = 100.0;
    let confidence = 55.0;

    // Check 1: Dead Detector
    const isRateZero = event_rate.length === 0 || event_rate.every((v) => v === 0);
    if (isRateZero) {
      signals.push("Dead Detector");
      causes.push("HV OFF", "PMT failure", "Disconnected cable");
      recommendations.push(
        "Verify HV supply",
        "Check PMT and cable continuity",
        "Inspect acquisition channel"
      );
      return this.buildFinding(
        detector.detector_id,
        0.0,
        SeverityLevel.CRITICAL,
        signals,
        causes,
        99.0,
        recommendations,
        "Dead Detector",
        detector,
        event_rate_stats,
        adc_stats,
        tdc_stats,
        pedestal_mean_stats,
        pedestal_rms_stats,
        gain_stats,
        neighbor_dev
      );
    }

    // Check 2: Event Rate Drop
    const isRateDrop = this.isDrop(event_rate, this.config.event_rate_drop_percent);
    if (isRateDrop) {
      signals.push("Event Rate Drop");
      causes.push("HV OFF", "PMT failure", "Calibration issues");
      recommendations.push("Review the high-voltage chain and trigger logic");
      score -= 22;
      confidence += 12;
    }

    // Check 3: Event Rate Spike (Noisy Detector)
    const isRateSpike = this.isSpike(event_rate, this.config.event_rate_spike_percent);
    if (isRateSpike) {
      signals.push("Noisy Detector");
      causes.push("Excessive electronic noise", "Electronics instability");
      recommendations.push("Inspect grounding, shielding, and readout noise");
      score -= 15;
      confidence += 8;
    }

    // Check 4: ADC Failure / Drift
    const isAdcDrift = this.isDrift(adc, this.config.adc_drift_percent);
    if (isAdcDrift) {
      signals.push("ADC Failure");
      causes.push("Calibration issues", "Electronics instability");
      recommendations.push("Recalibrate ADC response");
      score -= 14;
      confidence += 10;
    }

    // Check 5: Pedestal Mean Shift
    const isPedShift = this.isSigmaShift(pedestal_mean, this.config.pedestal_mean_shift_sigma);
    if (isPedShift) {
      signals.push("Pedestal Shift");
      causes.push("Baseline drift", "Temperature variation");
      recommendations.push("Check pedestal calibration and environment stability");
      score -= 14;
      confidence += 9;
    }

    // Check 6: Pedestal RMS Increase (Noisy)
    const isRmsShift = this.isSigmaShift(pedestal_rms, this.config.pedestal_rms_increase_sigma);
    if (isRmsShift) {
      signals.push("Noisy Detector");
      causes.push("Excessive electronic noise", "Loose connections");
      recommendations.push("Check noise sources and detector cabling");
      score -= 16;
      confidence += 9;
    }

    // Check 7: Gain Drift
    const isGainDrift = this.isDrift(gain, this.config.gain_drift_percent);
    if (isGainDrift) {
      signals.push("Gain Drift");
      causes.push("HV instability", "PMT aging", "Calibration issues");
      recommendations.push("Inspect gain calibration and HV stability");
      score -= 18;
      confidence += 11;
    }

    // Check 8: TDC Failure
    const isTdcFailure = tdc.length === 0 || tdc.every((v) => v === 0);
    if (isTdcFailure) {
      signals.push("TDC Failure");
      causes.push("Timing electronics failure", "Disconnected cable");
      recommendations.push("Verify the timing channel and cabling");
      score -= 18;
      confidence += 10;
    }

    // Check 9: Sudden Change
    const hasSuddenChange =
      this.suddenChangeDetected(event_rate_stats) ||
      this.suddenChangeDetected(adc_stats) ||
      this.suddenChangeDetected(pedestal_mean_stats) ||
      this.suddenChangeDetected(pedestal_rms_stats) ||
      this.suddenChangeDetected(gain_stats);

    if (hasSuddenChange) {
      signals.push("Temporary Detector Failure");
      causes.push("Electronics instability", "Intermittent cable issue");
      recommendations.push("Inspect acquisition timeline for transient failures");
      score -= 12;
      confidence += 7;
    }

    // Check 10: Flat Signal / Stall
    const isFlatSignal =
      this.isFlat(event_rate) && this.isFlat(adc) && this.isFlat(gain);
    if (isFlatSignal) {
      signals.push("Baseline Drift");
      causes.push("Detector stalled", "Calibration freeze");
      recommendations.push("Compare with neighboring detectors for confirmation");
      score -= 10;
      confidence += 6;
    }

    // Check 11: Neighbor Event Rate Mismatch
    if (neighbor_dev > this.config.neighbor_deviation_percent) {
      signals.push("Neighbor Detector Comparison Mismatch");
      causes.push("Localized detector instability");
      recommendations.push("Compare the detector against adjacent channels");
      score -= 8;
      confidence += 6;
    }

    // Handle Healthy case
    if (signals.length === 0) {
      return this.buildFinding(
        detector.detector_id,
        96.0,
        SeverityLevel.HEALTHY,
        ["No anomalies detected"],
        ["Normal operation"],
        96.0,
        ["Continue routine monitoring"],
        "Healthy",
        detector,
        event_rate_stats,
        adc_stats,
        tdc_stats,
        pedestal_mean_stats,
        pedestal_rms_stats,
        gain_stats,
        neighbor_dev
      );
    }

    score = Math.max(0.0, score);
    const severity = this.severityFromScore(score);
    const primaryReason = this.primaryReason(signals);
    confidence = Math.min(99.0, confidence);

    // Deduplicate array values
    const uniqueCauses = Array.from(new Set(causes));
    const uniqueRecs = Array.from(new Set(recommendations));

    return this.buildFinding(
      detector.detector_id,
      score,
      severity,
      signals,
      uniqueCauses,
      confidence,
      uniqueRecs,
      primaryReason,
      detector,
      event_rate_stats,
      adc_stats,
      tdc_stats,
      pedestal_mean_stats,
      pedestal_rms_stats,
      gain_stats,
      neighbor_dev
    );
  }

  private buildFinding(
    detectorId: string,
    healthScore: number,
    severity: SeverityLevel,
    signals: string[],
    causes: string[],
    confidence: number,
    recommendations: string[],
    reason: string,
    detector: DetectorRecord,
    eventRateStats: SeriesStatistics,
    adcStats: SeriesStatistics,
    tdcStats: SeriesStatistics,
    pedestalMeanStats: SeriesStatistics,
    pedestalRmsStats: SeriesStatistics,
    gainStats: SeriesStatistics,
    neighborDev: number
  ): DetectorFinding {
    return {
      detector_id: detectorId,
      health_score: parseFloat(healthScore.toFixed(1)),
      status: severity,
      severity: severity,
      reason: reason,
      suggested_cause: causes.join("; ") || "Under review",
      confidence: parseFloat(confidence.toFixed(1)),
      details: signals,
      recommendations: recommendations.length > 0 ? recommendations : ["Review detector history and compare against neighbors"],
      metrics: {
        event_rate: detector.event_rate,
        adc: detector.adc,
        tdc: detector.tdc,
        pedestal_mean: detector.pedestal_mean,
        pedestal_rms: detector.pedestal_rms,
        gain: detector.gain,
      },
      statistics: {
        event_rate: eventRateStats,
        adc: adcStats,
        tdc: tdcStats,
        pedestal_mean: pedestalMeanStats,
        pedestal_rms: pedestalRmsStats,
        gain: gainStats,
        neighbor_event_rate_deviation_percent: neighborDev,
      },
    };
  }

  private severityFromScore(score: number): SeverityLevel {
    if (score >= 85) return SeverityLevel.HEALTHY;
    if (score >= 70) return SeverityLevel.MINOR;
    if (score >= 40) return SeverityLevel.MODERATE;
    return SeverityLevel.CRITICAL;
  }

  private isDrop(values: number[], threshold: number): boolean {
    if (!values || values.length < 2) return false;
    const start = values[0];
    const end = values[values.length - 1];
    if (start === 0) return false;
    const drop = ((start - end) / Math.abs(start)) * 100.0;
    return drop >= threshold;
  }

  private isSpike(values: number[], threshold: number): boolean {
    if (!values || values.length < 2) return false;
    const last = values[values.length - 1];
    const preceding = values.slice(0, values.length - 1);
    
    // median of preceding values
    const sorted = [...preceding].sort((a, b) => a - b);
    const n = sorted.length;
    const baseline = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    if (baseline === 0) return false;
    const spike = ((last - baseline) / Math.abs(baseline)) * 100.0;
    return spike >= threshold;
  }

  private isDrift(values: number[], threshold: number): boolean {
    if (!values || values.length < 3) return false;
    const size = values.length;
    const third = Math.max(1, Math.floor(size / 3));

    const startSlice = values.slice(0, third);
    const endSlice = values.slice(size - third);

    const getMedian = (arr: number[]): number => {
      const s = [...arr].sort((a, b) => a - b);
      const l = s.length;
      return l % 2 === 0 ? (s[l / 2 - 1] + s[l / 2]) / 2 : s[Math.floor(l / 2)];
    };

    const start = getMedian(startSlice);
    const end = getMedian(endSlice);

    if (start === 0) return false;
    const change = (Math.abs(end - start) / Math.abs(start)) * 100.0;
    return change >= threshold;
  }

  private isSigmaShift(values: number[], thresholdSigma: number): boolean {
    if (!values || values.length < 4) return false;
    const size = values.length;
    const half = Math.max(2, Math.floor(size / 2));
    const third = Math.max(2, Math.floor(size / 3));

    const baseline = values.slice(0, half);
    const current = values.slice(size - third);

    // baseline mean and std dev
    const bMean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const bVar = baseline.reduce((a, b) => a + Math.pow(b - bMean, 2), 0) / baseline.length;
    const bStd = Math.sqrt(bVar);

    if (bStd === 0) return false;

    const cMean = current.reduce((a, b) => a + b, 0) / current.length;
    const zScore = Math.abs(cMean - bMean) / bStd;

    return zScore >= thresholdSigma;
  }

  private isFlat(values: number[], tolerancePercent: number = 0.5): boolean {
    if (!values || values.length < 3) return false;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return false;

    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const spread = (stdDev / Math.abs(mean)) * 100.0;
    return spread <= tolerancePercent;
  }

  private suddenChangeDetected(stats: SeriesStatistics): boolean {
    if (!stats || !stats.z_scores || stats.z_scores.length === 0) return false;
    const recentZ = stats.z_scores.slice(-3);
    return recentZ.some((z) => Math.abs(z) >= this.config.sudden_change_sigma);
  }

  private primaryReason(reasons: string[]): string {
    const preferredOrder = [
      "Dead Detector",
      "Noisy Detector",
      "Gain Drift",
      "Pedestal Shift",
      "Baseline Drift",
      "ADC Failure",
      "TDC Failure",
      "Temporary Detector Failure",
      "Event Rate Drop",
      "Neighbor Detector Comparison Mismatch",
    ];

    for (const reason of preferredOrder) {
      if (reasons.includes(reason)) return reason;
    }
    return reasons[0] || "Unknown Anomaly";
  }
}
