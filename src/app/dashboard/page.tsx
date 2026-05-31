
"use client";

import { Suspense } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Users, Loader2, Weight, Target, UserPlus, Dumbbell, Trash2, Pencil, X,
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
import { fetchRosterPaymentStatusMap, nextBillingPeriod } from "@/lib/roster-payment-status";
import { normalizedPaymentPaid } from "@/lib/student-payment-due";
import {
  callCreateNextPeriodPayments,
  callRemoveNextPeriodPayments,
} from "@/lib/roster-next-period-payments-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [billingBulkConfirm, setBillingBulkConfirm] = useState<"create" | "remove" | null>(null);
  const [billingBulkLoading, setBillingBulkLoading] = useState(false);

  const nextPaymentPeriod = nextBillingPeriod();

  const fetchDashboardPayments = useCallback(async () => {
    if (!db || !user || !rosterStudents?.length) {
      setDashboardPaymentStatusMap({});
      return;
    }
    const ids = rosterStudents.map((s: StudentRow & { id: string }) => s.id).filter(Boolean);
    const map = await fetchRosterPaymentStatusMap(db, user.uid, ids);
    setDashboardPaymentStatusMap(map);
  }, [db, user, rosterStudents]);

  useEffect(() => {
    fetchDashboardPayments();
  }, [fetchDashboardPayments]);

  const runBillingBulkAction = async () => {
    if (!user?.uid || !billingBulkConfirm) return;
    setBillingBulkLoading(true);
    try {
      if (billingBulkConfirm === "create") {
        const res = await callCreateNextPeriodPayments(user.uid);
        toast({
          title: t("dashboardNextPeriodCreateSuccess")
            .replace("{processed}", String(res.processed ?? 0))
            .replace("{period}", res.period || nextPaymentPeriod),
        });
      } else {
        const res = await callRemoveNextPeriodPayments(user.uid);
        toast({
          title: t("dashboardNextPeriodRemoveSuccess")
            .replace("{deleted}", String(res.deleted ?? 0))
            .replace("{period}", res.period || nextPaymentPeriod),
        });
      }
      setBillingBulkConfirm(null);
      await fetchDashboardPayments();
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: t("dashboardNextPeriodBulkFailed"),
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBillingBulkLoading(false);
    }
  };

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
        const isPaid = normalizedPaymentPaid(info?.status);
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

    const all: Assignment[] = [];
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

        plansSnap.forEach((d: any) => {
          const data = d.data();

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
        });

        const streak = maxAttendanceStreakForCandidates(sessionSlotsList, candidateIds, Date.now(), slotDm);

        streakMap[rosterStudentId] = streak;
      } catch {}
    }
    
    setAssignments(all);
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

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Navigation>
      <div className="space-y-6 min-w-0">
        <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-bold font-headline">{t("welcomeCoach")} {trainer?.lastName || ""}</h2>
            <p className="text-muted-foreground text-sm sm:text-base">{t("overviewDescription")}</p>
          </div>
          <Button asChild className="w-full sm:w-auto shrink-0">
            <Link href="/students" className="gap-2">
              <UserPlus className="h-4 w-4" /> {t("manageRoster")}
            </Link>
          </Button>
        </header>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-3 min-w-0">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
              <div className="min-w-0">
                <CardTitle>{t("students")}</CardTitle>
                <CardDescription>{t("studentsCardDescription")}</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:w-auto shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto h-auto min-h-9 py-2 whitespace-normal text-center"
                  disabled={billingBulkLoading || !user?.uid}
                  onClick={() => setBillingBulkConfirm("create")}
                >
                  {billingBulkLoading && billingBulkConfirm === "create" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("dashboardCreateNextPeriodPayments").replace("{period}", nextPaymentPeriod)
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto h-auto min-h-9 py-2 whitespace-normal text-center text-destructive hover:text-destructive"
                  disabled={billingBulkLoading || !user?.uid}
                  onClick={() => setBillingBulkConfirm("remove")}
                >
                  {billingBulkLoading && billingBulkConfirm === "remove" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("dashboardRemoveNextPeriodPayments").replace("{period}", nextPaymentPeriod)
                  )}
                </Button>
                <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                  <Link href="/students">{t("openDirectory")}</Link>
                </Button>
              </div>
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
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-accent/5 p-3 rounded-xl border border-transparent hover:border-border transition-all min-w-0"
                          >
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                              <Avatar className="h-10 w-10 sm:h-12 sm:w-12 ring-2 ring-primary/5 shrink-0">
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
                                          variant={normalizedPaymentPaid(pay.status) ? "default" : "outline"}
                                          className={`mt-1.5 text-[9px] h-5 gap-1 uppercase tracking-wide ${
                                            normalizedPaymentPaid(pay.status)
                                              ? "bg-green-600 hover:bg-green-600"
                                              : "bg-yellow-100 text-yellow-900 border-yellow-200"
                                          }`}
                                        >
                                          <Banknote className="h-3 w-3 shrink-0" />
                                          {normalizedPaymentPaid(pay.status) ? t("paid") : t("pending")}
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
                            <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-end gap-2 shrink-0 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-t-0 border-border/50 sm:border-transparent">
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

        <AlertDialog
          open={billingBulkConfirm !== null}
          onOpenChange={(open) => {
            if (!open && !billingBulkLoading) setBillingBulkConfirm(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {billingBulkConfirm === "create"
                  ? t("dashboardNextPeriodCreateConfirmTitle")
                  : t("dashboardNextPeriodRemoveConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {billingBulkConfirm === "create"
                  ? t("dashboardNextPeriodCreateConfirmDescription").replace(
                      "{period}",
                      nextPaymentPeriod
                    )
                  : t("dashboardNextPeriodRemoveConfirmDescription").replace(
                      "{period}",
                      nextPaymentPeriod
                    )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={billingBulkLoading}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={billingBulkLoading}
                onClick={(e) => {
                  e.preventDefault();
                  void runBillingBulkAction();
                }}
              >
                {billingBulkLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : billingBulkConfirm === "create" ? (
                  t("confirm")
                ) : (
                  t("delete")
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
