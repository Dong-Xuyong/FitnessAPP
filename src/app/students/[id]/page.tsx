"use client";

import { use } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Mail, Calendar, Dumbbell, History, Award, Loader2 } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";

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
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;
  const { user } = useUser();
  const db = useFirestore();

  const studentRef = useMemoFirebase(() => {
    if (!db || !user || !id) return null;
    return doc(db, "personalTrainers", user.uid, "students", id);
  }, [db, user, id]);

  const { data: student, isLoading } = useDoc(studentRef);

  if (isLoading) {
    return (
      <Navigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Navigation>
    );
  }

  if (!student) {
    return (
      <Navigation>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Student not found</h2>
          <Button className="mt-4" asChild>
            <Link href="/students">Back to Roster</Link>
          </Button>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="space-y-8">
        <header className="flex flex-col md:flex-row gap-6 items-start justify-between bg-card p-6 rounded-xl border">
          <div className="flex gap-6 items-center">
            <Avatar className="h-24 w-24 ring-4 ring-secondary">
              <AvatarImage src={`https://picsum.photos/seed/${student.id}/200/200`} />
              <AvatarFallback>{student.firstName[0]}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold font-headline">{student.firstName} {student.lastName}</h1>
                <Badge className="bg-accent text-accent-foreground">Active</Badge>
              </div>
              <p className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Member since {new Date(student.dateJoined).toLocaleDateString()}
              </p>
              <div className="flex gap-4 pt-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Goal:</span> <span className="font-semibold">{student.goals}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Weight:</span> <span className="font-semibold">{student.currentWeightKg} kg</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Mail className="h-4 w-4" /> Email
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
                  <CardDescription>Target: Maintain Health</CardDescription>
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
                    <p className="font-bold">Consistency</p>
                    <p className="text-xs text-muted-foreground">Recent sessions logged</p>
                  </div>
                </div>
                <div className="p-4 border rounded-lg flex items-center gap-4 bg-primary/5">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <History className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold">Strength Milestone</p>
                    <p className="text-xs text-muted-foreground">New personal best recorded</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workouts">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="text-center py-12 text-muted-foreground">
                  No session history available yet.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  No coaching notes recorded yet.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Navigation>
  );
}
