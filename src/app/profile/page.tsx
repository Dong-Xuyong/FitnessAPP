"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Navigation } from "@/components/Navigation";
import { ProfilePhotoCropDialog } from "@/components/ProfilePhotoCropDialog";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, useFirestore, useDoc, useMemoFirebase, updateDocumentNonBlocking, useFirebaseApp } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Loader2, Save, UserCircle, Camera, Mail } from "lucide-react";
import { uploadTrainerProfilePhoto } from "@/lib/upload-trainer-profile-photo";

export default function TrainerProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const { t } = useI18n();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cropObjectUrlRef = useRef<string | null>(null);

  const trainerRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "personalTrainers", user.uid);
  }, [db, user]);

  const { data: trainer, isLoading: isLoadingProfile } = useDoc(trainerRef);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

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

  const clearCropObjectUrl = useCallback(() => {
    if (cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
      cropObjectUrlRef.current = null;
    }
    setCropImageSrc(null);
  }, []);

  useEffect(() => {
    return () => {
      if (cropObjectUrlRef.current) {
        URL.revokeObjectURL(cropObjectUrlRef.current);
        cropObjectUrlRef.current = null;
      }
    };
  }, []);

  const commitProfilePhotoFile = useCallback(
    async (file: File) => {
      if (!user?.uid || !db || !trainerRef) throw new Error("NO_USER");
      const url = await uploadTrainerProfilePhoto(firebaseApp, user.uid, file);
      setFormData((prev) => ({ ...prev, photoUrl: url }));
      await setDoc(trainerRef, { photoUrl: url }, { merge: true });
    },
    [firebaseApp, user, db, trainerRef]
  );

  const handlePhotoDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        clearCropObjectUrl();
      }
      setPhotoDialogOpen(open);
    },
    [clearCropObjectUrl]
  );

  const handleCropFileChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;

      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: t("error"),
          description: t("profilePhotoInvalidFile"),
        });
        return;
      }

      if (cropObjectUrlRef.current) {
        URL.revokeObjectURL(cropObjectUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      cropObjectUrlRef.current = url;
      setCropImageSrc(url);
    },
    [toast, t]
  );

  const handleCroppedPhotoConfirm = useCallback(
    async (file: File) => {
      setIsUploadingPhoto(true);
      try {
        await commitProfilePhotoFile(file);
        toast({
          title: t("profileUpdated"),
          description: t("profilePhotoUploaded"),
        });
        clearCropObjectUrl();
        setPhotoDialogOpen(false);
      } catch (err) {
        console.error("Profile photo upload failed", err);
        toast({
          variant: "destructive",
          title: t("error"),
          description: t("profilePhotoUploadFailed"),
        });
      } finally {
        setIsUploadingPhoto(false);
      }
    },
    [commitProfilePhotoFile, toast, t, clearCropObjectUrl]
  );

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
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 -mt-8 relative z-10">
              <div className="flex flex-col items-center gap-4 mb-6">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={handleCropFileChosen}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="relative group h-auto w-auto rounded-full p-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isUploadingPhoto}
                  aria-label={t("uploadProfilePhoto")}
                  onClick={() => setPhotoDialogOpen(true)}
                >
                  <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg bg-muted/40">
                    <AvatarImage
                      key={formData.photoUrl || "no-photo"}
                      className="object-contain object-center"
                      src={formData.photoUrl || `https://picsum.photos/seed/${user?.uid}/200/200`}
                    />
                    <AvatarFallback className="text-xl font-bold">
                      {formData.firstName?.[0] || "C"}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`pointer-events-none absolute inset-0 bg-black/40 rounded-full flex items-center justify-center transition-opacity ${
                      isUploadingPhoto ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {isUploadingPhoto ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </div>
                </Button>
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
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t py-4">
              <Button type="submit" className="w-full gap-2" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                <span className="sr-only">{t("updateCoachProfile")}</span>
              </Button>
            </CardFooter>
          </Card>
        </form>

        <ProfilePhotoCropDialog
          open={photoDialogOpen}
          onOpenChange={handlePhotoDialogOpenChange}
          imageSrc={cropImageSrc}
          onPickFile={() => photoInputRef.current?.click()}
          isSaving={isUploadingPhoto}
          onConfirm={handleCroppedPhotoConfirm}
        />
      </div>
    </Navigation>
  );
}
