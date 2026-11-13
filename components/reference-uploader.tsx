"use client";

import { useEffect, useRef, useState } from "react";
import type { ReferenceRole } from "@/lib/types";

export type LocalReference = {
  id: string;
  file: File;
  previewUrl: string;
  role: ReferenceRole;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf";

function isImage(file: File) {
  return file.type.startsWith("image/");
}

export default function ReferenceUploader({
  items,
  onChange,
  disabled,
}: {
  items: LocalReference[];
  onChange: (items: LocalReference[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [over, setOver] = useState(false);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList).filter(
      (file) => file.type.startsWith("image/") || file.type === "application/pdf" || /\.(png|jpe?g|webp|gif|pdf)$/i.test(file.name),
    );
    if (!incoming.length) return;
    const next = [...items];
    for (const file of incoming) {
      if (next.length >= 8) break;
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        role: "brand",
      });
    }
    onChange(next);
  }

  function setRole(id: string, role: ReferenceRole) {
    onChange(
      items.map((item) => {
        if (role === "start-image") {
          if (item.id === id && !isImage(item.file)) return item;
          return { ...item, role: item.id === id ? "start-image" : item.role === "start-image" ? "brand" : item.role };
        }
        return item.id === id ? { ...item, role } : item;
      }),
    );
  }

  function remove(id: string) {
    const found = items.find((item) => item.id === id);
    if (found) URL.revokeObjectURL(found.previewUrl);
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
          over ? "border-brass bg-panel-2" : "border-line bg-panel-2/50"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <p className="text-sm text-foreground">Drop images or files here</p>
        <p className="mt-1 text-xs text-muted">JPEG, PNG, WebP, GIF, or PDF · up to 8 files, 8MB each</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm hover:border-brass"
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2"
            >
              {isImage(item.file) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-12 w-12 rounded-md object-cover"
                />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-md border border-line font-mono text-[10px] text-muted">
                  FILE
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.file.name}</p>
                <select
                  value={item.role}
                  disabled={disabled}
                  onChange={(event) => setRole(item.id, event.target.value as ReferenceRole)}
                  className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1 text-xs"
                >
                  <option value="brand">Brand / inspiration</option>
                  <option value="start-image" disabled={!isImage(item.file)}>
                    Start image
                  </option>
                </select>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(item.id)}
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-bad hover:text-bad"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
