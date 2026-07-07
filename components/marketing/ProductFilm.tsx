"use client";

import { useEffect, useRef } from "react";

const CHAPTERS = [
  "Intro",
  "01 Speed Reading",
  "02 Active Recall",
  "03 Spaced Repetition",
  "04 Vocabulary",
  "05 Mastery",
  "Active Recall",
];

const DURATIONS = [4500, 7200, 7800, 7200, 6200, 6800, 5200];

const PASSAGE = [
  "Mitochondria",
  "convert",
  "glucose",
  "and",
  "oxygen",
  "into",
  "usable",
  "cellular",
  "energy",
  "through",
  "a",
  "process",
  "called",
  "respiration",
  "The",
  "cell",
  "captures",
  "that",
  "energy",
  "as",
  "ATP",
  "ready",
  "for",
  "instant",
  "use",
];

function sparkPath(data: number[], color: string, id: string): string {
  const width = 300;
  const height = 80;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => ({ x: i * stepX, y: height - ((v - min) / range) * (height - 8) - 4 }));
  const line = `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];
  return (
    `<path d="${area}" fill="${color}" fill-opacity="0.12" stroke="none" />` +
    `<path id="${id}" class="pf-spark-path" d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />` +
    `<circle cx="${last.x}" cy="${last.y}" r="3.5" fill="${color}" />`
  );
}

export function ProductFilm() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const scenes = Array.from(root.querySelectorAll<HTMLElement>(".pf-scene"));
    const chapterBtns = Array.from(root.querySelectorAll<HTMLButtonElement>(".pf-chapter-btn"));
    const chapterNameQuery = root.querySelector<HTMLElement>(".pf-chapter-name");
    const playToggleQuery = root.querySelector<HTMLButtonElement>(".pf-play-toggle");
    const playIconQuery = root.querySelector<HTMLElement>(".pf-play-icon");
    if (!chapterNameQuery || !playToggleQuery || !playIconQuery) return;
    const chapterNameEl = chapterNameQuery;
    const playToggle = playToggleQuery;
    const playIcon = playIconQuery;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let current = 0;
    let playing = true;
    let sceneStart = performance.now();
    let rafId = 0;

    let rsvpTimer: ReturnType<typeof setTimeout> | undefined;
    let rsvpWpmTimer: ReturnType<typeof setInterval> | undefined;
    let rsvpWordIdx = 0;
    let rsvpWpm = 220;
    let quizTimer: ReturnType<typeof setTimeout> | undefined;
    let vocabTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleRsvp() {
      const el = root!.querySelector<HTMLElement>(".pf-rsvp-word");
      const progressEl = root!.querySelector<HTMLElement>(".pf-progress-fill");
      if (!el || !progressEl) return;
      const word = PASSAGE[rsvpWordIdx % PASSAGE.length];
      const mid = Math.max(1, Math.floor(word.length * 0.38));
      el.innerHTML = `${word.slice(0, mid)}<span class="pf-pivot">${word.charAt(mid)}</span>${word.slice(mid + 1)}`;
      progressEl.style.width = `${((rsvpWordIdx % PASSAGE.length) / (PASSAGE.length - 1)) * 100}%`;
      rsvpWordIdx++;
      const delay = reduced ? 500 : Math.max(110, 60000 / rsvpWpm);
      rsvpTimer = setTimeout(scheduleRsvp, delay);
    }

    function startRsvp() {
      rsvpWordIdx = 0;
      rsvpWpm = 220;
      const wpmEl = root!.querySelector<HTMLElement>(".pf-wpm-value");
      if (wpmEl) wpmEl.textContent = String(rsvpWpm);
      scheduleRsvp();
      rsvpWpmTimer = setInterval(() => {
        rsvpWpm = Math.min(480, rsvpWpm + 22);
        if (wpmEl) wpmEl.textContent = String(rsvpWpm);
      }, 420);
    }

    function stopRsvp() {
      clearTimeout(rsvpTimer);
      clearInterval(rsvpWpmTimer);
    }

    function startQuiz() {
      const quizState = root!.querySelector<HTMLElement>(".pf-quiz-state");
      const feedbackState = root!.querySelector<HTMLElement>(".pf-feedback-state");
      if (!quizState || !feedbackState) return;
      quizState.classList.remove("pf-hidden");
      feedbackState.classList.remove("pf-shown");
      quizTimer = setTimeout(() => {
        quizState.classList.add("pf-hidden");
        feedbackState.classList.add("pf-shown");
      }, 2600);
    }

    function resetQuiz() {
      clearTimeout(quizTimer);
      root!.querySelector<HTMLElement>(".pf-quiz-state")?.classList.remove("pf-hidden");
      root!.querySelector<HTMLElement>(".pf-feedback-state")?.classList.remove("pf-shown");
    }

    function buildFsrsChart() {
      const svg = root!.querySelector<SVGSVGElement>(".pf-fsrs-svg");
      if (!svg) return;
      const h = 90;
      const reviews = [0, 26, 70, 150, 260];
      const xMax = 300;
      const parts: string[] = [];
      for (let r = 0; r < reviews.length - 1; r++) {
        const x0 = reviews[r];
        const x1 = Math.min(xMax, reviews[r + 1]);
        const pts: string[] = [];
        const steps = 24;
        for (let s = 0; s <= steps; s++) {
          const x = x0 + ((x1 - x0) * s) / steps;
          const t = (x - x0) / 40;
          const y = 8 + (h - 20) * (1 - Math.exp(-t * 0.9));
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        parts.push(`<path d="M${pts.join(" L")}" fill="none" stroke="var(--pf-border)" stroke-width="1.5" />`);
        parts.push(`<circle cx="${x0}" cy="8" r="3" fill="var(--pf-accent)" />`);
      }
      parts.push(`<circle cx="${reviews[reviews.length - 1]}" cy="8" r="3.5" fill="var(--pf-success)" />`);
      const labels = ["Today", "Day 3", "Day 9", "Day 23", "Next"];
      reviews.forEach((x, i) => {
        parts.push(`<text class="pf-fsrs-axis" x="${Math.min(x, 272)}" y="${h - 2}">${labels[i]}</text>`);
      });
      svg.innerHTML = parts.join("");
    }

    function startVocab() {
      const btn = root!.querySelector<HTMLButtonElement>(".pf-add-btn");
      if (!btn) return;
      btn.classList.remove("pf-added");
      btn.innerHTML = "＋ Add to vocabulary";
      vocabTimer = setTimeout(() => {
        btn.classList.add("pf-added");
        btn.innerHTML = "✓ Added to vocabulary";
      }, 2200);
    }

    function resetVocab() {
      clearTimeout(vocabTimer);
      const btn = root!.querySelector<HTMLButtonElement>(".pf-add-btn");
      if (!btn) return;
      btn.classList.remove("pf-added");
      btn.innerHTML = "＋ Add to vocabulary";
    }

    function buildSparklines() {
      const scoreSvg = root!.querySelector<SVGSVGElement>(".pf-spark-score");
      const wpmSvg = root!.querySelector<SVGSVGElement>(".pf-spark-wpm");
      if (scoreSvg) scoreSvg.innerHTML = sparkPath([48, 55, 52, 63, 71, 68, 79, 87], "var(--pf-accent)", "pf-p1");
      if (wpmSvg) wpmSvg.innerHTML = sparkPath([210, 230, 225, 260, 280, 300, 340, 360], "var(--pf-success)", "pf-p2");
    }

    function setSceneEffects(index: number, on: boolean) {
      if (index === 1) {
        if (on) startRsvp();
        else stopRsvp();
      }
      if (index === 2) {
        if (on) startQuiz();
        else resetQuiz();
      }
      if (index === 3 && on) buildFsrsChart();
      if (index === 4) {
        if (on) startVocab();
        else resetVocab();
      }
      if (index === 5 && on) buildSparklines();
    }

    function render() {
      scenes.forEach((el, i) => el.classList.toggle("pf-active", i === current));
      chapterBtns.forEach((btn, i) => {
        btn.classList.toggle("pf-done", i < current);
        const fill = btn.querySelector<HTMLElement>(".pf-fill");
        if (fill) fill.style.width = i < current ? "100%" : "0%";
      });
      chapterNameEl.textContent = CHAPTERS[current];
    }

    function goTo(index: number) {
      setSceneEffects(current, false);
      current = index;
      sceneStart = performance.now();
      render();
      setSceneEffects(current, true);
    }

    function advance() {
      setSceneEffects(current, false);
      current = (current + 1) % scenes.length;
      sceneStart = performance.now();
      render();
      setSceneEffects(current, true);
    }

    function tick(now: number) {
      if (playing) {
        const elapsed = now - sceneStart;
        const dur = DURATIONS[current];
        const fillEl = chapterBtns[current]?.querySelector<HTMLElement>(".pf-fill");
        if (fillEl) fillEl.style.width = `${Math.min(100, (elapsed / dur) * 100)}%`;
        if (elapsed >= dur) advance();
      }
      rafId = requestAnimationFrame(tick);
    }

    function handlePlayToggle() {
      playing = !playing;
      if (playing) {
        const fillEl = chapterBtns[current]?.querySelector<HTMLElement>(".pf-fill");
        const widthPct = fillEl ? parseFloat(fillEl.style.width || "0") : 0;
        sceneStart = performance.now() - (widthPct / 100) * DURATIONS[current];
      }
      playToggle.setAttribute("aria-label", playing ? "Pause" : "Play");
      playIcon.className = playing ? "pf-icon-pause pf-play-icon" : "pf-icon-play pf-play-icon";
      playIcon.innerHTML = playing ? "<span></span><span></span>" : "";
    }

    const chapterHandlers = chapterBtns.map((btn, i) => {
      const handler = () => goTo(i);
      btn.addEventListener("click", handler);
      return handler;
    });
    playToggle.addEventListener("click", handlePlayToggle);

    render();
    setSceneEffects(0, true);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(rsvpTimer);
      clearInterval(rsvpWpmTimer);
      clearTimeout(quizTimer);
      clearTimeout(vocabTimer);
      chapterBtns.forEach((btn, i) => btn.removeEventListener("click", chapterHandlers[i]));
      playToggle.removeEventListener("click", handlePlayToggle);
    };
  }, []);

  return (
    <div ref={containerRef} className="pf-root w-full">
      <style>{PRODUCT_FILM_CSS}</style>
      <div className="pf-stage">
        <div className="pf-frame">
          <div className="pf-ambient">
            <div className="pf-blob pf-blob-a" />
            <div className="pf-blob pf-blob-b" />
            <div className="pf-grain" />
          </div>

          <div className="pf-scene pf-scene-title pf-active" data-index={0}>
            <div className="pf-eyebrow">Active Recall</div>
            <h1 className="pf-headline">
              Read faster.
              <br />
              <em>Forget less.</em>
            </h1>
            <p className="pf-dek">
              A speed-reading trainer that quizzes you on what you just read — then makes sure it actually stuck.
            </p>
          </div>

          <div className="pf-scene" data-index={1}>
            <div className="pf-chapter-head">
              <span className="pf-chapter-num">01</span>
              <span className="pf-chapter-label">Speed Reading</span>
            </div>
            <h2 className="pf-headline pf-headline-sm">
              One word.
              <br />
              Full attention.
            </h2>
            <div className="pf-mock">
              <div className="pf-mock-topbar">
                <span>Chapter 4 — Cellular Respiration</span>
                <span className="pf-wpm-readout">
                  <b className="pf-wpm-value">220</b> WPM
                </span>
              </div>
              <div className="pf-rsvp-stage">
                <div className="pf-rsvp-guide" />
                <div className="pf-rsvp-word">Mitochondria</div>
              </div>
              <div className="pf-progress-track">
                <div className="pf-progress-fill" />
              </div>
            </div>
            <p className="pf-caption">
              Text streams one word at a time at a pace you control — no regressions, no skimming, no losing the
              thread.
            </p>
          </div>

          <div className="pf-scene" data-index={2}>
            <div className="pf-chapter-head">
              <span className="pf-chapter-num">02</span>
              <span className="pf-chapter-label">Active Recall</span>
            </div>
            <h2 className="pf-headline pf-headline-sm">
              Get it wrong,
              <br />
              and it asks why.
            </h2>
            <div className="pf-mock">
              <div className="pf-quiz-swap">
                <div className="pf-quiz-state">
                  <p className="pf-q-text">
                    What gas is consumed during cellular respiration to help convert glucose into usable energy?
                  </p>
                  <button className="pf-q-option" type="button">
                    Nitrogen
                  </button>
                  <button className="pf-q-option pf-wrong" type="button">
                    Carbon dioxide
                  </button>
                  <button className="pf-q-option" type="button">
                    Oxygen
                  </button>
                </div>
                <div className="pf-feedback-state">
                  <div className="pf-fb-card pf-fb-score">
                    <p>
                      Score: 62/100 — not quite there yet
                      <span>You picked carbon dioxide — that&apos;s a respiration byproduct, not an input.</span>
                    </p>
                  </div>
                  <div className="pf-fb-card pf-fb-think">
                    <p className="pf-label">Think about this</p>
                    <p className="pf-q">What does a cell actually need to pull energy out of glucose in the first place?</p>
                  </div>
                  <p className="pf-fb-note">Reading speed adjusted to 170 WPM so you can catch what you missed.</p>
                  <button className="pf-fb-btn" type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 12a9 9 0 0 1 15.3-6.4L21 8M21 8V3M21 8h-5"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Read Again
                  </button>
                </div>
              </div>
            </div>
            <p className="pf-caption">
              Every pass ends in a graded question. Miss it, and the tutor slows you down and probes the gap before
              you try again.
            </p>
          </div>

          <div className="pf-scene" data-index={3}>
            <div className="pf-chapter-head">
              <span className="pf-chapter-num">03</span>
              <span className="pf-chapter-label">Spaced Repetition</span>
            </div>
            <h2 className="pf-headline pf-headline-sm">
              Reviews land right
              <br />
              before you forget.
            </h2>
            <div className="pf-mock">
              <div className="pf-fsrs-callout">
                <span className="pf-fsrs-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 6v6l4 2"
                      stroke="var(--pf-accent-fg)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="9" stroke="var(--pf-accent-fg)" strokeWidth="2.4" />
                  </svg>
                </span>
                <div>
                  <strong>12 cards are due for review</strong>
                  <small>Spaced right at the edge of forgetting.</small>
                </div>
              </div>
              <div className="pf-fsrs-chart">
                <svg className="pf-fsrs-svg" viewBox="0 0 300 90" preserveAspectRatio="none" />
              </div>
            </div>
            <p className="pf-caption">
              An FSRS scheduler tracks each card&apos;s memory strength and re-queues it the moment retention starts
              to slip — not on a fixed calendar.
            </p>
          </div>

          <div className="pf-scene" data-index={4}>
            <div className="pf-chapter-head">
              <span className="pf-chapter-num">04</span>
              <span className="pf-chapter-label">Vocabulary</span>
            </div>
            <h2 className="pf-headline pf-headline-sm">
              Tap a word,
              <br />
              don&apos;t lose your place.
            </h2>
            <div className="pf-mock">
              <div className="pf-word-chips">
                <span className="pf-chip">glycolysis</span>
                <span className="pf-chip pf-selected">mitochondria</span>
                <span className="pf-chip">substrate</span>
                <span className="pf-chip">catalyze</span>
                <span className="pf-chip">byproduct</span>
              </div>
              <div className="pf-def-box">
                <span className="pf-term">mitochondria</span> — organelles that convert nutrients into ATP, the
                cell&apos;s usable energy currency.
              </div>
              <div className="pf-add-row">
                <button className="pf-add-btn" type="button">
                  ＋ Add to vocabulary
                </button>
              </div>
            </div>
            <p className="pf-caption">
              A lookup panel surfaces every unfamiliar word in the passage — so a hard word never breaks your reading
              streak.
            </p>
          </div>

          <div className="pf-scene" data-index={5}>
            <div className="pf-chapter-head">
              <span className="pf-chapter-num">05</span>
              <span className="pf-chapter-label">Mastery</span>
            </div>
            <h2 className="pf-headline pf-headline-sm">
              Speed and recall,
              <br />
              on one dashboard.
            </h2>
            <div className="pf-mock">
              <div className="pf-stat-row">
                <div className="pf-stat-tile">
                  <div className="pf-n">12</div>
                  <div className="pf-l">Documents</div>
                </div>
                <div className="pf-stat-tile">
                  <div className="pf-n">148</div>
                  <div className="pf-l">Attempts</div>
                </div>
                <div className="pf-stat-tile">
                  <div className="pf-n">87</div>
                  <div className="pf-l">Avg. score</div>
                </div>
              </div>
              <div className="pf-spark-row">
                <div className="pf-spark-card">
                  <div className="pf-l">Score history</div>
                  <svg className="pf-spark-score" viewBox="0 0 300 80" preserveAspectRatio="none" />
                </div>
                <div className="pf-spark-card">
                  <div className="pf-l">WPM history</div>
                  <svg className="pf-spark-wpm" viewBox="0 0 300 80" preserveAspectRatio="none" />
                </div>
              </div>
            </div>
            <p className="pf-caption">
              Every session feeds one dashboard, so mastery is never just a feeling — it&apos;s a line trending up.
            </p>
          </div>

          <div className="pf-scene pf-scene-outro" data-index={6}>
            <div className="pf-eyebrow">Active Recall</div>
            <h1 className="pf-wordmark">
              Read at the speed of thought.
              <br />
              <em>Remember at the speed of science.</em>
            </h1>
            <p className="pf-outro-fine">
              Built on <b>FSRS</b> spaced repetition, <b>Socratic</b> AI feedback, and a <b>model-agnostic</b> LLM
              gateway.
            </p>
          </div>
        </div>

        <div className="pf-playerbar">
          <button className="pf-play-toggle" aria-label="Pause" type="button">
            <span className="pf-icon-pause pf-play-icon">
              <span />
              <span />
            </span>
          </button>
          <div className="pf-chapters">
            {CHAPTERS.map((name) => (
              <button key={name} className="pf-chapter-btn" aria-label={`Go to ${name}`} type="button">
                <span className="pf-chapter-track">
                  <span className="pf-fill" />
                </span>
              </button>
            ))}
          </div>
          <span className="pf-chapter-name">Intro</span>
        </div>
      </div>
    </div>
  );
}

const PRODUCT_FILM_CSS = `
.pf-root {
  --pf-stage: oklch(12% 0.012 55);
  --pf-bg: oklch(20% 0.014 55);
  --pf-surface: oklch(24.5% 0.017 55);
  --pf-border: oklch(33% 0.021 55);
  --pf-border-soft: oklch(33% 0.021 55 / 55%);
  --pf-fg: oklch(92.5% 0.014 70);
  --pf-muted: oklch(66% 0.022 65);
  --pf-accent: oklch(72% 0.135 44);
  --pf-accent-soft: oklch(72% 0.135 44 / 16%);
  --pf-accent-fg: oklch(18% 0.018 50);
  --pf-success: oklch(70% 0.11 152);
  --pf-danger: oklch(69% 0.15 27);
  --pf-danger-soft: oklch(69% 0.15 27 / 15%);
  color-scheme: dark;
}

.pf-stage { width: 100%; max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.75rem; }

.pf-frame {
  position: relative;
  width: 100%;
  height: min(62.5vw, 650px);
  min-height: 320px;
  border-radius: 22px;
  overflow: hidden;
  background: var(--pf-bg);
  border: 1px solid var(--pf-border-soft);
  box-shadow: 0 40px 90px -30px oklch(0% 0 0 / 55%), 0 4px 24px -6px oklch(0% 0 0 / 35%);
  color: var(--pf-fg);
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
}

.pf-ambient { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
.pf-blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.5; will-change: transform; }
.pf-blob-a {
  width: 46%; aspect-ratio: 1; top: -14%; left: -8%;
  background: radial-gradient(circle, var(--pf-accent) 0%, transparent 70%);
  animation: pf-drift-a 26s ease-in-out infinite;
}
.pf-blob-b {
  width: 40%; aspect-ratio: 1; bottom: -16%; right: -6%;
  background: radial-gradient(circle, var(--pf-success) 0%, transparent 72%);
  opacity: 0.28;
  animation: pf-drift-b 32s ease-in-out infinite;
}
@keyframes pf-drift-a { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(6%, 8%) scale(1.12); } }
@keyframes pf-drift-b { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-8%, -6%) scale(1.08); } }
.pf-grain {
  position: absolute; inset: -20%; opacity: 0.05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.pf-scene {
  position: absolute; inset: 0; z-index: 1;
  display: flex; flex-direction: column; justify-content: center;
  padding: clamp(1.5rem, 5vw, 3.5rem);
  opacity: 0; transform: translateY(14px) scale(0.99);
  pointer-events: none;
  transition: opacity 0.7s cubic-bezier(.22,.61,.36,1), transform 0.8s cubic-bezier(.22,.61,.36,1);
}
.pf-scene.pf-active { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

.pf-eyebrow { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--pf-accent); }

.pf-headline {
  font-family: var(--font-display), serif; font-style: italic; font-weight: 560;
  line-height: 1.03; letter-spacing: -0.01em; text-wrap: balance;
  margin: 0.5rem 0 0; font-size: clamp(2.1rem, 5.4vw, 3.4rem);
}
.pf-headline em { color: var(--pf-accent); font-style: italic; }
.pf-headline-sm { font-size: clamp(1.5rem, 3.4vw, 2.15rem); margin-bottom: 1.3rem; }

.pf-dek { margin: 1rem 0 0; max-width: 34ch; color: var(--pf-muted); font-size: clamp(0.95rem, 1.6vw, 1.1rem); line-height: 1.5; }
.pf-caption { margin: 1.25rem 0 0; max-width: 46ch; color: var(--pf-muted); font-size: clamp(0.82rem, 1.3vw, 0.95rem); line-height: 1.55; }

.pf-chapter-head { display: flex; align-items: baseline; gap: 0.6rem; }
.pf-chapter-num { font-variant-numeric: tabular-nums; font-size: 0.78rem; font-weight: 700; color: var(--pf-accent); letter-spacing: 0.04em; }
.pf-chapter-label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--pf-muted); }

.pf-scene-title { align-items: flex-start; }
.pf-wordmark {
  font-family: var(--font-display), serif; font-style: italic; font-weight: 560;
  font-size: clamp(2.6rem, 7.2vw, 4.4rem); letter-spacing: -0.015em; line-height: 1; margin: 0.4rem 0 0;
}
.pf-wordmark em { color: var(--pf-accent); font-style: italic; }

.pf-mock {
  margin-top: 1.4rem; width: min(100%, 560px);
  background: var(--pf-surface); border: 1px solid var(--pf-border-soft); border-radius: 16px;
  box-shadow: 0 24px 48px -16px oklch(0% 0 0 / 40%), 0 4px 12px -4px oklch(0% 0 0 / 25%);
  padding: 1.5rem 1.6rem;
}
.pf-mock-topbar { display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: var(--pf-muted); letter-spacing: 0.01em; }
.pf-wpm-readout { font-variant-numeric: tabular-nums; color: var(--pf-fg); }
.pf-wpm-readout b { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-weight: 600; color: var(--pf-accent); }

.pf-rsvp-stage { position: relative; height: 6.5rem; display: flex; align-items: center; justify-content: center; margin: 0.9rem 0 1.1rem; }
.pf-rsvp-guide { position: absolute; top: 0.15rem; bottom: 0.15rem; width: 1px; background: linear-gradient(to bottom, transparent, var(--pf-accent-soft), transparent); }
.pf-rsvp-word { font-family: var(--font-sans), sans-serif; font-weight: 700; font-size: clamp(1.9rem, 4.6vw, 2.7rem); letter-spacing: -0.01em; color: var(--pf-fg); }
.pf-rsvp-word .pf-pivot { color: var(--pf-accent); }
.pf-progress-track { height: 0.4rem; width: 100%; border-radius: 999px; background: var(--pf-border-soft); overflow: hidden; }
.pf-progress-fill { height: 100%; width: 4%; border-radius: 999px; background: var(--pf-accent); transition: width 0.18s linear; }

.pf-quiz-swap { position: relative; margin-top: 1.1rem; min-height: 12.5rem; }
.pf-quiz-state, .pf-feedback-state { position: absolute; inset: 0; transition: opacity 0.55s ease, transform 0.6s cubic-bezier(.22,.61,.36,1); }
.pf-quiz-state { opacity: 1; transform: translateY(0); }
.pf-quiz-state.pf-hidden { opacity: 0; transform: translateY(-8px); pointer-events: none; }
.pf-feedback-state { opacity: 0; transform: translateY(10px); pointer-events: none; }
.pf-feedback-state.pf-shown { opacity: 1; transform: translateY(0); pointer-events: auto; }

.pf-q-text { font-size: 0.98rem; line-height: 1.5; margin: 0 0 1rem; }
.pf-q-option {
  display: block; width: 100%; text-align: left; padding: 0.7rem 0.9rem; margin-bottom: 0.55rem;
  border-radius: 10px; border: 1px solid var(--pf-border); background: transparent; color: var(--pf-fg);
  font-family: inherit; font-size: 0.86rem;
}
.pf-q-option.pf-wrong { border-color: oklch(69% 0.15 27 / 55%); background: var(--pf-danger-soft); color: var(--pf-danger); }

.pf-fb-card { border-radius: 12px; padding: 0.85rem 1rem; margin-bottom: 0.7rem; border: 1px solid transparent; }
.pf-fb-score { border-color: oklch(69% 0.15 27 / 35%); background: var(--pf-danger-soft); }
.pf-fb-score p { margin: 0; font-size: 0.86rem; font-weight: 600; color: var(--pf-danger); }
.pf-fb-score span { display: block; margin-top: 0.35rem; font-size: 0.8rem; font-weight: 400; color: var(--pf-fg); opacity: 0.9; }
.pf-fb-think { border-color: oklch(72% 0.135 44 / 35%); background: var(--pf-accent-soft); }
.pf-fb-think p.pf-label { margin: 0; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--pf-accent); }
.pf-fb-think p.pf-q { margin: 0.4rem 0 0; font-size: 0.85rem; color: var(--pf-fg); }
.pf-fb-note { font-size: 0.76rem; color: var(--pf-muted); margin: 0.2rem 0 0.9rem; }
.pf-fb-btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  background: var(--pf-accent); color: var(--pf-accent-fg);
  border: none; border-radius: 10px; padding: 0.65rem 1.15rem;
  font-size: 0.82rem; font-weight: 600; font-family: inherit; line-height: 1; cursor: pointer;
}

.pf-fsrs-callout {
  display: flex; align-items: center; gap: 0.85rem;
  border-radius: 14px; border: 1px solid oklch(72% 0.135 44 / 30%);
  background: var(--pf-accent-soft); padding: 0.9rem 1.1rem; margin-top: 1.1rem;
}
.pf-fsrs-icon { width: 2.4rem; height: 2.4rem; border-radius: 999px; background: var(--pf-accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.pf-fsrs-callout strong { font-size: 0.94rem; font-weight: 700; letter-spacing: -0.01em; }
.pf-fsrs-callout small { display: block; margin-top: 0.15rem; font-size: 0.78rem; color: var(--pf-muted); }
.pf-fsrs-chart { margin-top: 1rem; }
.pf-fsrs-chart svg { width: 100%; height: 6.4rem; overflow: visible; }
.pf-fsrs-axis { font-size: 0.62rem; fill: var(--pf-muted); font-family: var(--font-sans), sans-serif; }

.pf-word-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
.pf-chip { padding: 0.4rem 0.85rem; border-radius: 999px; border: 1px solid var(--pf-border); font-size: 0.78rem; color: var(--pf-muted); background: transparent; }
.pf-chip.pf-selected { border-color: var(--pf-accent); background: var(--pf-accent-soft); color: var(--pf-accent); font-weight: 600; }
.pf-def-box { margin-top: 1rem; border-radius: 12px; border: 1px solid var(--pf-border); background: var(--pf-bg); padding: 0.9rem 1rem; font-size: 0.85rem; color: var(--pf-fg); min-height: 3.6rem; line-height: 1.5; }
.pf-def-box .pf-term { color: var(--pf-accent); font-weight: 700; font-style: italic; font-family: var(--font-display), serif; }
.pf-add-row { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.9rem; }
.pf-add-btn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  border-radius: 10px; padding: 0.55rem 0.95rem; font-size: 0.8rem; font-weight: 600; font-family: inherit;
  border: 1px solid var(--pf-border); background: transparent; color: var(--pf-fg); cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
.pf-add-btn.pf-added { background: oklch(70% 0.11 152 / 15%); border-color: oklch(70% 0.11 152 / 45%); color: var(--pf-success); }

.pf-stat-row { display: flex; gap: 0.7rem; margin-top: 1rem; }
.pf-stat-tile { flex: 1; border-radius: 12px; border: 1px solid var(--pf-border-soft); background: var(--pf-bg); padding: 0.75rem 0.9rem; }
.pf-stat-tile .pf-n { font-family: ui-monospace, monospace; font-size: 1.3rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.pf-stat-tile .pf-l { font-size: 0.68rem; color: var(--pf-muted); letter-spacing: 0.03em; margin-top: 0.15rem; }
.pf-spark-row { display: flex; gap: 0.9rem; margin-top: 1rem; }
.pf-spark-card { flex: 1; border-radius: 12px; border: 1px solid var(--pf-border-soft); background: var(--pf-bg); padding: 0.75rem 0.9rem 0.5rem; }
.pf-spark-card .pf-l { font-size: 0.68rem; color: var(--pf-muted); margin-bottom: 0.3rem; }
.pf-spark-card svg { width: 100%; height: 3rem; overflow: visible; }
.pf-spark-path { stroke-dasharray: 400; stroke-dashoffset: 400; transition: stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1); }
.pf-scene.pf-active .pf-spark-path { stroke-dashoffset: 0; }

.pf-scene-outro { align-items: center; text-align: center; }
.pf-outro-fine { margin-top: 1.1rem; color: var(--pf-muted); font-size: 0.8rem; letter-spacing: 0.02em; }
.pf-outro-fine b { color: var(--pf-fg); font-weight: 600; }

.pf-playerbar { display: flex; align-items: center; gap: 0.9rem; padding: 0.55rem 0.7rem; border-radius: 14px; background: var(--pf-surface); border: 1px solid var(--pf-border-soft); }
.pf-play-toggle {
  flex-shrink: 0; width: 2.1rem; height: 2.1rem; border-radius: 999px;
  border: 1px solid var(--pf-border); background: var(--pf-bg);
  display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--pf-fg);
}
.pf-icon-play { width: 0; height: 0; border-style: solid; border-width: 5px 0 5px 8px; border-color: transparent transparent transparent currentColor; margin-left: 2px; }
.pf-icon-pause { width: 8px; height: 10px; display: flex; justify-content: space-between; }
.pf-icon-pause span { width: 3px; height: 100%; background: currentColor; border-radius: 1px; }

.pf-chapters { flex: 1; display: flex; gap: 0.35rem; }
.pf-chapter-btn { position: relative; flex: 1; height: 1.75rem; border: none; cursor: pointer; padding: 0; background: transparent; display: flex; align-items: center; }
.pf-chapter-track { position: relative; width: 100%; height: 0.34rem; border-radius: 999px; background: var(--pf-border); overflow: hidden; }
.pf-chapter-btn .pf-fill { position: absolute; inset: 0; width: 0%; background: var(--pf-accent); border-radius: 999px; }
.pf-chapter-btn.pf-done .pf-fill { width: 100%; }

.pf-chapter-name { flex-shrink: 0; font-size: 0.72rem; color: var(--pf-muted); letter-spacing: 0.03em; min-width: 8.5rem; text-align: right; font-variant-numeric: tabular-nums; }

.pf-root button { font-family: inherit; }
.pf-root button:focus-visible, .pf-chip:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .pf-blob { animation: none !important; }
  .pf-scene { transition: opacity 0.3s linear !important; transform: none !important; }
}

@media (max-width: 640px) {
  .pf-frame { height: min(144vw, 640px); min-height: 420px; }
  .pf-mock { padding: 1.1rem 1.2rem; }
  .pf-stat-row, .pf-spark-row { flex-direction: column; }
}
`;
