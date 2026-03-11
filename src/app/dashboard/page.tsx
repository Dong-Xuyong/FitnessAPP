
"use client";

import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Activity, Calendar, TrendingUp, Loader2, Weight, Target, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, query, orderBy, doc } from "firebase/firestore";

function DashboardContent() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  const trainerRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "personalTrainers", user.uid);
  }, [db, user]);

  const { data: trainer } = useDoc(trainerRef);

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    // We remove the orderby temporarily to ensure all students show up regardless of legacy data fields
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: students, isLoading } = useCollection(studentsQuery);

  const sortedStudents = students ? [...students].sort((a, b) => 
    new Date(b.joinedAt || 0).getTime() - new Date(a.joinedAt || 0).getTime()
  ) : [];

  const stats = [
    { label: "Active Students", value: students?.length.toString() || "0", icon: Users, change: "Current roster" },
    { label: "Avg. Streak", value: students?.length ? (students.reduce((acc, s) => acc + (s.currentStreakDays || 0), 0) / students.length).toFixed(0) : "0", icon: TrendingUp, change: "Consistency metric" },
    { label: "Goal Success", value: "72%", icon: Target, change: "Target weights reached" },
    { label: "Upcoming Sessions", value: "4", icon: Calendar, change: "Scheduled for today" },
  ];

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Navigation>
      <div className="space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold font-headline">Welcome, Coach {trainer?.lastName || ""}</h2>
            <p className="text-muted-foreground">Here's an overview of your training squad's performance.</p>
          </div>
          <Button asChild>
            <Link href="/students" className="gap-2">
              <UserPlus className="h-4 w-4" /> Manage Roster
            </Link>
          </Button>
        </header>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <stat.icon className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest updates from your students</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/students">See Full Roster</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedStudents.slice(0, 5).map((student) => (
                    <Link key={student.id} href={`/students/${student.id}`} className="flex items-center justify-between hover:bg-accent/5 p-3 rounded-xl border border-transparent hover:border-border transition-all">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 ring-2 ring-primary/5">
                          <AvatarImage src={student.photoUrl || `https://picsum.photos/seed/${student.id}/100/100`} />
                          <AvatarFallback>{student.firstName?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold leading-none">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-muted-foreground capitalize mt-1">{student.goalType?.replace('_', ' ')}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Weight className="h-3 w-3" /> {student.weightKg || '--'}kg
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Target className="h-3 w-3" /> {student.goalWeightKg || '--'}kg
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {student.currentStreakDays || 0}d Streak
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-2">Joined {student.joinedAt ? new Date(student.joinedAt).toLocaleDateString() : 'Recently'}</p>
                      </div>
                    </Link>
                  ))}
                  {sortedStudents.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-accent/5">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No students found. Add your first student to get started.</p>
                      <Button variant="outline" size="sm" className="mt-4" asChild>
                        <Link href="/students">Go to Roster</Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Roster Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Muscle Gain</span>
                    <span className="text-sm font-bold">{students?.filter(s => s.goalType === 'muscle_gain').length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Weight Loss</span>
                    <span className="text-sm font-bold">{students?.filter(s => s.goalType === 'weight_loss').length || 0}</span>
                  </div>
                </div>
                <div className="h-[150px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/20">
                  <TrendingUp className="h-8 w-8 text-muted-foreground/20" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Navigation>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
