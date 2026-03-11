"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, Clock, Play, CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function StudentWorkoutsPage() {
  const assignedPrograms = [
    {
      id: "prog-1",
      title: "Upper Body Hypertrophy",
      category: "Muscle Gain",
      duration: "65 min",
      status: "In Progress",
      exercises: 8,
      lastCompleted: "2 days ago",
    },
    {
      id: "prog-2",
      title: "Core & Mobility Routine",
      category: "Wellness",
      duration: "30 min",
      status: "Upcoming",
      exercises: 5,
      lastCompleted: "Never",
    }
  ];

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">My Workouts</h1>
          <p className="text-muted-foreground">Follow your assigned training programs and log your sets.</p>
        </header>

        <div className="grid gap-6">
          {assignedPrograms.map((program) => (
            <Card key={program.id} className="group hover:border-accent transition-colors">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="bg-accent/10 text-accent hover:bg-accent/10">
                        {program.category}
                      </Badge>
                      {program.status === "In Progress" && (
                        <Badge className="bg-primary text-primary-foreground">Active</Badge>
                      )}
                    </div>
                    <h2 className="text-2xl font-bold">{program.title}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Dumbbell className="h-4 w-4" /> {program.exercises} Exercises
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" /> {program.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Last: {program.lastCompleted}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Button variant="outline" className="hidden sm:flex">View Details</Button>
                    <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 flex-1 sm:flex-none">
                      <Play className="h-4 w-4" /> Start Session
                    </Button>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-dashed bg-muted/20">
          <CardContent className="p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Dumbbell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold">Looking for more?</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your coach is currently building more routines for your specific goals. You'll be notified as soon as they are assigned.
            </p>
            <Button variant="ghost" className="text-accent hover:text-accent hover:bg-accent/10">
              Message Coach John
            </Button>
          </CardContent>
        </Card>
      </div>
    </StudentNavigation>
  );
}
