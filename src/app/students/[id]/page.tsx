"use client";

import { use } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Mail, Calendar, Dumbbell, History, Award, Loader2, User, Ruler, Weight, Target, Activity, Zap } from "lucide-react";
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
        <header className="flex flex-col md:flex-row gap-6 items-start justify-between bg-card p-6 rounded-xl border shadow-sm">
          <div className="flex gap-6 items-center">
            <Avatar className="h-24 w-24 ring-4 ring-primary/10">
              <AvatarImage src={student.photoUrl || `https://picsum.photos/seed/${student.id}/200/200`} data-ai-hint="student portrait" />
              <AvatarFallback className="text-2xl">{student.firstName[0]}{student.lastName[0]}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold font-headline">{student.firstName} {student.lastName}</h1>
                <Badge className="bg-accent text-accent-foreground capitalize">{student.activityStatus}</Badge>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" /> {student.email}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" /> Member since {student.joinedAt ? new Date(student.joinedAt).toLocaleDateString() : "N/A"}
              </p>
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

        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
              <User className="h-5 w-5 text-primary" />
              <p className="text-xs text-muted-foreground uppercase font-bold">Age / Sex</p>
              <p className="text-lg font-bold">{student.age} yrs / <span className="capitalize">{student.sex}</span></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
              <Ruler className="h-5 w-5 text-primary" />
              <p className="text-xs text-muted-foreground uppercase font-bold">Height</p>
              <p className="text-lg font-bold">{student.heightCm} cm</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
              <Weight className="h-5 w-5 text-primary" />
              <p className="text-xs text-muted-foreground uppercase font-bold">Current Weight</p>
              <p className="text-lg font-bold">{student.weightKg} kg</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
              <Target className="h-5 w-5 text-accent" />
              <p className="text-xs text-muted-foreground uppercase font-bold">Goal Weight</p>
              <p className="text-lg font-bold">{student.goalWeightKg} kg</p>
            </CardContent>
          </Card>
        </div>

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
                  <CardDescription>Path to {student.goalWeightKg}kg (<span className="capitalize">{student.goalType?.replace('_', ' ')}</span>)</CardDescription>
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
                      <Line type="monotone" dataKey="bench" stroke="hsl(var(--chart-1))" strokeWidth={3} name="Bench" />
                      <Line type="monotone" dataKey="squat" stroke="hsl(var(--chart-2))" strokeWidth={3} name="Squat" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid sm:grid-cols-3 gap-6">
              <Card className="bg-accent/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-accent" />
                    Current Streak
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{student.currentStreakDays || 0} Days</p>
                  <p className="text-xs text-muted-foreground">Keep the momentum going!</p>
                </CardContent>
              </Card>
              <Card className="bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Subscription
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={student.subscriptionStatus === 'active' ? 'default' : 'destructive'} className="capitalize">
                    {student.subscriptionStatus || 'Inactive'}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">Next renewal: Auto</p>
                </CardContent>
              </Card>
              <Card className="bg-secondary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    Last Active
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">
                    {student.lastWorkoutAt ? new Date(student.lastWorkoutAt).toLocaleDateString() : "No workouts recorded"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Logged session</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="workouts">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="text-center py-12 text-muted-foreground">
                  <Dumbbell className="h-10 w-10 mx-auto mb-4 opacity-20" />
                  <p>No session history available yet for {student.firstName}.</p>
                  <Button variant="link" asChild>
                    <Link href="/workouts/builder">Assign their first program</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <Award className="h-10 w-10 mx-auto mb-4 opacity-20" />
                  <p>No coaching notes recorded yet.</p>
                  <Button variant="outline" size="sm" className="mt-4">Add Note</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Navigation>
  );
}
