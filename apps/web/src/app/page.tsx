import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import { ClassEmblem } from "@/components/class-emblem";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { CLASS_LIST } from "@/lib/classes";
import { TRAITS } from "@/lib/traits";

const CTA = "Start free snapshot";

const steps = [
  {
    title: "Discover",
    desc: "Take the free 10-question snapshot. In about five minutes you get a short written analysis and your first class.",
  },
  {
    title: "Understand",
    desc: "Go deeper with the 50-question assessment: your full class and an AI-written reading of your results.",
  },
  {
    title: "Share",
    desc: "Create a badge and choose exactly which parts of your profile people can see.",
  },
  {
    title: "Connect",
    desc: "See which classes you pair well with, and how your style fits the people you work and live with.",
  },
];

const fullFeatures = [
  "50 questions, about 20 minutes",
  "Your full personality class, with who it pairs well with and a tier that grows as you do",
  "Written insights on communication, leadership, working style, relationships, strengths and blind spots",
  "A shareable badge with privacy controls you set",
  "Every result is kept, so you can see how you change over time",
];

const freeFeatures = [
  "10 questions, about 5 minutes",
  "A short written analysis of your personality",
  "Your first personality class and who it pairs well with",
  "No payment details needed",
];

const CLASS_INDENT = [0, 22, 6, 30, 12, 26, 4, 18];
const STEP_DROP = [0, 44, 12, 70];

/** A sample of the real badge, as the product shows it. */
function BadgeCard() {
  const sample = CLASS_LIST[0];
  const pairs = [CLASS_LIST[2], CLASS_LIST[1], CLASS_LIST[7]];
  return (
    <div className="relative mx-auto w-full max-w-[460px] lg:mr-0 lg:mt-4">
      <div>
        <div className="paper animate-fade-up rounded-[0.35rem] border border-line-strong px-6 pb-7 pt-6 sm:px-8">
          <div className="-mx-1 flex h-1.5" aria-hidden="true">
            {TRAITS.map((t, i) => (
              <span
                key={t.key}
                className="flex-1"
                style={{ backgroundColor: t.color, marginTop: i % 2 ? 1 : 0 }}
              />
            ))}
          </div>
          <p className="mt-5 text-sm font-medium text-ink-muted">
            Sample badge: personality class
          </p>
          <div className="mt-3 flex items-center gap-4">
            <ClassEmblem name={sample.key} className="h-28 w-28 shrink-0" />
            <div>
              <p className="font-display text-[2rem] font-extrabold leading-none tracking-[-0.04em]">
                {sample.name}
              </p>
              <p className="mt-2 text-[17px] leading-snug text-ink-soft">
                {sample.tagline}
              </p>
            </div>
          </div>
          <div className="mt-6 border-t border-dashed border-line-strong pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Pairs well with
            </p>
            <ul className="mt-3 grid grid-cols-3 gap-3">
              {pairs.map((p) => (
                <li
                  key={p.key}
                  className="flex flex-col items-center text-center"
                >
                  <ClassEmblem name={p.key} className="h-12 w-12" />
                  <span className="mt-1 text-[12.5px] font-semibold leading-tight">
                    {p.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="flex-1 overflow-x-clip">
        {/* Hero: the headline runs wide and low on the left, the badge sits high and crooked on the right */}
        <section className="mx-auto grid max-w-6xl items-start gap-14 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[1.45fr_0.8fr] lg:gap-10 lg:pb-32 lg:pt-20">
          <div className="animate-fade-up lg:pt-10">
            <h1 className="max-w-[16ch] font-display text-[2.9rem] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[4.6rem]">
              Understand your personality. Share it your way.
            </h1>

            <p className="mt-7 max-w-md text-[1.05rem] leading-[1.7] text-ink-soft">
              A science-based personality assessment that places you in a class,
              shows who you pair well with, and gives you a badge that shows
              only what you choose.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-4">
              <ButtonLink href="/auth/signup" size="lg" className="h-14 px-9 text-lg shadow-lift">
                {CTA}
                <ArrowRight
                  className="h-4 w-4"
                  weight="bold"
                  aria-hidden="true"
                />
              </ButtonLink>
              <ButtonLink href="/auth/login" variant="ghost" size="lg">
                Sign in
              </ButtonLink>
            </div>
          </div>

          <BadgeCard />
        </section>

        {/* Classes: a narrow note on the left, eight classes set in a loose, staggered column */}
        <section id="classes" className="relative scroll-mt-16 bg-paper-soft">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-20 sm:px-8 lg:grid-cols-[2fr_3fr] lg:gap-24">
            <div className="reveal relative lg:sticky lg:top-28 lg:self-start">
              <h2 className="font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em]">
                Eight personality classes, none better than another
              </h2>
              <p className="mt-5 max-w-[40ch] text-[1.05rem] leading-[1.75] text-ink-soft">
                Each class is a different way of being at your best, and each has
                others it tends to work well with.
              </p>
            </div>

            <ul className="grid gap-x-8 sm:grid-cols-2">
              {CLASS_LIST.map((c, i) => (
                <li
                  key={c.key}
                  className="reveal flex items-start gap-4 border-t border-line-strong py-6"
                  style={{
                    marginTop: i % 2 ? 22 : 0,
                    marginLeft: CLASS_INDENT[i],
                  }}
                >
                  <ClassEmblem name={c.key} className="h-16 w-16 shrink-0" />
                  <div>
                    <h3 className="font-display text-[1.35rem] font-bold leading-tight tracking-[-0.03em]">
                      {c.name}
                    </h3>
                    <p className="mt-1 text-[16px] leading-snug text-ink-soft">
                      {c.tagline}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works: four steps at different heights, like notes pinned in a row */}
        <section
          id="how-it-works"
          className="mx-auto max-w-6xl scroll-mt-16 px-5 py-24 sm:px-8"
        >
          <h2 className="reveal max-w-2xl font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Four steps from a free snapshot to a badge you control
          </h2>

          <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="reveal"
                style={{ marginTop: STEP_DROP[i] }}
              >
                <span
                  className="font-display text-[4rem] font-extrabold leading-none tabular-nums text-accent-500"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <h3 className="mt-2 font-display text-xl font-bold tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="mt-2 text-[15px] leading-[1.7] text-ink-muted">
                  {step.desc}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Free vs full: a plain sheet beside a dark one that is cut at the corner */}
        <section id="plans" className="scroll-mt-16 bg-paper-soft">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
            <h2 className="reveal max-w-2xl font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em]">
              A free 10-question snapshot, or the full 50-question assessment
            </h2>

            <div className="mt-14 grid items-start gap-10 lg:grid-cols-[2fr_3fr]">
              <article className="reveal flex flex-col border-t-2 border-ink pt-7 lg:mt-12">
                <h3 className="text-lg font-semibold text-ink-soft">Free snapshot</h3>
                <p className="mt-1 font-display text-5xl font-extrabold tracking-[-0.04em]">
                  Free
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {freeFeatures.map((f) => (
                    <li
                      key={f}
                      className="flex gap-3 text-[15px] leading-snug text-ink-soft"
                    >
                      <Check
                        className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
                        weight="bold"
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <ButtonLink
                  href="/auth/signup"
                  variant="secondary"
                  size="lg"
                  className="mt-8 w-full"
                >
                  {CTA}
                </ButtonLink>
              </article>

              <article
                className="reveal flex flex-col bg-brand-900 p-8 text-white sm:p-10"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 38px) 0, 100% 38px, 100% 100%, 0 100%)",
                  borderRadius: "0.35rem",
                }}
              >
                <h3 className="text-lg font-semibold text-brand-100">
                  Full assessment
                </h3>
                <p className="mt-1 font-display text-5xl font-extrabold tracking-[-0.04em] text-white">
                  Go deeper
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {fullFeatures.map((f) => (
                    <li
                      key={f}
                      className="flex gap-3 text-[15px] leading-snug text-brand-100"
                    >
                      <Check
                        className="mt-0.5 h-5 w-5 shrink-0 text-accent-400"
                        weight="bold"
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <ButtonLink
                    href="/auth/signup"
                    variant="onDark"
                    size="lg"
                    className="w-full"
                  >
                    {CTA}
                  </ButtonLink>
                  <p className="mt-3 text-center text-[14px] text-brand-200">
                    Pricing will be announced before launch.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Closing: a line set large, with a loop drawn round the question */}
        <section className="mx-auto max-w-6xl px-5 py-28 sm:px-8">
          <div className="reveal flex flex-col items-start justify-between gap-10 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <h2 className="font-display text-[2.8rem] font-extrabold leading-[1] tracking-[-0.045em] sm:text-6xl">
                Take the free snapshot: ten questions, five minutes
              </h2>
              <p className="mt-8 max-w-md text-[1.05rem] leading-[1.7] text-ink-soft">
                You get a short written analysis and your first personality class.
              </p>
            </div>
            <ButtonLink href="/auth/signup" size="lg" className="h-14 shrink-0 px-9 text-lg shadow-lift">
              {CTA}
              <ArrowRight
                className="h-4 w-4"
                weight="bold"
                aria-hidden="true"
              />
            </ButtonLink>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
