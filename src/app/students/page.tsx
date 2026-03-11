"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Filter, ChevronRight, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";

export default function StudentsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const [searchQuery, setSearchQuery] = useState("");

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: students, isLoading } = useCollection(studentsQuery);

  const filteredStudents = students?.filter((student) => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  }) || [];

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search students..." 
              className="pl-10" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredStudents.map((student) => (
              <Card key={student.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="p-0">
                  <Link href={`/students/${student.id}`} className="flex items-center gap-4 p-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={student.photoUrl || `https://picsum.photos/seed/${student.id}/100/100`} />
                      <AvatarFallback>{student.firstName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                      <div>
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {student.firstName} {student.lastName}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">{student.email}</p>
                      </div>
                      <div className="hidden md:block text-center">
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Goal</p>
                        <p className="text-sm font-medium capitalize">{student.goalType?.replace('_', ' ')}</p>
                      </div>
                      <div className="hidden md:block text-center">
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Weight</p>
                        <p className="text-sm font-medium">{student.weightKg} kg</p>
                      </div>
                      <div className="text-right flex items-center justify-end gap-4">
                        <div className="hidden md:block text-right">
                          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Status</p>
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className={`w-2 h-2 rounded-full ${student.activityStatus === 'active' ? 'bg-accent' : 'bg-muted'}`} />
                            <span className="text-sm capitalize">{student.activityStatus}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            ))}
            {!isLoading && filteredStudents.length === 0 && (
              <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg bg-accent/5">
                <Users className="h-10 w-10 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">No students on your roster yet</p>
                <p className="text-sm">Students can join your team by searching for you in their dashboard.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Navigation>
  );
}
