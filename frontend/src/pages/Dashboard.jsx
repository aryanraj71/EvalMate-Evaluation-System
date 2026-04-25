import { useState, useEffect, useContext } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../App";
import API from "../services/api";
import {
  ChevronDown, BarChart3, Users, Award, FileText,
  TrendingUp, AlertCircle, CheckCircle, Sparkles, Plus
} from "lucide-react";

function DifficultyBadge({ level }) {
  const map = {
    Easy:   { bg: "#dcfce7", color: "#15803d" },
    Medium: { bg: "#fef9c3", color: "#92400e" },
    Hard:   { bg: "#fee2e2", color: "#b91c1c" },
    "N/A":  { bg: "#f1f5f9", color: "#64748b" },
  };
  const s = map[level] || map["N/A"];
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "99px", fontSize: "0.75rem",
      fontWeight: 600, background: s.bg, color: s.color
    }}>
      {level}
    </span>
  );
}

function ProgressBar({ value, color }) {
  return (
    <div style={{ background: "var(--bg-tertiary)", borderRadius: "99px", height: 10, overflow: "hidden", marginTop: 8 }}>
      <div style={{
        width: `${Math.min(value, 100)}%`, height: "100%",
        background: color || "var(--accent-color)", borderRadius: "99px",
        transition: "width 0.6s ease"
      }} />
    </div>
  );
}

function PlaceholderCard({ title, icon }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ padding: 8, background: "var(--bg-tertiary)", borderRadius: 10, color: "var(--text-tertiary)" }}>
          {icon}
        </div>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{title}</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 0" }}>
        {[80, 60, 45].map((w, i) => (
          <div key={i} style={{ height: 14, width: `${w}%`, background: "var(--bg-tertiary)", borderRadius: 6, animation: "pulse 2s infinite" }} />
        ))}
      </div>
      <p style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.85rem", marginTop: 8 }}>
        — —
      </p>
    </div>
  );
}

function ScoreDistChart({ data, markBands }) {
  // Use actual mark bands if available, fall back to percentage bands
  const displayData = markBands || data;
  const bands = Object.keys(displayData);
  const counts = bands.map(b => displayData[b] || 0);
  const maxCount = Math.max(...counts, 1);
  const colors = ["#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444"];
  const totalStudents = counts.reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bands.map((band, i) => {
        const count = displayData[band] || 0;
        const pct = (count / maxCount) * 100;
        const studentPct = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
        return (
          <div key={band} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 64, fontSize: "0.75rem", color: "var(--text-secondary)",
              fontWeight: 600, textAlign: "right", flexShrink: 0
            }}>{band}</span>
            <div style={{ flex: 1, background: "var(--bg-tertiary)", borderRadius: 6, height: 22, overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "100%", background: colors[i],
                borderRadius: 6, display: "flex", alignItems: "center",
                paddingLeft: 8, transition: "width 0.6s ease", minWidth: count > 0 ? 28 : 0
              }}>
                {count > 0 && <span style={{ fontSize: "0.75rem", color: "white", fontWeight: 700 }}>{count}</span>}
              </div>
            </div>
            <div style={{ width: 40, textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontSize: "0.75rem", color: count > 0 ? colors[i] : "var(--text-tertiary)", fontWeight: 600 }}>
                {count === 0 ? "–" : `${studentPct}%`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);

  useEffect(() => {
    fetchAssignments();
  }, [location.key]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e) => {
      if (!e.target.closest(".assign-dropdown-wrap")) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  const fetchAssignments = async () => {
    try {
      setLoadingAssignments(true);
      const res = await API.get("/assignments");
      setAssignments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleSelectAssignment = async (id) => {
    setSelectedId(id);
    setDropdownOpen(false);
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

  const selectedAssignment = assignments.find(a => a.id === selectedId);
  const ep = analytics?.evaluation_progress;

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8, color: "var(--text-primary)" }}>
            Welcome back, {user?.name?.split(" ")[0]}! 👋
          </h2>
          <p style={{ color: "var(--text-secondary)" }}>Select an assignment to view its analytics dashboard</p>
        </div>

        {/* Assignment Selector */}
        <div className="assign-dropdown-wrap" style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 18px", borderRadius: 10,
              border: `2px solid var(--accent-color)`,
              background: selectedId ? "var(--accent-color)" : "white",
              color: selectedId ? "white" : "var(--accent-color)",
              fontWeight: 600, fontSize: "0.95rem", cursor: "pointer",
              minWidth: 250, justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(99,102,241,0.15)"
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <FileText size={16} style={{ flexShrink: 0 }} />
              {selectedAssignment ? selectedAssignment.assignment_name : "Select Assignment"}
            </span>
            <ChevronDown size={16} style={{ flexShrink: 0, transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>

          {dropdownOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999,
              background: "white", border: "1px solid var(--border-color)",
              borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              minWidth: 270, overflow: "hidden"
            }}>
              <div
                onClick={() => handleSelectAssignment("")}
                style={{ padding: "10px 16px", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "0.9rem", borderBottom: "1px solid var(--border-light)", background: !selectedId ? "var(--bg-secondary)" : "white" }}
              >
                — Select Assignment —
              </div>
              {loadingAssignments ? (
                <div style={{ padding: "12px 16px", color: "var(--text-tertiary)", fontSize: "0.9rem" }}>Loading…</div>
              ) : assignments.length === 0 ? (
                <div style={{ padding: "12px 16px", color: "var(--text-tertiary)", fontSize: "0.9rem" }}>No assignments yet</div>
              ) : (
                assignments.map(a => (
                  <div
                    key={a.id}
                    onClick={() => handleSelectAssignment(a.id)}
                    style={{
                      padding: "10px 16px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500,
                      background: selectedId === a.id ? "var(--accent-light)" : "white",
                      color: selectedId === a.id ? "var(--accent-color)" : "var(--text-primary)",
                      borderBottom: "1px solid var(--border-light)"
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{a.assignment_name}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginTop: 2 }}>{a.subject} · {a.maximum_marks} marks</div>
                  </div>
                ))
              )}
              <div
                onClick={() => { setDropdownOpen(false); navigate("/create-assignment"); }}
                style={{ padding: "10px 16px", cursor: "pointer", color: "var(--accent-color)", fontSize: "0.88rem", fontWeight: 600, borderTop: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 6 }}
              >
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
        <>
          <div style={{
            background: "linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%)",
            border: "1px dashed var(--accent-color)", borderRadius: 14,
            padding: "20px 28px", marginBottom: 28,
            display: "flex", alignItems: "center", gap: 14
          }}>
            <div style={{ padding: 10, background: "var(--accent-light)", borderRadius: 10, color: "var(--accent-color)" }}>
              <BarChart3 size={22} />
            </div>
            <div>
              <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>Please select an assignment to view analytics</p>
              
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <PlaceholderCard title="Evaluation Progress" icon={<CheckCircle size={18} />} />
            <PlaceholderCard title="Score Distribution" icon={<BarChart3 size={18} />} />
            <PlaceholderCard title="Question Performance" icon={<FileText size={18} />} />
            <PlaceholderCard title="Top Scoring Students" icon={<Award size={18} />} />
          </div>
        </>
      )}

      {/* Analytics 2x2 Grid */}
      {analytics && !loadingAnalytics && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Card 1 — Evaluation Progress */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ padding: 8, background: "#dcfce7", borderRadius: 10, color: "#16a34a" }}><CheckCircle size={18} /></div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Evaluation Progress</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Scripts Uploaded", value: ep.scripts_uploaded, icon: <FileText size={14} />, color: "#6366f1" },
                { label: "AI Evaluated",     value: ep.ai_evaluated,    icon: <Sparkles size={14} />, color: "#22c55e" },
                { label: "Pending Review",   value: ep.manual_review,   icon: <AlertCircle size={14} />, color: "#f59e0b" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg-secondary)", borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                    <span style={{ color: item.color }}>{item.icon}</span>{item.label}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>{item.value}</span>
                </div>
              ))}
            </div>
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

          {/* Card 2 — Score Distribution + AI Insights */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ padding: 8, background: "#ede9fe", borderRadius: 10, color: "#7c3aed" }}><BarChart3 size={18} /></div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Score Distribution</h3>
            </div>
            {/* Sub-label showing actual marks range */}
            {analytics.maximum_marks && (
              <p style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", margin: "0 0 4px", fontStyle: "italic" }}>
                Based on actual marks out of {analytics.maximum_marks}
              </p>
            )}
            {Object.values(analytics.score_distribution).every(v => v === 0) ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "0.88rem", textAlign: "center", padding: "20px 0" }}>No evaluation data yet.</p>
            ) : (
              <ScoreDistChart
                data={analytics.score_distribution}
                markBands={analytics.mark_bands}
              />
            )}
            <div style={{ borderTop: "1px dashed var(--border-light)", paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ padding: 6, background: "#fef9c3", borderRadius: 8, color: "#92400e" }}><Sparkles size={14} /></div>
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>AI Insights</span>
              </div>
              {analytics.ai_insights?.lowest_question ? (() => {
                const lq = analytics.ai_insights.lowest_question;
                const ratio = lq.max_marks > 0 ? lq.avg_score / lq.max_marks : 0;
                const diffColor = ratio >= 0.75 ? "#15803d" : ratio >= 0.55 ? "#92400e" : "#b91c1c";
                const sp = analytics.ai_insights.struggled_percent;

                // Find highest-performing question
                const qp = analytics.question_performance || [];
                const scored = qp.filter(q => q.avg_score !== null);
                const best = scored.length > 0 ? scored.reduce((a, b) =>
                  (a.avg_score / a.max_marks) > (b.avg_score / b.max_marks) ? a : b) : null;

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ padding: "8px 12px", background: "#fef2f2", borderRadius: 8, borderLeft: "3px solid #ef4444" }}>
                      <p style={{ fontSize: "0.84rem", color: "#7f1d1d", lineHeight: 1.5, margin: 0 }}>
                        📉 <strong>Q{lq.question_number}</strong> was hardest — avg {lq.avg_score}/{lq.max_marks}
                        {" "}(<span style={{ color: diffColor, fontWeight: 700 }}>{Math.round(ratio * 100)}%</span>).
                      </p>
                    </div>
                    {sp !== null && sp !== undefined && (
                      <div style={{ padding: "8px 12px", background: sp > 50 ? "#fef9c3" : "#f0fdf4", borderRadius: 8, borderLeft: `3px solid ${sp > 50 ? "#f59e0b" : "#22c55e"}` }}>
                        <p style={{ fontSize: "0.84rem", color: sp > 50 ? "#78350f" : "#14532d", lineHeight: 1.5, margin: 0 }}>
                          {sp > 50 ? "😓" : "👍"} <strong>{sp}%</strong> of students scored below 50% on Q{lq.question_number}.
                          {sp > 50 ? " Consider revisiting this topic." : " Most students handled it well."}
                        </p>
                      </div>
                    )}
                    {best && best.question_number !== lq.question_number && (
                      <div style={{ padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, borderLeft: "3px solid #22c55e" }}>
                        <p style={{ fontSize: "0.84rem", color: "#14532d", lineHeight: 1.5, margin: 0 }}>
                          ✅ <strong>Q{best.question_number}</strong> had best performance — avg {best.avg_score}/{best.max_marks}
                          {" "}({Math.round((best.avg_score / best.max_marks) * 100)}%).
                        </p>
                      </div>
                    )}
                    {analytics.overall_avg !== null && analytics.overall_avg !== undefined && (
                      <div style={{ padding: "8px 12px", background: analytics.overall_avg >= 70 ? "#f0fdf4" : analytics.overall_avg >= 50 ? "#fef9c3" : "#fef2f2", borderRadius: 8, borderLeft: `3px solid ${analytics.overall_avg >= 70 ? "#22c55e" : analytics.overall_avg >= 50 ? "#f59e0b" : "#ef4444"}` }}>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                          📊 Class average: <strong>{analytics.overall_avg}%</strong>
                          {analytics.overall_avg >= 70 ? " — Class is performing well." : analytics.overall_avg >= 50 ? " — Moderate performance." : " — Class needs attention."}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <p style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", margin: 0 }}>Evaluate scripts to generate insights.</p>
              )}
            </div>
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

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
