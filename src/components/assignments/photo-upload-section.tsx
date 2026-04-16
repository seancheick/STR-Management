"use client";

import { useRef, useState, useTransition } from "react";

import { uploadPhotoAction } from "@/app/(cleaner)/jobs/actions";
import type { AssignmentPhotoRecord } from "@/lib/queries/assignments";

const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

type PhotoUploadSectionProps = {
  assignmentId: string;
  requiredCategories: string[];
  uploadedCategories: string[];
  photos: AssignmentPhotoRecord[];
  readOnly: boolean;
};

export function PhotoUploadSection({
  assignmentId,
  requiredCategories,
  uploadedCategories,
  photos,
  readOnly,
}: PhotoUploadSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(
    requiredCategories[0] ?? "general",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  // Build display categories: required first, then a free-form "other" option
  const categories =
    requiredCategories.length > 0
      ? [...requiredCategories, "other"]
      : ["general", "before", "after", "issue", "other"];

  function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a photo first.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File is too large. Max ${MAX_SIZE_MB}MB.`);
      return;
    }

    setError(null);
    const formData = new FormData();
    formData.set("photo", file);
    formData.set("photoCategory", selectedCategory);
    formData.set("assignmentId", assignmentId);

    startTransition(async () => {
      const result = await uploadPhotoAction(assignmentId, formData);
      if (!result.success) {
        setError(result.error ?? "Upload failed.");
      } else if (fileRef.current) {
        fileRef.current.value = "";
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Photos</h2>

      {/* Required category status */}
      {requiredCategories.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {requiredCategories.map((cat) => {
            const done = uploadedCategories.includes(cat);
            return (
              <li
                key={cat}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  done
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-yellow-200 bg-yellow-50 text-yellow-700"
                }`}
              >
                {done ? "✓" : "○"} {cat}
              </li>
            );
          })}
        </ul>
      )}

      {/* Uploaded photos */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="rounded-xl border border-border/70 bg-muted/50 p-2 text-center"
            >
              <p className="text-xs font-medium text-muted-foreground">{photo.photo_category}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {photo.storage_path.split("/").pop()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      {!readOnly && photos.length < 10 && (
        <div className="rounded-[1.5rem] border border-border/70 bg-card p-5">
          <p className="mb-3 text-sm font-medium">Add photo ({photos.length}/10)</p>
          <div className="flex flex-col gap-3">
            <select
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
              onChange={(e) => setSelectedCategory(e.target.value)}
              value={selectedCategory}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <input
              accept="image/*"
              capture="environment"
              className="text-sm file:mr-3 file:rounded-full file:border file:border-border/70 file:px-3 file:py-1 file:text-xs file:font-medium"
              ref={fileRef}
              type="file"
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={isPending}
              onClick={handleUpload}
              type="button"
            >
              {isPending ? "Uploading…" : "Upload photo"}
            </button>
          </div>
        </div>
      )}

      {photos.length >= 10 && !readOnly && (
        <p className="text-sm text-muted-foreground">Maximum 10 photos reached.</p>
      )}
    </section>
  );
}
