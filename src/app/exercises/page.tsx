"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Pencil, Trash2, Loader2, Zap, Copy } from "lucide-react";
import { initializeDefaultExercises } from "@/lib/firestore/exercises";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useI18n, useCategoryLabel } from "@/lib/i18n";
import { CoachLibraryExcelActions } from "@/components/CoachLibraryExcelActions";

const categories = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"];

export default function ExercisesPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const catLabel = useCategoryLabel();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isAddingExercise, setIsAddingExercise] = useState(false);
  const [isEditingExercise, setIsEditingExercise] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [editingExercise, setEditingExercise] = useState<any>(null);
  
  const [newExercise, setNewExercise] = useState({
    name: "",
    category: "Chest",
    description: "",
    videoUrl: "",
    difficulty: "intermediate",
    equipment: ""
  });

  // Fetch exercises from Firestore
  const exercisesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "exercises");
  }, [db, user]);

  const { data: exercises, isLoading } = useCollection(exercisesQuery);

  const filteredExercises = exercises?.filter((ex) => {
    const matchesSearch = ex.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || ex.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }) || [];

  const handleAddExercise = async () => {
    if (!db || !user) return;
    if (!newExercise.name || !newExercise.category) {
      toast({
        variant: "destructive",
        title: t("missingInformation"),
        description: t("provideNameAndCategory"),
      });
      return;
    }

    setIsSaving(true);
    try {
      const exercisesCol = collection(db, "exercises");
      await addDocumentNonBlocking(exercisesCol, {
        ...newExercise,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });

      toast({
        title: t("exerciseAdded"),
        description: `${newExercise.name} ${t("addedToLibrary")}`,
      });

      setNewExercise({
        name: "",
        category: "Chest",
        description: "",
        videoUrl: "",
        difficulty: "intermediate",
        equipment: ""
      });
      setIsAddingExercise(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToAdd"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditExercise = async () => {
    if (!db || !user || !editingExercise) return;

    setIsSaving(true);
    try {
      const exerciseRef = doc(db, "exercises", editingExercise.id);
      await updateDocumentNonBlocking(exerciseRef, {
        name: editingExercise.name,
        category: editingExercise.category,
        description: editingExercise.description,
        videoUrl: editingExercise.videoUrl,
        difficulty: editingExercise.difficulty,
        equipment: editingExercise.equipment,
        updatedAt: new Date().toISOString(),
      });

      toast({
        title: t("exerciseUpdatedTitle"),
        description: `${editingExercise.name} ${t("exerciseUpdatedDesc")}`,
      });

      setEditingExercise(null);
      setIsEditingExercise(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToUpdate"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: string, exerciseName: string) => {
    if (!db || !user) return;
    
    if (!confirm(t("confirmDeleteExercise"))) return;

    try {
      const exerciseRef = doc(db, "exercises", exerciseId);
      await deleteDocumentNonBlocking(exerciseRef);

      toast({
        title: t("exerciseDeleted"),
        description: `${exerciseName} ${t("removedFromLibrary")}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToDelete"),
      });
    }
  };

  const handleDuplicateExercise = async (exercise: any) => {
    if (!db || !user) return;
    try {
      const exercisesCol = collection(db, "exercises");
      await addDocumentNonBlocking(exercisesCol, {
        name: `Copy of ${exercise.name}`,
        category: exercise.category,
        description: exercise.description || "",
        videoUrl: exercise.videoUrl || "",
        difficulty: exercise.difficulty || "intermediate",
        equipment: exercise.equipment || "",
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      toast({
        title: t("exerciseDuplicated"),
        description: t("exerciseDuplicatedDesc"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToDuplicate"),
      });
    }
  };

  const openEditDialog = (exercise: any) => {
    setEditingExercise({ ...exercise });
    setIsEditingExercise(true);
  };

  return (
    <Navigation>
      <div className="space-y-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex-1 w-full">
            <h2 className="text-2xl font-bold font-headline mb-4">{t("exerciseLibrary")}</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t("searchExercises")} 
                className="pl-10 h-12 text-lg" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <CoachLibraryExcelActions />
          <Dialog open={isAddingExercise} onOpenChange={setIsAddingExercise}>
            <DialogTrigger asChild>
              <Button className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                {t("addExerciseBtn")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("addNewExercise")}</DialogTitle>
                <DialogDescription>
                  {t("addNewExerciseDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("exerciseNameRequired")}</Label>
                    <Input 
                      id="name"
                      placeholder={t("placeholderExerciseName")}
                      value={newExercise.name}
                      onChange={(e) => setNewExercise({...newExercise, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">{t("categoryRequired")}</Label>
                    <Select value={newExercise.category} onValueChange={(val) => setNewExercise({...newExercise, category: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => c !== "All").map((cat) => (
                          <SelectItem key={cat} value={cat}>{catLabel(cat)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="difficulty">{t("difficulty")}</Label>
                    <Select value={newExercise.difficulty} onValueChange={(val) => setNewExercise({...newExercise, difficulty: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">{t("beginner")}</SelectItem>
                        <SelectItem value="intermediate">{t("intermediate")}</SelectItem>
                        <SelectItem value="advanced">{t("advanced")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="equipment">{t("equipment")}</Label>
                    <Input 
                      id="equipment"
                      placeholder={t("placeholderEquipment")}
                      value={newExercise.equipment}
                      onChange={(e) => setNewExercise({...newExercise, equipment: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t("description")}</Label>
                  <Textarea 
                    id="description"
                    placeholder={t("placeholderDescription")}
                    className="h-24"
                    value={newExercise.description}
                    onChange={(e) => setNewExercise({...newExercise, description: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="videoUrl">{t("videoUrl")}</Label>
                  <Input 
                    id="videoUrl"
                    placeholder={t("placeholderVideoUrl")}
                    type="url"
                    value={newExercise.videoUrl}
                    onChange={(e) => setNewExercise({...newExercise, videoUrl: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddingExercise(false)}>
                  {t("cancel")}
                </Button>
                <Button onClick={handleAddExercise} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {t("addExerciseBtn")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Edit Exercise Dialog */}
        <Dialog open={isEditingExercise} onOpenChange={setIsEditingExercise}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("editExerciseTitle")}</DialogTitle>
              <DialogDescription>
                {t("editExerciseDesc")}
              </DialogDescription>
            </DialogHeader>
            {editingExercise && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">{t("exerciseNameRequired")}</Label>
                    <Input 
                      id="edit-name"
                      value={editingExercise.name}
                      onChange={(e) => setEditingExercise({...editingExercise, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">{t("categoryRequired")}</Label>
                    <Select value={editingExercise.category} onValueChange={(val) => setEditingExercise({...editingExercise, category: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => c !== "All").map((cat) => (
                          <SelectItem key={cat} value={cat}>{catLabel(cat)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-difficulty">{t("difficulty")}</Label>
                    <Select value={editingExercise.difficulty} onValueChange={(val) => setEditingExercise({...editingExercise, difficulty: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">{t("beginner")}</SelectItem>
                        <SelectItem value="intermediate">{t("intermediate")}</SelectItem>
                        <SelectItem value="advanced">{t("advanced")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-equipment">{t("equipment")}</Label>
                    <Input 
                      id="edit-equipment"
                      value={editingExercise.equipment || ""}
                      onChange={(e) => setEditingExercise({...editingExercise, equipment: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">{t("description")}</Label>
                  <Textarea 
                    id="edit-description"
                    className="h-24"
                    value={editingExercise.description || ""}
                    onChange={(e) => setEditingExercise({...editingExercise, description: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-videoUrl">{t("videoUrl")}</Label>
                  <Input 
                    id="edit-videoUrl"
                    type="url"
                    value={editingExercise.videoUrl || ""}
                    onChange={(e) => setEditingExercise({...editingExercise, videoUrl: e.target.value})}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditingExercise(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={handleEditExercise} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="All" onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-card border p-1 mb-4">
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="px-3 py-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {catLabel(cat)}
              </TabsTrigger>
            ))}
          </TabsList>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredExercises.map((ex) => (
                <Card key={ex.id} className="group hover:border-primary transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-2">{ex.name}</CardTitle>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          title={t("duplicateExercise")}
                          onClick={() => handleDuplicateExercise(ex)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          onClick={() => openEditDialog(ex)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => handleDeleteExercise(ex.id, ex.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Badge variant="secondary" className="w-fit">{ex.category}</Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {ex.description || t("noDescriptionAvailable")}
                    </p>
                    {ex.equipment && (
                      <p className="text-xs text-muted-foreground mb-2">
                        <strong>{t("equipmentLabel")}</strong> {ex.equipment}
                      </p>
                    )}
                    {ex.difficulty && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {ex.difficulty}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
              {filteredExercises.length === 0 && !isLoading && (
                <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg px-4">
                  <p className="text-base sm:text-lg font-medium mb-2">{t("noExercisesFound")}</p>
                  <p className="text-xs sm:text-sm break-words mb-4">
                    {searchQuery
                      ? t("tryDifferentSearch")
                      : t("addExercisesManually")}
                  </p>
                  {!searchQuery && (
                    <Button
                      variant="secondary"
                      className="gap-2"
                      disabled={isInitializing}
                      onClick={async () => {
                        if (!db || !user) return;
                        setIsInitializing(true);
                        try {
                          const result = await initializeDefaultExercises(db, user.uid);
                          toast({
                            title: result.success ? "Success" : "Error",
                            description: result.message,
                            variant: result.success ? "default" : "destructive",
                          });
                        } catch {
                          toast({ variant: "destructive", title: "Error", description: "Failed to initialize exercises." });
                        } finally {
                          setIsInitializing(false);
                        }
                      }}
                    >
                      {isInitializing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      {t("loadDefaultExercises")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </Tabs>
      </div>
    </Navigation>
  );
}
