import { useState, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Scale, Calculator, RotateCcw } from "lucide-react";
import type { Filament } from "@shared/schema";

interface WeightModalProps {
  filament: Filament | null;
  open: boolean;
  onClose: () => void;
}

// Common empty spool weights for different manufacturers
const SPOOL_PRESETS = [
  { name: "Bambu Lab", weight: 200 },
  { name: "Generic", weight: 250 },
  { name: "Polymaker", weight: 230 },
  { name: "eSUN", weight: 240 },
  { name: "Sunlu", weight: 220 },
  { name: "Hatchbox", weight: 250 },
];

export function WeightModal({ filament, open, onClose }: WeightModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentWeight, setCurrentWeight] = useState<string>("");
  const [emptySpoolWeight, setEmptySpoolWeight] = useState<string>("200");
  const [calculatedRemaining, setCalculatedRemaining] = useState<number | null>(null);
  const [filamentWeight, setFilamentWeight] = useState<number | null>(null);

  // Reset form when filament changes
  useEffect(() => {
    if (filament) {
      setCurrentWeight(filament.currentWeight || "");
      setEmptySpoolWeight(filament.emptySpoolWeight || "200");
      setCalculatedRemaining(null);
      setFilamentWeight(null);
    }
  }, [filament]);

  // Calculate remaining percentage when weights change
  useEffect(() => {
    if (currentWeight && emptySpoolWeight && filament) {
      const current = parseFloat(currentWeight);
      const empty = parseFloat(emptySpoolWeight);
      const total = parseFloat(filament.totalWeight);

      if (!isNaN(current) && !isNaN(empty) && !isNaN(total) && total > 0) {
        const filWeight = current - empty;
        const remaining = Math.round((filWeight / total) * 100);
        setFilamentWeight(Math.max(0, filWeight));
        setCalculatedRemaining(Math.max(0, Math.min(100, remaining)));
      } else {
        setCalculatedRemaining(null);
        setFilamentWeight(null);
      }
    } else {
      setCalculatedRemaining(null);
      setFilamentWeight(null);
    }
  }, [currentWeight, emptySpoolWeight, filament]);

  const updateWeightMutation = useMutation({
    mutationFn: async (data: { currentWeight: number; emptySpoolWeight: number }) => {
      const response = await fetch(`/api/filaments/${filament?.id}/weight`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to update weight");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      toast({
        title: t("filaments.weightUpdated"),
        description: `${t("filaments.remainingPercentage")}: ${data.calculatedRemaining}%`,
      });
      onClose();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("filaments.weightUpdateError"),
      });
    },
  });

  const handleSubmit = () => {
    if (!currentWeight || !emptySpoolWeight) return;
    
    updateWeightMutation.mutate({
      currentWeight: parseFloat(currentWeight),
      emptySpoolWeight: parseFloat(emptySpoolWeight),
    });
  };

  const handlePresetClick = (weight: number) => {
    setEmptySpoolWeight(weight.toString());
  };

  if (!filament) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            {t("filaments.updateWeight")}
          </DialogTitle>
          <DialogDescription>
            {filament.name} - {filament.material}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Current Weight Input */}
          <div className="grid gap-2">
            <Label htmlFor="currentWeight">{t("filaments.currentWeight")}</Label>
            <div className="relative">
              <Input
                id="currentWeight"
                type="number"
                step="1"
                min="0"
                placeholder={t("filaments.currentWeightPlaceholder")}
                value={currentWeight}
                onChange={(e) => setCurrentWeight(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                g
              </span>
            </div>
          </div>

          {/* Empty Spool Weight Input */}
          <div className="grid gap-2">
            <Label htmlFor="emptySpoolWeight">{t("filaments.emptySpoolWeight")}</Label>
            <div className="relative">
              <Input
                id="emptySpoolWeight"
                type="number"
                step="1"
                min="0"
                placeholder={t("filaments.emptySpoolWeightPlaceholder")}
                value={emptySpoolWeight}
                onChange={(e) => setEmptySpoolWeight(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                g
              </span>
            </div>
          </div>

          {/* Presets */}
          <div className="grid gap-2">
            <Label>{t("filaments.emptySpoolPresets")}</Label>
            <div className="flex flex-wrap gap-1">
              {SPOOL_PRESETS.map((preset) => (
                <Badge
                  key={preset.name}
                  variant={emptySpoolWeight === preset.weight.toString() ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/80"
                  onClick={() => handlePresetClick(preset.weight)}
                >
                  {preset.name} ({preset.weight}g)
                </Badge>
              ))}
            </div>
          </div>

          {/* Calculation Result */}
          {calculatedRemaining !== null && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4" />
                {t("filaments.calculatedRemaining")}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("filaments.filamentWeight")}:</span>
                  <span className="ml-2 font-medium">{filamentWeight}g</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("filaments.remainingPercentage")}:</span>
                  <span className="ml-2 font-bold text-lg">{calculatedRemaining}%</span>
                </div>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${calculatedRemaining}%` }}
                />
              </div>
            </div>
          )}

          {/* Current values info */}
          {filament.lastWeighedAt && (
            <div className="text-xs text-muted-foreground">
              {t("filaments.lastWeighed")}: {new Date(filament.lastWeighedAt).toLocaleString()}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!currentWeight || !emptySpoolWeight || updateWeightMutation.isPending}
          >
            {updateWeightMutation.isPending ? (
              <>
                <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <Scale className="h-4 w-4 mr-2" />
                {t("filaments.updateWeight")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
