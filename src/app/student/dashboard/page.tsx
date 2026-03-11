
"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dumbbell, Calendar, Play, TrendingUp, History, Loader2, ArrowRight, UserCheck, Search, Flame, Target } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking } from "@/firebase";
import { collection, query, where, limit, getDocs, doc, getDoc } from "firebase/firestore";
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

  const coachesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers");
  }, [db, user]);

  const { data: coaches, isLoading: isLoadingCoaches } = useCollection(coachesQuery);

  useEffect(() => {
    if (!db || !user?.uid) return;

    async function findStudentProfile() {
      setIsLoadingProfile(true);
      try {
        const globalRef = doc(db, "students", user.uid);
        const globalSnap = await getDoc(globalRef);
        
        if (globalSnap.exists()) {
          setStudentData(globalSnap.data());
        }
      } catch (e) {
        console.error("Error finding student profile", e);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    findStudentProfile();
  }, [db, user?.uid]);

  const handleJoinCoach = async (trainerId: string, trainerName: string) => {
    if (!db || !user) return;
    setIsJoining(trainerId);

    try {
      const studentId = user.uid;
      const studentRef = doc(db, "students", studentId);
      const coachStudentRef = doc(db, "personalTrainers", trainerId, "students", studentId);

      const newStudentData = {
        userId: user.uid,
        trainerId: trainerId,
        name: user.displayName || "New Student",
        email: user.email,
        age: studentData?.age || 0,
        sex: studentData?.sex || "other",
        weightKg: studentData?.weightKg || 0,
        heightCm: studentData?.heightCm || 0,
        goalType: studentData?.goalType || "general",
        goalWeightKg: studentData?.goalWeightKg || 0,
        activityStatus: "active",
        joinedAt: studentData?.joinedAt || new Date().toISOString(),
        subscriptionStatus: "active",
        currentStreakDays: studentData?.currentStreakDays || 0,
        lastWorkoutAt: studentData?.lastWorkoutAt || null,
        currentProgramId: studentData?.currentProgramId || null
      };

      await setDocumentNonBlocking(studentRef, newStudentData, { merge: true });
      await setDocumentNonBlocking(coachStudentRef, newStudentData, { merge: true });
      
      toast({
        title: "Successfully Joined!",
        description: `You are now linked with Coach ${trainerName}.`,
      });
      
      setStudentData(newStudentData);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error Joining",
        description: "Failed to link with coach.",
      });
    } finally {
      setIsJoining(null);
    }
  };

  if (isUserLoading || isLoadingProfile) {
    return (
      <StudentNavigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentNavigation>
    );
  }

  if (!studentData?.trainerId) {
    const filteredCoaches = coaches?.filter(coach => 
      `${coach.firstName} ${coach.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    return (
      <StudentNavigation>
        <div className="max-w-4xl mx-auto py-10 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold font-headline">Choose your Coach</h2>
            <p className="text-muted-foreground">Select a personal trainer from our roster.</p>
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
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCoaches.map((coach) => (
                <Card key={coach.id}>
                  <CardHeader className="text-center">
                    <Avatar className="h-20 w-20 mx-auto mb-2">
                      <AvatarImage src={`https://picsum.photos/seed/${coach.id}/200/200`} />
                      <AvatarFallback>{coach.firstName[0]}</AvatarFallback>
                    </Avatar>
                    <CardTitle>{coach.firstName} {coach.lastName}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full" 
                      onClick={() => handleJoinCoach(coach.id, coach.lastName)}
                      disabled={!!isJoining}
                    >
                      {isJoining === coach.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                      Join Team
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </StudentNavigation>
    );
  }

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">Welcome back, {studentData.name.split(' ')[0]}!</h1>
          <p className="text-muted-foreground capitalize">Goal: {studentData.goalType?.replace('_', ' ')}</p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Training Status</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  {studentData.currentProgramId ? "Active Program in Progress" : "Waiting for Coach to assign program"}
                </CardDescription>
              </div>
              <Dumbbell className="h-8 w-8 opacity-20" />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Current Streak</span>
                  <span>{studentData.currentStreakDays || 0} Days <Flame className="inline h-4 w-4" /></span>
                </div>
                <Progress value={Math.min((studentData.currentStreakDays || 0) * 10, 100)} className="h-2 bg-primary-foreground/20" />
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">
                    Last session: {studentData.lastWorkoutAt ? new Date(studentData.lastWorkoutAt).toLocaleDateString() : "No history"}
                  </span>
                </div>
                {studentData.currentProgramId && (
                  <Button variant="secondary" asChild>
                    <Link href={`/student/workouts/${studentData.currentProgramId}/session`}>
                      <Play className="h-4 w-4 mr-2" /> Resume
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Physical Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-bold">{studentData.weightKg} kg</p>
                  <p className="text-xs text-muted-foreground">Weight (Goal: {studentData.goalWeightKg} kg)</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Target className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-bold">{studentData.heightCm} cm</p>
                  <p className="text-xs text-muted-foreground">Height</p>
                </div>
              </div>
              <div className="text-xs text-center py-2 bg-muted rounded">
                Status: <span className="font-bold capitalize">{studentData.subscriptionStatus}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentNavigation>
  );
}
