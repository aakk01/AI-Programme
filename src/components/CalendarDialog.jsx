import React, { useState } from "react";
import { Calendar as CalendarIcon, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export function CalendarDialog({ open, onOpenChange, calendar = {}, onSave }) {
  const [workingDays, setWorkingDays] = useState(calendar.working_days || 5);
  const [holidayPreset, setHolidayPreset] = useState(calendar.holiday_preset || "uk");
  const [customHolidays, setCustomHolidays] = useState(calendar.custom_holidays || []);
  const [newDate, setNewDate] = useState("");

  const handleAddDate = () => {
    if (!newDate) return;
    if (!customHolidays.includes(newDate)) {
      setCustomHolidays([...customHolidays, newDate].sort());
    }
    setNewDate("");
  };

  const handleRemoveDate = (d) => {
    setCustomHolidays(customHolidays.filter((x) => x !== d));
  };

  const handleSave = () => {
    onSave?.({
      working_days: parseInt(workingDays, 10),
      holiday_preset: holidayPreset,
      custom_holidays: customHolidays,
    });
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <CalendarIcon className="h-5 w-5" />
            <DialogTitle>Project Working Calendar</DialogTitle>
          </div>
          <DialogDescription>
            Configure standard working days, public holiday calendars, and site shut-downs for CPM forward/backward calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Working Week Pattern</Label>
            <Select value={String(workingDays)} onValueChange={(v) => setWorkingDays(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Select working days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5-Day Standard (Monday – Friday)</SelectItem>
                <SelectItem value="6">6-Day Working (Monday – Saturday)</SelectItem>
                <SelectItem value="7">7-Day Continuous (All 7 Days)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Public Holiday Calendar Preset</Label>
            <Select value={holidayPreset} onValueChange={setHolidayPreset}>
              <SelectTrigger>
                <SelectValue placeholder="Select holiday preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uk">United Kingdom (England & Wales Bank Holidays)</SelectItem>
                <SelectItem value="us">United States (Federal Public Holidays)</SelectItem>
                <SelectItem value="none">None / Custom Exceptions Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Custom Non-Working Dates & Site Shutdowns</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddDate}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {customHolidays.length > 0 && (
              <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1 bg-muted/20">
                {customHolidays.map((d) => (
                  <div key={d} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-background border">
                    <span className="font-mono">{d}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDate(d)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Apply & Recalculate CPM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
