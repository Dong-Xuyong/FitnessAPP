"use client";

import { useId } from "react";
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
import type { BodyCompositionChartPoint } from "@/lib/body-composition-from-sessions";
import { useI18n } from "@/lib/i18n";

export function BodyCompositionTrendChart({
  data,
  emptyLabel,
  chartClassName = "h-[300px] w-full min-h-[260px]",
}: {
  data: BodyCompositionChartPoint[];
  emptyLabel: string;
  chartClassName?: string;
}) {
  const { t } = useI18n();
  const gradSafeId = `bwgrad-${useId().replace(/:/g, "")}`;

  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-lg ${chartClassName}`}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={chartClassName}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id={gradSafeId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            {...(data.length > 8
              ? { angle: -30, textAnchor: "end" as const, height: 58 }
              : { height: 30 })}
          />
          <YAxis yAxisId="w" orientation="left" tick={{ fontSize: 11 }} domain={["auto", "auto"]} width={44} />
          <YAxis yAxisId="bf" orientation="right" tick={{ fontSize: 11 }} domain={["auto", "auto"]} width={36} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
            }}
            labelStyle={{ marginBottom: 4 }}
            formatter={(value, name) => {
              const n = Number(value);
              if (!Number.isFinite(n)) return ["—", String(name)];
              if (String(name) === t("sessionBodyFatCoach")) return [`${n}%`, String(name)];
              return [`${n} kg`, String(name)];
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
            yAxisId="w"
            type="monotone"
            dataKey="weightKg"
            name={t("sessionBodyWeightCoach")}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill={`url(#${gradSafeId})`}
            connectNulls
            dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--card))" }}
          />
          <Line
            yAxisId="bf"
            type="monotone"
            dataKey="bodyFat"
            name={t("sessionBodyFatCoach")}
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
