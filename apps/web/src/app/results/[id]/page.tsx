"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell, useSessionUser } from "@/components/app-shell";
import { BadgePanel } from "@/components/results/badge-panel";
import { InsightsPanel } from "@/components/results/insights-panel";
import { ReportActions } from "@/components/results/report-actions";
import { ClassCard } from "@/components/results/class-card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import {
  daysUntil,
  formatDate,
  getResult,
  readApiProblem,
  type ResultView,
} from "@/lib/assessments";

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "accent";
}) {
  const styles = {
    neutral: "bg-paper-soft text-ink-soft ring-line-strong",
    brand: "bg-brand-50 text-brand-700 ring-brand-200",
    accent: "bg-accent-100 text-accent-600 ring-accent-400/40",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

function CustomResultView({ result }: { result: ResultView }) {
  const custom = result.custom!;
  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="accent">Company assessment</Pill>
        {result.company && <Pill>{result.company}</Pill>}
      </div>
      <h1 className="mt-3 font-display text-4xl font-medium leading-tight sm:text-5xl">
        {result.assessment.name}
      </h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Completed {formatDate(result.completed_at)}
      </p>

      {result.company && (
        <Alert tone="info" className="mt-6">
          This result was taken through{" "}
          <strong className="font-semibold">{result.company}</strong>, so its
          administrators and HR can see it. Your other results stay private.
        </Alert>
      )}

      <section className="mt-8 py-6 sm:py-8 border-t border-line">
        <p className="text-sm text-ink-muted">Overall</p>
        <p className="mt-1 font-display text-5xl font-medium tabular-nums">
          {Math.round(custom.overall.score)}
          <span className="ml-2 text-lg font-normal text-ink-muted">
            / 100 · {custom.overall.level_label}
          </span>
        </p>
      </section>

      <ul className="mt-6 space-y-4">
        {custom.sections.map((s) => (
          <li key={s.key} className="p-6 rounded-xl bg-paper-soft">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl font-medium">{s.name}</h2>
              <p className="text-sm font-medium text-ink-soft">
                <span className="tabular-nums">{Math.round(s.score)}</span> /
                100 · {s.level_label}
              </p>
            </div>
            {s.description && (
              <p className="mt-1 text-sm text-ink-muted">{s.description}</p>
            )}
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-paper-soft"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${Math.max(2, Math.min(100, s.score))}%` }}
              />
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
              {s.text}
            </p>
          </li>
        ))}
      </ul>

      {result.disclaimer && (
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-ink-muted">
          {result.disclaimer}
        </p>
      )}
      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-8">
        <ButtonLink href="/results" variant="secondary">
          All my results
        </ButtonLink>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center px-3 text-[15px] font-medium text-ink-soft hover:text-ink"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}

function ResultFlow({ id }: { id: string }) {
  const [result, setResult] = useState<ResultView | null>(null);
  const [error, setError] = useState("");
  const user = useSessionUser();

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    getResult(id)
      .then(async (r) => {
        if (cancelled) return;
        setResult(r);
      })
      .catch((err) => {
        const problem = readApiProblem(err);
        if (!cancelled)
          setError(
            problem.status === 404
              ? "We couldn’t find that result."
              : problem.message,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Alert tone="error">{error}</Alert>
        <ButtonLink href="/results" variant="secondary">
          See all your results
        </ButtonLink>
      </div>
    );
  }

  if (!result) {
    return (
      <div
        className="h-[32rem] animate-pulse border-t border-line"
        aria-hidden="true"
      />
    );
  }

  if (result.kind === "custom" && result.custom)
    return <CustomResultView result={result} />;

  const stays =
    user.organizations?.find((o) => o.name === result.company)?.can_leave ===
    false;
  const retakeDays =
    result.retake && !result.retake.available
      ? daysUntil(result.retake.available_at)
      : null;
  const retakeRoute =
    result.assessment.type === "free_snapshot" ? "snapshot" : "full";

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center gap-2">
        {result.is_preview ? (
          <Pill tone="accent">Preview</Pill>
        ) : (
          <Pill tone="brand">Full assessment</Pill>
        )}
        {result.is_current ? (
          <Pill tone="brand">Latest result</Pill>
        ) : (
          <Pill>Earlier result</Pill>
        )}
      </div>
      <h1 className="mt-5 max-w-[18ch] font-display text-[2.6rem] font-extrabold leading-[1] tracking-[-0.045em] sm:text-6xl">
        {result.assessment.name}
      </h1>
      <p className="mt-4 text-[15px] text-ink-muted">
        Completed {formatDate(result.completed_at)} · Attempt{" "}
        {result.submission_number}
        {result.duration_seconds
          ? ` · ${Math.max(1, Math.round(result.duration_seconds / 60))} min`
          : ""}
      </p>

      {result.company && (
        <Alert tone="info" className="mt-6">
          This result was taken through{" "}
          <strong className="font-semibold">{result.company}</strong>, so its
          administrators and HR can see it. Your other results stay private.{" "}
          {stays
            ? "This account was created from the company’s invitation, so it stays with the company."
            : "You can stop sharing by leaving the company from your dashboard."}
        </Alert>
      )}

      {result.is_preview && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent-400/40 bg-accent-100/60 p-5">
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">
            <strong className="font-semibold text-ink">
              This is your free first read.
            </strong>{" "}
            It comes from ten questions, so treat it as a starting point. The
            full assessment adds 40 more questions, your full class profile, a
            written reading of every dimension, a report and a shareable badge.
          </p>
          <ButtonLink href="/assessments/full">
            Take the full assessment
          </ButtonLink>
        </div>
      )}

      {result.profile_class && (
        <div className="mt-12">
          <ClassCard
            profile={result.profile_class}
            tier={result.tier}
            early={result.is_preview}
          />
        </div>
      )}

      {
        <div className="mt-12 space-y-8">
          <InsightsPanel
            resultId={result.id}
            initial={result.insights}
            generatedAt={result.insights_generated_at}
            available={result.insights_available}
            snapshot={result.is_preview}
            onGenerated={(insights, generatedAt) =>
              setResult((r) =>
                r ? { ...r, insights, insights_generated_at: generatedAt } : r,
              )
            }
          />
          {!result.is_preview && (
            <div className="grid items-start gap-8 lg:grid-cols-2">
              <ReportActions resultId={result.id} />
              <BadgePanel resultId={result.id} firstName={user.first_name} />
            </div>
          )}
        </div>
      }

      {result.disclaimer && (
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-ink-muted">
          {result.disclaimer}
        </p>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-8">
        {result.retake?.available && (
          <ButtonLink href={`/assessments/${retakeRoute}`}>
            Take it again
          </ButtonLink>
        )}
        {retakeDays !== null && (
          <p className="text-sm text-ink-muted">
            You can take this again on {formatDate(result.retake!.available_at)}
            {retakeDays > 0
              ? ` (in ${retakeDays} ${retakeDays === 1 ? "day" : "days"})`
              : ""}
            , so your results stay comparable.
          </p>
        )}
        <div className="ml-auto flex gap-3">
          <ButtonLink href="/results" variant="secondary">
            All my results
          </ButtonLink>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center px-3 text-[15px] font-medium text-ink-soft hover:text-ink"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell>
      <ResultFlow id={id} />
    </AppShell>
  );
}
