import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { lookupColorHex } from "@/lib/color-lookup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Combobox } from "@/components/ui/combobox";
import {
  Camera,
  Upload,
  Smartphone,
  X,
  Check,
  AlertCircle,
  Loader2,
  Settings,
  ImageIcon,
  RefreshCw,
  ChevronRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";

interface ExtractedFilamentData {
  name?: string;
  manufacturer?: string;
  material?: string;
  colorName?: string;
  colorCode?: string;
  diameter?: number;
  printTemp?: string;
  printSpeed?: string;
  totalWeight?: number;
  bedTemp?: string;
  isSealed?: boolean;
  notes?: string; // AI-generated notes (e.g., alternative print settings)
  estimatedPrice?: number; // Estimated price based on brand/material
  confidence: number;
}

interface ProcessedImage {
  imageUrl: string;
  originalName?: string;
  extractedData?: ExtractedFilamentData;
  error?: string;
  selected: boolean;
  notes?: string;
  storageLocation?: string;
  locationDetails?: string;
  status?: string; // 'sealed' or 'opened'
  remainingPercentage?: number;
  lastDryingDate?: string;
  isExpanded?: boolean; // Track if editing is expanded
}

interface PhotoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function PhotoImportModal({ isOpen, onClose, onImportComplete }: PhotoImportModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<"upload" | "mobile" | "review">("upload");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [mobileSession, setMobileSession] = useState<{
    token: string;
    qrCode: string;
    uploadUrl: string;
    expiresAt: string;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0); // Photos uploaded but not yet processed
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastImageCountRef = useRef(0); // Track image count to detect new uploads
  const processedImageUrlsRef = useRef<Set<string>>(new Set()); // Track which images we've already processed
  
  // Image preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Check API key status
  const { data: apiKeyStatus } = useQuery({
    queryKey: ["/api/ai/api-key/status"],
    enabled: isOpen,
  });

  // Fetch existing options for dropdowns
  const { data: manufacturers = [] } = useQuery<any[]>({
    queryKey: ["/api/manufacturers"],
    enabled: isOpen,
  });

  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ["/api/materials"],
    enabled: isOpen,
  });

  const { data: colors = [] } = useQuery<any[]>({
    queryKey: ["/api/colors"],
    enabled: isOpen,
  });

  const { data: storageLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/storage-locations"],
    enabled: isOpen,
  });

  const { data: filaments = [] } = useQuery<any[]>({
    queryKey: ["/api/filaments"],
    enabled: isOpen,
  });

  // Build options for dropdowns
  const manufacturerOptions = manufacturers.map((m: any) => ({
    value: m.name,
    label: m.name,
  }));

  const materialOptions = materials.map((m: any) => ({
    value: m.name,
    label: m.name,
  }));

  const colorOptions = colors.map((c: any) => ({
    value: c.name,
    label: c.name,
  }));

  const storageLocationOptions = storageLocations.map((s: any) => ({
    value: s.name,
    label: s.name,
  }));

  // Common diameters
  const diameterOptions = [
    { value: "1.75", label: "1.75mm" },
    { value: "2.85", label: "2.85mm" },
    { value: "3.00", label: "3.00mm" },
  ];

  // Common weights
  const weightOptions = [
    { value: "0.25", label: "0.25kg (250g)" },
    { value: "0.5", label: "0.5kg (500g)" },
    { value: "0.75", label: "0.75kg (750g)" },
    { value: "1", label: "1kg (1000g)" },
    { value: "2", label: "2kg" },
    { value: "3", label: "3kg" },
  ];

  // Clean up on close - but preserve mobile session if active
  useEffect(() => {
    if (!isOpen) {
      setSelectedFiles([]);
      // Only reset if NO active mobile session with results
      // This preserves state when user closes and reopens during mobile upload
      if (!mobileSession || processedImages.length === 0) {
        setProcessedImages([]);
        setMobileSession(null);
        setIsPolling(false);
        setPendingPhotoCount(0);
        lastImageCountRef.current = 0;
        processedImageUrlsRef.current = new Set();
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
      setIsProcessing(false);
      setActiveTab("upload");
    }
  }, [isOpen, mobileSession, processedImages.length]);
  
  // Resume polling when modal reopens with active session
  useEffect(() => {
    if (isOpen && mobileSession && !isPolling && !pollingRef.current) {
      // Resume polling for this session
      startPolling(mobileSession.token);
    }
  }, [isOpen, mobileSession, isPolling]);

  // File drop handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  // Remove file from selection
  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Process images mutation
  const processImagesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("images", file);
      });

      const response = await fetch("/api/ai/extract-bulk", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to process images");
      }

      return response.json();
    },
    onSuccess: (data) => {
      const processed: ProcessedImage[] = data.results.map((result: any) => ({
        imageUrl: result.imageUrl,
        originalName: result.originalName,
        extractedData: result.extractedData,
        error: result.error,
        selected: !result.error && result.extractedData?.confidence > 0.3,
        notes: result.extractedData?.notes || "", // Use AI-extracted notes (e.g., alternative print settings)
        storageLocation: "",
        status: result.extractedData?.isSealed !== false ? "sealed" : "opened",
        remainingPercentage: 100,
        lastDryingDate: "",
      }));
      setProcessedImages(processed);
      setActiveTab("review");
      setIsProcessing(false);
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
      setIsProcessing(false);
    },
  });

  // Start processing
  const handleProcessImages = () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: selectedFiles.length });
    processImagesMutation.mutate(selectedFiles);
  };

  // Create mobile upload session
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/upload-session", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setMobileSession({
        token: data.sessionToken,
        qrCode: data.qrCode,
        uploadUrl: data.uploadUrl,
        expiresAt: data.expiresAt,
      });
      startPolling(data.sessionToken);
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Start polling for mobile uploads - continues polling to catch "Upload More"
  const startPolling = (token: string) => {
    setIsPolling(true);
    lastImageCountRef.current = 0;
    
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai/upload-session/${token}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          
          // Check if we have new images since last poll
          if (data.imageCount > lastImageCountRef.current) {
            const newImageCount = data.imageCount - lastImageCountRef.current;
            lastImageCountRef.current = data.imageCount;
            
            // Find new images that we haven't processed yet
            const newImages = data.images.filter((img: any) => 
              !processedImageUrlsRef.current.has(img.imageUrl)
            );
            
            if (newImages.length > 0) {
              // Mark these images as being processed
              newImages.forEach((img: any) => {
                processedImageUrlsRef.current.add(img.imageUrl);
              });
              
              // Update pending count and show notification
              setPendingPhotoCount(prev => prev + newImages.length);
              toast({
                title: t("ai.newPhotosReceived") || "New Photos Received",
                description: `${newImageCount} new photo(s) - processing with AI...`,
              });
              
              // Trigger AI processing for the session
              setIsProcessing(true);
              processMobileSessionMutation.mutate(token);
            }
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 3000);
  };

  // Process mobile session images
  const processMobileSessionMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/ai/upload-session/${token}/process`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      return response.json();
    },
    onSuccess: (data) => {
      const newProcessed: ProcessedImage[] = data.results.map((result: any) => ({
        imageUrl: result.imageUrl,
        extractedData: result.extractedData,
        error: result.error,
        selected: !result.error && result.extractedData?.confidence > 0.3,
        notes: result.extractedData?.notes || "", // Use AI-extracted notes
        storageLocation: "",
        status: result.extractedData?.isSealed !== false ? "sealed" : "opened",
        remainingPercentage: 100,
        lastDryingDate: "",
      }));
      
      // Append new results to existing ones (for incremental uploads)
      // Filter out any that are already in the list by imageUrl
      setProcessedImages(prev => {
        const existingUrls = new Set(prev.map(p => p.imageUrl));
        const trulyNew = newProcessed.filter(p => !existingUrls.has(p.imageUrl));
        return [...prev, ...trulyNew];
      });
      
      setPendingPhotoCount(0); // Clear pending count after processing
      setActiveTab("review");
      setIsProcessing(false);
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
      setIsProcessing(false);
    },
  });

  // Import filaments mutation
  const importFilamentsMutation = useMutation({
    mutationFn: async (filaments: any[]) => {
      const results = [];
      for (const filament of filaments) {
        try {
          const response = await fetch("/api/filaments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(filament),
          });
          if (response.ok) {
            results.push({ success: true });
          } else {
            results.push({ success: false });
          }
        } catch {
          results.push({ success: false });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.length - successCount;
      
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statistics"] });
      
      if (failedCount === 0) {
        toast({
          title: t("common.success"),
          description: t("ai.importSuccess", { count: successCount }),
        });
      } else {
        toast({
          title: t("common.warning"),
          description: t("ai.importPartial", {
            success: successCount,
            total: results.length,
            failed: failedCount,
          }),
          variant: "destructive",
        });
      }
      
      // Remove imported images from the review list
      setProcessedImages(prev => prev.filter(img => !img.selected));
      
      onImportComplete();
      
      // If mobile session is still active, stay open and show mobile tab
      // Otherwise close the modal
      if (mobileSession && isPolling) {
        // Stay on mobile tab to allow more uploads
        setActiveTab("mobile");
        toast({
          title: t("ai.sessionStillActive") || "Session Still Active",
          description: t("ai.canUploadMore") || "You can continue uploading more photos from your phone.",
        });
      } else {
        onClose();
      }
    },
  });

  // Handle import
  const handleImport = () => {
    const selectedImages = processedImages.filter((img) => img.selected && img.extractedData);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const filaments = selectedImages.map((img) => {
      const data = img.extractedData!;
      return {
        name: data.name || `${data.material || "Unknown"} ${data.colorName || ""}`.trim(),
        manufacturer: data.manufacturer || "",
        material: data.material || "PLA",
        colorName: data.colorName || "Unknown",
        colorCode: data.colorCode || "#808080",
        diameter: data.diameter?.toString() || "1.75",
        printTemp: data.printTemp || "",
        printSpeed: data.printSpeed || "",
        totalWeight: data.totalWeight?.toString() || "1",
        remainingPercentage: (img.remainingPercentage ?? 100).toString(),
        status: img.status || "sealed",
        spoolType: "spooled",
        storageLocation: img.storageLocation || "",
        locationDetails: img.locationDetails || "",
        notes: img.notes || "",
        imageUrl: img.imageUrl,
        lastDryingDate: img.lastDryingDate || null,
        purchaseDate: today,
        purchasePrice: data.estimatedPrice?.toString() || "",
      };
    });
    
    importFilamentsMutation.mutate(filaments);
  };

  // Toggle selection
  const toggleSelection = (index: number) => {
    setProcessedImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, selected: !img.selected } : img))
    );
  };

  // Update notes/location
  const updateImageField = (
    index: number, 
    field: "notes" | "storageLocation" | "locationDetails" | "status" | "remainingPercentage" | "lastDryingDate", 
    value: string | number
  ) => {
    setProcessedImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, [field]: value } : img))
    );
  };

  // Look up brand-specific defaults
  const getBrandDefaults = (manufacturer: string, material?: string, productName?: string) => {
    const mfr = manufacturer.toLowerCase();
    const mat = material?.toUpperCase() || 'PLA';
    const name = productName?.toLowerCase() || '';
    
    // Bambu Lab
    if (mfr.includes('bambu')) {
      if (mat.includes('TPU')) return { printSpeed: '50-100mm/s', printTemp: '220-240°C', bedTemp: '25-35°C' };
      if (mat.includes('PETG')) return { printSpeed: '200-250mm/s', printTemp: '250-270°C', bedTemp: '70-80°C' };
      if (mat.includes('ABS')) return { printSpeed: '200-250mm/s', printTemp: '240-270°C', bedTemp: '90-100°C' };
      return { printSpeed: '250-300mm/s', printTemp: '190-230°C', bedTemp: '45-60°C' }; // PLA
    }
    
    // Sunlu
    if (mfr.includes('sunlu')) {
      if (name.includes('high speed') || name.includes('high-speed')) {
        return { printSpeed: '150-300mm/s', printTemp: '190-230°C', bedTemp: '50-60°C' };
      }
      if (mat.includes('PETG')) return { printSpeed: '40-80mm/s', printTemp: '230-250°C', bedTemp: '70-80°C' };
      return { printSpeed: '40-80mm/s', printTemp: '190-230°C', bedTemp: '50-60°C' }; // Standard PLA
    }
    
    // ELEGOO
    if (mfr.includes('elegoo')) {
      if (name.includes('rapid') || name.includes('high speed')) {
        return { printSpeed: '200-600mm/s', printTemp: '190-230°C', bedTemp: '45-60°C' };
      }
      return { printSpeed: '40-100mm/s', printTemp: '190-220°C', bedTemp: '50-60°C' };
    }
    
    // Snapmaker
    if (mfr.includes('snapmaker')) {
      if (name.includes('snapspeed') || name.includes('speed')) {
        return { printSpeed: '100-300mm/s', printTemp: '190-230°C', bedTemp: '25-60°C' };
      }
      return { printSpeed: '40-100mm/s', printTemp: '190-220°C', bedTemp: '25-60°C' };
    }
    
    // Creality
    if (mfr.includes('creality')) {
      if (name.includes('hyper')) {
        return { printSpeed: '150-600mm/s', printTemp: '190-230°C', bedTemp: '45-60°C' };
      }
      return { printSpeed: '40-100mm/s', printTemp: '190-220°C', bedTemp: '50-60°C' };
    }
    
    // Prusament
    if (mfr.includes('prusa')) {
      if (mat.includes('PETG')) return { printSpeed: '40-80mm/s', printTemp: '230-250°C', bedTemp: '80-90°C' };
      return { printSpeed: '40-100mm/s', printTemp: '200-220°C', bedTemp: '50-60°C' };
    }
    
    // Hatchbox
    if (mfr.includes('hatchbox')) {
      return { printSpeed: '40-80mm/s', printTemp: '180-210°C', bedTemp: '50-60°C' };
    }
    
    // eSUN
    if (mfr.includes('esun')) {
      return { printSpeed: '40-100mm/s', printTemp: '190-220°C', bedTemp: '50-60°C' };
    }
    
    // Overture
    if (mfr.includes('overture')) {
      return { printSpeed: '40-80mm/s', printTemp: '190-220°C', bedTemp: '50-60°C' };
    }
    
    // Polymaker
    if (mfr.includes('polymaker')) {
      return { printSpeed: '40-100mm/s', printTemp: '190-230°C', bedTemp: '25-60°C' };
    }
    
    // Default for unknown brands
    if (mat.includes('PETG')) return { printSpeed: '40-80mm/s', printTemp: '230-250°C', bedTemp: '70-80°C' };
    if (mat.includes('ABS')) return { printSpeed: '40-80mm/s', printTemp: '230-260°C', bedTemp: '90-110°C' };
    if (mat.includes('TPU')) return { printSpeed: '20-40mm/s', printTemp: '210-230°C', bedTemp: '25-50°C' };
    return { printSpeed: '40-100mm/s', printTemp: '190-220°C', bedTemp: '50-60°C' }; // Default PLA
  };

  // Update extracted data field
  const updateExtractedField = (
    index: number,
    field: keyof ExtractedFilamentData,
    value: any
  ) => {
    setProcessedImages((prev) =>
      prev.map((img, i) => {
        if (i === index && img.extractedData) {
          const updatedData = {
            ...img.extractedData,
            [field]: value,
          };
          
          // Auto-lookup color code when color name changes and update product name
          if (field === "colorName" && value) {
            const hexCode = lookupColorHex(
              value,
              colors.map((c: any) => ({ name: c.name, code: c.code }))
            );
            if (hexCode) {
              updatedData.colorCode = hexCode;
            }
            
            // Auto-update the product name to match the new color
            if (updatedData.name && img.extractedData.colorName) {
              // Replace the old color name in the product name with the new one
              const oldColor = img.extractedData.colorName;
              const regex = new RegExp(oldColor, 'gi');
              updatedData.name = updatedData.name.replace(regex, value);
            }
          }
          
          // Auto-update speed/temp when manufacturer changes
          if (field === "manufacturer" && value) {
            const defaults = getBrandDefaults(value, img.extractedData.material, img.extractedData.name);
            updatedData.printSpeed = defaults.printSpeed;
            updatedData.printTemp = defaults.printTemp;
            updatedData.bedTemp = defaults.bedTemp;
          }
          
          // Auto-update speed/temp when material changes (use current manufacturer)
          if (field === "material" && value && img.extractedData.manufacturer) {
            const defaults = getBrandDefaults(img.extractedData.manufacturer, value, img.extractedData.name);
            updatedData.printSpeed = defaults.printSpeed;
            updatedData.printTemp = defaults.printTemp;
            updatedData.bedTemp = defaults.bedTemp;
          }
          
          return {
            ...img,
            extractedData: updatedData,
          };
        }
        return img;
      })
    );
  };

  // Toggle expanded state for editing
  const toggleExpanded = (index: number) => {
    setProcessedImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, isExpanded: !img.isExpanded } : img))
    );
  };

  // Calculate selected count
  const selectedCount = processedImages.filter((img) => img.selected).length;

  // Check if AI is available
  const aiAvailable = apiKeyStatus?.aiEnabled;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {t("ai.photoImport")}
          </DialogTitle>
          <DialogDescription>{t("ai.photoImportDescription")}</DialogDescription>
        </DialogHeader>

        {!aiAvailable ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <AlertCircle className="h-12 w-12 text-yellow-500" />
            <h3 className="text-lg font-medium">{t("ai.noApiKey")}</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {t("ai.noApiKeyDescription")}
            </p>
            <Button onClick={onClose}>
              <Settings className="h-4 w-4 mr-2" />
              {t("ai.configureApiKey")}
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden min-h-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload" disabled={isProcessing}>
                <Upload className="h-4 w-4 mr-2" />
                {t("ai.uploadPhotos")}
              </TabsTrigger>
              <TabsTrigger value="mobile" disabled={isProcessing}>
                <Smartphone className="h-4 w-4 mr-2" />
                {t("ai.mobileUpload")}
              </TabsTrigger>
              <TabsTrigger value="review" disabled={processedImages.length === 0}>
                <Check className="h-4 w-4 mr-2" />
                {t("ai.reviewResults")}
              </TabsTrigger>
            </TabsList>

            {/* Upload Tab */}
            <TabsContent value="upload" className="flex-1 flex flex-col overflow-hidden mt-4">
              <div
                {...getRootProps()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
                `}
              >
                <input {...getInputProps()} />
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">{t("ai.dragDropPhotos")}</p>
                <p className="text-sm text-muted-foreground">{t("ai.supportedFormats")}</p>
                <p className="text-sm text-muted-foreground">{t("ai.maxFileSize")}</p>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-4 flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {selectedFiles.length} {selectedFiles.length === 1 ? "photo" : "photos"} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFiles([])}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear all
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 border rounded-lg p-2">
                    <div className="grid grid-cols-4 gap-2">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="relative group aspect-square">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="w-full h-full object-cover rounded-md"
                          />
                          <button
                            onClick={() => removeFile(index)}
                            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove image"
                            aria-label="Remove image"
                          >
                            <X className="h-3 w-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Button
                    className="mt-4"
                    onClick={handleProcessImages}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("ai.extractingData")}
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4 mr-2" />
                        {t("ai.extractingData")}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Mobile Upload Tab */}
            <TabsContent value="mobile" className="flex-1 flex flex-col items-center justify-center mt-4">
              {!mobileSession ? (
                <div className="text-center space-y-4">
                  <Smartphone className="h-16 w-16 mx-auto text-muted-foreground" />
                  <h3 className="text-lg font-medium">{t("ai.qrCodeTitle")}</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {t("ai.qrCodeDescription")}
                  </p>
                  <Button onClick={() => createSessionMutation.mutate()}>
                    Generate QR Code
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <img
                    src={mobileSession.qrCode}
                    alt="QR Code"
                    className="w-64 h-64 mx-auto border rounded-lg"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("ai.qrCodeExpires", { minutes: "30" })}
                  </p>
                  
                  {isProcessing ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2 text-orange-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="font-medium">
                          {t("ai.processingPhotos") || "Processing with AI..."}
                        </span>
                      </div>
                      <div className="w-full max-w-xs mx-auto">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{processedImages.length} completed</span>
                          <span>{pendingPhotoCount} pending</span>
                        </div>
                        <Progress 
                          value={pendingPhotoCount > 0 ? (processedImages.length / (processedImages.length + pendingPhotoCount)) * 100 : 0} 
                          className="h-2"
                        />
                        <p className="text-xs text-center mt-1 text-muted-foreground">
                          {processedImages.length} of {processedImages.length + pendingPhotoCount} photos processed
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("ai.canUploadMoreWhileProcessing") || "You can upload more photos while processing"}
                      </p>
                    </div>
                  ) : processedImages.length === 0 && pendingPhotoCount === 0 ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("ai.waitingForPhotos")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-green-600 font-medium">
                        {t("ai.photosProcessed", { count: processedImages.length }) || `${processedImages.length} photo(s) ready for review`}
                      </p>
                      <Button
                        onClick={() => setActiveTab("review")}
                      >
                        {t("ai.viewResults") || "View Results"}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        {t("ai.canUploadMore") || "Upload more photos from your phone if needed"}
                      </p>
                    </div>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMobileSession(null);
                      if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                      }
                    }}
                  >
                    {t("ai.cancelSession")}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Review Tab */}
            <TabsContent value="review" className="flex-1 flex flex-col mt-4 h-full overflow-hidden">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <span className="text-sm">
                  {selectedCount} of {processedImages.length} selected for import
                </span>
                <Button
                  onClick={handleImport}
                  disabled={selectedCount === 0 || importFilamentsMutation.isPending}
                >
                  {importFilamentsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      {t("ai.importSelected")} ({selectedCount})
                    </>
                  )}
                </Button>
              </div>

              <div className="flex-1 overflow-auto" style={{ maxHeight: 'calc(90vh - 220px)' }}>
                <div className="space-y-4 pr-4 pb-4">
                  {processedImages.map((img, index) => (
                    <div
                      key={index}
                      className={`
                        border rounded-lg p-4 transition-colors
                        ${img.selected ? "border-primary bg-primary/5" : "border-muted"}
                        ${img.error ? "border-red-300 bg-red-50 dark:bg-red-950/30" : ""}
                      `}
                    >
                      <div className="flex gap-4">
                        {/* Image preview - clickable for full view */}
                        <div 
                          className="w-28 h-28 flex-shrink-0 cursor-pointer relative group"
                          onClick={() => setPreviewImage(img.imageUrl)}
                        >
                          <img
                            src={img.imageUrl}
                            alt={img.originalName}
                            className="w-full h-full object-cover rounded-md"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-md flex items-center justify-center">
                            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>

                        {/* Extracted data */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={img.selected}
                                onCheckedChange={() => toggleSelection(index)}
                                disabled={!!img.error}
                              />
                              <Input
                                value={img.extractedData?.name || ""}
                                onChange={(e) => updateExtractedField(index, "name", e.target.value)}
                                placeholder="Product name"
                                className="h-8 font-medium max-w-[300px]"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              {img.extractedData?.confidence && (
                                <Badge variant={img.extractedData.confidence > 0.7 ? "default" : "secondary"}>
                                  {Math.round(img.extractedData.confidence * 100)}% {t("ai.confidence")}
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleExpanded(index)}
                                className="h-8 px-2"
                              >
                                {img.isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <><Edit2 className="h-4 w-4 mr-1" /> Edit</>
                                )}
                              </Button>
                            </div>
                          </div>

                          {img.error ? (
                            <div className="text-red-600 text-sm flex items-center gap-2">
                              <AlertCircle className="h-4 w-4" />
                              {img.error}
                            </div>
                          ) : img.extractedData ? (
                            <>
                              {/* Quick view - always shown */}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Brand:</span>
                                  <span className="font-medium">{img.extractedData.manufacturer || "-"}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Material:</span>
                                  <span className="font-medium">{img.extractedData.material || "-"}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Color:</span>
                                  {img.extractedData.colorCode && (
                                    <div
                                      className="w-4 h-4 rounded-full border"
                                      style={{ backgroundColor: img.extractedData.colorCode }}
                                    />
                                  )}
                                  <span className="font-medium">{img.extractedData.colorName || "-"}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Weight:</span>
                                  <span className="font-medium">{img.extractedData.totalWeight ? `${img.extractedData.totalWeight}kg` : "-"}</span>
                                </div>
                                {img.extractedData.printTemp && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Temp:</span>
                                    <span className="font-medium">{img.extractedData.printTemp}</span>
                                  </div>
                                )}
                                {img.extractedData.printSpeed && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Speed:</span>
                                    <span className="font-medium">{img.extractedData.printSpeed}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Status:</span>
                                  <span className={`font-medium ${img.status === "sealed" ? "text-green-600" : "text-yellow-600"}`}>
                                    {img.status === "sealed" ? "Sealed" : "Opened"}
                                  </span>
                                </div>
                              </div>

                              {/* Expanded edit form */}
                              {img.isExpanded && (
                                <div className="border-t pt-3 mt-2 space-y-3">
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {/* Manufacturer */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Manufacturer</Label>
                                      <Combobox
                                        options={manufacturerOptions}
                                        value={img.extractedData.manufacturer || ""}
                                        onChange={(v) => updateExtractedField(index, "manufacturer", v)}
                                        placeholder="Select brand..."
                                        searchPlaceholder="Search or add..."
                                        allowCustom={true}
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Material */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Material</Label>
                                      <Combobox
                                        options={materialOptions}
                                        value={img.extractedData.material || ""}
                                        onChange={(v) => updateExtractedField(index, "material", v)}
                                        placeholder="Select material..."
                                        searchPlaceholder="Search or add..."
                                        allowCustom={true}
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Color */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Color Name</Label>
                                      <Combobox
                                        options={colorOptions}
                                        value={img.extractedData.colorName || ""}
                                        onChange={(v) => updateExtractedField(index, "colorName", v)}
                                        placeholder="Select color..."
                                        searchPlaceholder="Search or add..."
                                        allowCustom={true}
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Color Code */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Color Code</Label>
                                      <div className="flex gap-2">
                                        <Input
                                          type="color"
                                          value={img.extractedData.colorCode || "#808080"}
                                          onChange={(e) => updateExtractedField(index, "colorCode", e.target.value)}
                                          className="h-8 w-12 p-1 cursor-pointer"
                                        />
                                        <Input
                                          value={img.extractedData.colorCode || ""}
                                          onChange={(e) => updateExtractedField(index, "colorCode", e.target.value)}
                                          placeholder="#RRGGBB"
                                          className="h-8 text-sm flex-1"
                                        />
                                      </div>
                                    </div>

                                    {/* Diameter */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Diameter</Label>
                                      <Combobox
                                        options={diameterOptions}
                                        value={img.extractedData.diameter?.toString() || "1.75"}
                                        onChange={(v) => updateExtractedField(index, "diameter", parseFloat(v))}
                                        placeholder="Select diameter..."
                                        allowCustom={true}
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Weight */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Weight</Label>
                                      <Combobox
                                        options={weightOptions}
                                        value={img.extractedData.totalWeight?.toString() || "1"}
                                        onChange={(v) => updateExtractedField(index, "totalWeight", parseFloat(v))}
                                        placeholder="Select weight..."
                                        allowCustom={true}
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Print Temp */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Print Temp</Label>
                                      <Input
                                        value={img.extractedData.printTemp || ""}
                                        onChange={(e) => updateExtractedField(index, "printTemp", e.target.value)}
                                        placeholder="e.g., 190-230°C"
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Print Speed */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Print Speed</Label>
                                      <Input
                                        value={img.extractedData.printSpeed || ""}
                                        onChange={(e) => updateExtractedField(index, "printSpeed", e.target.value)}
                                        placeholder="e.g., 30-100mm/s"
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Bed Temp */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Bed Temp</Label>
                                      <Input
                                        value={img.extractedData.bedTemp || ""}
                                        onChange={(e) => updateExtractedField(index, "bedTemp", e.target.value)}
                                        placeholder="e.g., 45-60°C"
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                  </div>

                                  {/* Status and Remaining */}
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 border-t pt-3 mt-1">
                                    {/* Status */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Status</Label>
                                      <Combobox
                                        options={[
                                          { value: "sealed", label: "Sealed" },
                                          { value: "opened", label: "Opened" },
                                        ]}
                                        value={img.status || "sealed"}
                                        onChange={(v) => updateImageField(index, "status", v)}
                                        placeholder="Select status..."
                                        allowCustom={false}
                                        className="h-8 text-sm"
                                      />
                                    </div>

                                    {/* Remaining Percentage */}
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Remaining %</Label>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={img.remainingPercentage ?? 100}
                                          onChange={(e) => updateImageField(index, "remainingPercentage", parseInt(e.target.value) || 0)}
                                          className="h-8 text-sm"
                                        />
                                        <span className="text-sm text-muted-foreground">%</span>
                                      </div>
                                    </div>

                                    {/* Last Drying Date - only show if opened */}
                                    {img.status === "opened" && (
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Last Dried</Label>
                                        <Input
                                          type="date"
                                          value={img.lastDryingDate || ""}
                                          onChange={(e) => updateImageField(index, "lastDryingDate", e.target.value)}
                                          className="h-8 text-sm"
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {/* Storage Location and Location Details */}
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">{t("filaments.storageLocation")}</Label>
                                      <Combobox
                                        options={storageLocationOptions}
                                        value={img.storageLocation || ""}
                                        onChange={(v) => updateImageField(index, "storageLocation", v)}
                                        placeholder={t("filaments.selectStorageLocation")}
                                        searchPlaceholder="Search locations..."
                                        allowCustom={false}
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">{t("filaments.locationDetails")}</Label>
                                      <Input
                                        placeholder={t("filaments.locationDetailsPlaceholder")}
                                        value={img.locationDetails || ""}
                                        onChange={(e) => updateImageField(index, "locationDetails", e.target.value)}
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                  </div>
                                  
                                  {/* Notes */}
                                  <div>
                                    <Label className="text-xs text-muted-foreground">{t("ai.addNotes")}</Label>
                                    <Input
                                      placeholder={t("ai.notesPlaceholder")}
                                      value={img.notes || ""}
                                      onChange={(e) => updateImageField(index, "notes", e.target.value)}
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Collapsed Location/Notes - only show if not expanded */}
                              {!img.isExpanded && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">{t("ai.addLocation")}</Label>
                                    <Combobox
                                      options={storageLocationOptions}
                                      value={img.storageLocation || ""}
                                      onChange={(v) => updateImageField(index, "storageLocation", v)}
                                      placeholder={t("ai.locationPlaceholder")}
                                      searchPlaceholder="Search or add..."
                                      allowCustom={true}
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">{t("ai.addNotes")}</Label>
                                    <Input
                                      placeholder={t("ai.notesPlaceholder")}
                                      value={img.notes || ""}
                                      onChange={(e) => updateImageField(index, "notes", e.target.value)}
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>

      {/* Image Preview Modal */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => { 
          setPreviewImage(null); 
          setPreviewZoom(1); 
          setPreviewPan({ x: 0, y: 0 });
          setIsDragging(false);
        }}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[90vh] p-0 overflow-hidden bg-black/95">
            <div className="relative w-full h-full flex flex-col">
              {/* Controls */}
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-black/50 rounded-lg p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewZoom(z => Math.max(0.25, z - 0.25))}
                  className="text-white hover:bg-white/20"
                  title="Zoom out"
                >
                  <ZoomOut className="h-5 w-5" />
                </Button>
                <span className="text-white text-sm min-w-[60px] text-center">
                  {Math.round(previewZoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewZoom(z => Math.min(4, z + 0.25))}
                  className="text-white hover:bg-white/20"
                  title="Zoom in"
                >
                  <ZoomIn className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPreviewZoom(1); setPreviewPan({ x: 0, y: 0 }); }}
                  className="text-white hover:bg-white/20"
                  title="Reset view"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { 
                    setPreviewImage(null); 
                    setPreviewZoom(1); 
                    setPreviewPan({ x: 0, y: 0 });
                  }}
                  className="text-white hover:bg-white/20"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Image Container with pan and zoom */}
              <div 
                ref={imageContainerRef}
                className="flex-1 overflow-hidden flex items-center justify-center"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.15 : -0.15;
                  setPreviewZoom(z => Math.min(4, Math.max(0.25, z + delta)));
                }}
                onMouseDown={(e) => {
                  if (e.button === 0) { // Left click only
                    setIsDragging(true);
                    setDragStart({ x: e.clientX - previewPan.x, y: e.clientY - previewPan.y });
                  }
                }}
                onMouseMove={(e) => {
                  if (isDragging) {
                    setPreviewPan({
                      x: e.clientX - dragStart.x,
                      y: e.clientY - dragStart.y
                    });
                  }
                }}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
              >
                <img
                  src={previewImage}
                  alt="Full size preview"
                  style={{ 
                    transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
                    transformOrigin: 'center center',
                    maxWidth: previewZoom === 1 ? '90%' : 'none',
                    maxHeight: previewZoom === 1 ? '90%' : 'none',
                    objectFit: 'contain',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}
                  draggable={false}
                />
              </div>

              {/* Instructions */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-4 py-2 rounded-lg">
                Scroll to zoom • Drag to pan • Click Reset to center
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
