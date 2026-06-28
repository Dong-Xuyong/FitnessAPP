"use client";

import { useId, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Area,
  Line,
} from "recharts";
import type { BodyMetricChartPoint, BodyMetricKey } from "@/lib/body-metrics-types";
import { BODY_METRIC_FIELDS } from "@/lib/body-metrics-types";
import { filterChartPointsForMetrics } from "@/lib/body-composition-from-sessions";
import { useI18n } from "@/lib/i18n";

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))"];

function formatTooltipValue(value: unknown, unit: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (unit === "%") return `${n}%`;
  if (unit === "cm") return `${n} cm`;
  if (unit === "score") return String(n);
  return `${n} kg`;
}

export function BodyMetricsTrendChart({
  data,
  primaryMetric,
  secondaryMetric,
  emptyLabel,
  chartClassName = "h-[300px] w-full min-h-[260px]",
}: {
  data: BodyMetricChartPoint[];
  primaryMetric: BodyMetricKey;
  secondaryMetric?: BodyMetricKey | null;
  emptyLabel: string;
  chartClassName?: string;
}) {
  const { t } = useI18n();
  const gradSafeId = `bmgrad-${useId().replace(/:/g, "")}`;

  const metrics = useMemo(() => {
    const keys = [primaryMetric, secondaryMetric].filter(Boolean) as BodyMetricKey[];
    return keys;
  }, [primaryMetric, secondaryMetric]);

  const filteredData = useMemo(
    () => filterChartPointsForMetrics(data, metrics),
    [data, metrics]
  );

  const primaryUnit = BODY_METRIC_FIELDS[primaryMetric].unit;
  const secondaryUnit = secondaryMetric ? BODY_METRIC_FIELDS[secondaryMetric].unit : null;
  const useDualAxis = secondaryMetric != null && primaryUnit !== secondaryUnit;

  if (filteredData.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-lg ${chartClassName}`}
      >
        {emptyLabel}
      </div>
    );
  }

  const primaryLabel = t(BODY_METRIC_FIELDS[primaryMetric].labelKey);
  const secondaryLabel = secondaryMetric ? t(BODY_METRIC_FIELDS[secondaryMetric].labelKey) : null;

  return (
    <div className={chartClassName}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={filteredData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id={gradSafeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
              <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            {...(filteredData.length > 8
              ? { angle: -30, textAnchor: "end" as const, height: 58 }
              : { height: 30 })}
          />
          <YAxis
            yAxisId="primary"
            orientation="left"
            tick={{ fontSize: 11 }}
            domain={["auto", "auto"]}
            width={44}
          />
          {useDualAxis && (
            <YAxis
              yAxisId="secondary"
              orientation="right"
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
              width={36}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
            }}
            labelStyle={{ marginBottom: 4 }}
            formatter={(value, name) => {
              const key = metrics.find((k) => t(BODY_METRIC_FIELDS[k].labelKey) === String(name));
              const unit = key ? BODY_METRIC_FIELDS[key].unit : "kg";
              return [formatTooltipValue(value, unit), String(name)];
            }}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{
              paddingTop: 16,
              display: "flex",
              justifyContent: "center",
              gap: "1.5rem",
              flexWrap: "wrap",
            }}
            iconType="circle"
          />
          <Area
            yAxisId="primary"
            type="monotone"
            dataKey={primaryMetric}
            name={primaryLabel}
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            fill={`url(#${gradSafeId})`}
            connectNulls
            dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--card))" }}
          />
          {secondaryMetric && (
            <Line
              yAxisId={useDualAxis ? "secondary" : "primary"}
              type="monotone"
              dataKey={secondaryMetric}
              name={secondaryLabel ?? secondaryMetric}
              stroke={CHART_COLORS[1]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** @deprecated Use BodyMetricsTrendChart */
export function BodyCompositionTrendChart({
  data,
  emptyLabel,
  chartClassName,
}: {
  data: BodyMetricChartPoint[];
  emptyLabel: string;
  chartClassName?: string;
}) {
  return (
    <BodyMetricsTrendChart
      data={data}
      primaryMetric="weightKg"
      secondaryMetric="bodyFatPercent"
      emptyLabel={emptyLabel}
      chartClassName={chartClassName}
    />
  );
}
