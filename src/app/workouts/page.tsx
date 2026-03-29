"use client";

import { useMemo } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Dumbbell, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { trainingProgramsRef, totalExercisesInProgram } from "@/lib/firestore/training-programs";
import type { TrainingProgramDocument } from "@/lib/types";

export default function WorkoutsPage() {
  const { user } = useUser();
  const db = useFirestore();

  const programsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return trainingProgramsRef(db, user.uid);
  }, [db, user]);

  const { data: rawPrograms, isLoading } = useCollection<TrainingProgramDocument>(programsQuery);

  const programs = useMemo(() => {
    if (!rawPrograms) return null;
    return [...rawPrograms].sort(
      (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
    );
  }, [rawPrograms]);

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold font-headline">Training Programs</h2>
            <p className="text-muted-foreground">Manage and assign workouts to your students.</p>
          </div>
          <Button className="gap-2" asChild>
            <Link href="/workouts/builder">
              <Plus className="h-4 w-4" />
              Create Program
            </Link>
          </Button>
        </div>

        {isLoading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="flex flex-col">
                <CardHeader>
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-7 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
                <CardFooter className="pt-0">
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && programs && programs.length === 0 && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No programs yet</CardTitle>
              <CardDescription>
                Build a routine in the program builder and use &quot;Save to library&quot; to store it here.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild className="gap-2">
                <Link href="/workouts/builder">
                  <Plus className="h-4 w-4" />
                  Create Program
                </Link>
              </Button>
            </CardFooter>
          </Card>
        )}

        {!isLoading && programs && programs.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {programs.map((program) => {
              const exerciseCount = totalExercisesInProgram(program.sessions);
              const category = program.category ?? "Program library";
              const levelLabel =
                program.level === "all" || !program.level ? "All levels" : program.level;

              return (
                <Card key={program.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="outline" className="text-primary border-primary/20">
                        {category}
                      </Badge>
                      <Badge className="capitalize">{levelLabel}</Badge>
                    </div>
                    <CardTitle className="text-xl">{program.name}</CardTitle>
                    {program.description && (
                      <CardDescription className="mt-1 line-clamp-2">{program.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Dumbbell className="h-4 w-4" /> Exercises
                        </span>
                        <span className="font-medium">{exerciseCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-4 w-4" /> Sessions
                        </span>
                        <span className="font-medium">{program.sessions?.length ?? 0}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button className="w-full gap-2" variant="secondary" asChild>
                      <Link href="/workouts/builder">
                        Edit in builder <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Navigation>
  );
}
