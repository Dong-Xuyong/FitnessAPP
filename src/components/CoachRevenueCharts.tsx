"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useI18n } from "@/lib/i18n";
import { parsePeriodYearMonth } from "@/lib/student-payment-due";
import type { ChartMonthPoint, CurrentPeriodMix, MethodMixRow } from "@/lib/coach-revenue";
import { paymentMethodLabel } from "@/components/student-billing/payment-method-label";

const MEMBERSHIP_COLOR = "hsl(var(--primary))";
const SHOP_COLOR = "hsl(var(--chart-2))";
const FORECAST_COLOR = "hsl(var(--chart-3))";
const PAID_COLOR = "hsl(142 46% 42%)";
const PENDING_COLOR = "hsl(38 92% 50%)";
const OVERDUE_COLOR = "hsl(var(--destructive))";
const METHOD_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const CHART_HEIGHT = "h-[min(40vh,320px)] w-full min-w-0 min-h-[220px] sm:min-h-[260px] sm:h-[320px]";
const PIE_HEIGHT = "h-[240px] w-full min-w-0";

function formatEuro(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `€${n.toFixed(2)}`;
}

function formatEuroValue(value: unknown): string {
  return formatEuro(Number(value));
}

export function formatRevenuePeriodLabel(period: string, locale: string): string {
  const parsed = parsePeriodYearMonth(period);
  if (!parsed) return period;
  return new Date(parsed.y, parsed.m - 1, 1).toLocaleDateString(locale === "pt" ? "pt-PT" : "en-US", {
    month: "short",
    year: "numeric",
  });
}

function ChartEmpty({ label, className = CHART_HEIGHT }: { label: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-lg overflow-hidden ${className}`}
    >
      {label}
    </div>
  );
}

export function CoachRevenueMonthlyChart({
  data,
  emptyLabel,
}: {
  data: ChartMonthPoint[];
  emptyLabel: string;
}) {
  const { t, locale } = useI18n();
  const labeled = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        label: formatRevenuePeriodLabel(row.period, locale),
      })),
    [data, locale]
  );
  const hasData = labeled.some((row) => row.membership > 0 || row.shop > 0 || row.forecast > 0);

  if (!hasData) return <ChartEmpty label={emptyLabel} />;

  return (
    <div className={`overflow-hidden ${CHART_HEIGHT}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={labeled} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={56} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `€${Number(v)}`}
            width={56}
          />
          <Tooltip
            formatter={(value, name) => {
              const n = Number(value);
              const label =
                name === "membership"
                  ? t("shopBillingMembership")
                  : name === "shop"
                    ? t("shopBillingShop")
                    : t("revenueForecast");
              return [Number.isFinite(n) ? formatEuro(n) : "—", label];
            }}
          />
          <Legend
            formatter={(value) =>
              value === "membership"
                ? t("shopBillingMembership")
                : value === "shop"
                  ? t("shopBillingShop")
                  : t("revenueForecast")
            }
          />
          <Bar dataKey="membership" stackId="collected" fill={MEMBERSHIP_COLOR} radius={[0, 0, 0, 0]} maxBarSize={36} />
          <Bar dataKey="shop" stackId="collected" fill={SHOP_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar dataKey="forecast" fill={FORECAST_COLOR} fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CoachRevenueMixChart({
  mix,
  emptyLabel,
}: {
  mix: CurrentPeriodMix;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const data = useMemo(
    () =>
      [
        { key: "paid", name: t("revenueMixPaid"), value: mix.paid, color: PAID_COLOR },
        { key: "pending", name: t("revenueMixPending"), value: mix.pending, color: PENDING_COLOR },
        { key: "overdue", name: t("revenueMixOverdue"), value: mix.overdue, color: OVERDUE_COLOR },
      ].filter((row) => row.value > 0),
    [mix, t]
  );

  if (data.length === 0) return <ChartEmpty label={emptyLabel} className={PIE_HEIGHT} />;

  return (
    <div className={`overflow-hidden ${PIE_HEIGHT}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
            {data.map((row) => (
              <Cell key={row.key} fill={row.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatEuroValue(value)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CoachRevenueMethodChart({
  rows,
  emptyLabel,
}: {
  rows: MethodMixRow[];
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const data = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        name: paymentMethodLabel(row.method, t),
      })),
    [rows, t]
  );

  if (data.length === 0) return <ChartEmpty label={emptyLabel} className={PIE_HEIGHT} />;

  return (
    <div className={`overflow-hidden ${PIE_HEIGHT}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="amount" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
            {data.map((row, i) => (
              <Cell key={row.method} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatEuroValue(value)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
