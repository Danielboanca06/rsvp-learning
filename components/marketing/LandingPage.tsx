"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { ProductFilm } from "@/components/marketing/ProductFilm";
import {
  ArrowRightIcon,
  BrainIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  LayersIcon,
  RefreshIcon,
  SearchIcon,
  UploadIcon,
  ZapIcon,
} from "@/components/ui/icons";

function FullBleed({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("relative left-1/2 right-1/2 w-screen -mx-[50vw]", className)}>{children}</div>;
}

function SignUpCta({
  children,
  variant = "primary",
  icon,
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <SignUpButton mode="modal">
      <Button variant={variant} icon={icon} className={cn("w-auto px-7", className)}>
        {children}
      </Button>
    </SignUpButton>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{children}</span>;
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("flex flex-col gap-4", align === "center" ? "items-center text-center" : "items-start text-left")}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          "font-display text-3xl tracking-tight sm:text-4xl",
          align === "center" ? "max-w-2xl" : "max-w-xl"
        )}
      >
        {title}
      </h2>
      {description && <p className={cn("text-muted", align === "center" ? "max-w-xl" : "max-w-lg")}>{description}</p>}
    </div>
  );
}

function FeatureCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <p className="font-display text-lg italic tracking-tight">{title}</p>
      <p className="text-sm leading-relaxed text-muted">{children}</p>
    </Card>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-5 py-4">
      <span className="font-display text-2xl italic tracking-tight text-accent">{value}</span>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

function PricingCard({
  name,
  price,
  description,
  features,
  cta,
  highlighted = false,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta?: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col gap-5", highlighted && "border-accent/50 shadow-lg")}>
      <div>
        <p className="font-display text-xl italic tracking-tight">{name}</p>
        <p className="mt-1 font-display text-3xl italic tracking-tight">{price}</p>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-foreground/90">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {feature}
          </li>
        ))}
      </ul>
      {cta}
    </Card>
  );
}

export function LandingPage() {
  return (
    <div className="flex flex-col gap-24 pb-20">
      {/* Hero */}
      <section className="flex flex-col items-center gap-7 pt-4 text-center">
        <span className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Speed reading · AI-graded recall · Spaced repetition
        </span>
        <h1 className="max-w-3xl text-balance font-display text-4xl tracking-tight sm:text-5xl md:text-6xl">
          The reading app that makes sure it actually <em className="italic text-accent">sticks</em>.
        </h1>
        <p className="max-w-xl text-balance text-base text-muted sm:text-lg">
          Active Recall speed-reads any PDF or block of text, quizzes you on what you just read, and resurfaces it
          right before you&apos;d forget it — graded by AI, not multiple-choice guesswork.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <SignUpCta>Start free</SignUpCta>
          <Link href="#pricing" className="w-auto">
            <Button variant="secondary" className="w-auto px-7">
              See pricing
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted">No credit card needed · 30 free AI-graded actions every month</p>
      </section>

      {/* Product film */}
      <section className="flex flex-col items-center gap-3">
        <ProductFilm />
        <p className="text-xs text-muted">An actual walkthrough of the app — click a chapter to jump around.</p>
      </section>

      {/* Three layers of recall */}
      <section className="flex flex-col gap-10">
        <SectionHeading
          eyebrow="How it tests you"
          title="Three layers of active recall, every session"
          description="Most reading apps stop at highlighting. This one makes sure the material actually made it into your memory."
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <FeatureCard icon={<BrainIcon />} title="Summaries, graded on meaning">
            After every module, write what you remember in your own words. An LLM grades it 0–100 on comprehension,
            not phrasing — paraphrasing and typos are fine, missing the point isn&apos;t.
          </FeatureCard>
          <FeatureCard icon={<CheckIcon />} title="Quizzes that target your weak spots">
            Pop quizzes appear after modules, plus a daily quiz algorithmically weighted toward what you&apos;ve
            failed or forgotten most, mixed with what you learned in the last 24 hours.
          </FeatureCard>
          <FeatureCard icon={<SearchIcon />} title="Vocabulary you actually keep">
            Look up any word mid-read without losing your place. It&apos;s saved to your list and tested again
            later — recalled from memory, not just recognized from a list.
          </FeatureCard>
        </div>
      </section>

      {/* Socratic spotlight */}
      <section className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Eyebrow>Get it wrong, and it asks why</Eyebrow>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            No answer key. Just a nudge in the <em className="italic text-accent">right direction</em>.
          </h2>
          <p className="text-muted">
            Miss a summary and you don&apos;t just see a red X. You get a Socratic question that guides you back to
            what you missed, without handing you the answer — and your reading speed automatically drops so you can
            catch it on the reread.
          </p>
        </div>
        <Card className="flex flex-col gap-3">
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="text-sm font-medium text-danger">Score: 62/100 — not quite there yet</p>
            <p className="mt-1 text-sm text-foreground/90">
              You picked carbon dioxide — that&apos;s a respiration byproduct, not an input.
            </p>
          </div>
          <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">Think about this</p>
            <p className="mt-1 text-sm text-foreground/90">
              What does a cell actually need to pull energy out of glucose in the first place?
            </p>
          </div>
          <p className="text-xs text-muted">Reading speed adjusted to 170 WPM so you can catch what you missed.</p>
        </Card>
      </section>

      {/* Adaptive pace */}
      <section className="flex flex-col gap-10">
        <SectionHeading
          eyebrow="Your pace, tuned to you"
          title={
            <>
              Speeds you up when it&apos;s working. <em className="italic text-accent">Slows you down when it&apos;s not.</em>
            </>
          }
          description="There's no fixed target WPM. Every pass you nail nudges your speed up; every one you miss pulls it back — so you're always reading at the fastest pace you can still actually comprehend."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile value="+12%" label="Speed up on a pass" />
          <StatTile value="−12%" label="Slow down on a miss" />
          <StatTile value="120–700" label="WPM range, per document" />
          <StatTile value="2 modes" label="Flash or Paragraph" />
        </div>
        <p className="mx-auto max-w-xl text-center text-sm text-muted">
          Prefer to read normally instead of word-by-word? Toggle to Paragraph mode any time — same summaries,
          quizzes, and grading underneath, just a different way to take in the words.
        </p>
      </section>

      {/* FSRS spaced repetition */}
      <section className="flex flex-col gap-10">
        <SectionHeading
          eyebrow="Never forget what you learned"
          title={
            <>
              Reviews land <em className="italic text-accent">right before</em>
              {" "}you&apos;d forget.
            </>
          }
          description="Every module you pass gets scheduled for review using FSRS, the same forgetting-curve model behind modern spaced-repetition research — tuned per concept, per reader, targeting 90% retention rather than a fixed calendar."
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <FeatureCard icon={<ClockIcon />} title="Scheduled by memory, not a calendar">
            Each module tracks its own stability and difficulty. A concept you nailed resurfaces in weeks; one you
            struggled with comes back in days.
          </FeatureCard>
          <FeatureCard icon={<RefreshIcon />} title="Graded exactly like first-pass reading">
            Reviews run through the same summary-and-quiz loop as learning it the first time — no separate flashcard
            format to get used to.
          </FeatureCard>
          <FeatureCard icon={<ZapIcon />} title="Nudges you back, everywhere">
            A live badge in the nav and a dashboard callout — &quot;Spaced right at the edge of forgetting&quot; —
            keep due reviews impossible to miss.
          </FeatureCard>
        </div>
      </section>

      {/* Content ingestion + Spaces */}
      <section className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
        <div className="order-2 flex flex-col gap-4 md:order-1">
          <Eyebrow>Drop in anything</Eyebrow>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            From wall of text to <em className="italic text-accent">structured course</em>.
          </h2>
          <p className="text-muted">
            Upload a PDF or paste raw text and an LLM splits it into an ordered Learning Path of digestible
            modules — segmented where the topic actually shifts, preserving every word of the original. No naive
            paragraph splitting.
          </p>
          <p className="text-muted">
            Keep it organized in <strong className="font-medium text-foreground">Spaces</strong> — a language space,
            a work-research space, a book club space — each with its own progress, mastery tracking, and daily quiz.
          </p>
        </div>
        <div className="order-1 flex flex-col gap-4 md:order-2">
          <Card className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <UploadIcon />
            </span>
            <div>
              <p className="text-sm font-medium">Upload a PDF or paste text</p>
              <p className="text-xs text-muted">Any article, chapter, or document</p>
            </div>
          </Card>
          <div className="ml-5 h-6 w-px bg-border" />
          <Card className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <FileTextIcon />
            </span>
            <div>
              <p className="text-sm font-medium">AI builds your Learning Path</p>
              <p className="text-xs text-muted">Chunked into 80–300 word modules by topic</p>
            </div>
          </Card>
          <div className="ml-5 h-6 w-px bg-border" />
          <Card className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <LayersIcon />
            </span>
            <div>
              <p className="text-sm font-medium">Organized into a Space</p>
              <p className="text-xs text-muted">Its own mastery %, quiz, and history</p>
            </div>
          </Card>
        </div>
      </section>

      {/* Reliability */}
      <section className="flex flex-col items-center gap-6 text-center">
        <SectionHeading
          eyebrow="Built to never go down"
          title="Grading you can rely on, session after session"
          description="Every summary, quiz question, and vocabulary check is graded by a real model — with automatic failover across five providers, and a deterministic local fallback if every single one is unreachable."
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          {["Anthropic", "Gemini", "Groq", "Cerebras", "OpenRouter"].map((provider) => (
            <span
              key={provider}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted"
            >
              {provider}
            </span>
          ))}
        </div>
      </section>

      {/* Progress / gamification */}
      <section className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Eyebrow>Proof, not vibes</Eyebrow>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Watch two numbers <em className="italic text-accent">climb</em>.
          </h2>
          <p className="text-muted">
            Your dashboard charts reading speed and comprehension score over time, side by side — so getting faster
            and sharper is a line trending up, not a feeling.
          </p>
          <p className="text-muted">
            Every pass, review, quiz answer, and recalled word earns IQ Points, tracked on your profile and visible
            anywhere in the app.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatTile value="+10" label="IQ points / module passed" />
          <StatTile value="+15" label="IQ points / word recalled" />
          <StatTile value="+5" label="IQ points / review passed" />
          <StatTile value="+4" label="IQ points / quiz correct" />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="flex scroll-mt-24 flex-col gap-10">
        <SectionHeading eyebrow="Pricing" title="Start free. Upgrade only if you're reading a lot." />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <PricingCard
            name="Free"
            price="$0"
            description="Everything you need to try it for real."
            features={[
              "30 AI-graded actions every month",
              "Full FSRS spaced repetition",
              "Flash + Paragraph reading modes",
              "Unlimited Spaces & documents",
            ]}
            cta={<SignUpCta className="w-full">Start free</SignUpCta>}
          />
          <PricingCard
            highlighted
            name="Pro"
            price="Monthly credits"
            description="For daily readers who don't want to think about limits."
            features={[
              "200 AI credits every month",
              "No free-plan action caps",
              "Same grading, quizzes & FSRS",
              "Priority across all 5 providers",
            ]}
            cta={<SignUpCta className="w-full">Go Pro</SignUpCta>}
          />
          <PricingCard
            name="Top-ups"
            price="50 or 250 credits"
            description="Need more mid-month? Add credits any time, no subscription required."
            features={[
              "One-time purchase, no expiry pressure",
              "Stack on top of Free or Pro",
              "Manage anytime from Billing",
            ]}
          />
        </div>
      </section>

      {/* Final CTA */}
      <FullBleed className="bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-20 text-center">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Read at the speed of thought. <em className="italic text-accent">Remember at the speed of science.</em>
          </h2>
          <p className="max-w-lg text-muted">
            Built on FSRS spaced repetition, Socratic AI feedback, and a model-agnostic LLM gateway.
          </p>
          <SignUpCta className="px-8" icon={<ArrowRightIcon className="h-4 w-4" />}>
            Start free
          </SignUpCta>
        </div>
      </FullBleed>
    </div>
  );
}
