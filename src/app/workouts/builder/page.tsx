
"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Plus, Trash2, Save, Send, Loader2 } from "lucide-react";
import { aiWorkoutPlanSuggestion } from "@/ai/flows/ai-workout-plan-suggestion";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from "@/firebase";
import { collection } from "firebase/firestore";

export default function WorkoutBuilderPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  
  const [programTitle, setProgramTitle] = useState("New Workout Plan");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [exercises, setExercises] = useState([
    { name: "", sets: 3, reps: "10-12", rest: 60, notes: "" }
  ]);

  const [aiContext, setAiContext] = useState({
    goals: "Build muscle",
    age: 25,
    weight: 75,
    level: "intermediate"
  });

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: students } = useCollection(studentsQuery);

  const handleAddExercise = () => {
    setExercises([...exercises, { name: "", sets: 3, reps: "10-12", rest: 60, notes: "" }]);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const handleUpdateExercise = (index: number, field: string, value: any) => {
    const newExercises = [...exercises];
    newExercises[index] = { ...newExercises[index], [field]: value };
    setExercises(newExercises);
  };

  const handleAssignToStudent = async () => {
    if (!db || !user || !selectedStudentId) {
      toast({
        variant: "destructive",
        title: "Selection Required",
        description: "Please select a student to assign this program to.",
      });
      return;
    }

    if (exercises.some(ex => !ex.name)) {
      toast({
        variant: "destructive",
        title: "Incomplete Program",
        description: "Please ensure all exercises have a name.",
      });
      return;
    }

    setIsAssigning(true);
    const workoutRef = collection(db, "personalTrainers", user.uid, "students", selectedStudentId, "workoutPlans");
    
    try {
      await addDocumentNonBlocking(workoutRef, {
        title: programTitle,
        studentId: selectedStudentId,
        personalTrainerId: user.uid,
        createdAt: new Date().toISOString(),
        exercises: exercises.map(ex => ({
          exerciseName: ex.name,
          sets: Number(ex.sets),
          reps: ex.reps,
          restTimeSeconds: Number(ex.rest),
          notes: ex.notes
        }))
      });

      toast({
        title: "Program Assigned!",
        description: `Successfully assigned "${programTitle}" to the selected student.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: "Could not save the program. Please check your permissions.",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAiSuggestion = async () => {
    setIsGenerating(true);
    try {
      const result = await aiWorkoutPlanSuggestion({
        studentGoals: aiContext.goals,
        studentAge: aiContext.age,
        studentWeightKg: aiContext.weight,
        studentFitnessLevel: aiContext.level,
      });

      const newExercises = result.workoutPlan.map(ex => ({
        name: ex.exerciseName,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.restTimeSeconds,
        notes: ex.notes || ""
      }));

      setExercises(newExercises);
      toast({
        title: "AI Suggestion Ready!",
        description: "The plan has been populated with AI recommendations.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "AI Failed",
        description: "Could not generate suggestions. Check your API configuration.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Navigation>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1 flex-1">
            <Input 
              value={programTitle} 
              onChange={(e) => setProgramTitle(e.target.value)} 
              className="text-3xl font-bold font-headline border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
            />
            <p className="text-muted-foreground">Drafting program for student assignment.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleAssignToStudent}
              disabled={isAssigning || !selectedStudentId}
            >
              {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Assign Program
            </Button>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
              <CardDescription>Who is this for?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Student</Label>
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select from roster" />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                    ))}
                    {(!students || students.length === 0) && (
                      <SelectItem value="none" disabled>No students found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t space-y-4">
                <Label className="text-xs uppercase text-muted-foreground font-bold">AI Assistant</Label>
                <div className="space-y-2">
                  <Label>Goals</Label>
                  <Input 
                    placeholder="e.g. Lose fat" 
                    value={aiContext.goals} 
                    onChange={(e) => setAiContext({...aiContext, goals: e.target.value})}
                  />
                </div>
                <Button 
                  variant="secondary" 
                  className="w-full gap-2" 
                  onClick={handleAiSuggestion}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
                  Generate Suggestion
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Routine Steps</CardTitle>
                  <CardDescription>{exercises.length} exercises total</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddExercise} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Row
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {exercises.map((ex, i) => (
                  <div key={i} className="p-4 border rounded-lg relative group bg-card/50">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveExercise(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="grid gap-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Exercise Name</Label>
                          <Input 
                            value={ex.name} 
                            placeholder="e.g. Barbell Squat" 
                            onChange={(e) => handleUpdateExercise(i, "name", e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-2">
                            <Label>Sets</Label>
                            <Input 
                              type="number" 
                              value={ex.sets} 
                              onChange={(e) => handleUpdateExercise(i, "sets", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Reps</Label>
                            <Input 
                              value={ex.reps} 
                              onChange={(e) => handleUpdateExercise(i, "reps", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Rest (s)</Label>
                            <Input 
                              type="number" 
                              value={ex.rest} 
                              onChange={(e) => handleUpdateExercise(i, "rest", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Coach's Notes</Label>
                        <Textarea 
                          value={ex.notes} 
                          placeholder="Cue: Keep core tight..." 
                          className="h-16"
                          onChange={(e) => handleUpdateExercise(i, "notes", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Navigation>
  );
}
