"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as MonthCalendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { CalendarDays, Dumbbell, Loader2 } from "lucide-react";

type Assignment = {
  planId: string;
  studentId: string;
  studentName: string;
  title: string;
  assignedAt: string;
  scheduledTime: string;
};

export default function AssignmentCalendarPage() {
  const { t } = useI18n();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedStudentId, setSelectedStudentId] = useState("all");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);

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

  const isLoading = isUserLoading || isLoadingRoster || isLoadingAssignments;

  return (
    <Navigation>
      <div className="space-y-6">
        <header>
          <h2 className="text-3xl font-bold font-headline">{t("assignmentCalendar")}</h2>
          <p className="text-muted-foreground">{t("trackAssignedByDate")}</p>
        </header>

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
                    <Link
                      key={`${a.studentId}-${a.planId}`}
                      href={`/students/${a.studentId}`}
                      className="flex items-center gap-2 p-2 rounded-lg border hover:bg-accent/10 transition-colors w-full text-left"
                    >
                      <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {a.studentName}{a.scheduledTime ? ` · ${a.scheduledTime}` : ""}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("noAssignmentsOnDate")}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
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
                <div className="grid sm:grid-cols-2 gap-3">
                  {upcomingAssignments.map((a) => {
                    const d = new Date(a.assignedAt);
                    const isToday = d.toDateString() === new Date().toDateString();
                    return (
                      <Link
                        key={`${a.studentId}-${a.planId}`}
                        href={`/students/${a.studentId}`}
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
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noUpcomingAssignments")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Navigation>
  );
}
