"use client";

import { use } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Mail, Phone, Calendar, Dumbbell, History, Award } from "lucide-react";
import Link from "next/link";

const weightData = [
  { date: 'Jan 1', weight: 82 },
  { date: 'Jan 15', weight: 80.5 },
  { date: 'Feb 1', weight: 81 },
  { date: 'Feb 15', weight: 79.2 },
  { date: 'Mar 1', weight: 78.5 },
  { date: 'Mar 15', weight: 78.0 },
];

const strengthData = [
  { date: 'Jan', bench: 60, squat: 80 },
  { date: 'Feb', bench: 65, squat: 90 },
  { date: 'Mar', bench: 72.5, squat: 105 },
];

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <Navigation>
      <div className="space-y-8">
        <header className="flex flex-col md:flex-row gap-6 items-start justify-between bg-card p-6 rounded-xl border">
          <div className="flex gap-6 items-center">
            <Avatar className="h-24 w-24 ring-4 ring-secondary">
              <AvatarImage src={`https://picsum.photos/seed/s${id}/200/200`} />
              <AvatarFallback>S</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold font-headline">Alex Johnson</h1>
                <Badge className="bg-accent text-accent-foreground">Intermediate</Badge>
              </div>
              <p className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Member since Jan 2024
              </p>
              <div className="flex gap-4 pt-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Goal:</span> <span className="font-semibold">Hypertrophy</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Weight:</span> <span className="font-semibold">78.0 kg</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Mail className="h-4 w-4" /> Message
            </Button>
            <Button size="sm" className="gap-2" asChild>
              <Link href="/workouts/builder">
                <Dumbbell className="h-4 w-4" /> New Program
              </Link>
            </Button>
          </div>
        </header>

        <Tabs defaultValue="progress" className="space-y-6">
          <TabsList className="bg-card border h-12 w-full sm:w-auto">
            <TabsTrigger value="progress" className="px-8">Progress</TabsTrigger>
            <TabsTrigger value="workouts" className="px-8">History</TabsTrigger>
            <TabsTrigger value="notes" className="px-8">Coaching Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Weight Tracking</CardTitle>
                  <CardDescription>Target: 75 kg</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
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
                      <YAxis domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip />
                      <Area type="monotone" dataKey="weight" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorWeight)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Strength Progression</CardTitle>
                  <CardDescription>Main compound lifts (kg)</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={strengthData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="bench" stroke="hsl(var(--chart-1))" strokeWidth={3} />
                      <Line type="monotone" dataKey="squat" stroke="hsl(var(--chart-2))" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Achievements</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg flex items-center gap-4 bg-accent/5">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold">Consistency King</p>
                    <p className="text-xs text-muted-foreground">14 sessions this month</p>
                  </div>
                </div>
                <div className="p-4 border rounded-lg flex items-center gap-4 bg-primary/5">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <History className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold">New Squat PR</p>
                    <p className="text-xs text-muted-foreground">105kg reached today</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workouts">
            <Card>
              <CardContent className="pt-6 space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center text-primary font-bold">
                        {i + 14}
                      </div>
                      <div>
                        <p className="font-medium">Upper Body Push A</p>
                        <p className="text-xs text-muted-foreground">Duration: 65m • Volume: 12,400kg</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">View Log</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Navigation>
  );
}
