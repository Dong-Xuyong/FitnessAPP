
"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, UserPlus, ChevronRight, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from "@/firebase";
import { collection } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function StudentsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [newStudent, setNewStudent] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    age: "",
    sex: "male",
    weightKg: "",
    heightCm: "",
    goalType: "muscle_gain",
    goalWeightKg: ""
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
    
    if (!newStudent.firstName || !newStudent.lastName || !newStudent.email || !newStudent.password) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in all required fields.",
      });
      return;
    }

    setIsAdding(true);
    const studentData = {
      ...newStudent,
      personalTrainerId: user.uid,
      age: Number(newStudent.age) || 0,
      weightKg: Number(newStudent.weightKg) || 0,
      heightCm: Number(newStudent.heightCm) || 0,
      goalWeightKg: Number(newStudent.goalWeightKg) || 0,
      joinedAt: new Date().toISOString(),
      activityStatus: "active",
      subscriptionStatus: "active",
      currentStreakDays: 0
    };

    const studentsCol = collection(db, "personalTrainers", user.uid, "students");
    addDocumentNonBlocking(studentsCol, studentData)
      .then(() => {
        setIsAdding(false);
        setOpen(false);
        setNewStudent({
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          age: "",
          sex: "male",
          weightKg: "",
          heightCm: "",
          goalType: "muscle_gain",
          goalWeightKg: ""
        });
        toast({
          title: "Student Added",
          description: `${newStudent.firstName} has been added to your roster.`,
        });
      })
      .catch(() => {
        setIsAdding(false);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to add student.",
        });
      });
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
            
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 flex-1 sm:flex-none">
                  <UserPlus className="h-4 w-4" />
                  Add Student
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Student</DialogTitle>
                  <DialogDescription>
                    Fill in the student's profile information.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" value={newStudent.firstName} onChange={(e) => setNewStudent({...newStudent, firstName: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" value={newStudent.lastName} onChange={(e) => setNewStudent({...newStudent, lastName: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={newStudent.email} onChange={(e) => setNewStudent({...newStudent, email: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Initial Password</Label>
                    <div className="relative">
                      <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"}
                        value={newStudent.password} 
                        onChange={(e) => setNewStudent({...newStudent, password: e.target.value})} 
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="age">Age</Label>
                      <Input id="age" type="number" value={newStudent.age} onChange={(e) => setNewStudent({...newStudent, age: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Sex</Label>
                      <Select value={newStudent.sex} onValueChange={(v) => setNewStudent({...newStudent, sex: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="height">Height (cm)</Label>
                      <Input id="height" type="number" value={newStudent.heightCm} onChange={(e) => setNewStudent({...newStudent, heightCm: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="weight">Current Weight (kg)</Label>
                      <Input id="weight" type="number" value={newStudent.weightKg} onChange={(e) => setNewStudent({...newStudent, weightKg: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="goalWeight">Goal Weight (kg)</Label>
                      <Input id="goalWeight" type="number" value={newStudent.goalWeightKg} onChange={(e) => setNewStudent({...newStudent, goalWeightKg: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Goal Type</Label>
                    <Select value={newStudent.goalType} onValueChange={(v) => setNewStudent({...newStudent, goalType: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                        <SelectItem value="weight_loss">Weight Loss</SelectItem>
                        <SelectItem value="endurance">Endurance</SelectItem>
                        <SelectItem value="general">General Fitness</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddStudent} disabled={isAdding} className="w-full">
                    {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Registration
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
                <UserPlus className="h-10 w-10 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">No students found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Navigation>
  );
}
