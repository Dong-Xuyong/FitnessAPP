"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

export type RosterMonthlySessionRow = {
  studentId: string;
  name: string;
  booked: number;
  absent: number;
  monthlyAllowance: number | null;
};

const COLOR_BOOKED = "bg-yellow-500";
const COLOR_ABSENT = "bg-destructive";
const COLOR_ALLOWANCE = "bg-neutral-900 dark:bg-neutral-100";

function niceMax(raw: number): number {
  if (raw <= 7) return 7;
  if (raw <= 14) return 14;
  if (raw <= 21) return 21;
  if (raw <= 28) return 28;
  return Math.ceil(raw / 7) * 7;
}

function tickValues(max: number): number[] {
  const step = max <= 14 ? 7 : Math.max(7, Math.round(max / 4));
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

function MetricBar({
  value,
  max,
  colorClass,
  label,
  displayValue,
}: {
  value: number;
  max: number;
  colorClass: string;
  label: string;
  displayValue: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="h-2.5 flex-1 min-w-0 rounded-sm bg-muted/60 overflow-hidden"
        title={`${label}: ${displayValue}`}
        aria-label={`${label}: ${displayValue}`}
      >
        <div
          className={`h-full rounded-sm ${colorClass} transition-[width] duration-200`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {displayValue}
      </span>
    </div>
  );
}

export function RosterMonthlySessionChart({ rows }: { rows: RosterMonthlySessionRow[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const scaleMax = useMemo(() => {
    let m = 1;
    for (const row of filtered) {
      m = Math.max(m, row.booked, row.absent, row.monthlyAllowance ?? 0);
    }
    return niceMax(m);
  }, [filtered]);

  const ticks = useMemo(() => tickValues(scaleMax), [scaleMax]);

  const bookedLabel = t("coachRosterLegendBooked");
  const absentLabel = t("coachRosterLegendAbsent");
  const allowanceLabel = t("coachRosterLegendAllowance");

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("coachRosterSearchPlaceholder")}
          aria-label={t("coachRosterSearchPlaceholder")}
        />
      </div>

      <div className="flex items-center gap-2 pl-[min(36%,9rem)] pr-9 text-[10px] text-muted-foreground tabular-nums">
        <div className="relative flex-1 h-4">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2"
              style={{ left: `${(tick / scaleMax) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
      </div>

      <div className="max-h-[min(70vh,560px)] overflow-y-auto overflow-x-hidden rounded-md border divide-y">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">{t("noStudentsFound")}</p>
        ) : (
          filtered.map((row) => {
            const allowanceText =
              row.monthlyAllowance != null ? String(row.monthlyAllowance) : "—";
            return (
              <Link
                key={row.studentId}
                href={`/students/${row.studentId}`}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors min-w-0"
              >
                <p className="w-[min(36%,9rem)] shrink-0 text-sm font-medium truncate" title={row.name}>
                  {row.name}
                </p>
                <div className="flex-1 min-w-0 space-y-1">
                  <MetricBar
                    value={row.booked}
                    max={scaleMax}
                    colorClass={COLOR_BOOKED}
                    label={bookedLabel}
                    displayValue={String(row.booked)}
                  />
                  <MetricBar
                    value={row.absent}
                    max={scaleMax}
                    colorClass={COLOR_ABSENT}
                    label={absentLabel}
                    displayValue={String(row.absent)}
                  />
                  <MetricBar
                    value={row.monthlyAllowance ?? 0}
                    max={scaleMax}
                    colorClass={COLOR_ALLOWANCE}
                    label={allowanceLabel}
                    displayValue={allowanceText}
                  />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
