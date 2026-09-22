"use client";

import React, { useState, useEffect } from "react";
import { 
  Upload, 
  FileText, 
  Settings, 
  Play, 
  Download, 
  History, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Layers, 
  Database, 
  ArrowRight,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles
} from "lucide-react";

// Types mapping backend response schemas
interface ShapeInfo {
  index: number;
  type: string;
  text?: string | null;
  name: string;
}

interface SlideInfo {
  index: number;
  title?: string | null;
  layout_name: string;
  placeholders: ShapeInfo[];
  other_shapes: ShapeInfo[];
}

interface PPTParseResponse {
  saved_filename: string;
  slides: SlideInfo[];
}

interface ColumnInfo {
  name: string;
  type: string;
  sample_values: any[];
  stats: {
    missing_count: number;
    missing_pct: number;
    min?: any;
    max?: any;
    mean?: any;
    sum?: any;
    unique_count?: number;
    top_values?: { value: string; count: number; pct: number }[];
  };
}

interface ExcelParseResponse {
  saved_filename: string;
  columns: ColumnInfo[];
  row_count: number;
}

interface Job {
  id: string;
  status: string;
  template_name: string;
  spreadsheet_name: string;
  result_path?: string | null;
  error_message?: string | null;
  mapping_config?: Record<string, string[]>;
  insights_data?: { slides: any[] };
  created_at: string;
  updated_at: string;
}

interface DownloadHistory {
  id: number;
  job_id: string;
  filename: string;
  downloaded_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Dashboard() {
  // Navigation
  const [activeTab, setActiveTab] = useState<"build" | "history">("build");
  const [wizardStep, setWizardStep] = useState<"upload" | "map" | "progress" | "success">("upload");

  // File states
  const [pptFile, setPptFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [uploadingPpt, setUploadingPpt] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [pptData, setPptData] = useState<PPTParseResponse | null>(null);
  const [excelData, setExcelData] = useState<ExcelParseResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Mapping states
  const [columnMappings, setColumnMappings] = useState<Record<string, string[]>>({});
  
  // Job execution states
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobInterval, setJobInterval] = useState<NodeJS.Timeout | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [progressPhase, setProgressPhase] = useState<"planning" | "compiling">("planning");
  const [slidesConfig, setSlidesConfig] = useState<any[]>([]);

  // History states
  const [historyList, setHistoryList] = useState<DownloadHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      if (jobInterval) clearInterval(jobInterval);
    };
  }, [jobInterval]);

  // Fetch download history
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/api/generate/downloads`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab]);

  // Handle PPT Upload
  const handlePptUpload = async (file: File) => {
    setPptFile(file);
    setUploadingPpt(true);
    setUploadError(null);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/upload/ppt`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to parse PowerPoint template.");
      }

      const data = await res.json();
      setPptData(data);
      
      // Auto-initialize mappings
      const initialMap: Record<string, string[]> = {};
      data.slides.forEach((slide: SlideInfo) => {
        initialMap[slide.index.toString()] = [];
      });
      setColumnMappings(prev => ({ ...prev, ...initialMap }));

    } catch (err: any) {
      setUploadError(err.message);
      setPptFile(null);
    } finally {
      setUploadingPpt(false);
    }
  };

  // Handle Excel Upload
  const handleExcelUpload = async (file: File) => {
    setExcelFile(file);
    setUploadingExcel(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/upload/excel`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to parse Excel spreadsheet.");
      }

      const data = await res.json();
      setExcelData(data);
    } catch (err: any) {
      setUploadError(err.message);
      setExcelFile(null);
    } finally {
      setUploadingExcel(false);
    }
  };

  // Toggle mapping checkbox
  const handleToggleMap = (slideIdx: number, colName: string) => {
    const key = slideIdx.toString();
    setColumnMappings(prev => {
      const current = prev[key] || [];
      const updated = current.includes(colName) 
        ? current.filter(c => c !== colName) 
        : [...current, colName];
      return { ...prev, [key]: updated };
    });
  };

  // Auto AI Column Mapping (Local Heuristics for Mapping review before submit)
  const applyAIMappings = () => {
    if (!pptData || !excelData) return;
    
    const columns = excelData.columns.map(c => c.name);
    const newMappings: Record<string, string[]> = {};

    pptData.slides.forEach((slide) => {
      const titleLower = (slide.title || "").toLowerCase();
      const layoutLower = (slide.layout_name || "").toLowerCase();
      const mapped: string[] = [];

      if (titleLower.includes("revenue") || titleLower.includes("sales") || titleLower.includes("financial") || layoutLower.includes("revenue")) {
        columns.forEach(col => {
          const cl = col.toLowerCase();
          if (cl.includes("rev") || cl.includes("sale") || cl.includes("profit") || cl.includes("value")) mapped.push(col);
        });
      } else if (titleLower.includes("region") || titleLower.includes("geo") || titleLower.includes("country")) {
        columns.forEach(col => {
          const cl = col.toLowerCase();
          if (cl.includes("region") || cl.includes("state") || cl.includes("country") || cl.includes("city")) mapped.push(col);
        });
      } else if (titleLower.includes("trend") || titleLower.includes("growth") || titleLower.includes("timeline") || titleLower.includes("history")) {
        columns.forEach(col => {
          const cl = col.toLowerCase();
          if (cl.includes("date") || cl.includes("year") || cl.includes("month") || cl.includes("quarter")) mapped.push(col);
        });
      } else if (titleLower.includes("kpi") || titleLower.includes("dashboard") || titleLower.includes("summary") || titleLower.includes("executive")) {
        columns.forEach(col => {
          const cl = col.toLowerCase();
          if (cl.includes("profit") || cl.includes("margin") || cl.includes("income") || cl.includes("cost") || cl.includes("expense") || cl.includes("total")) mapped.push(col);
        });
      }

      // Default fallback
      if (mapped.length === 0 && columns.length > 0) {
        mapped.push(columns[0]);
      }

      newMappings[slide.index.toString()] = mapped;
    });

    setColumnMappings(newMappings);
  };

  // Trigger generator execution (AI planning phase)
  const startGeneration = async () => {
    if (!pptData || !excelData) return;

    setGenError(null);
    setProgressPhase("planning");
    setWizardStep("progress");

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: pptData.saved_filename,
          spreadsheet_name: excelData.saved_filename,
          mapping_config: columnMappings
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to start AI analysis.");
      }

      const job: Job = await res.json();
      setCurrentJobId(job.id);
      setCurrentJob(job);

      // Poll status every 2.5 seconds
      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE}/api/generate/job/${job.id}`);
          if (pollRes.ok) {
            const updatedJob: Job = await pollRes.json();
            setCurrentJob(updatedJob);
            
            if (updatedJob.status === "PLAN_GENERATED") {
              clearInterval(interval);
              setSlidesConfig(updatedJob.insights_data?.slides || []);
              setWizardStep("map");
            } else if (updatedJob.status === "FAILED") {
              clearInterval(interval);
              setGenError(updatedJob.error_message || "AI Analysis failed unexpectedly.");
            }
          }
        } catch (pollErr) {
          console.error("Error polling job status:", pollErr);
        }
      }, 2500);

      setJobInterval(interval);

    } catch (err: any) {
      setGenError(err.message);
      setWizardStep("upload");
    }
  };

  // Compile final PowerPoint after user edits configurations
  const compilePresentation = async () => {
    if (!currentJobId) return;

    setGenError(null);
    setProgressPhase("compiling");
    setWizardStep("progress");

    try {
      const res = await fetch(`${API_BASE}/api/generate/job/${currentJobId}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides_config: slidesConfig
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to start presentation compiler.");
      }

      const job: Job = await res.json();
      setCurrentJob(job);

      // Poll status every 2.5 seconds
      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE}/api/generate/job/${job.id}`);
          if (pollRes.ok) {
            const updatedJob: Job = await pollRes.json();
            setCurrentJob(updatedJob);
            
            if (updatedJob.status === "COMPLETED") {
              clearInterval(interval);
              setWizardStep("success");
            } else if (updatedJob.status === "FAILED") {
              clearInterval(interval);
              setGenError(updatedJob.error_message || "Vector compilation failed unexpectedly.");
              setWizardStep("map");
            }
          }
        } catch (pollErr) {
          console.error("Error polling job status:", pollErr);
        }
      }, 2500);

      setJobInterval(interval);

    } catch (err: any) {
      setGenError(err.message);
      setWizardStep("map");
    }
  };

  const handleUpdateSlideTitle = (idx: number, title: string) => {
    setSlidesConfig(prev => prev.map(s => s.slide_index === idx ? { ...s, insights: { ...s.insights, title } } : s));
  };

  const handleUpdateSlideNarrative = (idx: number, narrative: string) => {
    setSlidesConfig(prev => prev.map(s => s.slide_index === idx ? { ...s, insights: { ...s.insights, narrative } } : s));
  };

  const handleUpdateSlideBullet = (slideIdx: number, bulletIdx: number, val: string) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        const bullets = [...(s.insights?.bullets || [])];
        bullets[bulletIdx] = val;
        return { ...s, insights: { ...s.insights, bullets } };
      }
      return s;
    }));
  };

  const handleAddSlideBullet = (slideIdx: number) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        const bullets = [...(s.insights?.bullets || []), ""];
        return { ...s, insights: { ...s.insights, bullets } };
      }
      return s;
    }));
  };

  const handleRemoveSlideBullet = (slideIdx: number, bulletIdx: number) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        const bullets = (s.insights?.bullets || []).filter((_: any, i: number) => i !== bulletIdx);
        return { ...s, insights: { ...s.insights, bullets } };
      }
      return s;
    }));
  };

  const handleUpdateSlideRec = (slideIdx: number, recIdx: number, val: string) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        const recs = [...(s.insights?.recommendations || [])];
        recs[recIdx] = val;
        return { ...s, insights: { ...s.insights, recommendations: recs } };
      }
      return s;
    }));
  };

  const handleAddSlideRec = (slideIdx: number) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        const recs = [...(s.insights?.recommendations || []), ""];
        return { ...s, insights: { ...s.insights, recommendations: recs } };
      }
      return s;
    }));
  };

  const handleRemoveSlideRec = (slideIdx: number, recIdx: number) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        const recs = (s.insights?.recommendations || []).filter((_: any, i: number) => i !== recIdx);
        return { ...s, insights: { ...s.insights, recommendations: recs } };
      }
      return s;
    }));
  };

  const handleUpdateSlideChart = (slideIdx: number, field: string, val: any) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        const chart = s.chart ? { ...s.chart } : { type: "column", x_axis: "", y_axis: "", aggregation: "sum" };
        if (val === null) {
          return { ...s, chart: null };
        }
        chart[field] = val;
        return { ...s, chart };
      }
      return s;
    }));
  };

  const handleToggleSlideChart = (slideIdx: number) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        if (s.chart) {
          return { ...s, chart: null };
        } else {
          // Set default chart configuration using first two columns
          const firstCol = excelData?.columns[0]?.name || "";
          const secondCol = excelData?.columns[1]?.name || "";
          return {
            ...s,
            chart: {
              type: "column",
              x_axis: firstCol,
              y_axis: secondCol,
              aggregation: "sum"
            }
          };
        }
      }
      return s;
    }));
  };

  const handleToggleSlideLock = (slideIdx: number) => {
    setSlidesConfig(prev => prev.map(s => {
      if (s.slide_index === slideIdx) {
        return { ...s, skip: !s.skip };
      }
      return s;
    }));
  };

  // Start fresh wizard
  const resetWizard = () => {
    setPptFile(null);
    setExcelFile(null);
    setPptData(null);
    setExcelData(null);
    setColumnMappings({});
    setCurrentJobId(null);
    setCurrentJob(null);
    setGenError(null);
    setUploadError(null);
    if (jobInterval) clearInterval(jobInterval);
    setWizardStep("upload");
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center">
              <Layers className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl tracking-tight text-white flex items-center gap-2">
                AI Presentation Builder <span className="text-[10px] bg-slate-800 text-indigo-400 py-0.5 px-2 rounded-full border border-slate-700">PRO</span>
              </h1>
              <p className="text-xs text-slate-400">Transform Spreadsheets into Native Executive Decks</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-2 bg-slate-850 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("build")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "build" 
                  ? "bg-slate-800 text-indigo-400 border border-slate-700 shadow-inner" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Build Slide Deck
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "history" 
                  ? "bg-slate-800 text-indigo-400 border border-slate-700 shadow-inner" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <History className="h-4 w-4" />
              Download History
            </button>
          </nav>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {activeTab === "build" ? (
          <div className="space-y-8">
            {/* Steps Wizard Progress Bar */}
            <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              {[
                { step: "upload", label: "Upload Templates", desc: "PPTX and Excel Data" },
                { step: "map", label: "AI Suggested Plan", desc: "Storyline & Customizer" },
                { step: "progress", label: "Processing", desc: "AI pipeline tasks" },
                { step: "success", label: "Export Deck", desc: "Download final slide deck" }
              ].map((s, idx) => {
                const isCompleted = 
                  (wizardStep === "map" && s.step === "upload") ||
                  (wizardStep === "progress" && (
                    (progressPhase === "planning" && s.step === "upload") ||
                    (progressPhase === "compiling" && ["upload", "map"].includes(s.step))
                  )) ||
                  (wizardStep === "success" && ["upload", "map", "progress"].includes(s.step));
                const isActive = wizardStep === s.step;

                return (
                  <React.Fragment key={s.step}>
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm border transition-all ${
                        isActive 
                          ? "bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30 scale-105" 
                          : isCompleted 
                            ? "bg-emerald-950 border-emerald-500 text-emerald-400" 
                            : "bg-slate-900 border-slate-800 text-slate-500"
                      }`}>
                        {isCompleted ? <CheckCircle className="h-5 w-5" /> : idx + 1}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${isActive ? "text-indigo-400" : isCompleted ? "text-emerald-400" : "text-slate-400"}`}>{s.label}</p>
                        <p className="text-[10px] text-slate-500">{s.desc}</p>
                      </div>
                    </div>
                    {idx < 3 && <ChevronRight className="h-5 w-5 text-slate-700 hidden md:block" />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* STEP 1: UPLOAD */}
            {wizardStep === "upload" && (
              <div className="grid md:grid-cols-2 gap-8">
                {/* PPTX Drag Zone */}
                <div className="bg-slate-900/60 p-8 rounded-3xl border-2 border-dashed border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between min-h-[380px] shadow-lg">
                  <div>
                    <div className="bg-indigo-950/50 border border-indigo-500/30 h-14 w-14 rounded-2xl flex items-center justify-center mb-6">
                      <FileText className="h-8 w-8 text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">1. PowerPoint Template</h3>
                    <p className="text-sm text-slate-400 mb-6">Upload the master design template. The system parses all layouts, fonts, titles, and placeholders without modification.</p>
                  </div>

                  <div>
                    {pptFile ? (
                      <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-2xl flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{pptFile.name}</span>
                        </div>
                        <button onClick={() => { setPptFile(null); setPptData(null); }} className="text-xs text-red-400 hover:underline">Remove</button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center bg-slate-950/50 border border-slate-850 hover:bg-slate-900/30 p-8 rounded-2xl cursor-pointer transition-all">
                        {uploadingPpt ? (
                          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                        ) : (
                          <Upload className="h-8 w-8 text-slate-500 mb-2" />
                        )}
                        <span className="text-sm font-semibold">{uploadingPpt ? "Reading layouts & placeholders..." : "Upload PPTX template"}</span>
                        <span className="text-xs text-slate-500 mt-1">PowerPoint presentations only</span>
                        <input
                          type="file"
                          accept=".pptx"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handlePptUpload(e.target.files[0])}
                          disabled={uploadingPpt}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Excel Drag Zone */}
                <div className="bg-slate-900/60 p-8 rounded-3xl border-2 border-dashed border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between min-h-[380px] shadow-lg">
                  <div>
                    <div className="bg-indigo-950/50 border border-indigo-500/30 h-14 w-14 rounded-2xl flex items-center justify-center mb-6">
                      <Database className="h-8 w-8 text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">2. Spreadsheet Dataset</h3>
                    <p className="text-sm text-slate-400 mb-6">Upload the raw Excel (.xlsx) or CSV data sheet. Column headers and datatypes are parsed for strategic AI matching.</p>
                  </div>

                  <div>
                    {excelFile ? (
                      <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-2xl flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{excelFile.name}</span>
                        </div>
                        <button onClick={() => { setExcelFile(null); setExcelData(null); }} className="text-xs text-red-400 hover:underline">Remove</button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center bg-slate-950/50 border border-slate-850 hover:bg-slate-900/30 p-8 rounded-2xl cursor-pointer transition-all">
                        {uploadingExcel ? (
                          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                        ) : (
                          <Upload className="h-8 w-8 text-slate-500 mb-2" />
                        )}
                        <span className="text-sm font-semibold">{uploadingExcel ? "Analyzing columns & statistics..." : "Upload Spreadsheet"}</span>
                        <span className="text-xs text-slate-500 mt-1">Excel (.xlsx) or CSV files</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])}
                          disabled={uploadingExcel}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1 PREVIEWS */}
            {wizardStep === "upload" && (pptData || excelData) && (
              <div className="grid md:grid-cols-2 gap-8">
                {/* PPT Preview Summary */}
                {pptData ? (
                  <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-850">
                    <h4 className="text-md font-bold mb-4 flex items-center gap-2 text-indigo-400">
                      <FileText className="h-4 w-4" /> Parsed Template (Index: {pptData.slides.length} slides)
                    </h4>
                    <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                      {pptData.slides.map((s) => (
                        <div key={s.index} className="p-3 bg-slate-950/50 rounded-xl border border-slate-850 flex items-center justify-between text-sm">
                          <div>
                            <p className="font-semibold text-slate-200">Slide {s.index}: {s.title || "No Title Shape Found"}</p>
                            <p className="text-xs text-slate-500">Layout: {s.layout_name}</p>
                          </div>
                          <span className="text-xs bg-slate-900 border border-slate-800 py-1 px-2 rounded-lg text-slate-400">
                            {s.placeholders.length} placeholders
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/10 border border-slate-900 border-dashed rounded-2xl flex items-center justify-center p-12 text-slate-650 text-sm">
                    No PowerPoint template loaded yet.
                  </div>
                )}

                {/* Excel Preview Summary */}
                {excelData ? (
                  <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-850">
                    <h4 className="text-md font-bold mb-4 flex items-center gap-2 text-indigo-400">
                      <Database className="h-4 w-4" /> Parsed Dataset ({excelData.row_count} records)
                    </h4>
                    <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                      {excelData.columns.map((c) => (
                        <div key={c.name} className="p-3 bg-slate-950/50 rounded-xl border border-slate-850 text-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-slate-200">{c.name}</span>
                            <span className="text-xs text-indigo-400 font-mono capitalize">{c.type}</span>
                          </div>
                          {c.type === "string" ? (
                            <p className="text-xs text-slate-500 truncate">
                              Sample: {c.sample_values.filter(v => v !== null).slice(0, 3).join(", ")}
                            </p>
                          ) : (
                            <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-500 bg-slate-900/30 p-1.5 rounded-lg border border-slate-850/50 mt-1">
                              <span>Min: {c.stats.min ?? "N/A"}</span>
                              <span>Max: {c.stats.max ?? "N/A"}</span>
                              <span>Mean: {c.stats.mean ? parseFloat(c.stats.mean).toFixed(1) : "N/A"}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/10 border border-slate-900 border-dashed rounded-2xl flex items-center justify-center p-12 text-slate-650 text-sm">
                    No spreadsheet loaded yet.
                  </div>
                )}
              </div>
            )}

            {/* STEP 1 ACTION ACTIONS */}
            {wizardStep === "upload" && (
              <div className="flex justify-end">
                <button
                  onClick={startGeneration}
                  disabled={!pptData || !excelData}
                  className={`flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold shadow-lg transition-all ${
                    pptData && excelData 
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 cursor-pointer" 
                      : "bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed"
                  }`}
                >
                  Analyze & Suggest Storyline
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* UPLOAD ERROR DISPLAY */}
            {uploadError && (
              <div className="bg-red-950/40 border border-red-500/40 text-red-200 p-4 rounded-xl flex items-start gap-3 shadow-lg shadow-red-900/10">
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Upload/Parsing Error</p>
                  <p className="text-xs text-red-300 mt-0.5">{uploadError}</p>
                </div>
              </div>
            )}

            {/* STEP 2: STORYLINE PLANNING & CUSTOMIZER */}
            {wizardStep === "map" && pptData && excelData && (
              <div className="space-y-6 animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-850">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-indigo-400" /> AI Suggested Plan & Storyline Customizer
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Customize slide narrative, fine-tune the consultants' data insights, and select custom spreadsheet chart mappings.</p>
                  </div>
                </div>

                {/* Storyline Narrative Flow Bar */}
                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-extrabold tracking-wide text-slate-400 uppercase flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-indigo-400" /> Deck Narrative Arc (Storyline Flow)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 justify-between items-stretch">
                    {slidesConfig.map((slide) => (
                      <div key={slide.slide_index} className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 flex flex-col justify-between hover:border-indigo-500/20 transition-all">
                        <div>
                          <span className="text-[9px] bg-indigo-950 border border-indigo-500/30 text-indigo-400 font-bold px-2 py-0.5 rounded">
                            Slide {slide.slide_index}
                          </span>
                          <h5 className="font-bold text-slate-200 text-sm mt-2">{slide.insights?.title || slide.slide_title}</h5>
                          <p className="text-[11px] text-slate-500 mt-1 italic leading-relaxed">
                            {slide.insights?.narrative || "Storyline transition point."}
                          </p>
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-900 flex justify-between text-[10px] text-slate-400">
                          <span className="capitalize">{slide.intent?.replace("_", " ")}</span>
                          {slide.chart ? (
                            <span className="text-indigo-400 font-bold uppercase">{slide.chart.type}</span>
                          ) : (
                            <span className="text-slate-600 italic">No Chart</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Editable Slides List */}
                <div className="space-y-6">
                  {slidesConfig.map((slide) => {
                    const isChartEnabled = !!slide.chart;
                    return (
                      <div key={slide.slide_index} className={`bg-slate-900/60 p-6 rounded-2xl border space-y-6 shadow-md hover:border-slate-700 transition-all ${slide.skip ? "border-indigo-500/30" : "border-slate-800"}`}>
                        {/* Slide Card Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs bg-indigo-950 border border-indigo-500/40 text-indigo-400 font-bold py-1.5 px-3 rounded-lg">
                              Slide {slide.slide_index}
                            </span>
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={slide.insights?.title || slide.slide_title || ""}
                                onChange={(e) => handleUpdateSlideTitle(slide.slide_index, e.target.value)}
                                disabled={!!slide.skip}
                                className="bg-slate-950 border border-slate-850 hover:border-slate-750 focus:border-indigo-500 focus:ring-0 text-md font-bold text-white rounded-lg px-3 py-1.5 w-full sm:w-[350px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                placeholder="Slide Title"
                              />
                              <p className="text-[10px] text-slate-550 mt-1 px-3">Layout Template: {slide.layout_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-950 border border-slate-850 hover:border-slate-750 px-3.5 py-2 rounded-xl transition-all text-xs font-semibold text-slate-400 hover:text-slate-200">
                              <input
                                type="checkbox"
                                checked={!!slide.skip}
                                onChange={() => handleToggleSlideLock(slide.slide_index)}
                                className="rounded border-slate-800 text-indigo-600 focus:ring-0 h-4 w-4"
                              />
                              <span>🔒 Keep Slide Unchanged</span>
                            </label>
                            <span className="text-[10px] uppercase font-bold bg-slate-950 text-slate-550 border border-slate-850 py-2 px-2.5 rounded-xl">
                              Intent: {slide.intent}
                            </span>
                          </div>
                        </div>
                        {/* Slide Inputs Grid */}
                        <div className="grid lg:grid-cols-3 gap-6 items-stretch">
                          {slide.skip && (
                            <div className="col-span-full bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-xl flex items-center gap-3 text-xs text-indigo-300">
                              <AlertCircle className="h-5 w-5 text-indigo-400 flex-shrink-0 animate-pulse" />
                              <span>This slide is locked. The compilation pipeline will preserve this slide exactly as it is in the uploaded template presentation, bypassing all AI updates.</span>
                            </div>
                          )}

                          {/* Slide Story Narrative */}
                          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-2 flex flex-col">
                            <label className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Storyline Role & Narrative
                            </label>
                            <textarea
                              value={slide.insights?.narrative || ""}
                              onChange={(e) => handleUpdateSlideNarrative(slide.slide_index, e.target.value)}
                              disabled={!!slide.skip}
                              rows={4}
                              className="w-full flex-1 bg-slate-950/80 border border-slate-850 hover:border-slate-750 focus:border-indigo-500 focus:ring-0 text-xs rounded-xl p-3 text-slate-350 leading-relaxed resize-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              placeholder="Slide Transition narrative explaining role in storyline..."
                            />
                          </div>

                          {/* Chart Customizer */}
                          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-3 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5" /> Slide Vector Chart
                                </label>
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isChartEnabled}
                                    onChange={() => handleToggleSlideChart(slide.slide_index)}
                                    disabled={!!slide.skip}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-650 peer-checked:after:bg-white border border-slate-700 peer-disabled:opacity-50"></div>
                                </label>
                              </div>

                              {isChartEnabled && slide.chart ? (
                                <div className="space-y-3 mt-2 animate-fade-in text-xs">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] text-slate-500 block mb-1">Chart Type</label>
                                      <select
                                        value={slide.chart.type || "column"}
                                        onChange={(e) => handleUpdateSlideChart(slide.slide_index, "type", e.target.value)}
                                        disabled={!!slide.skip}
                                        className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:ring-0 rounded-lg p-2 text-slate-300 transition-all font-semibold disabled:opacity-50"
                                      >
                                        <option value="column">Column Chart</option>
                                        <option value="bar">Bar Chart</option>
                                        <option value="line">Line Chart</option>
                                        <option value="pie">Pie Chart</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-500 block mb-1">Aggregation</label>
                                      <select
                                        value={slide.chart.aggregation || "sum"}
                                        onChange={(e) => handleUpdateSlideChart(slide.slide_index, "aggregation", e.target.value)}
                                        disabled={!!slide.skip}
                                        className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:ring-0 rounded-lg p-2 text-slate-300 transition-all font-semibold disabled:opacity-50"
                                      >
                                        <option value="sum">Sum</option>
                                        <option value="mean">Mean</option>
                                        <option value="count">Record Count</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">X-Axis (Category/Time Column)</label>
                                    <select
                                      value={slide.chart.x_axis || ""}
                                      onChange={(e) => handleUpdateSlideChart(slide.slide_index, "x_axis", e.target.value)}
                                      disabled={!!slide.skip}
                                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:ring-0 rounded-lg p-2 text-slate-300 transition-all disabled:opacity-50"
                                    >
                                      <option value="">-- Choose Column --</option>
                                      {excelData.columns.map(col => (
                                        <option key={col.name} value={col.name}>{col.name} ({col.type})</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Y-Axis (Metrics Column)</label>
                                    <select
                                      value={slide.chart.y_axis || ""}
                                      onChange={(e) => handleUpdateSlideChart(slide.slide_index, "y_axis", e.target.value)}
                                      disabled={!!slide.skip}
                                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:ring-0 rounded-lg p-2 text-slate-300 transition-all disabled:opacity-50"
                                    >
                                      <option value="">-- Choose Column --</option>
                                      {excelData.columns.map(col => (
                                        <option key={col.name} value={col.name}>{col.name} ({col.type})</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              ) : (
                                <div className="h-[140px] flex items-center justify-center border border-dashed border-slate-850 bg-slate-900/10 rounded-xl text-xs text-slate-600 italic">
                                  No vector chart drawn on this slide.
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Insights & Bullet Points */}
                          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-4 flex flex-col justify-between">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5" /> Bullet Point Insights
                                </label>
                                <button
                                  onClick={() => handleAddSlideBullet(slide.slide_index)}
                                  disabled={!!slide.skip}
                                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  + Add Bullet
                                </button>
                              </div>
                              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                {(slide.insights?.bullets || []).map((bullet: string, bIdx: number) => (
                                  <div key={bIdx} className="flex gap-2 items-start">
                                    <span className="text-slate-600 text-xs mt-2">•</span>
                                    <input
                                      type="text"
                                      value={bullet}
                                      onChange={(e) => handleUpdateSlideBullet(slide.slide_index, bIdx, e.target.value)}
                                      disabled={!!slide.skip}
                                      className="flex-1 bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:ring-0 text-xs rounded-lg p-2 text-slate-350 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <button
                                      onClick={() => handleRemoveSlideBullet(slide.slide_index, bIdx)}
                                      disabled={!!slide.skip}
                                      className="text-xs text-slate-500 hover:text-red-400 mt-2 disabled:opacity-50"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                                {(slide.insights?.bullets || []).length === 0 && (
                                  <p className="text-[11px] text-slate-600 italic py-3 text-center">No bullet points. Click + Add Bullet to create one.</p>
                                )}
                              </div>
                            </div>

                            {/* Recommendations */}
                            <div className="space-y-3 pt-3 border-t border-slate-900/60">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5" /> Callouts / Recommendations
                                </label>
                                <button
                                  onClick={() => handleAddSlideRec(slide.slide_index)}
                                  disabled={!!slide.skip}
                                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  + Add Recommendation
                                </button>
                              </div>
                              <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                                {(slide.insights?.recommendations || []).map((rec: string, rIdx: number) => (
                                  <div key={rIdx} className="flex gap-2 items-start">
                                    <span className="text-slate-650 text-xs mt-2">→</span>
                                    <input
                                      type="text"
                                      value={rec}
                                      onChange={(e) => handleUpdateSlideRec(slide.slide_index, rIdx, e.target.value)}
                                      disabled={!!slide.skip}
                                      className="flex-1 bg-slate-950 border border-slate-850 focus:border-indigo-500 focus:ring-0 text-xs rounded-lg p-2 text-slate-350 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <button
                                      onClick={() => handleRemoveSlideRec(slide.slide_index, rIdx)}
                                      disabled={!!slide.skip}
                                      className="text-xs text-slate-500 hover:text-red-400 mt-2 disabled:opacity-50"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                                {(slide.insights?.recommendations || []).length === 0 && (
                                  <p className="text-[11px] text-slate-600 italic py-2 text-center">No strategic recommendations defined.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center pt-4">
                  <button 
                    onClick={resetWizard}
                    className="text-sm font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    ← Start Over
                  </button>

                  <button
                    onClick={compilePresentation}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
                  >
                    <Play className="h-4 w-4" />
                    Compile PowerPoint presentation
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: PIPELINE PROGRESS */}
            {wizardStep === "progress" && currentJob && (
              <div className="max-w-xl mx-auto space-y-8 py-8 animate-fade-in">
                <div className="bg-slate-900/60 p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center space-y-6">
                  {currentJob.status === "PENDING" || currentJob.status === "PROCESSING" ? (
                    <div className="relative flex items-center justify-center">
                      <div className="absolute h-20 w-20 border-4 border-t-indigo-600 border-r-slate-800 border-b-slate-800 border-l-slate-800 rounded-full animate-spin"></div>
                      <div className="h-14 w-14 rounded-full bg-slate-950 flex items-center justify-center border border-slate-850">
                        <Sparkles className="h-6 w-6 text-indigo-400 animate-pulse" />
                      </div>
                    </div>
                  ) : currentJob.status === "FAILED" ? (
                    <div className="h-16 w-16 rounded-full bg-red-950/60 border border-red-500/30 flex items-center justify-center text-red-500">
                      <AlertCircle className="h-8 w-8" />
                    </div>
                  ) : null}

                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {currentJob.status === "PENDING" ? "Queueing task..." : 
                       currentJob.status === "PROCESSING" ? "AI Pipeline Running..." : 
                       currentJob.status === "FAILED" ? "Pipeline Execution Failed" : "Presentation Ready!"}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5 font-mono">Job ID: {currentJob.id}</p>
                  </div>

                  {/* Progress milestones */}
                  <div className="w-full space-y-3 bg-slate-950/50 p-6 rounded-2xl border border-slate-850/80 text-left">
                    {(() => {
                      const steps = progressPhase === "planning" ? [
                        { label: "Parsing template design & dataset", status: currentJob.status === "PROCESSING" || currentJob.status === "PLAN_GENERATED" ? "completed" : "pending" },
                        { label: "Classifying slide taxonomies (AI)", status: currentJob.status === "PROCESSING" && currentJob.insights_data ? "completed" : currentJob.status === "PLAN_GENERATED" ? "completed" : "pending" },
                        { label: "Mapping data columns (AI)", status: currentJob.status === "PROCESSING" && currentJob.insights_data ? "completed" : currentJob.status === "PLAN_GENERATED" ? "completed" : "pending" },
                        { label: "Generating storyline & insights (AI)", status: currentJob.status === "PROCESSING" && currentJob.insights_data ? "completed" : currentJob.status === "PLAN_GENERATED" ? "completed" : "pending" },
                        { label: "Selecting suggested chart layouts (AI)", status: currentJob.status === "PLAN_GENERATED" ? "completed" : currentJob.status === "FAILED" ? "failed" : "running" }
                      ] : [
                        { label: "Reading slide configurations", status: currentJob.status === "PROCESSING" || currentJob.status === "COMPLETED" ? "completed" : "pending" },
                        { label: "Applying template fonts & colors", status: currentJob.status === "PROCESSING" || currentJob.status === "COMPLETED" ? "completed" : "pending" },
                        { label: "Writing text placeholders", status: currentJob.status === "PROCESSING" || currentJob.status === "COMPLETED" ? "completed" : "pending" },
                        { label: "Drawing native vector charts", status: currentJob.status === "PROCESSING" || currentJob.status === "COMPLETED" ? "completed" : "pending" },
                        { label: "Saving presentation & compiling deck", status: currentJob.status === "COMPLETED" ? "completed" : currentJob.status === "FAILED" ? "failed" : "running" }
                      ];

                      return steps.map((step, index) => {
                        const isCompleted = step.status === "completed";
                        const isFailed = currentJob.status === "FAILED" && step.status === "running";
                        const isRunning = currentJob.status === "PROCESSING" && !isCompleted && !isFailed;

                        return (
                          <div key={index} className="flex items-center justify-between text-xs">
                            <span className={`${isCompleted ? "text-slate-400" : isRunning ? "text-indigo-400 font-semibold" : isFailed ? "text-red-400" : "text-slate-650"}`}>
                              {step.label}
                            </span>
                            <span className={`font-mono text-[10px] py-0.5 px-2 rounded ${
                              isCompleted 
                                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/30" 
                                : isRunning 
                                  ? "bg-indigo-950 text-indigo-400 animate-pulse border border-indigo-800/30" 
                                  : isFailed
                                    ? "bg-red-950/40 text-red-400 border border-red-800/30"
                                    : "bg-slate-900 text-slate-500 border border-slate-800"
                            }`}>
                              {isCompleted ? "Done" : isRunning ? "Processing" : isFailed ? "Failed" : "Pending"}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {genError && (
                    <div className="bg-red-950/40 border border-red-500/40 text-red-200 p-4 rounded-xl text-left text-xs w-full">
                      <p className="font-bold mb-1">Execution Fail Detail:</p>
                      <p className="text-red-300 font-mono overflow-x-auto whitespace-pre-wrap">{genError}</p>
                      <button 
                        onClick={resetWizard}
                        className="mt-4 w-full bg-slate-900 border border-slate-800 text-slate-200 py-2 rounded-xl text-xs hover:bg-slate-850 font-bold transition-all"
                      >
                        Reset and Retry
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: SUCCESS DECK PREVIEW */}
            {wizardStep === "success" && currentJob && (
              <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
                <div className="bg-slate-900/60 p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center space-y-6">
                  <div className="h-16 w-16 rounded-full bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                    <CheckCircle className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">Presentation Compiled!</h3>
                    <p className="text-xs text-slate-400 mt-1">Presentation generated in McKinsey style and ready for immediate download.</p>
                  </div>

                  {/* Document Summary Card */}
                  <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl w-full text-left space-y-4 shadow-inner">
                    <div className="flex items-center gap-4 justify-between border-b border-slate-850 pb-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Output Presentation</span>
                        <p className="font-bold text-slate-200 truncate">{currentJob.template_name}</p>
                      </div>
                      <a 
                        href={`${API_BASE}/api/generate/download/${currentJob.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all shadow-md"
                      >
                        <Download className="h-4 w-4" />
                        Download File
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Dataset Source</span>
                        <span className="text-slate-350">{currentJob.spreadsheet_name}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Generated On</span>
                        <span className="text-slate-350">{new Date(currentJob.updated_at).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Preview outline list */}
                    {currentJob.insights_data && (
                      <div className="space-y-3 pt-3 border-t border-slate-850">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Executive Outline Preview:</span>
                        <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                          {currentJob.insights_data.slides.map((s: any) => (
                            <div key={s.slide_index} className="p-3 bg-slate-900/30 rounded-xl border border-slate-850 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-300">Slide {s.slide_index}: {s.insights?.title || s.slide_title}</span>
                                {s.chart && (
                                  <span className="text-[9px] bg-indigo-950/60 border border-indigo-800/30 text-indigo-400 py-0.5 px-1.5 rounded uppercase font-bold tracking-wider">
                                    {s.chart.type} Chart
                                  </span>
                                )}
                              </div>
                              <ul className="list-disc list-inside space-y-1 mt-2 text-slate-400 pl-1">
                                {s.insights?.bullets?.slice(0, 2).map((b: string, bi: number) => (
                                  <li key={bi} className="truncate">{b}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={resetWizard}
                    className="text-sm font-semibold text-slate-450 hover:text-slate-200 transition-all"
                  >
                    Build Another PowerPoint
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: DOWNLOAD HISTORY */
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-400" /> Export Downloads History
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Access previously generated client presentations from database storage cache.</p>
              </div>
              <button 
                onClick={fetchHistory}
                disabled={loadingHistory}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 p-2.5 rounded-xl flex items-center justify-center transition-all cursor-pointer"
              >
                {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>

            <div className="bg-slate-900/40 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
              {loadingHistory ? (
                <div className="flex items-center justify-center p-24 text-slate-400 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                  Loading historical exports...
                </div>
              ) : historyList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-850 text-slate-400 bg-slate-950/20 text-xs font-semibold tracking-wider">
                        <th className="p-4 pl-6">Job ID</th>
                        <th className="p-4">Presentation Output File</th>
                        <th className="p-4">Retrieved At</th>
                        <th className="p-4 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50">
                      {historyList.map((dl) => (
                        <tr key={dl.id} className="hover:bg-slate-900/35 transition-all text-slate-300">
                          <td className="p-4 pl-6 font-mono text-xs text-slate-500 select-all">{dl.job_id}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-indigo-400" />
                              <span className="font-semibold text-slate-200">{dl.filename}</span>
                            </div>
                          </td>
                          <td className="p-4 text-xs text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-slate-500" />
                              {new Date(dl.downloaded_at).toLocaleString()}
                            </span>
                          </td>
                          <td className="p-4 pr-6 text-right">
                            <a
                              href={`${API_BASE}/api/generate/download/${dl.job_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-indigo-650 text-slate-350 hover:text-white border border-slate-700 hover:border-indigo-500 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all shadow-sm"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Re-download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-24 text-slate-500 text-center space-y-2">
                  <div className="bg-slate-950 p-4 rounded-full border border-slate-850">
                    <History className="h-8 w-8 text-slate-650" />
                  </div>
                  <p className="font-bold text-slate-400">No Download History Found</p>
                  <p className="text-xs text-slate-500 max-w-sm">Generated presentations that are downloaded will automatically populate here in chronological order.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <p>© 2026 AI Presentation Builder. Under 2 minutes high-grade slide deck compiling.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
