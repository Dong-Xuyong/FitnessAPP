"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  Percent,
  Ruler,
  Scale,
  Target,
  TrendingUp,
} from "lucide-react";
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

const SNAPSHOT_PRIORITY: BodyMetricKey[] = [
  "weightKg",
  "fatMassPercent",
  "bodyFatPercent",
  "leanMassPercent",
  "bmi",
];

function formatChipValue(key: BodyMetricKey, value: number): string {
  const unit = BODY_METRIC_FIELDS[key].unit;
  if (unit === "%") return `${value}%`;
  if (unit === "cm") return `${value} cm`;
  if (unit === "score" || unit === "index") return String(value);
  return `${value} kg`;
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
  const [trendOpen, setTrendOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [logDefaultApplied, setLogDefaultApplied] = useState(false);

  const compositionKeys = chartableKeysForGroup("composition");
  const measurementKeys = chartableKeysForGroup("measurements");

  const [primaryMetric, setPrimaryMetric] = useState<BodyMetricKey>("weightKg");
  const [secondaryMetric, setSecondaryMetric] = useState<BodyMetricKey | "none">("fatMassPercent");

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
    const picked: BodyMetricKey[] = [];
    for (const key of SNAPSHOT_PRIORITY) {
      const value = snapshot[key];
      if (value == null || value <= 0) continue;
      if (key === "bodyFatPercent" && snapshot.fatMassPercent != null && snapshot.fatMassPercent > 0) {
        continue;
      }
      if (key === "fatMassPercent" && picked.includes("bodyFatPercent")) continue;
      picked.push(key);
      if (picked.length >= 3) break;
    }
    return picked.map((k) => (
      <Badge key={k} variant="secondary" className="font-normal tabular-nums">
        <span className="text-muted-foreground mr-1">{t(BODY_METRIC_FIELDS[k].labelKey)}</span>
        {formatChipValue(k, snapshot[k]!)}
      </Badge>
    ));
  }, [snapshot, t]);

  const hasChartData = chartData.length > 0;
  const secondary = secondaryMetric === "none" ? null : secondaryMetric;

  useEffect(() => {
    if (logDefaultApplied) return;
    setLogOpen(!hasChartData);
    setLogDefaultApplied(true);
  }, [hasChartData, logDefaultApplied]);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Scale className="h-5 w-5 text-primary shrink-0" aria-hidden />
            {t("bodyMetricsPanelTitle")}
          </CardTitle>
          {showGoals && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums shrink-0"
              title={[
                `${t("goal")} ${goalWeightKg ?? "—"} kg`,
                Number(goalBodyFatPercent) > 0
                  ? t("bodyFatGoalLabel").replace("{n}", String(goalBodyFatPercent))
                  : null,
                goalType?.replace("_", " ") || null,
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {goalWeightKg ?? "—"} kg
              {Number(goalBodyFatPercent) > 0 ? ` · ${goalBodyFatPercent}%` : ""}
            </span>
          )}
        </div>
        {snapshotChips.length > 0 && (
          <div className="flex flex-wrap gap-2">{snapshotChips}</div>
        )}
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-0 space-y-3 min-w-0">
        <Collapsible open={trendOpen} onOpenChange={setTrendOpen}>
          <div className="rounded-lg border border-border/60 min-w-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("bodyMetricsTrendLabel")}
                title={t("bodyMetricsTrendLabel")}
              >
                <TrendingUp className="h-4 w-4 text-primary shrink-0" aria-hidden />
                <span className="flex-1" />
                {trendOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 px-3 pb-3 min-w-0">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as BodyMetricGroup)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="composition" className="gap-1.5" aria-label={t("bodyMetricsTabComposition")} title={t("bodyMetricsTabComposition")}>
                      <Percent className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">{t("bodyMetricsTabComposition")}</span>
                    </TabsTrigger>
                    <TabsTrigger value="measurements" className="gap-1.5" aria-label={t("bodyMetricsTabMeasurements")} title={t("bodyMetricsTabMeasurements")}>
                      <Ruler className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">{t("bodyMetricsTabMeasurements")}</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="composition" className="space-y-4 mt-4 min-w-0">
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

                  <TabsContent value="measurements" className="space-y-4 mt-4 min-w-0">
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
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        <Collapsible open={logOpen} onOpenChange={setLogOpen}>
          <div className="rounded-lg border border-border/60 min-w-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("coachBodyMetricTitle")}
                title={t("coachBodyMetricTitle")}
              >
                <ClipboardPlus className="h-4 w-4 text-primary shrink-0" aria-hidden />
                <span className="flex-1" />
                {logOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3 min-w-0">
                <BodyMetricsForm
                  trainerId={trainerId}
                  rosterStudentId={rosterStudentId}
                  globalStudentId={globalStudentId}
                  canWriteSession={canWriteSession}
                  source={source}
                  initialProfile={profile}
                  existingWeightHistory={weightHistory}
                  compact
                  activeGroup={activeTab}
                  onSaved={refreshData}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
      <div className="space-y-1.5 min-w-0">
        <LabelMini>{t("bodyMetricsChartPrimary")}</LabelMini>
        <Select value={primaryMetric} onValueChange={(v) => onPrimaryChange(v as BodyMetricKey)}>
          <SelectTrigger className="w-full">
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
      <div className="space-y-1.5 min-w-0">
        <LabelMini>{t("bodyMetricsChartSecondary")}</LabelMini>
        <Select
          value={secondaryMetric}
          onValueChange={(v) => onSecondaryChange(v as BodyMetricKey | "none")}
        >
          <SelectTrigger className="w-full">
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
