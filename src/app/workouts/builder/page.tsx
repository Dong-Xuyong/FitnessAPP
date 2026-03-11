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

export default function WorkoutBuilderPage() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  
  const [exercises, setExercises] = useState([
    { name: "", sets: 3, reps: "10-12", rest: 60, notes: "" }
  ]);

  const [studentInfo, setStudentInfo] = useState({
    goals: "Build muscle",
    age: 25,
    weight: 75,
    level: "intermediate"
  });

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

  const handleSaveTemplate = () => {
    if (exercises.length === 0) {
      toast({
        variant: "destructive",
        title: "Empty Program",
        description: "Please add at least one exercise to save a template.",
      });
      return;
    }
    
    setIsSaving(true);
    // Simulate save
    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: "Template Saved",
        description: "Workout program template has been saved to your library.",
      });
    }, 800);
  };

  const handleAssignToStudent = () => {
    if (exercises.length === 0) {
      toast({
        variant: "destructive",
        title: "Empty Program",
        description: "Please add at least one exercise before assigning.",
      });
      return;
    }

    setIsAssigning(true);
    // Simulate assignment
    setTimeout(() => {
      setIsAssigning(false);
      toast({
        title: "Program Assigned",
        description: "The workout plan has been successfully assigned to the student.",
      });
    }, 1000);
  };

  const handleAiSuggestion = async () => {
    setIsGenerating(true);
    try {
      const result = await aiWorkoutPlanSuggestion({
        studentGoals: studentInfo.goals,
        studentAge: studentInfo.age,
        studentWeightKg: studentInfo.weight,
        studentFitnessLevel: studentInfo.level,
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
        title: "AI Suggestion Generated!",
        description: "A tailored workout plan has been added based on student goals.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "AI Suggestion Failed",
        description: "Could not generate a plan at this time. Please try again.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Navigation>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold font-headline">Program Builder</h1>
            <p className="text-muted-foreground">Create a custom routine for your student.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={handleSaveTemplate}
              disabled={isSaving || isAssigning}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Template
            </Button>
            <Button 
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleAssignToStudent}
              disabled={isSaving || isAssigning}
            >
              {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Assign to Student
            </Button>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Student Context</CardTitle>
              <CardDescription>Target audience for this plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Fitness Level</Label>
                <Select 
                  value={studentInfo.level} 
                  onValueChange={(v) => setStudentInfo({...studentInfo, level: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Goals</Label>
                <Input 
                  value={studentInfo.goals} 
                  onChange={(e) => setStudentInfo({...studentInfo, goals: e.target.value})}
                />
              </div>
              <Button 
                variant="secondary" 
                className="w-full gap-2 mt-4" 
                onClick={handleAiSuggestion}
                disabled={isGenerating}
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
                {isGenerating ? "Generating..." : "Get AI Suggestion"}
              </Button>
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Exercises</CardTitle>
                  <CardDescription>Add and configure movements</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddExercise} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Exercise
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
                            placeholder="e.g. Bench Press" 
                            onChange={(e) => handleUpdateExercise(i, "name", e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-2">
                            <Label>Sets</Label>
                            <Input 
                              type="number" 
                              value={ex.sets} 
                              onChange={(e) => handleUpdateExercise(i, "sets", parseInt(e.target.value) || 0)}
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
                              onChange={(e) => handleUpdateExercise(i, "rest", parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Instructions / Notes</Label>
                        <Textarea 
                          value={ex.notes} 
                          placeholder="Specific tips for execution..." 
                          className="h-20"
                          onChange={(e) => handleUpdateExercise(i, "notes", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {exercises.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    No exercises added yet. Use AI or add manually.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Navigation>
  );
}
