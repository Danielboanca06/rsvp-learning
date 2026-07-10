"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentCard, type DocumentStat } from "./DocumentCard";

const FADE = "24px";

// Builds the fade mask so it only appears on edges that actually have more
// content to scroll to — a static right-edge fade over a card with nowhere
// further to go reads as a rendering bug rather than a scroll affordance.
function buildFadeMask(canScrollLeft: boolean, canScrollRight: boolean): string | undefined {
  if (!canScrollLeft && !canScrollRight) return undefined;
  const left = canScrollLeft ? `transparent 0, black ${FADE}` : "black 0";
  const right = canScrollRight ? `black calc(100% - ${FADE}), transparent 100%` : "black 100%";
  return `linear-gradient(to right, ${left}, ${right})`;
}

export function DocumentCarousel({ documents }: { documents: DocumentStat[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateFade() {
      const { scrollLeft, scrollWidth, clientWidth } = el!;
      setCanScrollLeft(scrollLeft > 1);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }

    updateFade();
    el.addEventListener("scroll", updateFade, { passive: true });
    const resizeObserver = new ResizeObserver(updateFade);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFade);
      resizeObserver.disconnect();
    };
  }, [documents.length]);

  const mask = buildFadeMask(canScrollLeft, canScrollRight);

  return (
    <div
      ref={scrollRef}
      className="flex gap-4 overflow-x-auto px-1 pb-2 [scroll-snap-type:x_mandatory]"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {documents.map((document) => (
        <div
          key={document.id}
          className="w-[260px] shrink-0 transition-transform duration-200 ease-out hover:-translate-y-0.5 [scroll-snap-align:start]"
        >
          <DocumentCard document={document} />
        </div>
      ))}
    </div>
  );
}
