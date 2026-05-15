"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n";

export type RosterMonthlySessionRow = {
  studentId: string;
  name: string;
  booked: number;
  absent: number;
  monthlyAllowance: number | null;
};

const COLOR_BOOKED = "#eab308";
const COLOR_ABSENT = "hsl(var(--destructive))";
const COLOR_ALLOWANCE = "#171717";
const COLOR_ALLOWANCE_STROKE = "#171717";

function truncateLabel(name: string, max = 20): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function RosterMonthlySessionChart({ rows }: { rows: RosterMonthlySessionRow[] }) {
  const { t } = useI18n();

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        studentId: row.studentId,
        name: truncateLabel(row.name),
        fullName: row.name,
        booked: row.booked,
        absent: row.absent,
        allowance: row.monthlyAllowance ?? 0,
        allowanceConfigured: row.monthlyAllowance != null,
      })),
    [rows]
  );

  const chartHeight = Math.max(280, chartData.length * 44);

  const bookedLabel = t("coachRosterLegendBooked");
  const absentLabel = t("coachRosterLegendAbsent");
  const allowanceLabel = t("coachRosterLegendAllowance");

  return (
    <div className="w-full min-h-[280px]" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
          barCategoryGap="18%"
          barGap={4}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { fullName?: string } | undefined;
              return row?.fullName ?? "";
            }}
            formatter={(value, name, item) => {
              const key = String(name);
              const n = Number(value);
              if (key === allowanceLabel) {
                const configured = (item?.payload as { allowanceConfigured?: boolean })
                  ?.allowanceConfigured;
                return [configured ? n : "—", allowanceLabel];
              }
              return [n, key];
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
          />
          <Bar
            dataKey="booked"
            name={bookedLabel}
            fill={COLOR_BOOKED}
            radius={[0, 3, 3, 0]}
            maxBarSize={14}
          />
          <Bar
            dataKey="absent"
            name={absentLabel}
            fill={COLOR_ABSENT}
            radius={[0, 3, 3, 0]}
            maxBarSize={14}
          />
          <Bar
            dataKey="allowance"
            name={allowanceLabel}
            fill={COLOR_ALLOWANCE}
            stroke={COLOR_ALLOWANCE_STROKE}
            strokeWidth={1.5}
            radius={[0, 3, 3, 0]}
            maxBarSize={14}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
