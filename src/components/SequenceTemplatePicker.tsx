"use client";

import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { SequenceTemplateSummary } from "@/lib/firestore/sequence-templates";
import { cn } from "@/lib/utils";

type ProgramNameLookup = { id: string; name?: string };

export function buildAssignSequenceOptions(args: {
  defaultSequence: {
    id: string;
    sourceProgramIds: string[];
    sourceProgramNames: string[];
    sequenceRepeatCycles: number;
  } | null;
  programs: Array<Record<string, unknown> & { id: string }>;
  defaultOptionLabel: string;
  listTemplates: (
    programs: Array<Record<string, unknown> & { id: string }>
  ) => SequenceTemplateSummary[];
}): SequenceTemplateSummary[] {
  const { defaultSequence, programs, defaultOptionLabel, listTemplates } = args;
  const options: SequenceTemplateSummary[] = [];
  if (defaultSequence) {
    options.push({
      id: defaultSequence.id,
      name: defaultOptionLabel,
      sourceProgramIds: defaultSequence.sourceProgramIds,
      sourceProgramNames: defaultSequence.sourceProgramNames,
      sequenceRepeatCycles: defaultSequence.sequenceRepeatCycles,
    });
  }
  const templates = listTemplates(programs);
  const defaultId = defaultSequence?.id;
  for (const template of templates) {
    if (defaultId && template.id === defaultId) continue;
    options.push(template);
  }
  return options;
}

export function SequenceTemplatePicker({
  options,
  selectedId,
  onSelect,
  loading,
  assignablePrograms,
}: {
  options: SequenceTemplateSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  assignablePrograms: ProgramNameLookup[];
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{t("sequenceChooseToApply")}</Label>
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="space-y-2">
        <Label>{t("sequenceChooseToApply")}</Label>
        <p className="text-destructive text-xs">{t("defaultSequenceNotConfigured")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{t("sequenceChooseToApply")}</Label>
      <ul className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
        {options.map((option) => {
          const labels =
            option.sourceProgramNames.length > 0
              ? option.sourceProgramNames
              : option.sourceProgramIds.map(
                  (pid, idx) =>
                    assignablePrograms.find((p) => p.id === pid)?.name ??
                    option.sourceProgramNames[idx] ??
                    pid
                );
          const isSelected = selectedId === option.id;
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onSelect(option.id)}
                className={cn(
                  "w-full rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm text-left transition-colors",
                  isSelected ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted/50"
                )}
              >
                <p className="font-medium text-foreground truncate">{option.name}</p>
                <p className="text-muted-foreground leading-snug">{labels.join(" → ")}</p>
                <p className="text-xs text-muted-foreground">
                  {option.sequenceRepeatCycles}× {t("sequenceTemplateCycles")}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
