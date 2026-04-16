type ScoreBarProps = {
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  size?: "sm" | "md";
};

const gradeColor: Record<string, string> = {
  A: "bg-green-500",
  B: "bg-emerald-400",
  C: "bg-amber-400",
  D: "bg-orange-500",
  F: "bg-red-500",
};

const gradeTextColor: Record<string, string> = {
  A: "text-green-700 bg-green-50 border-green-200",
  B: "text-emerald-700 bg-emerald-50 border-emerald-200",
  C: "text-amber-700 bg-amber-50 border-amber-200",
  D: "text-orange-700 bg-orange-50 border-orange-200",
  F: "text-red-700 bg-red-50 border-red-200",
};

export function ScoreBar({ score, grade, size = "md" }: ScoreBarProps) {
  const barH = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`inline-flex h-6 w-7 items-center justify-center rounded-md border text-xs font-bold tabular-nums ${gradeTextColor[grade]}`}
      >
        {grade}
      </span>
      <div className="flex-1">
        <div className={`${barH} w-full overflow-hidden rounded-full bg-muted`}>
          <div
            className={`${barH} rounded-full transition-all duration-500 ${gradeColor[grade]}`}
            style={{ width: `${score}%` }}
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums">
        {score}
      </span>
    </div>
  );
}
