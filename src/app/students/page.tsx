import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, UserPlus, ChevronRight } from "lucide-react";
import Link from "next/link";

const students = [
  { id: "1", name: "Alex Johnson", age: 28, weight: 78, level: "Intermediate", goal: "Muscle Gain", active: true },
  { id: "2", name: "Sarah Williams", age: 34, weight: 65, level: "Beginner", goal: "Weight Loss", active: true },
  { id: "3", name: "Mike Tyson", age: 57, weight: 102, level: "Advanced", goal: "Strength", active: true },
  { id: "4", name: "Emily Blunt", age: 41, weight: 58, level: "Intermediate", goal: "Endurance", active: false },
  { id: "5", name: "Chris Evans", age: 42, weight: 90, level: "Intermediate", goal: "Muscle Gain", active: true },
];

export default function StudentsPage() {
  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search students..." className="pl-10" />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
            <Button className="gap-2 flex-1 sm:flex-none">
              <UserPlus className="h-4 w-4" />
              Add Student
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          {students.map((student) => (
            <Card key={student.id} className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-0">
                <Link href={`/students/${student.id}`} className="flex items-center gap-4 p-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={`https://picsum.photos/seed/s${student.id}/100/100`} />
                    <AvatarFallback>{student.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                    <div>
                      <h3 className="font-semibold group-hover:text-primary transition-colors">{student.name}</h3>
                      <p className="text-xs text-muted-foreground">{student.goal}</p>
                    </div>
                    <div className="hidden md:block">
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Level</p>
                      <Badge variant={student.level === 'Advanced' ? 'default' : 'secondary'}>{student.level}</Badge>
                    </div>
                    <div className="hidden md:block">
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Weight</p>
                      <p className="text-sm font-medium">{student.weight} kg</p>
                    </div>
                    <div className="text-right md:text-left flex items-center justify-end md:justify-between">
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Status</p>
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-2 h-2 rounded-full", student.active ? "bg-accent" : "bg-muted")} />
                          <span className="text-sm">{student.active ? "Active" : "Inactive"}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Navigation>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}