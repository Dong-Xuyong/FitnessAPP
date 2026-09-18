"use client";

import { BodyMetricsForm } from "@/components/BodyMetricsForm";

type CoachBodyMetricFormProps = {
  trainerId: string;
  rosterStudentId: string;
  globalStudentId: string;
  canWriteSession: boolean;
  initialWeightKg?: unknown;
  initialBodyFatPercent?: unknown;
  existingWeightHistory?: unknown;
  compact?: boolean;
  onSaved?: () => void;
};

export function CoachBodyMetricForm({
  trainerId,
  rosterStudentId,
  globalStudentId,
  canWriteSession,
  initialWeightKg,
  initialBodyFatPercent,
  existingWeightHistory,
  compact,
  onSaved,
}: CoachBodyMetricFormProps) {
  const initialProfile = {
    weightKg: initialWeightKg,
    fatMassPercent: initialBodyFatPercent,
    bodyFatPercent: initialBodyFatPercent,
  };

  return (
    <BodyMetricsForm
      trainerId={trainerId}
      rosterStudentId={rosterStudentId}
      globalStudentId={globalStudentId}
      canWriteSession={canWriteSession}
      source="coach"
      initialProfile={initialProfile}
      existingWeightHistory={existingWeightHistory}
      compact={compact}
      onSaved={onSaved}
    />
  );
}
