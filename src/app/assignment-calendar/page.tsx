"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as MonthCalendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, getDocs, deleteDoc, updateDoc, doc } from "firebase/firestore";
import { CalendarDays, Dumbbell, Loader2, Pencil, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Assignment = {
  planId: string;
  studentId: string;
  studentName: string;
  title: string;
  assignedAt: string;
  scheduledTime: string;
  status?: string;
};

export default function AssignmentCalendarPage() {
  const { t } = useI18n();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedStudentId, setSelectedStudentId] = useState("all");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ planId: string; studentId: string } | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Edit state
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);
  const { data: rosterStudents, isLoading: isLoadingRoster } = useCollection(studentsQuery);

  const fetchAssignments = useCallback(async () => {
    if (!db || !user) return;
    if (!rosterStudents || rosterStudents.length === 0) {
      setAssignments([]);
      setIsLoadingAssignments(false);
      return;
    }

    setIsLoadingAssignments(true);
    const all: Assignment[] = [];

    for (const student of rosterStudents) {
      try {
        const plansSnap = await getDocs(
          collection(db, "personalTrainers", user.uid, "students", student.id, "workoutPlans")
        );

        plansSnap.forEach((d) => {
          const data: any = d.data();
          all.push({
            planId: d.id,
            studentId: student.id,
            studentName: `${student.firstName || student.name || ""} ${student.lastName || ""}`.trim(),
            title: data.title || "Untitled",
            assignedAt: data.assignedAt || data.createdAt || "",
            scheduledTime: data.scheduledTime || "",
            status: data.status || "",
          });
        });
      } catch {}
    }

    all.sort((a, b) => {
      const da = new Date(`${a.assignedAt.split("T")[0]}T${a.scheduledTime || "00:00"}`);
      const db2 = new Date(`${b.assignedAt.split("T")[0]}T${b.scheduledTime || "00:00"}`);
      return da.getTime() - db2.getTime();
    });

    setAssignments(all);
    setIsLoadingAssignments(false);
  }, [db, user, rosterStudents]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    const source = selectedStudentId === "all"
      ? assignments
      : assignments.filter((a) => a.studentId === selectedStudentId);

    for (const a of source) {
      if (!a.assignedAt) continue;
      const dateKey = new Date(a.assignedAt).toDateString();
      const arr = map.get(dateKey) || [];
      arr.push(a);
      map.set(dateKey, arr);
    }
    return map;
  }, [assignments, selectedStudentId]);

  const selectedDateAssignments = useMemo(() => {
    return assignmentsByDate.get(new Date(selectedDate).toDateString()) || [];
  }, [selectedDate, assignmentsByDate]);

  const assignmentDates = useMemo(
    () => Array.from(assignmentsByDate.keys()).map((d) => new Date(d)),
    [assignmentsByDate]
  );

  const upcomingAssignments = useMemo(() => {
    const now = new Date();
    const source = selectedStudentId === "all"
      ? assignments
      : assignments.filter((a) => a.studentId === selectedStudentId);

    return source
      .filter((a) => a.assignedAt && new Date(a.assignedAt) >= new Date(now.toDateString()))
      .slice(0, 12);
  }, [assignments, selectedStudentId]);

  const expiredAssignments = useMemo(() => {
    const source = selectedStudentId === "all"
      ? assignments
      : assignments.filter((a) => a.studentId === selectedStudentId);

    return source.filter((a) => a.status === "expired");
  }, [assignments, selectedStudentId]);

  const handleDelete = async () => {
    if (!db || !user || !confirmDeleteId) return;
    const { planId, studentId } = confirmDeleteId;
    setIsDeletingId(planId);
    setConfirmDeleteId(null);
    try {
      await deleteDoc(
        doc(db, "personalTrainers", user.uid, "students", studentId, "workoutPlans", planId)
      );
      setAssignments((prev) => prev.filter((a) => !(a.planId === planId && a.studentId === studentId)));
      toast({ title: t("assignmentDeleted") || "Assignment deleted" });
    } catch {
      toast({ title: t("error") || "Error", description: t("deleteFailed") || "Failed to delete", variant: "destructive" });
    } finally {
      setIsDeletingId(null);
    }
  };

  const openEdit = (a: Assignment) => {
    setEditingAssignment(a);
    setEditTitle(a.title);
    setEditDate(a.assignedAt ? a.assignedAt.split("T")[0] : "");
  };

  const handleSaveEdit = async () => {
    if (!db || !user || !editingAssignment) return;
    setIsSavingEdit(true);
    try {
      const newAssignedAt = editDate
        ? new Date(editDate + "T12:00:00").toISOString()
        : editingAssignment.assignedAt;
      await updateDoc(
        doc(db, "personalTrainers", user.uid, "students", editingAssignment.studentId, "workoutPlans", editingAssignment.planId),
        { title: editTitle, assignedAt: newAssignedAt }
      );
      setAssignments((prev) =>
        prev.map((a) =>
          a.planId === editingAssignment.planId && a.studentId === editingAssignment.studentId
            ? { ...a, title: editTitle, assignedAt: newAssignedAt }
            : a
        )
      );
      toast({ title: t("changesSaved") || "Changes saved" });
      setEditingAssignment(null);
    } catch {
      toast({ title: t("error") || "Error", description: t("saveFailed") || "Failed to save", variant: "destructive" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const isLoading = isUserLoading || isLoadingRoster || isLoadingAssignments;

  // Reusable assignment card with edit/delete actions
  const AssignmentRow = ({ a }: { a: Assignment }) => (
    <div className={`flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-accent/5 transition-colors ${a.status === "expired" ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : ""}`}>
      <Dumbbell className={`h-3.5 w-3.5 shrink-0 ${a.status === "expired" ? "text-orange-500" : "text-primary"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{a.title}</p>
          {a.status === "expired" && (
            <Badge className="text-[9px] h-4 px-1 bg-orange-100 text-orange-700 border-orange-300 shrink-0">Expirado</Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {a.studentName}{a.scheduledTime ? ` · ${a.scheduledTime}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:bg-destructive/10"
          disabled={isDeletingId === a.planId}
          onClick={() => setConfirmDeleteId({ planId: a.planId, studentId: a.studentId })}
        >
          {isDeletingId === a.planId
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" asChild>
          <Link href={`/students/${a.studentId}`}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );

  // Upcoming card with edit/delete actions
  const UpcomingCard = ({ a }: { a: Assignment }) => {
    const d = new Date(a.assignedAt);
    const isToday = d.toDateString() === new Date().toDateString();
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
        <div className="flex flex-col items-center justify-center min-w-[44px] rounded-md bg-primary/10 px-2 py-1 shrink-0">
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
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
            disabled={isDeletingId === a.planId}
            onClick={() => setConfirmDeleteId({ planId: a.planId, studentId: a.studentId })}
          >
            {isDeletingId === a.planId
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" asChild>
            <Link href={`/students/${a.studentId}`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Navigation>
      <div className="space-y-6">
        <header>
          <h2 className="text-3xl font-bold font-headline">{t("assignmentCalendar")}</h2>
          <p className="text-muted-foreground">{t("trackAssignedByDate")}</p>
        </header>

        {/* Delete confirmation */}
        <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("removeAssignedWorkout") || "Remove assignment"}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteStudentConfirmDesc") || "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" /> {t("delete") || "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit dialog */}
        <Dialog open={!!editingAssignment} onOpenChange={(open) => { if (!open) setEditingAssignment(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("editAssignment") || "Edit Assignment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>{t("title") || "Title"}</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("date") || "Date"}</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingAssignment(null)}>{t("cancel")}</Button>
              <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("saveChanges") || "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid lg:grid-cols-5 gap-6">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" /> {t("dateView")}
              </CardTitle>
              <CardDescription>{t("pickStudentAndDate")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("chooseStudent")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allStudentsOption")}</SelectItem>
                  {(rosterStudents || []).map((student: any) => {
                    const name = `${student.firstName || student.name || ""} ${student.lastName || ""}`.trim() || "Unnamed";
                    return (
                      <SelectItem key={student.id} value={student.id}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <MonthCalendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) setSelectedDate(date);
                }}
                modifiers={{ assigned: assignmentDates }}
                modifiersClassNames={{ assigned: "bg-primary/10 text-primary font-semibold" }}
                classNames={{}}
                className="w-full rounded-md border"
              />

              <p className="text-xs text-muted-foreground">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : selectedDateAssignments.length > 0 ? (
                <div className="space-y-2">
                  {selectedDateAssignments.map((a) => (
                    <AssignmentRow key={`${a.studentId}-${a.planId}`} a={a} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("noAssignmentsOnDate")}</p>
              )}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("upcomingAssignments")}</CardTitle>
                <CardDescription>{t("nextScheduledWorkouts")}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : upcomingAssignments.length > 0 ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                    {upcomingAssignments.map((a) => (
                      <UpcomingCard key={`${a.studentId}-${a.planId}`} a={a} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noUpcomingAssignments")}</p>
                )}
              </CardContent>
            </Card>

            {expiredAssignments.length > 0 && (
              <Card className="border-orange-300 dark:border-orange-800">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400 text-base">
                    <AlertTriangle className="h-4 w-4" />
                    Treinos Expirados
                    <Badge className="ml-auto bg-orange-100 text-orange-700 border-orange-300">{expiredAssignments.length}</Badge>
                  </CardTitle>
                  <CardDescription>Treinos não realizados — data de atribuição já passou</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {expiredAssignments.map((a) => (
                    <AssignmentRow key={`${a.studentId}-${a.planId}`} a={a} />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Navigation>
  );
}
