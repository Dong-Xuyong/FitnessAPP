"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BLOCK_DURATION_OPTIONS,
  BLOCK_WEEKDAY_ORDER,
  BLOCK_WEEKDAY_SHORT,
  canonicalClockTime,
  formatBlockRuleDays,
  type BlockRule,
} from "@/lib/block-rules";

type Draft = {
  weekdays: string[];
  startTime: string;
  endTime: string;
  durationMin: number;
  maxStudents: number;
};

const EMPTY_DRAFT: Draft = {
  weekdays: [],
  startTime: "18:00",
  endTime: "19:00",
  durationMin: 60,
  maxStudents: 1,
};

type Props = {
  rules: BlockRule[];
  onChange: (rules: BlockRule[]) => void;
};

export function BlockRulesSettings({ rules, onChange }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError("");
  };

  const toggleDay = (day: string) => {
    setDraft((prev) => {
      const has = prev.weekdays.includes(day);
      const weekdays = has
        ? prev.weekdays.filter((item) => item !== day)
        : BLOCK_WEEKDAY_ORDER.filter((item) => item === day || prev.weekdays.includes(item));
      return { ...prev, weekdays };
    });
  };

  const startEdit = (rule: BlockRule) => {
    setEditingId(rule.id);
    setDraft({
      weekdays: [...rule.weekdays],
      startTime: rule.startTime,
      endTime: rule.endTime,
      durationMin: rule.durationMin,
      maxStudents: rule.maxStudents,
    });
    setFormError("");
    setFormOpen(true);
  };

  const commit = () => {
    if (draft.weekdays.length === 0) {
      setFormError("Escolhe pelo menos um dia.");
      return;
    }
    const startTime = canonicalClockTime(draft.startTime);
    const endTime = canonicalClockTime(draft.endTime);
    if (!startTime || !endTime) {
      setFormError("Indica a hora de início e de fim.");
      return;
    }
    if (endTime <= startTime) {
      setFormError("A hora de fim tem de ser depois da hora de início.");
      return;
    }
    if (!BLOCK_DURATION_OPTIONS.includes(draft.durationMin as (typeof BLOCK_DURATION_OPTIONS)[number])) {
      setFormError("Escolhe uma duração válida.");
      return;
    }
    const maxStudents = Math.min(20, Math.max(1, Math.floor(Number(draft.maxStudents) || 0)));
    if (maxStudents < 1) {
      setFormError("O máximo de alunos tem de ser entre 1 e 20.");
      return;
    }
    const nextRule: BlockRule = {
      id: editingId ?? crypto.randomUUID(),
      weekdays: BLOCK_WEEKDAY_ORDER.filter((day) => draft.weekdays.includes(day)),
      startTime,
      endTime,
      durationMin: draft.durationMin,
      maxStudents,
    };
    if (editingId) {
      onChange(rules.map((rule) => (rule.id === editingId ? nextRule : rule)));
    } else {
      onChange([...rules, nextRule]);
    }
    resetForm();
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold">Regras</p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          A primeira regra cujo dia e intervalo incluam o início do bloco define a duração e o
          máximo de alunos. Sem regra, usa-se a predefinição.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">Sem regras. Todos os blocos usam a predefinição.</p>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
          {rules.map((rule, index) => (
            <li key={rule.id} className="rounded-md border bg-background px-2 py-1.5">
              <div className="flex items-start gap-1">
                <p className="min-w-0 flex-1 text-[11px] leading-snug">
                  <span className="font-medium">{formatBlockRuleDays(rule)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {rule.startTime}–{rule.endTime} · {rule.durationMin} min · máx. {rule.maxStudents}
                  </span>
                </p>
                <div className="flex shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    aria-label="Subir regra"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    aria-label="Descer regra"
                    disabled={index === rules.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    aria-label="Editar regra"
                    onClick={() => startEdit(rule)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    aria-label="Apagar regra"
                    onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <p className="text-[11px] font-semibold">{editingId ? "Editar regra" : "Nova regra"}</p>
          <div className="space-y-1">
            <Label className="text-[11px]">Dias</Label>
            <div className="flex flex-wrap gap-1">
              {BLOCK_WEEKDAY_ORDER.map((day) => {
                const selected = draft.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "h-7 min-w-9 rounded-md border px-1.5 text-[11px] font-medium",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground"
                    )}
                  >
                    {BLOCK_WEEKDAY_SHORT[day]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]" htmlFor="block-rule-start">
                Início
              </Label>
              <Input
                id="block-rule-start"
                type="time"
                value={draft.startTime}
                onChange={(event) => setDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]" htmlFor="block-rule-end">
                Fim
              </Label>
              <Input
                id="block-rule-end"
                type="time"
                value={draft.endTime}
                onChange={(event) => setDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Duração</Label>
              <Select
                value={String(draft.durationMin)}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, durationMin: Number(value) }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_DURATION_OPTIONS.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]" htmlFor="block-rule-max">
                Máx. alunos
              </Label>
              <Input
                id="block-rule-max"
                type="number"
                min="1"
                max="20"
                value={draft.maxStudents}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    maxStudents: Math.min(20, Math.max(1, Math.floor(Number(event.target.value) || 1))),
                  }))
                }
                className="h-8 text-sm"
              />
            </div>
          </div>
          {formError ? <p className="text-[11px] text-destructive">{formError}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-8 flex-1 text-xs" onClick={commit}>
              {editingId ? "Atualizar regra" : "Adicionar regra"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full text-xs"
          onClick={() => {
            setEditingId(null);
            setDraft(EMPTY_DRAFT);
            setFormError("");
            setFormOpen(true);
          }}
        >
          Adicionar regra
        </Button>
      )}
    </div>
  );
}
