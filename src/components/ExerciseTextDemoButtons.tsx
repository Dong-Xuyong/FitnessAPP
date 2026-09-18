"use client";

import { Button } from "@/components/ui/button";
import { CirclePlay } from "lucide-react";
import { normalizeExerciseKey } from "@/lib/last-session-performance";
import {
  findLibraryExercisesInText,
  type LibraryExerciseVideo,
} from "@/lib/find-library-exercises-in-text";

type ExerciseTextDemoButtonsProps = {
  /** Exercise title / free-form block text */
  title: string;
  /** Optional notes or prescribed plan text also scanned for matches */
  extraText?: string;
  libraryVideos: ReadonlyArray<LibraryExerciseVideo>;
  onSelect: (video: { title: string; url: string }) => void;
  watchDemoLabel: string;
  matchedDemosLabel: string;
  /** Icon button size next to the title when the title itself is a library exercise */
  exactButtonClassName?: string;
  exactIconClassName?: string;
};

/**
 * Shows:
 * 1) a play button when `title` exactly matches a library exercise
 * 2) named chips for any library exercises mentioned inside free-form text
 */
export function ExactExerciseDemoButton({
  title,
  libraryVideos,
  onSelect,
  watchDemoLabel,
  className = "h-7 w-7 -mt-1 shrink-0 text-primary hover:text-primary",
  iconClassName = "h-4 w-4",
}: {
  title: string;
  libraryVideos: ReadonlyArray<LibraryExerciseVideo>;
  onSelect: (video: { title: string; url: string }) => void;
  watchDemoLabel: string;
  className?: string;
  iconClassName?: string;
}) {
  const exact = libraryVideos.find(
    (entry) => normalizeExerciseKey(entry.name) === normalizeExerciseKey(title)
  );
  if (!exact) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={className}
      onClick={() => onSelect({ title: exact.name, url: exact.videoUrl })}
      title={watchDemoLabel}
      aria-label={`${watchDemoLabel}: ${exact.name}`}
    >
      <CirclePlay className={iconClassName} />
    </Button>
  );
}

export function MentionedExerciseDemoChips({
  title,
  extraText = "",
  libraryVideos,
  onSelect,
  watchDemoLabel,
  matchedDemosLabel,
}: ExerciseTextDemoButtonsProps) {
  const exactKey = normalizeExerciseKey(title);
  const mentioned = findLibraryExercisesInText(
    [title, extraText].filter(Boolean).join("\n"),
    libraryVideos
  ).filter((entry) => normalizeExerciseKey(entry.name) !== exactKey);

  if (mentioned.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {matchedDemosLabel}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {mentioned.map((demo) => (
          <Button
            key={`${demo.name}-${demo.videoUrl}`}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs text-primary"
            onClick={() => onSelect({ title: demo.name, url: demo.videoUrl })}
            title={`${watchDemoLabel}: ${demo.name}`}
            aria-label={`${watchDemoLabel}: ${demo.name}`}
          >
            <CirclePlay className="h-3.5 w-3.5" />
            {demo.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
