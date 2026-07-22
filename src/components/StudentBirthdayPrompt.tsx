"use client";

import { useCallback, useEffect, useState } from "react";
import { Cake, Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { useFirestore, useUser, updateDocumentNonBlocking } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  ageFromBirthDate,
  normalizeBirthDateInput,
} from "@/lib/body-metric-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SESSION_DISMISS_KEY = "fitnessapp.studentBirthdayPrompt.dismissed";

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

/**
 * Asks students to add their date of birth when the account (and roster) has none yet.
 * Mount once under student shell navigation so it appears on all student pages.
 */
export function StudentBirthdayPrompt() {
  const db = useFirestore();
  const { user } = useUser();
  const { t } = useI18n();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [rosterDocId, setRosterDocId] = useState<string | null>(null);

  const checkBirthday = useCallback(async () => {
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

      let birthRaw: unknown = data.birthDate;
      if (tid) {
        const rosterSnap = await getDoc(doc(db, "personalTrainers", tid, "students", rid));
        if (rosterSnap.exists()) {
          const roster = rosterSnap.data() as Record<string, unknown>;
          birthRaw = roster.birthDate ?? birthRaw;
        }
      }

      const existing = normalizeBirthDateInput(birthRaw);
      if (existing) {
        setOpen(false);
        return;
      }

      setBirthDate("");
      setOpen(true);
    } catch (e) {
      console.error("Failed to check student birthday", e);
      setOpen(false);
    } finally {
      setChecking(false);
    }
  }, [db, user?.uid]);

  useEffect(() => {
    void checkBirthday();
  }, [checkBirthday]);

  const handleLater = () => {
    if (user?.uid) dismissForSession(user.uid);
    setOpen(false);
  };

  const handleSave = async () => {
    if (!db || !user?.uid) return;
    const normalized = normalizeBirthDateInput(birthDate);
    const age = normalized ? ageFromBirthDate(normalized) : null;
    if (!normalized || age == null) {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("studentBirthdayPromptInvalid"),
      });
      return;
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        birthDate: normalized,
        age,
      };
      updateDocumentNonBlocking(doc(db, "students", user.uid), patch);

      const tid = trainerId;
      const rid = rosterDocId || user.uid;
      if (tid) {
        updateDocumentNonBlocking(doc(db, "personalTrainers", tid, "students", rid), patch);
      }

      toast({
        title: t("profileUpdated"),
        description: t("studentBirthdayPromptSaved"),
      });
      setOpen(false);
    } catch (e) {
      console.error("Failed to save student birthday", e);
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleLater();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cake className="h-5 w-5 text-primary" />
            {t("studentBirthdayPromptTitle")}
          </DialogTitle>
          <DialogDescription>{t("studentBirthdayPromptDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="student-birthday-prompt">{t("birthDate")}</Label>
          <Input
            id="student-birthday-prompt"
            type="date"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthDate(e.target.value)}
            disabled={saving}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleLater} disabled={saving}>
            {t("studentBirthdayPromptLater")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !birthDate}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
