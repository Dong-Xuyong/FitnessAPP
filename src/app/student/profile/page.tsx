
"use client";

import { useState, useEffect } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser, useFirestore, updateDocumentNonBlocking } from "@/firebase";
import { collection, query, where, getDocs, limit, doc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, UserCircle } from "lucide-react";

export default function StudentProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [studentDocInfo, setStudentDocInfo] = useState<{ id: string; trainerId: string } | null>(null);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    age: "",
    sex: "male",
    weightKg: "",
    heightCm: "",
    goalType: "muscle_gain",
    goalWeightKg: ""
  });

  useEffect(() => {
    if (!db || !user?.email) return;

    async function fetchProfile() {
      setIsLoadingProfile(true);
      try {
        const trainersCol = collection(db, "personalTrainers");
        const trainersSnapshot = await getDocs(trainersCol);
        
        for (const trainerDoc of trainersSnapshot.docs) {
          const studentsCol = collection(db, "personalTrainers", trainerDoc.id, "students");
          const q = query(studentsCol, where("email", "==", user?.email), limit(1));
          const studentSnapshot = await getDocs(q);
          
          if (!studentSnapshot.empty) {
            const data = studentSnapshot.docs[0].data();
            setStudentDocInfo({ id: studentSnapshot.docs[0].id, trainerId: trainerDoc.id });
            setFormData({
              firstName: data.firstName || "",
              lastName: data.lastName || "",
              age: data.age?.toString() || "",
              sex: data.sex || "male",
              weightKg: data.weightKg?.toString() || "",
              heightCm: data.heightCm?.toString() || "",
              goalType: data.goalType || "muscle_gain",
              goalWeightKg: data.goalWeightKg?.toString() || ""
            });
            break;
          }
        }
      } catch (e) {
        console.error("Error fetching profile", e);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    fetchProfile();
  }, [db, user?.email]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !studentDocInfo) return;

    setIsSaving(true);
    const studentRef = doc(db, "personalTrainers", studentDocInfo.trainerId, "students", studentDocInfo.id);

    const updateData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      age: Number(formData.age) || 0,
      sex: formData.sex,
      weightKg: Number(formData.weightKg) || 0,
      heightCm: Number(formData.heightCm) || 0,
      goalType: formData.goalType,
      goalWeightKg: Number(formData.goalWeightKg) || 0,
    };

    try {
      updateDocumentNonBlocking(studentRef, updateData);
      toast({
        title: "Profile Updated",
        description: "Your information has been successfully saved.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update profile.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading || isLoadingProfile) {
    return (
      <StudentNavigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentNavigation>
    );
  }

  if (!studentDocInfo) {
    return (
      <StudentNavigation>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">No Profile Linked</h2>
          <p className="text-muted-foreground mt-2">Please join a coach from the dashboard first.</p>
        </div>
      </StudentNavigation>
    );
  }

  return (
    <StudentNavigation>
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">My Profile</h1>
          <p className="text-muted-foreground">Keep your physical stats and goals up to date for your coach.</p>
        </header>

        <form onSubmit={handleSave}>
          <Card className="border-2">
            <CardHeader className="bg-muted/30">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <UserCircle className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Updates are visible to your personal trainer.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input 
                    id="firstName" 
                    value={formData.firstName} 
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})} 
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input 
                    id="lastName" 
                    value={formData.lastName} 
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})} 
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input 
                    id="age" 
                    type="number" 
                    value={formData.age} 
                    onChange={(e) => setFormData({...formData, age: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select value={formData.sex} onValueChange={(v) => setFormData({...formData, sex: v})}>
                    <SelectTrigger id="sex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="heightCm">Height (cm)</Label>
                  <Input 
                    id="heightCm" 
                    type="number" 
                    value={formData.heightCm} 
                    onChange={(e) => setFormData({...formData, heightCm: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="weightKg">Current Weight (kg)</Label>
                  <Input 
                    id="weightKg" 
                    type="number" 
                    step="0.1"
                    value={formData.weightKg} 
                    onChange={(e) => setFormData({...formData, weightKg: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goalWeightKg">Goal Weight (kg)</Label>
                  <Input 
                    id="goalWeightKg" 
                    type="number" 
                    step="0.1"
                    value={formData.goalWeightKg} 
                    onChange={(e) => setFormData({...formData, goalWeightKg: e.target.value})} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goalType">Primary Fitness Goal</Label>
                <Select value={formData.goalType} onValueChange={(v) => setFormData({...formData, goalType: v})}>
                  <SelectTrigger id="goalType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                    <SelectItem value="weight_loss">Weight Loss</SelectItem>
                    <SelectItem value="endurance">Endurance</SelectItem>
                    <SelectItem value="general">General Fitness</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t py-4">
              <Button type="submit" className="w-full gap-2" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Profile Changes
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </StudentNavigation>
  );
}
