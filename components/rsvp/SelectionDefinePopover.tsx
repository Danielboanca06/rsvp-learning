"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDefinitionLookup } from "@/lib/hooks/useDefinitionLookup";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { CheckIcon, SearchIcon, SparklesIcon, XIcon } from "@/components/ui/icons";

const MAX_LOOKUP_LENGTH = 100;
// Ask AI works on whole passages, not just dictionary-sized fragments.
const MAX_ASK_AI_LENGTH = 2000;
const CARD_HALF_WIDTH = 144;
const PILL_HALF_WIDTH = 88;
const VIEWPORT_MARGIN = 12;

function clampCenterX(centerX: number, halfWidth: number) {
  if (typeof window === "undefined") return centerX;
  return Math.min(
    Math.max(centerX, halfWidth + VIEWPORT_MARGIN),
    window.innerWidth - halfWidth - VIEWPORT_MARGIN
  );
}

export function SelectionDefinePopover({
  containerRef,
  documentId,
  chunkId,
  onAskAi,
}: {
  containerRef: RefObject<HTMLElement | null>;
  documentId?: string;
  chunkId?: string;
  /** When provided, the selection pill also offers "Ask AI" for the passage. */
  onAskAi?: (text: string) => void;
}) {
  const [pendingRect, setPendingRect] = useState<DOMRect | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [activeText, setActiveText] = useState("");
  const expandedRef = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const lookup = useDefinitionLookup(documentId, chunkId);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    function handleSelectionChange() {
      if (expandedRef.current) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPendingRect(null);
        return;
      }

      const text = selection.toString().trim();
      const maxLength = onAskAi ? MAX_ASK_AI_LENGTH : MAX_LOOKUP_LENGTH;
      if (!text || text.length > maxLength) {
        setPendingRect(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!containerRef.current || !anchorNode || !containerRef.current.contains(anchorNode)) {
        setPendingRect(null);
        return;
      }

      setPendingText(text);
      setPendingRect(selection.getRangeAt(0).getBoundingClientRect());
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef, onAskAi]);

  useEffect(() => {
    if (!expanded) return;

    function handlePointerDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        close();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  function close() {
    setExpanded(false);
    setAnchorRect(null);
    setPendingRect(null);
    window.getSelection()?.removeAllRanges();
    lookup.reset();
  }

  function handleDefineClick() {
    if (!pendingRect || !pendingText) return;
    setAnchorRect(pendingRect);
    setActiveText(pendingText);
    setExpanded(true);
    lookup.lookup(pendingText);
  }

  function handleAskAiClick() {
    if (!pendingText || !onAskAi) return;
    onAskAi(pendingText);
    setPendingRect(null);
    window.getSelection()?.removeAllRanges();
  }

  const rect = expanded ? anchorRect : pendingRect;
  if (!rect) return null;

  const canDefine = pendingText.length > 0 && pendingText.length <= MAX_LOOKUP_LENGTH;

  const showBelow = rect.top < 160;
  const verticalOffset = showBelow ? rect.bottom + 10 : rect.top - 10;

  return (
    <AnimatePresence>
      {!expanded ? (
        <motion.div
          key="pill"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.12 }}
          style={{
            top: verticalOffset,
            left: clampCenterX(rect.left + rect.width / 2, PILL_HALF_WIDTH),
          }}
          onPointerDown={(event) => event.preventDefault()}
          className={`fixed z-50 -translate-x-1/2 ${showBelow ? "" : "-translate-y-full"} flex items-center overflow-hidden rounded-full bg-foreground text-xs font-medium text-background shadow-lg`}
        >
          {canDefine && (
            <button
              type="button"
              onClick={handleDefineClick}
              className="flex items-center gap-1.5 px-3 py-1.5 transition-opacity hover:opacity-80"
            >
              <span className="inline-flex [&>svg]:h-3.5 [&>svg]:w-3.5">
                <SearchIcon />
              </span>
              Define
            </button>
          )}
          {onAskAi && (
            <>
              {canDefine && <span className="h-4 w-px bg-background/25" />}
              <button
                type="button"
                onClick={handleAskAiClick}
                className="flex items-center gap-1.5 px-3 py-1.5 transition-opacity hover:opacity-80"
              >
                <span className="inline-flex [&>svg]:h-3.5 [&>svg]:w-3.5">
                  <SparklesIcon />
                </span>
                Ask AI
              </button>
            </>
          )}
        </motion.div>
      ) : (
        <motion.div
          key="card"
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.12 }}
          style={{
            top: verticalOffset,
            left: clampCenterX(rect.left + rect.width / 2, CARD_HALF_WIDTH),
          }}
          className={`fixed z-50 w-72 -translate-x-1/2 ${showBelow ? "" : "-translate-y-full"} rounded-2xl border border-border bg-surface p-4 shadow-lg`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-lg italic tracking-tight">{activeText}</p>
            <button
              onClick={close}
              aria-label="Close"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
            >
              <XIcon />
            </button>
          </div>

          {lookup.loadingDefinition ? (
            <p className="mt-2 text-sm text-muted">Looking up definition...</p>
          ) : lookup.definition ? (
            <p className="mt-2 text-sm text-foreground/90">{lookup.definition}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-muted">No definition found. Add your own:</p>
              <Textarea
                value={lookup.manualDefinition}
                onChange={(event) => lookup.setManualDefinition(event.target.value)}
                placeholder="Enter a definition..."
                className="h-16 text-sm"
                autoFocus
              />
            </div>
          )}

          <Button
            icon={<CheckIcon />}
            loading={lookup.adding}
            disabled={
              lookup.added.has(activeText.toLowerCase()) ||
              (!lookup.definition && lookup.manualDefinition.trim().length === 0)
            }
            onClick={lookup.add}
            className="mt-3 h-9 w-full text-xs"
          >
            {lookup.added.has(activeText.toLowerCase()) ? "Added to Vocabulary" : "Add to Vocabulary"}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
