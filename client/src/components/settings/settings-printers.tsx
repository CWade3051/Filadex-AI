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

interface Printer {
  id: number;
  name: string;
  manufacturer?: string;
  model?: string;
  sortOrder?: number;
  createdAt?: string;
}

const createPrinterSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t('settings.printers.nameRequired')),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
});

export function PrintersList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const { t } = useTranslation();
  
  const { data: printers = [], isLoading } = useQuery({
    queryKey: ["/api/printers"],
    queryFn: () => apiRequest<Printer[]>("/api/printers")
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, newOrder }: { id: number, newOrder: number }) => {
      return apiRequest(`/api/printers/${id}/order`, {
        method: "PATCH",
        body: JSON.stringify({ newOrder })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
    },
    onError: (error) => {
      console.error("Error updating order:", error);
      toast({
        title: t('common.error'),
        description: t('settings.printers.orderError'),
        variant: "destructive"
      });
    }
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    if (sourceIndex === destinationIndex) return;
    const item = printers[sourceIndex];
    updateOrderMutation.mutate({ id: item.id, newOrder: destinationIndex });
  };

  const filteredPrinters = useMemo(() => {
    return printers.filter(printer =>
      printer.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [printers, searchTerm]);

  const printerSchema = createPrinterSchema(t);
  type FormValues = z.infer<typeof printerSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(printerSchema),
    defaultValues: {
      name: "",
      manufacturer: "",
      model: "",
    }
  });

  const addPrinterMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest<Printer>("/api/printers", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      form.reset();
      toast({
        title: t('common.success'),
        description: t('settings.printers.addSuccess')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.printers.addError'),
        variant: "destructive"
      });
    }
  });

  const deletePrinterMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/printers/${id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast({
        title: t('common.success'),
        description: t('settings.printers.deleteSuccess')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.printers.deleteError'),
        variant: "destructive"
      });
    }
  });

  const deleteAllPrintersMutation = useMutation({
    mutationFn: async () => {
      const deletePromises = printers.map(printer =>
        apiRequest(`/api/printers/${printer.id}`, {
          method: "DELETE"
        }).catch(err => {
          console.warn(`Error deleting printer ${printer.id}:`, err);
          return null;
        })
      );
      await Promise.all(deletePromises);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast({
        title: t('common.success'),
        description: t('settings.printers.deleteAllSuccess')
      });
      setIsDeleteConfirmOpen(false);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.printers.deleteAllError'),
        variant: "destructive"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      setIsDeleteConfirmOpen(false);
    }
  });

  const onSubmit = (data: FormValues) => {
    addPrinterMutation.mutate(data);
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
                  placeholder={t('settings.printers.searchPlaceholder')}
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
                      disabled={printers.length === 0}
                      className="theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    >
                      {t('settings.printers.deleteAll')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('settings.printers.deleteAllConfirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('settings.printers.deleteAllConfirmDescription', { count: printers.length })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAllPrintersMutation.mutate()}
                        className="theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                      >
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">{t('common.loading')}</div>
            ) : filteredPrinters.length === 0 ? (
              <div className="text-center py-4 text-neutral-400">
                {printers.length === 0 ? t('settings.printers.noPrinters') : t('common.noResults')}
              </div>
            ) : (
              <div className="max-h-[350px] overflow-y-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-[65%]">{t('common.name')}</TableHead>
                      <TableHead className="text-right w-16">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="printers">
                      {(provided) => (
                        <TableBody
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                        >
                          {filteredPrinters.map((printer, index) => (
                            <Draggable
                              key={printer.id.toString()}
                              draggableId={printer.id.toString()}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <TableRow
                                  key={printer.id}
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
                                    <div className="max-w-full truncate" title={printer.name}>
                                      {printer.name}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right py-1 whitespace-nowrap w-16">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                                      onClick={() => deletePrinterMutation.mutate(printer.id)}
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
              <h3 className="text-lg font-medium mb-2">{t('settings.printers.addTitle')}</h3>
              <p className="text-sm text-neutral-400 mb-4">
                {t('settings.printers.addDescription')}
              </p>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.name')} *</FormLabel>
                        <FormControl>
                          <Input placeholder={t('settings.printers.namePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    disabled={addPrinterMutation.isPending}
                  >
                    {t('settings.printers.addButton')}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
