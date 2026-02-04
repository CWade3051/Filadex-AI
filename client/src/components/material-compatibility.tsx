import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Grid3X3, Plus, Info, CheckCircle, XCircle, AlertCircle, HelpCircle, Loader2 } from "lucide-react";
import type { MaterialCompatibility, Material } from "@shared/schema";

// Compatibility level colors
const LEVEL_COLORS: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  excellent: { bg: "bg-green-500", text: "text-green-500", icon: CheckCircle },
  good: { bg: "bg-blue-500", text: "text-blue-500", icon: CheckCircle },
  poor: { bg: "bg-amber-500", text: "text-amber-500", icon: AlertCircle },
  incompatible: { bg: "bg-red-500", text: "text-red-500", icon: XCircle },
};

interface CompatibilityMatrixProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaterialCompatibilityMatrix({ open, onOpenChange }: CompatibilityMatrixProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedMaterial, setSelectedMaterial] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Fetch compatibility data
  const { data: compatibilityData = [], isLoading } = useQuery<MaterialCompatibility[]>({
    queryKey: ["/api/material-compatibility"],
    enabled: open,
  });

  // Fetch materials list
  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["/api/materials"],
  });

  // Seed default data mutation
  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/material-compatibility/seed", { method: "POST" });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/material-compatibility"] });
      toast({
        title: "Data Seeded",
        description: `Added ${data.added} compatibility entries`,
      });
    },
  });

  // Get unique materials from compatibility data
  const uniqueMaterials = useMemo(() => {
    const materialsSet = new Set<string>();
    compatibilityData.forEach((entry) => {
      materialsSet.add(entry.material1);
      materialsSet.add(entry.material2);
    });
    return Array.from(materialsSet).sort();
  }, [compatibilityData]);

  // Get compatibility for a specific pair
  const getCompatibility = (mat1: string, mat2: string): MaterialCompatibility | undefined => {
    return compatibilityData.find(
      (entry) =>
        (entry.material1 === mat1 && entry.material2 === mat2) ||
        (entry.material1 === mat2 && entry.material2 === mat1)
    );
  };

  // Filter compatibility data based on selected material
  const filteredData = useMemo(() => {
    if (!selectedMaterial) return compatibilityData;
    return compatibilityData.filter(
      (entry) =>
        entry.material1 === selectedMaterial || entry.material2 === selectedMaterial
    );
  }, [compatibilityData, selectedMaterial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" />
            Material Compatibility Matrix
          </DialogTitle>
          <DialogDescription>
            View which materials can be printed together for multi-material prints
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2">
          <div className="flex-1">
            <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by material..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Materials</SelectItem>
                {uniqueMaterials.map((material) => (
                  <SelectItem key={material} value={material}>
                    {material}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {compatibilityData.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Load Default Data
            </Button>
          )}

          <Button variant="outline" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 py-2 border-y">
          <span className="text-sm text-muted-foreground">Legend:</span>
          {Object.entries(LEVEL_COLORS).map(([level, { bg, icon: Icon }]) => (
            <div key={level} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded ${bg}`} />
              <span className="text-xs capitalize">{level}</span>
            </div>
          ))}
        </div>

        <ScrollArea className="flex-1 pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Grid3X3 className="h-12 w-12 mb-4 opacity-50" />
              <p>No compatibility data available</p>
              <p className="text-sm">Click "Load Default Data" to populate the matrix</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredData.map((entry) => (
                <CompatibilityCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Matrix Grid View (for small datasets) */}
        {uniqueMaterials.length > 0 && uniqueMaterials.length <= 10 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Quick Matrix View</h4>
            <div className="overflow-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-1 border bg-muted" />
                    {uniqueMaterials.map((mat) => (
                      <th key={mat} className="p-1 border bg-muted text-center min-w-[60px]">
                        {mat.slice(0, 6)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uniqueMaterials.map((mat1) => (
                    <tr key={mat1}>
                      <td className="p-1 border bg-muted font-medium">{mat1.slice(0, 6)}</td>
                      {uniqueMaterials.map((mat2) => {
                        const compat = getCompatibility(mat1, mat2);
                        const levelColor = compat
                          ? LEVEL_COLORS[compat.compatibilityLevel]?.bg || "bg-gray-300"
                          : "bg-gray-100";
                        return (
                          <TooltipProvider key={mat2}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <td
                                  className={`p-1 border text-center cursor-help ${
                                    mat1 === mat2 ? "bg-muted" : ""
                                  }`}
                                >
                                  {compat ? (
                                    <div className={`w-4 h-4 rounded mx-auto ${levelColor}`} />
                                  ) : mat1 === mat2 ? (
                                    <div className="w-4 h-4 rounded mx-auto bg-green-500" />
                                  ) : (
                                    <HelpCircle className="w-4 h-4 mx-auto text-muted-foreground" />
                                  )}
                                </td>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">
                                  {mat1} + {mat2}
                                </p>
                                {compat ? (
                                  <>
                                    <p className="capitalize">{compat.compatibilityLevel}</p>
                                    {compat.notes && (
                                      <p className="text-xs text-muted-foreground max-w-[200px]">
                                        {compat.notes}
                                      </p>
                                    )}
                                  </>
                                ) : mat1 === mat2 ? (
                                  <p>Same material - Excellent</p>
                                ) : (
                                  <p className="text-muted-foreground">No data available</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <AddCompatibilityDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          materials={materials}
        />
      </DialogContent>
    </Dialog>
  );
}

// Individual compatibility card
function CompatibilityCard({ entry }: { entry: MaterialCompatibility }) {
  const levelInfo = LEVEL_COLORS[entry.compatibilityLevel] || LEVEL_COLORS.poor;
  const Icon = levelInfo.icon;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${levelInfo.bg}/10`}>
            <Icon className={`h-4 w-4 ${levelInfo.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{entry.material1}</Badge>
              <span className="text-muted-foreground">+</span>
              <Badge variant="secondary">{entry.material2}</Badge>
            </div>
            {entry.notes && (
              <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <Badge
            variant="outline"
            className={`capitalize ${levelInfo.text} border-current`}
          >
            {entry.compatibilityLevel}
          </Badge>
          {entry.interfaceStrength && (
            <p className="text-xs text-muted-foreground mt-1">
              Interface: {entry.interfaceStrength}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// Add compatibility dialog
function AddCompatibilityDialog({
  open,
  onOpenChange,
  materials,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: Material[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [material1, setMaterial1] = useState("");
  const [material2, setMaterial2] = useState("");
  const [compatibilityLevel, setCompatibilityLevel] = useState("good");
  const [interfaceStrength, setInterfaceStrength] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/material-compatibility", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/material-compatibility"] });
      toast({ title: "Success", description: "Compatibility entry added" });
      onOpenChange(false);
      // Reset form
      setMaterial1("");
      setMaterial2("");
      setCompatibilityLevel("good");
      setInterfaceStrength("");
      setNotes("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add entry",
      });
    },
  });

  const handleSubmit = () => {
    if (!material1 || !material2) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select both materials",
      });
      return;
    }

    createMutation.mutate({
      material1,
      material2,
      compatibilityLevel,
      interfaceStrength: interfaceStrength || undefined,
      notes: notes || undefined,
      source: "user",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Compatibility Entry</DialogTitle>
          <DialogDescription>
            Define compatibility between two materials
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Material 1</Label>
              <Select value={material1} onValueChange={setMaterial1}>
                <SelectTrigger>
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Material 2</Label>
              <Select value={material2} onValueChange={setMaterial2}>
                <SelectTrigger>
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Compatibility Level</Label>
              <Select value={compatibilityLevel} onValueChange={setCompatibilityLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                  <SelectItem value="incompatible">Incompatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Interface Strength</Label>
              <Select value={interfaceStrength} onValueChange={setInterfaceStrength}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not specified</SelectItem>
                  <SelectItem value="strong">Strong</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="weak">Weak</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this combination..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
