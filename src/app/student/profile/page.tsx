
"use client";

import { useState, useEffect } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, useFirestore, updateDocumentNonBlocking } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, UserCircle, Camera } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

const ALLOWED_GOALS = new Set(["muscle_gain", "weight_loss", "endurance", "general"]);
const ALLOWED_SEX = new Set(["male", "female", "other"]);

export default function StudentProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    photoUrl: "",
    age: "",
    sex: "male",
    weightKg: "",
    heightCm: "",
    bodyFatPercent: "",
    goalType: "muscle_gain",
    goalWeightKg: "",
    goalBodyFatPercent: "",
  });

  const splitName = (rawName: string): { firstName: string; lastName: string } => {
    const normalized = rawName.trim().replace(/\s+/g, " ");
    if (!normalized) return { firstName: "", lastName: "" };
    const parts = normalized.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");
    return { firstName, lastName };
  };

  useEffect(() => {
    if (!db || !user?.uid) {
      setIsLoadingProfile(false);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      setIsLoadingProfile(true);
      try {
        const globalDocRef = doc(db, "students", user.uid);
        const globalDocSnap = await getDoc(globalDocRef);

        if (cancelled) return;

        if (globalDocSnap.exists()) {
          const data = globalDocSnap.data();
          const sex =
            typeof data.sex === "string" && ALLOWED_SEX.has(data.sex)
              ? data.sex
              : "male";
          const goalType =
            typeof data.goalType === "string" && ALLOWED_GOALS.has(data.goalType)
              ? data.goalType
              : "muscle_gain";
          setTrainerId(data.trainerId || null);
          setFormData({
            name: data.name || user.displayName || "",
            photoUrl: data.photoUrl || user.photoURL || "",
            age: data.age?.toString() || "",
            sex,
            weightKg: data.weightKg?.toString() || "",
            heightCm: data.heightCm?.toString() || "",
            bodyFatPercent: data.bodyFatPercent?.toString() || "",
            goalType,
            goalWeightKg: data.goalWeightKg?.toString() || "",
            goalBodyFatPercent: data.goalBodyFatPercent?.toString() || "",
          });
        } else {
          setTrainerId(null);
          setFormData((prev) => ({
            ...prev,
            name: user!.displayName || "",
            photoUrl: user!.photoURL || "",
          }));
        }
      } catch (e) {
        console.error("Error fetching profile", e);
      } finally {
        if (!cancelled) setIsLoadingProfile(false);
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user) return;

    setIsSaving(true);

    const { firstName, lastName } = splitName(formData.name);

    const updateData = {
      userId: user.uid,
      trainerId: trainerId,
      name: formData.name,
      firstName,
      lastName,
      photoUrl: formData.photoUrl,
      age: Number(formData.age) || 0,
      sex: formData.sex,
      weightKg: Number(formData.weightKg) || 0,
      heightCm: Number(formData.heightCm) || 0,
      bodyFatPercent: Number(formData.bodyFatPercent) || 0,
      goalType: formData.goalType,
      goalWeightKg: Number(formData.goalWeightKg) || 0,
      goalBodyFatPercent: Number(formData.goalBodyFatPercent) || 0,
      email: user.email,
    };

    try {
      const globalRef = doc(db, "students", user.uid);
      updateDocumentNonBlocking(globalRef, updateData);

      if (trainerId) {
        const subRef = doc(db, "personalTrainers", trainerId, "students", user.uid);
        updateDocumentNonBlocking(subRef, updateData);
      }

      toast({
        title: t("profileUpdated"),
        description: t("infoSaved"),
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToUpdateProfile"),
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

  if (!user) {
    return (
      <StudentNavigation>
        <div className="max-w-md mx-auto py-16 text-center space-y-4">
          <h2 className="text-xl font-bold font-headline">{t("signInRequired")}</h2>
          <p className="text-muted-foreground">
            {t("signInAsStudent")}
          </p>
          <Button asChild>
            <Link href="/login?role=student">{t("goToSignIn")}</Link>
          </Button>
        </div>
      </StudentNavigation>
    );
  }

  return (
    <StudentNavigation>
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("myProfile")}</h1>
          <p className="text-muted-foreground">{t("keepStatsUpToDate")}</p>
        </header>

        <form onSubmit={handleSave}>
          <Card className="border-2 overflow-hidden">
            <CardHeader className="bg-muted/30 pb-12">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <UserCircle className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <CardTitle>{t("personalInformation")}</CardTitle>
                  <CardDescription>{t("personalInfoDesc")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 -mt-8 relative z-10">
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative group">
                  <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
                    <AvatarImage src={formData.photoUrl || `https://picsum.photos/seed/${user?.uid}/200/200`} />
                    <AvatarFallback className="text-xl font-bold">{formData.name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="w-full max-w-sm space-y-2">
                  <Label htmlFor="photoUrl">{t("profilePhotoUrl")}</Label>
                  <Input 
                    id="photoUrl" 
                    placeholder="https://example.com/photo.jpg" 
                    value={formData.photoUrl} 
                    onChange={(e) => setFormData({...formData, photoUrl: e.target.value})} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">{t("age")}</Label>
                  <Input 
                    id="age" 
                    type="number" 
                    value={formData.age} 
                    onChange={(e) => setFormData({...formData, age: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">{t("sex")}</Label>
                  <Select value={formData.sex} onValueChange={(v) => setFormData({...formData, sex: v})}>
                    <SelectTrigger id="sex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t("male")}</SelectItem>
                      <SelectItem value="female">{t("female")}</SelectItem>
                      <SelectItem value="other">{t("other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="heightCm">{t("heightCm")}</Label>
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
                  <Label htmlFor="weightKg">{t("currentWeightKgLabel")}</Label>
                  <Input 
                    id="weightKg" 
                    type="number" 
                    step="0.1"
                    value={formData.weightKg} 
                    onChange={(e) => setFormData({...formData, weightKg: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goalWeightKg">{t("goalWeightKg")}</Label>
                  <Input 
                    id="goalWeightKg" 
                    type="number" 
                    step="0.1"
                    value={formData.goalWeightKg} 
                    onChange={(e) => setFormData({...formData, goalWeightKg: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="bodyFatPercent">{t("bodyFatPercent")}</Label>
                  <Input 
                    id="bodyFatPercent" 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.bodyFatPercent} 
                    onChange={(e) => setFormData({...formData, bodyFatPercent: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goalBodyFatPercent">{t("goalBodyFatPercent")}</Label>
                  <Input 
                    id="goalBodyFatPercent" 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.goalBodyFatPercent} 
                    onChange={(e) => setFormData({...formData, goalBodyFatPercent: e.target.value})} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goalType">{t("primaryFitnessGoal")}</Label>
                <Select value={formData.goalType} onValueChange={(v) => setFormData({...formData, goalType: v})}>
                  <SelectTrigger id="goalType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="muscle_gain">{t("muscleGain")}</SelectItem>
                    <SelectItem value="weight_loss">{t("weightLoss")}</SelectItem>
                    <SelectItem value="endurance">{t("endurance")}</SelectItem>
                    <SelectItem value="general">{t("generalFitness")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t py-4">
              <Button type="submit" className="w-full gap-2" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("saveChanges")}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </StudentNavigation>
  );
}
