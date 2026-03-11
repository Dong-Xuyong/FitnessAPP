
"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Calendar, Play, CheckCircle, TrendingUp, History, Loader2 } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, limit, onSnapshot, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";

export default function StudentDashboardPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [studentData, setStudentData] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Find the student record in all potential trainer collections
  useEffect(() => {
    if (!db || !user?.email) return;

    // Search for student by email across all potential trainer rosters
    // Note: In a real production app, you might have a top-level mapping, 
    // but here we follow the path structure in firestore.rules and backend.json
    async function findStudentProfile() {
      setIsLoadingProfile(true);
      try {
        // This is a broad query that requires a collection group index or knowing the trainerId.
        // For simplicity in this structure, we'll assume students are logged in and we can find them.
        // In a real app, you'd store the student profile at /students/{studentId} or have a claim process.
        // Given our firestore.rules, we can access based on email match.
        // We'll iterate through students (usually there would be a better way but let's stick to the structure)
        
        // For MVP, we'll look for a trainer that owns this email.
        // Usually, students register and then we link them. 
        // Let's assume the trainerId is known or we search.
        
        // Simulating the profile fetch - in a real scenario, this would be a specific query.
        // For now, let's look at the current mock alex data and transition to real.
        // We'll try to find the student doc where email == user.email
        const trainersCol = collection(db, "personalTrainers");
        const trainersSnapshot = await getDocs(trainersCol);
        
        for (const trainerDoc of trainersSnapshot.docs) {
          const studentsCol = collection(db, "personalTrainers", trainerDoc.id, "students");
          const q = query(studentsCol, where("email", "==", user?.email), limit(1));
          const studentSnapshot = await getDocs(q);
          if (!studentSnapshot.empty) {
            setStudentData({ ...studentSnapshot.docs[0].data(), id: studentSnapshot.docs[0].id, trainerId: trainerDoc.id });
            break;
          }
        }
      } catch (e) {
        console.error("Error finding student profile", e);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    findStudentProfile();
  }, [db, user?.email]);

  const workoutPlansQuery = useMemoFirebase(() => {
    if (!db || !studentData) return null;
    return collection(db, "personalTrainers", studentData.trainerId, "students", studentData.id, "workoutPlans");
  }, [db, studentData]);

  const { data: plans, isLoading: isPlansLoading } = useCollection(workoutPlansQuery);

  if (isUserLoading || isLoadingProfile) {
    return (
      <StudentNavigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentNavigation>
    );
  }

  if (!studentData) {
    return (
      <StudentNavigation>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Profile not linked</h2>
          <p className="text-muted-foreground">Ask your trainer to add you to their roster with your email: {user?.email}</p>
        </div>
      </StudentNavigation>
    );
  }

  const activePlan = plans?.[0]; // Get the latest or specific active plan

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">Welcome back, {studentData.firstName}!</h1>
          <p className="text-muted-foreground">Goal: <span className="text-primary font-semibold capitalize">{studentData.goalType?.replace('_', ' ')}</span></p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Active Program</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  {activePlan ? activePlan.title : "No program assigned yet"}
                </CardDescription>
              </div>
              <Dumbbell className="h-8 w-8 opacity-20" />
            </CardHeader>
            <CardContent className="space-y-6">
              {activePlan ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Recent Progress</span>
                      <span>{studentData.currentStreakDays || 0} Day Streak 🔥</span>
                    </div>
                    <Progress value={Math.min((studentData.currentStreakDays || 0) * 10, 100)} className="h-2 bg-primary-foreground/20" />
                  </div>
                  <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Last workout: {studentData.lastWorkoutAt ? new Date(studentData.lastWorkoutAt).toLocaleDateString() : "Never"}
                      </span>
                    </div>
                    <Button variant="secondary" className="gap-2" asChild>
                      <Link href={`/student/workouts/${activePlan.id}/session`}>
                        <Play className="h-4 w-4" /> Start Workout
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 opacity-70 italic text-sm">
                  Your coach will assign your first routine soon.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Physical Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-accent/5">
                <TrendingUp className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-bold">Current Weight</p>
                  <p className="text-xs text-muted-foreground">{studentData.weightKg} kg (Goal: {studentData.goalWeightKg} kg)</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-accent/5">
                <History className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-bold">Height</p>
                  <p className="text-xs text-muted-foreground">{studentData.heightCm} cm</p>
                </div>
              </div>
              <Button variant="ghost" className="w-full text-xs" asChild>
                <Link href="/student/progress">Detailed History</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium">Activity Status</span>
                  <Badge variant={studentData.activityStatus === 'active' ? 'secondary' : 'outline'} className="capitalize">
                    {studentData.activityStatus}
                  </Badge>
                </div>
                <div className="flex justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium">Subscription</span>
                  <Badge variant={studentData.subscriptionStatus === 'active' ? 'default' : 'destructive'} className="capitalize">
                    {studentData.subscriptionStatus}
                  </Badge>
                </div>
                <div className="flex justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium">Joined ElevateFit</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(studentData.joinedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Coach's Notes</CardTitle>
              <CardDescription>Latest feedback</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 italic text-sm text-muted-foreground">
                "Keep pushing on those {studentData.goalType?.replace('_', ' ')} goals! Your current streak of {studentData.currentStreakDays} days is impressive."
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentNavigation>
  );
}
