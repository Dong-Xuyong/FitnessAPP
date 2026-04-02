"use client";

import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, useFirestore, useDoc, useMemoFirebase, updateDocumentNonBlocking } from "@/firebase";
import { doc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Loader2, Save, UserCircle, Camera, Mail } from "lucide-react";

export default function TrainerProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();

  const trainerRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "personalTrainers", user.uid);
  }, [db, user]);

  const { data: trainer, isLoading: isLoadingProfile } = useDoc(trainerRef);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    photoUrl: "",
    email: ""
  });

  useEffect(() => {
    if (trainer) {
      setFormData({
        firstName: trainer.firstName || "",
        lastName: trainer.lastName || "",
        photoUrl: trainer.photoUrl || "",
        email: trainer.email || ""
      });
    }
  }, [trainer]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user || !trainerRef) return;

    setIsSaving(true);

    const updateData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      photoUrl: formData.photoUrl,
    };

    try {
      updateDocumentNonBlocking(trainerRef, updateData);
      toast({
        title: t("profileUpdated"),
        description: t("professionalInfoSaved"),
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
      <Navigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("coachProfile")}</h1>
          <p className="text-muted-foreground">{t("coachProfileDesc")}</p>
        </header>

        <form onSubmit={handleSave}>
          <Card className="border-2 overflow-hidden">
            <CardHeader className="bg-muted/30 pb-12">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <UserCircle className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <CardTitle>{t("professionalDetails")}</CardTitle>
                  <CardDescription>{t("professionalDetailsDesc")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 -mt-8 relative z-10">
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative group">
                  <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
                    <AvatarImage src={formData.photoUrl || `https://picsum.photos/seed/${user?.uid}/200/200`} />
                    <AvatarFallback className="text-xl font-bold">
                      {formData.firstName?.[0] || "C"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="w-full max-w-sm space-y-2">
                  <Label htmlFor="photoUrl">{t("profilePhotoUrl")}</Label>
                  <Input 
                    id="photoUrl" 
                    placeholder="https://example.com/coach-photo.jpg" 
                    value={formData.photoUrl} 
                    onChange={(e) => setFormData({...formData, photoUrl: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("firstName")}</Label>
                  <Input 
                    id="firstName" 
                    value={formData.firstName} 
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})} 
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("lastName")}</Label>
                  <Input 
                    id="lastName" 
                    value={formData.lastName} 
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})} 
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("workEmail")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="email" 
                    value={formData.email} 
                    disabled 
                    className="pl-10 bg-muted/50"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{t("emailManagedViaAccount")}</p>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t py-4">
              <Button type="submit" className="w-full gap-2" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("updateCoachProfile")}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </Navigation>
  );
}
