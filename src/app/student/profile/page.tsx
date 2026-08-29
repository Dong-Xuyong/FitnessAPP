
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ProfilePhotoCropDialog } from "@/components/ProfilePhotoCropDialog";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useUser, useFirestore, updateDocumentNonBlocking, useFirebaseApp } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, UserCircle, Camera, ChevronDown, ChevronUp, Info, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { STUDENT_PROFILE_PHOTO_UPDATED } from "@/lib/student-profile-events";
import { uploadStudentProfilePhoto } from "@/lib/upload-student-profile-photo";
import {
  ageFromBirthDate,
  normalizeBirthDateInput,
  parseOptionalBmi,
  parseOptionalBodyWeightKg,
  parseOptionalMassPercent,
  parseOptionalVisceralFatScore,
} from "@/lib/body-metric-input";

const ALLOWED_GOALS = new Set(["muscle_gain", "weight_loss", "endurance", "general"]);
const ALLOWED_SEX = new Set(["male", "female", "other"]);

export default function StudentProfilePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const { t } = useI18n();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cropObjectUrlRef = useRef<string | null>(null);

  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [compositionOpen, setCompositionOpen] = useState(true);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [sectionDefaultsApplied, setSectionDefaultsApplied] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    photoUrl: "",
    birthDate: "",
    age: "",
    sex: "male",
    weightKg: "",
    heightCm: "",
    leanMassPercent: "",
    fatMassPercent: "",
    visceralFatScore: "",
    bmi: "",
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
    if (!db || !user) {
      setIsLoadingProfile(false);
      return;
    }

    const authUser = user;
    let cancelled = false;
    setIsLoadingProfile(true);

    async function fetchProfile() {
      try {
        const globalDocRef = doc(db, "students", authUser.uid);
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
          const fatMass =
            data.fatMassPercent != null && Number(data.fatMassPercent) > 0
              ? data.fatMassPercent
              : data.bodyFatPercent;
          setFormData({
            name: data.name || authUser.displayName || "",
            photoUrl: data.photoUrl || authUser.photoURL || "",
            birthDate: normalizeBirthDateInput(data.birthDate),
            age: data.age?.toString() || "",
            sex,
            weightKg: data.weightKg?.toString() || "",
            heightCm: data.heightCm?.toString() || "",
            leanMassPercent:
              data.leanMassPercent != null && Number(data.leanMassPercent) > 0
                ? String(data.leanMassPercent)
                : "",
            fatMassPercent: fatMass != null && Number(fatMass) > 0 ? String(fatMass) : "",
            visceralFatScore:
              data.visceralFatScore != null && Number(data.visceralFatScore) > 0
                ? String(data.visceralFatScore)
                : "",
            bmi: data.bmi != null && Number(data.bmi) > 0 ? String(data.bmi) : "",
            goalType,
            goalWeightKg: data.goalWeightKg?.toString() || "",
            goalBodyFatPercent: data.goalBodyFatPercent?.toString() || "",
          });
        } else {
          setTrainerId(null);
          setFormData((prev) => ({
            ...prev,
            name: authUser.displayName || "",
            photoUrl: authUser.photoURL || "",
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

  useEffect(() => {
    if (isLoadingProfile || sectionDefaultsApplied) return;
    const hasComposition =
      Number(formData.weightKg) > 0 ||
      Number(formData.fatMassPercent) > 0 ||
      Number(formData.leanMassPercent) > 0 ||
      Number(formData.visceralFatScore) > 0 ||
      Number(formData.bmi) > 0;
    const hasGoals =
      Number(formData.goalWeightKg) > 0 ||
      Number(formData.goalBodyFatPercent) > 0;
    setCompositionOpen(!hasComposition);
    setGoalsOpen(!hasGoals);
    setSectionDefaultsApplied(true);
  }, [
    isLoadingProfile,
    sectionDefaultsApplied,
    formData.weightKg,
    formData.fatMassPercent,
    formData.leanMassPercent,
    formData.visceralFatScore,
    formData.bmi,
    formData.goalWeightKg,
    formData.goalBodyFatPercent,
  ]);

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
      if (!user?.uid || !db) throw new Error("NO_USER");
      const url = await uploadStudentProfilePhoto(firebaseApp, user.uid, file);
      setFormData((prev) => ({ ...prev, photoUrl: url }));

      const globalRef = doc(db, "students", user.uid);
      await setDoc(globalRef, { photoUrl: url }, { merge: true });
      if (trainerId) {
        await setDoc(doc(db, "personalTrainers", trainerId, "students", user.uid), { photoUrl: url }, {
          merge: true,
        });
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(STUDENT_PROFILE_PHOTO_UPDATED));
      }
    },
    [firebaseApp, user, db, trainerId]
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
    if (!db || !user) return;

    setIsSaving(true);

    const { firstName, lastName } = splitName(formData.name);
    const birthDate = normalizeBirthDateInput(formData.birthDate);
    const derivedAge = birthDate ? ageFromBirthDate(birthDate) : null;
    const weightKg = parseOptionalBodyWeightKg(formData.weightKg);
    const leanMassPercent = parseOptionalMassPercent(formData.leanMassPercent);
    const fatMassPercent = parseOptionalMassPercent(formData.fatMassPercent);
    const visceralFatScore = parseOptionalVisceralFatScore(formData.visceralFatScore);
    const bmi = parseOptionalBmi(formData.bmi);

    const updateData: Record<string, unknown> = {
      userId: user.uid,
      trainerId: trainerId,
      name: formData.name,
      firstName,
      lastName,
      photoUrl: formData.photoUrl,
      birthDate: birthDate || null,
      age: derivedAge ?? (Number(formData.age) || 0),
      sex: formData.sex,
      weightKg: weightKg ?? 0,
      heightCm: Number(formData.heightCm) || 0,
      leanMassPercent: leanMassPercent ?? 0,
      fatMassPercent: fatMassPercent ?? 0,
      bodyFatPercent: fatMassPercent ?? 0,
      visceralFatScore: visceralFatScore ?? 0,
      bmi: bmi ?? 0,
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

  if (isUserLoading || (user && isLoadingProfile)) {
    return (
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  if (!user) {
    return (
        <div className="max-w-md mx-auto py-16 text-center space-y-4">
          <h2 className="text-xl font-bold font-headline">{t("signInRequired")}</h2>
          <p className="text-muted-foreground">
            {t("signInAsStudent")}
          </p>
          <Button asChild>
            <Link href="/login?role=student">{t("goToSignIn")}</Link>
          </Button>
        </div>
    );
  }

  return (
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("myProfile")}</h1>
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
                    <AvatarFallback className="text-xl font-bold">{formData.name?.[0] || "U"}</AvatarFallback>
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

              <div className="space-y-2">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birthDate">{t("birthDate")}</Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => {
                      const birthDate = e.target.value;
                      const derived = ageFromBirthDate(birthDate);
                      setFormData({
                        ...formData,
                        birthDate,
                        age: derived != null ? String(derived) : formData.age,
                      });
                    }}
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

              <div className="space-y-3 pt-4 border-t min-w-0">
                <Collapsible open={compositionOpen} onOpenChange={setCompositionOpen}>
                  <div className="rounded-lg border border-border/60 min-w-0">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{t("bodyMetricsProfileComposition")}</p>
                          {!compositionOpen && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[
                                formData.weightKg ? `${formData.weightKg} kg` : null,
                                formData.fatMassPercent ? `${formData.fatMassPercent}%` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || t("bodyMetricsLogAnyHint")}
                            </p>
                          )}
                        </div>
                        {compositionOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-4 px-3 pb-3 min-w-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="weightKg">{t("metricWeightKg")}</Label>
                            <Input
                              id="weightKg"
                              type="number"
                              step="0.1"
                              inputMode="decimal"
                              value={formData.weightKg}
                              onChange={(e) => setFormData({ ...formData, weightKg: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fatMassPercent">{t("metricFatMassPercent")}</Label>
                            <Input
                              id="fatMassPercent"
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              inputMode="decimal"
                              value={formData.fatMassPercent}
                              onChange={(e) => setFormData({ ...formData, fatMassPercent: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="leanMassPercent">{t("metricLeanMassPercent")}</Label>
                            <Input
                              id="leanMassPercent"
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              inputMode="decimal"
                              value={formData.leanMassPercent}
                              onChange={(e) => setFormData({ ...formData, leanMassPercent: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="visceralFatScore">{t("metricVisceralFatScore")}</Label>
                            <Input
                              id="visceralFatScore"
                              type="number"
                              step="0.1"
                              min="0"
                              inputMode="decimal"
                              value={formData.visceralFatScore}
                              onChange={(e) => setFormData({ ...formData, visceralFatScore: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="bmi">{t("metricBmi")}</Label>
                            <Input
                              id="bmi"
                              type="number"
                              step="0.1"
                              min="0"
                              inputMode="decimal"
                              value={formData.bmi}
                              onChange={(e) => setFormData({ ...formData, bmi: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                            title={t("bodyMetricsManualCompositionHint")}
                            aria-label={t("bodyMetricsManualCompositionHint")}
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <Link
                            href="/student/progress"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-muted/40"
                            title={t("myProgress")}
                            aria-label={t("myProgress")}
                          >
                            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                <Collapsible open={goalsOpen} onOpenChange={setGoalsOpen}>
                  <div className="rounded-lg border border-border/60 min-w-0">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{t("bodyMetricsProfileGoals")}</p>
                          {!goalsOpen && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[
                                formData.goalWeightKg ? `${formData.goalWeightKg} kg` : null,
                                formData.goalBodyFatPercent ? `${formData.goalBodyFatPercent}%` : null,
                                formData.goalType?.replace("_", " "),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        {goalsOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-4 px-3 pb-3 min-w-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="goalWeightKg">{t("goalWeightKg")}</Label>
                            <Input
                              id="goalWeightKg"
                              type="number"
                              step="0.1"
                              inputMode="decimal"
                              value={formData.goalWeightKg}
                              onChange={(e) => setFormData({ ...formData, goalWeightKg: e.target.value })}
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
                              inputMode="decimal"
                              value={formData.goalBodyFatPercent}
                              onChange={(e) =>
                                setFormData({ ...formData, goalBodyFatPercent: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="goalType">{t("goalType")}</Label>
                          <Select
                            value={formData.goalType}
                            onValueChange={(v) => setFormData({ ...formData, goalType: v })}
                          >
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
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t py-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isSaving}
                aria-label={t("saveChanges")}
                title={t("saveChanges")}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
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
  );
}
