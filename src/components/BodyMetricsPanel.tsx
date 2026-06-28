"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Scale } from "lucide-react";
import { useFirestore } from "@/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { BodyMetricsTrendChart } from "@/components/BodyMetricsTrendChart";
import { BodyMetricsForm } from "@/components/BodyMetricsForm";
import { bodyMetricChartPoints, chartHasMetricData } from "@/lib/body-composition-from-sessions";
import type { BodyMetricChartPoint, BodyMetricGroup, BodyMetricKey, BodyMetricSource } from "@/lib/body-metrics-types";
import {
  BODY_METRIC_FIELDS,
  bodyMetricsFromProfile,
  chartableKeysForGroup,
} from "@/lib/body-metrics-types";

type BodyMetricsPanelProps = {
  trainerId: string;
  rosterStudentId: string;
  globalStudentId: string;
  canWriteSession: boolean;
  source: BodyMetricSource;
  initialProfile?: Record<string, unknown> | null;
  existingWeightHistory?: unknown;
  goalWeightKg?: number | null;
  goalBodyFatPercent?: number | null;
  goalType?: string | null;
  showGoals?: boolean;
};

function formatSnapshotValue(
  key: BodyMetricKey,
  value: number,
  t: (key: TranslationKey) => string
): string {
  const unit = BODY_METRIC_FIELDS[key].unit;
  const label = t(BODY_METRIC_FIELDS[key].labelKey);
  if (unit === "%") return `${value}% ${label}`;
  if (unit === "cm") return `${value} cm ${label}`;
  if (unit === "score") return `${value} ${label}`;
  return `${value} kg ${label}`;
}

export function BodyMetricsPanel({
  trainerId,
  rosterStudentId,
  globalStudentId,
  canWriteSession,
  source,
  initialProfile,
  existingWeightHistory: initialHistory,
  goalWeightKg,
  goalBodyFatPercent,
  goalType,
  showGoals = false,
}: BodyMetricsPanelProps) {
  const db = useFirestore();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<BodyMetricGroup>("composition");
  const [chartData, setChartData] = useState<BodyMetricChartPoint[]>([]);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(initialProfile ?? null);
  const [weightHistory, setWeightHistory] = useState<unknown>(initialHistory);

  const compositionKeys = chartableKeysForGroup("composition");
  const measurementKeys = chartableKeysForGroup("measurements");

  const [primaryMetric, setPrimaryMetric] = useState<BodyMetricKey>("weightKg");
  const [secondaryMetric, setSecondaryMetric] = useState<BodyMetricKey | "none">("bodyFatPercent");

  const refreshData = useCallback(async () => {
    if (!db) return;
    try {
      const [sessionsSnap, globalSnap] = await Promise.all([
        getDocs(
          collection(db, "personalTrainers", trainerId, "students", rosterStudentId, "workoutSessions")
        ),
        getDoc(doc(db, "students", globalStudentId)),
      ]);
      const globalData = globalSnap.exists() ? (globalSnap.data() as Record<string, unknown>) : null;
      const history = globalData?.weightHistory;
      if (globalData) setProfile(globalData);
      if (history !== undefined) setWeightHistory(history);
      setChartData(
        bodyMetricChartPoints(
          sessionsSnap.docs.map((d) => d.data() as Record<string, unknown>),
          history
        )
      );
    } catch {
      // keep existing chart data on refresh failure
    }
  }, [db, trainerId, rosterStudentId, globalStudentId]);

  useEffect(() => {
    if (!db) return;
    void refreshData();
  }, [db, refreshData]);

  useEffect(() => {
    if (initialProfile) setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    if (initialHistory !== undefined) setWeightHistory(initialHistory);
  }, [initialHistory]);

  const tabKeys = activeTab === "composition" ? compositionKeys : measurementKeys;

  useEffect(() => {
    const available = tabKeys.filter((k) => chartHasMetricData(chartData, k));
    const fallbackPrimary = available[0] ?? tabKeys[0];
    const fallbackSecondary = available.find((k) => k !== fallbackPrimary) ?? tabKeys[1];
    if (!tabKeys.includes(primaryMetric)) setPrimaryMetric(fallbackPrimary);
    if (secondaryMetric !== "none" && !tabKeys.includes(secondaryMetric)) {
      setSecondaryMetric(fallbackSecondary ?? "none");
    }
  }, [activeTab, chartData, tabKeys, primaryMetric, secondaryMetric]);

  const snapshot = useMemo(() => bodyMetricsFromProfile(profile), [profile]);

  const snapshotChips = useMemo(() => {
    return (Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[])
      .filter((k) => snapshot[k] != null && snapshot[k]! > 0)
      .slice(0, 6)
      .map((k) => (
        <Badge key={k} variant="secondary" className="font-normal">
          {formatSnapshotValue(k, snapshot[k]!, t)}
        </Badge>
      ));
  }, [snapshot, t]);

  const hasChartData = chartData.length > 0;
  const secondary = secondaryMetric === "none" ? null : secondaryMetric;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary shrink-0" />
          {t("bodyMetricsPanelTitle")}
        </CardTitle>
        <CardDescription>
          {t("bodyMetricsPanelDesc")}
          {showGoals && (
            <span className="text-muted-foreground/90">
              {" "}
              · {t("goal")} {goalWeightKg ?? "—"} kg
              {Number(goalBodyFatPercent) > 0
                ? ` · ${t("bodyFatGoalLabel").replace("{n}", String(goalBodyFatPercent))}`
                : ""}{" "}
              ({goalType?.replace("_", " ") || "—"})
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0 space-y-4">
        {snapshotChips.length > 0 && (
          <div className="flex flex-wrap gap-2">{snapshotChips}</div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as BodyMetricGroup)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="composition">{t("bodyMetricsTabComposition")}</TabsTrigger>
            <TabsTrigger value="measurements">{t("bodyMetricsTabMeasurements")}</TabsTrigger>
          </TabsList>

          <TabsContent value="composition" className="space-y-4 mt-4">
            <ChartSelectors
              tabKeys={compositionKeys}
              primaryMetric={primaryMetric}
              secondaryMetric={secondaryMetric}
              onPrimaryChange={setPrimaryMetric}
              onSecondaryChange={setSecondaryMetric}
              t={t}
            />
            <BodyMetricsTrendChart
              data={chartData}
              primaryMetric={primaryMetric}
              secondaryMetric={secondary}
              emptyLabel={t("noBodyCompositionData")}
            />
          </TabsContent>

          <TabsContent value="measurements" className="space-y-4 mt-4">
            <ChartSelectors
              tabKeys={measurementKeys}
              primaryMetric={primaryMetric}
              secondaryMetric={secondaryMetric}
              onPrimaryChange={setPrimaryMetric}
              onSecondaryChange={setSecondaryMetric}
              t={t}
            />
            <BodyMetricsTrendChart
              data={chartData}
              primaryMetric={primaryMetric}
              secondaryMetric={secondary}
              emptyLabel={t("bodyMetricsNoMeasurementData")}
            />
          </TabsContent>
        </Tabs>

        <BodyMetricsForm
          trainerId={trainerId}
          rosterStudentId={rosterStudentId}
          globalStudentId={globalStudentId}
          canWriteSession={canWriteSession}
          source={source}
          initialProfile={profile}
          existingWeightHistory={weightHistory}
          compact={hasChartData}
          onSaved={refreshData}
        />
      </CardContent>
    </Card>
  );
}

function ChartSelectors({
  tabKeys,
  primaryMetric,
  secondaryMetric,
  onPrimaryChange,
  onSecondaryChange,
  t,
}: {
  tabKeys: BodyMetricKey[];
  primaryMetric: BodyMetricKey;
  secondaryMetric: BodyMetricKey | "none";
  onPrimaryChange: (k: BodyMetricKey) => void;
  onSecondaryChange: (k: BodyMetricKey | "none") => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <LabelMini>{t("bodyMetricsChartPrimary")}</LabelMini>
        <Select value={primaryMetric} onValueChange={(v) => onPrimaryChange(v as BodyMetricKey)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabKeys.map((k) => (
              <SelectItem key={k} value={k}>
                {t(BODY_METRIC_FIELDS[k].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <LabelMini>{t("bodyMetricsChartSecondary")}</LabelMini>
        <Select
          value={secondaryMetric}
          onValueChange={(v) => onSecondaryChange(v as BodyMetricKey | "none")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("bodyMetricsChartNone")}</SelectItem>
            {tabKeys.filter((k) => k !== primaryMetric).map((k) => (
              <SelectItem key={k} value={k}>
                {t(BODY_METRIC_FIELDS[k].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function LabelMini({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
