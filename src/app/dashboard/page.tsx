
"use client";

import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Dumbbell, Activity, Calendar, ArrowUpRight, TrendingUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";

export default function DashboardPage() {
  const { user } = useUser();
  const db = useFirestore();

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, "personalTrainers", user.uid, "students"),
      orderBy("dateJoined", "desc")
    );
  }, [db, user]);

  const { data: students, isLoading } = useCollection(studentsQuery);

  const stats = [
    { label: "Active Students", value: students?.length.toString() || "0", icon: Users, change: "Updated live" },
    { label: "Programs Assigned", value: "8", icon: Dumbbell, change: "5 pending" },
    { label: "Total Sessions", value: "124", icon: Activity, change: "+12% vs last month" },
    { label: "Scheduled Today", value: "4", icon: Calendar, change: "Next: Sarah (2 PM)" },
  ];

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
                    <Link key={student.id} href={`/students/${student.id}`} className="flex items-center justify-between hover:bg-accent/5 p-2 rounded-lg transition-colors">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={`https://picsum.photos/seed/${student.id}/100/100`} />
                          <AvatarFallback>{student.firstName[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium leading-none">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-muted-foreground">{student.goals}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{student.currentWeightKg}kg</p>
                        <p className="text-xs text-primary font-semibold">Active</p>
                      </div>
                    </Link>
                  ))}
                  {students?.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No students yet. Start by adding one!
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Quick Insights</CardTitle>
              <CardDescription>Visual summary of performance</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-accent/5">
              <div className="text-center space-y-2">
                <TrendingUp className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">Overall progress charts will appear here as students log data.</p>
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  Detailed Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Navigation>
  );
}
