
"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell, Calendar, Play, TrendingUp, Loader2, Flame, Target, Percent } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

function getWeekKey(date: Date): string {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${month}-${dayOfMonth}`;
}

export default function StudentDashboardPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { t } = useI18n();

  const [studentData, setStudentData] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [weightInput, setWeightInput] = useState("");
  const [isSavingWeight, setIsSavingWeight] = useState(false);
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

  const currentWeekKey = getWeekKey(new Date());
  const lastCheckinWeekKey = studentData?.lastWeeklyWeightCheckInWeekKey || "";
  const requiresWeeklyWeightCheckIn = lastCheckinWeekKey !== currentWeekKey;

  const handleSubmitWeeklyWeight = async () => {
    if (!db || !user?.uid || !studentData) return;
    const parsedWeight = Number(weightInput);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) return;

    setIsSavingWeight(true);
    try {
      const ref = doc(db, "students", user.uid);
      const trainerStudentRef = studentData?.trainerId
        ? doc(db, "personalTrainers", studentData.trainerId, "students", user.uid)
        : null;
      const now = new Date().toISOString();
      const existingHistory = Array.isArray(studentData?.weightHistory) ? studentData.weightHistory : [];
      const nextHistory = [
        ...existingHistory.filter((entry: any) => entry?.weekKey !== currentWeekKey),
        {
          weekKey: currentWeekKey,
          date: now,
          weightKg: parsedWeight,
        },
      ].sort((a: any, b: any) => Date.parse(a.date || "") - Date.parse(b.date || ""));

      await updateDoc(ref, {
        weightKg: parsedWeight,
        lastWeeklyWeightCheckInAt: now,
        lastWeeklyWeightCheckInWeekKey: currentWeekKey,
        weightHistory: nextHistory,
        updatedAt: now,
      });

      if (trainerStudentRef) {
        await updateDoc(trainerStudentRef, {
          weightKg: parsedWeight,
          updatedAt: now,
        });
      }

      setStudentData((prev: any) => ({
        ...(prev || {}),
        weightKg: parsedWeight,
        lastWeeklyWeightCheckInAt: now,
        lastWeeklyWeightCheckInWeekKey: currentWeekKey,
        weightHistory: nextHistory,
        updatedAt: now,
      }));
      setWeightInput("");
    } catch (error) {
      console.error("Failed to save weekly weight", error);
    } finally {
      setIsSavingWeight(false);
    }
  };

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

        <Dialog open={requiresWeeklyWeightCheckIn} onOpenChange={() => {}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("weeklyWeightCheckin")}</DialogTitle>
              <DialogDescription>
                {t("weeklyCheckinDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="weekly-weight">{t("currentWeightKg")}</Label>
              <Input
                id="weekly-weight"
                type="number"
                step="0.1"
                min="1"
                placeholder={studentData?.weightKg ? String(studentData.weightKg) : "e.g. 72.4"}
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button onClick={handleSubmitWeeklyWeight} disabled={isSavingWeight || !(Number(weightInput) > 0)}>
                {isSavingWeight ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Weight
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </StudentNavigation>
  );
}
