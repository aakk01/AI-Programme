import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  Loader2,
  HardHat,
  Layers,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";
import { useBilling } from "@/context/BillingContext";

export function Wizard() {
  const navigate = useNavigate();
  const { openPaywall } = useBilling();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [genStage, setGenStage] = useState("Initiating AI CPM Planning Engine...");

  // Form State
  const [formData, setFormData] = useState({
    title: "100 Bishopsgate — Cat-A Commercial Refurbishment & Fit-Out",
    sector: "commercial",
    gia: 8500,
    storeys_above: 12,
    storeys_below: 2,
    procurement: "design_and_build",
    start_date: "2026-09-01",
    target_completion: "2027-04-30",
    working_days: 5,
    holiday_preset: "uk",
    methodology: "Structural alterations followed by vertical riser MEP, envelope works, followed by floor-by-floor drylining and Cat-A fit-out.",
    key_milestones: "Site Access: 2026-09-01, Substructure complete: 2026-11-15, Weathertight: 2027-01-20, Practical Completion: 2027-04-30",
  });

  const updateField = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setGenStage("Structuring multi-level WBS hierarchy...");

      const payload = {
        title: formData.title,
        sector: formData.sector,
        inputs: {
          gia: Number(formData.gia),
          storeys_above: Number(formData.storeys_above),
          storeys_below: Number(formData.storeys_below),
          procurement: formData.procurement,
          start_date: formData.start_date,
          target_completion: formData.target_completion,
          methodology: formData.methodology,
          key_milestones: formData.key_milestones,
        },
        calendar: {
          working_days: Number(formData.working_days),
          holiday_preset: formData.holiday_preset,
          custom_holidays: [],
        },
      };

      // 1. Create project
      const createRes = await api.post("/projects", payload);
      const projectId = createRes.data.project_id || createRes.data.id;

      // 2. Trigger AI generation
      setGenStage("Synthesizing engineering trade packages and predecessor links...");
      await api.post(`/projects/${projectId}/generate`, {
        prompt: formData.methodology,
      });

      // 3. Poll generation status
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await api.get(`/projects/${projectId}/generation-status`);
          const st = statusRes.data?.status;

          if (st === "running") {
            if (attempts === 2) setGenStage("Executing forward & backward Critical Path passes...");
            if (attempts === 4) setGenStage("Calculating total float, free slack and calendar exceptions...");
          } else if (st === "done" || st === "completed") {
            clearInterval(pollInterval);
            toast.success("AI Programme generated successfully!");
            navigate(`/workspace/${projectId}`);
          } else if (st === "error" || st === "failed") {
            clearInterval(pollInterval);
            toast.error(statusRes.data?.error || "AI generation failed");
            setLoading(false);
          }
        } catch {
          // If polling endpoint fails, direct navigate after fallback
          if (attempts > 5) {
            clearInterval(pollInterval);
            navigate(`/workspace/${projectId}`);
          }
        }
      }, 1500);
    } catch (err) {
      if (err.response?.status === 402) {
        openPaywall("ai_generation");
      } else {
        toast.error(errMsg(err));
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between bg-card/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1 text-xs">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </div>
        <div className="flex items-center gap-2 font-bold text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>New AI Programme of Works Wizard</span>
        </div>
      </header>

      {/* Wizard Body */}
      <div className="flex-1 max-w-3xl w-full mx-auto p-6 flex flex-col justify-center">
        {loading ? (
          <Card className="p-8 text-center space-y-6 shadow-xl border-primary/30">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center animate-pulse">
              <Sparkles className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Generating Programme of Works</h2>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{genStage}</span>
              </p>
            </div>
            <div className="max-w-md mx-auto h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-indeterminate" />
            </div>
          </Card>
        ) : (
          <Card className="shadow-xl">
            <CardHeader>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Step {step} of 3</span>
                <span className="font-semibold text-primary">
                  {step === 1 && "Project Scope & Geometry"}
                  {step === 2 && "Key Dates & Milestones"}
                  {step === 3 && "Working Calendar & Methodology"}
                </span>
              </div>
              <CardTitle className="text-xl font-bold">
                {step === 1 && "Define Project Identity & Scope"}
                {step === 2 && "Schedule Milestones & Target Completion"}
                {step === 3 && "Site Constraints & Working Calendar"}
              </CardTitle>
              <CardDescription>
                Provide project parameters. The AI Planning Engine will structure the multi-level WBS, logic ties, and durations.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Project Title</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => updateField("title", e.target.value)}
                      placeholder="e.g. Paddington Square Commercial Office Fit-Out"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Sector</Label>
                      <Select value={formData.sector} onValueChange={(v) => updateField("sector", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select project type/sector" />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          <SelectGroup>
                            <SelectLabel>Commercial & Office</SelectLabel>
                            <SelectItem value="commercial">Commercial / Office (New Build)</SelectItem>
                            <SelectItem value="commercial_fitout_cat_a">Commercial Fit-Out (Cat-A Base Build)</SelectItem>
                            <SelectItem value="commercial_fitout_cat_b">Commercial Fit-Out (Cat-B Tenant Interior)</SelectItem>
                            <SelectItem value="commercial_refurbishment">Commercial Refurbishment & Cut-and-Carve</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Residential & Living</SelectLabel>
                            <SelectItem value="residential">Residential High-Rise / Multi-Storey (RC Frame)</SelectItem>
                            <SelectItem value="residential_low_rise">Residential Low-Rise & Housing Developments</SelectItem>
                            <SelectItem value="student_accommodation">Student Accommodation (PBSA) & Co-Living</SelectItem>
                            <SelectItem value="build_to_rent">Build to Rent (BTR) & PRS Developments</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Healthcare & Life Sciences</SelectLabel>
                            <SelectItem value="healthcare">Healthcare, Hospitals & Acute Clinical Facilities</SelectItem>
                            <SelectItem value="healthcare_primary_care">Primary Care & Outpatient Medical Centres</SelectItem>
                            <SelectItem value="life_sciences">Life Sciences, Bio-Labs & Cleanrooms</SelectItem>
                            <SelectItem value="care_home">Senior Living & Care Home Facilities</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Education & Civic</SelectLabel>
                            <SelectItem value="education_schools">Primary & Secondary Schools</SelectItem>
                            <SelectItem value="education_higher_ed">Higher Education & University Campuses</SelectItem>
                            <SelectItem value="civic_community">Civic, Municipal & Community Buildings</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Industrial, Logistics & Tech</SelectLabel>
                            <SelectItem value="industrial">Industrial, Logistics & Distribution Warehouses</SelectItem>
                            <SelectItem value="data_centre">Data Centres & Mission-Critical Facilities</SelectItem>
                            <SelectItem value="manufacturing">Manufacturing & Heavy Industrial Plants</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Retail, Hospitality & Leisure</SelectLabel>
                            <SelectItem value="hospitality_hotel">Hotels & Luxury Hospitality</SelectItem>
                            <SelectItem value="retail">Retail Stores & Shopping Centres</SelectItem>
                            <SelectItem value="leisure_sports">Sports Arenas, Stadia & Leisure Centres</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Civils, Infrastructure & Energy</SelectLabel>
                            <SelectItem value="infrastructure">Civils, Highways, Roads & Bridges</SelectItem>
                            <SelectItem value="rail_transport">Rail, Metro & Transportation Interchanges</SelectItem>
                            <SelectItem value="utilities_water">Water, Wastewater & Deep Drainage Works</SelectItem>
                            <SelectItem value="renewable_energy">Renewable Energy, Solar, Wind & BESS Grid Substations</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Specialist</SelectLabel>
                            <SelectItem value="heritage_conservation">Heritage, Listed Buildings & Historic Restoration</SelectItem>
                            <SelectItem value="mixed_use">Mixed-Use (Commercial, Retail & Residential)</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Procurement Route</Label>
                      <Select value={formData.procurement} onValueChange={(v) => updateField("procurement", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="design_and_build">Design & Build (D&B)</SelectItem>
                          <SelectItem value="traditional">Traditional / Lump Sum</SelectItem>
                          <SelectItem value="construction_management">Construction Management</SelectItem>
                          <SelectItem value="nec4">NEC4 Engineering & Construction</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label>GIA (m²)</Label>
                      <Input
                        type="number"
                        value={formData.gia}
                        onChange={(e) => updateField("gia", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Storeys (Above Ground)</Label>
                      <Input
                        type="number"
                        value={formData.storeys_above}
                        onChange={(e) => updateField("storeys_above", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Basement Levels</Label>
                      <Input
                        type="number"
                        value={formData.storeys_below}
                        onChange={(e) => updateField("storeys_below", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Site Possession / Start Date</Label>
                      <Input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => updateField("start_date", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Contract Target Completion (PC)</Label>
                      <Input
                        type="date"
                        value={formData.target_completion}
                        onChange={(e) => updateField("target_completion", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Key Sectional Milestones & Constraints</Label>
                    <Textarea
                      rows={3}
                      value={formData.key_milestones}
                      onChange={(e) => updateField("key_milestones", e.target.value)}
                      placeholder="e.g. Demolition complete: Oct 2026, Core topping out: Jan 2027..."
                    />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Working Week Pattern</Label>
                      <Select
                        value={String(formData.working_days)}
                        onValueChange={(v) => updateField("working_days", Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5-Day Week (Mon – Fri)</SelectItem>
                          <SelectItem value="6">6-Day Week (Mon – Sat)</SelectItem>
                          <SelectItem value="7">7-Day Week (Continuous)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Public Holiday Preset</Label>
                      <Select
                        value={formData.holiday_preset}
                        onValueChange={(v) => updateField("holiday_preset", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uk">United Kingdom (Bank Holidays)</SelectItem>
                          <SelectItem value="us">United States (Federal)</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Construction Methodology & Sequencing Directives</Label>
                    <Textarea
                      rows={4}
                      value={formData.methodology}
                      onChange={(e) => updateField("methodology", e.target.value)}
                      placeholder="e.g. Top-down basement construction, prefabricated bathroom pods, floor-by-floor commissioning..."
                    />
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-between border-t pt-4">
              <Button
                variant="outline"
                onClick={() => (step > 1 ? setStep(step - 1) : navigate("/"))}
              >
                {step === 1 ? "Cancel" : "Previous Step"}
              </Button>

              {step < 3 ? (
                <Button onClick={() => setStep(step + 1)} className="gap-1">
                  Next Step <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleGenerate}
                  className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate AI Programme
                </Button>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
