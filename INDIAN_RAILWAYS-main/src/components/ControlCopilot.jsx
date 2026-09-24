/**
 * ControlCopilot.jsx — Railway Control Copilot
 *
 * Natural-language interface for Control Officers querying the BANDHAN
 * block scheduling engine. Supports English, Hindi, and Hinglish.
 *
 * Architecture:
 *   1. UNDERSTAND  — classify intent + extract entities (no LLM, keyword rules)
 *   2. RETRIEVE    — call real tool endpoints (rejection_reason, nearest_window,
 *                    simulate_shift, schedule_context)
 *   3. EXPLAIN     — format grounded response, mirror the officer's language
 *
 * All facts come from tool results. No hallucination. Numbers copied verbatim.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  copilotRejectionReason,
  copilotNearestWindow,
  copilotSimulateShift,
  copilotScheduleContext,
} from "../api.js";

// ─── Intent classification ────────────────────────────────────────────────────

const INTENTS = {
  WHY_REJECTED:   "WHY_REJECTED",
  NEAREST_WINDOW: "NEAREST_WINDOW",
  WHAT_IF:        "WHAT_IF",
  CONTEXT:        "CONTEXT",
  OFF_TOPIC:      "OFF_TOPIC",
};

const WHY_PATTERNS = [
  /\b(why|kyun|kyon|reject|nahi|nahin|schedule|place|block.*reject|reject.*block)\b/i,
  /\b(क्यों|kyun|reject|नहीं)\b/i,
];
const WINDOW_PATTERNS = [
  /\b(next|nearest|agla|kab|when|window|time|slot|feasible|available)\b/i,
  /\b(अगला|कब|window|time)\b/i,
];
const WHATIF_PATTERNS = [
  /\b(shift|move|agar|what\s*if|2\s*hour|ghante|aage|peeche|piche|delay|change|khisak|khisakao)\b/i,
  /\b(घंटे|आगे|पीछे|shift|move)\b/i,
];
const CONTEXT_PATTERNS = [
  /\b(show|list|section|trains|schedule|context|dikh|batao|tell|status|kya)\b/i,
];
const OFF_TOPIC_PATTERNS = [
  /\b(weather|cricket|food|recipe|movie|news|joke|politics|stock|price|dollar)\b/i,
];

// Extract block_id: looks for patterns like BLK_001, DEF_123, TASK_5, or bare numbers
const BLOCK_RE = /\b((?:BLK|DEF|TASK|DEFECT|BLOCK)[_-]?\d+|\b\d{3,6})\b/i;
// Extract section_id: SEC_001, SEC01, or bare "section 1"
const SECTION_RE = /\b(SEC[_-]?\d+|section\s*\d+)\b/i;
// Extract delta_hours (e.g. "2 hours", "2 ghante", "+3", "-4h")
const DELTA_RE = /([+-]?\d+(?:\.\d+)?)\s*(?:h(?:our)?s?|ghante?|hr?s?)/i;
// Direction words (peeche = back = negative)
const BACK_RE = /\b(peeche|piche|back|minus|nahi aage)\b/i;

function detectLanguage(text) {
  // Simple heuristic: Devanagari characters → Hindi/Hinglish
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  // Common Hindi/Hinglish words without Devanagari
  if (/\b(kyun|kyon|kab|aage|peeche|ghante|nahi|nahin|batao|dikh|agar|hai|hain|yeh|woh)\b/i.test(text)) return "hi-en";
  return "en";
}

function classifyIntent(text) {
  if (OFF_TOPIC_PATTERNS.some((p) => p.test(text)))  return INTENTS.OFF_TOPIC;
  if (WHATIF_PATTERNS.some((p) => p.test(text)))     return INTENTS.WHAT_IF;
  if (WHY_PATTERNS.some((p) => p.test(text)))        return INTENTS.WHY_REJECTED;
  if (WINDOW_PATTERNS.some((p) => p.test(text)))     return INTENTS.NEAREST_WINDOW;
  if (CONTEXT_PATTERNS.some((p) => p.test(text)))    return INTENTS.CONTEXT;
  return INTENTS.CONTEXT; // safe default
}

function extractEntities(text) {
  const blockMatch   = text.match(BLOCK_RE);
  const sectionMatch = text.match(SECTION_RE);
  const deltaMatch   = text.match(DELTA_RE);

  let deltaHours = deltaMatch ? parseFloat(deltaMatch[1]) : null;
  if (deltaHours !== null && BACK_RE.test(text) && deltaHours > 0) {
    deltaHours = -deltaHours;
  }
  // Normalise section: "section 1" → "SEC_0001"
  let sectionId = sectionMatch
    ? sectionMatch[1].replace(/section\s*/i, "SEC_").replace(/SEC-?(\d+)/i, (_, n) => `SEC_${n.padStart(4, "0")}`)
    : null;

  return {
    blockId:    blockMatch   ? blockMatch[1].toUpperCase() : null,
    sectionId,
    deltaHours,
  };
}

// ─── Response formatters (grounded — only use data from tool results) ─────────

function fmtTime(t) {
  if (!t) return "—";
  return String(t).replace("T", " ").replace(/:\d\d\.\d+$/, "").replace(/:\d\d$/, "");
}

function formatRejectionReason(data, lang) {
  const sec    = data.section_id || "—";
  const trains = (data.trains_occupying || []).join(", ") || "none";
  const nxt    = data.next_feasible_window || {};
  const window = nxt.window_start ? `${nxt.window_start} – ${nxt.window_end}` : "not found";
  const impact = nxt.predicted_train_impact_min ?? "—";
  const dept   = data.department || "—";
  const constraint = data.constraint_fired || "—";

  if (lang === "en") return {
    direct: `Block **${data.block_id}** ${data.status === "unscheduled" ? "was not placed in the 7-day plan" : "had its shift rejected"} on section ${sec}. Next feasible window: ${window}.`,
    evidence: [
      `Constraint fired: \`${constraint}\``,
      `Trains occupying section: ${trains || "none recorded"}`,
      `Department: ${dept}`,
      ...(data.severity_grade ? [`Severity grade: ${data.severity_grade}`] : []),
      ...(data.gap_fit_score  ? [`Gap-fit score: ${Number(data.gap_fit_score).toFixed(3)}`] : []),
      `Next feasible window: ${window}`,
      `Predicted train impact at next window: ${impact} min`,
    ],
    recommendation: nxt.window_start
      ? `Move block to ${window}. Predicted impact: ${impact} min — ${Number(impact) < 15 ? "low-traffic window." : "moderate-traffic window, confirm with Control Room."}`
      : "No free window found in 7-day horizon — escalate for manual scheduling.",
  };

  // Hinglish / Hindi
  return {
    direct: `Block **${data.block_id}** ${data.status === "unscheduled" ? "7-day plan mein nahi aaya" : "ka shift reject hua"} — section ${sec} par. Agla feasible window: ${window}.`,
    evidence: [
      `Constraint: \`${constraint}\``,
      `Section mein trains: ${trains || "koi nahi"}`,
      `Department: ${dept}`,
      ...(data.severity_grade ? [`Severity grade: ${data.severity_grade}`] : []),
      `Agla window: ${window}`,
      `Train impact: ${impact} min`,
    ],
    recommendation: nxt.window_start
      ? `Block ko ${window} par move karo. Impact: ${impact} min — ${Number(impact) < 15 ? "feasible hai." : "moderate traffic, Control Room se confirm karo."}`
      : "7-day horizon mein koi free window nahi — manually schedule karo.",
  };
}

function formatNearestWindow(data, lang) {
  const sec    = data.section_id || "—";
  const nxt    = data.nearest_window || {};
  const window = nxt.window_start ? `${nxt.window_start} – ${nxt.window_end}` : "not found";
  const impact = nxt.predicted_train_impact_min ?? "—";
  const daytime_count = data.train_count_daytime ?? "—";
  const daytime_trains = (data.trains_in_primary_daytime_window || []).join(", ") || "none";
  const dur    = data.duration_hours ? `${data.duration_hours}h possession` : "";

  if (lang === "en") return {
    direct: `Nearest feasible window for ${data.block_id ? `block **${data.block_id}**` : `section **${sec}**`}: **${window}** (${dur}).`,
    evidence: [
      `Section: ${sec}`,
      `Duration needed: ${data.duration_hours ?? "—"} h`,
      `Window: ${window}`,
      `Predicted train impact: ${impact} min`,
      `Trains in primary daytime window (08:00–20:00): ${daytime_count} — ${daytime_trains}`,
    ],
    recommendation: nxt.window_start
      ? `Feasible — schedule at ${window}. Expected impact: ${impact} min.`
      : "No feasible window in 7-day horizon.",
  };

  return {
    direct: `${data.block_id ? `Block **${data.block_id}**` : `Section **${sec}**`} ke liye agla feasible window: **${window}**.`,
    evidence: [
      `Section: ${sec}`,
      `Duration: ${data.duration_hours ?? "—"} h`,
      `Window: ${window}`,
      `Train impact: ${impact} min`,
      `Daytime trains (08:00–20:00): ${daytime_count} — ${daytime_trains}`,
    ],
    recommendation: nxt.window_start
      ? `${window} par schedule karo. Impact: ${impact} min — feasible hai.`
      : "7-day horizon mein koi window nahi.",
  };
}

function formatSimulateShift(data, lang) {
  const origW = data.original_window || {};
  const shftW = data.shifted_window  || {};
  const feasible = data.feasible;
  const depts = (data.affected_departments || []).join(", ") || "—";

  if (lang === "en") return {
    direct: `WHAT-IF: shifting block **${data.block_id}** by **${data.delta_hours > 0 ? "+" : ""}${data.delta_hours}h**. ${data.verdict}`,
    evidence: [
      `Original window: ${origW.start || "—"} – ${origW.end || "—"}`,
      `Shifted window:  ${shftW.start || "—"} – ${shftW.end || "—"}`,
      `Conflicts:       ${data.conflicts_before} → ${data.conflicts_after}`,
      `Avg train delay: ${data.avg_delay_before_min} → ${data.avg_delay_after_min} min`,
      `Trains before: ${(data.trains_before || []).join(", ") || "none"}`,
      `Trains after:  ${(data.trains_after  || []).join(", ") || "none"}`,
      `Affected departments: ${depts}`,
      `Feasibility: ${feasible ? "✓ Feasible" : "✗ Not feasible"}`,
    ],
    recommendation: feasible
      ? `Shift approved — no conflicts at shifted window.`
      : `Not recommended — ${data.trains_after?.length || 0} train(s) conflict at shifted window, delay increases ${data.avg_delay_before_min} → ${data.avg_delay_after_min} min.`,
  };

  return {
    direct: `WHAT-IF: Block **${data.block_id}** ko **${data.delta_hours > 0 ? "+" : ""}${data.delta_hours}h** shift karo. ${data.verdict}`,
    evidence: [
      `Original window: ${origW.start || "—"} – ${origW.end || "—"}`,
      `Shifted window:  ${shftW.start || "—"} – ${shftW.end || "—"}`,
      `Conflicts: ${data.conflicts_before} → ${data.conflicts_after}`,
      `Avg delay: ${data.avg_delay_before_min} → ${data.avg_delay_after_min} min`,
      `Trains before: ${(data.trains_before || []).join(", ") || "koi nahi"}`,
      `Trains after:  ${(data.trains_after  || []).join(", ") || "koi nahi"}`,
      `Departments: ${depts}`,
      `Feasibility: ${feasible ? "✓ Feasible hai" : "✗ Feasible nahi"}`,
    ],
    recommendation: feasible
      ? `Shift karo — shifted window mein koi conflict nahi.`
      : `Not recommended — ${data.trains_after?.length || 0} train(s) conflict, delay badhega ${data.avg_delay_before_min} → ${data.avg_delay_after_min} min.`,
  };
}

function formatContext(data, lang) {
  const sec    = data.section_id || "—";
  const meta   = data.section_meta || {};
  const trains = (data.trains || []).slice(0, 8).map((t) => t.train_no || t.train_name || "?").join(", ");
  const blocks = (data.blocks || []).slice(0, 5).map((b) => `${b.task_id} (${b.department}, ${fmtTime(b.start_time)})`).join("; ");

  if (lang === "en") return {
    direct: `Section **${sec}** context: ${data.train_count} trains, ${data.block_count} maintenance blocks scheduled.`,
    evidence: [
      `Section: ${sec} | Traffic class: ${meta.traffic_class || "—"} | Tracks: ${meta.num_tracks || "—"}`,
      `Trains (up to 8): ${trains || "none"}`,
      `Scheduled blocks (up to 5): ${blocks || "none"}`,
    ],
    recommendation: null,
  };

  return {
    direct: `Section **${sec}** ki context: ${data.train_count} trains, ${data.block_count} maintenance blocks scheduled hain.`,
    evidence: [
      `Section: ${sec} | Traffic: ${meta.traffic_class || "—"} | Tracks: ${meta.num_tracks || "—"}`,
      `Trains (up to 8): ${trains || "koi nahi"}`,
      `Blocks (up to 5): ${blocks || "koi nahi"}`,
    ],
    recommendation: null,
  };
}

// ─── Core dispatch ────────────────────────────────────────────────────────────

async function dispatch(text, contextSectionId, contextBlockId) {
  const lang   = detectLanguage(text);
  const intent = classifyIntent(text);
  const { blockId: extractedBlock, sectionId: extractedSection, deltaHours } = extractEntities(text);

  // Resolve: prefer extracted → context fallback
  const blockId   = extractedBlock   || contextBlockId   || null;
  const sectionId = extractedSection || contextSectionId || null;

  if (intent === INTENTS.OFF_TOPIC) {
    return {
      intent,
      lang,
      formatted: {
        direct: lang === "en"
          ? "I can only help with block scheduling and maintenance planning questions."
          : "Main sirf block scheduling aur maintenance planning ke sawaalon mein madad kar sakta hoon.",
        evidence: [],
        recommendation: null,
      },
      raw: null,
    };
  }

  // Missing entity handling — one clarifying question max
  if (intent === INTENTS.WHAT_IF && !blockId) {
    return {
      intent, lang,
      formatted: {
        direct: lang === "en"
          ? "Which block do you want to shift? Please provide a block ID (e.g. BLK_001)."
          : "Kaunsa block shift karna hai? Block ID batao (e.g. BLK_001).",
        evidence: [], recommendation: null,
      },
      raw: null,
    };
  }
  if (intent === INTENTS.WHY_REJECTED && !blockId && !sectionId) {
    return {
      intent, lang,
      formatted: {
        direct: lang === "en"
          ? "Which block or section? Provide a block ID or section ID."
          : "Kaunsa block ya section? Block ID ya section ID batao.",
        evidence: [], recommendation: null,
      },
      raw: null,
    };
  }

  // Tool calls
  let raw, formatted;

  if (intent === INTENTS.WHY_REJECTED) {
    if (!blockId) throw new Error("block_id required for WHY_REJECTED");
    raw = await copilotRejectionReason(blockId, sectionId);
    formatted = formatRejectionReason(raw, lang);
  } else if (intent === INTENTS.NEAREST_WINDOW) {
    raw = await copilotNearestWindow(blockId, sectionId);
    formatted = formatNearestWindow(raw, lang);
  } else if (intent === INTENTS.WHAT_IF) {
    const delta = deltaHours ?? 2;
    raw = await copilotSimulateShift(blockId, delta, sectionId);
    formatted = formatSimulateShift(raw, lang);
  } else {
    // CONTEXT
    const sec = sectionId || "SEC_0001";
    raw = await copilotScheduleContext(sec);
    formatted = formatContext(raw, lang);
  }

  return { intent, lang, formatted, raw };
}

// ─── Component ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: "Why rejected?",    text: "Why was BLK_001 rejected?" },
  { label: "Next window",      text: "Next feasible window for SEC_0001?" },
  { label: "WHAT-IF +2h",      text: "Shift BLK_002 by 2 hours?" },
  { label: "Section context",  text: "Show schedule context for SEC_0001" },
  { label: "Hinglish example", text: "SEC_0002 ka agla window kab hai?" },
];

export default function ControlCopilot({ sectionId = "SEC_0001", blockId = null, initialOpen = false }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [showTeaser, setShowTeaser] = useState(true);
  const [messages, setMessages] = useState([
    {
      role: "system",
      text: "Railway Control Copilot ready. Ask in English, Hindi, or Hinglish.",
      intent: null,
      evidence: [],
      recommendation: null,
      raw: null,
    },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [rawOpen, setRawOpen] = useState(null); // index of expanded raw panel
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll when messages update
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Support global custom event to open copilot from anywhere
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setShowTeaser(false);
    };
    window.addEventListener("open-control-copilot", handleOpen);
    return () => window.removeEventListener("open-control-copilot", handleOpen);
  }, []);

  const handleReset = () => {
    setMessages([
      {
        role: "system",
        text: "Railway Control Copilot ready. Ask in English, Hindi, or Hinglish.",
        intent: null,
        evidence: [],
        recommendation: null,
        raw: null,
      },
    ]);
    setInput("");
    setRawOpen(null);
  };

  const submit = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const result = await dispatch(trimmed, sectionId, blockId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:           result.formatted.direct,
          intent:         result.intent,
          evidence:       result.formatted.evidence,
          recommendation: result.formatted.recommendation,
          raw:            result.raw,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          text: err.message.startsWith("Tool call failed:") ? err.message : `Tool call failed: ${err.message}`,
          intent: null, evidence: [], recommendation: null, raw: null,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [sectionId, blockId, loading]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
  };

  return (
    <div className="copilot-floating-wrapper" aria-label="Railway Control Copilot Widget">
      {/* ── Chat Window ────────────────────────────────────────────── */}
      {isOpen && (
        <div className="copilot-window" role="dialog" aria-modal="true" aria-label="Railway Control Copilot Chat">
          {/* ── Header ── */}
          <div className="copilot-header">
            <div className="copilot-avatar-wrap">
              <span className="copilot-logo">🚆</span>
              <span className="copilot-pulse-dot" />
            </div>
            <div className="copilot-header-info">
              <div className="copilot-title">Railway Control Copilot</div>
              <div className="copilot-subtitle">
                Section: <code>{sectionId}</code>
                {blockId && <> &nbsp;|&nbsp; Block: <code>{blockId}</code></>}
              </div>
            </div>
            <div className="copilot-header-actions">
              <div className="copilot-badge">LIVE ENGINE</div>
              <button
                className="copilot-header-btn"
                onClick={handleReset}
                title="Restart conversation"
                aria-label="Restart conversation"
              >
                ↻
              </button>
              <button
                className="copilot-header-btn"
                onClick={() => setIsOpen(false)}
                title="Minimize chat"
                aria-label="Close copilot"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Suggestions ── */}
          <div className="copilot-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s.label} className="copilot-chip" onClick={() => submit(s.text)}>
                {s.label}
              </button>
            ))}
          </div>

          {/* ── Message thread ── */}
          <div className="copilot-thread">
            {messages.map((m, i) => (
              <div key={i} className={`copilot-msg copilot-msg-${m.role}`}>
                {m.role === "user" && (
                  <div className="copilot-bubble copilot-bubble-user">{m.text}</div>
                )}

                {m.role === "system" && (
                  <div className="copilot-system">{m.text}</div>
                )}

                {m.role === "error" && (
                  <div className="copilot-bubble copilot-bubble-error">⚠ {m.text}</div>
                )}

                {m.role === "assistant" && (
                  <div className="copilot-bubble copilot-bubble-assistant">
                    {/* Direct answer */}
                    <div className="copilot-direct" dangerouslySetInnerHTML={{ __html: mdBold(m.text) }} />

                    {/* Intent badge */}
                    {m.intent && (
                      <span className={`copilot-intent-badge copilot-intent-${m.intent.toLowerCase()}`}>
                        {m.intent.replace("_", " ")}
                      </span>
                    )}

                    {/* Evidence */}
                    {m.evidence?.length > 0 && (
                      <div className="copilot-evidence">
                        <div className="copilot-evidence-label">Evidence</div>
                        <ul>
                          {m.evidence.map((e, j) => (
                            <li key={j} dangerouslySetInnerHTML={{ __html: mdCode(e) }} />
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendation */}
                    {m.recommendation && (
                      <div className="copilot-recommendation">
                        <span className="copilot-rec-label">Recommendation</span> {m.recommendation}
                      </div>
                    )}

                    {/* Raw tool output toggle */}
                    {m.raw && (
                      <button
                        className="copilot-raw-toggle"
                        onClick={() => setRawOpen(rawOpen === i ? null : i)}
                      >
                        {rawOpen === i ? "Hide" : "Show"} raw tool output
                      </button>
                    )}
                    {rawOpen === i && m.raw && (
                      <pre className="copilot-raw">{JSON.stringify(m.raw, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="copilot-msg copilot-msg-assistant">
                <div className="copilot-bubble copilot-bubble-assistant copilot-loading">
                  <span className="copilot-dot" /><span className="copilot-dot" /><span className="copilot-dot" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input area ── */}
          <div className="copilot-input-row">
            <textarea
              ref={inputRef}
              className="copilot-input"
              rows={2}
              placeholder="Ask in English, Hindi, or Hinglish…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button
              className="copilot-send"
              onClick={() => submit(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              {loading ? "…" : "▶"}
            </button>
          </div>
          <div className="copilot-footer">
            All facts sourced from live engine tool calls. Numbers verbatim from tool output.
          </div>
        </div>
      )}

      {/* ── Circular Hanging Trigger Button (FAB) & Teaser ───────────── */}
      <div className="copilot-fab-area">
        {!isOpen && showTeaser && (
          <div
            className="copilot-teaser"
            onClick={() => {
              setIsOpen(true);
              setShowTeaser(false);
            }}
            role="button"
            tabIndex={0}
            aria-label="Ask Railway Copilot"
          >
            <div className="copilot-teaser-pulse" />
            <div className="copilot-teaser-content">
              <span className="copilot-teaser-title">Rail Copilot</span>
              <span className="copilot-teaser-sub">Ask in English, हिन्दी, or Hinglish</span>
            </div>
            <button
              type="button"
              className="copilot-teaser-close"
              onClick={(e) => {
                e.stopPropagation();
                setShowTeaser(false);
              }}
              title="Dismiss teaser"
              aria-label="Dismiss teaser"
            >
              ✕
            </button>
          </div>
        )}

        <button
          type="button"
          className={`copilot-fab ${isOpen ? "copilot-fab-open" : ""}`}
          onClick={() => {
            setIsOpen((prev) => !prev);
            if (!isOpen) setShowTeaser(false);
          }}
          aria-label={isOpen ? "Close Railway Copilot" : "Open Railway Copilot"}
          title={isOpen ? "Close Railway Copilot" : "Open Railway Copilot"}
        >
          {isOpen ? (
            <span className="copilot-fab-x">✕</span>
          ) : (
            <div className="copilot-fab-icon-inner">
              <span className="copilot-fab-train">🚆</span>
              <span className="copilot-fab-status-dot" title="Live Engine Active" />
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

// Minimal inline markdown helpers (no library dependency)
function mdBold(t) {
  return String(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function mdCode(t) {
  return String(t).replace(/`(.+?)`/g, "<code>$1</code>");
}
