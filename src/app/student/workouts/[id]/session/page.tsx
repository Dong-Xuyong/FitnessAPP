
"use client";

import { useState, useEffect, use } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Dumbbell, 
  Timer as TimerIcon, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Play, 
  Pause, 
  RotateCcw,
  X,
  Save
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SetLog {
  weight: string;
  reps: string;
  completed: boolean;
}

const mockWorkout = {
  id: "prog-1",
  title: "Upper Body Hypertrophy",
  exercises: [
    { name: "Bench Press", sets: 3, reps: "8-12", rest: 90, notes: "Focus on controlled eccentric." },
    { name: "Overhead Press", sets: 3, reps: "8-10", rest: 60, notes: "Don't arch your back." },
    { name: "Pull Ups", sets: 3, reps: "Max", rest: 60, notes: "Full range of motion." },
    { name: "Lateral Raises", sets: 3, reps: "12-15", rest: 45, notes: "Light weight, high tension." },
  ]
};

export default function WorkoutSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [sessionLogs, setSessionLogs] = useState<Record<number, SetLog[]>>({});
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const currentExercise = mockWorkout.exercises[currentExerciseIndex];
  const totalExercises = mockWorkout.exercises.length;
  const progress = ((currentExerciseIndex + 1) / totalExercises) * 100;

  // Initialize logs for current exercise if not exist
  useEffect(() => {
    if (!sessionLogs[currentExerciseIndex]) {
      const initialSets = Array.from({ length: currentExercise.sets }, () => ({
        weight: "",
        reps: "",
        completed: false
      }));
      setSessionLogs(prev => ({ ...prev, [currentExerciseIndex]: initialSets }));
    }
  }, [currentExerciseIndex, currentExercise.sets, sessionLogs]);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(s => s - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  const handleUpdateLog = (setIndex: number, field: keyof SetLog, value: any) => {
    const currentSets = [...(sessionLogs[currentExerciseIndex] || [])];
    currentSets[setIndex] = { ...currentSets[setIndex], [field]: value };
    setSessionLogs(prev => ({ ...prev, [currentExerciseIndex]: currentSets }));
    
    // Auto-start timer when a set is marked completed
    if (field === 'completed' && value === true) {
      setTimerSeconds(currentExercise.rest);
      setIsTimerRunning(true);
    }
  };

  const handleNext = () => {
    if (currentExerciseIndex < totalExercises - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setIsTimerRunning(false);
    } else {
      setIsFinished(true);
    }
  };

  const handlePrevious = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(prev => prev - 1);
    }
  };

  if (isFinished) {
    return (
      <StudentNavigation>
        <div className="max-w-md mx-auto py-12 text-center space-y-6">
          <div className="w-20 h-20 bg-accent/20 text-accent rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold font-headline">Workout Complete!</h1>
            <p className="text-muted-foreground">Great job today. Your coach has been notified of your progress.</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase font-bold">Exercises</p>
                  <p className="text-xl font-bold">{totalExercises}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase font-bold">Total Sets</p>
                  <p className="text-xl font-bold">{mockWorkout.exercises.reduce((acc, curr) => acc + curr.sets, 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" asChild>
            <Link href="/student/dashboard">Return to Dashboard</Link>
          </Button>
        </div>
      </StudentNavigation>
    );
  }

  return (
    <StudentNavigation>
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <Link href="/student/workouts" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
              <X className="h-3 w-3" /> End Session
            </Link>
            <h1 className="text-2xl font-bold">{mockWorkout.title}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-muted-foreground uppercase">Progress</p>
            <p className="text-sm font-medium">{currentExerciseIndex + 1} of {totalExercises}</p>
          </div>
        </header>

        <Progress value={progress} className="h-2 bg-secondary" />

        {/* Timer UI */}
        <Card className={cn("border-2 transition-colors", isTimerRunning ? "border-primary shadow-lg" : "border-border")}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TimerIcon className={cn("h-6 w-6", isTimerRunning ? "text-primary animate-pulse" : "text-muted-foreground")} />
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Rest Timer</p>
                <p className="text-2xl font-mono font-bold">
                  {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="icon" variant="outline" onClick={() => setIsTimerRunning(!isTimerRunning)}>
                {isTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="outline" onClick={() => { setTimerSeconds(currentExercise.rest); setIsTimerRunning(false); }}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Current Exercise */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl">{currentExercise.name}</CardTitle>
                <CardDescription>{currentExercise.notes}</CardDescription>
              </div>
              <Badge variant="secondary">{currentExercise.sets} Sets</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4 text-xs font-bold text-muted-foreground uppercase px-2">
              <div className="col-span-1">Set</div>
              <div className="col-span-1">Weight (kg)</div>
              <div className="col-span-1">Reps</div>
              <div className="col-span-1 text-right">Done</div>
            </div>
            
            {(sessionLogs[currentExerciseIndex] || []).map((set, i) => (
              <div key={i} className={cn(
                "grid grid-cols-4 gap-4 items-center p-2 rounded-lg transition-colors",
                set.completed ? "bg-accent/5" : "bg-muted/30"
              )}>
                <div className="text-sm font-bold">#{i + 1}</div>
                <Input 
                  placeholder="0" 
                  value={set.weight} 
                  onChange={(e) => handleUpdateLog(i, 'weight', e.target.value)}
                  className="h-8"
                  disabled={set.completed}
                />
                <Input 
                  placeholder={currentExercise.reps} 
                  value={set.reps} 
                  onChange={(e) => handleUpdateLog(i, 'reps', e.target.value)}
                  className="h-8"
                  disabled={set.completed}
                />
                <div className="flex justify-end">
                  <Button 
                    size="icon" 
                    variant={set.completed ? "default" : "outline"} 
                    className={cn("h-8 w-8 rounded-full", set.completed && "bg-accent hover:bg-accent/90")}
                    onClick={() => handleUpdateLog(i, 'completed', !set.completed)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6">
            <Button variant="ghost" onClick={handlePrevious} disabled={currentExerciseIndex === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button className="gap-2 bg-primary text-primary-foreground" onClick={handleNext}>
              {currentExerciseIndex === totalExercises - 1 ? (
                <>Finish Workout <Save className="h-4 w-4" /></>
              ) : (
                <>Next Exercise <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </StudentNavigation>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
