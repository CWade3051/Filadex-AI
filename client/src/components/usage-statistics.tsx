import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Printer, 
  DollarSign, 
  Clock, 
  Weight,
  TrendingUp,
  BarChart3
} from "lucide-react";
import { useUnits } from "@/lib/use-units";

interface UsageStats {
  period: string;
  totalPrintJobs: number;
  totalGramsUsed: number;
  totalCost: number;
  totalPrintTimeMinutes: number;
  totalPrintTimeHours: number;
  materialUsage: Record<string, number>;
  averageGramsPerPrint: number;
  averageCostPerPrint: number;
}

export function UsageStatistics() {
  const { t } = useTranslation();
  const { formatPrice } = useUnits();
  const [period, setPeriod] = useState("30d");

  const { data: stats, isLoading } = useQuery<UsageStats>({
    queryKey: [`/api/statistics/usage?period=${period}`],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-t-2 border-primary rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  // Calculate material percentages
  const totalMaterialWeight = Object.values(stats.materialUsage).reduce((a, b) => a + b, 0);
  const materialPercentages = Object.entries(stats.materialUsage)
    .map(([name, weight]) => ({
      name,
      weight,
      percentage: totalMaterialWeight > 0 ? (weight / totalMaterialWeight) * 100 : 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  // Colors for materials
  const materialColors: Record<string, string> = {
    PLA: "#4ade80",
    PETG: "#60a5fa",
    ABS: "#f87171",
    TPU: "#c084fc",
    ASA: "#fb923c",
    PA: "#2dd4bf",
    PC: "#a3a3a3",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("printJobs.title")} - Usage Statistics
            </CardTitle>
            <CardDescription>
              Track your printing habits and costs
            </CardDescription>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 border">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Printer className="h-4 w-4" />
              <span className="text-sm font-medium">{t("printJobs.totalPrintJobs")}</span>
            </div>
            <div className="text-3xl font-bold mt-2">{stats.totalPrintJobs}</div>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 border">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Weight className="h-4 w-4" />
              <span className="text-sm font-medium">{t("printJobs.totalGramsUsed")}</span>
            </div>
            <div className="text-3xl font-bold mt-2">{stats.totalGramsUsed}g</div>
            <div className="text-xs text-muted-foreground">
              {(stats.totalGramsUsed / 1000).toFixed(2)} kg
            </div>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/10 to-amber-500/5 border">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm font-medium">{t("printJobs.totalCost")}</span>
            </div>
            <div className="text-3xl font-bold mt-2">{formatPrice(stats.totalCost)}</div>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-500/5 border">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">{t("printJobs.totalPrintTime")}</span>
            </div>
            <div className="text-3xl font-bold mt-2">{stats.totalPrintTimeHours}h</div>
            <div className="text-xs text-muted-foreground">
              {Math.floor(stats.totalPrintTimeMinutes / 60)}h {stats.totalPrintTimeMinutes % 60}m
            </div>
          </div>
        </div>

        {/* Averages */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("printJobs.averagePerPrint")}</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between">
                <span>Weight:</span>
                <span className="font-medium">{stats.averageGramsPerPrint}g</span>
              </div>
              <div className="flex justify-between">
                <span>Cost:</span>
                <span className="font-medium">{formatPrice(stats.averageCostPerPrint)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("printJobs.usageByMaterial")}</span>
              <Badge variant="secondary">{Object.keys(stats.materialUsage).length} types</Badge>
            </div>
            <div className="mt-2 space-y-2">
              {materialPercentages.slice(0, 3).map(({ name, weight, percentage }) => (
                <div key={name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span className="text-muted-foreground">{weight}g ({percentage.toFixed(0)}%)</span>
                  </div>
                  <Progress 
                    value={percentage} 
                    className="h-1.5"
                    style={{
                      // @ts-ignore
                      "--progress-background": materialColors[name] || "#888",
                    }}
                  />
                </div>
              ))}
              {materialPercentages.length > 3 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{materialPercentages.length - 3} more materials
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Material Breakdown */}
        {materialPercentages.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">{t("printJobs.usageByMaterial")}</h4>
            <div className="flex gap-2 flex-wrap">
              {materialPercentages.map(({ name, weight }) => (
                <Badge 
                  key={name} 
                  variant="outline"
                  className="px-3 py-1"
                  style={{
                    borderColor: materialColors[name] || "#888",
                    backgroundColor: `${materialColors[name] || "#888"}20`,
                  }}
                >
                  <span 
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: materialColors[name] || "#888" }}
                  />
                  {name}: {weight}g
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
