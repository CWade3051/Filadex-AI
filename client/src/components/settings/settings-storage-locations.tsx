import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";
import {
  Card,
  CardContent,
  CardHeader
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Trash2, GripVertical } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "@/i18n";
import { StorageLocation, createStorageLocationSchema } from "./settings-types";
import { ImportExportCard } from "./settings-import-export-card";

export function StorageLocationsList() {
  const queryClient = useQueryClient();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const { t } = useTranslation();
  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["/api/storage-locations"],
    queryFn: () => apiRequest<StorageLocation[]>("/api/storage-locations")
  });

  // Funktion zum Aktualisieren der Reihenfolge
  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, newOrder }: { id: number, newOrder: number }) => {
      return apiRequest(`/api/storage-locations/${id}/order`, {
        method: "PATCH",
        body: JSON.stringify({ newOrder })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
    },
    onError: (error) => {
      console.error("Fehler beim Aktualisieren der Reihenfolge:", error);
      toast({
        title: "Fehler",
        description: "Die Reihenfolge konnte nicht aktualisiert werden.",
        variant: "destructive"
      });
    }
  });

  // DnD-Handler für Reihenfolge-Änderung
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) return;

    const item = locations[sourceIndex];
    updateOrderMutation.mutate({ id: item.id, newOrder: destinationIndex });
  };

  // CSV Format für Lagerorte
  const locationsCsvFormat = `Name
Keller
Schrank
Regal A
Regal B
...`;

  // Create schema with translations
  const storageLocationSchema = createStorageLocationSchema(t);
  type FormValues = z.infer<typeof storageLocationSchema>;

  // Form hook
  const form = useForm<FormValues>({
    resolver: zodResolver(storageLocationSchema),
    defaultValues: {
      name: ""
    }
  });

  // Mutation to add a storage location
  const addLocationMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest<StorageLocation>("/api/storage-locations", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      form.reset();
      toast({
        title: t('settings.storageLocations.addSuccess'),
        description: t('settings.storageLocations.addSuccessDescription')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.storageLocations.addError'),
        variant: "destructive"
      });
    }
  });

  // Mutation to delete a storage location
  const deleteLocationMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/storage-locations/${id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      toast({
        title: t('settings.storageLocations.deleteSuccess'),
        description: t('settings.storageLocations.deleteSuccessDescription')
      });
    },
    onError: (error: any) => {
      let errorMessage = t('settings.storageLocations.deleteError');

      // Try to extract the exact error message from the API response
      if (error?.detail) {
        errorMessage = error.detail;
      } else if (error?.message?.includes("in use by filaments")) {
        errorMessage = t('settings.storageLocations.deleteErrorInUse');
      }

      toast({
        title: t('settings.storageLocations.deleteErrorTitle'),
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Mutation to delete all storage locations
  const deleteAllLocationsMutation = useMutation({
    mutationFn: async () => {
      // Delete all storage locations in parallel and ignore errors for individual ones
      const deletePromises = locations.map(location =>
        apiRequest(`/api/storage-locations/${location.id}`, {
          method: "DELETE"
        }).catch(err => {
          console.warn(`Error deleting storage location ${location.id}:`, err);
          return null; // Ignore errors for individual storage locations
        })
      );

      await Promise.all(deletePromises);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      toast({
        title: t('settings.storageLocations.deleteAllSuccess'),
        description: t('settings.storageLocations.deleteAllSuccessDescription')
      });
      setIsDeleteConfirmOpen(false);
    },
    onError: (error) => {
      console.error("Error deleting all storage locations:", error);
      toast({
        title: t('common.error'),
        description: t('settings.storageLocations.deleteAllError'),
        variant: "destructive"
      });
      // Still update the storage locations list so deleted locations are no longer shown
      queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
      setIsDeleteConfirmOpen(false);
    }
  });

  const populateDefaultsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/storage-locations/populate-defaults", {
        method: "POST"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
      toast({
        title: t('settings.storageLocations.populateDefaultsSuccess'),
        description: data?.message || t('settings.storageLocations.populateDefaultsSuccessDescription')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.storageLocations.populateDefaultsError'),
        variant: "destructive"
      });
    }
  });

  // Handler für das Absenden des Formulars
  const onSubmit = (data: FormValues) => {
    addLocationMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={populateDefaultsMutation.isPending}
                onClick={() => populateDefaultsMutation.mutate()}
              >
                {t('settings.storageLocations.populateDefaults')}
              </Button>
              <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={locations.length === 0}
                    className="theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                  >
                    {t('settings.storageLocations.deleteAll')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('settings.storageLocations.deleteAllConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('settings.storageLocations.deleteAllConfirmDescription', { count: locations.length })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAllLocationsMutation.mutate()}
                      className="theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    >
                      {t('settings.storageLocations.deleteAllConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">{t('settings.storageLocations.loading')}</div>
            ) : locations.length === 0 ? (
              <div className="text-center py-4 text-neutral-400">
                {t('settings.storageLocations.noStorageLocations')}
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-[65%]">Name</TableHead>
                      <TableHead className="text-right w-16">{t('settings.storageLocations.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="locations">
                      {(provided) => (
                        <TableBody
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                        >
                          {locations.map((location, index) => (
                            <Draggable
                              key={location.id.toString()}
                              draggableId={location.id.toString()}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <TableRow
                                  key={location.id}
                                  className={`h-10 ${snapshot.isDragging ? "opacity-50" : ""}`}
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                >
                                  <TableCell className="py-1 w-10">
                                    <div {...provided.dragHandleProps} className="cursor-grab">
                                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-1 truncate">
                                    <div className="max-w-full truncate" title={location.name}>
                                      {location.name}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right py-1 whitespace-nowrap w-16">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                                      onClick={() => deleteLocationMutation.mutate(location.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </TableBody>
                      )}
                    </Droppable>
                  </DragDropContext>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-medium mb-2">{t('settings.storageLocations.addTitle')}</h3>
              <p className="text-sm text-neutral-400 mb-4">
                {t('settings.storageLocations.addDescription')}
              </p>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.name')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('settings.storageLocations.namePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    disabled={addLocationMutation.isPending}
                  >
                    {t('settings.storageLocations.addButton')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>

      <ImportExportCard
        endpoint="/api/storage-locations"
        csvFormat={locationsCsvFormat}
        fields={["name"]}
        title={t('settings.storageLocations.importExport')}
      />
    </div>
  );
}

