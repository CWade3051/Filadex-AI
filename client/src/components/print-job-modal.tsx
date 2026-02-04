import { useState, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Printer, Plus, Trash2, Upload, FileText } from "lucide-react";
import type { Filament, PrintJob } from "@shared/schema";

interface PrintJobModalProps {
  open: boolean;
  onClose: () => void;
  printJob?: PrintJob | null;
}

interface FilamentUsage {
  filamentId: number;
  gramsUsed: number;
  metersUsed?: number;
}

export function PrintJobModal({ open, onClose, printJob }: PrintJobModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("completed");
  const [failureReason, setFailureReason] = useState("");
  const [printerUsed, setPrinterUsed] = useState("");
  const [slicerUsed, setSlicerUsed] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [actualDuration, setActualDuration] = useState("");
  const [estimatedWeight, setEstimatedWeight] = useState("");
  const [actualWeight, setActualWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [filamentUsages, setFilamentUsages] = useState<FilamentUsage[]>([]);

  // Fetch filaments for selection
  const { data: filaments = [] } = useQuery<Filament[]>({
    queryKey: ["/api/filaments"],
  });

  // Fetch printers for selection
  const { data: printersList = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/printers"],
  });

  // Fetch slicers for selection
  const { data: slicersList = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/slicers"],
  });

  // Reset form when modal opens/closes or printJob changes
  useEffect(() => {
    if (open) {
      if (printJob) {
        setName(printJob.name || "");
        setDescription(printJob.description || "");
        setStatus(printJob.status || "completed");
        setFailureReason(printJob.failureReason || "");
        setPrinterUsed(printJob.printerUsed || "");
        setSlicerUsed(printJob.slicerUsed || "");
        setEstimatedDuration(printJob.estimatedDuration?.toString() || "");
        setActualDuration(printJob.actualDuration?.toString() || "");
        setEstimatedWeight(printJob.estimatedWeight || "");
        setActualWeight(printJob.actualWeight || "");
        setNotes(printJob.notes || "");
        if (printJob.filamentUsages) {
          try {
            setFilamentUsages(JSON.parse(printJob.filamentUsages));
          } catch (e) {
            setFilamentUsages([]);
          }
        }
      } else {
        // Reset for new print job
        setName("");
        setDescription("");
        setStatus("completed");
        setFailureReason("");
        setPrinterUsed("");
        setSlicerUsed("");
        setEstimatedDuration("");
        setActualDuration("");
        setEstimatedWeight("");
        setActualWeight("");
        setNotes("");
        setFilamentUsages([]);
      }
    }
  }, [open, printJob]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/print-jobs", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      toast({
        title: t("common.success"),
        description: t("printJobs.addSuccess"),
      });
      onClose();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("printJobs.addError"),
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/print-jobs/${printJob?.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] });
      toast({
        title: t("common.success"),
        description: t("printJobs.updateSuccess"),
      });
      onClose();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("printJobs.updateError"),
      });
    },
  });

  const handleAddFilamentUsage = () => {
    setFilamentUsages([...filamentUsages, { filamentId: 0, gramsUsed: 0 }]);
  };

  const handleRemoveFilamentUsage = (index: number) => {
    setFilamentUsages(filamentUsages.filter((_, i) => i !== index));
  };

  const handleFilamentUsageChange = (
    index: number,
    field: keyof FilamentUsage,
    value: number
  ) => {
    const updated = [...filamentUsages];
    updated[index] = { ...updated[index], [field]: value };
    setFilamentUsages(updated);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("printJobs.name") + " " + t("common.required"),
      });
      return;
    }

    // Filter out invalid filament usages
    const validUsages = filamentUsages.filter(
      (u) => u.filamentId > 0 && u.gramsUsed > 0
    );

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      status,
      failureReason: status === "failed" ? failureReason : undefined,
      printerUsed: printerUsed.trim() || undefined,
      slicerUsed: slicerUsed.trim() || undefined,
      estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : undefined,
      actualDuration: actualDuration ? parseInt(actualDuration) : undefined,
      estimatedWeight: estimatedWeight ? parseFloat(estimatedWeight) : undefined,
      actualWeight: actualWeight ? parseFloat(actualWeight) : undefined,
      notes: notes.trim() || undefined,
      filamentUsages: validUsages.length > 0 ? validUsages : undefined,
    };

    if (printJob) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {printJob ? t("printJobs.editPrintJob") : t("printJobs.addPrintJob")}
          </DialogTitle>
          <DialogDescription>
            {t("printJobs.addPrintJobDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t("printJobs.name")} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("printJobs.namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">{t("printJobs.status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">{t("printJobs.completed")}</SelectItem>
                  <SelectItem value="failed">{t("printJobs.failed")}</SelectItem>
                  <SelectItem value="cancelled">{t("printJobs.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {status === "failed" && (
            <div className="grid gap-2">
              <Label htmlFor="failureReason">{t("printJobs.failureReason")}</Label>
              <Input
                id="failureReason"
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                placeholder={t("printJobs.failureReasonPlaceholder")}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="description">{t("printJobs.description")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("printJobs.descriptionPlaceholder")}
              rows={2}
            />
          </div>

          {/* Printer/Slicer Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="printer">{t("printJobs.printer")}</Label>
              <Select
                value={printerUsed || ""}
                onValueChange={(val) => setPrinterUsed(val === "__custom__" ? "" : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("printJobs.printerPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {printersList.map((printer) => (
                    <SelectItem key={printer.id} value={printer.name}>
                      {printer.name}
                    </SelectItem>
                  ))}
                  {printerUsed && !printersList.find(p => p.name === printerUsed) && (
                    <SelectItem value={printerUsed}>{printerUsed}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {printersList.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add printers in Settings → List Management
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slicer">{t("printJobs.slicer")}</Label>
              <Select
                value={slicerUsed || ""}
                onValueChange={(val) => setSlicerUsed(val === "__custom__" ? "" : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("printJobs.slicerPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {slicersList.map((slicer) => (
                    <SelectItem key={slicer.id} value={slicer.name}>
                      {slicer.name}
                    </SelectItem>
                  ))}
                  {slicerUsed && !slicersList.find(s => s.name === slicerUsed) && (
                    <SelectItem value={slicerUsed}>{slicerUsed}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Time estimates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="estimatedDuration">
                {t("printJobs.estimatedDuration")} ({t("printJobs.minutes")})
              </Label>
              <Input
                id="estimatedDuration"
                type="number"
                min="0"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="actualDuration">
                {t("printJobs.actualDuration")} ({t("printJobs.minutes")})
              </Label>
              <Input
                id="actualDuration"
                type="number"
                min="0"
                value={actualDuration}
                onChange={(e) => setActualDuration(e.target.value)}
              />
            </div>
          </div>

          {/* Weight estimates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="estimatedWeight">{t("printJobs.estimatedWeight")}</Label>
              <Input
                id="estimatedWeight"
                type="number"
                min="0"
                step="0.1"
                value={estimatedWeight}
                onChange={(e) => setEstimatedWeight(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="actualWeight">{t("printJobs.actualWeight")}</Label>
              <Input
                id="actualWeight"
                type="number"
                min="0"
                step="0.1"
                value={actualWeight}
                onChange={(e) => setActualWeight(e.target.value)}
              />
            </div>
          </div>

          {/* Filament Usage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("printJobs.filamentUsed")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddFilamentUsage}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("printJobs.addFilament")}
              </Button>
            </div>

            {filamentUsages.map((usage, index) => (
              <div key={index} className="flex items-end gap-2 p-3 border rounded-lg">
                <div className="flex-1 grid gap-2">
                  <Label>{t("printJobs.selectFilament")}</Label>
                  <Select
                    value={usage.filamentId.toString()}
                    onValueChange={(val) =>
                      handleFilamentUsageChange(index, "filamentId", parseInt(val))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("printJobs.selectFilament")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filaments
                        .filter((f) => !f.isArchived)
                        .map((filament) => (
                          <SelectItem key={filament.id} value={filament.id.toString()}>
                            <span className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: filament.colorCode || "#ccc" }}
                              />
                              {filament.name} ({filament.remainingPercentage}%)
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32 grid gap-2">
                  <Label>{t("printJobs.gramsUsed")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={usage.gramsUsed || ""}
                    onChange={(e) =>
                      handleFilamentUsageChange(index, "gramsUsed", parseFloat(e.target.value) || 0)
                    }
                    placeholder={t("printJobs.gramsUsedPlaceholder")}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveFilamentUsage(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="notes">{t("filaments.notes")}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? t("common.loading") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
