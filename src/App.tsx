import React, { useState, useEffect, useRef } from "react";
import {
  Activity,
  Cpu,
  Server,
  Upload,
  Download,
  Settings,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Terminal,
  Sliders,
  FileText,
  RefreshCw,
  HelpCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  Database
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar
} from "recharts";

import {
  DetectorRecord,
  DetectorFinding,
  SeverityLevel,
  DEFAULT_CONFIG,
  DetectorAnalysisConfig
} from "./types";
import { AnomalyEngine } from "./anomalyEngine";
import { OOTY_SAMPLE_RUNS, PdfDetectorParser } from "./dataLoader";

// Static definitions
const RUNS_OPTIONS = [
  { key: "run_4052_healthy", label: "Ooty Calibrated Run #4052 (Fully Normal)", source: OOTY_SAMPLE_RUNS.run_4052_healthy },
  { key: "run_4199_anomalous", label: "Ooty Anomalous Run #4199 (HV Trips & Drift)", source: OOTY_SAMPLE_RUNS.run_4199_anomalous },
  { key: "run_4208_timing_faults", label: "Ooty Gating Run #4208 (TDC Failures)", source: OOTY_SAMPLE_RUNS.run_4208_timing_faults }
];

export default function App() {
  // State variables
  const [selectedRunKey, setSelectedRunKey] = useState<string>("run_4199_anomalous");
  const [currentConfig, setCurrentConfig] = useState<DetectorAnalysisConfig>(DEFAULT_CONFIG);
  const [activeDetectorId, setActiveDetectorId] = useState<string>("001");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedMetric, setSelectedMetric] = useState<string>("event_rate");
  
  // Custom file uploaded states
  const [customFileText, setCustomFileText] = useState<string>("");
  const [customFileName, setCustomFileName] = useState<string>("");
  const [customRecords, setCustomRecords] = useState<DetectorRecord[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsingNotes, setParsingNotes] = useState<string[]>([]);
  const [parserMode, setParserMode] = useState<"client" | "ai">("client");
  const [apiError, setApiError] = useState<string | null>(null);

  // Live simulation telemetry state
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [liveHz, setLiveHz] = useState<number>(128.4);
  const [totalMuonCount, setTotalMuonCount] = useState<number>(341952);
  const [liveFlickeringCells, setLiveFlickeringCells] = useState<boolean[]>(Array(16).fill(false));
  const [liveLogs, setLiveLogs] = useState<string[]>([
    "System Boot Completed. Listening on scintillator arrays (Ooty).",
    "PMT bias voltage normalized at -1350V.",
    "Dual threshold discriminators active."
  ]);

  // Settings Modal open state
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Refs for auto-scrolling log
  const terminalLogEndRef = useRef<HTMLDivElement>(null);

  // Live Scintillator Array & Telemetry ticking
  useEffect(() => {
    if (!isLiveActive) return;

    const interval = setInterval(() => {
      // Tick live muon statistics
      setTotalMuonCount((prev) => prev + Math.floor(Math.random() * 5) + 1);
      
      const newHz = 120 + Math.random() * 15 - 7.5;
      setLiveHz(parseFloat(newHz.toFixed(1)));

      // Flicker random grid cells (scintillators registering hits)
      const newCells = Array(16).fill(false);
      const activeCount = Math.floor(Math.random() * 4) + 1;
      for (let i = 0; i < activeCount; i++) {
        const randIndex = Math.floor(Math.random() * 16);
        newCells[randIndex] = true;
      }
      setLiveFlickeringCells(newCells);

      // Append particle logs
      if (Math.random() > 0.4) {
        const detId = String(Math.floor(Math.random() * 4) + 1).padStart(3, "0");
        const energy = (15.5 + Math.random() * 45).toFixed(1);
        const theta = (Math.random() * 60).toFixed(1);
        const timestamp = new Date().toLocaleTimeString();
        const newLog = `[${timestamp}] MUON COUNT DETECTED: CH_${detId} | Energy: ${energy} MeV | Theta: ${theta}°`;
        
        setLiveLogs((prev) => {
          const next = [...prev, newLog];
          if (next.length > 50) next.shift(); // Keep last 50
          return next;
        });
      }
    }, 450);

    return () => clearInterval(interval);
  }, [isLiveActive]);

  // Auto scroll telemetry logs
  useEffect(() => {
    if (terminalLogEndRef.current) {
      terminalLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveLogs]);

  // Determine current working detector records
  const getActiveRecords = (): DetectorRecord[] => {
    if (selectedRunKey === "custom") {
      return customRecords;
    }
    const opt = RUNS_OPTIONS.find((o) => o.key === selectedRunKey);
    return opt ? opt.source.detectors : [];
  };

  const records = getActiveRecords();

  // Run the Anomaly Engine on active records
  const engine = new AnomalyEngine(currentConfig);
  const analysisResult = engine.analyzeDocument(records, parsingNotes);
  const findings = analysisResult.detectors;

  // Filtered findings for Search Query
  const filteredFindings = findings.filter((f) =>
    f.detector_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Auto select active detector if the list changes or active detector isn't in findings
  useEffect(() => {
    if (findings.length > 0) {
      const activeExists = findings.some((f) => f.detector_id === activeDetectorId);
      if (!activeExists) {
        setActiveDetectorId(findings[0].detector_id);
      }
    }
  }, [findings, activeDetectorId]);

  // Handle preloaded run selection change
  const handleRunChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRunKey(e.target.value);
    setApiError(null);
  };

  // Find detailed finding of selected detector
  const activeFinding = findings.find((f) => f.detector_id === activeDetectorId) || findings[0];

  // Client-side local file parsing (Regex standard fallback)
  const parseLocalFileText = (text: string, name: string) => {
    setIsParsing(true);
    setApiError(null);
    try {
      const parser = new PdfDetectorParser();
      const extracted = parser.parse(text);
      if (extracted.length === 0) {
        throw new Error("No detector matches or numeric series patterns found. Ensure the document mentions 'Detector ID' or 'Detector' and key series metrics.");
      }
      setCustomRecords(extracted);
      setCustomFileName(name);
      setParsingNotes([
        `File "${name}" parsed successfully using client-side regular expression parser.`,
        `Extracted ${extracted.length} detector records automatically.`
      ]);
      setSelectedRunKey("custom");
    } catch (err: any) {
      setApiError(err.message || "Failed to parse local file.");
    } finally {
      setIsParsing(false);
    }
  };

  // AI-powered Server-side file parsing via Gemini
  const handleAiFileParsing = async (text: string, name: string) => {
    setIsParsing(true);
    setApiError(null);
    try {
      const response = await fetch("/api/analyze-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileText: text, fileName: name })
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Server parsing failed.");
      }

      if (data.detectors && data.detectors.length > 0) {
        setCustomRecords(data.detectors);
        setCustomFileName(name);
        setParsingNotes(data.extractionNotes || ["Parsed successfully via Gemini AI."]);
        setSelectedRunKey("custom");
      } else {
        throw new Error("Gemini completed parsing but returned 0 valid detector metrics.");
      }
    } catch (err: any) {
      setApiError(err.message || "Failed to parse using Gemini AI. Falling back to local regex parser.");
      // Fallback to client-side parsing automatically!
      parseLocalFileText(text, name);
    } finally {
      setIsParsing(false);
    }
  };

  // Handle Drag-and-Drop or direct File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      setCustomFileText(text);
      if (parserMode === "ai") {
        await handleAiFileParsing(text, file.name);
      } else {
        parseLocalFileText(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  // Trigger browser print workflow for the PDF-optimized scientific layout
  const handleExportPDF = () => {
    window.print();
  };

  // Export structured CSV file of the analyzed runs
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Detector ID,Health Score,Severity,Primary Finding,Suggested Hardware Cause,Confidence %,Recommendations\n";
    
    findings.forEach((f) => {
      const recs = f.recommendations.join(" | ").replace(/"/g, '""');
      const row = `${f.detector_id},${f.health_score},${f.severity},"${f.reason}","${f.suggested_cause}",${f.confidence},"${recs}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ooty_Detector_Analysis_${selectedRunKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Prepare recharts multi-series data for the selected metric
  const getChartData = () => {
    if (!activeFinding) return [];
    const metricValues = activeFinding.metrics[selectedMetric as keyof typeof activeFinding.metrics] || [];
    const stats = activeFinding.statistics[selectedMetric as keyof typeof activeFinding.statistics] as any;
    const rolling = stats?.rolling_mean || [];

    return metricValues.map((val: number, idx: number) => {
      const labelTime = `H-${idx + 1}`;
      return {
        name: labelTime,
        value: parseFloat(val.toFixed(2)),
        rolling_mean: rolling[idx] ? parseFloat(rolling[idx].toFixed(2)) : undefined,
      };
    });
  };

  const chartData = getChartData();

  // Settings: Reset thresholds to defaults
  const handleResetThresholds = () => {
    setCurrentConfig(DEFAULT_CONFIG);
  };

  return (
    <div className="min-h-screen bg-[#05060f] text-slate-100 font-sans antialiased flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-300 relative overflow-hidden">
      
      {/* Ambient background glows for Frosted Glass theme */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/15 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/15 rounded-full blur-[100px]"></div>
        <div className="absolute top-[30%] right-[20%] w-[35%] h-[35%] bg-blue-900/10 rounded-full blur-[130px]"></div>
      </div>
      
      {/* Header Panel */}
      <header className="no-print border-b border-white/10 bg-white/5 backdrop-blur-xl px-6 py-4 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)] text-white">
              <Activity className="h-6 w-6 animate-pulse" id="header-logo-icon" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-lg md:text-xl text-slate-100 tracking-tight uppercase italic">
                  COSMIC RAY LABORATORY <span className="text-indigo-400">ANALYZER</span>
                </h1>
                <span className="px-2 py-0.5 text-[10px] uppercase font-mono tracking-widest bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 rounded-full">
                  Ooty Observatory
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Dynamic Diagnostic Engine & PMT Calibration Telemetry
              </p>
            </div>
          </div>

          {/* Quick Stats bar */}
          <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 backdrop-blur-md rounded-full font-mono text-xs">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400">Active Run:</span>
              <span className="text-indigo-400 font-bold uppercase">
                {selectedRunKey === "custom" ? "Custom File" : selectedRunKey.replace("run_", "Run #")}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 backdrop-blur-md rounded-full font-mono text-xs">
              <Cpu className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400">Calibration Nodes:</span>
              <span className="text-indigo-400 font-bold">{records.length}</span>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-slate-100 rounded-full border border-white/10 font-medium text-xs backdrop-blur-md transition duration-150"
              id="settings-panel-btn"
            >
              <Settings className="h-4 w-4" />
              <span>Thresholds</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 w-full flex-grow space-y-6 z-10 relative">
        
        {/* ROW 1: Real-time Telemetry Monitor + Data Loader Dropzone */}
        <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Live Telemetry Node Feed */}
          <div className="lg:col-span-7 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Terminal className="h-32 w-32" />
            </div>

            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                </span>
                <h3 className="font-display font-semibold text-sm tracking-wide text-indigo-300 uppercase">
                  OOTY LIVE MUON TELEMETRY FEED
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLiveActive(!isLiveActive)}
                  className={`px-3 py-1 text-[10px] font-mono tracking-wider border rounded-full uppercase transition duration-150 ${
                    isLiveActive
                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20"
                      : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                  }`}
                  id="live-simulation-toggle"
                >
                  {isLiveActive ? "LIVE FEED ACTIVE" : "PAUSED"}
                </button>
              </div>
            </div>

            {/* Grid display of scintillator matrix */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-5 flex flex-col items-center justify-center p-3 bg-black/40 rounded-xl border border-white/10">
                <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400">Scintillator Grid 4x4</span>
                <div className="grid grid-cols-4 gap-2.5 mt-3">
                  {liveFlickeringCells.map((isActive, idx) => (
                    <div
                      key={idx}
                      className={`h-7 w-7 rounded border transition-all duration-100 ${
                        isActive
                          ? "bg-indigo-500/80 border-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.6)] scale-105"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                      title={`Scintillator Segment #${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* Core numbers */}
              <div className="md:col-span-7 grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 backdrop-blur-md">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Trigger Frequency</span>
                  <span className="font-mono text-xl font-bold text-slate-200 mt-1 block">
                    {liveHz} <span className="text-xs text-slate-400">Hz</span>
                  </span>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 backdrop-blur-md">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Total Registered Muons</span>
                  <span className="font-mono text-xl font-bold text-indigo-400 mt-1 block">
                    {totalMuonCount.toLocaleString()}
                  </span>
                </div>
                <div className="col-span-2 bg-black/40 rounded-xl border border-white/10 p-2.5 text-[10px] font-mono h-24 overflow-y-auto space-y-1 select-none scrollbar-thin">
                  {liveLogs.slice(-6).map((log, idx) => (
                    <div key={idx} className="text-indigo-300/80 flex items-start gap-1">
                      <span className="text-slate-500">&gt;</span>
                      <span className="break-all">{log}</span>
                    </div>
                  ))}
                  <div ref={terminalLogEndRef} />
                </div>
              </div>
            </div>
          </div>

          {/* Calibrated Dataset Loader & Upload Zone */}
          <div className="lg:col-span-5 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-5 flex flex-col justify-between">
            <div className="border-b border-white/10 pb-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-400" />
                <h3 className="font-display font-semibold text-sm tracking-wide text-slate-300 uppercase">
                  DATA SET SELECTOR & IMPORT
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-mono">Mode:</span>
                <button
                  onClick={() => setParserMode(parserMode === "client" ? "ai" : "client")}
                  className={`px-2 py-0.5 text-[9px] font-mono rounded-full tracking-wider border transition ${
                    parserMode === "ai"
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                      : "bg-white/10 text-slate-300 border-white/10 hover:bg-white/20"
                  }`}
                  title="Switch between Local regex parser and server-side Gemini AI parser"
                  id="parser-mode-toggle"
                >
                  {parserMode === "ai" ? "GEMINI AI" : "LOCAL RE"}
                </button>
              </div>
            </div>

            {/* Selection */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1 uppercase tracking-wider">
                  1. Load Lab Reference Dataset
                </label>
                <select
                  value={selectedRunKey}
                  onChange={handleRunChange}
                  className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-slate-100 rounded-xl px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none focus:border-indigo-500/50 backdrop-blur-md transition-colors"
                  id="run-dataset-select"
                >
                  {RUNS_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key} className="bg-[#05060f] text-slate-100">
                      {o.label}
                    </option>
                  ))}
                  {customRecords.length > 0 && (
                    <option value="custom" className="bg-[#05060f] text-slate-100">Custom: {customFileName || "Loaded File"}</option>
                  )}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 font-sans leading-relaxed italic">
                  {selectedRunKey === "custom"
                    ? "Currently inspecting uploaded log metrics parsed from " + customFileName
                    : RUNS_OPTIONS.find((o) => o.key === selectedRunKey)?.source.description}
                </p>
              </div>

              {/* Upload input */}
              <div className="relative group">
                <label className="text-xs font-mono text-slate-400 block mb-1 uppercase tracking-wider">
                  2. Import Raw Laboratory Logs (PDF / TXT / CSV)
                </label>
                <div className="border border-dashed border-white/20 group-hover:border-indigo-500/40 rounded-xl p-4 bg-white/5 hover:bg-white/10 backdrop-blur-md transition duration-150 flex flex-col items-center justify-center text-center relative cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.txt,.csv,.log,.ps"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="file-upload-input"
                  />
                  <Upload className="h-6 w-6 text-slate-400 group-hover:text-indigo-400 mb-1.5 transition" />
                  <span className="text-xs text-slate-300 font-sans">
                    Drag files here or <span className="text-indigo-400 font-medium">browse</span>
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono mt-0.5 uppercase tracking-wider">
                    Supports .pdf, .txt, .csv, .log
                  </span>
                </div>
              </div>

              {/* Parsing status / errors */}
              {isParsing && (
                <div className="flex items-center gap-2 text-xs font-mono text-purple-400 bg-purple-950/20 p-2.5 rounded-lg border border-purple-500/20">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Parsing cosmic logs using {parserMode === "ai" ? "Gemini-3.5-flash AI..." : "local regex engine..."}</span>
                </div>
              )}

              {apiError && (
                <div className="text-[10px] font-mono text-red-400 bg-red-950/20 p-2.5 rounded-lg border border-red-500/20 flex gap-1.5 items-start">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="font-bold">Error:</span> {apiError}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ROW 2: Threshold Tune summary alert + Detector Summary Table */}
        <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Main Table Panel */}
          <div className="lg:col-span-12 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/10 pb-4 mb-4 gap-4">
              <div>
                <h3 className="font-display font-bold text-base text-indigo-300 tracking-wider uppercase">
                  DETECTOR ARRAY DIAGNOSTIC SUMMARIES
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time health coefficient matrix derived from statistical deviation modeling. Click a row to load full chart analytics.
                </p>
              </div>

              {/* Search & Export Buttons */}
              <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                <input
                  type="text"
                  placeholder="Filter by Detector or Status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white/5 border border-white/10 focus:border-indigo-500/50 hover:bg-white/10 text-slate-100 text-xs rounded-xl px-3 py-2 w-full md:w-56 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono transition-colors"
                  id="detector-search-input"
                />
                
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-slate-100 rounded-xl border border-white/10 font-medium text-xs backdrop-blur-md transition duration-150"
                  id="export-csv-btn"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-400" />
                  <span>CSV Export</span>
                </button>

                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-slate-100 rounded-xl border border-white/10 font-medium text-xs backdrop-blur-md transition duration-150"
                  id="export-pdf-btn"
                >
                  <FileText className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Print Report</span>
                </button>
              </div>
            </div>

            {/* Responsive Table */}
            <div className="overflow-x-auto rounded-xl border border-white/10 backdrop-blur-md">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-white/10 border-b border-white/10 text-indigo-300 uppercase font-mono tracking-wider text-[10px]">
                    <th className="py-3.5 px-4">Detector ID</th>
                    <th className="py-3.5 px-4 text-center">Health Index</th>
                    <th className="py-3.5 px-4">Severity Badge</th>
                    <th className="py-3.5 px-4">Flagged Anomalies / Findings</th>
                    <th className="py-3.5 px-4">Suggested Hardware Cause</th>
                    <th className="py-3.5 px-4 text-right">Confidence</th>
                    <th className="py-3.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredFindings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                        No detectors match the filter query.
                      </td>
                    </tr>
                  ) : (
                    filteredFindings.map((find) => {
                      const isSelected = find.detector_id === activeDetectorId;
                      
                      // Theme selectors for severity badges
                      let badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                      if (find.severity === SeverityLevel.MINOR) {
                        badgeStyle = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                      } else if (find.severity === SeverityLevel.MODERATE) {
                        badgeStyle = "bg-orange-500/10 text-orange-400 border-orange-500/20";
                      } else if (find.severity === SeverityLevel.CRITICAL) {
                        badgeStyle = "bg-red-500/10 text-red-400 border-red-500/20";
                      }

                      // Score indicators
                      let scoreColor = "text-emerald-400";
                      if (find.health_score < 40) scoreColor = "text-red-400";
                      else if (find.health_score < 70) scoreColor = "text-orange-400";
                      else if (find.health_score < 85) scoreColor = "text-yellow-400";

                      return (
                        <tr
                          key={find.detector_id}
                          onClick={() => setActiveDetectorId(find.detector_id)}
                          className={`cursor-pointer transition-colors duration-100 ${
                            isSelected
                              ? "bg-indigo-500/10 hover:bg-indigo-500/15 border-l-2 border-l-indigo-400"
                              : "hover:bg-white/5"
                          }`}
                          id={`detector-row-${find.detector_id}`}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                            DET-{find.detector_id}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono">
                            <span className={`font-bold text-sm ${scoreColor}`}>
                              {find.health_score}%
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-0.5 border rounded-full text-[10px] uppercase font-mono tracking-wider font-semibold ${badgeStyle}`}>
                              {find.severity}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-300">
                            {find.reason}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate">
                            {find.suggested_cause}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-300">
                            {find.confidence}%
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="text-indigo-400 font-semibold hover:underline inline-flex items-center gap-0.5 hover:text-indigo-300">
                              Analyze <ChevronRight className="h-3 w-3" />
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* ROW 3: Visual Analytics Chart Dashboard & Detailed Diagnostic Ledger */}
        <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Detailed Waveform Charts */}
          <div className="lg:col-span-7 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-3 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-400 animate-pulse" />
                  <h3 className="font-display font-semibold text-sm tracking-wide text-slate-300 uppercase">
                    WAVEFORM PARAMETER DRIFT ANALYTICS
                  </h3>
                </div>
                
                {/* Selector for metrics */}
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 text-[10px] font-mono rounded px-2.5 py-1 focus:outline-none focus:border-indigo-500/50 backdrop-blur-md transition-colors"
                  id="metric-chart-select"
                >
                  <option value="event_rate" className="bg-[#05060f] text-slate-100">Event Rate (Hz)</option>
                  <option value="adc" className="bg-[#05060f] text-slate-100">ADC Spectrum Peaks</option>
                  <option value="tdc" className="bg-[#05060f] text-slate-100">TDC Timing Gating</option>
                  <option value="pedestal_mean" className="bg-[#05060f] text-slate-100">Pedestal Mean Shift</option>
                  <option value="pedestal_rms" className="bg-[#05060f] text-slate-100">Pedestal RMS noise</option>
                  <option value="gain" className="bg-[#05060f] text-slate-100">PMT Gain Coefficients</option>
                </select>
              </div>

              {/* Chart container */}
              <div className="h-72 w-full mt-4 bg-black/30 rounded-xl p-2 border border-white/5">
                {chartData.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-slate-500 font-mono text-xs">
                    No timeline data to render.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.9)",
                          borderColor: "rgba(255, 255, 255, 0.15)",
                          borderRadius: "12px",
                          color: "#f1f5f9",
                          fontSize: "11px",
                          fontFamily: "monospace",
                          backdropFilter: "blur(8px)"
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "10px", fontFamily: "monospace" }}
                      />
                      <Line
                        name={`Measured ${selectedMetric.replace("_", " ").toUpperCase()}`}
                        type="monotone"
                        dataKey="value"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#05060f", stroke: "#6366f1", strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        name="Rolling Average (Window: 5)"
                        type="monotone"
                        dataKey="rolling_mean"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between font-mono text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-indigo-400" /> Measure Interval: 3600s increments
              </span>
              <span>Selected Detector: <strong className="text-indigo-400 font-bold">DET-{activeDetectorId}</strong></span>
            </div>
          </div>

          {/* Detailed Diagnostic Ledger */}
          <div className="lg:col-span-5 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-5 flex flex-col justify-between">
            {activeFinding ? (
              <div className="space-y-4">
                
                {/* Header */}
                <div className="border-b border-white/10 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">Ledger Profile:</span>
                    <span className="font-mono text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/30">
                      DET-{activeFinding.detector_id}
                    </span>
                  </div>
                  <h4 className="font-display font-bold text-sm text-slate-200 mt-1 uppercase">
                    CALIBRATION HEALTH & DIAGNOSTIC LEDGER
                  </h4>
                </div>

                {/* Statistical Grid */}
                <div>
                  <h5 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                    Metric Statistical Summary ({selectedMetric.toUpperCase()})
                  </h5>
                  {(() => {
                    const statObj = activeFinding.statistics[selectedMetric as keyof typeof activeFinding.statistics] as any;
                    if (!statObj) {
                      return <p className="text-[10px] text-slate-500 font-mono italic">No stats available</p>;
                    }
                    
                    return (
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                          <span className="text-slate-500 block">Series Average:</span>
                          <span className="text-slate-200 font-bold text-[11px]">
                            {statObj.average?.toFixed(3) || "0.000"}
                          </span>
                        </div>
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                          <span className="text-slate-500 block">Median Voltage:</span>
                          <span className="text-slate-200 font-bold text-[11px]">
                            {statObj.median?.toFixed(3) || "0.000"}
                          </span>
                        </div>
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                          <span className="text-slate-500 block">Standard Dev (σ):</span>
                          <span className="text-slate-200 font-bold text-[11px]">
                            {statObj.std_dev?.toFixed(4) || "0.0000"}
                          </span>
                        </div>
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                          <span className="text-slate-500 block">Slope Drift Rate:</span>
                          <span className={`font-bold text-[11px] ${
                            statObj.slope > 0.05 ? "text-indigo-400 animate-pulse" : statObj.slope < -0.05 ? "text-red-400" : "text-slate-400"
                          }`}>
                            {statObj.slope?.toFixed(5) || "0.00000"} ({statObj.trend || "stable"})
                          </span>
                        </div>
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                          <span className="text-slate-500 block">IQR Dispersion:</span>
                          <span className="text-slate-200 font-bold text-[11px]">
                            {statObj.iqr?.toFixed(3) || "0.00"}
                          </span>
                        </div>
                        <div className="bg-white/5 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                          <span className="text-slate-500 block">Neighbor Dev Rate:</span>
                          <span className="text-slate-200 font-bold text-[11px]">
                            {activeFinding.statistics.neighbor_event_rate_deviation_percent?.toFixed(1) || "0.0"}%
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Root Causes and Recommendations */}
                <div className="space-y-2.5 pt-1">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-md">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-300 block">
                      Auto-Diagnosed Hardware Fault Triggers
                    </span>
                    <p className="text-xs text-slate-200 font-sans mt-1.5 leading-relaxed font-medium">
                      {activeFinding.suggested_cause}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1.5">
                      Actionable Engineering Recommendations
                    </span>
                    <ul className="space-y-1.5">
                      {activeFinding.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-xs text-slate-300 font-sans leading-relaxed">
                          <span className="h-4 w-4 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-[10px] font-mono font-bold mt-0.5 shrink-0">
                            {idx + 1}
                          </span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

              </div>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-slate-500 font-mono text-xs italic p-12">
                Select a detector calibration channel from the summaries above to initiate analytical ledger.
              </div>
            )}
          </div>

        </div>

      </main>

      {/* FOOTER */}
      <footer className="no-print border-t border-white/10 bg-white/5 backdrop-blur-md py-4 px-6 text-center font-mono text-[10px] text-slate-400 z-10 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
          <span>
            © 2026 Ooty Cosmic Ray Laboratory. Cosmic Ray Laboratory Analyzer Suite.
          </span>
          <div className="flex items-center gap-3">
            <span>Server Proxy: Node.js/CJS</span>
            <span>Client Engine: React 19/Vite</span>
          </div>
        </div>
      </footer>

      {/* CONFIGURATION & THRESHOLDS TUNING DIALOG */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#0b0c16]/90 border border-white/10 backdrop-blur-2xl rounded-2xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(99,102,241,0.15)] relative animate-fade-in">
            <h3 className="font-display font-bold text-base text-slate-100 uppercase border-b border-white/10 pb-3 mb-4 flex items-center gap-2">
              <Sliders className="h-5 w-5 text-indigo-400" />
              Interactive Statistical Threshold Tuning
            </h3>
            
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Directly manipulate the mathematical thresholds of the Anomaly Engine rules. Adjusting these values will recalculate detector health scores and trigger conditions live.
            </p>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {/* Event Rate drop */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Event Rate Drop Alert Threshold</span>
                  <span className="text-indigo-400 font-bold">{currentConfig.event_rate_drop_percent}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="95"
                  step="5"
                  value={currentConfig.event_rate_drop_percent}
                  onChange={(e) => setCurrentConfig({...currentConfig, event_rate_drop_percent: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 bg-black/50 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Event Rate spike */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Noisy Rate Spike Threshold</span>
                  <span className="text-indigo-400 font-bold">{currentConfig.event_rate_spike_percent}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="200"
                  step="10"
                  value={currentConfig.event_rate_spike_percent}
                  onChange={(e) => setCurrentConfig({...currentConfig, event_rate_spike_percent: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 bg-black/50 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* ADC drift */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">ADC Shift Failure Threshold</span>
                  <span className="text-indigo-400 font-bold">{currentConfig.adc_drift_percent}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={currentConfig.adc_drift_percent}
                  onChange={(e) => setCurrentConfig({...currentConfig, adc_drift_percent: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 bg-black/50 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Pedestal shift */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Pedestal Shift Trigger (Sigma)</span>
                  <span className="text-indigo-400 font-bold">{currentConfig.pedestal_mean_shift_sigma} σ</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="6"
                  step="0.5"
                  value={currentConfig.pedestal_mean_shift_sigma}
                  onChange={(e) => setCurrentConfig({...currentConfig, pedestal_mean_shift_sigma: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 bg-black/50 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Pedestal RMS increase */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Pedestal RMS Noise Alert (Sigma)</span>
                  <span className="text-indigo-400 font-bold">{currentConfig.pedestal_rms_increase_sigma} σ</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="6"
                  step="0.5"
                  value={currentConfig.pedestal_rms_increase_sigma}
                  onChange={(e) => setCurrentConfig({...currentConfig, pedestal_rms_increase_sigma: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 bg-black/50 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Gain drift */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Gain Decay Failure Threshold</span>
                  <span className="text-indigo-400 font-bold">{currentConfig.gain_drift_percent}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={currentConfig.gain_drift_percent}
                  onChange={(e) => setCurrentConfig({...currentConfig, gain_drift_percent: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 bg-black/50 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Neighbor Dev */}
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Neighbor Array Deviation Alert</span>
                  <span className="text-indigo-400 font-bold">{currentConfig.neighbor_deviation_percent}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="5"
                  value={currentConfig.neighbor_deviation_percent}
                  onChange={(e) => setCurrentConfig({...currentConfig, neighbor_deviation_percent: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500 bg-black/50 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 mt-5 flex justify-end gap-3">
              <button
                onClick={handleResetThresholds}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-xs font-medium transition"
              >
                Reset Default
              </button>
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition"
              >
                Apply Parameters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY SCIENTIFIC REPORT VIEW */}
      <div className="hidden print-only block p-8 bg-white text-black font-sans w-full">
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight uppercase">
                OOTY COSMIC RAY OBSERVATORY
              </h1>
              <p className="text-sm font-mono mt-1 text-gray-600">
                Detector Scintillator Health & Statistical Anomaly Report
              </p>
            </div>
            <div className="text-right font-mono text-xs text-gray-500">
              <p>Report Date: {new Date().toLocaleDateString()}</p>
              <p>Run Identifier: {selectedRunKey === "custom" ? customFileName : selectedRunKey.toUpperCase()}</p>
              <p>Calibrated Channels: {records.length}</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-bold uppercase mb-2 border-b border-gray-300 pb-1">1. Active Statistical Rule Configuration</h2>
          <div className="grid grid-cols-4 gap-4 text-xs font-mono">
            <div><strong>ER Drop Threshold:</strong> {currentConfig.event_rate_drop_percent}%</div>
            <div><strong>ER Spike Threshold:</strong> {currentConfig.event_rate_spike_percent}%</div>
            <div><strong>ADC Drift Trigger:</strong> {currentConfig.adc_drift_percent}%</div>
            <div><strong>Gain Decay Trigger:</strong> {currentConfig.gain_drift_percent}%</div>
            <div><strong>Pedestal Mean (Sigma):</strong> {currentConfig.pedestal_mean_shift_sigma}σ</div>
            <div><strong>Pedestal RMS (Sigma):</strong> {currentConfig.pedestal_rms_increase_sigma}σ</div>
            <div><strong>Neighbor Mismatch Dev:</strong> {currentConfig.neighbor_deviation_percent}%</div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold uppercase mb-3 border-b border-gray-300 pb-1">2. Calibrated Channel Diagnostics & Finding Matrix</h2>
          <table className="w-full text-left border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300 font-bold uppercase">
                <th className="py-2.5 px-3 border border-gray-300">Channel ID</th>
                <th className="py-2.5 px-3 border border-gray-300 text-center">Health Index</th>
                <th className="py-2.5 px-3 border border-gray-300">Severity</th>
                <th className="py-2.5 px-3 border border-gray-300">Primary Rule Flagged</th>
                <th className="py-2.5 px-3 border border-gray-300">Suggested Failure Cause</th>
                <th className="py-2.5 px-3 border border-gray-300 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.detector_id} className="border-b border-gray-300">
                  <td className="py-2 px-3 border border-gray-300 font-mono font-bold">DET-{f.detector_id}</td>
                  <td className="py-2 px-3 border border-gray-300 text-center font-mono font-bold">{f.health_score}%</td>
                  <td className="py-2 px-3 border border-gray-300 uppercase font-mono">{f.severity}</td>
                  <td className="py-2 px-3 border border-gray-300 font-medium">{f.reason}</td>
                  <td className="py-2 px-3 border border-gray-300 text-gray-700">{f.suggested_cause}</td>
                  <td className="py-2 px-3 border border-gray-300 text-right font-mono">{f.confidence}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 page-break-inside-avoid">
          <h2 className="text-lg font-bold uppercase mb-2 border-b border-gray-300 pb-1">3. Calibrated Actions & Recommendations</h2>
          <div className="space-y-4">
            {findings.map((f) => {
              if (f.severity === SeverityLevel.HEALTHY) return null;
              return (
                <div key={f.detector_id} className="border border-gray-300 p-3 rounded">
                  <h4 className="font-bold text-xs font-mono uppercase text-gray-800">
                    Channel DET-{f.detector_id} — Findings: "{f.reason}" ({f.severity})
                  </h4>
                  <ul className="list-decimal list-inside text-xs mt-1.5 text-gray-700 space-y-1">
                    {f.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 text-center text-xs font-mono text-gray-500 border-t border-gray-300 pt-4">
          Report compiled automatically. Ooty Observatory Data Engineering Team.
        </div>
      </div>

    </div>
  );
}
