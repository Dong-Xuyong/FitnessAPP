"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, ExternalLink } from "lucide-react";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";

const categories = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"];

export default function StudentExercisesPage() {
  const { t } = useI18n();
  const { user } = useUser();
  const db = useFirestore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const exercisesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "exercises");
  }, [db, user]);

  const { data: exercises, isLoading } = useCollection(exercisesQuery);

  const filteredExercises = useMemo(() => {
    return (exercises || []).filter((exercise: any) => {
      const matchesSearch = (exercise.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || exercise.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [exercises, searchQuery, selectedCategory]);

  return (
    <StudentNavigation>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold font-headline">{t("exercises")}</h1>
          <p className="text-sm text-muted-foreground">{t("exerciseLibraryShared")}</p>
        </header>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchExercises")}
            className="pl-10"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-card border p-1">
            {categories.map((category) => (
              <TabsTrigger key={category} value={category} className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredExercises.map((exercise: any) => (
              <Card key={exercise.id} className="group hover:border-primary transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base lg:text-lg leading-tight line-clamp-2">{exercise.name || t("unnamedExercise")}</CardTitle>
                    <Badge variant="secondary" className="shrink-0 w-fit">{exercise.category || "Other"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {exercise.description || t("noDescriptionAvailable")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {exercise.difficulty && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {exercise.difficulty}
                      </Badge>
                    )}
                    {exercise.equipment && (
                      <span className="text-xs text-muted-foreground">{exercise.equipment}</span>
                    )}
                  </div>
                  {exercise.videoUrl ? (
                    <a
                      href={exercise.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {t("watchDemo")}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && filteredExercises.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            <p className="font-medium">{t("noExercisesFound")}</p>
            <p className="text-sm mt-1">{t("tryDifferentSearch")}</p>
          </div>
        ) : null}
      </div>
    </StudentNavigation>
  );
}
