import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Database, Image, FileText, Users, Trash2, Cloud, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface FactoryResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCloudBackup: () => void;
}

interface SystemInfo {
  database: {
    users: number;
    filaments: number;
    printJobs: number;
  };
  files: {
    images: number;
    slicerProfiles: number;
  };
  environment: {
    isDocker: boolean;
    nodeEnv: string;
  };
}

export function FactoryResetModal({ isOpen, onClose, onOpenCloudBackup }: FactoryResetModalProps) {
  const [confirmation, setConfirmation] = useState("");
  const [step, setStep] = useState<"warning" | "confirm">("warning");
  const { logout } = useAuth();

  // Fetch system info to show what will be deleted
  const { data: systemInfo, isLoading: loadingInfo } = useQuery({
    queryKey: ["/api/admin/system-info"],
    queryFn: () => apiRequest<SystemInfo>("/api/admin/system-info"),
    enabled: isOpen,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{
        success: boolean;
        message: string;
        defaultCredentials: {
          username: string;
          password: string;
          note: string;
        };
      }>("/api/admin/factory-reset", {
        method: "POST",
        body: JSON.stringify({ confirmation }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Factory Reset Complete",
        description: `${data.message} Default login: ${data.defaultCredentials.username} / ${data.defaultCredentials.password}`,
        duration: 10000,
      });
      // Close modal and logout
      onClose();
      setTimeout(() => {
        logout();
        window.location.href = "/login";
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: "Factory Reset Failed",
        description: error.message || "An error occurred during reset",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setConfirmation("");
    setStep("warning");
    onClose();
  };

  const handleProceed = () => {
    setStep("confirm");
  };

  const handleReset = () => {
    if (confirmation !== "RESET ALL DATA") {
      toast({
        title: "Invalid Confirmation",
        description: "You must type 'RESET ALL DATA' exactly to proceed.",
        variant: "destructive",
      });
      return;
    }
    resetMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Factory Reset
          </DialogTitle>
          <DialogDescription>
            This will permanently delete ALL data and restore default settings.
          </DialogDescription>
        </DialogHeader>

        {step === "warning" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Danger Zone</AlertTitle>
              <AlertDescription>
                This action is <strong>irreversible</strong>. All your data will be permanently deleted.
                Make sure you have a backup before proceeding.
              </AlertDescription>
            </Alert>

            {/* Backup Suggestion */}
            <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10">
              <div className="flex items-start gap-3">
                <Download className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Create a backup first!</p>
                  <p className="text-xs text-muted-foreground">
                    Before resetting, download a local backup so you can restore your data if needed.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-500/50 hover:bg-blue-500/20"
                    onClick={() => {
                      onClose();
                      onOpenCloudBackup();
                    }}
                  >
                    <Cloud className="mr-2 h-4 w-4" />
                    Go to Cloud Backup
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">The following will be deleted:</h4>
              
              {loadingInfo ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading system info...
                </div>
              ) : systemInfo ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 p-2 rounded bg-muted">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{systemInfo.database.users} Users</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span>{systemInfo.database.filaments} Filaments</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{systemInfo.database.printJobs} Print Jobs</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted">
                    <Image className="h-4 w-4 text-muted-foreground" />
                    <span>{systemInfo.files.images} Images</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted col-span-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{systemInfo.files.slicerProfiles} Slicer Profiles</span>
                  </div>
                </div>
              ) : null}

              <p className="text-sm text-muted-foreground">
                Plus: All material compatibility data, filament history, backup configs, colors, 
                materials, manufacturers, storage locations, and user settings.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">After reset:</h4>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Default admin account will be created (admin / admin123)</li>
                <li>Default materials, colors, and storage locations will be restored</li>
                <li>You will be logged out and redirected to login</li>
              </ul>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Final Confirmation Required</AlertTitle>
              <AlertDescription>
                Type <strong className="font-mono">RESET ALL DATA</strong> below to confirm the factory reset.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="confirmation">Type "RESET ALL DATA" to confirm</Label>
              <Input
                id="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="RESET ALL DATA"
                className="font-mono"
                autoComplete="off"
                autoFocus
              />
              {confirmation && confirmation !== "RESET ALL DATA" && (
                <p className="text-sm text-destructive">
                  Text does not match. Please type exactly: RESET ALL DATA
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={resetMutation.isPending}>
            Cancel
          </Button>
          
          {step === "warning" && (
            <Button variant="destructive" onClick={handleProceed}>
              I Understand, Continue
            </Button>
          )}
          
          {step === "confirm" && (
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={confirmation !== "RESET ALL DATA" || resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Factory Reset
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
