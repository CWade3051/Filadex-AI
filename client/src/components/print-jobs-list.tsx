import { useState } from "react";
import { useTranslation } from "@/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Printer,
  Edit,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Scale,
} from "lucide-react";
import { PrintJobModal } from "./print-job-modal";
import type { PrintJob, Filament } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PrintJobWithDetails extends PrintJob {
  parsedFilamentUsages?: {
    filamentId: number;
    gramsUsed: number;
    metersUsed?: number;
  }[];
  estimatedCost?: number;
}

interface PrintJobsListProps {
  open: boolean;
  onClose: () => void;
}

export function PrintJobsList({ open, onClose }: PrintJobsListProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingJob, setEditingJob] = useState<PrintJob | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<number | null>(null);

  // Fetch print jobs
  const { data: printJobs = [], isLoading } = useQuery<PrintJobWithDetails[]>({
    queryKey: ["/api/print-jobs"],
    enabled: open,
  });

  // Fetch filaments for display
  const { data: filaments = [] } = useQuery<Filament[]>({
    queryKey: ["/api/filaments"],
    enabled: open,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/print-jobs/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      toast({
        title: t("common.success"),
        description: t("printJobs.deleteSuccess"),
      });
      setDeleteJobId(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("printJobs.deleteError"),
      });
    },
  });

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500">{t("printJobs.completed")}</Badge>;
      case "failed":
        return <Badge variant="destructive">{t("printJobs.failed")}</Badge>;
      case "cancelled":
        return <Badge variant="secondary">{t("printJobs.cancelled")}</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getFilamentNames = (job: PrintJobWithDetails) => {
    if (!job.parsedFilamentUsages || job.parsedFilamentUsages.length === 0) {
      return "-";
    }
    return job.parsedFilamentUsages.map((usage) => {
      const filament = filaments.find((f) => f.id === usage.filamentId);
      return filament ? `${filament.name} (${usage.gramsUsed}g)` : `ID ${usage.filamentId}`;
    }).join(", ");
  };

  const getTotalGrams = (job: PrintJobWithDetails) => {
    if (!job.parsedFilamentUsages || job.parsedFilamentUsages.length === 0) {
      return null;
    }
    return job.parsedFilamentUsages.reduce((acc, u) => acc + u.gramsUsed, 0);
  };

  const handleEdit = (job: PrintJob) => {
    setEditingJob(job);
    setEditModalOpen(true);
  };

  const handleDelete = (id: number) => {
    setDeleteJobId(id);
  };

  const confirmDelete = () => {
    if (deleteJobId) {
      deleteMutation.mutate(deleteJobId);
    }
  };

  // Sort by date, newest first
  const sortedJobs = [...printJobs].sort((a, b) => {
    const dateA = a.printCompletedAt || a.createdAt || new Date(0);
    const dateB = b.printCompletedAt || b.createdAt || new Date(0);
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              {t("printJobs.printHistory")}
            </DialogTitle>
            <DialogDescription>
              {t("printJobs.printHistoryDescription")}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[60vh]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : sortedJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Printer className="h-12 w-12 mb-4 opacity-50" />
                <p>{t("printJobs.noPrintJobs")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">{t("printJobs.status")}</TableHead>
                    <TableHead>{t("printJobs.name")}</TableHead>
                    <TableHead>{t("printJobs.printer")}</TableHead>
                    <TableHead>{t("printJobs.filamentUsed")}</TableHead>
                    <TableHead className="text-right">
                      <Scale className="h-4 w-4 inline-block mr-1" />
                      {t("printJobs.weight")}
                    </TableHead>
                    <TableHead>
                      <Clock className="h-4 w-4 inline-block mr-1" />
                      {t("printJobs.duration")}
                    </TableHead>
                    <TableHead>
                      <Calendar className="h-4 w-4 inline-block mr-1" />
                      {t("printJobs.date")}
                    </TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedJobs.map((job) => {
                    const totalGrams = getTotalGrams(job);
                    return (
                      <TableRow key={job.id}>
                        <TableCell>
                          {getStatusIcon(job.status)}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{job.name}</span>
                            {job.slicerUsed && (
                              <span className="text-xs text-muted-foreground">
                                via {job.slicerUsed}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{job.printerUsed || "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={getFilamentNames(job)}>
                          {job.parsedFilamentUsages && job.parsedFilamentUsages.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {job.parsedFilamentUsages.slice(0, 2).map((usage, idx) => {
                                const filament = filaments.find((f) => f.id === usage.filamentId);
                                return (
                                  <div key={idx} className="flex items-center gap-1">
                                    {filament && (
                                      <span
                                        className="w-3 h-3 rounded-full border"
                                        style={{ backgroundColor: filament.colorCode || "#ccc" }}
                                      />
                                    )}
                                    <span className="text-xs">{usage.gramsUsed}g</span>
                                  </div>
                                );
                              })}
                              {job.parsedFilamentUsages.length > 2 && (
                                <span className="text-xs text-muted-foreground">
                                  +{job.parsedFilamentUsages.length - 2} more
                                </span>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {totalGrams ? `${totalGrams}g` : job.estimatedWeight ? `~${job.estimatedWeight}g` : "-"}
                        </TableCell>
                        <TableCell>
                          {formatDuration(job.actualDuration || job.estimatedDuration)}
                        </TableCell>
                        <TableCell>
                          {formatDate(job.printCompletedAt || job.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(job)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(job.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          {/* Summary Stats */}
          {sortedJobs.length > 0 && (
            <div className="flex gap-4 pt-4 border-t text-sm text-muted-foreground">
              <span>
                {t("printJobs.totalJobs")}: <strong className="text-foreground">{sortedJobs.length}</strong>
              </span>
              <span>
                {t("printJobs.completed")}: <strong className="text-green-500">{sortedJobs.filter(j => j.status === "completed").length}</strong>
              </span>
              <span>
                {t("printJobs.failed")}: <strong className="text-red-500">{sortedJobs.filter(j => j.status === "failed").length}</strong>
              </span>
              <span>
                {t("printJobs.totalGrams")}: <strong className="text-foreground">
                  {sortedJobs.reduce((acc, j) => acc + (getTotalGrams(j) || 0), 0)}g
                </strong>
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <PrintJobModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingJob(null);
        }}
        printJob={editingJob}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteJobId !== null} onOpenChange={() => setDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("printJobs.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("printJobs.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
