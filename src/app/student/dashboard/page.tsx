
"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dumbbell, Calendar, Play, TrendingUp, History, Loader2, ArrowRight, UserCheck, Search } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking } from "@/firebase";
import { collection, query, where, limit, getDocs, doc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function StudentDashboardPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [studentData, setStudentData] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Gated by user existence to avoid permission errors
  const coachesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers");
  }, [db, user]);

  const { data: coaches, isLoading: isLoadingCoaches } = useCollection(coachesQuery);

  useEffect(() => {
    if (!db || !user?.email) return;

    async function findStudentProfile() {
      setIsLoadingProfile(true);
      try {
        const trainersCol = collection(db, "personalTrainers");
        const trainersSnapshot = await getDocs(trainersCol);
        
        let found = false;
        for (const trainerDoc of trainersSnapshot.docs) {
          const studentsCol = collection(db, "personalTrainers", trainerDoc.id, "students");
          const q = query(studentsCol, where("email", "==", user?.email), limit(1));
          const studentSnapshot = await getDocs(q);
          if (!studentSnapshot.empty) {
            setStudentData({ ...studentSnapshot.docs[0].data(), id: studentSnapshot.docs[0].id, trainerId: trainerDoc.id });
            found = true;
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

  const handleJoinCoach = async (trainerId: string, trainerName: string) => {
    if (!db || !user) return;
    setIsJoining(trainerId);

    try {
      const studentId = user.uid;
      const studentRef = doc(db, "personalTrainers", trainerId, "students", studentId);

      const newStudentData = {
        personalTrainerId: trainerId,
        userId: user.uid,
        firstName: user.displayName?.split(' ')[0] || "New",
        lastName: user.displayName?.split(' ')[1] || "Student",
        email: user.email,
        age: 0,
        sex: "male",
        weightKg: 0,
        heightCm: 0,
        goalType: "general",
        goalWeightKg: 0,
        activityStatus: "active",
        joinedAt: new Date().toISOString(),
        subscriptionStatus: "active",
        currentStreakDays: 0,
      };

      await setDocumentNonBlocking(studentRef, newStudentData, { merge: true });
      
      toast({
        title: "Successfully Joined!",
        description: `You are now linked with Coach ${trainerName}.`,
      });
      
      setStudentData({ ...newStudentData, id: studentId, trainerId });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error Joining",
        description: "Failed to link with coach. Please try again.",
      });
    } finally {
      setIsJoining(null);
    }
  };

  const workoutPlansQuery = useMemoFirebase(() => {
    if (!db || !studentData) return null;
    return collection(db, "personalTrainers", studentData.trainerId, "students", studentData.id, "workoutPlans");
  }, [db, studentData]);

  const { data: plans } = useCollection(workoutPlansQuery);

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
    const filteredCoaches = coaches?.filter(coach => 
      `${coach.firstName} ${coach.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    return (
      <StudentNavigation>
        <div className="max-w-4xl mx-auto py-10 space-y-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCheck className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-3xl font-bold font-headline">Choose your Coach</h2>
            <p className="text-muted-foreground">Select a personal trainer from our roster to get started with your custom plans.</p>
          </div>

          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by coach name..." 
              className="pl-10 h-12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {isLoadingCoaches ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCoaches.map((coach) => (
                <Card key={coach.id} className="hover:border-accent transition-all group overflow-hidden">
                  <CardHeader className="text-center pb-2">
                    <Avatar className="h-20 w-20 mx-auto mb-2 border-2 border-accent/20 group-hover:scale-105 transition-transform">
                      <AvatarImage src={`https://picsum.photos/seed/${coach.id}/200/200`} />
                      <AvatarFallback>{coach.firstName[0]}</AvatarFallback>
                    </Avatar>
                    <CardTitle className="text-lg">{coach.firstName} {coach.lastName}</CardTitle>
                    <CardDescription>{coach.email}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <Button 
                      className="w-full bg-accent text-accent-foreground hover:bg-accent/90" 
                      onClick={() => handleJoinCoach(coach.id, coach.lastName)}
                      disabled={!!isJoining}
                    >
                      {isJoining === coach.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                      Join Team
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {filteredCoaches.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl bg-muted/5">
                  <p className="text-muted-foreground">No coaches found matching your search.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </StudentNavigation>
    );
  }

  const activePlan = plans?.[0];

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
      </div>
    </StudentNavigation>
  );
}
