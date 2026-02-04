import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Search, X, Trash2, GripVertical } from "lucide-react";
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
import { Manufacturer, createManufacturerSchema } from "./settings-types";
import { ImportExportCard } from "./settings-import-export-card";

export function ManufacturersList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const { t } = useTranslation();
  const { data: manufacturers = [], isLoading } = useQuery({
    queryKey: ["/api/manufacturers"],
    queryFn: () => apiRequest<Manufacturer[]>("/api/manufacturers")
  });

  // Funktion zum Aktualisieren der Reihenfolge
  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, newOrder }: { id: number, newOrder: number }) => {
      return apiRequest(`/api/manufacturers/${id}/order`, {
        method: "PATCH",
        body: JSON.stringify({ newOrder })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
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

    const item = manufacturers[sourceIndex];
    updateOrderMutation.mutate({ id: item.id, newOrder: destinationIndex });
  };

  // CSV Format für Hersteller
  const manufacturersCsvFormat = `Name
Bambu Lab
Prusament
Polymaker
...`;

  // Gefilterte Hersteller basierend auf der Suche
  const filteredManufacturers = useMemo(() => {
    return manufacturers.filter(manufacturer =>
      manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [manufacturers, searchTerm]);

  // Create schema with translations
  const manufacturerSchema = createManufacturerSchema(t);
  type FormValues = z.infer<typeof manufacturerSchema>;

  // Form hook
  const form = useForm<FormValues>({
    resolver: zodResolver(manufacturerSchema),
    defaultValues: {
      name: ""
    }
  });

  // Mutation to add a manufacturer
  const addManufacturerMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest<Manufacturer>("/api/manufacturers", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      form.reset();
      toast({
        title: t('settings.manufacturers.addSuccess'),
        description: t('settings.manufacturers.addSuccessDescription')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.manufacturers.addError'),
        variant: "destructive"
      });
    }
  });

  // Mutation to delete a manufacturer
  const deleteManufacturerMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/manufacturers/${id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      toast({
        title: t('settings.manufacturers.deleteSuccess'),
        description: t('settings.manufacturers.deleteSuccessDescription')
      });
    },
    onError: (error: any) => {
      let errorMessage = t('settings.manufacturers.deleteError');

      // Try to extract the exact error message from the API response
      if (error?.detail) {
        errorMessage = error.detail;
      } else if (error?.message?.includes("in use by filaments")) {
        errorMessage = t('settings.manufacturers.deleteErrorInUse');
      }

      toast({
        title: t('settings.manufacturers.deleteErrorTitle'),
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Mutation to delete all manufacturers
  const deleteAllManufacturersMutation = useMutation({
    mutationFn: async () => {
      // Delete all manufacturers in parallel and ignore errors for individual ones
      const deletePromises = manufacturers.map(manufacturer =>
        apiRequest(`/api/manufacturers/${manufacturer.id}`, {
          method: "DELETE"
        }).catch(err => {
          console.warn(`Error deleting manufacturer ${manufacturer.id}:`, err);
          return null; // Ignore errors for individual manufacturers
        })
      );

      await Promise.all(deletePromises);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filaments"] });
      toast({
        title: t('settings.manufacturers.deleteAllSuccess'),
        description: t('settings.manufacturers.deleteAllSuccessDescription')
      });
      setIsDeleteConfirmOpen(false);
    },
    onError: (error) => {
      console.error("Error deleting all manufacturers:", error);
      toast({
        title: t('common.error'),
        description: t('settings.manufacturers.deleteAllError'),
        variant: "destructive"
      });
      // Still update the manufacturers list so deleted manufacturers are no longer shown
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      setIsDeleteConfirmOpen(false);
    }
  });

  const onSubmit = (data: FormValues) => {
    addManufacturerMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex flex-col space-y-2">
              <div className="relative w-full">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('settings.manufacturers.searchPlaceholder')}
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9"
                    onClick={() => setSearchTerm("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex justify-end">
                <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={manufacturers.length === 0}
                      className="theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    >
                      {t('settings.manufacturers.deleteAll')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('settings.manufacturers.deleteAllConfirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('settings.manufacturers.deleteAllConfirmDescription', { count: manufacturers.length })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAllManufacturersMutation.mutate()}
                        className="theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                      >
                        {t('settings.manufacturers.deleteAllConfirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">{t('settings.manufacturers.loading')}</div>
            ) : filteredManufacturers.length === 0 ? (
              <div className="text-center py-4 text-neutral-400">
                {manufacturers.length === 0 ? t('settings.manufacturers.noManufacturers') : t('common.noResults')}
              </div>
            ) : (
              <div className="max-h-[350px] overflow-y-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-[65%]">Name</TableHead>
                      <TableHead className="text-right w-16">{t('settings.manufacturers.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="manufacturers">
                      {(provided) => (
                        <TableBody
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                        >
                          {filteredManufacturers.map((manufacturer, index) => (
                            <Draggable
                              key={manufacturer.id.toString()}
                              draggableId={manufacturer.id.toString()}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <TableRow
                                  key={manufacturer.id}
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
                                    <div className="max-w-full truncate" title={manufacturer.name}>
                                      {manufacturer.name}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right py-1 whitespace-nowrap w-16">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                                      onClick={() => deleteManufacturerMutation.mutate(manufacturer.id)}
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
              <h3 className="text-lg font-medium mb-2">{t('settings.manufacturers.addTitle')}</h3>
              <p className="text-sm text-neutral-400 mb-4">
                {t('settings.manufacturers.addDescription')}
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
                          <Input placeholder={t('settings.manufacturers.namePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    disabled={addManufacturerMutation.isPending}
                  >
                    {t('settings.manufacturers.addButton')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>

      <ImportExportCard
        endpoint="/api/manufacturers"
        csvFormat={manufacturersCsvFormat}
        fields={["name"]}
        title={t('settings.manufacturers.importExport')}
      />
    </div>
  );
}

