"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Filter, UserPlus, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from "@/firebase";
import { collection } from "firebase/firestore";
import { cn } from "@/lib/utils";

export default function StudentsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newStudent, setNewStudent] = useState({
    firstName: "",
    lastName: "",
    email: "",
    age: "",
    currentWeightKg: "",
    goals: ""
  });

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: students, isLoading } = useCollection(studentsQuery);

  const filteredStudents = students?.filter((student) => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  }) || [];

  const handleAddStudent = () => {
    if (!db || !user) return;
    
    setIsAdding(true);
    const studentData = {
      ...newStudent,
      personalTrainerId: user.uid,
      age: Number(newStudent.age),
      currentWeightKg: Number(newStudent.currentWeightKg),
      dateJoined: new Date().toISOString()
    };

    const studentsCol = collection(db, "personalTrainers", user.uid, "students");
    addDocumentNonBlocking(studentsCol, studentData)
      .then(() => {
        setIsAdding(false);
        setNewStudent({
          firstName: "",
          lastName: "",
          email: "",
          age: "",
          currentWeightKg: "",
          goals: ""
        });
      })
      .catch(() => setIsAdding(false));
  };

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
            
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2 flex-1 sm:flex-none">
                  <UserPlus className="h-4 w-4" />
                  Add Student
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Student</DialogTitle>
                  <DialogDescription>
                    Create a new student profile. They'll appear in your roster immediately.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input 
                        id="firstName" 
                        value={newStudent.firstName} 
                        onChange={(e) => setNewStudent({...newStudent, firstName: e.target.value})} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input 
                        id="lastName" 
                        value={newStudent.lastName} 
                        onChange={(e) => setNewStudent({...newStudent, lastName: e.target.value})} 
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      value={newStudent.email} 
                      onChange={(e) => setNewStudent({...newStudent, email: e.target.value})} 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="age">Age</Label>
                      <Input 
                        id="age" 
                        type="number" 
                        value={newStudent.age} 
                        onChange={(e) => setNewStudent({...newStudent, age: e.target.value})} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="weight">Weight (kg)</Label>
                      <Input 
                        id="weight" 
                        type="number" 
                        value={newStudent.currentWeightKg} 
                        onChange={(e) => setNewStudent({...newStudent, currentWeightKg: e.target.value})} 
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="goals">Fitness Goals</Label>
                    <Input 
                      id="goals" 
                      value={newStudent.goals} 
                      onChange={(e) => setNewStudent({...newStudent, goals: e.target.value})} 
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddStudent} disabled={isAdding}>
                    {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Student
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                      <AvatarImage src={`https://picsum.photos/seed/${student.id}/100/100`} />
                      <AvatarFallback>{student.firstName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                      <div>
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {student.firstName} {student.lastName}
                        </h3>
                        <p className="text-xs text-muted-foreground">{student.goals}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Age</p>
                        <p className="text-sm font-medium">{student.age} years</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Weight</p>
                        <p className="text-sm font-medium">{student.currentWeightKg} kg</p>
                      </div>
                      <div className="text-right md:text-left flex items-center justify-end md:justify-between">
                        <div className="hidden md:block">
                          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Status</p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-accent" />
                            <span className="text-sm">Active</span>
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
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                No students found. Add your first student to get started.
              </div>
            )}
          </div>
        )}
      </div>
    </Navigation>
  );
}
