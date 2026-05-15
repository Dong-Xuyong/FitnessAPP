
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { 
  Mail, 
  Calendar, 
  Dumbbell, 
  History, 
  Award, 
  Loader2,
  Zap,
  Save,
  TrendingDown,
  UserPlus,
  Banknote,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Ban,
  ShieldOff,
  ChevronDown,
  ChevronUp,
  Scale,
  ListOrdered,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  useUser,
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
  updateDocumentNonBlocking,
  setDocumentNonBlocking,
} from "@/firebase";
import { doc, collection, addDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteStudent } from "@/lib/firestore/students";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EditWorkoutSessionDialog } from "@/components/EditWorkoutSessionDialog";
import { MilestonesTab } from "@/components/MilestonesTab";
import { useI18n } from "@/lib/i18n";
import type { Milestone, TrainingProgramDocument } from "@/lib/types";
import { linkStudentProfileForTrainerAssignments } from "@/components/AssignStudentSequenceForm";
import {
  applyDefaultStudentSequenceToStudent,
  DefaultStudentSequenceNotConfiguredError,
} from "@/lib/firestore/default-student-sequence";
import type { SessionSlotAttendance } from "@/lib/session-attendance-streak";
import { maxAttendanceStreakForCandidates } from "@/lib/session-attendance-streak";
import { bodyCompositionPointsFromSessions } from "@/lib/body-composition-from-sessions";
import { BodyCompositionTrendChart } from "@/components/BodyCompositionTrendChart";
import { normalizedPaymentPaid, normalizedPaymentPending } from "@/lib/student-payment-due";
import {
  currentBillingPeriod,
  ensurePendingPaymentForCurrentPeriod,
  ensurePendingPaymentForNextPeriodIfWindow,
} from "@/lib/roster-payment-status";
import { tryAutoUnblockAfterPaymentRecorded } from "@/lib/payment-auto-unblock";
import { isSequenceStepEffectiveUnlocked } from "@/lib/workout-plan-sequence";
import {
  isOpenTrainingAccess,
  normalizeTrainingAccessMode,
  type TrainingAccessMode,
} from "@/lib/student-training-access";
import { deleteSequencePlanWithChainRepair } from "@/lib/workout-plan-sequence-delete";
import { clearStudentAssignedPlans } from "@/lib/firestore/clear-trainer-assignments";

function getAssignedWorkoutTimestamp(plan: any): number {
  const rawDate = plan?.assignedAt || plan?.createdAt;
  if (!rawDate) return 0;
  const timestamp = Date.parse(rawDate);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/** Management tab: sequence steps by index within group; sequence groups before loose plans; else by assign time. */
function compareActiveAssignedPlans(a: any, b: any): number {
  const ga = a.sequenceGroupId ? String(a.sequenceGroupId) : "";
  const gb = b.sequenceGroupId ? String(b.sequenceGroupId) : "";
  if (ga && gb) {
    if (ga === gb) return (Number(a.sequenceStepIndex) || 0) - (Number(b.sequenceStepIndex) || 0);
    return ga.localeCompare(gb);
  }
  if (ga && !gb) return -1;
  if (!ga && gb) return 1;
  return getAssignedWorkoutTimestamp(a) - getAssignedWorkoutTimestamp(b);
}

function increaseAssignedReps(reps: string, repIncrease: number): string {
  if (!repIncrease) return reps;
  const trimmed = reps.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]) + repIncrease;
    const high = Number(rangeMatch[2]) + repIncrease;
    return `${low}-${high}`;
  }

  const singleMatch = trimmed.match(/^\d+$/);
  if (singleMatch) {
    return String(Number(trimmed) + repIncrease);
  }

  return reps;
}

function adjustAssignedExercises(exercises: any[], weightDelta: number, repDelta: number) {
  return (exercises || []).map((exercise) => ({
    ...exercise,
    reps: increaseAssignedReps(exercise.reps || "", repDelta),
    ...(exercise.targetWeightKg != null
      ? { targetWeightKg: exercise.targetWeightKg + weightDelta }
      : {}),
    ...(Array.isArray(exercise.setDetails)
      ? {
          setDetails: exercise.setDetails.map((set: any) => ({
            ...set,
            reps: increaseAssignedReps(set.reps || "", repDelta),
            ...(set.targetWeightKg != null
              ? { targetWeightKg: set.targetWeightKg + weightDelta }
              : {}),
          })),
        }
      : {}),
  }));
}

// ─── Billing Tab Component ───────────────────────────────────────
function BillingTab({
  db,
  user,
  studentId,
  globalStudentUid,
  toast,
}: {
  db: any;
  user: any;
  studentId: string;
  globalStudentUid: string;
  toast: any;
}) {
  const { t } = useI18n();
  const [monthlyRate, setMonthlyRate] = useState("");
  const [rate30Min, setRate30Min] = useState("");
  const [rate60Min, setRate60Min] = useState("");
  const [sessionDurationMin, setSessionDurationMin] = useState("60");
  const [sessionsPerWeek, setSessionsPerWeek] = useState("");
  const [trainingAccessMode, setTrainingAccessMode] = useState<TrainingAccessMode>("scheduled");
  const [paymentMethod, setPaymentMethod] = useState("mbway");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({ period: "", amount: "", method: "mbway", status: "paid" });
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState({ period: "", amount: "", method: "mbway", status: "paid" });
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);

  const calculatedMonthlyRate = useMemo(() => {
    const selectedRate =
      sessionDurationMin === "30" ? Number(rate30Min) || 0 : Number(rate60Min) || 0;
    const weekly = Number(sessionsPerWeek) || 0;
    if (selectedRate <= 0 || weekly <= 0) return 0;
    return Number((selectedRate * weekly * 4).toFixed(2));
  }, [rate30Min, rate60Min, sessionDurationMin, sessionsPerWeek]);

  // Read billing config from roster doc
  const billingRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "personalTrainers", user.uid, "students", studentId);
  }, [db, user, studentId]);
  const { data: rosterData } = useDoc(billingRef);

  // Read payments
  const paymentsRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students", studentId, "payments");
  }, [db, user, studentId]);
  const { data: payments } = useCollection(paymentsRef);

  const sortedPayments = (payments || []).sort(
    (a: any, b: any) => (b.period || "").localeCompare(a.period || "")
  );

  // Load existing config
  useEffect(() => {
    if (rosterData) {
      setMonthlyRate(String((rosterData as any).monthlyRate || ""));
      setRate30Min(String((rosterData as any).rate30Min || ""));
      setRate60Min(String((rosterData as any).rate60Min || ""));
      setSessionDurationMin(String((rosterData as any).sessionDurationMin || 60));
      setSessionsPerWeek(String((rosterData as any).sessionsPerWeek || ""));
      setTrainingAccessMode(
        normalizeTrainingAccessMode((rosterData as Record<string, unknown>).trainingAccessMode)
      );
      setPaymentMethod((rosterData as any).paymentMethod || "mbway");
      setPaymentDetails((rosterData as any).paymentDetails || "");
    }
  }, [rosterData]);

  useEffect(() => {
    if (calculatedMonthlyRate > 0) {
      setMonthlyRate(String(calculatedMonthlyRate));
    }
  }, [calculatedMonthlyRate]);

  useEffect(() => {
    if (!db || !user || !studentId || !rosterData) return;
    if (String((rosterData as Record<string, unknown>).billingStatus ?? "").trim().toLowerCase() !== "active") {
      return;
    }
    void ensurePendingPaymentForCurrentPeriod(db, user.uid, studentId);
    void ensurePendingPaymentForNextPeriodIfWindow(db, user.uid, studentId);
  }, [db, user, studentId, rosterData]);

  const handleSaveBillingConfig = () => {
    if (!db || !user) return;
    const safeDuration = sessionDurationMin === "30" ? 30 : 60;
    const safeSessions = Math.max(0, Number(sessionsPerWeek) || 0);
    const safeRate30 = Math.max(0, Number(rate30Min) || 0);
    const safeRate60 = Math.max(0, Number(rate60Min) || 0);
    const mode = normalizeTrainingAccessMode(trainingAccessMode);
    updateDocumentNonBlocking(doc(db, "personalTrainers", user.uid, "students", studentId), {
      billingModel: "session_based",
      sessionDurationMin: safeDuration,
      sessionsPerWeek: safeSessions,
      trainingAccessMode: mode,
      rate30Min: safeRate30,
      rate60Min: safeRate60,
      monthlyRate: Number(monthlyRate) || calculatedMonthlyRate || 0,
      paymentMethod,
      paymentDetails,
      billingStatus: "active",
    });
    if (globalStudentUid) {
      setDocumentNonBlocking(
        doc(db, "students", globalStudentUid),
        { trainingAccessMode: mode },
        { merge: true }
      );
    }
    toast({ title: t("billingSettingsSaved") });
  };

  const handleAddPayment = async () => {
    if (!db || !user || !newPayment.period) return;
    try {
      await addDoc(collection(db, "personalTrainers", user.uid, "students", studentId, "payments"), {
        period: newPayment.period,
        amount: Number(newPayment.amount) || Number(monthlyRate) || 0,
        method: newPayment.method,
        status: newPayment.status,
        paidAt: normalizedPaymentPaid(newPayment.status) ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
      });
      if (normalizedPaymentPaid(newPayment.status)) {
        await tryAutoUnblockAfterPaymentRecorded(db, user.uid, studentId);
      }
      toast({ title: t("paymentRecorded") });
      setShowAddPayment(false);
      setNewPayment({ period: "", amount: "", method: "mbway", status: "paid" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const startEditPayment = (payment: any) => {
    setEditingPaymentId(payment.id);
    setEditingPayment({
      period: String(payment.period || ""),
      amount: String(payment.amount || ""),
      method: String(payment.method || "mbway"),
      status: String(payment.status || "paid"),
    });
  };

  const handleUpdatePayment = async (paymentId: string) => {
    if (!db || !user) return;
    try {
      const paymentRef = doc(db, "personalTrainers", user.uid, "students", studentId, "payments", paymentId);
      await updateDoc(paymentRef, {
        period: editingPayment.period,
        amount: Number(editingPayment.amount) || 0,
        method: editingPayment.method,
        status: editingPayment.status,
        paidAt: normalizedPaymentPaid(editingPayment.status) ? new Date().toISOString() : null,
      });
      if (normalizedPaymentPaid(editingPayment.status)) {
        await tryAutoUnblockAfterPaymentRecorded(db, user.uid, studentId);
      }
      toast({ title: t("paymentUpdated") });
      setEditingPaymentId(null);
      setEditingPayment({ period: "", amount: "", method: "mbway", status: "paid" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update payment.", variant: "destructive" });
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!db || !user) return;
    try {
      await deleteDoc(doc(db, "personalTrainers", user.uid, "students", studentId, "payments", paymentId));
      toast({ title: t("paymentDeleted") });
      if (editingPaymentId === paymentId) {
        setEditingPaymentId(null);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete payment.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Billing Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" /> {t("billingSettings")}
          </CardTitle>
          <CardDescription>{t("billingCalcDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{t("thirtyMinPrice")}</Label>
              <Input
                type="number"
                placeholder="e.g. 20"
                value={rate30Min}
                onChange={(e) => setRate30Min(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("sixtyMinPrice")}</Label>
              <Input
                type="number"
                placeholder="e.g. 35"
                value={rate60Min}
                onChange={(e) => setRate60Min(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("sessionDuration")}</Label>
              <Select value={sessionDurationMin} onValueChange={setSessionDurationMin}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">{t("thirtyMin")}</SelectItem>
                  <SelectItem value="60">{t("sixtyMin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("timesPerWeek")}</Label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 3"
                value={sessionsPerWeek}
                onChange={(e) => setSessionsPerWeek(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <Label>{t("trainingAccessModeLabel")}</Label>
              <Select
                value={trainingAccessMode}
                onValueChange={(v) => setTrainingAccessMode(normalizeTrainingAccessMode(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">{t("trainingAccessModeScheduled")}</SelectItem>
                  <SelectItem value="open">{t("trainingAccessModeOpen")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("trainingAccessModeOpenDesc")}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("monthlyRate")}</Label>
              <Input
                type="number"
                placeholder={t("autoCalculated")}
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("paymentMethod")}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mbway">{t("mbway")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("paymentInstructions")}</Label>
            <Textarea
              placeholder="e.g. MB WAY: 912 345 678&#10;IBAN: PT50 0001 2345 6789 0000 0001 2"
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              rows={3}
            />
          </div>
          <Button onClick={handleSaveBillingConfig} className="gap-2">
            <Save className="h-4 w-4" /> {t("saveSettings")}
          </Button>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>{t("paymentHistory")}</CardTitle>
              <CardDescription>{t("recordPayments")}</CardDescription>
            </div>
            <Button size="sm" className="gap-1 shrink-0 w-full sm:w-auto" onClick={() => {
              if (!showAddPayment) {
                const billingAmount = monthlyRate || "";
                setNewPayment({
                  period: currentBillingPeriod(),
                  amount: billingAmount,
                  method: paymentMethod,
                  status: "paid",
                });
              }
              setShowAddPayment(!showAddPayment);
            }}>
              <Plus className="h-4 w-4" /> {t("recordPayment")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddPayment && (
            <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
              <p className="text-sm font-semibold">{t("newPayment")}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("period")}</Label>
                  <Input
                    placeholder="YYYY-MM (ex: 2026-05)"
                    value={newPayment.period}
                    onChange={(e) => setNewPayment({ ...newPayment, period: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("amount")}</Label>
                  <Input
                    type="number"
                    placeholder={monthlyRate || "0"}
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("method")}</Label>
                  <Select value={newPayment.method} onValueChange={(v) => setNewPayment({ ...newPayment, method: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mbway">{t("mbway")}</SelectItem>
                      <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                      <SelectItem value="cash">{t("cash")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("status")}</Label>
                  <Select value={newPayment.status} onValueChange={(v) => setNewPayment({ ...newPayment, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">{t("paid")}</SelectItem>
                      <SelectItem value="pending">{t("pending")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddPayment}>{t("savePayment")}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddPayment(false)}>{t("cancel")}</Button>
              </div>
            </div>
          )}

          {sortedPayments.length > 0 ? (
            <div className="space-y-2">
              {sortedPayments.map((p: any) => (
                <div key={p.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg min-w-0">
                  {editingPaymentId === p.id ? (
                    <div className="w-full space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("period")}</Label>
                          <Input
                            value={editingPayment.period}
                            onChange={(e) => setEditingPayment({ ...editingPayment, period: e.target.value })}
                            placeholder="e.g. April 2026"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("amount")}</Label>
                          <Input
                            type="number"
                            value={editingPayment.amount}
                            onChange={(e) => setEditingPayment({ ...editingPayment, amount: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("method")}</Label>
                          <Select
                            value={editingPayment.method}
                            onValueChange={(v) => setEditingPayment({ ...editingPayment, method: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mbway">{t("mbway")}</SelectItem>
                              <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                              <SelectItem value="cash">{t("cash")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("status")}</Label>
                          <Select
                            value={editingPayment.status}
                            onValueChange={(v) => setEditingPayment({ ...editingPayment, status: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="paid">{t("paid")}</SelectItem>
                              <SelectItem value="pending">{t("pending")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setEditingPaymentId(null)}>
                          {t("cancel")}
                        </Button>
                        <Button size="sm" onClick={() => handleUpdatePayment(p.id)}>
                          {t("save")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Banknote className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-words">{p.period}</p>
                          <p className="text-xs text-muted-foreground capitalize break-words">
                            {p.method === "mbway" ? t("mbway") : p.method === "bank_transfer" ? t("bankTransfer") : (p.method || "—")}
                            {p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 justify-end sm:shrink-0">
                        <span className="text-sm font-bold">€{p.amount}</span>
                        <Badge
                          variant={normalizedPaymentPaid(p.status) ? "default" : "outline"}
                          className={
                            normalizedPaymentPaid(p.status)
                              ? "bg-green-100 text-green-800 normal-case"
                              : "bg-yellow-100 text-yellow-800 normal-case"
                          }
                        >
                          {normalizedPaymentPaid(p.status)
                            ? t("paid")
                            : normalizedPaymentPending(p.status)
                              ? t("pending")
                              : String(p.status ?? "—")}
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => startEditPayment(p)}>
                          {t("edit")}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setConfirmDeletePaymentId(p.id)}>
                          {t("delete")}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Banknote className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{t("noPaymentsRecorded")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Delete Confirmation */}
      <AlertDialog open={!!confirmDeletePaymentId} onOpenChange={(open) => { if (!open) setConfirmDeletePaymentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> {t("deletePayment")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deletePaymentConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (confirmDeletePaymentId) { handleDeletePayment(confirmDeletePaymentId); setConfirmDeletePaymentId(null); } }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> {t("deletePayment")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function normalizePortalStudent(global: Record<string, unknown>, studentId: string) {
  const name = String(global.name || "");
  const parts = name.trim().split(/\s+/);
  const first = parts[0] || "";
  const last = parts.slice(1).join(" ") || "";
  return {
    ...global,
    id: studentId,
    firstName: (global.firstName as string) ?? first,
    lastName: (global.lastName as string) ?? last,
    activityStatus: (global.activityStatus as string) || "active",
    subscriptionStatus: (global.subscriptionStatus as string) || "pending",
    goalType: (global.goalType as string) || "general",
    trainingAccessMode: normalizeTrainingAccessMode(global.trainingAccessMode),
  };
}

function computeEpleyOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

const STUDENT_DETAIL_TABS = [
  "management",
  "billing",
  "workoutHistory",
  "milestones",
  "progress",
] as const;
type StudentDetailTab = (typeof STUDENT_DETAIL_TABS)[number];

export default function StudentDetailPage({ id }: { id: string }) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [studentDetailTab, setStudentDetailTab] = useState<StudentDetailTab>("progress");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && STUDENT_DETAIL_TABS.includes(tab as StudentDetailTab)) {
      setStudentDetailTab(tab as StudentDetailTab);
    } else {
      setStudentDetailTab("progress");
    }
  }, [searchParams]);

  const handleStudentDetailTabChange = useCallback(
    (v: string) => {
      const next = v as StudentDetailTab;
      setStudentDetailTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "progress") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isAddingToRoster, setIsAddingToRoster] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [coachingNotes, setCoachingNotes] = useState("");
  const [editStats, setEditStats] = useState({
    goalWeightKg: "",
    goalBodyFatPercent: "",
    goalType: "",
  });
  const [expandedAssignedPlanId, setExpandedAssignedPlanId] = useState<string | null>(null);
  const [editingAssignedExerciseKey, setEditingAssignedExerciseKey] = useState<string | null>(null);
  const [editingAssignedExerciseNote, setEditingAssignedExerciseNote] = useState("");
  const [isSavingAssignedExerciseNote, setIsSavingAssignedExerciseNote] = useState(false);
  const [deletingWorkoutPlanId, setDeletingWorkoutPlanId] = useState<string | null>(null);
  const [isApplyingDefaultSequence, setIsApplyingDefaultSequence] = useState(false);
  const [clearStudentPlansOpen, setClearStudentPlansOpen] = useState(false);
  const [clearStudentPlansConfirm, setClearStudentPlansConfirm] = useState("");
  const [isClearingStudentPlans, setIsClearingStudentPlans] = useState(false);
  const [selectedStrengthExercise, setSelectedStrengthExercise] = useState("");

  const studentRef = useMemoFirebase(() => {
    if (!db || !user || !id) return null;
    return doc(db, "personalTrainers", user.uid, "students", id);
  }, [db, user, id]);

  const trainerSettingsRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "personalTrainers", user.uid);
  }, [db, user]);

  const globalStudentRef = useMemoFirebase(() => {
    if (!db || !id) return null;
    return doc(db, "students", id);
  }, [db, id]);

  const { data: rosterStudent, isLoading: rosterLoading } = useDoc(studentRef);
  const { data: trainerSettings } = useDoc(trainerSettingsRef);
  const { data: globalStudent, isLoading: globalLoading } = useDoc(globalStudentRef);

  // Query all roster students to find matching doc (may have email-based ID)
  const allRosterQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);
  const { data: allRoster } = useCollection(allRosterQuery);

  const trainingProgramsRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "personalTrainingPrograms");
  }, [db, user]);
  const { data: trainingPrograms } = useCollection(trainingProgramsRef);

  const assignableLibraryPrograms = useMemo(() => {
    const rows = (trainingPrograms || []) as (TrainingProgramDocument & { id: string })[];
    return rows
      .filter((p) => p && p.id && p.programType !== "weekly" && p.programType !== "sequence")
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
  }, [trainingPrograms]);

  const handleApplyDefaultSequence = async () => {
    if (!db || !user || portalOnly) return;
    setIsApplyingDefaultSequence(true);
    try {
      const globalStudentsForLink = globalStudent
        ? [
            {
              id: String((globalStudent as Record<string, unknown>).id ?? ""),
              email: String((globalStudent as Record<string, unknown>).email ?? ""),
            },
          ]
        : [];
      await linkStudentProfileForTrainerAssignments(
        db,
        user.uid,
        id,
        allRoster as Array<{ id: string; userId?: string; email?: string }> | null,
        globalStudentsForLink
      );
      const { appended } = await applyDefaultStudentSequenceToStudent(
        db,
        user.uid,
        id,
        assignableLibraryPrograms
      );
      toast({
        title: appended ? t("sequenceAssignedAppendedToast") : t("sequenceAssignedToast"),
      });
    } catch (e: unknown) {
      if (e instanceof DefaultStudentSequenceNotConfiguredError) {
        toast({ variant: "destructive", title: t("defaultSequenceNotConfigured") });
      } else if (e instanceof Error && e.message === "DEFAULT_STUDENT_SEQUENCE_PROGRAMS_MISSING") {
        toast({ variant: "destructive", title: t("defaultStudentSequenceProgramsMissing") });
      } else {
        const msg = e instanceof Error ? e.message : t("sequenceAssignFailed");
        toast({ variant: "destructive", title: t("sequenceAssignFailed"), description: msg });
      }
    } finally {
      setIsApplyingDefaultSequence(false);
    }
  };

  const studentEmail = (globalStudent as any)?.email;
  const altRosterDoc = allRoster?.find(
    (s: any) => s.id === id || s.userId === id || (studentEmail && s.email === studentEmail)
  );
  const effectiveRoster = rosterStudent || altRosterDoc || null;

  /** Same subdoc id student billing uses: global `rosterDocId` or roster doc id fallback. */
  const paymentsFirestoreStudentId = useMemo(() => {
    const fromGlobal =
      typeof (globalStudent as Record<string, unknown> | null)?.rosterDocId === "string"
        ? String((globalStudent as Record<string, unknown>).rosterDocId).trim()
        : "";
    if (fromGlobal) return fromGlobal;
    if (!rosterStudent && altRosterDoc?.id) return String(altRosterDoc.id);
    return id;
  }, [globalStudent, rosterStudent, altRosterDoc, id]);

  const studentAssignmentCandidateIds = useMemo(() => {
    const ids = new Set<string>([id]);
    if (effectiveRoster?.id) ids.add(String(effectiveRoster.id));
    const rosterUserId = (effectiveRoster as { userId?: string } | null)?.userId;
    if (rosterUserId) ids.add(String(rosterUserId));
    if (paymentsFirestoreStudentId) ids.add(paymentsFirestoreStudentId);
    return [...ids];
  }, [id, effectiveRoster, paymentsFirestoreStudentId]);

  // workoutPlans are always stored under the Auth UID (which is the URL param `id`)
  const workoutPlansRef = useMemoFirebase(() => {
    if (!db || !user || !id) return null;
    return collection(db, "personalTrainers", user.uid, "students", id, "workoutPlans");
  }, [db, user, id]);
  const { data: workoutPlans } = useCollection(workoutPlansRef);

  const workoutSessionsRef = useMemoFirebase(() => {
    if (!db || !user || !id) return null;
    return collection(db, "personalTrainers", user.uid, "students", id, "workoutSessions");
  }, [db, user, id]);
  const { data: workoutSessions } = useCollection(workoutSessionsRef);

  const completedWorkoutPlanIds = useMemo(() => {
    const s = new Set<string>();
    for (const sess of workoutSessions || []) {
      const wid = String((sess as { workoutPlanId?: string }).workoutPlanId || "").trim();
      if (wid && (sess as { completedAt?: string }).completedAt) s.add(wid);
    }
    for (const p of workoutPlans || []) {
      const pid = String((p as { id?: string }).id || "").trim();
      if (!pid) continue;
      if ((p as { completedAt?: string }).completedAt || (p as { status?: string }).status === "completed") {
        s.add(pid);
      }
    }
    return s;
  }, [workoutSessions, workoutPlans]);

  const sessionSlotsRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "sessionSlots");
  }, [db, user]);
  const { data: trainerSessionSlots } = useCollection(sessionSlotsRef);

  const sortedWorkoutPlans = useMemo(() => {
    const completedPlanIds = new Set(
      (workoutSessions || [])
        .filter((session: any) => session.completedAt && session.workoutPlanId)
        .map((session: any) => session.workoutPlanId)
    );

    return [...(workoutPlans || [])]
      .filter(
        (plan: any) =>
          !plan.completedAt &&
          plan.status !== "completed" &&
          !completedPlanIds.has(plan.id)
      )
      .sort(compareActiveAssignedPlans);
  }, [workoutPlans, workoutSessions]);

  useEffect(() => {
    const expand = searchParams.get("expandPlan")?.trim();
    const tab = searchParams.get("tab");
    if (!expand || tab !== "management") return;
    const hasPlan = (sortedWorkoutPlans as Array<{ id?: string }>).some((p) => p.id === expand);
    if (!hasPlan) return;
    setExpandedAssignedPlanId(expand);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("expandPlan");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, sortedWorkoutPlans, pathname, router]);

  const sessionAttendanceStreak = useMemo(() => {
    const slotDm = Number((trainerSettings as any)?.slotDurationMin) || 30;
    const slots = (trainerSessionSlots || []) as SessionSlotAttendance[];
    const rosterUid = String((effectiveRoster as any)?.userId || "").trim();
    const candidateIds = Array.from(new Set([String(id || ""), rosterUid].filter(Boolean))) as string[];
    return maxAttendanceStreakForCandidates(slots, candidateIds, Date.now(), slotDm);
  }, [trainerSessionSlots, trainerSettings, effectiveRoster, id]);

  const sortedSessions = (workoutSessions || []).sort(
    (a: any, b: any) => (b.completedAt || b.startedAt || "").localeCompare(a.completedAt || a.startedAt || "")
  );

  const weightChartData = useMemo(() => {
    const global = (globalStudent || {}) as any;
    const history = Array.isArray(global.weightHistory) ? global.weightHistory : [];

    const normalized = history
      .map((entry: any) => {
        const dateValue = entry?.date || entry?.checkedAt || "";
        const weightValue = Number(entry?.weightKg ?? entry?.weight);
        const timestamp = Date.parse(dateValue);
        return {
          timestamp,
          weight: Number.isFinite(weightValue) ? weightValue : NaN,
        };
      })
      .filter((entry: any) => Number.isFinite(entry.timestamp) && Number.isFinite(entry.weight))
      .sort((a: any, b: any) => a.timestamp - b.timestamp)
      .map((entry: any) => ({
        date: new Date(entry.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        weight: Number(entry.weight.toFixed(1)),
      }));

    if (normalized.length > 0) return normalized;

    const currentWeight = Number(global.weightKg);
    if (Number.isFinite(currentWeight) && currentWeight > 0) {
      return [
        {
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          weight: Number(currentWeight.toFixed(1)),
        },
      ];
    }

    return [];
  }, [globalStudent]);

  const bodyCompositionCoachData = useMemo(
    () => bodyCompositionPointsFromSessions(workoutSessions || []),
    [workoutSessions]
  );

  const strengthByExercise = useMemo(() => {
    const exerciseMap = new Map<string, Map<string, { timestamp: number; date: string; oneRm: number }>>();

    (workoutSessions || []).forEach((session: any) => {
      const ts = Date.parse(session.completedAt || session.startedAt || session.date || "");
      if (!Number.isFinite(ts)) return;

      const dayBucketKey = new Date(ts).toISOString().slice(0, 10);
      const dayLabel = new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

      (session.exercises || []).forEach((exercise: any) => {
        const exerciseName = String(exercise.exerciseName || exercise.name || "").trim();
        if (!exerciseName) return;
        let bestOneRm = 0;

        if (Array.isArray(exercise.sets)) {
          exercise.sets.forEach((set: any) => {
            if (set?.completed === false) return;
            const oneRm = computeEpleyOneRm(Number(set?.weight) || 0, Number(set?.reps) || 0);
            if (oneRm > bestOneRm) bestOneRm = oneRm;
          });
        } else {
          bestOneRm = computeEpleyOneRm(Number(exercise?.weight) || 0, Number(exercise?.reps) || 0);
        }

        if (bestOneRm <= 0) return;

        const byDate =
          exerciseMap.get(exerciseName) ||
          new Map<string, { timestamp: number; date: string; oneRm: number }>();
        const existing = byDate.get(dayBucketKey);
        const roundedOneRm = Number(bestOneRm.toFixed(1));

        if (!existing || roundedOneRm > existing.oneRm) {
          byDate.set(dayBucketKey, {
            timestamp: ts,
            date: dayLabel,
            oneRm: roundedOneRm,
          });
        }

        exerciseMap.set(exerciseName, byDate);
      });
    });

    const result: Record<string, Array<{ date: string; oneRm: number }>> = {};
    for (const [name, byDate] of exerciseMap.entries()) {
      result[name] = Array.from(byDate.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((point) => ({ date: point.date, oneRm: point.oneRm }));
    }

    return result;
  }, [workoutSessions]);

  const strengthExerciseOptions = useMemo(
    () => Object.keys(strengthByExercise).sort((a, b) => a.localeCompare(b)),
    [strengthByExercise]
  );

  /** Must stay in sync with options on every render — Radix Select throws if value is not a SelectItem (e.g. "" before useEffect runs). */
  const resolvedStrengthExercise = useMemo(() => {
    if (strengthExerciseOptions.length === 0) return "";
    if (selectedStrengthExercise && strengthExerciseOptions.includes(selectedStrengthExercise)) {
      return selectedStrengthExercise;
    }
    return strengthExerciseOptions[0];
  }, [strengthExerciseOptions, selectedStrengthExercise]);

  const selectedStrengthData = useMemo(
    () =>
      resolvedStrengthExercise ? strengthByExercise[resolvedStrengthExercise] || [] : [],
    [resolvedStrengthExercise, strengthByExercise]
  );

  const lastSessionAt = useMemo(() => {
    let latest = 0;
    for (const session of workoutSessions || []) {
      const raw = session.completedAt || session.startedAt || session.date || "";
      const ts = Date.parse(raw);
      if (Number.isFinite(ts) && ts > latest) latest = ts;
    }
    return latest > 0 ? latest : null;
  }, [workoutSessions]);

  const [editSession, setEditSession] = useState<any>(null);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);

  const milestonesRef = useMemoFirebase(() => {
    if (!db || !user || !id) return null;
    return query(
      collection(db, "milestones"),
      where("trainerId", "==", user.uid),
      where("studentId", "==", id)
    );
  }, [db, user, id]);
  const { data: allMilestones, isLoading: milestonesLoading } = useCollection(milestonesRef);

  const studentMilestones: Milestone[] = (allMilestones || [])
    .filter((m: any) => m.studentId === id)
    .sort((a: any, b: any) => {
      const statusOrder: Record<string, number> = { active: 0, paused: 1, missed: 2, completed: 3 };
      const aStatus = statusOrder[a.status] ?? 999;
      const bStatus = statusOrder[b.status] ?? 999;
      if (aStatus !== bStatus) return aStatus - bStatus;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const openEditSession = (session: any) => {
    setEditSession(session);
  };

  const handleDeleteSessionFromList = async (sessionId: string) => {
    if (!db || !user) return;
    try {
      await deleteDoc(doc(db, "personalTrainers", user.uid, "students", id, "workoutSessions", sessionId));
      toast({ title: t("sessionDeleted") });
      setConfirmDeleteSessionId(null);
    } catch {
      toast({ variant: "destructive", title: t("deleteSessionFailed") });
    }
  };

  const handleDeleteWorkoutPlan = async (planId: string) => {
    if (!db || !user) return;

    setDeletingWorkoutPlanId(planId);
    try {
      await deleteSequencePlanWithChainRepair(db, user.uid, id, planId);
      toast({ title: t("assignedWorkoutRemoved") });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Remove failed",
        description: error?.message || "Could not remove the assigned workout.",
      });
    } finally {
      setDeletingWorkoutPlanId(null);
    }
  };

  const handleClearStudentPlans = useCallback(async () => {
    if (!db || !user || clearStudentPlansConfirm !== "DELETE") return;
    setIsClearingStudentPlans(true);
    try {
      const { deletedPlanCount, deletedWeekAssignmentCount } = await clearStudentAssignedPlans(
        db,
        user.uid,
        studentAssignmentCandidateIds
      );
      toast({
        title: t("clearStudentPlansSuccess"),
        description: [
          t("bulkClearPlansCountDetail").replace("{count}", String(deletedPlanCount)),
          t("bulkClearWeekAssignmentsCountDetail").replace("{count}", String(deletedWeekAssignmentCount)),
        ].join(" "),
      });
      setClearStudentPlansOpen(false);
      setClearStudentPlansConfirm("");
      setExpandedAssignedPlanId(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("bulkClearPlansFailed");
      toast({ variant: "destructive", title: t("bulkClearPlansFailed"), description: msg });
    } finally {
      setIsClearingStudentPlans(false);
    }
  }, [db, user, clearStudentPlansConfirm, studentAssignmentCandidateIds, t, toast]);

  const handleSaveAssignedExerciseNote = async (
    plan: any,
    exerciseIndex: number,
    nextNote: string
  ) => {
    if (!db || !user || !plan?.id) return;
    setIsSavingAssignedExerciseNote(true);
    try {
      const updatedExercises = [...(plan.exercises || [])];
      updatedExercises[exerciseIndex] = {
        ...updatedExercises[exerciseIndex],
        notes: nextNote,
      };

      await updateDoc(
        doc(db, "personalTrainers", user.uid, "students", id, "workoutPlans", plan.id),
        {
          exercises: updatedExercises,
        }
      );

      setEditingAssignedExerciseKey(null);
      setEditingAssignedExerciseNote("");
      toast({ title: t("saveChanges") });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error?.message || "Could not update exercise note.",
      });
    } finally {
      setIsSavingAssignedExerciseNote(false);
    }
  };

  const portalOnly = !effectiveRoster && !!globalStudent;
  const isLoading = rosterLoading || (!rosterStudent && globalLoading);
  const student = effectiveRoster
    ? effectiveRoster
    : globalStudent
      ? normalizePortalStudent(globalStudent as Record<string, unknown>, id)
      : null;

  useEffect(() => {
    if (effectiveRoster) {
      setCoachingNotes(effectiveRoster.coachingNotes || "");
      setEditStats({
        goalWeightKg: effectiveRoster.goalWeightKg?.toString() || "",
        goalBodyFatPercent:
          (effectiveRoster as { goalBodyFatPercent?: number }).goalBodyFatPercent != null
            ? String((effectiveRoster as { goalBodyFatPercent?: number }).goalBodyFatPercent)
            : "",
        goalType: effectiveRoster.goalType || "",
      });
    } else if (globalStudent) {
      setCoachingNotes("");
      setEditStats({
        goalWeightKg: globalStudent.goalWeightKg?.toString() || "",
        goalBodyFatPercent:
          (globalStudent as { goalBodyFatPercent?: number }).goalBodyFatPercent != null
            ? String((globalStudent as { goalBodyFatPercent?: number }).goalBodyFatPercent)
            : "",
        goalType: (globalStudent.goalType as string) || "",
      });
    }
  }, [effectiveRoster, globalStudent]);

  const handleAddToRoster = () => {
    if (!db || !user || !globalStudent || !id) return;
    setIsAddingToRoster(true);
    const g = globalStudent as Record<string, unknown>;
    const normalized = normalizePortalStudent(g, id);
    const subRef = doc(db, "personalTrainers", user.uid, "students", id);
    const globalRef = doc(db, "students", id);
    try {
      setDocumentNonBlocking(
        subRef,
        {
          userId: id,
          trainerId: user.uid,
          name:
            (g.name as string) ||
            `${String(normalized.firstName)} ${String(normalized.lastName)}`.trim(),
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          email: (g.email as string) || "",
          age: Number(g.age) || 0,
          sex: (g.sex as string) || "other",
          weightKg: Number(g.weightKg) || 0,
          heightCm: Number(g.heightCm) || 0,
          goalType: (g.goalType as string) || "general",
          goalWeightKg: Number(g.goalWeightKg) || 0,
          goalBodyFatPercent: Number(g.goalBodyFatPercent) || 0,
          activityStatus: (g.activityStatus as string) || "active",
          joinedAt: (g.joinedAt as string) || new Date().toISOString(),
          subscriptionStatus: (g.subscriptionStatus as string) || "pending",
          currentStreakDays: Number(g.currentStreakDays) || 0,
          lastWorkoutAt: g.lastWorkoutAt ?? null,
          currentProgramId: g.currentProgramId ?? null,
          photoUrl: (g.photoUrl as string) || "",
        },
        { merge: true }
      );
      // Also link the trainerId on the global student doc so the student can find their workouts
      setDocumentNonBlocking(globalRef, { trainerId: user.uid }, { merge: true });
      toast({
        title: t("addedToRoster"),
        description: t("addedToRosterDesc"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("couldNotAddStudent"),
        description: t("checkPermissions"),
      });
    } finally {
      setIsAddingToRoster(false);
    }
  };

  const handleUpdateStudent = async () => {
    if (portalOnly || !studentRef || !user) return;
    setIsSaving(true);
    try {
      // Ensure trainerId is preserved to satisfy security rules
      updateDocumentNonBlocking(studentRef, {
        trainerId: user.uid,
        coachingNotes,
        goalWeightKg: Number(editStats.goalWeightKg) || 0,
        goalBodyFatPercent: Number(editStats.goalBodyFatPercent) || 0,
        goalType: editStats.goalType,
      });
      toast({
        title: t("profileUpdated"),
        description: t("coachingDataSaved"),
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update coaching info.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!db || !user || !student) return;
    setIsDeleting(true);
    try {
      const result = await deleteStudent(db, user.uid, id);
      if (result.success) {
        toast({
          title: t("studentDeleted"),
          description: result.message,
        });
        router.push("/students");
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message,
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to delete student.",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const isStudentBlocked = student ? (student as any).blocked === true : false;

  const handleToggleBlock = async () => {
    if (!db || !user || !student) return;
    setIsBlocking(true);
    const newBlocked = !isStudentBlocked;
    try {
      updateDocumentNonBlocking(
        doc(db, "personalTrainers", user.uid, "students", id),
        { blocked: newBlocked, blockedReason: newBlocked ? "manual" : null }
      );
      // Also update global student doc so the student app can check
      setDocumentNonBlocking(
        doc(db, "students", id),
        { blocked: newBlocked, blockedReason: newBlocked ? "manual" : null },
        { merge: true }
      );
      toast({
        title: newBlocked ? t("studentBlocked") : t("studentUnblocked"),
        description: newBlocked
          ? t("studentBlockedDesc")
          : t("studentUnblockedDesc"),
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e.message || "Failed to update block status.",
      });
    } finally {
      setIsBlocking(false);
      setShowBlockConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <Navigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Navigation>
    );
  }

  if (!student) {
    return (
      <Navigation>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">{t("studentNotFound")}</h2>
          <Button className="mt-4" asChild>
            <Link href="/students">{t("backToRoster")}</Link>
          </Button>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="space-y-8">
        <header className="flex flex-col md:flex-row gap-4 md:gap-6 items-start justify-between bg-card p-4 md:p-6 rounded-xl border shadow-sm">
          <div className="flex gap-4 md:gap-6 items-center">
            <Avatar className="h-16 w-16 md:h-24 md:w-24 ring-4 ring-primary/10">
              <AvatarImage src={student.photoUrl || `https://picsum.photos/seed/${student.id}/200/200`} />
              <AvatarFallback className="text-2xl">{student.firstName?.[0]}{student.lastName?.[0]}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-3xl font-bold font-headline">
                  {student.firstName || student.name}{" "}
                  {student.lastName ? String(student.lastName) : ""}
                </h1>
                <Badge className="bg-accent text-accent-foreground capitalize">
                  {portalOnly ? "Portal" : student.activityStatus}
                </Badge>
                {student && isOpenTrainingAccess((student as { trainingAccessMode?: string }).trainingAccessMode) ? (
                  <Badge className="bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
                    {t("trainingAccessOpenBadge")}
                  </Badge>
                ) : null}
                {isStudentBlocked && (
                  <Badge variant="destructive" className="gap-1">
                    <Ban className="h-3 w-3" /> Blocked
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" /> {student.email}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" /> {t("memberSince")} {student.joinedAt ? new Date(student.joinedAt).toLocaleDateString() : "N/A"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {portalOnly && (
              <Button
                className="gap-2 flex-1 md:flex-none"
                onClick={handleAddToRoster}
                disabled={isAddingToRoster}
              >
                {isAddingToRoster ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {t("addToMyRoster")}
              </Button>
            )}
            <Button
              variant="destructive"
              className="gap-2 flex-1 md:flex-none"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t("deleteStudent")}
            </Button>
            {!portalOnly && (
              <Button
                variant={isStudentBlocked ? "outline" : "secondary"}
                className="gap-2 flex-1 md:flex-none"
                onClick={() => setShowBlockConfirm(true)}
                disabled={isBlocking}
              >
                {isBlocking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isStudentBlocked ? (
                  <ShieldOff className="h-4 w-4" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                {isStudentBlocked ? t("unblock") : t("blockStudent")}
              </Button>
            )}
          </div>
        </header>

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t("deleteStudent")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Are you sure you want to delete <strong>{student.firstName} {student.lastName}</strong>?
                  </p>
                  <p>
                    This action will permanently remove:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>{t("deleteStudentItem1")}</li>
                    <li>{t("deleteStudentItem2")}</li>
                    <li>All workout sessions and history</li>
                    <li>All payment records</li>
                  </ul>
                  <p className="font-semibold text-destructive">
                    {t("deleteStudentConfirmDesc")}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteStudent}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t("deleting")}
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("deleteStudent")}
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showBlockConfirm} onOpenChange={setShowBlockConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {isStudentBlocked ? <ShieldOff className="h-5 w-5" /> : <Ban className="h-5 w-5 text-destructive" />}
                {isStudentBlocked ? t("unblockStudent") : t("blockStudent")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isStudentBlocked
                  ? `Are you sure you want to unblock ${student.firstName} ${student.lastName}? They will regain access to their program.`
                  : `Are you sure you want to block ${student.firstName} ${student.lastName}? They will lose access to their program until unblocked.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBlocking}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleToggleBlock}
                disabled={isBlocking}
                className={isStudentBlocked ? "" : "bg-destructive hover:bg-destructive/90"}
              >
                {isBlocking ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{isStudentBlocked ? "Unblocking..." : "Blocking..."}</>
                ) : (
                  <>{isStudentBlocked ? <><ShieldOff className="h-4 w-4 mr-2" />{t("unblock")}</> : <><Ban className="h-4 w-4 mr-2" />{t("blockStudent")}</>}</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Session Delete Confirmation */}
        <AlertDialog open={!!confirmDeleteSessionId} onOpenChange={(open) => { if (!open) setConfirmDeleteSessionId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> {t("deleteSession")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this workout session? {t("deleteStudentConfirmDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  if (confirmDeleteSessionId) void handleDeleteSessionFromList(confirmDeleteSessionId);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> {t("deleteSession")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Workout Plan Delete Confirmation */}
        <AlertDialog open={!!confirmDeletePlanId} onOpenChange={(open) => { if (!open) setConfirmDeletePlanId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> {t("removeAssignedWorkout")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this assigned workout? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => { if (confirmDeletePlanId) { handleDeleteWorkoutPlan(confirmDeletePlanId); setConfirmDeletePlanId(null); } }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> {t("removeAssignedWorkout")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {portalOnly && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            {t("portalOnlyBanner")}
          </div>
        )}

        <Tabs value={studentDetailTab} onValueChange={handleStudentDetailTabChange} className="space-y-6">
          <TabsList className="bg-card border h-auto w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 p-1">
            <TabsTrigger value="management" className="text-xs sm:text-sm whitespace-normal text-center leading-tight min-h-10 px-2 py-2 h-auto">
              {t("coachingManagement")}
            </TabsTrigger>
            <TabsTrigger value="billing" className="text-xs sm:text-sm whitespace-normal text-center leading-tight min-h-10 px-2 py-2 h-auto">
              {t("billing")}
            </TabsTrigger>
            <TabsTrigger value="workoutHistory" className="text-xs sm:text-sm whitespace-normal text-center leading-tight min-h-10 px-2 py-2 h-auto">
              {t("workoutHistory")}
            </TabsTrigger>
            <TabsTrigger value="milestones" className="text-xs sm:text-sm whitespace-normal text-center leading-tight min-h-10 px-2 py-2 h-auto">
              {t("milestones")}
            </TabsTrigger>
            <TabsTrigger value="progress" className="text-xs sm:text-sm whitespace-normal text-center leading-tight min-h-10 px-2 py-2 h-auto">
              {t("progress")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-primary shrink-0" />
                    {t("bodyCompositionChartTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("bodyCompositionChartDesc")}{" "}
                    <span className="text-muted-foreground/90">
                      · {t("goal")} {student.goalWeightKg ?? "—"} kg
                      {Number((student as { goalBodyFatPercent?: number }).goalBodyFatPercent) > 0
                        ? ` · ${t("bodyFatGoalLabel").replace(
                            "{n}",
                            String(
                              Number((student as { goalBodyFatPercent?: number }).goalBodyFatPercent)
                            )
                          )}`
                        : ""}{" "}
                      (
                      <span className="capitalize">{student.goalType?.replace("_", " ") || "—"}</span>)
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  {bodyCompositionCoachData.length > 0 ? (
                    <BodyCompositionTrendChart
                      data={bodyCompositionCoachData}
                      emptyLabel={t("noBodyCompositionData")}
                      chartClassName="h-[300px] w-full min-h-[260px]"
                    />
                  ) : weightChartData.length > 0 ? (
                    <div className="h-[300px] w-full min-h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={weightChartData}>
                          <defs>
                            <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" />
                          <YAxis domain={["dataMin - 2", "dataMax + 2"]} />
                          <Tooltip />
                          <Area
                            type="monotone"
                            dataKey="weight"
                            stroke="hsl(var(--primary))"
                            fillOpacity={1}
                            fill="url(#colorWeight)"
                            strokeWidth={3}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[300px] flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg px-4">
                      <p>{t("noBodyCompositionData")}</p>
                      <p className="text-xs">{t("noWeightRecords")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("strengthProgression")}</CardTitle>
                  <CardDescription>{t("strengthProgressionDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {strengthExerciseOptions.length > 0 ? (
                    <div className="h-full flex flex-col gap-3">
                      <div className="w-full sm:w-[260px]">
                        <Select value={resolvedStrengthExercise} onValueChange={setSelectedStrengthExercise}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("selectExercise")} />
                          </SelectTrigger>
                          <SelectContent>
                            {strengthExerciseOptions.map((exerciseName) => (
                              <SelectItem key={exerciseName} value={exerciseName}>
                                {exerciseName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedStrengthData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey="oneRm"
                              stroke="hsl(var(--chart-1))"
                              strokeWidth={3}
                              name={`${resolvedStrengthExercise} 1RM`}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      {t("noStrengthData")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <Card className="bg-accent/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-accent" />
                    {t("sessionAttendanceStreakTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {sessionAttendanceStreak} {t("sessionsStreakCompact")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("sessionAttendanceStreakHint")}</p>
                </CardContent>
              </Card>
              <Card className="bg-secondary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    {t("progressCardSessionsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">
                    {lastSessionAt
                      ? new Date(lastSessionAt).toLocaleDateString()
                      : t("noWorkoutSessions")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t("progressCardSessionsHint")}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="workoutHistory" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dumbbell className="h-5 w-5 text-primary" />
                  {t("workoutHistory")}
                </CardTitle>
                <CardDescription>
                  {sortedSessions.length}{" "}
                  {sortedSessions.length !== 1 ? t("sessionsCompleted") : t("sessionCompleted")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sortedSessions.length > 0 ? (
                  <div className="space-y-3">
                    {sortedSessions.map((session: any) => (
                      <div key={session.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{session.workoutTitle || "Untitled Workout"}</p>
                            <p className="text-xs text-muted-foreground">
                              {session.completedAt
                                ? new Date(session.completedAt).toLocaleDateString(undefined, {
                                    weekday: "short",
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : session.startedAt
                                  ? new Date(session.startedAt).toLocaleDateString()
                                  : "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEditSession(session)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setConfirmDeleteSessionId(session.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              {session.status === "completed" ? t("completed") : session.status || "Done"}
                            </Badge>
                          </div>
                        </div>
                        {(session.sessionDifficultyRating != null ||
                          session.sessionMoodRating != null ||
                          session.difficultyNotes ||
                          session.moodNotes) && (
                          <div className="text-xs rounded-md bg-muted/40 border border-border/60 p-3 space-y-2">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center font-medium">
                              {(() => {
                                const dr = Number(session.sessionDifficultyRating);
                                const faces = ["😌", "🙂", "😐", "😰", "😵"];
                                if (!Number.isFinite(dr) || dr < 1 || dr > 5) return null;
                                return (
                                  <span className="text-muted-foreground">
                                    {t("sessionDifficultyCoach")}: <span aria-hidden>{faces[dr - 1]}</span> ({dr}/5)
                                  </span>
                                );
                              })()}
                              {(() => {
                                const mr = Number(session.sessionMoodRating);
                                const faces = ["😢", "😕", "😐", "😊", "🤩"];
                                if (!Number.isFinite(mr) || mr < 1 || mr > 5) return null;
                                return (
                                  <span className="text-muted-foreground">
                                    {t("sessionMoodCoach")}: <span aria-hidden>{faces[mr - 1]}</span> ({mr}/5)
                                  </span>
                                );
                              })()}
                            </div>
                            {(session.difficultyNotes || session.moodNotes) && (
                              <div className="space-y-1 text-muted-foreground">
                                {session.difficultyNotes ? (
                                  <p>
                                    <span className="font-semibold text-foreground/80">
                                      {t("sessionDifficultyCoach")}:{" "}
                                    </span>
                                    {session.difficultyNotes}
                                  </p>
                                ) : null}
                                {session.moodNotes ? (
                                  <p>
                                    <span className="font-semibold text-foreground/80">
                                      {t("sessionMoodCoach")}:{" "}
                                    </span>
                                    {session.moodNotes}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                        {session.exercises && session.exercises.length > 0 && (
                          <div className="space-y-2">
                            {session.exercises.map((ex: any, idx: number) => (
                              <div key={idx} className="bg-muted/50 rounded p-2">
                                <p className="text-sm font-medium">{ex.exerciseName || ex.name}</p>
                                {ex.sets && Array.isArray(ex.sets) ? (
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {ex.sets.map((s: any, si: number) => (
                                      <span
                                        key={si}
                                        className="text-xs bg-background border rounded px-2 py-0.5"
                                      >
                                        Set {si + 1}: {s.weight ?? "—"}kg × {s.reps ?? "—"}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    {ex.sets || "—"} sets · {ex.reps || "—"} reps
                                    {ex.weight ? ` · ${ex.weight}kg` : ""}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">{t("noWorkoutSessions")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="milestones" className="space-y-6">
            <MilestonesTab
              db={db}
              user={user}
              studentId={id}
              milestones={studentMilestones}
              isLoading={milestonesLoading}
              onMilestonesChange={() => {
                // Trigger a refetch by updating state or calling the query again
                // This will be handled by Firestore listener in the useCollection hook
              }}
            />
          </TabsContent>

          <TabsContent value="management">
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-primary" />
                      {t("trainerNotes")}
                    </CardTitle>
                    <CardDescription>{t("privateNotes")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea 
                      placeholder={t("placeholderCoachingNotes")}
                      className="min-h-[250px] text-base leading-relaxed"
                      value={coachingNotes}
                      onChange={(e) => setCoachingNotes(e.target.value)}
                      disabled={portalOnly}
                    />
                  </CardContent>
                  <CardFooter className="bg-muted/5 border-t">
                    <Button 
                      className="gap-2 ml-auto" 
                      onClick={handleUpdateStudent}
                      disabled={isSaving || portalOnly}
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {t("saveCoachingNotes")}
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
                    <div className="space-y-1.5">
                      <CardTitle className="text-sm">{t("assignedWorkouts")}</CardTitle>
                      <CardDescription>{t("assignedWorkouts")}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <AlertDialog
                        open={clearStudentPlansOpen}
                        onOpenChange={(open) => {
                          setClearStudentPlansOpen(open);
                          if (!open) setClearStudentPlansConfirm("");
                        }}
                      >
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                            disabled={
                              portalOnly ||
                              !(workoutPlans?.length) ||
                              isClearingStudentPlans ||
                              isApplyingDefaultSequence
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            {t("bulkClearPlansButton")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("clearStudentPlansTitle")}</AlertDialogTitle>
                            <AlertDialogDescription className="space-y-3">
                              <span className="block">{t("clearStudentPlansDescription")}</span>
                              <span className="block font-medium text-foreground">
                                {t("bulkClearPlansConfirmHint")}
                              </span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="space-y-2 py-2">
                            <Label htmlFor="clear-student-plans-confirm">
                              {t("bulkClearPlansConfirmPlaceholder")}
                            </Label>
                            <Input
                              id="clear-student-plans-confirm"
                              autoComplete="off"
                              value={clearStudentPlansConfirm}
                              onChange={(e) => setClearStudentPlansConfirm(e.target.value)}
                              placeholder={t("bulkClearPlansConfirmPlaceholder")}
                              disabled={isClearingStudentPlans}
                            />
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isClearingStudentPlans}>
                              {t("cancel")}
                            </AlertDialogCancel>
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={clearStudentPlansConfirm !== "DELETE" || isClearingStudentPlans}
                              className="gap-2"
                              onClick={() => void handleClearStudentPlans()}
                            >
                              {isClearingStudentPlans ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              {t("confirm")}
                            </Button>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="shrink-0 gap-2"
                        disabled={portalOnly || isApplyingDefaultSequence || isClearingStudentPlans}
                        onClick={() => void handleApplyDefaultSequence()}
                      >
                        {isApplyingDefaultSequence ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ListOrdered className="h-4 w-4" />
                        )}
                        {t("applyDefaultStudentSequence")}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sortedWorkoutPlans.length > 0 ? (
                      sortedWorkoutPlans.map((plan: any) => (
                        <div key={plan.id} className="border rounded-lg bg-background">
                          <div className="p-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                              <div className="min-w-0">
                                <span className="text-sm font-medium block truncate">{plan.title || "Untitled"}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                              {plan.sequenceGroupId ? (
                                <Badge
                                  variant={
                                    isSequenceStepEffectiveUnlocked(plan, completedWorkoutPlanIds)
                                      ? "outline"
                                      : "destructive"
                                  }
                                >
                                  {isSequenceStepEffectiveUnlocked(plan, completedWorkoutPlanIds)
                                    ? t("sequenceUnlockedBadge")
                                    : t("sequenceLockedBadge")}
                                </Badge>
                              ) : null}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() =>
                                  setExpandedAssignedPlanId((current) => (current === plan.id ? null : plan.id))
                                }
                                title="Expand details"
                              >
                                {expandedAssignedPlanId === plan.id ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setConfirmDeletePlanId(plan.id)}
                                disabled={portalOnly || deletingWorkoutPlanId === plan.id}
                              >
                                {deletingWorkoutPlanId === plan.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {expandedAssignedPlanId === plan.id && (
                            <div className="px-3 pb-3 border-t bg-muted/10">
                              <div className="pt-3 space-y-2">
                                {(plan.exercises || []).length > 0 ? (
                                  (plan.exercises || []).map((exercise: any, index: number) => (
                                    <div key={index} className="rounded-md border bg-background p-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium">
                                          {exercise.exerciseName || exercise.name || `Exercise ${index + 1}`}
                                        </p>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-primary shrink-0"
                                          onClick={() => {
                                            const noteKey = `${plan.id}-${index}`;
                                            setEditingAssignedExerciseKey(noteKey);
                                            setEditingAssignedExerciseNote(String(exercise.notes || ""));
                                          }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                      {editingAssignedExerciseKey === `${plan.id}-${index}` ? (
                                        <div className="space-y-2 mt-2">
                                          <Textarea
                                            value={editingAssignedExerciseNote}
                                            onChange={(event) => setEditingAssignedExerciseNote(event.target.value)}
                                            rows={3}
                                            className="text-xs"
                                            placeholder={t("placeholderAssignedExerciseNote")}
                                          />
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              className="h-7 text-xs gap-1.5"
                                              onClick={() =>
                                                handleSaveAssignedExerciseNote(
                                                  plan,
                                                  index,
                                                  editingAssignedExerciseNote
                                                )
                                              }
                                              disabled={isSavingAssignedExerciseNote}
                                            >
                                              {isSavingAssignedExerciseNote ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                <Save className="h-3 w-3" />
                                              )}
                                              {t("save")}
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 text-xs"
                                              onClick={() => {
                                                setEditingAssignedExerciseKey(null);
                                                setEditingAssignedExerciseNote("");
                                              }}
                                            >
                                              {t("cancel")}
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                                          {exercise.notes || (
                                            <span className="italic">No notes yet. Click pencil to edit.</span>
                                          )}
                                        </p>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">{t("noExercisesDefined")}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("noWorkoutsAssigned")}</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("adjustGoals")}</CardTitle>
                    <CardDescription>{t("updateTargetMetrics")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("goalWeight")}</Label>
                      <Input 
                        type="number" 
                        value={editStats.goalWeightKg}
                        onChange={(e) => setEditStats({...editStats, goalWeightKg: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("goalBodyFatPercent")}</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        max={100}
                        value={editStats.goalBodyFatPercent}
                        onChange={(e) =>
                          setEditStats({ ...editStats, goalBodyFatPercent: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("goalType")}</Label>
                      <Input 
                        placeholder="e.g. Muscle Gain"
                        value={editStats.goalType}
                        onChange={(e) => setEditStats({...editStats, goalType: e.target.value})}
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={handleUpdateStudent}
                      disabled={isSaving || portalOnly}
                    >
                      {t("updateTargets")}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <BillingTab
              db={db}
              user={user}
              studentId={paymentsFirestoreStudentId}
              globalStudentUid={id}
              toast={toast}
            />
          </TabsContent>
        </Tabs>

        <EditWorkoutSessionDialog
          open={!!editSession}
          onOpenChange={(o) => !o && setEditSession(null)}
          db={db}
          trainerUid={user?.uid}
          storageStudentId={id}
          session={
            editSession
              ? {
                  id: editSession.id,
                  workoutTitle: editSession.workoutTitle,
                  exercises: editSession.exercises,
                }
              : null
          }
          t={t}
          toast={toast}
        />
      </div>
    </Navigation>
  );
}
