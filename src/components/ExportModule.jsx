import React, { useState, useEffect } from "react";
import {
  Download,
  FileCode2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Layers,
  ShieldCheck,
  ExternalLink,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, errMsg, downloadExport } from "@/lib/api";
import { toast } from "sonner";
import { useBilling } from "@/context/BillingContext";

export function ExportModule({
  projectId = null,
  projectName = "Programme of Works",
  activities = [],
  scheduleResult = null,
  calendar = null,
}) {
  const { isPro, openPaywall } = useBilling();
  const [selectedFormat, setSelectedFormat] = useState("asta_xml");
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const formats = [
    {
      id: "asta_xml",
      name: "Asta Powerproject XML",
      extension: ".xml",
      badge: "Industry Standard",
      description: "Complete hierarchical work breakdown, standard 5/6-day calendars, link lag factors, and WBS custom outline levels.",
      color: "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5",
      isProOnly: false,
    },
    {
      id: "primavera_xer",
      name: "Primavera P6 XER",
      extension: ".xer",
      badge: "Enterprise Native",
      description: "Full P6 ERMHDR, PROJECT, PROJWBS, CALENDAR, TASK, and TASKPRED tables with PR_FS/PR_SS logic and TT_Mile gates.",
      color: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
      isProOnly: false,
    },
    {
      id: "ms_project_xml",
      name: "Microsoft Project XML",
      extension: ".xml",
      badge: "MSP Standard",
      description: "Standard MSP schema with Task ExtendedAttributes, predecessor logic codes, slack time calculations, and resource placeholders.",
      color: "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/5",
      isProOnly: false,
    },
    {
      id: "csv",
      name: "Spreadsheet Data Grid (CSV)",
      extension: ".csv",
      badge: "Universal",
      description: "Complete tabular dump including Early/Late Start & Finish dates, Free Float, Total Float, Critical markers, and predecessor strings.",
      color: "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5",
      isProOnly: false,
    },
    {
      id: "json",
      name: "JSON Programme Model",
      extension: ".json",
      badge: "API Schema",
      description: "Machine-readable full schedule object for custom integrations, ERP synchronizations, and automated reporting pipelines.",
      color: "border-zinc-500/40 text-zinc-600 dark:text-zinc-400 bg-zinc-500/5",
      isProOnly: false,
    },
  ];

  const fetchPreview = async (format) => {
    setLoading(true);
    try {
      const res = await api.post(`/export/preview/${format}`, {
        name: projectName,
        activities,
        start_date: scheduleResult?.project_start,
        calendar,
      });
      setExportData(res.data);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreview(selectedFormat);
  }, [selectedFormat, activities, projectName, scheduleResult, calendar]);

  const handleDownload = async () => {
    if (projectId) {
      setDownloading(true);
      try {
        let fmtParam = "asta";
        if (selectedFormat === "primavera_xer") fmtParam = "xer";
        else if (selectedFormat === "ms_project_xml") fmtParam = "msp";
        else if (selectedFormat === "csv") fmtParam = "csv";
        else if (selectedFormat === "json") fmtParam = "json";

        await downloadExport(projectId, fmtParam);
        toast.success(`Downloaded ${selectedFormat.toUpperCase()} export.`);
      } catch (err) {
        toast.error(errMsg(err));
      } finally {
        setDownloading(false);
      }
    } else if (exportData?.full_content) {
      // Direct client blob download
      const blob = new Blob([exportData.full_content], { type: exportData.mime_type || "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportData.file_name || `programme.${selectedFormat === "primavera_xer" ? "xer" : "xml"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${selectedFormat.toUpperCase()} file.`);
    }
  };

  const handleCopy = () => {
    if (!exportData?.full_content) return;
    navigator.clipboard.writeText(exportData.full_content);
    setCopied(true);
    toast.success("Copied export code to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Format Selection Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {formats.map((fmt) => {
          const isSelected = selectedFormat === fmt.id;
          return (
            <div
              key={fmt.id}
              onClick={() => setSelectedFormat(fmt.id)}
              className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                  : "border-border/80 bg-card hover:border-border hover:bg-muted/30"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className={`text-[10px] font-mono ${fmt.color}`}>
                    {fmt.extension}
                  </Badge>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">{fmt.badge}</span>
                </div>
                <h4 className="font-semibold text-sm text-foreground mb-1">{fmt.name}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{fmt.description}</p>
              </div>

              <div className="pt-3 mt-3 border-t border-border/40 flex items-center justify-between">
                <span className="text-[11px] font-medium text-primary flex items-center gap-1">
                  {isSelected ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                    </>
                  ) : (
                    "Click to select"
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Validation & Preview Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Pre-Flight Structural Validation Report */}
        <Card className="lg:col-span-5 bg-card border-border shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Structural Schema Validator
              </CardTitle>
              {exportData?.validation?.is_valid ? (
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                  100% Compliant
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                  Notice
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Verifies task IDs, link codes, WBS hierarchy, and calendar mappings before generating file.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {exportData?.validation ? (
              <div className="space-y-2.5">
                {exportData.validation.compliance_checks.map((chk, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs bg-muted/30 p-2.5 rounded-lg border border-border/50">
                    {chk.status === "pass" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="font-semibold text-foreground">{chk.rule}</div>
                      <div className="text-[11px] text-muted-foreground">{chk.details}</div>
                    </div>
                  </div>
                ))}

                <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground mt-3">
                  <Info className="w-3.5 h-3.5 text-primary inline mr-1.5" />
                  {exportData.validation.summary}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                Validating schema structure...
              </div>
            )}
          </CardContent>
          <CardFooter className="pt-3 border-t border-border/40 bg-muted/20 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Activities Encoded:</span>
            <span className="font-mono font-semibold text-foreground">
              {exportData?.schedule_summary?.total_activities || activities.length} Tasks
            </span>
          </CardFooter>
        </Card>

        {/* Right: Live File Preview & Download Handler */}
        <Card className="lg:col-span-7 bg-card border-border shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-primary" />
                  Export File Output ({exportData?.file_name || "output"})
                </CardTitle>
                <CardDescription className="text-xs">
                  {exportData ? `${exportData.line_count} lines • ${Math.round(exportData.character_count / 1024)} KB` : "Preparing file..."}
                </CardDescription>
              </div>

              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={handleCopy} disabled={!exportData} className="h-7 text-xs gap-1">
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy Code"}
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  onClick={handleDownload}
                  disabled={downloading || !exportData}
                  className="h-7 text-xs gap-1.5 font-medium bg-primary text-primary-foreground shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading ? "Exporting..." : "Download File"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="relative">
              <pre className="p-3 rounded-lg bg-zinc-950 text-zinc-100 text-[11px] font-mono overflow-x-auto max-h-[340px] leading-relaxed select-all">
                {exportData?.preview_snippet || "Generating export stream..."}
              </pre>
            </div>
          </CardContent>
          <CardFooter className="pt-2.5 pb-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
            <span>Ready for native import into Asta Powerproject, Primavera P6, or MS Project.</span>
            <Button variant="link" size="sm" onClick={handleDownload} className="h-auto p-0 text-xs text-primary font-medium">
              Direct Download <Download className="w-3 h-3 ml-1 inline" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
