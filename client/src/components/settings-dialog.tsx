import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FilamentImportExport } from "./filament-import-export";
import {
  ManufacturersList,
  MaterialsList,
  ColorsList,
  DiametersList,
  StorageLocationsList,
  PrintersList,
  SlicersList,
  UnitsSettings,
  SettingsApiKey
} from "./settings";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, LogOut, Database } from "lucide-react";
import { Filament } from "@shared/schema";
import { useTranslation } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import type { Manufacturer, Material, Color, Diameter, StorageLocation } from "./settings/settings-types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: string;
}

export function SettingsDialog({ open, onOpenChange, initialTab }: SettingsDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(initialTab || "manufacturers");
  const { toast } = useToast();
  
  // Update active tab when initialTab prop changes
  useEffect(() => {
    if (initialTab && open) {
      setActiveTab(initialTab);
    }
  }, [initialTab, open]);
  const { t } = useTranslation();

  // Clear all local storage data
  const handleClearLocalData = () => {
    try {
      // Get all localStorage keys that belong to filadex
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('filadex') || key.startsWith('tanstack'))) {
          keysToRemove.push(key);
        }
      }
      
      // Remove each key
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Also clear query cache
      queryClient.clear();
      
      toast({
        title: "Local Data Cleared",
        description: `Cleared ${keysToRemove.length} cached items. Refreshing page...`,
      });
      
      // Refresh the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear local data",
        variant: "destructive",
      });
    }
  };

  // Log out and clear everything
  const handleLogoutAndClear = async () => {
    try {
      // Clear all localStorage
      localStorage.clear();
      
      // Clear query cache
      queryClient.clear();
      
      // Call logout API
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      
      toast({
        title: "Logged Out",
        description: "All data cleared. Redirecting to login...",
      });
      
      // Redirect to login
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
    } catch (error) {
      // Even if API fails, clear local data and redirect
      localStorage.clear();
      window.location.href = '/login';
    }
  };
  const { data: filaments = [] } = useQuery({
    queryKey: ["/api/filaments"],
    queryFn: () => apiRequest<Filament[]>("/api/filaments")
  });

  // Synchronisiere die Listen mit den vorhandenen Filament-Daten
  // Automatische Initialisierung wurde deaktiviert, um unerwünschtes Daten-Recycling zu verhindern
  useEffect(() => {
    // Aktualisiere die Daten
    queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
    queryClient.invalidateQueries({ queryKey: ["/api/colors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/diameters"] });
    queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
  }, [filaments, queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
        className="max-w-[96vw] sm:max-w-[92vw] md:max-w-[88vw] lg:max-w-6xl xl:max-w-7xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 m-2 sm:m-4"
        aria-describedby="settings-description"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription id="settings-description">
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manufacturers" value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="px-4 sm:px-6 pb-3 flex-shrink-0 overflow-x-auto overflow-y-hidden -mx-4 sm:-mx-6 scrollbar-hide">
            <div className="min-w-max inline-block px-4 sm:px-6">
              <TabsList className="mb-0 w-full inline-flex min-w-max p-0.5">
                <TabsTrigger value="manufacturers" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.manufacturers.title')}</TabsTrigger>
                <TabsTrigger value="materials" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.materials.title')}</TabsTrigger>
                <TabsTrigger value="colors" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.colors.title')}</TabsTrigger>
                <TabsTrigger value="diameters" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.diameters.title')}</TabsTrigger>
                <TabsTrigger value="storage-locations" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.storageLocations.title')}</TabsTrigger>
                <TabsTrigger value="printers" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.printers.title')}</TabsTrigger>
                <TabsTrigger value="slicers" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.slicers.title')}</TabsTrigger>
                <TabsTrigger value="units" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.units.title')}</TabsTrigger>
                <TabsTrigger value="ai" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('apiKey.title')}</TabsTrigger>
                <TabsTrigger value="filament-import-export" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5">{t('settings.filamentImportExport.title')}</TabsTrigger>
                <TabsTrigger value="data" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0 px-2 sm:px-2.5 mr-2 sm:mr-3">
                  <Database className="h-4 w-4 mr-1" />
                  Data
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6">

          <TabsContent value="manufacturers">
            <ManufacturersList />
          </TabsContent>

          <TabsContent value="materials">
            <MaterialsList />
          </TabsContent>

          <TabsContent value="colors">
            <ColorsList />
          </TabsContent>

          <TabsContent value="diameters">
            <DiametersList />
          </TabsContent>

          <TabsContent value="storage-locations">
            <StorageLocationsList />
          </TabsContent>

          <TabsContent value="printers">
            <PrintersList />
          </TabsContent>

          <TabsContent value="slicers">
            <SlicersList />
          </TabsContent>

          <TabsContent value="units">
            <UnitsSettings />
          </TabsContent>

          <TabsContent value="ai">
            <SettingsApiKey />
          </TabsContent>

          <TabsContent value="filament-import-export">
            <FilamentImportExport title={t('settings.filamentImportExport.title')} />
          </TabsContent>

          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Management
                </CardTitle>
                <CardDescription>
                  Manage local browser data and session
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Clear Local Data */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-amber-500" />
                        Clear Local Data
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Clears cached data stored in your browser (pending imports, processing state, etc.). 
                        You will remain logged in.
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="ml-4">
                          Clear Cache
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear Local Data?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will clear all cached data including:
                            <ul className="list-disc list-inside mt-2 space-y-1">
                              <li>Pending photo imports</li>
                              <li>Processing state</li>
                              <li>Mobile upload sessions</li>
                              <li>Query cache</li>
                            </ul>
                            <p className="mt-2">The page will refresh after clearing.</p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleClearLocalData}>
                            Clear Data
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Logout and Clear All */}
                <div className="border rounded-lg p-4 border-red-200 dark:border-red-900">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        <LogOut className="h-4 w-4 text-red-500" />
                        Logout & Clear All
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Logs you out and clears ALL browser data. Use this for a completely fresh start.
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="ml-4">
                          Logout & Clear
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Logout and Clear All Data?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will:
                            <ul className="list-disc list-inside mt-2 space-y-1">
                              <li>Log you out of your account</li>
                              <li>Clear ALL local storage data</li>
                              <li>Remove all cached information</li>
                            </ul>
                            <p className="mt-2 font-medium">You will need to log in again.</p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleLogoutAndClear}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Logout & Clear All
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Info about what's stored */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium text-sm mb-2">What data is stored locally?</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• <strong>Mobile upload sessions</strong> - QR codes and upload tokens</li>
                    <li>• <strong>Processing state</strong> - Progress of AI photo processing</li>
                    <li>• <strong>Pending imports</strong> - Filaments waiting to be reviewed</li>
                    <li>• <strong>Query cache</strong> - Cached API responses for faster loading</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
