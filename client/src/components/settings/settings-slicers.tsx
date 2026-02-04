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

interface Slicer {
  id: number;
  name: string;
  sortOrder?: number;
  createdAt?: string;
}

const createSlicerSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t('settings.slicers.nameRequired')),
});

export function SlicersList() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const { t } = useTranslation();
  
  const { data: slicers = [], isLoading } = useQuery({
    queryKey: ["/api/slicers"],
    queryFn: () => apiRequest<Slicer[]>("/api/slicers")
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, newOrder }: { id: number, newOrder: number }) => {
      return apiRequest(`/api/slicers/${id}/order`, {
        method: "PATCH",
        body: JSON.stringify({ newOrder })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicers"] });
    },
    onError: (error) => {
      console.error("Error updating order:", error);
      toast({
        title: t('common.error'),
        description: t('settings.slicers.orderError'),
        variant: "destructive"
      });
    }
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;
    if (sourceIndex === destinationIndex) return;
    const item = slicers[sourceIndex];
    updateOrderMutation.mutate({ id: item.id, newOrder: destinationIndex });
  };

  const filteredSlicers = useMemo(() => {
    return slicers.filter(slicer =>
      slicer.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [slicers, searchTerm]);

  const slicerSchema = createSlicerSchema(t);
  type FormValues = z.infer<typeof slicerSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(slicerSchema),
    defaultValues: {
      name: "",
    }
  });

  const addSlicerMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest<Slicer>("/api/slicers", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicers"] });
      form.reset();
      toast({
        title: t('common.success'),
        description: t('settings.slicers.addSuccess')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.slicers.addError'),
        variant: "destructive"
      });
    }
  });

  const deleteSlicerMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/slicers/${id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicers"] });
      toast({
        title: t('common.success'),
        description: t('settings.slicers.deleteSuccess')
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.slicers.deleteError'),
        variant: "destructive"
      });
    }
  });

  const deleteAllSlicersMutation = useMutation({
    mutationFn: async () => {
      const deletePromises = slicers.map(slicer =>
        apiRequest(`/api/slicers/${slicer.id}`, {
          method: "DELETE"
        }).catch(err => {
          console.warn(`Error deleting slicer ${slicer.id}:`, err);
          return null;
        })
      );
      await Promise.all(deletePromises);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slicers"] });
      toast({
        title: t('common.success'),
        description: t('settings.slicers.deleteAllSuccess')
      });
      setIsDeleteConfirmOpen(false);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('settings.slicers.deleteAllError'),
        variant: "destructive"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/slicers"] });
      setIsDeleteConfirmOpen(false);
    }
  });

  const onSubmit = (data: FormValues) => {
    addSlicerMutation.mutate(data);
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
                  placeholder={t('settings.slicers.searchPlaceholder')}
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
                      disabled={slicers.length === 0}
                      className="theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    >
                      {t('settings.slicers.deleteAll')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('settings.slicers.deleteAllConfirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('settings.slicers.deleteAllConfirmDescription', { count: slicers.length })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAllSlicersMutation.mutate()}
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
            ) : filteredSlicers.length === 0 ? (
              <div className="text-center py-4 text-neutral-400">
                {slicers.length === 0 ? t('settings.slicers.noSlicers') : t('common.noResults')}
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
                    <Droppable droppableId="slicers">
                      {(provided) => (
                        <TableBody
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                        >
                          {filteredSlicers.map((slicer, index) => (
                            <Draggable
                              key={slicer.id.toString()}
                              draggableId={slicer.id.toString()}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <TableRow
                                  key={slicer.id}
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
                                    <div className="max-w-full truncate" title={slicer.name}>
                                      {slicer.name}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right py-1 whitespace-nowrap w-16">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                                      onClick={() => deleteSlicerMutation.mutate(slicer.id)}
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
              <h3 className="text-lg font-medium mb-2">{t('settings.slicers.addTitle')}</h3>
              <p className="text-sm text-neutral-400 mb-4">
                {t('settings.slicers.addDescription')}
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
                          <Input placeholder={t('settings.slicers.namePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full theme-primary-bg-20 hover:theme-primary-bg-30 text-white border-white/20"
                    disabled={addSlicerMutation.isPending}
                  >
                    {t('settings.slicers.addButton')}
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
