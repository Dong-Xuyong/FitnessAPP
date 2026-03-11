
"use client";

import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Dumbbell, Activity, Calendar, ArrowUpRight, TrendingUp, Loader2, Weight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";

function DashboardContent() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, "personalTrainers", user.uid, "students"),
      orderBy("joinedAt", "desc")
    );
  }, [db, user]);

  const { data: students, isLoading } = useCollection(studentsQuery);

  const stats = [
    { label: "Active Students", value: students?.length.toString() || "0", icon: Users, change: "Updated live" },
    { label: "Avg. Streak", value: students?.length ? (students.reduce((acc, s) => acc + (s.currentStreakDays || 0), 0) / students.length).toFixed(0) : "0", icon: TrendingUp, change: "Across roster" },
    { label: "Completion Rate", value: "84%", icon: Activity, change: "+12% vs last month" },
    { label: "Scheduled Today", value: "4", icon: Calendar, change: "Next: Sarah (2 PM)" },
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

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="col-span-1">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Students</CardTitle>
                <CardDescription>Latest additions to your roster</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/students">View All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {students?.slice(0, 4).map((student) => (
                    <Link key={student.id} href={`/students/${student.id}`} className="flex items-center justify-between hover:bg-accent/5 p-3 rounded-xl border border-transparent hover:border-border transition-all">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 ring-2 ring-primary/5">
                          <AvatarImage src={`https://picsum.photos/seed/${student.id}/100/100`} />
                          <AvatarFallback>{student.firstName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold leading-none">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-muted-foreground capitalize mt-1">{student.goalType?.replace('_', ' ')}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Weight className="h-3 w-3" /> {student.weightKg}kg
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Target className="h-3 w-3" /> {student.goalWeightKg}kg
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {student.currentStreakDays || 0}d Streak
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-2">Joined {new Date(student.joinedAt).toLocaleDateString()}</p>
                      </div>
                    </Link>
                  ))}
                  {students?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No students yet. Start by adding one!</p>
                      <Button variant="link" size="sm" asChild>
                        <Link href="/students">Register Student</Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Physical Insights</CardTitle>
              <CardDescription>Roster performance summary</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px] flex items-center justify-center border-2 border-dashed rounded-lg bg-accent/5">
              <div className="text-center space-y-4 max-w-[300px]">
                <div className="flex justify-center">
                  <div className="relative">
                    <TrendingUp className="h-16 w-16 text-muted-foreground/20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Activity className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Tracking physical progression</p>
                  <p className="text-xs text-muted-foreground">Visual trends for weight, body fat, and strength will appear here as your students log their sessions.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <Link href="/progress">
                    <ArrowUpRight className="h-4 w-4" />
                    View Detailed Analytics
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Navigation>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-primary m-auto" />}>
      <DashboardContent />
    </Suspense>
  );
}
