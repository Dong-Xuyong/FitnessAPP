
"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Calendar, Play, TrendingUp, Loader2, Flame, Target, Percent } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";


export default function StudentDashboardPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { t } = useI18n();

  const [studentData, setStudentData] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [lastSessionDoneAt, setLastSessionDoneAt] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !user?.uid) {
      setIsLoadingProfile(false);
      return;
    }

    async function findStudentProfile() {
      setIsLoadingProfile(true);
      try {
        const globalRef = doc(db, "students", user!.uid);
        const globalSnap = await getDoc(globalRef);

        if (globalSnap.exists()) {
          const profileData = globalSnap.data();
          setStudentData(profileData);

          if (profileData?.trainerId) {
            const [sessionsSnap, workoutPlansSnap] = await Promise.all([
              getDocs(collection(db, "personalTrainers", profileData.trainerId, "students", user!.uid, "workoutSessions")),
              getDocs(collection(db, "personalTrainers", profileData.trainerId, "students", user!.uid, "workoutPlans")),
            ]);

            const completedPlanIds = new Set(
              sessionsSnap.docs
                .map((sessionDoc) => sessionDoc.data()?.workoutPlanId)
                .filter((planId): planId is string => typeof planId === "string" && planId.length > 0)
            );

            const now = Date.now();
            const plannedWorkouts = workoutPlansSnap.docs
              .map((planDoc) => ({ id: planDoc.id, data: planDoc.data() as any }))
              .map((plan) => {
                const scheduledRaw = plan.data.assignedAt || plan.data.createdAt || "";
                const timestamp = Date.parse(scheduledRaw);
                return { id: plan.id, timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
              })
              .filter((plan) => plan.timestamp > 0 && plan.timestamp <= now)
              .sort((a, b) => b.timestamp - a.timestamp);

            let computedStreak = 0;
            for (const plan of plannedWorkouts) {
              if (completedPlanIds.has(plan.id)) {
                computedStreak += 1;
                continue;
              }
              break;
            }
            setCurrentStreak(computedStreak);

            const latestSessionTimestamp = sessionsSnap.docs.reduce((latest, sessionDoc) => {
              const data: any = sessionDoc.data();
              const timestamp = Date.parse(data?.completedAt || data?.date || data?.createdAt || "");
              if (!Number.isFinite(timestamp)) return latest;
              return timestamp > latest ? timestamp : latest;
            }, 0);
            setLastSessionDoneAt(latestSessionTimestamp > 0 ? new Date(latestSessionTimestamp).toISOString() : null);
          } else {
            setCurrentStreak(0);
            setLastSessionDoneAt(null);
          }
        }
      } catch (e) {
        console.error("Error finding student profile", e);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    findStudentProfile();
  }, [db, user?.uid]);

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
        <div className="max-w-lg mx-auto py-16 text-center space-y-4">
          <h2 className="text-2xl font-bold font-headline">{t("welcome")}</h2>
          <p className="text-muted-foreground">
            {t("noProfileYet")}
          </p>
          <Button asChild>
            <Link href="/student/profile">{t("goToProfile")}</Link>
          </Button>
        </div>
      </StudentNavigation>
    );
  }

  const firstName =
    studentData.name?.split(" ")[0] || studentData.firstName || "Student";

  const trainingStatusDescription =
    !studentData.trainerId
      ? t("noTrainerLinked")
      : studentData.currentProgramId
        ? t("activeProgramInProgress")
        : t("waitingForCoach");

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("welcomeBack2")}{firstName}!</h1>
          <p className="text-muted-foreground capitalize">
            {t("goalPrefix")}{studentData.goalType?.replace("_", " ") || "—"}
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("trainingStatus")}</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  {trainingStatusDescription}
                </CardDescription>
              </div>
              <Dumbbell className="h-8 w-8 opacity-20" />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t("currentStreak")}</span>
                  <span>
                    {currentStreak}{t("workoutsLabel")}{" "}
                    <Flame className="inline h-4 w-4" />
                  </span>
                </div>
                <Progress
                  value={Math.min(currentStreak * 10, 100)}
                  className="h-2 bg-primary-foreground/20"
                />
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">
                    {t("lastSession")}{" "}
                    {lastSessionDoneAt
                      ? new Date(lastSessionDoneAt).toLocaleDateString()
                      : t("noHistory")}
                  </span>
                </div>
                {studentData.currentProgramId && (
                  <Button variant="secondary" asChild>
                    <Link href={`/student/workouts/${studentData.currentProgramId}/session`}>
                      <Play className="h-4 w-4 mr-2" /> {t("resume")}
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("physicalStats")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-bold">{studentData.weightKg} kg</p>
                  <p className="text-xs text-muted-foreground">
                    {t("weightGoalLabel").replace("{n}", String(studentData.goalWeightKg))}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Target className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-bold">{studentData.heightCm} cm</p>
                  <p className="text-xs text-muted-foreground">{t("height")}</p>
                </div>
              </div>
              {studentData.bodyFatPercent > 0 && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Percent className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-bold">{studentData.bodyFatPercent}%</p>
                    <p className="text-xs text-muted-foreground">{t("bodyFat")}</p>
                  </div>
                </div>
              )}
              <div className="text-xs text-center py-2 bg-muted rounded">
                {t("statusLabel")}{" "}
                <span className="font-bold capitalize">
                  {studentData.subscriptionStatus || "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </StudentNavigation>
  );
}
