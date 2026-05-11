
"use client";

import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Users, Activity, Calendar as CalendarIcon, TrendingUp, Loader2, Weight, Target, UserPlus, Dumbbell, Trash2, Pencil, X,
  Search, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc, getDocs, deleteDoc, updateDoc } from "firebase/firestore";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { SessionSlotAttendance } from "@/lib/session-attendance-streak";
import { maxAttendanceStreakForCandidates } from "@/lib/session-attendance-streak";
import { getStudentDisplayName, getStudentEmail } from "@/lib/student-display";
import {
  fetchRosterPaymentStatusMap,
  ensureRosterPendingPaymentsForCurrentMonth,
} from "@/lib/roster-payment-status";

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
  storageStudentId: string;
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
  const { t, locale } = useI18n();

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

  const sortLocale = locale === "pt" ? "pt-PT" : "en-US";
  const sortedStudents = useMemo(() => {
    const nameFallback = t("unnamed");
    const collatorOpts: Intl.CollatorOptions = { sensitivity: "base" };
    return [...mergedStudents].sort((a, b) => {
      const cmp = getStudentDisplayName(a, nameFallback).localeCompare(
        getStudentDisplayName(b, nameFallback),
        sortLocale,
        collatorOpts
      );
      if (cmp !== 0) return cmp;
      return getStudentEmail(a).localeCompare(getStudentEmail(b), sortLocale, collatorOpts);
    });
  }, [mergedStudents, t, sortLocale]);

  const rosterOnlySorted = useMemo(
    () => sortedStudents.filter((s) => s._onRoster),
    [sortedStudents]
  );

  const [dashboardStudentSearch, setDashboardStudentSearch] = useState("");
  const [dashboardPaymentFilter, setDashboardPaymentFilter] = useState<"all" | "paid" | "pending">("all");
  const [dashboardPaymentStatusMap, setDashboardPaymentStatusMap] = useState<
    Record<string, { status: string; period: string }>
  >({});

  const fetchDashboardPayments = useCallback(async () => {
    if (!db || !user || !rosterStudents?.length) {
      setDashboardPaymentStatusMap({});
      return;
    }
    const ids = rosterStudents.map((s: StudentRow & { id: string }) => s.id).filter(Boolean);
    await ensureRosterPendingPaymentsForCurrentMonth(db, user.uid, ids);
    const map = await fetchRosterPaymentStatusMap(db, user.uid, ids);
    setDashboardPaymentStatusMap(map);
  }, [db, user, rosterStudents]);

  useEffect(() => {
    fetchDashboardPayments();
  }, [fetchDashboardPayments]);

  const filteredDashboardRoster = useMemo(() => {
    let rows = rosterOnlySorted;
    const q = dashboardStudentSearch.toLowerCase().trim();
    if (q) {
      rows = rows.filter((student) => {
        const row = student as StudentRow;
        const name = getStudentDisplayName(row, "").toLowerCase();
        const email = getStudentEmail(row).toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    if (dashboardPaymentFilter !== "all") {
      rows = rows.filter((student) => {
        const info = dashboardPaymentStatusMap[student.id];
        const isPaid = info?.status === "paid";
        return dashboardPaymentFilter === "paid" ? isPaid : !isPaid;
      });
    }
    return rows;
  }, [rosterOnlySorted, dashboardStudentSearch, dashboardPaymentFilter, dashboardPaymentStatusMap]);

  const portalStudentIdByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of (portalStudents || []) as StudentRow[]) {
      const email = String((student as any).email || "").trim().toLowerCase();
      if (email && student.id) {
        map.set(email, student.id);
      }
    }
    return map;
  }, [portalStudents]);

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

    const slotDm = Number((trainer as Record<string, unknown> | undefined)?.slotDurationMin) || 30;
    let sessionSlotsList: SessionSlotAttendance[] = [];
    try {
      const slotsSnap = await getDocs(collection(db, "personalTrainers", user.uid, "sessionSlots"));
      sessionSlotsList = slotsSnap.docs.map((d) => {
        const data = d.data() as SessionSlotAttendance;
        return {
          ...data,
          id: d.id,
          date: String(data.date ?? ""),
          startTime: String(data.startTime ?? ""),
          students: Array.isArray(data.students) ? data.students : [],
        };
      });
    } catch {}

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
        const rosterStudentId = String((student as any).id || "");
        const userId = String((student as any).userId || "");
        const email = String((student as any).email || "").trim().toLowerCase();
        const globalStudentId = email ? (portalStudentIdByEmail.get(email) || "") : "";
        const candidateIds = Array.from(new Set([rosterStudentId, userId, globalStudentId].filter(Boolean)));

        let plansSnap: any = null;
        let sessionsSnap: any = null;
        let storageStudentId = rosterStudentId;

        for (const candidateId of candidateIds) {
          const [candidatePlans, candidateSessions] = await Promise.all([
            getDocs(collection(db, "personalTrainers", user.uid, "students", candidateId, "workoutPlans")),
            getDocs(collection(db, "personalTrainers", user.uid, "students", candidateId, "workoutSessions")),
          ]);
          plansSnap = candidatePlans;
          sessionsSnap = candidateSessions;
          storageStudentId = candidateId;
          if (!candidatePlans.empty || !candidateSessions.empty) {
            break;
          }
        }
        
        const completedPlanIds = new Set<string>();
        sessionsSnap.forEach((sessDoc: any) => {
          const data = sessDoc.data();
          if (data.completedAt) {
            completedPlanIds.add(data.workoutPlanId);
          }
        });
        
        plansSnap.forEach((d: any) => {
          const data = d.data();
          const assignedDate = new Date(data.assignedAt || data.createdAt || "");
          
          all.push({
            planId: d.id,
            studentId: rosterStudentId,
            storageStudentId,
            studentName: `${student.firstName || student.name || ""} ${student.lastName || ""}`.trim(),
            title: data.title || t("untitled"),
            assignedAt: data.assignedAt || data.createdAt || "",
            scheduledTime: data.scheduledTime || "",
            exercises: (data.exercises || []).map((ex: any) => ({
              name: ex.name || ex.exerciseName || t("unnamed"),
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

        const streak = maxAttendanceStreakForCandidates(sessionSlotsList, candidateIds, Date.now(), slotDm);

        totalStreakAcrossRoster += streak;
        streakStudentCount += 1;
        streakMap[rosterStudentId] = streak;
      } catch {}
    }
    
    setAssignments(all);
    const percentageValue = totalPlannedThisWeek > 0 ? Math.round((totalCompletedThisWeek / totalPlannedThisWeek) * 100) : 0;
    setTeamVelocityPercent(percentageValue);
    setAvgStreakValue(streakStudentCount > 0 ? Math.round(totalStreakAcrossRoster / streakStudentCount) : 0);
    setStreakByStudentId(streakMap);
  }, [db, user, rosterStudents, portalStudentIdByEmail, t, trainer]);

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
      await deleteDoc(
        doc(
          db,
          "personalTrainers",
          user.uid,
          "students",
          a.storageStudentId || a.studentId,
          "workoutPlans",
          a.planId
        )
      );
      toast({ title: t("workoutRemoved") });
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    }
  };

  const handleSaveEdit = async () => {
    if (!db || !user || !selectedAssignment) return;
    try {
      const updatedAssignedAt = editDate
        ? new Date(`${editDate}T${editTime || "00:00"}`).toISOString()
        : selectedAssignment.assignedAt;
      await updateDoc(
        doc(
          db,
          "personalTrainers",
          user.uid,
          "students",
          selectedAssignment.storageStudentId || selectedAssignment.studentId,
          "workoutPlans",
          selectedAssignment.planId
        ),
        { title: editTitle, exercises: editExercises, assignedAt: updatedAssignedAt, scheduledTime: editTime }
      );
      toast({ title: t("workoutUpdated") });
      setIsEditing(false);
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
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
      label: t("teamVelocity"),
      value: `${teamVelocityPercent}%`,
      icon: Activity,
      change: t("workoutCompletionRate"),
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
            <h2 className="text-3xl font-bold font-headline">{t("welcomeCoach")} {trainer?.lastName || ""}</h2>
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

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("students")}</CardTitle>
                <CardDescription>{t("studentsCardDescription")}</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/students">{t("openDirectory")}</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : rosterOnlySorted.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-accent/5">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">{t("noStudentsYet")}</p>
                  <Button variant="outline" size="sm" className="mt-4" asChild>
                    <Link href="/students">{t("studentDirectory")}</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs text-muted-foreground sr-only">{t("searchByNameOrEmail")}</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder={t("searchByNameOrEmail")}
                          value={dashboardStudentSearch}
                          onChange={(e) => setDashboardStudentSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="w-full sm:w-44 space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("dashboardRosterPaymentFilter")}</Label>
                      <Select value={dashboardPaymentFilter} onValueChange={(v) => setDashboardPaymentFilter(v as "all" | "paid" | "pending")}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("filterAll")}</SelectItem>
                          <SelectItem value="paid">{t("paid")}</SelectItem>
                          <SelectItem value="pending">{t("pending")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {filteredDashboardRoster.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-accent/5">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">{t("noStudentsFound")}</p>
                      <p className="text-xs mt-1">{t("tryDifferentSearchTerm")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[min(60vh,520px)] overflow-y-auto pr-1">
                      {filteredDashboardRoster.map((student) => {
                        const pay = dashboardPaymentStatusMap[student.id];
                        return (
                          <Link
                            key={student.id}
                            href={`/students/${student.id}`}
                            className="flex items-center justify-between gap-3 hover:bg-accent/5 p-3 rounded-xl border border-transparent hover:border-border transition-all"
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <Avatar className="h-12 w-12 ring-2 ring-primary/5 shrink-0">
                                <AvatarImage src={(student.photoUrl as string) || `https://picsum.photos/seed/${student.id}/100/100`} />
                                <AvatarFallback>
                                  {String(student.firstName || student.name || "?")[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                {(() => {
                                  const displayFirst = String(student.firstName || student.name || "").trim();
                                  const displayLast = student.lastName ? String(student.lastName).trim() : "";
                                  const weightValue = Number(student.weightKg);
                                  const goalWeightValue = Number(student.goalWeightKg);
                                  const weightText = Number.isFinite(weightValue) ? String(weightValue) : "--";
                                  const goalWeightText = Number.isFinite(goalWeightValue) ? String(goalWeightValue) : "--";

                                  return (
                                    <>
                                      <p className="text-sm font-bold leading-none truncate">
                                        {displayFirst} {displayLast}
                                      </p>
                                      <p className="text-xs text-muted-foreground capitalize mt-1 truncate">
                                        {String(student.goalType || t("notSet")).replace(/_/g, " ")}
                                      </p>
                                      {typeof student.coachingNotes === "string" && student.coachingNotes.trim() && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                          {t("privateNote")}: {student.coachingNotes.trim()}
                                        </p>
                                      )}
                                      {pay && (
                                        <Badge
                                          variant={pay.status === "paid" ? "default" : "outline"}
                                          className={`mt-1.5 text-[9px] h-5 gap-1 uppercase tracking-wide ${
                                            pay.status === "paid"
                                              ? "bg-green-600 hover:bg-green-600"
                                              : "bg-yellow-100 text-yellow-900 border-yellow-200"
                                          }`}
                                        >
                                          <Banknote className="h-3 w-3 shrink-0" />
                                          {pay.status === "paid" ? t("paid") : t("pending")}
                                        </Badge>
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
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <Badge variant="secondary" className="text-[10px] h-5">
                                {streakByStudentId[student.id] ?? 0} {t("sessionsStreakCompact")}
                              </Badge>
                              <p className="text-[10px] text-muted-foreground">
                                {t("memberSince")}{" "}
                                {student.joinedAt
                                  ? new Date(String(student.joinedAt)).toLocaleDateString()
                                  : t("today")}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Workout Detail Dialog */}
        <Dialog open={!!selectedAssignment} onOpenChange={(open) => { if (!open) { setSelectedAssignment(null); setIsEditing(false); } }}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-primary" />
                {isEditing ? t("editWorkout") : t("workoutDetails")}
              </DialogTitle>
            </DialogHeader>
            {selectedAssignment && !isEditing && (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-bold">{selectedAssignment.title}</p>
                  <p className="text-sm text-muted-foreground">{t("assignedTo")} {selectedAssignment.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedAssignment.assignedAt ? new Date(selectedAssignment.assignedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}
                    {selectedAssignment.scheduledTime ? ` at ${selectedAssignment.scheduledTime}` : ""}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">{t("exercises")} ({selectedAssignment.exercises.length})</p>
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
                    <p className="text-sm text-muted-foreground">{t("noExercisesDefined")}</p>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 gap-1" variant="outline" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4" /> {t("edit")}
                  </Button>
                  <Button className="flex-1 gap-1" variant="destructive" onClick={() => handleDeleteAssignment(selectedAssignment)}>
                    <Trash2 className="h-4 w-4" /> {t("delete")}
                  </Button>
                </div>
                <Button variant="link" className="w-full text-xs" asChild>
                  <Link href={`/students/${selectedAssignment.studentId}`}>{t("viewStudentProfile")}</Link>
                </Button>
              </div>
            )}
            {selectedAssignment && isEditing && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{t("workoutTitle")}</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm font-medium">{t("date")}</label>
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t("time")}</label>
                    <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">{t("exercises")}</p>
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
                          placeholder={t("exerciseName")}
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
                          <label className="text-[10px] text-muted-foreground">{t("sets")}</label>
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
                          <label className="text-[10px] text-muted-foreground">{t("reps")}</label>
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
                          <label className="text-[10px] text-muted-foreground">{t("weightKg")}</label>
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
                    {t("addExercise")}
                  </Button>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" variant="outline" onClick={() => setIsEditing(false)}>
                    {t("cancel")}
                  </Button>
                  <Button className="flex-1" onClick={handleSaveEdit}>
                    {t("saveChanges")}
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
