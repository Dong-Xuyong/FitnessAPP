"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Info } from "lucide-react";

const categories = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];

const exercises = [
  { name: "Barbell Bench Press", category: "Chest", description: "Compound exercise for pectoral development." },
  { name: "Deadlift", category: "Back", description: "Foundational pull movement for posterior chain." },
  { name: "Back Squat", category: "Legs", description: "King of lower body exercises." },
  { name: "Overhead Press", category: "Shoulders", description: "Vertical push for shoulder strength." },
  { name: "Pull-ups", category: "Back", description: "Bodyweight pull for lat width." },
  { name: "Incline DB Press", category: "Chest", description: "Targeting upper pectorals." },
  { name: "Leg Press", category: "Legs", description: "Isolation-focused leg movement." },
  { name: "Barbell Curls", category: "Arms", description: "Classic bicep builder." },
  { name: "Plank", category: "Core", description: "Isometric core stability." },
  { name: "Lateral Raises", category: "Shoulders", description: "Isolation for side deltoid caps." },
];

export default function ExercisesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredExercises = exercises.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || ex.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold font-headline">Exercise Library</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search exercises..." 
              className="pl-10 h-12 text-lg" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Tabs defaultValue="All" onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto h-12 bg-card border mb-6">
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExercises.map((ex, i) => (
              <Card key={i} className="group hover:border-primary transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{ex.name}</CardTitle>
                    <Badge variant="secondary">{ex.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {ex.description}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <Info className="h-4 w-4" />
                    View technique guide
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredExercises.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                No exercises found matching your criteria.
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </Navigation>
  );
}
