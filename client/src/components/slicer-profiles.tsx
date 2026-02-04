import { useState, useRef } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  Download,
  Trash2,
  FileJson,
  FileText,
  File,
  Plus,
  Settings2,
  Globe,
  Lock,
  Loader2,
  Search,
} from "lucide-react";

interface SlicerProfile {
  id: number;
  userId: number;
  name: string;
  manufacturer: string | null;
  material: string | null;
  fileUrl: string | null;
  originalFilename: string | null;
  fileType: string | null;
  parsedSettings: string | null;
  slicerVersion: string | null;
  printerModel: string | null;
  notes: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SlicerProfilesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SlicerProfiles({ open, onOpenChange }: SlicerProfilesProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [filterManufacturer, setFilterManufacturer] = useState<string>("all");
  const [filterMaterial, setFilterMaterial] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Upload form state
  const [uploadName, setUploadName] = useState("");
  const [uploadManufacturer, setUploadManufacturer] = useState("none");
  const [uploadMaterial, setUploadMaterial] = useState("none");
  const [uploadPrinter, setUploadPrinter] = useState("none");
  const [uploadSlicerVersion, setUploadSlicerVersion] = useState("none");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadIsPublic, setUploadIsPublic] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch profiles
  const { data: profiles = [], isLoading } = useQuery<SlicerProfile[]>({
    queryKey: ["/api/slicer-profiles"],
    enabled: open,
  });

  // Fetch manufacturers for filter
  const { data: manufacturers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/manufacturers"],
    enabled: open,
  });

  // Fetch materials for filter
  const { data: materials = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/materials"],
    enabled: open,
  });

  const { data: printers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/printers"],
    enabled: open,
  });

  const { data: slicers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/slicers"],
    enabled: open,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/slicer-profiles", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload profile");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicer-profiles"] });
      toast({
        title: "Profile Uploaded",
        description: "Your slicer profile has been uploaded successfully.",
      });
      resetUploadForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/slicer-profiles/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to delete profile");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicer-profiles"] });
      toast({
        title: "Profile Deleted",
        description: "The profile has been deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete the profile.",
        variant: "destructive",
      });
    },
  });

  const resetUploadForm = () => {
    setShowUploadForm(false);
    setUploadName("");
    setUploadManufacturer("none");
    setUploadMaterial("none");
    setUploadPrinter("none");
    setUploadSlicerVersion("none");
    setUploadNotes("");
    setUploadIsPublic(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-fill name from filename if empty
      if (!uploadName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setUploadName(nameWithoutExt);
      }
    }
  };

  const handleUpload = () => {
    if (!selectedFile || !uploadName) {
      toast({
        title: "Missing Information",
        description: "Please select a file and provide a name.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("name", uploadName);
    if (uploadManufacturer !== "none") formData.append("manufacturer", uploadManufacturer);
    if (uploadMaterial !== "none") formData.append("material", uploadMaterial);
    if (uploadPrinter !== "none") formData.append("printerModel", uploadPrinter);
    if (uploadSlicerVersion !== "none") formData.append("slicerVersion", uploadSlicerVersion);
    if (uploadNotes) formData.append("notes", uploadNotes);
    formData.append("isPublic", String(uploadIsPublic));

    uploadMutation.mutate(formData);
  };

  const handleDownload = async (profile: SlicerProfile) => {
    try {
      const response = await fetch(`/api/slicer-profiles/${profile.id}/download`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = profile.originalFilename || `profile${profile.fileType}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download the profile.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-4 w-4" />;
    if (fileType === ".json") return <FileJson className="h-4 w-4" />;
    if ([".ini", ".cfg", ".txt"].includes(fileType)) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getParsedSettings = (profile: SlicerProfile) => {
    if (!profile.parsedSettings) return null;
    try {
      const settings = JSON.parse(profile.parsedSettings);
      return settings;
    } catch {
      return null;
    }
  };

  // Filter profiles
  const filteredProfiles = profiles.filter((profile) => {
    if (filterManufacturer !== "all" && profile.manufacturer !== filterManufacturer) return false;
    if (filterMaterial !== "all" && profile.material !== filterMaterial) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        profile.name.toLowerCase().includes(query) ||
        profile.manufacturer?.toLowerCase().includes(query) ||
        profile.material?.toLowerCase().includes(query) ||
        profile.printerModel?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Slicer Profiles
          </DialogTitle>
          <DialogDescription>
            Store and manage slicer profiles for different materials and manufacturers
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Actions bar */}
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2 items-center flex-1 min-w-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search profiles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterManufacturer} onValueChange={setFilterManufacturer}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.id} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterMaterial} onValueChange={setFilterMaterial}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setShowUploadForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Upload Profile
            </Button>
          </div>

          {/* Upload form */}
          {showUploadForm && (
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Upload New Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Profile File *</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,.ini,.cfg,.3mf,.curaprofile,.fff,.factory,.slicer,.xml,.zip"
                      onChange={handleFileSelect}
                    />
                    <p className="text-xs text-muted-foreground">
                      Supported: .json, .ini, .cfg, .3mf, .curaprofile, .fff, .xml, .zip
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Profile Name *</Label>
                    <Input
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="e.g., PLA High Quality"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Manufacturer</Label>
                    <Select value={uploadManufacturer} onValueChange={setUploadManufacturer}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select manufacturer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {manufacturers.map((m) => (
                          <SelectItem key={m.id} value={m.name}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Material</Label>
                    <Select value={uploadMaterial} onValueChange={setUploadMaterial}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
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
                  <div className="space-y-2">
                    <Label>Printer Model</Label>
                    <Select value={uploadPrinter} onValueChange={setUploadPrinter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select printer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {printers.map((p) => (
                          <SelectItem key={p.id} value={p.name}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Slicer Version</Label>
                    <Select value={uploadSlicerVersion} onValueChange={setUploadSlicerVersion}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select slicer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {slicers.map((s) => (
                          <SelectItem key={s.id} value={s.name}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="Any additional notes about this profile..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={uploadIsPublic} onCheckedChange={setUploadIsPublic} />
                  <Label className="flex items-center gap-1">
                    {uploadIsPublic ? (
                      <>
                        <Globe className="h-4 w-4" /> Public (visible to all users)
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" /> Private (only you can see)
                      </>
                    )}
                  </Label>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={resetUploadForm}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                    {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    <Upload className="h-4 w-4 mr-1" />
                    Upload
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profiles list */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {profiles.length === 0
                  ? "No profiles uploaded yet. Click 'Upload Profile' to add one."
                  : "No profiles match your filters."}
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {filteredProfiles.map((profile) => {
                  const settings = getParsedSettings(profile);
                  return (
                    <Card key={profile.id} className="hover:bg-accent/50 transition-colors">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getFileIcon(profile.fileType)}
                              <span className="font-medium">{profile.name}</span>
                              <Badge variant={profile.isPublic ? "default" : "secondary"}>
                                {profile.isPublic ? (
                                  <>
                                    <Globe className="h-3 w-3 mr-1" /> Public
                                  </>
                                ) : (
                                  <>
                                    <Lock className="h-3 w-3 mr-1" /> Private
                                  </>
                                )}
                              </Badge>
                              {profile.fileType && (
                                <Badge variant="outline">{profile.fileType}</Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted-foreground">
                              {profile.manufacturer && <span>Brand: {profile.manufacturer}</span>}
                              {profile.material && <span>• Material: {profile.material}</span>}
                              {profile.printerModel && <span>• Printer: {profile.printerModel}</span>}
                              {profile.slicerVersion && (
                                <span>• Slicer: {profile.slicerVersion}</span>
                              )}
                            </div>

                            {settings && !settings.parseError && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {settings.layerHeight && (
                                  <Badge variant="outline" className="text-xs">
                                    Layer: {settings.layerHeight}mm
                                  </Badge>
                                )}
                                {settings.printSpeed && (
                                  <Badge variant="outline" className="text-xs">
                                    Speed: {settings.printSpeed}mm/s
                                  </Badge>
                                )}
                                {settings.infillDensity && (
                                  <Badge variant="outline" className="text-xs">
                                    Infill: {settings.infillDensity}%
                                  </Badge>
                                )}
                                {settings.temperature && (
                                  <Badge variant="outline" className="text-xs">
                                    Temp: {settings.temperature}°C
                                  </Badge>
                                )}
                              </div>
                            )}

                            {profile.notes && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                {profile.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(profile)}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(profile.id)}
                              disabled={deleteMutation.isPending}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
