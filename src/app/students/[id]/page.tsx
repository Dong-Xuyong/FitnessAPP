
"use client";

import { use, useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { 
  Mail, 
  Calendar, 
  Dumbbell, 
  History, 
  Award, 
  Loader2, 
  User, 
  Ruler, 
  Weight, 
  Target, 
  Activity, 
  Zap,
  Save,
  MessageSquare,
  TrendingDown
} from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useDoc, useMemoFirebase, updateDocumentNonBlocking } from "@/firebase";
import { doc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  const [coachingNotes, setCoachingNotes] = useState("");
  const [editStats, setEditStats] = useState({
    goalWeightKg: "",
    goalType: "",
  });

  const studentRef = useMemoFirebase(() => {
    if (!db || !user || !id) return null;
    return doc(db, "personalTrainers", user.uid, "students", id);
  }, [db, user, id]);

  const { data: student, isLoading } = useDoc(studentRef);

  useEffect(() => {
    if (student) {
      setCoachingNotes(student.coachingNotes || "");
      setEditStats({
        goalWeightKg: student.goalWeightKg?.toString() || "",
        goalType: student.goalType || "",
      });
    }
  }, [student]);

  const handleUpdateStudent = async () => {
    if (!studentRef) return;
    setIsSaving(true);
    try {
      updateDocumentNonBlocking(studentRef, {
        coachingNotes,
        goalWeightKg: Number(editStats.goalWeightKg) || 0,
        goalType: editStats.goalType,
      });
      toast({
        title: "Profile Updated",
        description: "Coaching data and goals have been saved.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update coaching info.",
      });
    } finally {
      setIsSaving(false);
    }
  };

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
              <AvatarImage src={student.photoUrl || `https://picsum.photos/seed/${student.id}/200/200`} />
              <AvatarFallback className="text-2xl">{student.firstName?.[0]}{student.lastName?.[0]}</AvatarFallback>
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
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/student/messages">
                <MessageSquare className="h-4 w-4" /> Message
              </Link>
            </Button>
            <Button className="gap-2" asChild>
              <Link href="/workouts/builder">
                <Dumbbell className="h-4 w-4" /> Build Program
              </Link>
            </Button>
          </div>
        </header>

        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-1">
              <User className="h-4 w-4 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Age / Sex</p>
              <p className="text-base font-bold">{student.age || '--'} yrs / <span className="capitalize">{student.sex || '--'}</span></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-1">
              <Ruler className="h-4 w-4 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Height</p>
              <p className="text-base font-bold">{student.heightCm || '--'} cm</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-1">
              <Weight className="h-4 w-4 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Weight</p>
              <p className="text-base font-bold">{student.weightKg || '--'} kg</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-1">
              <Target className="h-4 w-4 text-accent" />
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Goal</p>
              <p className="text-base font-bold">{student.goalWeightKg || '--'} kg</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="progress" className="space-y-6">
          <TabsList className="bg-card border h-12">
            <TabsTrigger value="progress" className="px-8">Progress</TabsTrigger>
            <TabsTrigger value="management" className="px-8">Coaching & Management</TabsTrigger>
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
                      <Area type="monotone" dataKey="weight" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorWeight)" strokeWidth={3} />
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
                  <p className="text-xs text-muted-foreground mt-2">Status: {student.subscriptionStatus || 'Unknown'}</p>
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
                    {student.lastWorkoutAt ? new Date(student.lastWorkoutAt).toLocaleDateString() : "No recent activity"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Logged session</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="management">
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-primary" />
                      Trainer Observations & Notes
                    </CardTitle>
                    <CardDescription>Private notes only visible to you.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea 
                      placeholder="Enter coaching cues, technical faults, or recovery notes..."
                      className="min-h-[250px] text-base leading-relaxed"
                      value={coachingNotes}
                      onChange={(e) => setCoachingNotes(e.target.value)}
                    />
                  </CardContent>
                  <CardFooter className="bg-muted/5 border-t">
                    <Button 
                      className="gap-2 ml-auto" 
                      onClick={handleUpdateStudent}
                      disabled={isSaving}
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Coaching Notes
                    </Button>
                  </CardFooter>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Adjust Goals</CardTitle>
                    <CardDescription>Update target metrics for this student.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Goal Weight (kg)</Label>
                      <Input 
                        type="number" 
                        value={editStats.goalWeightKg}
                        onChange={(e) => setEditStats({...editStats, goalWeightKg: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Goal Type</Label>
                      <Input 
                        placeholder="e.g. Muscle Gain"
                        value={editStats.goalType}
                        onChange={(e) => setEditStats({...editStats, goalType: e.target.value})}
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={handleUpdateStudent}
                      disabled={isSaving}
                    >
                      Update Targets
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-sm">Assigned Routine</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 border rounded-lg bg-background flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Dumbbell className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Hypertrophy Split A</span>
                      </div>
                      <Badge variant="outline">Active</Badge>
                    </div>
                    <Button variant="link" className="w-full mt-2 text-xs" asChild>
                      <Link href="/workouts/builder">Change Routine</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Navigation>
  );
}
