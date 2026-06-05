import { useState, useCallback, useRef, useEffect } from "react";
import axios from "axios";
import Editor from "@monaco-editor/react";

const BACKEND_URL = "https://codefix-ai-dn7x.onrender.com";

const LANGUAGES = [
  { value: "javascript", label: "JavaScript", icon: "JS" },
  { value: "python", label: "Python", icon: "PY" },
  { value: "cpp", label: "C++", icon: "C+" },
  { value: "java", label: "Java", icon: "JV" },
];

const EXT_TO_LANG = {
  js: "javascript",
  jsx: "javascript",
  ts: "javascript",
  py: "python",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  java: "java",
};

const ACCEPTED_EXTS = Object.keys(EXT_TO_LANG);

const cleanExplanation = (text) =>
  text.replace(/\*\*/g, "").replace(/`/g, "");

const parseExplanationPoints = (text) => {
  const cleaned = cleanExplanation(text).trim();

  // Inline numbered list: "1. foo 2. bar 3. baz"
  const inlineNumbered = Array.from(
    cleaned.matchAll(/\d+\.\s+([^\n]+?)(?=(?:\s*\d+\.\s+|$))/g)
  )
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (inlineNumbered.length > 1) return inlineNumbered;

  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    if (lines.every((l) => /^[\u2022•\-*]\s+/.test(l)))
      return lines.map((l) => l.replace(/^[\u2022•\-*]\s+/, "").trim()).filter(Boolean);
    if (lines.every((l) => /^\d+\.\s+/.test(l)))
      return lines.map((l) => l.replace(/^\d+\.\s+/, "").trim()).filter(Boolean);
    return lines;
  }

  return [cleaned];
};

function encodeSession(code, language) {
  const payload = JSON.stringify({ c: code, l: language });
  return btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeSession(param) {
  try {
    const padded = param.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(padded)));
    const { c, l } = JSON.parse(json);
    if (typeof c === "string" && typeof l === "string") return { code: c, language: l };
  } catch {
    return null;
  }
  return null;
}

function getSharedSessionFromUrl() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const sessionParam = params.get("s");
  return sessionParam ? decodeSession(sessionParam) : null;
}

const styles = {
  root: {
    minHeight: "100vh",
    width: "100%",
    background: "#080f1a",
    color: "#e2e8f0",
    padding: "32px 24px 48px",
    boxSizing: "border-box",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    overflowX: "hidden",
  },
  header: { textAlign: "center", marginBottom: "48px", paddingTop: "16px" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: "999px",
    padding: "6px 16px",
    fontSize: "13px",
    color: "#4ade80",
    marginBottom: "20px",
    letterSpacing: "0.05em",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#4ade80",
    animation: "pulse 2s infinite",
    flexShrink: 0,
  },
  title: {
    fontSize: "clamp(36px, 5vw, 56px)",
    fontWeight: "700",
    margin: "0 0 12px",
    background: "linear-gradient(135deg, #fff 0%, #94a3b8 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    letterSpacing: "-0.02em",
    lineHeight: 1.1,
    padding: "4px 0",
  },
  subtitle: { fontSize: "15px", color: "#64748b", margin: 0, fontFamily: "system-ui, sans-serif" },
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "24px",
    maxWidth: "1400px",
    margin: "0 auto",
  },
  panel: { display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "36px" },
  panelTitle: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    margin: 0,
  },
  langTabs: { display: "flex", gap: "6px" },
  langTab: (active) => ({
    padding: "6px 14px",
    borderRadius: "6px",
    border: active ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(34,197,94,0.1)" : "transparent",
    color: active ? "#4ade80" : "#64748b",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
    letterSpacing: "0.05em",
  }),
  editorWrap: (isDragging) => ({
    borderRadius: "12px",
    overflow: "hidden",
    border: isDragging ? "1.5px dashed rgba(34,197,94,0.7)" : "1px solid rgba(255,255,255,0.08)",
    background: isDragging ? "rgba(34,197,94,0.04)" : "#0d1117",
    flex: 1,
    position: "relative",
    transition: "border-color 0.15s, background 0.15s",
  }),
  dropOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    background: "rgba(8,15,26,0.88)",
    pointerEvents: "none",
    animation: "dropFadeIn 0.15s ease",
    borderRadius: "12px",
  },
  dropIcon: { fontSize: "40px", lineHeight: 1 },
  dropText: { fontSize: "15px", fontWeight: "600", color: "#4ade80", letterSpacing: "0.02em" },
  dropSub: { fontSize: "12px", color: "#64748b", marginTop: "-6px" },
  fileChip: (visible) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 12px 5px 8px",
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: "6px",
    fontSize: "12px",
    color: "#4ade80",
    fontFamily: "inherit",
    opacity: visible ? 1 : 0,
    transition: "opacity 0.2s",
    maxWidth: "200px",
    overflow: "hidden",
  }),
  fileChipName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px" },
  clearFileBtn: {
    background: "none",
    border: "none",
    color: "#4ade80",
    cursor: "pointer",
    padding: "0",
    fontSize: "14px",
    lineHeight: 1,
    opacity: 0.7,
    fontFamily: "inherit",
    flexShrink: 0,
  },
  uploadBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    color: "#64748b",
    fontSize: "12px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  shareBtn: (state) => ({
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "8px 18px",
    background:
      state === "copied" ? "rgba(34,197,94,0.15)" : state === "disabled" ? "transparent" : "rgba(255,255,255,0.05)",
    border:
      state === "copied"
        ? "1px solid rgba(34,197,94,0.4)"
        : state === "disabled"
        ? "1px solid rgba(255,255,255,0.06)"
        : "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    color: state === "copied" ? "#4ade80" : state === "disabled" ? "#334155" : "#94a3b8",
    fontSize: "13px",
    fontWeight: "600",
    cursor: state === "disabled" ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.03em",
    transition: "all 0.18s",
  }),
  sharedBanner: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 16px",
    background: "rgba(34,197,94,0.07)",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: "8px",
    fontSize: "13px",
    color: "#4ade80",
    fontFamily: "system-ui, sans-serif",
    marginBottom: "8px",
  },
  editorTopBar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "#0d1117",
  },
  trafficDot: (color) => ({ width: "10px", height: "10px", borderRadius: "50%", background: color }),
  editorFilename: { fontSize: "12px", color: "#475569", marginLeft: "8px", fontFamily: "inherit" },
  debugBtn: (disabled, loading) => ({
    padding: "14px 28px",
    background:
      disabled && !loading
        ? "rgba(100,116,139,0.15)"
        : loading
        ? "rgba(22,163,74,0.5)"
        : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
    color: disabled && !loading ? "#475569" : "#fff",
    border: disabled && !loading ? "1px solid rgba(255,255,255,0.07)" : "none",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    transition: "all 0.2s",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    letterSpacing: "0.02em",
    boxShadow: disabled ? "none" : loading ? "0 0 16px rgba(34,197,94,0.15)" : "0 0 28px rgba(34,197,94,0.3)",
    width: "100%",
  }),
  outputBox: {
    flex: 1,
    minHeight: "520px",
    background: "#0d1117",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.08)",
    overflowY: "auto",
    padding: "28px",
  },
  emptyState: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
    opacity: 0.4,
  },
  emptyIcon: { fontSize: "48px", lineHeight: 1 },
  emptyText: { fontSize: "16px", fontFamily: "system-ui, sans-serif", textAlign: "center" },
  sectionTitle: (color) => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color,
    fontSize: "13px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "14px",
    marginTop: "0",
  }),
  sectionAccent: (color) => ({
    width: "3px",
    height: "16px",
    borderRadius: "2px",
    background: color,
    flexShrink: 0,
  }),
  errorList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  errorItem: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-start",
    padding: "12px 16px",
    background: "rgba(248,113,113,0.08)",
    borderRadius: "8px",
    border: "1px solid rgba(248,113,113,0.15)",
    fontSize: "14px",
    lineHeight: "1.6",
    fontFamily: "system-ui, sans-serif",
  },
  errorNum: {
    flexShrink: 0,
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "rgba(248,113,113,0.2)",
    color: "#f87171",
    fontSize: "11px",
    fontWeight: "700",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  codeBlock: {
    position: "relative",
    background: "#080f1a",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  codeTopBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  codeLangBadge: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.1em",
    color: "#4ade80",
    textTransform: "uppercase",
  },
  copyBtn: (copied) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    background: copied ? "rgba(34,197,94,0.15)" : "transparent",
    border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    color: copied ? "#4ade80" : "#64748b",
    fontSize: "12px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
  }),
  pre: { margin: 0, padding: "20px", fontSize: "13px", lineHeight: "1.7", overflowX: "auto", color: "#e2e8f0" },
  explanation: {
    background: "rgba(96,165,250,0.06)",
    border: "1px solid rgba(96,165,250,0.15)",
    borderRadius: "10px",
    padding: "18px 20px",
    fontSize: "14px",
    lineHeight: "1.8",
    color: "#cbd5e1",
    fontFamily: "system-ui, sans-serif",
  },
  bulletPoint: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    marginBottom: "10px",
    lineHeight: "1.7",
  },
  bulletDot: {
    flexShrink: 0,
    marginTop: "8px",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#60a5fa",
  },
  divider: { border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "24px 0" },
  loadingWrap: { display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" },
  skeleton: (width, height) => ({
    width,
    height,
    borderRadius: "6px",
    background: "rgba(255,255,255,0.05)",
    animation: "shimmer 1.5s infinite",
  }),
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255,255,255,0.2)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    flexShrink: 0,
  },
  // Connection warning banner
  warnBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "12px 16px",
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.25)",
    borderRadius: "8px",
    fontSize: "13px",
    color: "#fbbf24",
    fontFamily: "system-ui, sans-serif",
    lineHeight: "1.6",
    marginBottom: "16px",
  },
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} style={styles.copyBtn(copied)}>
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div style={styles.loadingWrap}>
      <div style={styles.skeleton("60%", "14px")} />
      <div style={styles.skeleton("100%", "64px")} />
      <div style={{ height: "24px" }} />
      <div style={styles.skeleton("45%", "14px")} />
      <div style={styles.skeleton("100%", "120px")} />
      <div style={{ height: "24px" }} />
      <div style={styles.skeleton("55%", "14px")} />
      <div style={styles.skeleton("100%", "80px")} />
    </div>
  );
}

function ExplanationBlock({ text }) {
  const points = parseExplanationPoints(text);
  return (
    <div style={styles.explanation}>
      {points.map((point, i) => (
        <div key={i} style={styles.bulletPoint}>
          <span style={styles.bulletDot} />
          <span>{point}</span>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [initialSession] = useState(() => getSharedSessionFromUrl());
  const initialLanguage = LANGUAGES.some((l) => l.value === initialSession?.language)
    ? initialSession.language
    : "javascript";
  const [code, setCode] = useState(() => initialSession?.code || "");
  const [language, setLanguage] = useState(initialLanguage);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastLang, setLastLang] = useState(initialLanguage);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedFile, setLoadedFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [shareState, setShareState] = useState("idle");
  const [showLoadedBanner, setShowLoadedBanner] = useState(() => Boolean(initialSession));
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const currentLang = LANGUAGES.find((l) => l.value === language);

  useEffect(() => {
    if (!initialSession) return;
    window.history.replaceState({}, "", window.location.pathname);
  }, [initialSession]);

  const handleShare = useCallback(async () => {
    if (!code.trim()) return;
    const encoded = encodeSession(code, language);
    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    }
  }, [code, language]);

  const loadFile = useCallback((file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      setFileError(
        `Unsupported file type ".${ext}". Use: ${ACCEPTED_EXTS.map((e) => `.${e}`).join(", ")}`
      );
      setTimeout(() => setFileError(null), 3500);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setCode(e.target.result);
      setLanguage(EXT_TO_LANG[ext] || "javascript");
      setLoadedFile(file.name);
      setResult(null);
      setFileError(null);
    };
    reader.readAsText(file);
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const handleFileInput = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
      e.target.value = "";
    },
    [loadFile]
  );

  const handleDebug = useCallback(async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    setLastLang(language);
    try {
      const res = await axios.post(`${BACKEND_URL}/debug`, { code, language });
      setResult(res.data);
    } catch (err) {
      console.error("Debug error:", err);
      const isNetwork = !err.response;
      const serverMsg = err.response?.data;
      setResult({
        errors: [
          isNetwork
            ? "Cannot reach the backend. Render free-tier may be asleep — wait 30s and retry."
            : serverMsg?.errors?.[0] || err.message || "Server error.",
        ],
        fixedCode: serverMsg?.fixedCode || "",
        explanation: isNetwork
          ? "The Render backend spins down after inactivity. Give it 30 seconds to wake up, then try again."
          : serverMsg?.explanation || err.message || "Server returned an error.",
        connectionError: isNetwork,
      });
    } finally {
      setLoading(false);
    }
  }, [code, language]);

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleDebug();
      }
    },
    [handleDebug]
  );

  const langLabel = LANGUAGES.find((l) => l.value === lastLang)?.label;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes shimmer {
          0%  { background-color: rgba(255,255,255,0.04); }
          50% { background-color: rgba(255,255,255,0.09); }
          100%{ background-color: rgba(255,255,255,0.04); }
        }
        @keyframes dropFadeIn { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
        body { margin: 0; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:3px; }
        @media (max-width: 900px) { .debugger-layout { grid-template-columns:1fr !important; } }
      `}</style>

      <div style={styles.root} onKeyDown={handleKeyDown}>
        {/* HEADER */}
        <div style={styles.header}>
          <div style={styles.badge}>
            <span style={styles.dot} />
            AI-Powered · Live Debugging
          </div>
          <h1 style={styles.title}>Code Debugger</h1>
          <p style={styles.subtitle}>
            Paste buggy code → get errors, fixes, and explanations instantly
          </p>
          <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
            <button
              style={styles.shareBtn(!code.trim() ? "disabled" : shareState)}
              onClick={handleShare}
              disabled={!code.trim()}
              title={!code.trim() ? "Add code to share" : "Copy shareable link"}
            >
              {shareState === "copied" ? "✓ Link copied!" : "⬆ Share session"}
            </button>
          </div>
        </div>

        {/* Restored-session banner */}
        {showLoadedBanner && (
          <div style={{ maxWidth: "1400px", margin: "-28px auto 24px" }}>
            <div style={styles.sharedBanner}>
              <span style={{ fontSize: "16px" }}>🔗</span>
              <span>Loaded from a shared session — code and language restored.</span>
              <button
                onClick={() => setShowLoadedBanner(false)}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "#4ade80", cursor: "pointer", fontSize: "14px", padding: 0 }}
              >✕</button>
            </div>
          </div>
        )}

        {/* PANELS */}
        <div style={styles.layout} className="debugger-layout">

          {/* LEFT — Input */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <p style={styles.panelTitle}>Input</p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {loadedFile && (
                  <div style={styles.fileChip(true)}>
                    <span style={{ fontSize: "14px" }}>📄</span>
                    <span style={styles.fileChipName} title={loadedFile}>{loadedFile}</span>
                    <button
                      style={styles.clearFileBtn}
                      onClick={() => { setLoadedFile(null); setCode(""); setResult(null); }}
                      title="Clear file"
                    >✕</button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTS.map((e) => `.${e}`).join(",")}
                  style={{ display: "none" }}
                  onChange={handleFileInput}
                />
                <button style={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
                  ↑ Upload file
                </button>
                <div style={styles.langTabs}>
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.value}
                      style={styles.langTab(language === lang.value)}
                      onClick={() => setLanguage(lang.value)}
                    >
                      {lang.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {fileError && (
              <div style={{
                padding: "10px 16px",
                background: "rgba(248,113,113,0.1)",
                border: "1px solid rgba(248,113,113,0.25)",
                borderRadius: "8px",
                fontSize: "13px",
                color: "#f87171",
                fontFamily: "system-ui, sans-serif",
              }}>
                ⚠ {fileError}
              </div>
            )}

            <div
              style={styles.editorWrap(isDragging)}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div style={styles.dropOverlay}>
                  <div style={styles.dropIcon}>⬇</div>
                  <div style={styles.dropText}>Drop your file here</div>
                  <div style={styles.dropSub}>.js · .py · .java · .cpp · .ts · .jsx</div>
                </div>
              )}
              <div style={styles.editorTopBar}>
                <span style={styles.trafficDot("#ff5f57")} />
                <span style={styles.trafficDot("#febc2e")} />
                <span style={styles.trafficDot("#28c840")} />
                <span style={styles.editorFilename}>
                  {loadedFile || `debug.${
                    currentLang?.value === "cpp" ? "cpp"
                    : currentLang?.value === "java" ? "java"
                    : currentLang?.value === "python" ? "py"
                    : "js"
                  }`}
                </span>
              </div>
              <Editor
                height="460px"
                language={language}
                theme="vs-dark"
                value={code}
                onChange={(v) => setCode(v || "")}
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  minimap: { enabled: false },
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  padding: { top: 16, bottom: 16 },
                  lineNumbersMinChars: 3,
                  renderLineHighlight: "all",
                  smoothScrolling: true,
                }}
              />
            </div>

            <button
              onClick={handleDebug}
              disabled={loading || !code.trim()}
              style={styles.debugBtn(!code.trim(), loading)}
            >
              {loading ? (
                <><span style={styles.spinner} /> Analyzing…</>
              ) : (
                <>⚡ Debug Code <span style={{ fontSize: "11px", opacity: 0.6, fontWeight: "400" }}>⌘↵</span></>
              )}
            </button>
          </div>

          {/* RIGHT — Output */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <p style={styles.panelTitle}>Output</p>
              {result && !loading && (
                <span style={{ fontSize: "11px", color: "#475569", letterSpacing: "0.05em" }}>
                  {langLabel?.toUpperCase()}
                </span>
              )}
            </div>

            <div style={styles.outputBox}>
              {loading ? (
                <LoadingSkeleton />
              ) : result ? (
                <>
                  {/* Render cold-start / network warning */}
                  {result.connectionError && (
                    <div style={styles.warnBanner}>
                      <span style={{ fontSize: "16px", flexShrink: 0 }}>⚠</span>
                      <span>
                        The Render backend may be asleep (free tier spins down after 15 min of inactivity).
                        Wait ~30 seconds, then click <strong>Debug Code</strong> again.
                      </span>
                    </div>
                  )}

                  {/* ERRORS */}
                  <h3 style={styles.sectionTitle("#f87171")}>
                    <span style={styles.sectionAccent("#f87171")} />
                    {result.connectionError ? "Connection Error" : `Errors · ${result.errors?.length ?? 0} found`}
                  </h3>
                  <ul style={styles.errorList}>
                    {result.errors?.map((err, i) => (
                      <li key={i} style={styles.errorItem}>
                        <span style={styles.errorNum}>{i + 1}</span>
                        <span>{err}</span>
                      </li>
                    ))}
                  </ul>

                  {result.fixedCode && (
                    <>
                      <hr style={styles.divider} />
                      <h3 style={styles.sectionTitle("#4ade80")}>
                        <span style={styles.sectionAccent("#4ade80")} />
                        Fixed Code
                      </h3>
                      <div style={styles.codeBlock}>
                        <div style={styles.codeTopBar}>
                          <span style={styles.codeLangBadge}>{langLabel}</span>
                          <CopyButton text={result.fixedCode} />
                        </div>
                        <pre style={styles.pre}><code>{result.fixedCode}</code></pre>
                      </div>
                    </>
                  )}

                  {result.explanation && (
                    <>
                      <hr style={styles.divider} />
                      <h3 style={styles.sectionTitle("#60a5fa")}>
                        <span style={styles.sectionAccent("#60a5fa")} />
                        Explanation
                      </h3>
                      <ExplanationBlock text={result.explanation} />
                    </>
                  )}
                </>
              ) : (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>🐛</div>
                  <p style={styles.emptyText}>
                    Paste your code and hit Debug
                    <br />
                    <span style={{ fontSize: "13px", opacity: 0.6 }}>
                      Errors, fixes, and explanations will appear here
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;