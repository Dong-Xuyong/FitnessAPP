"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Camera, Loader2, UserRound } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  useFirestore,
  useUser,
  useFirebaseApp,
  updateDocumentNonBlocking,
} from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  ageFromBirthDate,
  normalizeBirthDateInput,
} from "@/lib/body-metric-input";
import { uploadStudentProfilePhoto } from "@/lib/upload-student-profile-photo";
import { STUDENT_PROFILE_PHOTO_UPDATED } from "@/lib/student-profile-events";
import { ProfilePhotoCropDialog } from "@/components/ProfilePhotoCropDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SESSION_DISMISS_KEY = "fitnessapp.studentProfilePrompt.dismissed";

type MissingFields = {
  name: boolean;
  birthDate: boolean;
  heightCm: boolean;
  photo: boolean;
};

function wasDismissedThisSession(uid: string): boolean {
  try {
    return sessionStorage.getItem(`${SESSION_DISMISS_KEY}.${uid}`) === "1";
  } catch {
    return false;
  }
}

function dismissForSession(uid: string) {
  try {
    sessionStorage.setItem(`${SESSION_DISMISS_KEY}.${uid}`, "1");
  } catch {
    /* ignore */
  }
}

function splitName(rawName: string): { firstName: string; lastName: string } {
  const normalized = rawName.trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "" };
  const parts = normalized.split(" ");
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function hasRealPhotoUrl(raw: unknown): boolean {
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!url) return false;
  // Placeholder avatars used in the UI are not a real profile photo.
  if (url.includes("picsum.photos")) return false;
  return true;
}

function hasValidHeight(raw: unknown): boolean {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 250;
}

function hasValidName(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}

function hasAnyMissing(fields: MissingFields): boolean {
  return fields.name || fields.birthDate || fields.heightCm || fields.photo;
}

/**
 * Optional prompt when name, birthday, height, or photo is missing.
 * Students can fill any of the gaps, or dismiss for the current session.
 * Mount once under student shell navigation so it appears on all student pages.
 */
export function StudentBirthdayPrompt() {
  const pathname = usePathname();
  const db = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { user } = useUser();
  const { t } = useI18n();
  const { toast } = useToast();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const cropObjectUrlRef = useRef<string | null>(null);

  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [missing, setMissing] = useState<MissingFields>({
    name: false,
    birthDate: false,
    heightCm: false,
    photo: false,
  });

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [rosterDocId, setRosterDocId] = useState<string | null>(null);

  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

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

  const checkProfileGaps = useCallback(async () => {
    if (!db || !user?.uid) {
      setChecking(false);
      setOpen(false);
      return;
    }

    if (wasDismissedThisSession(user.uid)) {
      setChecking(false);
      setOpen(false);
      return;
    }

    setChecking(true);
    try {
      const globalSnap = await getDoc(doc(db, "students", user.uid));
      if (!globalSnap.exists()) {
        setOpen(false);
        return;
      }

      const data = globalSnap.data() as Record<string, unknown>;
      const tid = typeof data.trainerId === "string" ? data.trainerId : null;
      const rid =
        (typeof data.rosterDocId === "string" && data.rosterDocId.trim()) || user.uid;
      setTrainerId(tid);
      setRosterDocId(rid);

      let merged: Record<string, unknown> = { ...data };
      if (tid) {
        const rosterSnap = await getDoc(doc(db, "personalTrainers", tid, "students", rid));
        if (rosterSnap.exists()) {
          const roster = rosterSnap.data() as Record<string, unknown>;
          merged = {
            ...merged,
            name: roster.name ?? merged.name,
            firstName: roster.firstName ?? merged.firstName,
            birthDate: roster.birthDate ?? merged.birthDate,
            heightCm: roster.heightCm ?? merged.heightCm,
            photoUrl: roster.photoUrl ?? merged.photoUrl,
          };
        }
      }

      const existingName =
        (typeof merged.name === "string" && merged.name.trim()) ||
        [merged.firstName, merged.lastName]
          .filter((part) => typeof part === "string" && part.trim())
          .join(" ")
          .trim() ||
        (user.displayName || "").trim();
      const existingBirth = normalizeBirthDateInput(merged.birthDate);
      const existingHeight = merged.heightCm;
      const existingPhoto =
        (typeof merged.photoUrl === "string" && merged.photoUrl.trim()) ||
        (user.photoURL || "").trim();

      const nextMissing: MissingFields = {
        name: !hasValidName(existingName),
        birthDate: !existingBirth,
        heightCm: !hasValidHeight(existingHeight),
        photo: !hasRealPhotoUrl(existingPhoto),
      };

      if (!hasAnyMissing(nextMissing)) {
        setMissing(nextMissing);
        setOpen(false);
        return;
      }

      setMissing(nextMissing);
      setName(existingName);
      setBirthDate(existingBirth);
      setHeightCm(hasValidHeight(existingHeight) ? String(existingHeight) : "");
      setPhotoUrl(hasRealPhotoUrl(existingPhoto) ? existingPhoto : "");
      setOpen(true);
    } catch (e) {
      console.error("Failed to check student profile completeness", e);
      setOpen(false);
    } finally {
      setChecking(false);
    }
  }, [db, user?.uid, user?.displayName, user?.photoURL]);

  // Re-check on login and navigation — show again if something is still missing (unless dismissed).
  useEffect(() => {
    void checkProfileGaps();
  }, [checkProfileGaps, pathname]);

  const handleLater = () => {
    if (user?.uid) dismissForSession(user.uid);
    setOpen(false);
  };

  const commitProfilePhotoFile = useCallback(
    async (file: File) => {
      if (!user?.uid || !db) throw new Error("NO_USER");
      const url = await uploadStudentProfilePhoto(firebaseApp, user.uid, file);
      setPhotoUrl(url);

      await setDoc(doc(db, "students", user.uid), { photoUrl: url }, { merge: true });
      const tid = trainerId;
      const rid = rosterDocId || user.uid;
      if (tid) {
        await setDoc(doc(db, "personalTrainers", tid, "students", rid), { photoUrl: url }, { merge: true });
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(STUDENT_PROFILE_PHOTO_UPDATED));
      }
      return url;
    },
    [firebaseApp, user?.uid, db, trainerId, rosterDocId]
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
      setUploadingPhoto(true);
      try {
        await commitProfilePhotoFile(file);
        toast({
          title: t("profileUpdated"),
          description: t("profilePhotoUploaded"),
        });
        clearCropObjectUrl();
        setPhotoDialogOpen(false);
        // Photo may have been the only gap — refresh so the dialog closes if complete.
        await checkProfileGaps();
      } catch (err) {
        console.error("Profile photo upload failed", err);
        toast({
          variant: "destructive",
          title: t("error"),
          description: t("profilePhotoUploadFailed"),
        });
      } finally {
        setUploadingPhoto(false);
      }
    },
    [commitProfilePhotoFile, toast, t, clearCropObjectUrl, checkProfileGaps]
  );

  const canSave = (() => {
    // Optional: save whatever the student filled in (at least one valid field).
    if (missing.name && hasValidName(name)) return true;
    if (missing.birthDate) {
      const normalized = normalizeBirthDateInput(birthDate);
      if (normalized && ageFromBirthDate(normalized) != null) return true;
    }
    if (missing.heightCm && hasValidHeight(heightCm)) return true;
    if (missing.photo && hasRealPhotoUrl(photoUrl)) return true;
    return false;
  })();

  const handleSave = async () => {
    if (!db || !user?.uid || !canSave) return;

    const patch: Record<string, unknown> = {};

    if (missing.name && hasValidName(name)) {
      const trimmed = name.trim().replace(/\s+/g, " ");
      const { firstName, lastName } = splitName(trimmed);
      patch.name = trimmed;
      patch.firstName = firstName;
      patch.lastName = lastName;
    }

    if (missing.birthDate) {
      const normalized = normalizeBirthDateInput(birthDate);
      const age = normalized ? ageFromBirthDate(normalized) : null;
      if (normalized && age != null) {
        patch.birthDate = normalized;
        patch.age = age;
      } else if (birthDate.trim()) {
        toast({
          variant: "destructive",
          title: t("error"),
          description: t("studentBirthdayPromptInvalid"),
        });
        return;
      }
    }

    if (missing.heightCm) {
      if (hasValidHeight(heightCm)) {
        patch.heightCm = Number(heightCm);
      } else if (String(heightCm).trim()) {
        toast({
          variant: "destructive",
          title: t("error"),
          description: t("studentProfilePromptInvalidHeight"),
        });
        return;
      }
    }

    if (missing.photo && hasRealPhotoUrl(photoUrl)) {
      patch.photoUrl = photoUrl.trim();
    }

    if (Object.keys(patch).length === 0) {
      handleLater();
      return;
    }

    setSaving(true);
    try {
      updateDocumentNonBlocking(doc(db, "students", user.uid), patch);
      const tid = trainerId;
      const rid = rosterDocId || user.uid;
      if (tid) {
        updateDocumentNonBlocking(doc(db, "personalTrainers", tid, "students", rid), patch);
      }

      toast({
        title: t("profileUpdated"),
        description: t("studentProfilePromptSaved"),
      });
      // Optional prompt: close for this session after any successful save.
      if (user.uid) dismissForSession(user.uid);
      setOpen(false);
    } catch (e) {
      console.error("Failed to save student profile basics", e);
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToUpdateProfile"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (checking || !user) return null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleLater();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              {t("studentProfilePromptTitle")}
            </DialogTitle>
            <DialogDescription>{t("studentProfilePromptDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {missing.photo ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16 border">
                  <AvatarImage src={photoUrl || undefined} alt="" />
                  <AvatarFallback>
                    <Camera className="h-5 w-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1.5 min-w-0 flex-1">
                  <Label>{t("studentProfilePromptPhotoLabel")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={saving || uploadingPhoto}
                    onClick={() => setPhotoDialogOpen(true)}
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {photoUrl ? t("studentProfilePromptPhotoChange") : t("studentProfilePromptPhotoAdd")}
                  </Button>
                </div>
              </div>
            ) : null}

            {missing.name ? (
              <div className="space-y-2">
                <Label htmlFor="student-profile-prompt-name">{t("fullName")}</Label>
                <Input
                  id="student-profile-prompt-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("fullName")}
                  disabled={saving}
                  autoComplete="name"
                />
              </div>
            ) : null}

            {missing.birthDate ? (
              <div className="space-y-2">
                <Label htmlFor="student-profile-prompt-birth">{t("birthDate")}</Label>
                <Input
                  id="student-profile-prompt-birth"
                  type="date"
                  value={birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setBirthDate(e.target.value)}
                  disabled={saving}
                />
              </div>
            ) : null}

            {missing.heightCm ? (
              <div className="space-y-2">
                <Label htmlFor="student-profile-prompt-height">{t("heightCm")}</Label>
                <Input
                  id="student-profile-prompt-height"
                  type="number"
                  inputMode="decimal"
                  min={50}
                  max={250}
                  step={1}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  disabled={saving}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleLater} disabled={saving || uploadingPhoto}>
              {t("studentBirthdayPromptLater")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || uploadingPhoto || !canSave}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleCropFileChosen}
      />
      <ProfilePhotoCropDialog
        open={photoDialogOpen}
        onOpenChange={(next) => {
          if (!next) clearCropObjectUrl();
          setPhotoDialogOpen(next);
        }}
        imageSrc={cropImageSrc}
        onPickFile={() => photoInputRef.current?.click()}
        isSaving={uploadingPhoto}
        onConfirm={handleCroppedPhotoConfirm}
      />
    </>
  );
}
