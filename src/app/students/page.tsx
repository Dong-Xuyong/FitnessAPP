
"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  ChevronRight, 
  Loader2, 
  Users, 
  SearchIcon, 
  PlusCircle, 
  Target, 
  Weight, 
  UserPlus 
} from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function StudentsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [isManualAdding, setIsManualAdding] = useState(false);

  // Manual Add Form State
  const [manualStudent, setManualStudent] = useState({
    firstName: "",
    lastName: "",
    email: "",
    goalType: "muscle_gain"
  });

  // My Roster Query
  const myStudentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: myStudents, isLoading: isLoadingRoster } = useCollection(myStudentsQuery);

  // Global Directory Query - Gated by user existence to avoid permission errors
  const globalStudentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "students");
  }, [db, user]);

  const { data: allStudents, isLoading: isLoadingGlobal } = useCollection(globalStudentsQuery);

  const filteredRoster = myStudents?.filter((s) => {
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  }) || [];

  const filteredGlobal = allStudents?.filter((s) => {
    const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
    const isAlreadyInRoster = myStudents?.some(ms => ms.id === s.id || ms.email === s.email);
    return fullName.includes(globalSearch.toLowerCase()) && !isAlreadyInRoster && s.id !== user?.uid;
  }) || [];

  const handleAddStudent = async (student: any) => {
    if (!db || !user) return;
    setIsAdding(student.id || student.email);

    try {
      const studentId = student.id || student.email.replace(/[^a-zA-Z0-9]/g, '_');
      const studentRef = doc(db, "personalTrainers", user.uid, "students", studentId);
      
      const studentData = {
        ...student,
        id: studentId,
        personalTrainerId: user.uid,
        joinedAt: new Date().toISOString(),
        activityStatus: student.activityStatus || "active",
      };

      setDocumentNonBlocking(studentRef, studentData, { merge: true });
      
      toast({
        title: "Student Added",
        description: `${student.firstName} is now part of your roster.`,
      });
      setIsManualAdding(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add student.",
      });
    } finally {
      setIsAdding(null);
    }
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddStudent({
      ...manualStudent,
      weightKg: 0,
      heightCm: 0,
      goalWeightKg: 0,
      age: 0,
      sex: "other"
    });
  };

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold font-headline">Roster Management</h2>
          <Dialog open={isManualAdding} onOpenChange={setIsManualAdding}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Student</DialogTitle>
                <DialogDescription>
                  Enter the student's basic details to add them to your roster manually.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleManualAdd} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="m-first">First Name</Label>
                    <Input 
                      id="m-first" 
                      required 
                      value={manualStudent.firstName}
                      onChange={(e) => setManualStudent({...manualStudent, firstName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="m-last">Last Name</Label>
                    <Input 
                      id="m-last" 
                      required 
                      value={manualStudent.lastName}
                      onChange={(e) => setManualStudent({...manualStudent, lastName: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-email">Email Address</Label>
                  <Input 
                    id="m-email" 
                    type="email" 
                    required 
                    value={manualStudent.email}
                    onChange={(e) => setManualStudent({...manualStudent, email: e.target.value})}
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={!!isAdding}>
                    {isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
                    Create Student Profile
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mb-8">
            <TabsTrigger value="roster">My Roster</TabsTrigger>
            <TabsTrigger value="discover">Discover Accounts</TabsTrigger>
          </TabsList>

          <TabsContent value="roster">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search your students..." 
                    className="pl-10" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {isLoadingRoster ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredRoster.map((student) => (
                    <Card key={student.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                      <CardContent className="p-0">
                        <Link href={`/students/${student.id}`} className="flex items-center gap-4 p-4">
                          <Avatar className="h-12 w-12 border-2 border-primary/10">
                            <AvatarImage src={student.photoUrl || `https://picsum.photos/seed/${student.id}/100/100`} />
                            <AvatarFallback>{student.firstName?.[0]}</AvatarFallback>
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
                              <p className="text-sm font-medium">{student.weightKg || '--'} kg</p>
                            </div>
                            <div className="text-right flex items-center justify-end gap-4">
                              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                            </div>
                          </div>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                  {filteredRoster.length === 0 && (
                    <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg bg-accent/5">
                      <Users className="h-10 w-10 mx-auto mb-4 opacity-20" />
                      <p className="text-lg font-medium">Your roster is empty</p>
                      <p className="text-sm">Go to the 'Discover' tab or add a student manually above.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="discover">
            <div className="space-y-6">
              <div className="bg-primary/5 p-6 rounded-xl border-2 border-primary/10 flex flex-col md:flex-row items-center gap-6">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                  <SearchIcon className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold">Global Student Directory</h3>
                  <p className="text-sm text-muted-foreground">Find existing ElevateFit users and invite them to your program.</p>
                </div>
                <div className="relative w-full md:w-96 md:ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by name or email..." 
                    className="pl-10 h-12 bg-background shadow-lg" 
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                  />
                </div>
              </div>

              {isLoadingGlobal ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredGlobal.map((student) => (
                    <Card key={student.id} className="hover:border-primary transition-all group overflow-hidden">
                      <CardHeader className="text-center pb-2">
                        <Avatar className="h-20 w-20 mx-auto mb-2 border-2 border-primary/10 group-hover:scale-105 transition-transform">
                          <AvatarImage src={student.photoUrl || `https://picsum.photos/seed/${student.id}/200/200`} />
                          <AvatarFallback>{student.firstName[0]}</AvatarFallback>
                        </Avatar>
                        <CardTitle className="text-lg">{student.firstName} {student.lastName}</CardTitle>
                        <CardDescription className="flex items-center justify-center gap-1">
                          <Target className="h-3 w-3" /> {student.goalType?.replace('_', ' ') || 'General Fitness'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-2 text-xs text-center">
                          <div className="bg-muted p-2 rounded-md">
                            <Weight className="h-3 w-3 mx-auto mb-1 opacity-50" />
                            <p className="font-bold">{student.weightKg || '--'}kg</p>
                            <p className="text-[10px] text-muted-foreground">Current</p>
                          </div>
                          <div className="bg-muted p-2 rounded-md">
                            <Target className="h-3 w-3 mx-auto mb-1 opacity-50" />
                            <p className="font-bold">{student.goalWeightKg || '--'}kg</p>
                            <p className="text-[10px] text-muted-foreground">Goal</p>
                          </div>
                        </div>
                        <Button 
                          className="w-full gap-2" 
                          variant="outline"
                          onClick={() => handleAddStudent(student)}
                          disabled={isAdding === student.id}
                        >
                          {isAdding === student.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                          Add to Roster
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {filteredGlobal.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl bg-muted/5">
                      <p className="text-muted-foreground">No accounts found matching your search.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Navigation>
  );
}
