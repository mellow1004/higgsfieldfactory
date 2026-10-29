"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ASPECT_RATIOS,
  DURATIONS,
  MODELS,
  RESOLUTIONS,
  STYLE_PRESETS,
  TONES,
  coerceAspect,
  coerceDuration,
  coerceResolution,
  estimateCredits,
  getModel,
} from "@/lib/catalog";
import type { Job } from "@/lib/types";

type PublicJob = Job & { videoUrl: string | null; rawVideoUrl: string | null };

const emptyBrief = {
  brand: "",
  service: "",
  message: "",
  tone: "confident",
  model: "seedance-2.5",
  stylePreset: "cinematic",
  aspectRatio: "9:16" as const,
  duration: 5,
  resolution: "720p" as const,
};

export default function ProductionPanel({ username }: { username: string }) {
  const [brief, setBrief] = useState(emptyBrief);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const model = getModel(brief.model);
  const duration = coerceDuration(brief.model, brief.duration);
  const aspectRatio = coerceAspect(brief.model, brief.aspectRatio);
  const resolution = coerceResolution(brief.model, brief.resolution);
  const credits = estimateCredits({
    modelId: brief.model,
    duration,
    resolution,
  });

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeId) ?? jobs[0] ?? null,
    [jobs, activeId],
  );

  async function refreshJobs() {
    const response = await fetch("/api/jobs");
    if (!response.ok) return;
    const data = await response.json();
    setJobs(data.jobs);
  }

  useEffect(() => {
    refreshJobs();
    const timer = setInterval(refreshJobs, 2500);
    return () => clearInterval(timer);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStep("Queueing job");
    try {
      const created = await postJson<{ job: PublicJob }>("/api/jobs", {
        ...brief,
        duration,
        aspectRatio,
        resolution,
      });
      setActiveId(created.job.id);
      await refreshJobs();

      setStep("Writing copy");
      await postJson("/api/copy", { jobId: created.job.id });
      await refreshJobs();

      setStep("Generating clip");
      await postJson("/api/generate", { jobId: created.job.id });
      await refreshJobs();

      setStep("Composing branded cut");
      await postJson("/api/compose", { jobId: created.job.id });
      await refreshJobs();
      setStep("Done");
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Production failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="" width={44} height={44} />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-brass">
              Production floor
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Higgsfield Factory</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>
            Signed in as <span className="text-foreground">{username}</span>
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-line px-3 py-1.5 hover:border-brass"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Brief</h2>
              <p className="text-sm text-muted">
                Keys stay on the server. Generate runs copy → clip → ffmpeg compose.
              </p>
            </div>
            <CreditBadge credits={credits} modelLabel={model.label} />
          </div>

          <form onSubmit={onGenerate} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Brand">
                <input
                  required
                  value={brief.brand}
                  onChange={(event) => setBrief({ ...brief, brand: event.target.value })}
                  placeholder="Brand name"
                  className="field"
                />
              </Field>
              <Field label="Service / product">
                <input
                  required
                  value={brief.service}
                  onChange={(event) => setBrief({ ...brief, service: event.target.value })}
                  placeholder="What you sell"
                  className="field"
                />
              </Field>
            </div>
            <Field label="Message">
              <textarea
                required
                rows={4}
                value={brief.message}
                onChange={(event) => setBrief({ ...brief, message: event.target.value })}
                placeholder="The hook you want the ad to land."
                className="field resize-y"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tone">
                <select
                  value={brief.tone}
                  onChange={(event) => setBrief({ ...brief, tone: event.target.value })}
                  className="field"
                >
                  {TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {tone}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Style preset">
                <select
                  value={brief.stylePreset}
                  onChange={(event) => setBrief({ ...brief, stylePreset: event.target.value })}
                  className="field"
                >
                  {STYLE_PRESETS.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Model">
                <select
                  value={brief.model}
                  onChange={(event) => setBrief({ ...brief, model: event.target.value })}
                  className="field"
                >
                  {MODELS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">{model.description}</p>
              </Field>
              <Field label="Aspect ratio">
                <select
                  value={aspectRatio}
                  onChange={(event) =>
                    setBrief({
                      ...brief,
                      aspectRatio: event.target.value as typeof brief.aspectRatio,
                    })
                  }
                  className="field"
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <option
                      key={ratio}
                      value={ratio}
                      disabled={!(model.aspects as readonly string[]).includes(ratio)}
                    >
                      {ratio}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Duration">
                <select
                  value={duration}
                  onChange={(event) =>
                    setBrief({ ...brief, duration: Number(event.target.value) })
                  }
                  className="field"
                >
                  {DURATIONS.map((value) => (
                    <option
                      key={value}
                      value={value}
                      disabled={!(model.durations as readonly number[]).includes(value)}
                    >
                      {value}s
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Resolution">
                <select
                  value={resolution}
                  onChange={(event) =>
                    setBrief({
                      ...brief,
                      resolution: event.target.value as typeof brief.resolution,
                    })
                  }
                  className="field"
                >
                  {RESOLUTIONS.map((value) => (
                    <option
                      key={value}
                      value={value}
                      disabled={value === "1080p" && model.maxResolution === "720p"}
                    >
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {error ? <p className="text-sm text-bad">{error}</p> : null}

            <button
              disabled={busy}
              className="mt-1 rounded-xl bg-brass px-4 py-3 font-semibold text-[#1a1406] disabled:opacity-60"
            >
              {busy ? step || "Working…" : `Generate · ${credits} credits`}
            </button>
          </form>

          {activeJob?.finalVideoPath ? (
            <div ref={resultRef} className="mt-6 rounded-xl border border-line bg-panel-2 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-medium">Finished ad</h3>
                <a
                  href={activeJob.videoUrl ?? "#"}
                  download
                  className="rounded-md border border-brass px-3 py-1.5 text-sm text-brass"
                >
                  Download mp4
                </a>
              </div>
              <div className="flex justify-center overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  key={activeJob.videoUrl ?? activeJob.id}
                  src={activeJob.videoUrl ?? undefined}
                  controls
                  playsInline
                  preload="auto"
                  className="max-h-[360px] w-auto max-w-full"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    if (video.paused) void video.play();
                    else video.pause();
                  }}
                  className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brass"
                >
                  Play / pause
                </button>
                <span className="text-xs text-muted">
                  {activeJob.duration}s clip + end card
                </span>
              </div>
              {activeJob.headline ? (
                <p className="mt-3 text-sm text-muted">
                  {activeJob.eyebrow} · <span className="text-foreground">{activeJob.headline}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 md:p-6">
          <h2 className="text-lg font-semibold">Production board</h2>
          <p className="mb-4 text-sm text-muted">Shared across everyone signed in.</p>
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
                No jobs yet. Send a brief to start the line.
              </p>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setActiveId(job.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    job.id === activeJob?.id ? "border-brass bg-panel-2" : "border-line bg-panel-2/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{job.brand}</p>
                      <p className="text-sm text-muted">{job.service}</p>
                    </div>
                    <StatusPill status={job.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                    <span>{job.stage || job.status}</span>
                    <span>{job.model}</span>
                    <span>
                      {job.aspectRatio} · {job.duration}s · {job.resolution}
                    </span>
                    <span>{job.creditCost} cr</span>
                    {job.mocked ? <span>mock</span> : null}
                  </div>
                  {job.error ? <p className="mt-2 text-xs text-bad">{job.error}</p> : null}
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

function CreditBadge({ credits, modelLabel }: { credits: number; modelLabel: string }) {
  return (
    <div className="rounded-xl border border-brass/40 bg-panel-2 px-3 py-2 text-right">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass">
        Live estimate
      </p>
      <p className="text-2xl font-semibold leading-none">{credits}</p>
      <p className="text-[11px] text-muted">{modelLabel} credits</p>
    </div>
  );
}

function StatusPill({ status }: { status: PublicJob["status"] }) {
  const map = {
    queued: { label: "Queued", className: "text-warn border-warn/40" },
    generating: { label: "Generating", className: "text-ember border-ember/40" },
    done: { label: "Done", className: "text-ok border-ok/40" },
    error: { label: "Error", className: "text-bad border-bad/40" },
  } as const;
  const item = map[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${item.className}`}>
      {item.label}
    </span>
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
