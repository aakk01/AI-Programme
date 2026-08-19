import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Layers,
  Clock,
  Link as LinkIcon,
  Percent,
  Calendar,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { parsePredecessors, formatPredecessors } from "@/lib/links";

const STAGE_PRESETS = [
  "Preliminaries",
  "Substructure",
  "Superstructure",
  "Façade & Envelope",
  "Internal Fit-Out & MEP",
  "Commissioning & Handover",
  "External Works & Landscaping",
];

export function ActivityModal({
  open,
  onOpenChange,
  activity = null, // null for new activity, object for editing
  allActivities = [],
  onSave,
}) {
  const isEditing = Boolean(activity);

  const [actId, setActId] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("General Works");
  const [customStage, setCustomStage] = useState("");
  const [duration, setDuration] = useState(5);
  const [isMilestone, setIsMilestone] = useState(false);
  const [percentComplete, setPercentComplete] = useState(0);
  const [predecessorsList, setPredecessorsList] = useState([]); // [{ id, type: 'FS', lag: 0 }]
  const [constraintType, setConstraintType] = useState("");
  const [constraintDate, setConstraintDate] = useState("");
  const [error, setError] = useState("");

  // Initialize form when opened or activity changes
  useEffect(() => {
    if (open) {
      if (activity) {
        const id = activity.id || activity.activity_id || "";
        setActId(id);
        setDescription(activity.name || activity.description || "");
        const st = activity.stage || activity.wbs_l1 || activity.wbs_code || "General Works";
        if (STAGE_PRESETS.includes(st)) {
          setStage(st);
          setCustomStage("");
        } else {
          setStage("Custom");
          setCustomStage(st);
        }
        const dur = activity.duration !== undefined ? activity.duration : 5;
        setDuration(dur);
        setIsMilestone(activity.is_milestone || activity.type === "Milestone" || dur === 0);
        setPercentComplete(activity.percent_complete ?? activity.progress ?? 0);
        setPredecessorsList(
          (activity.predecessors || []).map((p) => ({
            id: p.id || p.activity_id || "",
            type: p.type || "FS",
            lag: p.lag !== undefined ? Number(p.lag) : 0,
          }))
        );
        setConstraintType(activity.constraint_type || "");
        setConstraintDate(activity.constraint_date || "");
      } else {
        // Create mode: generate next ID
        const currentCount = allActivities.length + 1;
        const nextId = `A${1000 + currentCount * 10}`;
        setActId(nextId);
        setDescription("");
        const lastAct = allActivities[allActivities.length - 1];
        const defaultStage = lastAct?.stage || lastAct?.wbs_l1 || STAGE_PRESETS[0];
        setStage(STAGE_PRESETS.includes(defaultStage) ? defaultStage : STAGE_PRESETS[0]);
        setCustomStage("");
        setDuration(5);
        setIsMilestone(false);
        setPercentComplete(0);
        // Link to previous task by default
        if (lastAct) {
          const lastId = lastAct.id || lastAct.activity_id;
          setPredecessorsList([{ id: lastId, type: "FS", lag: 0 }]);
        } else {
          setPredecessorsList([]);
        }
        setConstraintType("");
        setConstraintDate("");
      }
      setError("");
    }
  }, [open, activity, allActivities]);

  const handleAddPredecessorRow = () => {
    const available = allActivities.filter(
      (a) => (a.id || a.activity_id) !== actId && !predecessorsList.some((p) => p.id === (a.id || a.activity_id))
    );
    const candidate = available[0]?.id || available[0]?.activity_id || "";
    setPredecessorsList([...predecessorsList, { id: candidate, type: "FS", lag: 0 }]);
  };

  const handleRemovePredecessor = (index) => {
    setPredecessorsList(predecessorsList.filter((_, i) => i !== index));
  };

  const handleUpdatePredecessor = (index, field, value) => {
    const updated = [...predecessorsList];
    updated[index] = { ...updated[index], [field]: value };
    setPredecessorsList(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!actId.trim()) {
      setError("Activity ID is required");
      return;
    }
    if (!description.trim()) {
      setError("Task Name / Description is required");
      return;
    }

    // Check duplicate ID if new or changing ID
    if (!isEditing || actId !== (activity?.id || activity?.activity_id)) {
      const exists = allActivities.some((a) => (a.id || a.activity_id) === actId.trim());
      if (exists) {
        setError(`Activity ID "${actId}" already exists. Please choose a unique ID.`);
        return;
      }
    }

    const finalStage = stage === "Custom" ? customStage.trim() || "General Works" : stage;
    const finalDuration = isMilestone ? 0 : Math.max(0, parseInt(String(duration), 10) || 0);
    const validPreds = predecessorsList
      .filter((p) => p.id && p.id !== actId)
      .map((p) => ({
        id: p.id,
        type: p.type || "FS",
        lag: parseInt(String(p.lag), 10) || 0,
      }));

    const result = {
      ...(activity || {}),
      id: actId.trim(),
      activity_id: actId.trim(),
      name: description.trim(),
      description: description.trim(),
      stage: finalStage,
      wbs_l1: finalStage,
      duration: finalDuration,
      is_milestone: isMilestone,
      type: isMilestone ? "Milestone" : "Task",
      percent_complete: Math.min(100, Math.max(0, parseInt(String(percentComplete), 10) || 0)),
      progress: Math.min(100, Math.max(0, parseInt(String(percentComplete), 10) || 0)),
      predecessors: validPreds,
      constraint_type: constraintType,
      constraint_date: constraintDate || null,
    };

    onSave(result);
    onOpenChange(false);
  };

  const otherActivities = allActivities.filter((a) => (a.id || a.activity_id) !== actId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] bg-slate-900 border-slate-700 text-slate-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              {isEditing ? `Edit Activity: ${actId}` : "Create New Construction Task"}
            </DialogTitle>
            {isEditing && (
              <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400">
                {isMilestone ? "Milestone Deliverable" : "Standard Task"}
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {isEditing
              ? "Modify activity parameters, logic dependencies, lags, and duration."
              : "Define activity parameters, stages, durations, and predecessors for CPM calculation."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Activity ID, Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="actId" className="text-xs font-semibold text-slate-300">
                Activity ID <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="actId"
                value={actId}
                onChange={(e) => setActId(e.target.value)}
                placeholder="e.g. A1010, B1020"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-emerald-400 font-bold focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stageSelect" className="text-xs font-semibold text-slate-300">
                WBS Stage <span className="text-rose-400">*</span>
              </Label>
              <div className="flex gap-2">
                <select
                  id="stageSelect"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="flex-1 h-8 rounded-md bg-slate-950 border border-slate-700 text-xs text-slate-200 px-2 focus:outline-none focus:border-emerald-500"
                >
                  {STAGE_PRESETS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                  <option value="Custom">Custom Stage...</option>
                </select>
              </div>
              {stage === "Custom" && (
                <Input
                  value={customStage}
                  onChange={(e) => setCustomStage(e.target.value)}
                  placeholder="Enter stage name"
                  className="h-8 text-xs mt-1.5 bg-slate-950 border-slate-700 text-slate-200"
                />
              )}
            </div>
          </div>

          {/* Row 2: Task Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-semibold text-slate-300">
              Task Name / Description <span className="text-rose-400">*</span>
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cast Reinforced Concrete Columns & Cores"
              className="h-8 text-xs bg-slate-950 border-slate-700 text-white focus:border-emerald-500"
            />
          </div>

          {/* Row 3: Duration, Milestone Toggle, % Done */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="duration" className="text-xs font-semibold text-slate-300">
                  Duration (Days)
                </Label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMilestone}
                    onChange={(e) => {
                      setIsMilestone(e.target.checked);
                      if (e.target.checked) setDuration(0);
                      else if (duration === 0) setDuration(5);
                    }}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 h-3.5 w-3.5 bg-slate-950"
                  />
                  <span className="text-[11px] text-amber-400 font-medium">Milestone (0d)</span>
                </label>
              </div>
              <Input
                id="duration"
                type="number"
                min="0"
                value={isMilestone ? 0 : duration}
                disabled={isMilestone}
                onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pct" className="text-xs font-semibold text-slate-300">
                Progress (% Done)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pct"
                  type="number"
                  min="0"
                  max="100"
                  value={percentComplete}
                  onChange={(e) =>
                    setPercentComplete(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))
                  }
                  className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white w-20"
                />
                <div className="flex-1 bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-emerald-500 transition-all rounded-full"
                    style={{ width: `${percentComplete}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="constraint" className="text-xs font-semibold text-slate-300">
                Constraint (Optional)
              </Label>
              <select
                id="constraint"
                value={constraintType}
                onChange={(e) => setConstraintType(e.target.value)}
                className="w-full h-8 rounded-md bg-slate-950 border border-slate-700 text-xs text-slate-200 px-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="">None (As Soon As Possible)</option>
                <option value="SNET">Start No Earlier Than (SNET)</option>
                <option value="FNLT">Finish No Later Than (FNLT)</option>
                <option value="MSO">Must Start On (MSO)</option>
                <option value="MFO">Must Finish On (MFO)</option>
              </select>
            </div>
          </div>

          {/* Row 4: Predecessors & Logic Link Builder */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-blue-400" />
                <Label className="text-xs font-semibold text-slate-200">
                  Predecessors & Logic Dependencies
                </Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 gap-1 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                onClick={handleAddPredecessorRow}
                disabled={otherActivities.length === 0}
              >
                <Plus className="h-3 w-3" /> Add Link
              </Button>
            </div>

            {predecessorsList.length === 0 ? (
              <div className="p-3 text-center bg-slate-950/60 rounded border border-slate-800/80 text-[11px] text-slate-500">
                No predecessors configured. Task will start at project start.
              </div>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {predecessorsList.map((pred, idx) => (
                  <div
                    key={`pred-row-${idx}`}
                    className="flex items-center gap-2 p-2 bg-slate-950 rounded border border-slate-800 text-xs"
                  >
                    {/* Predecessor Activity Picker */}
                    <div className="flex-1">
                      <select
                        value={pred.id}
                        onChange={(e) => handleUpdatePredecessor(idx, "id", e.target.value)}
                        className="w-full h-7 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 px-2 font-mono"
                      >
                        <option value="">Select Predecessor...</option>
                        {otherActivities.map((a) => {
                          const aId = a.id || a.activity_id;
                          return (
                            <option key={aId} value={aId}>
                              {aId} - {a.name || a.description}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Link Type Picker */}
                    <div className="w-20">
                      <select
                        value={pred.type}
                        onChange={(e) => handleUpdatePredecessor(idx, "type", e.target.value)}
                        className="w-full h-7 rounded bg-slate-900 border border-slate-700 text-xs text-blue-300 font-bold px-1 text-center"
                      >
                        <option value="FS">FS (Finish-to-Start)</option>
                        <option value="SS">SS (Start-to-Start)</option>
                        <option value="FF">FF (Finish-to-Finish)</option>
                        <option value="SF">SF (Start-to-Finish)</option>
                      </select>
                    </div>

                    {/* Lag (Days) */}
                    <div className="w-24 flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">Lag:</span>
                      <Input
                        type="number"
                        value={pred.lag}
                        onChange={(e) =>
                          handleUpdatePredecessor(idx, "lag", parseInt(e.target.value, 10) || 0)
                        }
                        className="h-7 text-xs font-mono text-center bg-slate-900 border-slate-700 text-amber-300 w-14 p-1"
                        placeholder="0"
                      />
                      <span className="text-[10px] text-slate-400">d</span>
                    </div>

                    {/* Delete button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                      onClick={() => handleRemovePredecessor(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isEditing ? "Save Changes & Recalculate" : "Add Task to Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ActivityModal;
