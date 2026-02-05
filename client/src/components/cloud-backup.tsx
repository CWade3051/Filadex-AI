import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/lib/auth";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Cloud,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Trash2,
  Clock,
  HardDrive,
  AlertCircle,
  Lock,
  Server,
  Globe,
  ChevronDown,
  Settings,
  FolderUp,
  Shield,
} from "lucide-react";

// Provider icons
const GoogleDriveIcon = () => (
  <svg viewBox="0 0 87.3 78" className="h-6 w-6">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
);

const DropboxIcon = () => (
  <svg viewBox="0 0 43.35 40" className="h-6 w-6">
    <path fill="#0061ff" d="M12.87 0L0 8.19l8.8 7.06 12.88-7.95zm17.61 0l-12.87 7.3 12.87 7.95 8.81-7.06zM0 22.31l12.87 8.18 8.81-7.3-12.88-7.94zm30.48 8.18l12.87-8.18-8.81-7.06-12.87 7.94zm-8.8 2.56l-8.81 7.3L8.8 37.8v2.55l12.88-7.95 12.87 7.95v-2.55l-4.07-2.55z" />
  </svg>
);

const OneDriveIcon = () => (
  <svg viewBox="0 0 60.73 36.64" className="h-6 w-6">
    <path fill="#0364b8" d="M37.21 15.07a14.62 14.62 0 0 0-26.79 3A11.59 11.59 0 0 0 11.6 36.64h24.03a10.42 10.42 0 0 0 1.58-20.57z" />
    <path fill="#0078d4" d="M37.21 15.07l-.11.01a14.57 14.57 0 0 0-7.52-5.16 18.23 18.23 0 0 1 21.37 14.02 8.94 8.94 0 0 1 9.78 8.9c0 2.44-.99 4.65-2.58 6.26h-22.3a10.42 10.42 0 0 0 1.36-24.03z" />
    <path fill="#1490df" d="M11.6 36.64a11.59 11.59 0 0 1-.82-23.15 11.51 11.51 0 0 1 5.89-3.96A18.23 18.23 0 0 1 51 23.94a8.9 8.9 0 0 1 7.15 12.7z" />
    <path fill="#28a8ea" d="M35.63 36.64a10.42 10.42 0 0 0 0-20.83h-.06a18.17 18.17 0 0 0-6.6-6.48 11.51 11.51 0 0 0-12.3 3.95 11.59 11.59 0 0 0 .78 23.36z" />
  </svg>
);

interface ExtendedBackupStatus {
  google: { configured: boolean; enabled: boolean; lastBackup: string | null };
  dropbox: { configured: boolean; enabled: boolean; lastBackup: string | null };
  onedrive: { configured: boolean; enabled: boolean; lastBackup: string | null };
  s3: { configured: boolean; enabled: boolean; lastBackup: string | null };
  webdav: { configured: boolean; enabled: boolean; lastBackup: string | null };
}

interface OAuthAvailability {
  google: boolean;
  dropbox: boolean;
  onedrive: boolean;
}

interface S3Config {
  configured: boolean;
  enabled: boolean;
  endpoint: string;
  bucket: string;
  region: string;
  folderPath: string;
  lastBackup: string | null;
}

interface WebDAVConfig {
  configured: boolean;
  enabled: boolean;
  url: string;
  username: string;
  folderPath: string;
  lastBackup: string | null;
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

const OAUTH_PROVIDERS = [
  { id: "google", name: "Google Drive", icon: GoogleDriveIcon },
  { id: "dropbox", name: "Dropbox", icon: DropboxIcon },
  { id: "onedrive", name: "OneDrive", icon: OneDriveIcon },
];

export function CloudBackup({ open, onOpenChange }: CloudBackupProps) {
  const { toast } = useToast();
  const { isAdmin, logout } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  // S3 form state
  const [s3Form, setS3Form] = useState({
    endpoint: "",
    bucket: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
    folderPath: "filadex-backups",
  });
  const [s3Open, setS3Open] = useState(false);

  // WebDAV form state
  const [webdavForm, setWebdavForm] = useState({
    url: "",
    username: "",
    password: "",
    folderPath: "Filadex-Backups",
  });
  const [webdavOpen, setWebdavOpen] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status-extended"] });
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

  // Fetch OAuth availability
  const { data: oauthAvailable } = useQuery<OAuthAvailability>({
    queryKey: ["/api/cloud-backup/oauth-available"],
    enabled: open,
  });

  // Fetch extended status (includes S3 and WebDAV)
  const { data: status, isLoading: statusLoading } = useQuery<ExtendedBackupStatus>({
    queryKey: ["/api/cloud-backup/status-extended"],
    enabled: open,
  });

  // Fetch S3 config
  const { data: s3Config } = useQuery<S3Config>({
    queryKey: ["/api/cloud-backup/s3/config"],
    enabled: open,
  });

  // Fetch WebDAV config
  const { data: webdavConfig } = useQuery<WebDAVConfig>({
    queryKey: ["/api/cloud-backup/webdav/config"],
    enabled: open,
  });

  // Fetch history
  const { data: history = [] } = useQuery<BackupHistoryItem[]>({
    queryKey: ["/api/cloud-backup/history"],
    enabled: open,
  });

  // OAuth Connect mutation
  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await fetch(`/api/cloud-backup/auth/${provider}`, { credentials: "include" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to initiate connection");
      }
      return response.json();
    },
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await fetch(`/api/cloud-backup/${provider}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Failed to disconnect");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status-extended"] });
      toast({ title: "Disconnected", description: "Provider has been disconnected." });
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
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status-extended"] });
    },
  });

  // Backup now mutation
  const backupMutation = useMutation({
    mutationFn: async (provider: string) => {
      const url = provider === "s3" ? "/api/cloud-backup/s3/backup" 
                : provider === "webdav" ? "/api/cloud-backup/webdav/backup"
                : `/api/cloud-backup/${provider}/backup`;
      const response = await fetch(url, { method: "POST", credentials: "include" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Backup failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status-extended"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/s3/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/webdav/config"] });
      toast({ title: "Backup Complete", description: `Backup uploaded successfully (${formatBytes(data.fileSize)})` });
    },
    onError: (error: Error) => {
      toast({ title: "Backup Failed", description: error.message, variant: "destructive" });
    },
  });

  // S3 Configure mutation
  const s3ConfigureMutation = useMutation({
    mutationFn: async (config: typeof s3Form) => {
      const response = await fetch("/api/cloud-backup/s3/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to configure S3");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status-extended"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/s3/config"] });
      toast({ title: "S3 Configured", description: "S3 storage has been configured successfully." });
      setS3Open(false);
    },
    onError: (error: Error) => {
      toast({ title: "Configuration Failed", description: error.message, variant: "destructive" });
    },
  });

  // WebDAV Configure mutation
  const webdavConfigureMutation = useMutation({
    mutationFn: async (config: typeof webdavForm) => {
      const response = await fetch("/api/cloud-backup/webdav/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to configure WebDAV");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/status-extended"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cloud-backup/webdav/config"] });
      toast({ title: "WebDAV Configured", description: "WebDAV storage has been configured successfully." });
      setWebdavOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Configuration Failed", description: error.message, variant: "destructive" });
    },
  });

  // Restore mutation (handles ZIP file uploads)
  const restoreMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/cloud-backup/restore-zip", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Restore failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      const parts = [];
      if (data.restored.filaments) parts.push(`${data.restored.filaments} filaments`);
      if (data.restored.printJobs) parts.push(`${data.restored.printJobs} print jobs`);
      if (data.restored.slicerProfiles) parts.push(`${data.restored.slicerProfiles} profiles`);
      if (data.restored.filamentHistory) parts.push(`${data.restored.filamentHistory} history entries`);
      if (data.restored.userSharing) parts.push(`${data.restored.userSharing} sharing settings`);
      if (data.restored.materialCompatibility) parts.push(`${data.restored.materialCompatibility} compatibility entries`);
      if (data.restored.images) parts.push(`${data.restored.images} images`);
      if (data.restored.userSettings) parts.push("user settings");
      toast({
        title: "Restore Complete",
        description: parts.length > 0 ? `Restored ${parts.join(", ")}. Please log in again.` : "No new data to restore.",
        duration: 5000,
      });
      // Close dialog and force re-login to ensure session is valid
      onOpenChange(false);
      setTimeout(() => {
        logout();
        window.location.href = "/login";
      }, 1500);
    },
    onError: (error: Error) => {
      toast({ title: "Restore Failed", description: error.message, variant: "destructive" });
    },
  });

  // Admin restore mutation (handles ZIP file uploads)
  const adminRestoreMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/cloud-backup/admin/restore-zip", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Admin restore failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      const parts = [];
      if (data.restored.users) parts.push(`${data.restored.users} new users`);
      if (data.restored.filaments) parts.push(`${data.restored.filaments} filaments`);
      if (data.restored.printJobs) parts.push(`${data.restored.printJobs} print jobs`);
      if (data.restored.slicerProfiles) parts.push(`${data.restored.slicerProfiles} profiles`);
      if (data.restored.filamentHistory) parts.push(`${data.restored.filamentHistory} history entries`);
      if (data.restored.userSharing) parts.push(`${data.restored.userSharing} sharing settings`);
      if (data.restored.materialCompatibility) parts.push(`${data.restored.materialCompatibility} compatibility entries`);
      if (data.restored.images) parts.push(`${data.restored.images} images`);
      toast({
        title: "Admin Restore Complete",
        description: parts.length > 0 ? `Restored ${parts.join(", ")}. ${data.note || ""} Please log in again.` : "No new data to restore.",
        duration: 5000,
      });
      // Close dialog and force re-login to ensure session is valid with restored user data
      onOpenChange(false);
      setTimeout(() => {
        logout();
        window.location.href = "/login";
      }, 1500);
    },
    onError: (error: Error) => {
      toast({ title: "Admin Restore Failed", description: error.message, variant: "destructive" });
    },
  });

  // Download local backup
  const handleDownloadLocal = async () => {
    try {
      const response = await fetch("/api/cloud-backup/download", { credentials: "include" });
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `filadex-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Download Complete", description: "Your backup has been downloaded." });
    } catch (error) {
      toast({ title: "Download Failed", description: "Failed to download backup.", variant: "destructive" });
    }
  };

  // Handle file upload for restore (ZIP file)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast({
        title: "Invalid File",
        description: "Please upload a .zip backup file",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const formData = new FormData();
    formData.append("backup", file);
    restoreMutation.mutate(formData);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Download admin full backup
  const handleDownloadAdminBackup = async () => {
    try {
      const response = await fetch("/api/cloud-backup/admin/download", { credentials: "include" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `filadex-admin-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Admin Backup Complete", description: "Full system backup has been downloaded." });
    } catch (error: any) {
      toast({ title: "Download Failed", description: error.message || "Failed to download admin backup.", variant: "destructive" });
    }
  };

  // Handle admin file upload for restore (ZIP file)
  const handleAdminFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast({
        title: "Invalid File",
        description: "Please upload a .zip backup file",
        variant: "destructive",
      });
      if (adminFileInputRef.current) {
        adminFileInputRef.current.value = "";
      }
      return;
    }

    const formData = new FormData();
    formData.append("backup", file);
    adminRestoreMutation.mutate(formData);

    // Reset file input
    if (adminFileInputRef.current) {
      adminFileInputRef.current.value = "";
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
      <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Cloud Backup
          </DialogTitle>
          <DialogDescription>
            Backup and restore your filament data
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 pr-2 sm:pr-4">
            {/* Local Backup & Admin Backup - Side by side on desktop */}
            <div className={`grid gap-4 ${isAdmin ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              {/* Local Backup & Restore */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Local Backup
                  </CardTitle>
                  <CardDescription>Download or restore from a local backup file</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Button onClick={handleDownloadLocal} variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Backup
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleFileUpload}
                    className="hidden"
                    aria-label="Upload backup file"
                  />
                  <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    variant="outline"
                    disabled={restoreMutation.isPending}
                    className="w-full"
                  >
                    {restoreMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FolderUp className="h-4 w-4 mr-2" />
                    )}
                    Restore from File
                  </Button>
                </CardContent>
              </Card>

              {/* Admin Full Backup (only visible to admins) */}
              {isAdmin && (
                <Card className="border-amber-500/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-4 w-4 text-amber-500" />
                      Admin Full Backup
                    </CardTitle>
                    <CardDescription>
                      Backup/restore ALL users' data. New users created with password "changeme"
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Button onClick={handleDownloadAdminBackup} variant="outline" className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Download Full Backup
                    </Button>
                    <input
                      ref={adminFileInputRef}
                      type="file"
                      accept=".zip"
                      onChange={handleAdminFileUpload}
                      className="hidden"
                      aria-label="Upload admin backup file"
                    />
                    <Button 
                      onClick={() => adminFileInputRef.current?.click()} 
                      variant="outline"
                      disabled={adminRestoreMutation.isPending}
                      className="w-full"
                    >
                      {adminRestoreMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FolderUp className="h-4 w-4 mr-2" />
                      )}
                      Restore Full Backup
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* S3 and WebDAV - Side by side on desktop */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* S3-Compatible Storage */}
              <Card>
                <Collapsible open={s3Open} onOpenChange={setS3Open}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        <div>
                          <CardTitle className="text-base">S3-Compatible Storage</CardTitle>
                          <CardDescription className="text-xs">AWS S3, Backblaze B2, Wasabi, MinIO</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s3Config?.configured && (
                          <>
                            <Badge variant="default" className="hidden sm:flex">
                              <CheckCircle className="h-3 w-3 mr-1" /> Connected
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => backupMutation.mutate("s3")}
                              disabled={backupMutation.isPending}
                            >
                              {backupMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4 mr-1" />
                            <ChevronDown className={`h-4 w-4 transition-transform ${s3Open ? "rotate-180" : ""}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    {s3Config?.configured && s3Config.lastBackup && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        Last backup: {formatDate(s3Config.lastBackup)}
                      </div>
                    )}
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Endpoint URL</Label>
                          <Input
                            placeholder="https://s3.amazonaws.com"
                            value={s3Form.endpoint}
                            onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Bucket Name</Label>
                          <Input
                            placeholder="my-bucket"
                            value={s3Form.bucket}
                            onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Region (optional)</Label>
                          <Input
                            placeholder="us-east-1"
                            value={s3Form.region}
                            onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Folder Path</Label>
                          <Input
                            placeholder="filadex-backups"
                            value={s3Form.folderPath}
                            onChange={(e) => setS3Form({ ...s3Form, folderPath: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Access Key ID</Label>
                          <Input
                            type="password"
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            value={s3Form.accessKeyId}
                            onChange={(e) => setS3Form({ ...s3Form, accessKeyId: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Secret Access Key</Label>
                          <Input
                            type="password"
                            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                            value={s3Form.secretAccessKey}
                            onChange={(e) => setS3Form({ ...s3Form, secretAccessKey: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={() => s3ConfigureMutation.mutate(s3Form)}
                        disabled={s3ConfigureMutation.isPending || !s3Form.endpoint || !s3Form.bucket || !s3Form.accessKeyId || !s3Form.secretAccessKey}
                        className="w-full"
                      >
                        {s3ConfigureMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Save S3 Configuration
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              {/* WebDAV Storage */}
              <Card>
                <Collapsible open={webdavOpen} onOpenChange={setWebdavOpen}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        <div>
                          <CardTitle className="text-base">WebDAV Storage</CardTitle>
                          <CardDescription className="text-xs">Nextcloud, ownCloud, Synology, etc.</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {webdavConfig?.configured && (
                          <>
                            <Badge variant="default" className="hidden sm:flex">
                              <CheckCircle className="h-3 w-3 mr-1" /> Connected
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => backupMutation.mutate("webdav")}
                              disabled={backupMutation.isPending}
                            >
                              {backupMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4 mr-1" />
                            <ChevronDown className={`h-4 w-4 transition-transform ${webdavOpen ? "rotate-180" : ""}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    {webdavConfig?.configured && webdavConfig.lastBackup && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        Last backup: {formatDate(webdavConfig.lastBackup)}
                      </div>
                    )}
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-3 pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <Label className="text-xs">WebDAV URL</Label>
                          <Input
                            placeholder="https://nextcloud.example.com/remote.php/dav/files/username/"
                            value={webdavForm.url}
                            onChange={(e) => setWebdavForm({ ...webdavForm, url: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Username</Label>
                          <Input
                            placeholder="username"
                            value={webdavForm.username}
                            onChange={(e) => setWebdavForm({ ...webdavForm, username: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Password / App Token</Label>
                          <Input
                            type="password"
                            placeholder="password or app token"
                            value={webdavForm.password}
                            onChange={(e) => setWebdavForm({ ...webdavForm, password: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Folder Path</Label>
                          <Input
                            placeholder="Filadex-Backups"
                            value={webdavForm.folderPath}
                            onChange={(e) => setWebdavForm({ ...webdavForm, folderPath: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={() => webdavConfigureMutation.mutate(webdavForm)}
                        disabled={webdavConfigureMutation.isPending || !webdavForm.url || !webdavForm.username || !webdavForm.password}
                        className="w-full"
                      >
                        {webdavConfigureMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Save WebDAV Configuration
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </div>

            {/* OAuth Cloud Providers */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground">OAuth Cloud Providers (requires setup)</h3>

              {statusLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <TooltipProvider>
                  <div className="space-y-3">
                    {OAUTH_PROVIDERS.map((provider) => {
                      const providerStatus = status?.[provider.id as keyof ExtendedBackupStatus];
                      const isOAuthAvailable = oauthAvailable?.[provider.id as keyof OAuthAvailability];
                      const isConnected = providerStatus?.configured;
                      const isEnabled = providerStatus?.enabled;
                      const Icon = provider.icon;

                      return (
                        <Card key={provider.id} className="opacity-80">
                          <CardContent className="py-4 px-4">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <Icon />
                                <div className="min-w-0">
                                  <div className="font-medium flex items-center gap-2 flex-wrap">
                                    {provider.name}
                                    {!isOAuthAvailable && !isConnected && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge variant="outline" className="text-xs cursor-help">
                                            <Lock className="h-3 w-3 mr-1" />
                                            Setup Required
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          <p className="font-medium mb-1">OAuth credentials not configured</p>
                                          <p className="text-xs text-muted-foreground">
                                            Set {provider.id.toUpperCase()}_CLIENT_ID and {provider.id.toUpperCase()}_CLIENT_SECRET in your environment.
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                  {isConnected && providerStatus?.lastBackup && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      Last: {formatDate(providerStatus.lastBackup)}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isConnected ? (
                                  <>
                                    <Badge variant={isEnabled ? "default" : "secondary"} className="text-xs">
                                      {isEnabled ? <><CheckCircle className="h-3 w-3 mr-1" /> Active</> : <><XCircle className="h-3 w-3 mr-1" /> Paused</>}
                                    </Badge>
                                    <Switch checked={isEnabled} onCheckedChange={(checked) => toggleMutation.mutate({ provider: provider.id, enabled: checked })} />
                                    <Button variant="outline" size="sm" onClick={() => backupMutation.mutate(provider.id)} disabled={backupMutation.isPending}>
                                      {backupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => disconnectMutation.mutate(provider.id)}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                ) : isOAuthAvailable ? (
                                  <Button variant="outline" size="sm" onClick={() => connectMutation.mutate(provider.id)} disabled={connectMutation.isPending}>
                                    {connectMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                                    Connect
                                  </Button>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" disabled>
                                        <Lock className="h-4 w-4 mr-1" />
                                        Connect
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Configure OAuth credentials to enable</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TooltipProvider>
              )}
            </div>

            {/* Backup history */}
            {history.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Recent Backups</h3>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {history.slice(-6).reverse().map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded border text-sm">
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
                          <Badge variant="outline" className="text-xs">{formatBytes(item.fileSize)}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(item.startedAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
