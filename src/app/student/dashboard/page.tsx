
"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Calendar, Play, CheckCircle, TrendingUp, History } from "lucide-react";
import Link from "next/link";

export default function StudentDashboardPage() {
  const currentProgram = {
    id: "prog-1",
    title: "Upper Body Hypertrophy",
    trainer: "John Doe",
    progress: 65,
    nextSession: "Today, 4:00 PM",
  };

  const weeklySchedule = [
    { day: "Mon", workout: "Upper Body Push", status: "completed" },
    { day: "Tue", workout: "Rest Day", status: "rest" },
    { day: "Wed", workout: "Lower Body Pull", status: "missed" },
    { day: "Thu", workout: "Core & Mobility", status: "upcoming" },
    { day: "Fri", workout: "Upper Body Pull", status: "upcoming" },
  ];

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">Welcome back, Alex!</h1>
          <p className="text-muted-foreground">You've completed 4 workouts this week. Keep it up!</p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Active Program</CardTitle>
                <CardDescription className="text-primary-foreground/80">{currentProgram.title} • Trainer {currentProgram.trainer}</CardDescription>
              </div>
              <Dumbbell className="h-8 w-8 opacity-20" />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Program Completion</span>
                  <span>{currentProgram.progress}%</span>
                </div>
                <Progress value={currentProgram.progress} className="h-2 bg-primary-foreground/20" />
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">Next: {currentProgram.nextSession}</span>
                </div>
                <Button variant="secondary" className="gap-2" asChild>
                  <Link href={`/student/workouts/${currentProgram.id}/session`}>
                    <Play className="h-4 w-4" /> Start Workout
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent PRs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-accent/5">
                <TrendingUp className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-bold">Bench Press</p>
                  <p className="text-xs text-muted-foreground">72.5kg • +2.5kg</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-accent/5">
                <TrendingUp className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-bold">Squat</p>
                  <p className="text-xs text-muted-foreground">105kg • +5kg</p>
                </div>
              </div>
              <Button variant="ghost" className="w-full text-xs" asChild>
                <Link href="/student/progress">View History</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Schedule</CardTitle>
              <CardDescription>Track your consistency</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {weeklySchedule.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 text-xs font-bold uppercase text-muted-foreground">{item.day}</div>
                      <div>
                        <p className="text-sm font-medium">{item.workout}</p>
                      </div>
                    </div>
                    {item.status === 'completed' && <CheckCircle className="h-5 w-5 text-accent" />}
                    {item.status === 'missed' && <Badge variant="destructive">Missed</Badge>}
                    {item.status === 'rest' && <Badge variant="secondary">Rest</Badge>}
                    {item.status === 'upcoming' && <Button size="sm" variant="ghost">Log</Button>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Coach's Notes</CardTitle>
              <CardDescription>Latest feedback from John</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 italic text-sm text-muted-foreground">
                "Great work on the squats today, Alex! Your depth is looking much more consistent. Let's focus on maintaining that chest position during the heavy sets next time."
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-2">
                  <History className="h-4 w-4" /> View Older Notes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentNavigation>
  );
}
