import { SeriesStatistics } from "./types";

export class StatisticalAnalyzer {
  public summarize(values: number[], window: number = 5): SeriesStatistics {
    if (!values || values.length === 0) {
      return {
        average: 0,
        median: 0,
        std_dev: 0,
        rolling_mean: [],
        rolling_std: [],
        z_scores: [],
        mad: 0,
        iqr: 0,
        slope: 0,
        outlier_count: 0,
        trend: "stable",
      };
    }

    const n = values.length;
    
    // Average
    const sum = values.reduce((acc, val) => acc + val, 0);
    const average = sum / n;

    // Median
    const sorted = [...values].sort((a, b) => a - b);
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Standard deviation
    const squareDiffsSum = values.reduce((acc, val) => acc + Math.pow(val - average, 2), 0);
    const std_dev = Math.sqrt(squareDiffsSum / n);

    // MAD
    const absDeviations = values.map((val) => Math.abs(val - median));
    const sortedAbsDevs = [...absDeviations].sort((a, b) => a - b);
    const mad = n % 2 === 0
      ? (sortedAbsDevs[n / 2 - 1] + sortedAbsDevs[n / 2]) / 2
      : sortedAbsDevs[Math.floor(n / 2)];

    // IQR
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    // Z-scores
    const z_scores = values.map((val) =>
      std_dev === 0 ? 0 : (val - average) / std_dev
    );

    // Slope (Simple Linear Regression of values against X = [0..n-1])
    let slope = 0;
    if (n >= 2) {
      const xMean = (n - 1) / 2;
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i++) {
        const xDiff = i - xMean;
        numerator += xDiff * (values[i] - average);
        denominator += xDiff * xDiff;
      }
      slope = denominator === 0 ? 0 : numerator / denominator;
    }

    // Outlier count
    const outlier_count = z_scores.filter((z) => Math.abs(z) > 3.0).length;

    // Trend
    const trend = slope > 0.05 ? "increasing" : slope < -0.05 ? "decreasing" : "stable";

    // Rolling Mean and Rolling Std
    const rolling_mean: number[] = [];
    const rolling_std: number[] = [];

    for (let index = 0; index < n; index++) {
      const start = Math.max(0, index - window + 1);
      const windowSlice = values.slice(start, index + 1);
      const wCount = windowSlice.length;

      const wSum = windowSlice.reduce((a, b) => a + b, 0);
      const wMean = wSum / wCount;
      rolling_mean.push(wMean);

      const wSqDiffSum = windowSlice.reduce((a, b) => a + Math.pow(b - wMean, 2), 0);
      const wStd = Math.sqrt(wSqDiffSum / wCount);
      rolling_std.push(wStd);
    }

    return {
      average,
      median,
      std_dev,
      rolling_mean,
      rolling_std,
      z_scores,
      mad,
      iqr,
      slope,
      outlier_count,
      trend,
    };
  }

  public neighborDeviation(current: number[], neighbors: number[][]): number {
    if (!current || current.length === 0 || !neighbors || neighbors.length === 0) {
      return 0.0;
    }

    const currentSum = current.reduce((a, b) => a + b, 0);
    const currentMean = currentSum / current.length;

    const neighborMeans: number[] = [];
    for (const series of neighbors) {
      if (series && series.length > 0) {
        const nSum = series.reduce((a, b) => a + b, 0);
        neighborMeans.push(nSum / series.length);
      }
    }

    if (neighborMeans.length === 0) {
      return 0.0;
    }

    const baselineSum = neighborMeans.reduce((a, b) => a + b, 0);
    const baseline = baselineSum / neighborMeans.length;

    if (baseline === 0) {
      return 0.0;
    }

    return (Math.abs(currentMean - baseline) / Math.abs(baseline)) * 100.0;
  }
}
