"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dumbbell } from "lucide-react";
import { useUser, useFirestore } from "@/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

type ExerciseHistoryEntry = {
  id: string;
  exerciseName: string;
  date: string;
  weight: number;
  reps: number;
  setNumber: number;
};

export default function StudentExerciseHistoryPage() {
  const { t } = useI18n();
  const { user } = useUser();
  const db = useFirestore();
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<ExerciseHistoryEntry[]>([]);

  useEffect(() => {
    if (!db || !user?.uid) return;
    const uid = user.uid;
    let cancelled = false;

    async function loadHistory() {
      try {
        const studentRef = doc(db, "students", uid);
        const studentSnap = await getDoc(studentRef);
        if (!studentSnap.exists()) return;

        const trainerId = studentSnap.data()?.trainerId;
        if (!trainerId) return;

        const sessionsSnap = await getDocs(
          collection(db, "personalTrainers", trainerId, "students", uid, "workoutSessions")
        );

        if (cancelled) return;

        const rows: ExerciseHistoryEntry[] = [];
        sessionsSnap.forEach((sessionDoc) => {
          const sessionData: any = sessionDoc.data();
          const date = sessionData.completedAt || sessionData.date || "";
          const exercises = sessionData.exercises || [];

          exercises.forEach((exercise: any, exerciseIndex: number) => {
            const exerciseName = (exercise.exerciseName || exercise.name || `Exercise ${exerciseIndex + 1}`).trim();

            if (Array.isArray(exercise.sets)) {
              exercise.sets.forEach((set: any, setIndex: number) => {
                rows.push({
                  id: `${sessionDoc.id}-${exerciseIndex}-${setIndex}`,
                  exerciseName,
                  date,
                  weight: Number(set.weight) || 0,
                  reps: Number(set.reps) || 0,
                  setNumber: Number(set.setNumber) || setIndex + 1,
                });
              });
              return;
            }

            rows.push({
              id: `${sessionDoc.id}-${exerciseIndex}-0`,
              exerciseName,
              date,
              weight: Number(exercise.weight) || 0,
              reps: Number(exercise.reps) || 0,
              setNumber: 1,
            });
          });
        });

        rows.sort((a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""));
        setEntries(rows);
      } catch (error) {
        console.error("Failed to load exercise history", error);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => entry.exerciseName.toLowerCase().includes(query));
  }, [entries, search]);

  return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("exerciseHistory")}</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t("searchExercisesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder={t("searchExercisePlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={t("searchExercisePlaceholder")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" />
              {t("loggedSets")}
            </CardTitle>
            <CardDescription>{filteredEntries.length} {t("results")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{entry.exerciseName}</p>
                    <Badge variant="outline" className="text-[10px]">Set {entry.setNumber}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {entry.date ? new Date(entry.date).toLocaleDateString() : t("unknownDate")}
                  </p>
                  <p className="text-sm">{entry.weight} kg x {entry.reps} reps</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("noExerciseHistoryFound")}</p>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
