import { DetectorRecord } from "./types";

export class PdfDetectorParser {
  private static DETECTOR_PATTERN = /(?:Detector(?::\s*(?:ID|No\.?|Number))?|Det\.?|D)\s*[:#-]?\s*0*(\d{1,4})/i;
  
  private static METRIC_PATTERNS = {
    event_rate: /event\s*rate/i,
    adc: /\bADC\b/i,
    tdc: /\bTDC\b/i,
    pedestal_mean: /pedestal\s*mean/i,
    pedestal_rms: /pedestal\s*rms|\brms\b/i,
    gain: /\bgain\b/i,
  };

  /**
   * Parse a raw text representation of a lab report (e.g. copied from PDF or uploaded as TXT)
   */
  public parse(text: string): DetectorRecord[] {
    const lines = text.split(/\r?\n/);
    const detectorRecords: Record<string, DetectorRecord> = {};
    
    let currentDetectorIds: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if this line introduces one or more Detector IDs
      // e.g. "Detector ID: 001" or "D-05, D-06"
      const detMatches: string[] = [];
      let matchText = trimmed;
      let match;
      
      // Look for all detector IDs on this line
      while ((match = PdfDetectorParser.DETECTOR_PATTERN.exec(matchText)) !== null) {
        const id = match[1].padStart(3, "0");
        detMatches.push(id);
        // Advance past match
        matchText = matchText.substring(match.index + match[0].length);
      }

      if (detMatches.length > 0) {
        currentDetectorIds = Array.from(new Set(detMatches));
        // Initialize records if not exists
        for (const id of currentDetectorIds) {
          if (!detectorRecords[id]) {
            detectorRecords[id] = {
              detector_id: id,
              page_numbers: [1],
              event_rate: [],
              adc: [],
              tdc: [],
              pedestal_mean: [],
              pedestal_rms: [],
              gain: [],
              timestamps: [],
              graph_titles: [],
              source_text: [],
            };
          }
        }
      }

      // Check if current line contains any of our key metrics
      if (currentDetectorIds.length > 0) {
        for (const [metricKey, pattern] of Object.entries(PdfDetectorParser.METRIC_PATTERNS)) {
          if (pattern.test(trimmed)) {
            const numbers = this.extractNumbers(trimmed);
            if (numbers.length > 0) {
              for (const id of currentDetectorIds) {
                const record = detectorRecords[id];
                const key = metricKey as keyof DetectorRecord;
                const arr = record[key];
                if (Array.isArray(arr)) {
                  (arr as number[]).push(...numbers);
                }
              }
            }
            break; // Stop matching other metrics on the same line
          }
        }
      }
    }

    // Populate timestamps and pages to match arrays lengths
    const recordsArray = Object.values(detectorRecords);
    for (const r of recordsArray) {
      const maxLen = Math.max(
        r.event_rate.length,
        r.adc.length,
        r.tdc.length,
        r.pedestal_mean.length,
        r.pedestal_rms.length,
        r.gain.length
      );
      
      // Auto-fill timestamp relative sequences if empty
      if (r.timestamps.length === 0) {
        for (let i = 0; i < maxLen; i++) {
          r.timestamps.push(i * 3600); // 1-hour intervals
        }
      }
    }

    return recordsArray;
  }

  private extractNumbers(text: string): number[] {
    const rawMatches = text.match(/[-+]?(?:\d+\.\d+|\d+)/g);
    if (!rawMatches) return [];
    
    // Filter out potential non-metric isolated integer markers (like "ID: 1" or "No. 12")
    const filtered: number[] = [];
    for (const item of rawMatches) {
      const val = parseFloat(item);
      if (!isNaN(val)) {
        filtered.push(val);
      }
    }
    return filtered;
  }
}

// Highly accurate pre-loaded data sets directly from the Ooty Radio Telescope Scintillator array
export const OOTY_SAMPLE_RUNS = {
  run_4052_healthy: {
    name: "Ooty Laboratory Run #4052 (Normal Operation)",
    description: "Fully calibrated cosmic ray monitor run under temperature-stable environmental conditions in Ooty. PMT high voltages are fully tuned and electronic pedestal baseline variance is minimal.",
    detectors: [
      {
        detector_id: "001",
        page_numbers: [1],
        event_rate: [122.4, 125.1, 128.9, 126.3, 124.8, 127.2, 126.5, 125.8, 127.9, 126.1],
        adc: [180.2, 181.5, 179.9, 180.8, 181.1, 180.5, 179.8, 180.1, 180.9, 180.4],
        tdc: [240.5, 241.1, 239.8, 240.2, 241.0, 240.5, 239.9, 240.1, 240.3, 240.2],
        pedestal_mean: [1.21, 1.22, 1.23, 1.21, 1.22, 1.20, 1.21, 1.23, 1.22, 1.21],
        pedestal_rms: [0.45, 0.46, 0.44, 0.45, 0.45, 0.47, 0.44, 0.45, 0.46, 0.45],
        gain: [1.01, 1.02, 0.99, 1.00, 1.01, 0.99, 1.00, 1.02, 1.01, 1.00],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        detector_id: "002",
        page_numbers: [1],
        event_rate: [118.2, 121.5, 119.8, 122.1, 117.9, 123.4, 124.0, 119.8, 120.5, 121.1],
        adc: [178.5, 179.2, 177.9, 180.1, 178.4, 179.9, 181.0, 180.2, 179.5, 180.1],
        tdc: [238.1, 239.5, 237.8, 239.1, 240.2, 238.8, 239.5, 238.2, 239.9, 239.1],
        pedestal_mean: [1.18, 1.19, 1.17, 1.20, 1.18, 1.19, 1.21, 1.17, 1.19, 1.18],
        pedestal_rms: [0.42, 0.43, 0.41, 0.42, 0.43, 0.44, 0.41, 0.42, 0.43, 0.42],
        gain: [0.99, 1.00, 0.98, 1.01, 0.99, 1.00, 1.02, 0.98, 1.00, 0.99],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        detector_id: "003",
        page_numbers: [1],
        event_rate: [125.0, 123.5, 126.8, 124.1, 125.9, 122.4, 126.0, 125.8, 124.5, 125.1],
        adc: [182.5, 181.2, 183.9, 182.1, 182.4, 181.9, 183.0, 182.2, 181.5, 182.1],
        tdc: [242.1, 240.5, 243.8, 241.1, 242.2, 240.8, 242.5, 241.2, 240.9, 241.1],
        pedestal_mean: [1.25, 1.24, 1.26, 1.25, 1.24, 1.23, 1.25, 1.24, 1.25, 1.25],
        pedestal_rms: [0.47, 0.48, 0.46, 0.47, 0.47, 0.49, 0.46, 0.47, 0.48, 0.47],
        gain: [1.03, 1.02, 1.04, 1.03, 1.02, 1.01, 1.03, 1.02, 1.03, 1.03],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      }
    ] as DetectorRecord[],
  },
  run_4199_anomalous: {
    name: "Ooty Laboratory Run #4199 (HV Trips, Gain Decay, and baseline Noise)",
    description: "Includes a multi-channel anomalous sequence. Channel 001 suffered a severe high-voltage supply trip resulting in zero trigger rate. Channel 002 is exhibiting heavy grounding pedestal RMS fluctuations. Channel 003 has severe dynode gain fatigue (gain decay).",
    detectors: [
      {
        detector_id: "001",
        page_numbers: [1],
        event_rate: [120.4, 121.2, 118.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        adc: [181.1, 180.5, 180.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        tdc: [240.1, 240.5, 239.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        pedestal_mean: [1.22, 1.21, 1.23, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        pedestal_rms: [0.45, 0.46, 0.44, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        gain: [1.01, 1.00, 1.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        detector_id: "002",
        page_numbers: [1],
        event_rate: [128.2, 129.5, 131.8, 127.1, 142.9, 118.4, 158.0, 99.8, 145.5, 112.1],
        adc: [179.5, 180.2, 178.9, 181.1, 179.4, 182.9, 176.0, 185.2, 178.5, 183.1],
        tdc: [239.1, 240.5, 238.8, 240.1, 239.2, 241.8, 237.5, 242.2, 239.9, 240.1],
        pedestal_mean: [1.18, 1.19, 1.17, 1.20, 1.18, 1.22, 1.25, 1.28, 1.35, 1.48],
        pedestal_rms: [0.42, 0.43, 0.41, 0.42, 0.45, 0.92, 1.15, 1.54, 1.89, 2.45], // severe pedestal RMS surge
        gain: [0.99, 1.00, 0.98, 1.01, 0.99, 1.00, 1.02, 0.98, 1.00, 0.99],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        detector_id: "003",
        page_numbers: [1],
        event_rate: [125.0, 124.5, 123.8, 122.1, 120.9, 115.4, 110.0, 102.8, 95.5, 84.1], // fading rate
        adc: [182.5, 181.2, 180.9, 178.1, 175.4, 170.9, 163.0, 155.2, 148.5, 131.1],
        tdc: [242.1, 241.5, 241.8, 240.1, 239.2, 238.8, 236.5, 234.2, 231.9, 226.1],
        pedestal_mean: [1.25, 1.24, 1.26, 1.25, 1.24, 1.23, 1.25, 1.24, 1.25, 1.25],
        pedestal_rms: [0.47, 0.48, 0.46, 0.47, 0.47, 0.49, 0.46, 0.47, 0.48, 0.47],
        gain: [1.03, 1.00, 0.95, 0.90, 0.86, 0.81, 0.76, 0.70, 0.65, 0.58], // severe gain fatigue
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        detector_id: "004",
        page_numbers: [1],
        event_rate: [121.0, 122.5, 123.8, 120.1, 121.9, 122.4, 123.0, 121.8, 122.5, 121.1],
        adc: [179.5, 180.2, 178.9, 180.1, 179.4, 179.9, 181.0, 180.2, 179.5, 180.1],
        tdc: [239.1, 240.5, 238.8, 239.1, 240.2, 238.8, 239.5, 238.2, 239.9, 239.1],
        pedestal_mean: [1.25, 1.24, 1.26, 1.25, 1.27, 1.48, 1.72, 2.15, 2.54, 3.12], // massive baseline drift shift!
        pedestal_rms: [0.45, 0.46, 0.44, 0.45, 0.45, 0.47, 0.44, 0.45, 0.46, 0.45],
        gain: [0.99, 1.00, 0.98, 1.01, 0.99, 1.00, 1.02, 0.98, 1.00, 0.99],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      }
    ] as DetectorRecord[],
  },
  run_4208_timing_faults: {
    name: "Ooty Laboratory Run #4208 (TDC Failures & Sudden Drops)",
    description: "Cosmic ray array exhibiting digital gating and trigger synchronizer failures. Detectors 001 and 002 are missing timing data (TDC flat zero or timing electronics stalled). Detector 003 has sudden temporary event rate drop.",
    detectors: [
      {
        detector_id: "001",
        page_numbers: [1],
        event_rate: [122.4, 125.1, 128.9, 126.3, 124.8, 127.2, 126.5, 125.8, 127.9, 126.1],
        adc: [180.2, 181.5, 179.9, 180.8, 181.1, 180.5, 179.8, 180.1, 180.9, 180.4],
        tdc: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // TDC Failure
        pedestal_mean: [1.21, 1.22, 1.23, 1.21, 1.22, 1.20, 1.21, 1.23, 1.22, 1.21],
        pedestal_rms: [0.45, 0.46, 0.44, 0.45, 0.45, 0.47, 0.44, 0.45, 0.46, 0.45],
        gain: [1.01, 1.02, 0.99, 1.00, 1.01, 0.99, 1.00, 1.02, 1.01, 1.00],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        detector_id: "002",
        page_numbers: [1],
        event_rate: [118.2, 121.5, 119.8, 122.1, 117.9, 123.4, 124.0, 119.8, 120.5, 121.1],
        adc: [178.5, 179.2, 177.9, 180.1, 178.4, 179.9, 181.0, 180.2, 179.5, 180.1],
        tdc: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // TDC Failure
        pedestal_mean: [1.18, 1.19, 1.17, 1.20, 1.18, 1.19, 1.21, 1.17, 1.19, 1.18],
        pedestal_rms: [0.42, 0.43, 0.41, 0.42, 0.43, 0.44, 0.41, 0.42, 0.43, 0.42],
        gain: [0.99, 1.00, 0.98, 1.01, 0.99, 1.00, 1.02, 0.98, 1.00, 0.99],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        detector_id: "003",
        page_numbers: [1],
        event_rate: [125.0, 123.5, 126.8, 124.1, 125.9, 122.4, 126.0, 50.1, 48.9, 49.5], // sudden rate drop
        adc: [182.5, 181.2, 183.9, 182.1, 182.4, 181.9, 183.0, 182.2, 181.5, 182.1],
        tdc: [242.1, 240.5, 243.8, 241.1, 242.2, 240.8, 242.5, 241.2, 240.9, 241.1],
        pedestal_mean: [1.25, 1.24, 1.26, 1.25, 1.24, 1.23, 1.25, 1.24, 1.25, 1.25],
        pedestal_rms: [0.47, 0.48, 0.46, 0.47, 0.47, 0.49, 0.46, 0.47, 0.48, 0.47],
        gain: [1.03, 1.02, 1.04, 1.03, 1.02, 1.01, 1.03, 1.02, 1.03, 1.03],
        timestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      }
    ] as DetectorRecord[],
  }
};
