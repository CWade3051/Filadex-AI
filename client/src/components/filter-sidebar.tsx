import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Filament } from "@shared/schema";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronDown, ChevronsUpDown, X, Search, Plus, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

interface MaterialDistribution {
  name: string;
  percentage: number;
}

interface Statistics {
  totalSpools: number;
  totalWeight: string;
  remainingWeight: string;
  averageRemaining: number;
  lowStockCount: number;
  materialDistribution: MaterialDistribution[];
  topMaterials: string[];
  topColors: string[];
  estimatedValue: number;
  totalPurchaseValue: number;
  averageAge: number;
  oldestFilament?: {name: string, days: number} | null;
  newestFilament?: {name: string, days: number} | null;
}

interface Manufacturer {
  id: number;
  name: string;
  createdAt: string;
}

interface Color {
  id: number;
  name: string;
  code: string;
  createdAt: string;
}

interface StorageLocation {
  id: number;
  name: string;
  createdAt: string;
}

interface FilterSidebarProps {
  onSearchChange: (search: string) => void;
  onMaterialChange: (materials: string[]) => void;
  onMaxRemaining: (value: number) => void;
  onMinRemaining: (value: number) => void;
  onManufacturerChange: (manufacturers: string[]) => void;
  onColorChange: (colors: string[]) => void;
  onStorageLocationChange?: (locations: string[]) => void;
  onShowArchivedChange?: (show: boolean) => void;
  showArchived?: boolean;
  filaments?: Filament[];
}

export function FilterSidebar({
  onSearchChange,
  onMaterialChange,
  onMaxRemaining,
  onMinRemaining,
  onManufacturerChange,
  onColorChange,
  onStorageLocationChange,
  onShowArchivedChange,
  showArchived = false,
  filaments = []
}: FilterSidebarProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [selectedManufacturers, setSelectedManufacturers] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);
  const [maxRemaining, setMaxRemaining] = useState(100);  // Show filaments with AT MOST this %
  const [minRemaining, setMinRemaining] = useState(0);    // Show filaments with AT LEAST this %
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeFilterCount = [
    searchTerm.trim() ? 1 : 0,
    selectedMaterials.length ? 1 : 0,
    selectedManufacturers.length ? 1 : 0,
    selectedColors.length ? 1 : 0,
    selectedLocations.length ? 1 : 0,
    maxRemaining !== 100 ? 1 : 0,
    minRemaining !== 0 ? 1 : 0,
    showArchived ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);

  // Laden der Hersteller, Materialien und Farben aus der Datenbank
  const { data: manufacturers = [], isLoading: isLoadingManufacturers } = useQuery({
    queryKey: ['/api/manufacturers'],
    queryFn: () => apiRequest<Manufacturer[]>('/api/manufacturers')
  });

  const { data: materials = [], isLoading: isLoadingMaterials } = useQuery({
    queryKey: ['/api/materials'],
    queryFn: () => apiRequest<{id: number, name: string, createdAt: string}[]>('/api/materials')
  });

  const { data: colors = [], isLoading: isLoadingColors } = useQuery({
    queryKey: ['/api/colors'],
    queryFn: () => apiRequest<Color[]>('/api/colors')
  });

  const { data: storageLocations = [], isLoading: isLoadingLocations } = useQuery({
    queryKey: ['/api/storage-locations'],
    queryFn: () => apiRequest<StorageLocation[]>('/api/storage-locations')
  });

  // Filter manufacturers, materials, and colors to only show those that exist in actual filaments
  const availableManufacturers = useMemo(() => {
    if (filaments.length === 0) return [];
    const usedManufacturers = new Set(
      filaments
        .map(f => f.manufacturer)
        .filter((m): m is string => !!m)
    );
    return manufacturers.filter(m => usedManufacturers.has(m.name));
  }, [manufacturers, filaments]);

  const availableMaterials = useMemo(() => {
    if (filaments.length === 0) return [];
    const usedMaterials = new Set(
      filaments
        .map(f => f.material)
        .filter((m): m is string => !!m)
    );
    return materials.filter(m => usedMaterials.has(m.name));
  }, [materials, filaments]);

  const availableColors = useMemo(() => {
    if (filaments.length === 0) return [];
    const usedColors = new Set(
      filaments
        .map(f => f.colorName)
        .filter((c): c is string => !!c)
    );
    return colors.filter(c => usedColors.has(c.name));
  }, [colors, filaments]);

  // Only show storage locations that are actually used by filaments
  const availableLocations = useMemo(() => {
    if (filaments.length === 0) return [];
    const usedLocations = new Set(
      filaments
        .map(f => f.storageLocation)
        .filter((l): l is string => !!l && l.trim() !== '')
    );
    return storageLocations.filter(l => usedLocations.has(l.name));
  }, [storageLocations, filaments]);

  // Update parent component when filters change
  useEffect(() => {
    onSearchChange(searchTerm);
  }, [searchTerm, onSearchChange]);

  useEffect(() => {
    onMaterialChange(selectedMaterials);
  }, [selectedMaterials, onMaterialChange]);

  useEffect(() => {
    onManufacturerChange(selectedManufacturers);
  }, [selectedManufacturers, onManufacturerChange]);

  useEffect(() => {
    onColorChange(selectedColors);
  }, [selectedColors, onColorChange]);

  useEffect(() => {
    if (onStorageLocationChange) {
      onStorageLocationChange(selectedLocations);
    }
  }, [selectedLocations, onStorageLocationChange]);

  useEffect(() => {
    onMinRemaining(minRemaining);
  }, [minRemaining, onMinRemaining]);

  // Handle material selection/deselection
  const handleMaterialSelect = (material: string) => {
    setSelectedMaterials(prev => {
      // If already selected, remove it
      if (prev.includes(material)) {
        return prev.filter(m => m !== material);
      }
      // Otherwise add it
      return [...prev, material];
    });
  };

  // Remove a single material from selection
  const removeMaterial = (material: string) => {
    setSelectedMaterials(prev => prev.filter(m => m !== material));
  };

  // Clear all selected materials
  const clearMaterials = () => {
    setSelectedMaterials([]);
  };

  // Handle manufacturer selection/deselection
  const handleManufacturerSelect = (manufacturer: string) => {
    setSelectedManufacturers(prev => {
      if (prev.includes(manufacturer)) {
        return prev.filter(m => m !== manufacturer);
      }
      return [...prev, manufacturer];
    });
  };

  // Remove a single manufacturer from selection
  const removeManufacturer = (manufacturer: string) => {
    setSelectedManufacturers(prev => prev.filter(m => m !== manufacturer));
  };

  // Clear all selected manufacturers
  const clearManufacturers = () => {
    setSelectedManufacturers([]);
  };

  // Handle color selection/deselection
  const handleColorSelect = (color: string) => {
    setSelectedColors(prev => {
      if (prev.includes(color)) {
        return prev.filter(c => c !== color);
      }
      return [...prev, color];
    });
  };

  // Remove a single color from selection
  const removeColor = (color: string) => {
    setSelectedColors(prev => prev.filter(c => c !== color));
  };

  // Clear all selected colors
  const clearColors = () => {
    setSelectedColors([]);
  };

  // Handle storage location selection/deselection
  const handleLocationSelect = (location: string) => {
    setSelectedLocations(prev => {
      if (prev.includes(location)) {
        return prev.filter(l => l !== location);
      }
      return [...prev, location];
    });
    // Close the popover after selection
    setLocationPopoverOpen(false);
  };

  // Remove a single location from selection
  const removeLocation = (location: string) => {
    setSelectedLocations(prev => prev.filter(l => l !== location));
  };

  // Clear all selected locations
  const clearLocations = () => {
    setSelectedLocations([]);
  };

  return (
    <aside className="dark:bg-neutral-900 bg-white p-4 rounded-lg shadow-md border border-gray-200 dark:border-neutral-700 h-fit lg:sticky lg:top-4 lg:max-h-screen lg:overflow-y-auto">
      <div className="flex items-center justify-between mb-3 sm:hidden">
        <div className="flex items-center gap-2">
          <span className="text-lg font-medium dark:text-neutral-400 text-gray-700">{t('filters.searchFilaments')}</span>
          {activeFilterCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => setMobileFiltersOpen((prev) => !prev)}
          aria-expanded={mobileFiltersOpen}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", mobileFiltersOpen && "rotate-180")} />
        </Button>
      </div>

      <div className={cn(mobileFiltersOpen ? "block" : "hidden", "sm:block")}>
      <div className="mb-6">
        <h2 className="hidden sm:block text-lg font-medium dark:text-neutral-400 text-gray-700 mb-3">{t('filters.searchFilaments')}</h2>
        <div className="relative">
          <Input
            type="text"
            placeholder={t('filters.searchByNameManufacturer')}
            className="w-full pl-3 pr-9 py-2 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 bg-white border-gray-300 text-gray-800 rounded-md focus:outline-none focus:ring-1 focus:border-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute right-3 top-3 dark:text-neutral-400 text-gray-500 pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-medium dark:text-neutral-400 text-gray-700 mb-3">{t('filters.manufacturerFilter')}</h2>
        <div className="space-y-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 bg-white border-gray-300 text-gray-800 hover:bg-gray-100 hover:text-gray-900"
              >
                {selectedManufacturers.length === 0
                  ? t('filters.selectManufacturer')
                  : `${selectedManufacturers.length} ${t('filters.selected')}`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder={t('filters.searchManufacturer')} />
                <CommandEmpty>{t('filters.noManufacturerFound')}</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {availableManufacturers.map((manufacturer) => (
                    <CommandItem
                      key={manufacturer.id}
                      value={manufacturer.name}
                      onSelect={() => handleManufacturerSelect(manufacturer.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedManufacturers.includes(manufacturer.name) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {manufacturer.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedManufacturers.length > 0 && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm dark:text-neutral-400 text-gray-600">{t('filters.selectedManufacturers')}</span>
                <button
                  className="text-xs dark:text-neutral-400 dark:hover:text-neutral-200 text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={clearManufacturers}
                >
                  {t('filters.clearAll')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedManufacturers.map(manufacturer => (
                  <Badge
                    key={manufacturer}
                    variant="outline"
                    className="theme-badge flex items-center gap-1 dark:bg-primary/10 dark:text-neutral-200 bg-primary/10 text-gray-800"
                  >
                    {manufacturer}
                    <button
                      onClick={() => removeManufacturer(manufacturer)}
                      className="hover:text-white ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-medium dark:text-neutral-400 text-gray-700 mb-3">{t('filters.materialFilter')}</h2>
        <div className="space-y-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 bg-white border-gray-300 text-gray-800 hover:bg-gray-100 hover:text-gray-900"
              >
                {selectedMaterials.length === 0
                  ? t('filters.selectMaterial')
                  : `${selectedMaterials.length} ${t('filters.selected')}`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder={t('filters.searchMaterial')} />
                <CommandEmpty>{t('filters.noMaterialFound')}</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {availableMaterials.map((material) => (
                    <CommandItem
                      key={material.id}
                      value={material.name}
                      onSelect={() => handleMaterialSelect(material.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedMaterials.includes(material.name) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {material.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedMaterials.length > 0 && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm dark:text-neutral-400 text-gray-600">{t('filters.selectedMaterials')}</span>
                <button
                  className="text-xs dark:text-neutral-400 dark:hover:text-neutral-200 text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={clearMaterials}
                >
                  {t('filters.clearAll')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedMaterials.map(material => (
                  <Badge
                    key={material}
                    variant="outline"
                    className="theme-badge flex items-center gap-1 dark:bg-primary/10 dark:text-neutral-200 bg-primary/10 text-gray-800"
                  >
                    {material}
                    <button
                      onClick={() => removeMaterial(material)}
                      className="hover:text-white ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-medium dark:text-neutral-400 text-gray-700 mb-3">{t('filters.colorFilter')}</h2>
        <div className="space-y-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 bg-white border-gray-300 text-gray-800 hover:bg-gray-100 hover:text-gray-900"
              >
                {selectedColors.length === 0
                  ? t('filters.selectColor')
                  : `${selectedColors.length} ${t('filters.selected')}`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder={t('filters.searchColor')} />
                <CommandEmpty>{t('filters.noColorFound')}</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {availableColors.map((color) => (
                    <CommandItem
                      key={color.id}
                      value={color.name}
                      onSelect={() => handleColorSelect(color.name)}
                    >
                      <div className="flex items-center w-full">
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedColors.includes(color.name) ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div
                          className="w-4 h-4 rounded-full mr-2"
                          style={{ backgroundColor: color.code }}
                        />
                        {color.name}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedColors.length > 0 && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm dark:text-neutral-400 text-gray-600">{t('filters.selectedColors')}</span>
                <button
                  className="text-xs dark:text-neutral-400 dark:hover:text-neutral-200 text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={clearColors}
                >
                  {t('filters.clearAll')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedColors.map(colorName => {
                  const colorItem = colors.find(c => c.name === colorName);
                  return (
                    <Badge
                      key={colorName}
                      variant="outline"
                      className="theme-badge flex items-center gap-1 dark:bg-primary/10 dark:text-neutral-200 bg-primary/10 text-gray-800"
                    >
                      <div
                        className="w-3 h-3 rounded-full mr-1"
                        style={{ backgroundColor: colorItem?.code || '#ccc' }}
                      />
                      {colorName}
                      <button
                        onClick={() => removeColor(colorName)}
                        className="hover:text-white ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-medium dark:text-neutral-400 text-gray-700 mb-3">{t('filters.storageLocationFilter') || 'Storage Location'}</h2>
        <div className="space-y-4">
          <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={locationPopoverOpen}
                className="w-full justify-between dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 bg-white border-gray-300 text-gray-800 hover:bg-gray-100 hover:text-gray-900"
              >
                {selectedLocations.length === 0
                  ? (t('filters.selectStorageLocation') || 'Select location...')
                  : `${selectedLocations.length} ${t('filters.selected')}`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder={t('filters.searchStorageLocation') || 'Search locations...'} />
                <CommandEmpty>{t('filters.noStorageLocationFound') || 'No location found.'}</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {availableLocations.map((location) => (
                    <CommandItem
                      key={location.id}
                      value={location.name}
                      onSelect={() => handleLocationSelect(location.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedLocations.includes(location.name) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {location.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedLocations.length > 0 && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm dark:text-neutral-400 text-gray-600">{t('filters.selectedStorageLocations') || 'Selected Locations:'}</span>
                <button
                  className="text-xs dark:text-neutral-400 dark:hover:text-neutral-200 text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={clearLocations}
                >
                  {t('filters.clearAll')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedLocations.map(location => (
                  <Badge
                    key={location}
                    variant="outline"
                    className="theme-badge flex items-center gap-1 dark:bg-primary/10 dark:text-neutral-200 bg-primary/10 text-gray-800"
                  >
                    {location}
                    <button
                      onClick={() => removeLocation(location)}
                      className="hover:text-white ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-2 sm:mb-6">
        <h2 className="text-lg font-medium dark:text-neutral-400 text-gray-700 mb-3">{t('filters.inventory')}</h2>
        <div className="space-y-4">
          {/* Max Remaining Filter - show filaments with AT MOST this % */}
          <div>
            <span className="dark:text-neutral-400 text-gray-700 block mb-1">{t('filters.maxRemainingPercentage')}</span>
            <Slider
              value={[maxRemaining]}
              min={0}
              max={100}
              step={5}
              onValueChange={(values) => {
                setMaxRemaining(values[0]);
                onMaxRemaining(values[0]);
              }}
              className="w-full"
            />
            <div className="flex justify-between text-sm dark:text-neutral-300 text-gray-500 px-1 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <div className="text-xs dark:text-neutral-400 text-gray-600 mt-2">
              {t('filters.showFilamentsWithMax')} {maxRemaining}% {t('filters.fillLevel')}
            </div>
          </div>
          
          {/* Min Remaining Filter - show filaments with AT LEAST this % */}
          <div>
            <span className="dark:text-neutral-400 text-gray-700 block mb-1">{t('filters.minRemainingPercentage') || "Min. Remaining (%)"}</span>
            <Slider
              value={[minRemaining]}
              min={0}
              max={100}
              step={5}
              onValueChange={(values) => {
                setMinRemaining(values[0]);
                onMinRemaining(values[0]);
              }}
              className="w-full"
            />
            <div className="flex justify-between text-sm dark:text-neutral-300 text-gray-500 px-1 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <div className="text-xs dark:text-neutral-400 text-gray-600 mt-2">
              {t('filters.showFilamentsWithMin') || "Show filaments with min."} {minRemaining}% {t('filters.fillLevel')}
            </div>
          </div>

          {/* Show Archived Toggle */}
          {onShowArchivedChange && (
            <div className="flex items-center justify-between pt-2 border-t dark:border-neutral-700 border-gray-200">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 dark:text-neutral-400 text-gray-500" />
                <Label htmlFor="show-archived" className="text-sm dark:text-neutral-400 text-gray-700 cursor-pointer">
                  {t('filaments.showArchived')}
                </Label>
              </div>
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={onShowArchivedChange}
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </aside>
  );
}
