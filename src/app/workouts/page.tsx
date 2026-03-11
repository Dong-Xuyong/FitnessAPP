import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Dumbbell, Users, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";

const programs = [
  { id: "1", title: "Push Pull Legs (PPL)", category: "Hypertrophy", student: "Alex Johnson", level: "Intermediate", exercises: 8 },
  { id: "2", title: "Beginner Full Body", category: "General Fitness", student: "Sarah Williams", level: "Beginner", exercises: 6 },
  { id: "3", title: "Max Strength A", category: "Strength", student: "Mike Tyson", level: "Advanced", exercises: 5 },
  { id: "4", title: "Bodyweight Burn", category: "Fat Loss", student: "Unassigned", level: "All Levels", exercises: 10 },
];

export default function WorkoutsPage() {
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program) => (
            <Card key={program.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline" className="text-primary border-primary/20">{program.category}</Badge>
                  <Badge>{program.level}</Badge>
                </div>
                <CardTitle className="text-xl">{program.title}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Users className="h-3 w-3" /> Assigned to: {program.student}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Dumbbell className="h-4 w-4" /> Exercises
                    </span>
                    <span className="font-medium">{program.exercises}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-4 w-4" /> Est. Duration
                    </span>
                    <span className="font-medium">60-75 min</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button className="w-full gap-2" variant="secondary" asChild>
                  <Link href="/workouts/builder">
                    Edit Program <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </Navigation>
  );
}