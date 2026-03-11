"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, Award, Calendar, Target, Flame } from "lucide-react";

const weightData = [
  { date: 'Apr 1', weight: 82.5 },
  { date: 'Apr 8', weight: 81.8 },
  { date: 'Apr 15', weight: 81.2 },
  { date: 'Apr 22', weight: 80.5 },
  { date: 'May 1', weight: 79.8 },
  { date: 'May 8', weight: 79.2 },
];

const strengthData = [
  { month: 'Jan', bench: 50, squat: 70, deadlift: 90 },
  { month: 'Feb', bench: 55, squat: 80, deadlift: 100 },
  { month: 'Mar', bench: 62.5, squat: 95, deadlift: 115 },
  { month: 'Apr', bench: 70, squat: 105, deadlift: 125 },
];

export default function StudentProgressPage() {
  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">My Progress</h1>
          <p className="text-muted-foreground">Visualize your journey and celebrate your wins.</p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flame className="h-4 w-4" />
                Current Streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">12 Days</div>
              <p className="text-xs opacity-80 mt-1">Keep it up, Alex! You're on fire.</p>
            </CardContent>
          </Card>

          <Card className="bg-accent text-accent-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Goal Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">65%</div>
              <Progress value={65} className="h-2 mt-2 bg-accent-foreground/20" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Total Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">42,500kg</div>
              <p className="text-xs text-muted-foreground mt-1">+15% from last month</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Weight Tracking</CardTitle>
              <CardDescription>Progress towards your 75kg goal</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightData}>
                  <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--primary))' }}
                  />
                  <Area type="monotone" dataKey="weight" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorWeight)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Strength Progression</CardTitle>
              <CardDescription>1RM estimated gains (kg)</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={strengthData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Line type="monotone" dataKey="bench" stroke="hsl(var(--chart-1))" strokeWidth={3} name="Bench Press" />
                  <Line type="monotone" dataKey="squat" stroke="hsl(var(--chart-2))" strokeWidth={3} name="Squat" />
                  <Line type="monotone" dataKey="deadlift" stroke="hsl(var(--chart-3))" strokeWidth={3} name="Deadlift" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Personal Bests</CardTitle>
            <CardDescription>Your latest milestones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { exercise: "Bench Press", value: "72.5 kg", date: "May 5", icon: Award },
                { exercise: "Deadlift", value: "130 kg", date: "May 1", icon: Award },
                { exercise: "Squat", value: "105 kg", date: "Apr 28", icon: Award },
                { exercise: "Pull Ups", value: "12 reps", date: "May 8", icon: Award },
              ].map((pb, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-xl bg-accent/5">
                  <div className="p-2 bg-accent/20 rounded-full text-accent-foreground">
                    <pb.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{pb.exercise}</p>
                    <p className="text-lg font-bold">{pb.value}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {pb.date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </StudentNavigation>
  );
}
