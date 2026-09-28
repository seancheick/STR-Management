"use client";

import { useRef, useState, useTransition } from "react";

import { uploadPhotoAction } from "@/app/(cleaner)/jobs/actions";
import type { AssignmentPhotoRecord } from "@/lib/queries/assignments";

// Server Actions accept 4MB (next.config) and Vercel caps bodies at 4.5MB.
const MAX_SIZE_MB = 4;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const RESIZE_ABOVE_BYTES = 1024 * 1024;
const MAX_EDGE_PX = 2000;

/**
 * Phone photos are often 2-5MB. Re-encode large ones as a 2000px JPEG so they
 * fit the upload limit and send quickly on weak signal. Falls back to the
 * original file when the browser can't decode it (e.g. HEIC outside Safari).
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= RESIZE_ABOVE_BYTES || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

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
    const picked = fileRef.current?.files?.[0];
    if (!picked) {
      setError("Choose a photo first.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const file = await shrinkPhoto(picked);
      if (file.size > MAX_SIZE_BYTES) {
        setError(`File is too large. Max ${MAX_SIZE_MB}MB.`);
        return;
      }
      const formData = new FormData();
      formData.set("photo", file);
      formData.set("photoCategory", selectedCategory);
      formData.set("assignmentId", assignmentId);

      try {
        const result = await uploadPhotoAction(assignmentId, formData);
        if (!result.success) {
          setError(result.error ?? "Upload failed.");
        } else if (fileRef.current) {
          fileRef.current.value = "";
        }
      } catch {
        setError("Upload failed. Check your signal and try again.");
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
            <label className="sr-only" htmlFor="photo-category">
              Photo category
            </label>
            <select
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
              id="photo-category"
              onChange={(e) => setSelectedCategory(e.target.value)}
              value={selectedCategory}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="photo-file">
              Photo
            </label>
            <input
              accept="image/*"
              capture="environment"
              className="text-sm file:mr-3 file:rounded-full file:border file:border-border/70 file:px-4 file:py-2.5 file:text-sm file:font-medium"
              id="photo-file"
              ref={fileRef}
              type="file"
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
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
