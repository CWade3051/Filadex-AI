import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Cloud,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Trash2,
  RefreshCw,
  Clock,
  HardDrive,
  AlertCircle,
} from "lucide-react";

// Provider icons (simplified SVG representations)
const GoogleDriveIcon = () => (
  <svg viewBox="0 0 87.3 78" className="h-6 w-6">
    <path
      d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
      fill="#0066da"
    />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
    <path
      d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
      fill="#ea4335"
    />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path
      d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
      fill="#2684fc"
    />
    <path
      d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
      fill="#ffba00"
    />
  </svg>
);

const DropboxIcon = () => (
  <svg viewBox="0 0 43.35 40" className="h-6 w-6">
    <path
      fill="#0061ff"
      d="M12.87 0L0 8.19l8.8 7.06 12.88-7.95zm17.61 0l-12.87 7.3 12.87 7.95 8.81-7.06zM0 22.31l12.87 8.18 8.81-7.3-12.88-7.94zm30.48 8.18l12.87-8.18-8.81-7.06-12.87 7.94zm-8.8 2.56l-8.81 7.3L8.8 37.8v2.55l12.88-7.95 12.87 7.95v-2.55l-4.07-2.55z"
    />
  </svg>
);

const OneDriveIcon = () => (
  <svg viewBox="0 0 60.73 36.64" className="h-6 w-6">
    <path
      fill="#0364b8"
      d="M37.21 15.07a14.62 14.62 0 0 0-26.79 3A11.59 11.59 0 0 0 11.6 36.64h24.03a10.42 10.42 0 0 0 1.58-20.57z"
    />
    <path
      fill="#0078d4"
      d="M37.21 15.07l-.11.01a14.57 14.57 0 0 0-7.52-5.16 18.23 18.23 0 0 1 21.37 14.02 8.94 8.94 0 0 1 9.78 8.9c0 2.44-.99 4.65-2.58 6.26h-22.3a10.42 10.42 0 0 0 1.36-24.03z"
    />
    <path
      fill="#1490df"
      d="M11.6 36.64a11.59 11.59 0 0 1-.82-23.15 11.51 11.51 0 0 1 5.89-3.96A18.23 18.23 0 0 1 51 23.94a8.9 8.9 0 0 1 7.15 12.7z"
    />
    <path
      fill="#28a8ea"
      d="M35.63 36.64a10.42 10.42 0 0 0 0-20.83h-.06a18.17 18.17 0 0 0-6.6-6.48 11.51 11.51 0 0 0-12.3 3.95 11.59 11.59 0 0 0 .78 23.36z"
    />
  </svg>
);

interface CloudBackupStatus {
  google: { configured: boolean; enabled: boolean; lastBackup: string | null };
  dropbox: { configured: boolean; enabled: boolean; lastBackup: string | null };
  onedrive: { configured: boolean; enabled: boolean; lastBackup: string | null };
}

interface BackupHistoryItem {
  id: number;
  provider: string;
  status: string;
  fileSize: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface CloudBackupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROVIDERS = [
  { id: "google", name: "Google Drive", icon: GoogleDriveIcon },
  { id: "dropbox", name: "Dropbox", icon: DropboxIcon },
  { id: "onedrive", name: "OneDrive", icon: OneDriveIcon },
];

export function CloudBackup({ open, onOpenChange }: CloudBackupProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check URL params for OAuth callback results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cloudSuccess = params.get("cloud_success");
    const cloudError = params.get("cloud_error");

    if (cloudSuccess) {
      toast({
        title: "Connected Successfully",
        description: `${cloudSuccess} has been connected for cloud backups.`,
      });
      window.history.replaceState({}, "", window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status"] });
    }

    if (cloudError) {
      toast({
        title: "Connection Failed",
        description: `Failed to connect: ${cloudError}`,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Fetch status
  const { data: status, isLoading: statusLoading } = useQuery<CloudBackupStatus>({
    queryKey: ["/api/cloud-backup/status"],
    enabled: open,
  });

  // Fetch history
  const { data: history = [] } = useQuery<BackupHistoryItem[]>({
    queryKey: ["/api/cloud-backup/history"],
    enabled: open,
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await fetch(`/api/cloud-backup/auth/${provider}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to initiate connection");
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Redirect to OAuth URL
      window.location.href = data.authUrl;
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await fetch(`/api/cloud-backup/${provider}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to disconnect");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status"] });
      toast({
        title: "Disconnected",
        description: "Provider has been disconnected.",
      });
    },
  });

  // Toggle backup mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ provider, enabled }: { provider: string; enabled: boolean }) => {
      const response = await fetch(`/api/cloud-backup/${provider}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error("Failed to toggle");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status"] });
    },
  });

  // Backup now mutation
  const backupMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await fetch(`/api/cloud-backup/${provider}/backup`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Backup failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/history"] });
      toast({
        title: "Backup Complete",
        description: `Backup uploaded successfully (${formatBytes(data.fileSize)})`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Backup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Download local backup
  const handleDownloadLocal = async () => {
    try {
      const response = await fetch("/api/cloud-backup/download", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `filadex-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download Complete",
        description: "Your backup has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download backup.",
        variant: "destructive",
      });
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Cloud Backup
          </DialogTitle>
          <DialogDescription>
            Automatically backup your filament data to cloud storage
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Local backup always available */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Local Backup
                </CardTitle>
                <CardDescription>Download a backup file to your computer</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleDownloadLocal} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Backup
                </Button>
              </CardContent>
            </Card>

            {/* Cloud providers */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm">Cloud Storage Providers</h3>

              {statusLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                PROVIDERS.map((provider) => {
                  const providerStatus = status?.[provider.id as keyof CloudBackupStatus];
                  const isConnected = providerStatus?.configured;
                  const isEnabled = providerStatus?.enabled;
                  const Icon = provider.icon;

                  return (
                    <Card key={provider.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Icon />
                            <div>
                              <div className="font-medium">{provider.name}</div>
                              {isConnected && providerStatus?.lastBackup && (
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Last backup: {formatDate(providerStatus.lastBackup)}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isConnected ? (
                              <>
                                <Badge variant={isEnabled ? "default" : "secondary"}>
                                  {isEnabled ? (
                                    <>
                                      <CheckCircle className="h-3 w-3 mr-1" /> Active
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3 mr-1" /> Paused
                                    </>
                                  )}
                                </Badge>

                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={(checked) =>
                                    toggleMutation.mutate({
                                      provider: provider.id,
                                      enabled: checked,
                                    })
                                  }
                                />

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => backupMutation.mutate(provider.id)}
                                  disabled={backupMutation.isPending}
                                >
                                  {backupMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4" />
                                  )}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => disconnectMutation.mutate(provider.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => connectMutation.mutate(provider.id)}
                                disabled={connectMutation.isPending}
                              >
                                {connectMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                )}
                                Connect
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="text-muted-foreground">
                  <p className="font-medium">OAuth Configuration Required</p>
                  <p>
                    To use cloud backup, you need to configure OAuth credentials for each provider
                    in your environment variables (e.g., GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).
                  </p>
                </div>
              </div>
            </div>

            {/* Backup history */}
            {history.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Recent Backups</h3>
                <div className="space-y-2">
                  {history.slice(-5).reverse().map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded border text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {item.status === "completed" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : item.status === "failed" ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        <span className="capitalize">{item.provider}</span>
                        {item.fileSize && (
                          <Badge variant="outline" className="text-xs">
                            {formatBytes(item.fileSize)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(item.startedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
