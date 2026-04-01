"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Pencil, Trash2, Loader2, Zap } from "lucide-react";
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

const categories = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"];

export default function ExercisesPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
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
        title: "Missing Information",
        description: "Please provide at least a name and category.",
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
        title: "Exercise Added",
        description: `${newExercise.name} has been added to the library.`,
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
        title: "Error",
        description: "Failed to add exercise. Please try again.",
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
        title: "Exercise Updated",
        description: `${editingExercise.name} has been updated.`,
      });

      setEditingExercise(null);
      setIsEditingExercise(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update exercise.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: string, exerciseName: string) => {
    if (!db || !user) return;
    
    if (!confirm(`Are you sure you want to delete "${exerciseName}"?`)) return;

    try {
      const exerciseRef = doc(db, "exercises", exerciseId);
      await deleteDocumentNonBlocking(exerciseRef);

      toast({
        title: "Exercise Deleted",
        description: `${exerciseName} has been removed from the library.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete exercise.",
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
            <h2 className="text-2xl font-bold font-headline mb-4">Exercise Library</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search exercises..." 
                className="pl-10 h-12 text-lg" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <Dialog open={isAddingExercise} onOpenChange={setIsAddingExercise}>
            <DialogTrigger asChild>
              <Button className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                Add Exercise
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Exercise</DialogTitle>
                <DialogDescription>
                  Add a new exercise to your library for use in workout programs.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Exercise Name *</Label>
                    <Input 
                      id="name"
                      placeholder="e.g. Barbell Bench Press"
                      value={newExercise.name}
                      onChange={(e) => setNewExercise({...newExercise, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select value={newExercise.category} onValueChange={(val) => setNewExercise({...newExercise, category: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => c !== "All").map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="difficulty">Difficulty</Label>
                    <Select value={newExercise.difficulty} onValueChange={(val) => setNewExercise({...newExercise, difficulty: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="equipment">Equipment</Label>
                    <Input 
                      id="equipment"
                      placeholder="e.g. Barbell, Bench"
                      value={newExercise.equipment}
                      onChange={(e) => setNewExercise({...newExercise, equipment: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description"
                    placeholder="Brief description of the exercise and technique..."
                    className="h-24"
                    value={newExercise.description}
                    onChange={(e) => setNewExercise({...newExercise, description: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="videoUrl">Video URL (optional)</Label>
                  <Input 
                    id="videoUrl"
                    placeholder="https://youtube.com/..."
                    type="url"
                    value={newExercise.videoUrl}
                    onChange={(e) => setNewExercise({...newExercise, videoUrl: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddingExercise(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddExercise} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add Exercise
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Exercise Dialog */}
        <Dialog open={isEditingExercise} onOpenChange={setIsEditingExercise}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Exercise</DialogTitle>
              <DialogDescription>
                Update the exercise details.
              </DialogDescription>
            </DialogHeader>
            {editingExercise && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Exercise Name *</Label>
                    <Input 
                      id="edit-name"
                      value={editingExercise.name}
                      onChange={(e) => setEditingExercise({...editingExercise, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-category">Category *</Label>
                    <Select value={editingExercise.category} onValueChange={(val) => setEditingExercise({...editingExercise, category: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => c !== "All").map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-difficulty">Difficulty</Label>
                    <Select value={editingExercise.difficulty} onValueChange={(val) => setEditingExercise({...editingExercise, difficulty: val})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-equipment">Equipment</Label>
                    <Input 
                      id="edit-equipment"
                      value={editingExercise.equipment || ""}
                      onChange={(e) => setEditingExercise({...editingExercise, equipment: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea 
                    id="edit-description"
                    className="h-24"
                    value={editingExercise.description || ""}
                    onChange={(e) => setEditingExercise({...editingExercise, description: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-videoUrl">Video URL</Label>
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
                Cancel
              </Button>
              <Button onClick={handleEditExercise} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="All" onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-card border p-1 mb-4">
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="px-3 py-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {cat}
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
                      {ex.description || "No description available."}
                    </p>
                    {ex.equipment && (
                      <p className="text-xs text-muted-foreground mb-2">
                        <strong>Equipment:</strong> {ex.equipment}
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
                  <p className="text-base sm:text-lg font-medium mb-2">No exercises found</p>
                  <p className="text-xs sm:text-sm break-words mb-4">
                    {searchQuery
                      ? "Try a different search term or category."
                      : "Add exercises manually or initialize with defaults."}
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
                      Load Default Exercises
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
