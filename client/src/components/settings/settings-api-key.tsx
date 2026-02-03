import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Key,
  Check,
  X,
  Loader2,
  ExternalLink,
  Shield,
  AlertCircle,
  Cpu,
} from "lucide-react";

interface VisionModel {
  id: string;
  name: string;
  description: string;
}

interface ApiKeyStatus {
  hasUserKey: boolean;
  hasEnvKey: boolean;
  maskedKey: string | null;
  aiEnabled: boolean;
  selectedModel: string;
  availableModels: VisionModel[];
}

export function SettingsApiKey() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [apiKey, setApiKey] = useState("");
  const [showInput, setShowInput] = useState(false);

  // Fetch API key status
  const { data: status, isLoading } = useQuery<ApiKeyStatus>({
    queryKey: ["/api/ai/api-key/status"],
  });

  // Save API key mutation
  const saveKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await fetch("/api/ai/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey: key }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/api-key/status"] });
      setApiKey("");
      setShowInput(false);
      toast({
        title: t("common.success"),
        description: t("apiKey.keySaved"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove API key mutation
  const removeKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/api-key", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/api-key/status"] });
      toast({
        title: t("common.success"),
        description: t("apiKey.keyRemoved"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update model preference mutation
  const updateModelMutation = useMutation({
    mutationFn: async (model: string) => {
      const response = await fetch("/api/ai/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ model }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/api-key/status"] });
      toast({
        title: t("common.success"),
        description: `AI model changed to ${data.modelInfo.name}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    saveKeyMutation.mutate(apiKey.trim());
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t("apiKey.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("apiKey.title")}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("apiKey.description")}
            </CardDescription>
          </div>
          <Badge variant={status?.aiEnabled ? "default" : "secondary"}>
            {status?.aiEnabled ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                {t("apiKey.keyConfigured")}
              </>
            ) : (
              <>
                <X className="h-3 w-3 mr-1" />
                {t("apiKey.keyNotConfigured")}
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current status */}
        {status?.hasUserKey && status.maskedKey && (
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-600" />
              <code className="text-sm">{status.maskedKey}</code>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => removeKeyMutation.mutate()}
              disabled={removeKeyMutation.isPending}
            >
              {removeKeyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("apiKey.removeKey")
              )}
            </Button>
          </div>
        )}

        {status?.hasEnvKey && !status?.hasUserKey && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t("apiKey.usingEnvKey")}
            </AlertDescription>
          </Alert>
        )}

        {/* Input for new key */}
        {(!status?.hasUserKey || showInput) && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="api-key">{t("apiKey.enterKey")}</Label>
              <Input
                id="api-key"
                type="password"
                placeholder={t("apiKey.keyPlaceholder")}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || saveKeyMutation.isPending}
              >
                {saveKeyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t("apiKey.saveKey")}
                  </>
                )}
              </Button>
              {status?.hasUserKey && (
                <Button variant="outline" onClick={() => setShowInput(false)}>
                  {t("common.cancel")}
                </Button>
              )}
            </div>
          </div>
        )}

        {status?.hasUserKey && !showInput && (
          <Button variant="outline" onClick={() => setShowInput(true)}>
            Update API Key
          </Button>
        )}

        {/* Security note */}
        <Alert className="mt-4">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            {t("apiKey.securityNote")}
          </AlertDescription>
        </Alert>

        {/* Link to OpenAI */}
        <div className="pt-2">
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            {t("apiKey.getKeyLink")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Model Selection */}
        {status?.aiEnabled && status.availableModels && (
          <div className="pt-4 border-t mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="h-4 w-4" />
              <Label className="text-base font-medium">AI Model</Label>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Choose which OpenAI model to use for image analysis. Different models have different speed/quality tradeoffs.
            </p>
            <Select 
              value={status.selectedModel} 
              onValueChange={(value) => updateModelMutation.mutate(value)}
              disabled={updateModelMutation.isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {status.availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{model.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {updateModelMutation.isPending && (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating model...
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
