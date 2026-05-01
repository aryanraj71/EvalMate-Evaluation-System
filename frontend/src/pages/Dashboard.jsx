import { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../App";
import API from "../services/api";
import {
  ChevronDown, BarChart3, Users, Award, FileText,
  TrendingUp, AlertCircle, CheckCircle, Sparkles, Plus, X, Info,
  Cpu, Brain
} from "lucide-react";

// ── Persist selected assignment per-user in sessionStorage ───────────────────
// sessionStorage clears on tab close / logout, so "until logout" is satisfied.
const SEL_KEY = "evalmate_dashboard_assignment";
const getPersistedId = () => sessionStorage.getItem(SEL_KEY) || "";
const persistId = (id) => { if (id) sessionStorage.setItem(SEL_KEY, id); else sessionStorage.removeItem(SEL_KEY); };

function DifficultyBadge({ level }) {
  const map = {
    Easy: { bg: "#dcfce7", color: "#15803d" },
    Medium: { bg: "#fef9c3", color: "#92400e" },
    Hard: { bg: "#fee2e2", color: "#b91c1c" },
    "N/A": { bg: "#f1f5f9", color: "#64748b" },
  };
  const s = map[level] || map["N/A"];
  return (
    <span style={{ padding: "2px 10px", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 600, background: s.bg, color: s.color }}>
      {level}
    </span>
  );
}

function ProgressBar({ value, color }) {
  return (
    <div style={{ background: "var(--bg-tertiary)", borderRadius: "99px", height: 10, overflow: "hidden", marginTop: 8 }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color || "var(--accent-color)", borderRadius: "99px", transition: "width 0.6s ease" }} />
    </div>
  );
}

function ScoreDistChart({ data, markBands }) {
  const displayData = markBands || data;
  const bands = Object.keys(displayData);
  const counts = bands.map(b => displayData[b] || 0);
  const maxCount = Math.max(...counts, 1);
  const colors = ["#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444"];
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bands.map((band, i) => {
        const count = displayData[band] || 0;
        const pct = (count / maxCount) * 100;
        const spct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={band} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 64, fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right", flexShrink: 0 }}>{band}</span>
            <div style={{ flex: 1, background: "var(--bg-tertiary)", borderRadius: 6, height: 22, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: colors[i], borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8, transition: "width 0.6s ease", minWidth: count > 0 ? 28 : 0 }}>
                {count > 0 && <span style={{ fontSize: "0.75rem", color: "white", fontWeight: 700 }}>{count}</span>}
              </div>
            </div>
            <div style={{ width: 40, textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontSize: "0.75rem", color: count > 0 ? colors[i] : "var(--text-tertiary)", fontWeight: 600 }}>
                {count === 0 ? "–" : `${spct}%`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AI Insights Modal ────────────────────────────────────────────────────────
function AIInsightsModal({ analytics, distMode, onClose }) {
  // Pick the right insights block based on distMode
  const isLlm = distMode === "llm" && analytics?.ai_insights_llm != null;
  const insights = isLlm ? analytics.ai_insights_llm : analytics.ai_insights;
  const lq = insights?.lowest_question;
  const sp = insights?.struggled_percent;
  const avg = insights?.overall_avg ?? analytics?.overall_avg;

  // Best question from question_performance (always semantic-based, for reference)
  const qp = analytics?.question_performance || [];
  const scored = qp.filter(q => q.avg_score !== null);
  const best = scored.length > 0
    ? scored.reduce((a, b) => (a.avg_score / a.max_marks) > (b.avg_score / b.max_marks) ? a : b)
    : null;

  const modeLabel = isLlm ? "LLM" : "Semantic";
  const modeBg = isLlm ? "#ede9fe" : "#eef2ff";
  const modeColor = isLlm ? "#7c3aed" : "#4f46e5";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24
    }} onClick={onClose}>
      <div
        style={{ background: "white", borderRadius: 16, padding: 32, maxWidth: 480, width: "100%", boxShadow: "0 25px 50px rgba(0,0,0,0.2)", animation: "fadeUp 0.2s ease" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ padding: 8, background: "#fef9c3", borderRadius: 10, color: "#92400e" }}><Sparkles size={18} /></div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>AI Insights</h3>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, background: modeBg, color: modeColor, padding: "2px 8px", borderRadius: 99 }}>{modeLabel}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4, borderRadius: 6 }}>
            <X size={20} />
          </button>
        </div>

        {/* LLM not available notice */}
        {distMode === "llm" && !analytics?.ai_insights_llm && (
          <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#5b21b6" }}>
              🔒 LLM insights not available yet. Run LLM assessment from the Results page first.
            </p>
          </div>
        )}

        {!lq ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.9rem", textAlign: "center", padding: "20px 0" }}>
            Evaluate answer scripts to generate insights.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Hardest question */}
            {(() => {
              const ratio = lq.max_marks > 0 ? lq.avg_score / lq.max_marks : 0;
              const diffColor = ratio >= 0.75 ? "#15803d" : ratio >= 0.55 ? "#92400e" : "#b91c1c";
              return (
                <div style={{ padding: "12px 16px", background: "#fef2f2", borderRadius: 10, borderLeft: "4px solid #ef4444" }}>
                  <p style={{ fontSize: "0.85rem", color: "#7f1d1d", margin: 0, fontWeight: 700 }}>📉 Hardest Question</p>
                  <p style={{ fontSize: "0.83rem", color: "#7f1d1d", lineHeight: 1.5, margin: "4px 0 0" }}>
                    Q{lq.question_number} — avg <strong>{lq.avg_score}/{lq.max_marks}</strong>
                    {" "}(<span style={{ color: diffColor, fontWeight: 700 }}>{Math.round(ratio * 100)}%</span>)
                    {lq.question_text ? <em style={{ opacity: 0.8 }}> · "{lq.question_text.slice(0, 60)}{lq.question_text.length > 60 ? "…" : ""}"</em> : ""}
                  </p>
                </div>
              );
            })()}

            {/* Struggle rate */}
            {sp !== null && sp !== undefined && (
              <div style={{ padding: "12px 16px", background: sp > 50 ? "#fef9c3" : "#f0fdf4", borderRadius: 10, borderLeft: `4px solid ${sp > 50 ? "#f59e0b" : "#22c55e"}` }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 700, color: sp > 50 ? "#78350f" : "#14532d", margin: 0 }}>
                  {sp > 50 ? "😓 High Struggle Rate" : "👍 Manageable Difficulty"}
                </p>
                <p style={{ fontSize: "0.83rem", color: sp > 50 ? "#78350f" : "#14532d", lineHeight: 1.5, margin: "4px 0 0" }}>
                  <strong>{sp}%</strong> of students scored below 50% on Q{lq.question_number}.
                  {sp > 50 ? " Consider revisiting this topic." : " Most students did well."}
                </p>
              </div>
            )}

            {/* Best question */}
            {best && best.question_number !== lq.question_number && (
              <div style={{ padding: "12px 16px", background: "#f0fdf4", borderRadius: 10, borderLeft: "4px solid #22c55e" }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#14532d", margin: 0 }}>✅ Easiest Question</p>
                <p style={{ fontSize: "0.83rem", color: "#14532d", lineHeight: 1.5, margin: "4px 0 0" }}>
                  Q{best.question_number} — avg <strong>{best.avg_score}/{best.max_marks}</strong>
                  {" "}({Math.round((best.avg_score / best.max_marks) * 100)}%)
                </p>
              </div>
            )}

            {/* Class average */}
            {avg !== null && avg !== undefined && (
              <div style={{
                padding: "12px 16px", borderRadius: 10,
                background: avg >= 70 ? "#f0fdf4" : avg >= 50 ? "#fef9c3" : "#fef2f2",
                borderLeft: `4px solid ${avg >= 70 ? "#22c55e" : avg >= 50 ? "#f59e0b" : "#ef4444"}`
              }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", margin: 0 }}>📊 Class Average ({modeLabel})</p>
                <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                  <strong>{avg}%</strong>
                  {avg >= 70 ? " — Performing well." : avg >= 50 ? " — Moderate performance." : " — Needs attention."}
                </p>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState(getPersistedId);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  // Score distribution mode — persisted until logout
  const [distMode, setDistMode] = useState(
    () => sessionStorage.getItem('evalmate_dashboard_dist_mode') || "semantic"
  );
  const setDistModePersist = (m) => { setDistMode(m); sessionStorage.setItem('evalmate_dashboard_dist_mode', m); };

  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const dropRef = useRef(null);

  // Load assignments on mount
  useEffect(() => {
    API.get("/assignments")
      .then(res => {
        setAssignments(res.data);
        // Auto-load analytics if a persisted ID exists
        const id = getPersistedId();
        if (id) fetchAnalytics(id);
      })
      .catch(console.error)
      .finally(() => setLoadingAssignments(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dropdownOpen]);

  const fetchAnalytics = async (id) => {
    if (!id) { setAnalytics(null); return; }
    try {
      setLoadingAnalytics(true);
      setAnalytics(null);
      const res = await API.get(`/dashboard/assignment/${id}`);
      setAnalytics(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleSelect = (id) => {
    setSelectedId(id);
    persistId(id);
    setDropdownOpen(false);
    fetchAnalytics(id);
  };

  const selectedAssignment = assignments.find(a => a.id === selectedId);
  const ep = analytics?.evaluation_progress;

  return (
    <div className="dashboard-page">
      {/* AI Insights modal */}
      {showInsights && analytics && (
        <AIInsightsModal analytics={analytics} distMode={distMode} onClose={() => setShowInsights(false)} />
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8, color: "var(--text-primary)" }}>
            Welcome back, {user?.name?.split(" ")[0]}!
          </h2>
          <p style={{ color: "var(--text-secondary)" }}>
            {selectedAssignment ? `Viewing: ${selectedAssignment.assignment_name}` : "Select an assignment to view its analytics"}
          </p>
        </div>

        {/* Assignment Selector */}
        <div ref={dropRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 18px", borderRadius: 10,
              border: "2px solid var(--accent-color)",
              background: selectedId ? "var(--accent-color)" : "white",
              color: selectedId ? "white" : "var(--accent-color)",
              fontWeight: 600, fontSize: "0.95rem", cursor: "pointer",
              minWidth: 250, justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(99,102,241,0.15)"
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <FileText size={16} style={{ flexShrink: 0 }} />
              {selectedAssignment ? selectedAssignment.assignment_name : (loadingAssignments ? "Loading…" : "Select Assignment")}
            </span>
            <ChevronDown size={16} style={{ flexShrink: 0, transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>

          {dropdownOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999, background: "white", border: "1px solid var(--border-light)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 270, overflow: "hidden" }}>
              {loadingAssignments ? (
                <div style={{ padding: "12px 16px", color: "var(--text-tertiary)", fontSize: "0.9rem" }}>Loading…</div>
              ) : assignments.length === 0 ? (
                <div style={{ padding: "12px 16px", color: "var(--text-tertiary)", fontSize: "0.9rem" }}>No assignments yet</div>
              ) : (
                assignments.map(a => (
                  <div key={a.id} onClick={() => handleSelect(a.id)} style={{ padding: "10px 16px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500, background: selectedId === a.id ? "var(--accent-light)" : "white", color: selectedId === a.id ? "var(--accent-color)" : "var(--text-primary)", borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ fontWeight: 600 }}>{a.assignment_name}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginTop: 2 }}>{a.subject} · {a.maximum_marks} marks</div>
                  </div>
                ))
              )}
              <div onClick={() => { setDropdownOpen(false); navigate("/create-assignment"); }} style={{ padding: "10px 16px", cursor: "pointer", color: "var(--accent-color)", fontSize: "0.88rem", fontWeight: 600, borderTop: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> Create New Assignment
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loadingAnalytics && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 16px", borderColor: "var(--border-light)", borderTopColor: "var(--accent-color)" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading analytics…</p>
        </div>
      )}

      {/* Empty state */}
      {!selectedId && !loadingAnalytics && (
        <div style={{ background: "linear-gradient(135deg,#eef2ff,#f0fdf4)", border: "1px dashed var(--accent-color)", borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>📊</div>
          <h3 style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Choose an assignment above</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Your selection is remembered — you won't need to re-select after navigating away.</p>
        </div>
      )}

      {/* ── Analytics Grid ── */}
      {analytics && !loadingAnalytics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>

          {/* Card 1 — Evaluation Progress (compact, no empty space) */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ padding: 8, background: "#e0f2fe", borderRadius: 10, color: "#0369a1" }}><Users size={18} /></div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Evaluation Progress</h3>
              </div>
              {/* AI Insights button — compact, in the corner */}
              <button
                onClick={() => setShowInsights(true)}
                title="View AI Insights"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 8,
                  background: "#fef9c3", color: "#92400e",
                  border: "1px solid #fde68a", cursor: "pointer",
                  fontSize: "0.78rem", fontWeight: 700,
                  transition: "all 0.15s"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#fde68a"}
                onMouseLeave={e => e.currentTarget.style.background = "#fef9c3"}
              >
                <Sparkles size={13} /> AI Insights
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                { label: "Uploaded", value: ep.scripts_uploaded, icon: <FileText size={14} />, color: "#6366f1", bg: "#eef2ff" },
                { label: "Evaluated", value: ep.ai_evaluated, icon: <CheckCircle size={14} />, color: "#22c55e", bg: "#dcfce7" },
                { label: "Review", value: ep.manual_review, icon: <AlertCircle size={14} />, color: "#f59e0b", bg: "#fef9c3" },
              ].map(item => (
                <div key={item.label} style={{ padding: "12px 10px", background: item.bg, borderRadius: 10, textAlign: "center" }}>
                  <div style={{ color: item.color, display: "flex", justifyContent: "center", marginBottom: 4 }}>{item.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: "1.4rem", color: "var(--text-primary)" }}>{item.value}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: 4 }}>
                <span>Completion</span>
                <span style={{ fontWeight: 700, color: "#22c55e" }}>{ep.percent_evaluated}%</span>
              </div>
              <ProgressBar value={ep.percent_evaluated} color="#22c55e" />
            </div>

            {analytics.overall_avg !== null && analytics.overall_avg !== undefined && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: "0.85rem", color: "#15803d" }}>
                <TrendingUp size={14} />
                <span>Overall avg score: <strong>{analytics.overall_avg}%</strong></span>
              </div>
            )}
          </div>

          {/* Card 2 — Score Distribution */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ padding: 8, background: "#ede9fe", borderRadius: 10, color: "#7c3aed" }}><BarChart3 size={18} /></div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Score Distribution</h3>
              </div>
              {/* Mode toggle — only show Full LLM option if LLM data exists */}
              <div style={{ display: "flex", background: "var(--bg-tertiary)", borderRadius: 8, padding: 3 }}>
                <button
                  onClick={() => setDistModePersist("semantic")}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.75rem", transition: "all 0.18s", display: "flex", alignItems: "center", gap: 5, background: distMode === "semantic" ? "white" : "transparent", color: distMode === "semantic" ? "var(--accent-color)" : "var(--text-secondary)", boxShadow: distMode === "semantic" ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}
                >
                  <Cpu size={11} /> Semantic
                </button>
                <button
                  onClick={() => { if (analytics.mark_bands_llm) setDistModePersist("llm"); }}
                  title={analytics.mark_bands_llm ? "LLM distribution" : "Run LLM assessment in Results page first"}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: analytics.mark_bands_llm ? "pointer" : "not-allowed", fontWeight: 600, fontSize: "0.75rem", transition: "all 0.18s", display: "flex", alignItems: "center", gap: 5, background: distMode === "llm" ? "white" : "transparent", color: distMode === "llm" ? "#7c3aed" : analytics.mark_bands_llm ? "var(--text-secondary)" : "var(--text-tertiary)", boxShadow: distMode === "llm" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", opacity: analytics.mark_bands_llm ? 1 : 0.5 }}
                >
                  <Brain size={11} /> LLM {!analytics.mark_bands_llm && "🔒"}
                </button>
              </div>
            </div>
            {analytics.maximum_marks && (
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: 0, fontStyle: "italic" }}>
                {distMode === "llm" ? "LLM assessment scores" : "Semantic assessment scores"} · out of {analytics.maximum_marks} marks
              </p>
            )}
            {(() => {
              const useData = distMode === "llm" && analytics.mark_bands_llm ? analytics.score_distribution_llm : analytics.score_distribution;
              const useBands = distMode === "llm" && analytics.mark_bands_llm ? analytics.mark_bands_llm : analytics.mark_bands;
              return Object.values(useData).every(v => v === 0) ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "0.88rem", textAlign: "center", padding: "20px 0" }}>No evaluation data yet.</p>
              ) : (
                <ScoreDistChart data={useData} markBands={useBands} />
              );
            })()}
          </div>

          {/* Card 3 — Question Performance */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ padding: 8, background: "#e0f2fe", borderRadius: 10, color: "#0369a1" }}><FileText size={18} /></div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Question Performance</h3>
            </div>
            {analytics.question_performance.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.88rem", textAlign: "center", padding: "20px 0" }}>No questions configured yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border-light)" }}>
                    {["Q#", "Avg Score", "Max", "Difficulty"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.question_performance.map((q, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                      <td style={{ padding: "9px 10px", fontWeight: 700, color: "var(--text-primary)" }}>Q{q.question_number}</td>
                      <td style={{ padding: "9px 10px" }}>
                        {q.avg_score !== null ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, minWidth: 24 }}>{q.avg_score}</span>
                            <div style={{ flex: 1, background: "var(--bg-tertiary)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                              <div style={{ width: `${(q.avg_score / q.max_marks) * 100}%`, height: "100%", background: q.difficulty === "Easy" ? "#22c55e" : q.difficulty === "Medium" ? "#f59e0b" : "#ef4444", borderRadius: 99 }} />
                            </div>
                          </div>
                        ) : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                      </td>
                      <td style={{ padding: "9px 10px", color: "var(--text-secondary)" }}>{q.max_marks}</td>
                      <td style={{ padding: "9px 10px" }}><DifficultyBadge level={q.difficulty} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Card 4 — Top Scoring Students */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ padding: 8, background: "#fef3c7", borderRadius: 10, color: "#d97706" }}><Award size={18} /></div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Top Scoring Students</h3>
            </div>
            {analytics.top_students.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.88rem", textAlign: "center", padding: "20px 0" }}>No evaluation results yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analytics.top_students.map((s, i) => {
                  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
                  const barColors = ["#f59e0b", "#94a3b8", "#d97706", "#6366f1", "#6366f1"];
                  const bgs = ["#fef9c3", "#f8fafc", "#fef3c7", "var(--bg-secondary)", "var(--bg-secondary)"];
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: bgs[i] }}>
                      <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>{medals[i]}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                        <ProgressBar value={s.score} color={barColors[i]} />
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)" }}>{s.score}%</span>
                        <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", margin: 0 }}>{s.raw}/{s.max}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
