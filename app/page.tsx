"use client";

import { useCallback, useRef, useState } from "react";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("请上传 PDF 文件");
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const openPicker = () => inputRef.current?.click();

  const clearFile = () => {
    setFile(null);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100/80 px-4 py-16 sm:py-24">
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-900 transition-opacity duration-300 sm:text-4xl">
          智能答题挑战
        </h1>
        <p className="mt-3 text-center text-sm text-zinc-500">
          上传题目 PDF，准备开始答题
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          aria-hidden
          onChange={onInputChange}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={[
            "mt-12 w-full cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 ease-out",
            "outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2",
            isDragging
              ? "scale-[1.02] border-zinc-400 bg-white shadow-lg shadow-zinc-200/50"
              : "border-zinc-200 bg-white/60 backdrop-blur-sm hover:border-zinc-300 hover:bg-white/90",
          ].join(" ")}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-transform duration-300 ease-out group-hover:scale-105">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-zinc-800">
            拖拽 PDF 到此处，或{" "}
            <span className="text-zinc-900 underline decoration-zinc-300 underline-offset-2">
              点击选择文件
            </span>
          </p>
          <p className="mt-2 text-xs text-zinc-400">仅支持 .pdf</p>
        </div>

        <div
          className={`mt-4 min-h-[1.25rem] w-full text-center text-sm transition-opacity duration-300 ${
            error ? "text-red-600 opacity-100" : "opacity-0"
          }`}
          aria-live="polite"
        >
          {error ?? "\u00a0"}
        </div>

        <div
          className={`mt-2 w-full overflow-hidden transition-all duration-500 ease-out ${
            file ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {file && (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200/80 bg-white/90 px-5 py-4 shadow-sm backdrop-blur-sm">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-zinc-800">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
                >
                  移除
                </button>
              </div>
              <button
                type="button"
                className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-md transition-all duration-300 hover:bg-zinc-800 hover:shadow-lg active:scale-[0.98]"
              >
                开始答题
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
