import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/i18n";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, Calendar, Printer } from "lucide-react";
import type { FilamentHistory } from "@shared/schema";

interface FilamentHistoryChartProps {
  filamentId: number;
  filamentName?: string;
}

interface HistoryEntry extends FilamentHistory {
  printJob?: { id: number; name: string } | null;
}

export function FilamentHistoryChart({ filamentId, filamentName }: FilamentHistoryChartProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("all");

  const { data: history = [], isLoading } = useQuery<HistoryEntry[]>({
    queryKey: [`/api/filaments/${filamentId}/history`],
    enabled: filamentId > 0,
  });

  // Filter by period
  const filteredHistory = history.filter((entry) => {
    if (period === "all") return true;
    const date = new Date(entry.createdAt!);
    const now = new Date();
    const daysAgo = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    
    switch (period) {
      case "7d":
        return daysAgo <= 7;
      case "30d":
        return daysAgo <= 30;
      case "90d":
        return daysAgo <= 90;
      default:
        return true;
    }
  });

  // Prepare chart data
  const chartData = filteredHistory
    .map((entry) => ({
      date: new Date(entry.createdAt!).toLocaleDateString(),
      timestamp: new Date(entry.createdAt!).getTime(),
      remaining: parseFloat(entry.remainingPercentage || "0"),
      changeType: entry.changeType,
      changeAmount: parseFloat(entry.changeAmount || "0"),
      printJobName: entry.printJob?.name,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Calculate statistics
  const totalUsed = filteredHistory.reduce((sum, entry) => {
    const amount = parseFloat(entry.changeAmount || "0");
    return amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);

  const printCount = filteredHistory.filter((e) => e.changeType === "print").length;

  // Predict when spool will be empty
  const currentRemaining = chartData.length > 0 
    ? chartData[chartData.length - 1].remaining 
    : 100;
  
  const avgUsagePerDay = chartData.length > 1
    ? (chartData[0].remaining - currentRemaining) / 
      ((chartData[chartData.length - 1].timestamp - chartData[0].timestamp) / (1000 * 60 * 60 * 24))
    : 0;

  const daysUntilEmpty = avgUsagePerDay > 0 
    ? Math.round(currentRemaining / avgUsagePerDay) 
    : null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-t-2 border-primary rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Usage History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No usage history recorded yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Usage History {filamentName && `- ${filamentName}`}
          </CardTitle>
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
      <CardContent>
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{Math.round(totalUsed)}g</div>
            <div className="text-xs text-muted-foreground">Total Used</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{printCount}</div>
            <div className="text-xs text-muted-foreground">Prints</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">
              {daysUntilEmpty !== null ? `~${daysUntilEmpty}d` : "N/A"}
            </div>
            <div className="text-xs text-muted-foreground">Est. Empty</div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                className="text-muted-foreground"
              />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
                className="text-muted-foreground"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                        <p className="font-medium">{data.date}</p>
                        <p className="text-primary">Remaining: {data.remaining}%</p>
                        {data.changeType === "print" && data.printJobName && (
                          <p className="flex items-center gap-1 text-muted-foreground">
                            <Printer className="h-3 w-3" />
                            {data.printJobName}
                          </p>
                        )}
                        {data.changeAmount !== 0 && (
                          <p className="text-muted-foreground">
                            Change: {data.changeAmount > 0 ? "+" : ""}{data.changeAmount}g
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={20} stroke="red" strokeDasharray="5 5" />
              <Line
                type="stepAfter"
                dataKey="remaining"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Recent events */}
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Recent Activity</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {filteredHistory.slice(-5).reverse().map((entry, i) => (
              <div key={entry.id || i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {entry.changeType}
                  </Badge>
                  {entry.printJob && (
                    <span className="text-muted-foreground">{entry.printJob.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={parseFloat(entry.changeAmount || "0") < 0 ? "text-red-500" : "text-green-500"}>
                    {parseFloat(entry.changeAmount || "0") > 0 ? "+" : ""}
                    {entry.changeAmount}g
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(entry.createdAt!).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
