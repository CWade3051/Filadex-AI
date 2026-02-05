import { useState, useRef, useEffect } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  Pencil,
  X,
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
  initialProfileId?: number | null;
}

interface FilamentListItem {
  id: number;
  name: string;
  manufacturer?: string | null;
  material?: string | null;
}

export function SlicerProfiles({ open, onOpenChange, initialProfileId }: SlicerProfilesProps) {
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadFilamentIds, setUploadFilamentIds] = useState<number[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [filamentPickerValue, setFilamentPickerValue] = useState("select");
  const isBulkUpload = selectedFiles.length > 1;

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

  const { data: filaments = [] } = useQuery<FilamentListItem[]>({
    queryKey: ["/api/filaments"],
    enabled: open,
  });

  const loadProfileFilaments = async (profileId: number) => {
    try {
      const linked = await apiRequest<FilamentListItem[]>(`/api/slicer-profiles/${profileId}/filaments`);
      setUploadFilamentIds(linked.map((filament) => filament.id));
    } catch {
      setUploadFilamentIds([]);
    }
  };

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/slicer-profiles", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        let message = "Failed to upload slicer profile";
        try {
          const error = await response.json();
          message = error.message || message;
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        throw new Error(message);
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

  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      payload: {
        name: string;
        manufacturer: string | null;
        material: string | null;
        printerModel: string | null;
        slicerVersion: string | null;
        notes: string | null;
        isPublic: boolean;
      };
      filamentIds: number[];
    }) => {
      const response = await fetch(`/api/slicer-profiles/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data.payload),
      });
      if (!response.ok) {
        let message = "Failed to update slicer profile";
        try {
          const error = await response.json();
          message = error.message || message;
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        throw new Error(message);
      }

      await apiRequest(`/api/slicer-profiles/${data.id}/filaments`, {
        method: "PUT",
        body: JSON.stringify({ filamentIds: data.filamentIds }),
      });

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicer-profiles"] });
      toast({
        title: "Profile Updated",
        description: "Your slicer profile has been updated successfully.",
      });
      resetUploadForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadBulkMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/slicer-profiles/bulk", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        let message = "Failed to bulk upload slicer profiles";
        try {
          const error = await response.json();
          message = error.message || message;
        } catch {
          try {
            const text = await response.text();
            if (text) message = text;
          } catch {}
        }
        throw new Error(message);
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicer-profiles"] });
      toast({
        title: "Profiles Uploaded",
        description: `Uploaded ${data.created || 0} profiles.`,
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
    setIsEditing(false);
    setEditingProfileId(null);
    setUploadName("");
    setUploadManufacturer("none");
    setUploadMaterial("none");
    setUploadPrinter("none");
    setUploadSlicerVersion("none");
    setUploadNotes("");
    setUploadIsPublic(false);
    setSelectedFile(null);
    setSelectedFiles([]);
    setUploadFilamentIds([]);
    setFilamentPickerValue("select");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getFirstString = (value: unknown): string | null => {
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      return typeof first === "string" ? first : null;
    }
    return typeof value === "string" ? value : null;
  };

  const findListMatch = (value: string, list: { name: string }[]) => {
    const normalized = value.trim().toLowerCase();
    return list.find((item) => item.name.trim().toLowerCase() === normalized)?.name || null;
  };

  const ensureListItem = async (
    value: string | null,
    list: { name: string }[],
    endpoint: string,
    setValue: (next: string) => void,
    label: string
  ) => {
    if (!value) return;
    const existing = findListMatch(value, list);
    if (existing) {
      setValue(existing);
      return;
    }

    try {
      const created = await apiRequest<{ name: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ name: value.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      setValue(created.name || value.trim());
    } catch (error) {
      toast({
        title: "Auto-add failed",
        description: `Could not add ${label} "${value}".`,
        variant: "destructive",
      });
      setValue("none");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const file = files[0];
    if (file) {
      setSelectedFiles(files);
      setSelectedFile(file);
      if (files.length > 1) {
        setUploadName("");
        setUploadManufacturer("none");
        setUploadMaterial("none");
        setUploadPrinter("none");
        setUploadSlicerVersion("none");
        setUploadNotes("");
        setUploadFilamentIds([]);
        return;
      }
      // Auto-fill name from filename if empty
      if (!uploadName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setUploadName(nameWithoutExt);
      }

      if (files.length === 1 && file.name.toLowerCase().endsWith(".json")) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const jsonName = getFirstString(parsed.name) || getFirstString(parsed.filament_settings_id);
          if (jsonName && (!uploadName || uploadName === file.name.replace(/\.[^/.]+$/, ""))) {
            setUploadName(jsonName);
          }

          const jsonNotes = getFirstString(parsed.filament_notes);
          if (jsonNotes && !uploadNotes) {
            setUploadNotes(jsonNotes);
          }

          const manufacturer =
            getFirstString(parsed.filament_vendor) ||
            getFirstString(parsed.manufacturer) ||
            getFirstString(parsed.vendor);
          const material =
            getFirstString(parsed.filament_type) || getFirstString(parsed.material);
          const printer = getFirstString(parsed.compatible_printers);

          await ensureListItem(manufacturer, manufacturers, "/api/manufacturers", setUploadManufacturer, "manufacturer");
          await ensureListItem(material, materials, "/api/materials", setUploadMaterial, "material");

          if (printer) {
            const matchedPrinter = findListMatch(printer, printers);
            if (matchedPrinter) {
              setUploadPrinter(matchedPrinter);
            }
          }
        } catch (error) {
          toast({
            title: "Profile parsing failed",
            description: "Could not read profile metadata from the JSON file.",
            variant: "destructive",
          });
        }
      }
    }
  };

  const handleUpload = () => {
    if (selectedFiles.length > 1) {
      return;
    }
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
    if (uploadFilamentIds.length > 0) {
      formData.append("filamentIds", JSON.stringify(uploadFilamentIds));
    }

    uploadMutation.mutate(formData);
  };

  const handleSaveProfile = () => {
    const isBulk = selectedFiles.length > 1;
    if (!uploadName && !isBulk) {
      toast({
        title: "Missing Information",
        description: "Please provide a profile name.",
        variant: "destructive",
      });
      return;
    }

    if (isEditing && editingProfileId) {
      updateMutation.mutate({
        id: editingProfileId,
        payload: {
          name: uploadName,
          manufacturer: uploadManufacturer !== "none" ? uploadManufacturer : null,
          material: uploadMaterial !== "none" ? uploadMaterial : null,
          printerModel: uploadPrinter !== "none" ? uploadPrinter : null,
          slicerVersion: uploadSlicerVersion !== "none" ? uploadSlicerVersion : null,
          notes: uploadNotes || null,
          isPublic: uploadIsPublic,
        },
        filamentIds: uploadFilamentIds,
      });
      return;
    }

    if (isBulk) {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }
      formData.append("isPublic", String(uploadIsPublic));
      uploadBulkMutation.mutate(formData);
      return;
    }

    handleUpload();
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

  const startEditProfile = async (profile: SlicerProfile) => {
    setShowUploadForm(true);
    setIsEditing(true);
    setEditingProfileId(profile.id);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setUploadName(profile.name || "");
    setUploadManufacturer(profile.manufacturer || "none");
    setUploadMaterial(profile.material || "none");
    setUploadPrinter(profile.printerModel || "none");
    setUploadSlicerVersion(profile.slicerVersion || "none");
    setUploadNotes(profile.notes || "");
    setUploadIsPublic(Boolean(profile.isPublic));
    await loadProfileFilaments(profile.id);
  };

  const availableFilaments = filaments.filter(
    (filament) => !uploadFilamentIds.includes(filament.id)
  );

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

  useEffect(() => {
    if (!open || !initialProfileId) return;
    const profile = profiles.find((item) => item.id === initialProfileId);
    if (profile) {
      setSearchQuery(profile.name);
    }
  }, [open, initialProfileId, profiles]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Slicer Profiles
          </DialogTitle>
          <DialogDescription>
            Store and manage slicer profiles for different materials and manufacturers
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4">
          {/* Actions bar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-1 sm:min-w-0">
              <div className="relative w-full sm:flex-1 sm:max-w-xs">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search profiles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterManufacturer} onValueChange={setFilterManufacturer}>
                <SelectTrigger className="w-full sm:w-[150px]">
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
                <SelectTrigger className="w-full sm:w-[150px]">
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
            <Button
              onClick={() => {
                resetUploadForm();
                setShowUploadForm(true);
              }}
              size="sm"
              className="w-full sm:w-auto"
            >
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Profile File {isEditing ? "" : "*"}</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,.ini,.cfg,.3mf,.curaprofile,.fff,.factory,.slicer,.xml,.zip"
                      onChange={handleFileSelect}
                      disabled={isEditing}
                      multiple={!isEditing}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isEditing
                        ? "File replacement is not supported yet."
                        : "Supported: .json, .ini, .cfg, .3mf, .curaprofile, .fff, .xml, .zip. You can select multiple files."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Profile Name *</Label>
                    <Input
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="e.g., PLA High Quality"
                      disabled={isBulkUpload}
                    />
                    {isBulkUpload && (
                      <p className="text-xs text-muted-foreground">
                        Bulk upload uses names from each JSON file.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Manufacturer</Label>
                    <Select
                      value={uploadManufacturer}
                      onValueChange={setUploadManufacturer}
                      disabled={isBulkUpload}
                    >
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
                    <Select
                      value={uploadMaterial}
                      onValueChange={setUploadMaterial}
                      disabled={isBulkUpload}
                    >
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Printer Model</Label>
                    <Select
                      value={uploadPrinter}
                      onValueChange={setUploadPrinter}
                      disabled={isBulkUpload}
                    >
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
                    <Select
                      value={uploadSlicerVersion}
                      onValueChange={setUploadSlicerVersion}
                      disabled={isBulkUpload}
                    >
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
                    disabled={isBulkUpload}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Linked Filaments</Label>
                  {isBulkUpload && (
                    <p className="text-xs text-muted-foreground">
                      Bulk upload skips filament linking. You can link profiles after upload.
                    </p>
                  )}
                  {uploadFilamentIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {uploadFilamentIds.map((id) => {
                        const filament = filaments.find((item) => item.id === id);
                        if (!filament) return null;
                        return (
                          <Badge key={id} variant="secondary" className="flex items-center gap-1">
                            <span className="max-w-[200px] truncate">
                              {filament.name}
                            </span>
                            <button
                              type="button"
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              title="Remove filament"
                              aria-label="Remove filament"
                              onClick={() =>
                                setUploadFilamentIds((prev) => prev.filter((item) => item !== id))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <Select
                    value={filamentPickerValue}
                    onValueChange={(value) => {
                      setFilamentPickerValue(value);
                      if (value === "select") return;
                      const id = parseInt(value, 10);
                      if (!isNaN(id)) {
                        setUploadFilamentIds((prev) =>
                          prev.includes(id) ? prev : [...prev, id]
                        );
                      }
                      setFilamentPickerValue("select");
                    }}
                    disabled={isBulkUpload}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add filament" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="select">Add filament</SelectItem>
                      {availableFilaments.map((filament) => (
                        <SelectItem key={filament.id} value={String(filament.id)}>
                          {filament.name}
                          {filament.manufacturer ? ` • ${filament.manufacturer}` : ""}
                          {filament.material ? ` • ${filament.material}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={resetUploadForm} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveProfile}
                    disabled={uploadMutation.isPending || updateMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {(uploadMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    )}
                    <Upload className="h-4 w-4 mr-1" />
                    {isEditing
                      ? "Save"
                      : isBulkUpload
                        ? `Upload ${selectedFiles.length}`
                        : "Upload"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profiles list */}
          <div className="flex-1 overflow-y-auto">
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
              <div className="space-y-3 pr-2 sm:pr-4">
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
                                onClick={() => startEditProfile(profile)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
