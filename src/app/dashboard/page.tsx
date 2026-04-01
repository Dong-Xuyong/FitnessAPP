
"use client";

import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Activity, Calendar as CalendarIcon, TrendingUp, Loader2, Weight, Target, UserPlus, Dumbbell, Trash2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc, getDocs, deleteDoc, updateDoc } from "firebase/firestore";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

type StudentRow = Record<string, unknown> & { id: string; _onRoster?: boolean };

function mergePortalAndRoster(
  portal: StudentRow[] | null,
  roster: StudentRow[] | null
): StudentRow[] {
  const rosterMap = new Map((roster || []).map((s) => [s.id, s]));
  const ids = new Set<string>();
  (portal || []).forEach((p) => ids.add(p.id));
  (roster || []).forEach((s) => ids.add(s.id));
  if (ids.size === 0) return [];

  return [...ids].map((sid) => {
    const p = portal?.find((x) => x.id === sid);
    const r = rosterMap.get(sid);
    if (r && p) {
      return { ...p, ...r, id: sid, _onRoster: true };
    }
    if (r) {
      return { ...r, id: sid, _onRoster: true };
    }
    if (p) {
      const name = String(p.name || "");
      const parts = name.trim().split(/\s+/);
      const first = parts[0] || "";
      const last = parts.slice(1).join(" ") || "";
      return {
        ...p,
        id: sid,
        firstName: p.firstName ?? first,
        lastName: p.lastName ?? last,
        _onRoster: false,
      };
    }
    return { id: sid };
  });
}

type Assignment = {
  planId: string;
  studentId: string;
  studentName: string;
  title: string;
  assignedAt: string;
  scheduledTime: string;
  exercises: { name: string; sets: number; reps: number; weight?: number }[];
};

function DashboardContent() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();

  const trainerRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "personalTrainers", user.uid);
  }, [db, user]);

  const { data: trainer } = useDoc(trainerRef);

  const portalStudentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "students");
  }, [db, user]);

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: portalStudents, isLoading: isLoadingPortal } = useCollection(portalStudentsQuery);
  const { data: rosterStudents, isLoading: isLoadingRoster } = useCollection(studentsQuery);

  const mergedStudents = useMemo(
    () => mergePortalAndRoster(portalStudents as StudentRow[] | null, rosterStudents as StudentRow[] | null),
    [portalStudents, rosterStudents]
  );

  const sortedStudents = useMemo(
    () =>
      [...mergedStudents].sort(
        (a, b) =>
          new Date(String(b.joinedAt || 0)).getTime() -
          new Date(String(a.joinedAt || 0)).getTime()
      ),
    [mergedStudents]
  );

  // Fetch all workout plans assigned to roster students
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teamVelocityPercent, setTeamVelocityPercent] = useState(0);
  const [avgStreakValue, setAvgStreakValue] = useState(0);
  const [streakByStudentId, setStreakByStudentId] = useState<Record<string, number>>({});
  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editExercises, setEditExercises] = useState<Assignment["exercises"]>([]);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  const fetchAssignments = useCallback(async () => {
    if (!db || !user) return;
    if (!rosterStudents || rosterStudents.length === 0) {
      setAssignments([]);
      setTeamVelocityPercent(0);
      setAvgStreakValue(0);
      setStreakByStudentId({});
      return;
    }
    
    // Get current week boundaries (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);
    
    const all: Assignment[] = [];
    let totalPlannedThisWeek = 0;
    let totalCompletedThisWeek = 0;
    let totalStreakAcrossRoster = 0;
    let streakStudentCount = 0;
    const streakMap: Record<string, number> = {};
    
    for (const student of rosterStudents) {
      try {
        const [plansSnap, sessionsSnap] = await Promise.all([
          getDocs(collection(db, "personalTrainers", user.uid, "students", student.id, "workoutPlans")),
          getDocs(collection(db, "personalTrainers", user.uid, "students", student.id, "workoutSessions")),
        ]);
        
        const completedPlanIds = new Set<string>();
        sessionsSnap.forEach((sessDoc) => {
          const data = sessDoc.data();
          if (data.completedAt) {
            completedPlanIds.add(data.workoutPlanId);
          }
        });
        
        plansSnap.forEach((d) => {
          const data = d.data();
          const assignedDate = new Date(data.assignedAt || data.createdAt || "");
          
          all.push({
            planId: d.id,
            studentId: student.id,
            studentName: `${student.firstName || student.name || ""} ${student.lastName || ""}`.trim(),
            title: data.title || "Untitled",
            assignedAt: data.assignedAt || data.createdAt || "",
            scheduledTime: data.scheduledTime || "",
            exercises: (data.exercises || []).map((ex: any) => ({
              name: ex.name || ex.exerciseName || "Unnamed",
              sets: ex.sets || 0,
              reps: ex.reps || 0,
              weight: ex.weight,
            })),
          });
          
          // Track week completion
          if (assignedDate >= weekStart && assignedDate <= weekEnd) {
            totalPlannedThisWeek += 1;
            if (completedPlanIds.has(d.id)) {
              totalCompletedThisWeek += 1;
            }
          }
        });

        const nowTs = Date.now();
        const plannedWorkouts = plansSnap.docs
          .map((planDoc) => {
            const data = planDoc.data();
            const scheduledRaw = data.assignedAt || data.createdAt || "";
            const ts = Date.parse(scheduledRaw);
            return {
              id: planDoc.id,
              timestamp: Number.isFinite(ts) ? ts : 0,
            };
          })
          .filter((plan) => plan.timestamp > 0 && plan.timestamp <= nowTs)
          .sort((a, b) => b.timestamp - a.timestamp);

        let streak = 0;
        for (const plan of plannedWorkouts) {
          if (completedPlanIds.has(plan.id)) {
            streak += 1;
            continue;
          }
          break;
        }

        totalStreakAcrossRoster += streak;
        streakStudentCount += 1;
        streakMap[student.id] = streak;
      } catch {}
    }
    
    setAssignments(all);
    const percentageValue = totalPlannedThisWeek > 0 ? Math.round((totalCompletedThisWeek / totalPlannedThisWeek) * 100) : 0;
    setTeamVelocityPercent(percentageValue);
    setAvgStreakValue(streakStudentCount > 0 ? Math.round(totalStreakAcrossRoster / streakStudentCount) : 0);
    setStreakByStudentId(streakMap);
  }, [db, user, rosterStudents]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    for (const a of assignments) {
      if (!a.assignedAt) continue;
      const dateKey = new Date(a.assignedAt).toDateString();
      const arr = map.get(dateKey) || [];
      arr.push(a);
      map.set(dateKey, arr);
    }
    return map;
  }, [assignments]);

  const assignmentDates = useMemo(
    () => [...assignmentsByDate.keys()].map((d) => new Date(d)),
    [assignmentsByDate]
  );

  const selectedDateAssignments = useMemo(() => {
    if (!calendarDate) return [];
    return assignmentsByDate.get(new Date(calendarDate).toDateString()) || [];
  }, [calendarDate, assignmentsByDate]);

  const handleDeleteAssignment = async (a: Assignment) => {
    if (!db || !user) return;
    try {
      await deleteDoc(doc(db, "personalTrainers", user.uid, "students", a.studentId, "workoutPlans", a.planId));
      toast({ title: "Workout removed" });
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleSaveEdit = async () => {
    if (!db || !user || !selectedAssignment) return;
    try {
      const updatedAssignedAt = editDate
        ? new Date(`${editDate}T${editTime || "00:00"}`).toISOString()
        : selectedAssignment.assignedAt;
      await updateDoc(
        doc(db, "personalTrainers", user.uid, "students", selectedAssignment.studentId, "workoutPlans", selectedAssignment.planId),
        { title: editTitle, exercises: editExercises, assignedAt: updatedAssignedAt, scheduledTime: editTime }
      );
      toast({ title: "Workout updated" });
      setIsEditing(false);
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openDetail = (a: Assignment) => {
    setSelectedAssignment(a);
    setIsEditing(false);
    setEditTitle(a.title);
    setEditExercises(a.exercises.map((ex) => ({ ...ex })));
    setEditDate(a.assignedAt ? new Date(a.assignedAt).toISOString().split("T")[0] : "");
    setEditTime(a.scheduledTime || "");
  };

  const isLoading = isLoadingPortal || isLoadingRoster;
  const rosterCount = rosterStudents?.length ?? 0;
  const portalCount = mergedStudents.length;

  const goalSuccessPercent = useMemo(() => {
    if (!rosterStudents || rosterStudents.length === 0) return 0;

    let totalWithGoals = 0;
    let reachedGoals = 0;

    for (const student of rosterStudents as StudentRow[]) {
      const weight = Number(student.weightKg);
      const goalWeight = Number(student.goalWeightKg);
      const goalType = String(student.goalType || "").toLowerCase();

      if (!Number.isFinite(weight) || !Number.isFinite(goalWeight) || goalWeight <= 0) continue;
      totalWithGoals += 1;

      if (goalType === "weight_loss") {
        if (weight <= goalWeight) reachedGoals += 1;
      } else if (goalType === "muscle_gain") {
        if (weight >= goalWeight) reachedGoals += 1;
      } else {
        if (Math.abs(weight - goalWeight) <= 1) reachedGoals += 1;
      }
    }

    if (totalWithGoals === 0) return 0;
    return Math.round((reachedGoals / totalWithGoals) * 100);
  }, [rosterStudents]);

  const stats = [
    {
      label: t("portalStudents"),
      value: portalCount.toString(),
      icon: Users,
      change: `${rosterCount} ${t("onYourRoster")}`,
    },
    {
      label: "Team Velocity",
      value: `${teamVelocityPercent}%`,
      icon: Activity,
      change: "Workout completion rate this week",
    },
    {
      label: t("avgStreak"),
      value: String(avgStreakValue),
      icon: TrendingUp,
      change: t("rosterOnly"),
    },
    { label: t("goalSuccess"), value: `${goalSuccessPercent}%`, icon: Target, change: t("targetWeightsReached") },
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
            <p className="text-muted-foreground">{t("overviewDescription")}</p>
          </div>
          <Button asChild>
            <Link href="/students" className="gap-2">
              <UserPlus className="h-4 w-4" /> {t("manageRoster")}
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

        {/* Upcoming Assignments */}
        {(() => {
          const now = new Date();
          const upcoming = assignments
            .filter((a) => a.assignedAt && new Date(a.assignedAt) >= new Date(now.toDateString()))
            .sort((a, b) => {
              const da = new Date(`${a.assignedAt.split("T")[0]}T${a.scheduledTime || "00:00"}`);
              const db2 = new Date(`${b.assignedAt.split("T")[0]}T${b.scheduledTime || "00:00"}`);
              return da.getTime() - db2.getTime();
            })
            .slice(0, 6);
          return upcoming.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" /> {t("upcomingAssignments")}
                </CardTitle>
                <CardDescription>{t("nextScheduledWorkouts")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {upcoming.map((a, i) => {
                    const d = new Date(a.assignedAt);
                    const isToday = d.toDateString() === now.toDateString();
                    return (
                      <button
                        key={`${a.planId}-${i}`}
                        onClick={() => openDetail(a)}
                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/10 transition-colors text-left"
                      >
                        <div className="flex flex-col items-center justify-center min-w-[44px] rounded-md bg-primary/10 px-2 py-1">
                          <span className="text-[10px] font-bold uppercase text-primary">
                            {d.toLocaleDateString(undefined, { month: "short" })}
                          </span>
                          <span className="text-lg font-bold leading-none">{d.getDate()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{a.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{a.studentName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {a.scheduledTime && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{a.scheduledTime}</Badge>
                            )}
                            {isToday && (
                              <Badge className="text-[10px] h-4 px-1.5 bg-green-100 text-green-800">{t("today")}</Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null;
        })()}

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Students</CardTitle>
                <CardDescription>Everyone on the student portal; roster members include your private notes</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/students">Open directory</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedStudents.slice(0, 8).map((student) => (
                    <Link key={student.id} href={`/students/${student.id}`} className="flex items-center justify-between hover:bg-accent/5 p-3 rounded-xl border border-transparent hover:border-border transition-all">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 ring-2 ring-primary/5">
                          <AvatarImage src={(student.photoUrl as string) || `https://picsum.photos/seed/${student.id}/100/100`} />
                          <AvatarFallback>
                            {String(student.firstName || student.name || "?")[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          {(() => {
                            const displayFirst = String(student.firstName || student.name || "").trim();
                            const displayLast = student.lastName ? String(student.lastName).trim() : "";
                            const weightValue = Number(student.weightKg);
                            const goalWeightValue = Number(student.goalWeightKg);
                            const streakValue = Number(student.currentStreakDays);
                            const weightText = Number.isFinite(weightValue) ? String(weightValue) : "--";
                            const goalWeightText = Number.isFinite(goalWeightValue) ? String(goalWeightValue) : "--";
                            const streakText = Number.isFinite(streakValue) ? String(streakValue) : "0";

                            return (
                              <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold leading-none">
                              {displayFirst}{" "}
                              {displayLast}
                            </p>
                            {student._onRoster ? (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                                Roster
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                                Portal
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground capitalize mt-1">
                            {String(student.goalType || "not set").replace(/_/g, " ")}
                          </p>
                          {student._onRoster && typeof student.coachingNotes === "string" && student.coachingNotes.trim() && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              Private note: {student.coachingNotes.trim()}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Weight className="h-3 w-3" /> {weightText}kg
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Target className="h-3 w-3" /> {goalWeightText}kg
                            </span>
                          </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {student._onRoster
                            ? (streakByStudentId[student.id] ?? 0)
                            : 0}d Streak
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Joined{" "}
                          {student.joinedAt
                            ? new Date(String(student.joinedAt)).toLocaleDateString()
                            : "Recently"}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {sortedStudents.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-accent/5">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No students in the portal yet.</p>
                      <Button variant="outline" size="sm" className="mt-4" asChild>
                        <Link href="/students">Student directory</Link>
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
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" /> {t("assignmentCalendar")}
                </CardTitle>
                <CardDescription>{t("selectDateToSee")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="date"
                  value={calendarDate}
                  onChange={(e) => setCalendarDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <div className="space-y-2">
                  {calendarDate && (
                    <p className="text-xs font-medium text-muted-foreground">
                      {new Date(calendarDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                    </p>
                  )}
                  {selectedDateAssignments.length > 0 ? (
                    selectedDateAssignments.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => openDetail(a)}
                        className="flex items-center gap-2 p-2 rounded-lg border hover:bg-accent/10 transition-colors w-full text-left"
                      >
                        <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{a.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {a.studentName}{a.scheduledTime ? ` · ${a.scheduledTime}` : ""}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : calendarDate ? (
                    <p className="text-xs text-muted-foreground">{t("noAssignmentsOnDate")}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Workout Detail Dialog */}
        <Dialog open={!!selectedAssignment} onOpenChange={(open) => { if (!open) { setSelectedAssignment(null); setIsEditing(false); } }}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-primary" />
                {isEditing ? "Edit Workout" : "Workout Details"}
              </DialogTitle>
            </DialogHeader>
            {selectedAssignment && !isEditing && (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-bold">{selectedAssignment.title}</p>
                  <p className="text-sm text-muted-foreground">Assigned to {selectedAssignment.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedAssignment.assignedAt ? new Date(selectedAssignment.assignedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}
                    {selectedAssignment.scheduledTime ? ` at ${selectedAssignment.scheduledTime}` : ""}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Exercises ({selectedAssignment.exercises.length})</p>
                  {selectedAssignment.exercises.length > 0 ? (
                    selectedAssignment.exercises.map((ex, i) => (
                      <div key={i} className="p-3 border rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{ex.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ex.sets} sets x {ex.reps} reps{ex.weight ? ` @ ${ex.weight}kg` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">#{i + 1}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No exercises defined.</p>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 gap-1" variant="outline" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button className="flex-1 gap-1" variant="destructive" onClick={() => handleDeleteAssignment(selectedAssignment)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
                <Button variant="link" className="w-full text-xs" asChild>
                  <Link href={`/students/${selectedAssignment.studentId}`}>View Student Profile</Link>
                </Button>
              </div>
            )}
            {selectedAssignment && isEditing && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Workout Title</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm font-medium">Date</label>
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Time</label>
                    <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Exercises</p>
                  {editExercises.map((ex, i) => (
                    <div key={i} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <Input
                          value={ex.name}
                          onChange={(e) => {
                            const copy = [...editExercises];
                            copy[i] = { ...copy[i], name: e.target.value };
                            setEditExercises(copy);
                          }}
                          placeholder="Exercise name"
                          className="text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive shrink-0 ml-2"
                          onClick={() => setEditExercises(editExercises.filter((_, j) => j !== i))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Sets</label>
                          <Input
                            type="number"
                            value={ex.sets}
                            onChange={(e) => {
                              const copy = [...editExercises];
                              copy[i] = { ...copy[i], sets: Number(e.target.value) };
                              setEditExercises(copy);
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Reps</label>
                          <Input
                            type="number"
                            value={ex.reps}
                            onChange={(e) => {
                              const copy = [...editExercises];
                              copy[i] = { ...copy[i], reps: Number(e.target.value) };
                              setEditExercises(copy);
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Weight (kg)</label>
                          <Input
                            type="number"
                            value={ex.weight || ""}
                            onChange={(e) => {
                              const copy = [...editExercises];
                              copy[i] = { ...copy[i], weight: Number(e.target.value) || undefined };
                              setEditExercises(copy);
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setEditExercises([...editExercises, { name: "", sets: 3, reps: 10 }])}
                  >
                    + Add Exercise
                  </Button>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={handleSaveEdit}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
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
