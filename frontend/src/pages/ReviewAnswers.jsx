import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import API from "../services/api";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Check, ShieldCheck,
  AlertTriangle, FileText, MessageSquare, User, BookOpen,
  CheckCircle, ChevronDown, ChevronUp
} from "lucide-react";

// ── helpers ────────────────────────────────────────────────
function confStyle(score) {
  if (score >= 0.85) return { color: "#15803d", bg: "#dcfce7", label: "High" };
  if (score >= 0.70) return { color: "#92400e", bg: "#fef9c3", label: "Medium" };
  return { color: "#b91c1c", bg: "#fee2e2", label: "Low" };
}

function ScoreBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 99, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, color, minWidth: 32 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

// ── main component ──────────────────────────────────────────
export default function ReviewAnswers() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const location  = useLocation();

  const [students, setStudents]       = useState([]);  // grouped by student
  const [questions, setQuestions]     = useState([]);  // assignment questions
  const [studentIdx, setStudentIdx]   = useState(0);
  const [answers, setAnswers]         = useState({});  // roll_number → { question_id: answer_text }
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  // per-question marks overrides  { eval_id: final_marks_string }
  const [marksOverride, setMarksOverride] = useState({});
  const [comments, setComments]       = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [loading, setLoading]         = useState(true);
  // which question cards are expanded
  const [expanded, setExpanded]       = useState({});

  // ── fetch on mount ──
  useEffect(() => {
    fetchAll();
  }, [assignmentId]);

  const fetchAll = async () => {
    try {
      const [evalRes, qRes] = await Promise.all([
        API.get(`/evaluations/assignment/${assignmentId}`),   // ← load ALL evals, not just flagged
        API.get(`/assignments/${assignmentId}/questions`)
      ]);

      const evals = evalRes.data;
      const qs    = qRes.data;
      setQuestions(qs);

      // Group evaluations by student — use roll_number as primary key
      const map = {};
      evals.forEach(ev => {
        // Use roll_number as key; fall back to student_name only if roll_number missing
        const key = (ev.roll_number && ev.roll_number.trim()) ? ev.roll_number.trim() : ev.student_name;
        if (!map[key]) {
          map[key] = {
            student_name: ev.student_name,
            roll_number:  ev.roll_number || ev.student_name,
            evaluations:  []
          };
        }
        map[key].evaluations.push(ev);
      });

      const grouped = Object.values(map);
      setStudents(grouped);

      // Pre-fill marks overrides: use final_marks if already reviewed, else AI total
      const init = {};
      evals.forEach(ev => {
        init[ev.id] = String(ev.reviewed && ev.final_marks != null ? ev.final_marks : ev.total_marks);
      });
      setMarksOverride(init);

      // Expand all questions by default
      const exp = {};
      qs.forEach(q => { exp[q.id] = true; });
      setExpanded(exp);

      // If navigated here from Results page with a specific student, jump straight to them
      const startRoll = location.state?.startRoll;
      let startIdx = 0;
      if (startRoll && grouped.length > 0) {
        const normalised = String(startRoll).trim();
        const found = grouped.findIndex(
          s => String(s.roll_number).trim() === normalised ||
               String(s.student_name).trim() === normalised
        );
        if (found !== -1) startIdx = found;
      }
      setStudentIdx(startIdx);

      // Fetch answers for starting student
      if (grouped.length > 0) {
        await fetchStudentAnswers(grouped[startIdx].roll_number);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentAnswers = async (rollNumber) => {
    if (answers[rollNumber]) return; // already loaded
    setLoadingAnswers(true);
    try {
      const res = await API.get(`/student-answers/student/${assignmentId}/${encodeURIComponent(rollNumber)}`);
      const byQuestion = {};
      res.data.forEach(a => { byQuestion[a.question_id] = a.answer_text; });
      setAnswers(prev => ({ ...prev, [rollNumber]: byQuestion }));
    } catch (e) {
      console.error("Failed to fetch answers:", e);
    } finally {
      setLoadingAnswers(false);
    }
  };

  const handleStudentNav = async (newIdx) => {
    setStudentIdx(newIdx);
    setComments("");
    const s = students[newIdx];
    if (s) await fetchStudentAnswers(s.roll_number);
  };

  const handleSubmitReview = async () => {
    const student = students[studentIdx];
    if (!student) return;

    // Validate all marks filled
    for (const ev of student.evaluations) {
      const v = parseFloat(marksOverride[ev.id]);
      if (isNaN(v) || v < 0 || v > ev.max_marks) {
        alert(`Invalid marks for Q${questionNumber(ev.question_id)}. Must be 0–${ev.max_marks}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Submit review for every question evaluation of this student
      await Promise.all(student.evaluations.map(ev => {
        const fd = new FormData();
        fd.append("final_marks",      parseFloat(marksOverride[ev.id]));
        fd.append("faculty_comments", comments);
        return API.put(`/evaluations/${ev.id}/review`, fd);
      }));

      // Move to next student or go back to results
      if (studentIdx < students.length - 1) {
        await handleStudentNav(studentIdx + 1);
      } else {
        navigate(`/assignment/${assignmentId}/results`);
      }
    } catch (err) {
      alert("Error submitting: " + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // helper: get question number from question_id
  const questionNumber = (qid) => {
    const q = questions.find(q => q.id === qid);
    return q ? q.question_number : "?";
  };
  const questionText = (qid) => {
    const q = questions.find(q => q.id === qid);
    return q ? q.question_text : "";
  };
  const questionMarks = (qid) => {
    const q = questions.find(q => q.id === qid);
    return q ? q.marks : 0;
  };

  // ── empty / loading states ──────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <div className="loading-spinner" style={{ margin: "0 auto 16px", borderColor: "var(--border-light)", borderTopColor: "var(--accent-color)" }} />
        <p style={{ color: "var(--text-secondary)" }}>Loading reviews…</p>
      </div>
    </div>
  );

  if (students.length === 0) return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <button onClick={() => navigate(`/assignment/${assignmentId}`)} className="btn btn-secondary" style={{ marginBottom: 24, display: "inline-flex" }}>
        <ArrowLeft size={18} /> Back to Assignment
      </button>
      <div className="card" style={{ padding: "60px 40px", textAlign: "center" }}>
        <div style={{ background: "#dcfce7", width: 80, height: 80, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", color: "#15803d" }}>
          <ShieldCheck size={40} />
        </div>
        <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 12 }}>No Evaluations Yet</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>No answer scripts have been evaluated for this assignment yet. Upload scripts first.</p>
        <button onClick={() => navigate(`/assignment/${assignmentId}/upload-answers`)} className="btn btn-primary">
          Upload Answer Scripts
        </button>
      </div>
    </div>
  );

  // ── render ───────────────────────────────────────────────
  const student     = students[studentIdx];
  const studentAns  = answers[student.roll_number] || {};

  // Sort evaluations by question number
  const sortedEvals = [...student.evaluations].sort(
    (a, b) => questionNumber(a.question_id) - questionNumber(b.question_id)
  );

  // Overall stats
  const totalAI    = sortedEvals.reduce((s, e) => s + e.total_marks, 0);
  const totalMax   = sortedEvals.reduce((s, e) => s + e.max_marks, 0);
  const totalFinal = sortedEvals.reduce((s, e) => s + (parseFloat(marksOverride[e.id]) || 0), 0);
  const avgConf    = sortedEvals.reduce((s, e) => s + e.confidence_score, 0) / sortedEvals.length;
  const cs         = confStyle(avgConf);

  // Review status for current student
  const needsReview   = sortedEvals.some(e => e.needs_review && !e.reviewed);
  const alreadyReviewed = sortedEvals.every(e => e.reviewed);
  const reviewStatusLabel = alreadyReviewed ? "✓ Already Reviewed"
    : needsReview ? "⚠ Needs Review"
    : "✓ High Confidence";
  const reviewStatusStyle = alreadyReviewed
    ? { bg: "#dcfce7", color: "#15803d" }
    : needsReview
    ? { bg: "#fef9c3", color: "#92400e" }
    : { bg: "#dbeafe", color: "#1d4ed8" };

  // Counts for header
  const needsReviewCount = students.filter(s => s.evaluations.some(e => e.needs_review && !e.reviewed)).length;
  const reviewedCount    = students.filter(s => s.evaluations.every(e => e.reviewed)).length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", width: "100%" }}>

      {/* ── Top bar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <button
          onClick={() => navigate(-1)}
          className="btn btn-secondary" style={{ display: "inline-flex" }}
        >
          <ArrowLeft size={18} /> Back to Results
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Status summary pills */}
          {needsReviewCount > 0 && (
            <span style={{ background: "#fef9c3", color: "#92400e", padding: "4px 12px", borderRadius: 99, fontSize: "0.8rem", fontWeight: 700 }}>
              ⚠ {needsReviewCount} need review
            </span>
          )}
          {reviewedCount > 0 && (
            <span style={{ background: "#dcfce7", color: "#15803d", padding: "4px 12px", borderRadius: 99, fontSize: "0.8rem", fontWeight: 700 }}>
              ✓ {reviewedCount} reviewed
            </span>
          )}
          <span style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Student {studentIdx + 1} of {students.length}
          </span>
          <button onClick={() => handleStudentNav(Math.max(0, studentIdx - 1))}
            disabled={studentIdx === 0} className="btn btn-secondary" style={{ padding: 8 }}>
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => handleStudentNav(Math.min(students.length - 1, studentIdx + 1))}
            disabled={studentIdx === students.length - 1} className="btn btn-secondary" style={{ padding: 8 }}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Student header card ── */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>

          {/* Left: name + confidence */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ padding: 14, background: "var(--accent-light)", borderRadius: 14, color: "var(--accent-color)" }}>
              <User size={28} />
            </div>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {student.student_name}
              </h2>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Roll: {student.roll_number}
              </span>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {/* Overall confidence badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, background: cs.bg, padding: "7px 14px", borderRadius: 8, border: `1px solid ${cs.color}30` }}>
                  {avgConf >= 0.85 ? <CheckCircle size={15} color={cs.color} /> : <AlertTriangle size={15} color={cs.color} />}
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: cs.color }}>
                    Overall AI Confidence: {(avgConf * 100).toFixed(1)}% — {cs.label}
                  </span>
                </div>
                {/* Review status badge */}
                <span style={{
                  background: reviewStatusStyle.bg, color: reviewStatusStyle.color,
                  padding: "7px 14px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 700
                }}>
                  {reviewStatusLabel}
                </span>
                <span style={{ fontSize: "0.82rem", color: "var(--text-tertiary)" }}>
                  ({sortedEvals.length} question{sortedEvals.length !== 1 ? "s" : ""} evaluated)
                </span>
              </div>
            </div>
          </div>

          {/* Right: score summary */}
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ textAlign: "center", background: "var(--bg-secondary)", padding: "14px 20px", borderRadius: 12, border: "1px solid var(--border-light)", minWidth: 110 }}>
              <p style={{ margin: "0 0 4px", fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>AI Score</p>
              <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "var(--accent-color)" }}>
                {totalAI.toFixed(1)}<span style={{ fontSize: "1rem", color: "var(--text-tertiary)", fontWeight: 600 }}>/{totalMax}</span>
              </p>
            </div>
            <div style={{ textAlign: "center", background: "#f0fdf4", padding: "14px 20px", borderRadius: 12, border: "1px solid #bbf7d0", minWidth: 110 }}>
              <p style={{ margin: "0 0 4px", fontSize: "0.72rem", color: "#15803d", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Score</p>
              <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#15803d" }}>
                {totalFinal.toFixed(1)}<span style={{ fontSize: "1rem", color: "#6ee7b7", fontWeight: 600 }}>/{totalMax}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Per-question cards ── */}
      {loadingAnswers && (
        <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
          Loading student answers…
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
        {sortedEvals.map((ev) => {
          const qNum    = questionNumber(ev.question_id);
          const qText   = questionText(ev.question_id);
          const qMax    = ev.max_marks;
          const ansText = studentAns[ev.question_id] || null;
          const isOpen  = expanded[ev.question_id] !== false;
          const ecs     = confStyle(ev.confidence_score);
          const qFinal  = parseFloat(marksOverride[ev.id]) || 0;

          return (
            <div key={ev.id} className="card" style={{ padding: 0, overflow: "hidden" }}>

              {/* Question header — always visible, click to expand/collapse */}
              <div
                onClick={() => setExpanded(p => ({ ...p, [ev.question_id]: !isOpen }))}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "16px 22px", cursor: "pointer",
                  background: isOpen ? "#f8faff" : "white",
                  borderBottom: isOpen ? "1px solid var(--border-light)" : "none"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <span style={{
                    background: "var(--accent-color)", color: "white",
                    padding: "4px 11px", borderRadius: 7, fontSize: "0.82rem", fontWeight: 700, flexShrink: 0
                  }}>Q{qNum}</span>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {qText || `Question ${qNum}`}
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0, marginLeft: 16 }}>
                  {/* Per-question confidence */}
                  <span style={{ background: ecs.bg, color: ecs.color, padding: "3px 10px", borderRadius: 99, fontSize: "0.78rem", fontWeight: 700 }}>
                    {(ev.confidence_score * 100).toFixed(0)}% conf
                  </span>
                  {/* AI score */}
                  <span style={{ fontSize: "0.88rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                    AI: <b style={{ color: "var(--text-primary)" }}>{ev.total_marks.toFixed(1)}</b>/{qMax}
                  </span>
                  {/* Your override */}
                  <span style={{ fontSize: "0.88rem", color: "#15803d", fontWeight: 600 }}>
                    You: <b>{qFinal.toFixed(1)}</b>/{qMax}
                  </span>
                  {isOpen ? <ChevronUp size={18} color="var(--text-tertiary)" /> : <ChevronDown size={18} color="var(--text-tertiary)" />}
                </div>
              </div>

              {/* Question body — collapsible */}
              {isOpen && (
                <div style={{ padding: "20px 22px" }}>

                  {/* Student's Answer */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ padding: 6, background: "#ede9fe", borderRadius: 7, color: "#7c3aed" }}>
                        <MessageSquare size={14} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>Student's Answer</span>
                    </div>
                    <div style={{
                      background: "#fafafa", border: "1px solid var(--border-light)",
                      borderRadius: 10, padding: "14px 16px",
                      fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.65,
                      maxHeight: 160, overflowY: "auto"
                    }}>
                      {ansText
                        ? ansText
                        : <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>Answer text not available.</span>
                      }
                    </div>
                  </div>

                  {/* Concept Breakdown */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ padding: 6, background: "#e0f2fe", borderRadius: 7, color: "#0369a1" }}>
                        <BookOpen size={14} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>Rubric Concept Breakdown</span>
                      <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                        Total: {ev.total_marks.toFixed(1)} / {qMax} marks
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {ev.concept_scores.map((cs_item, cidx) => {
                        const mColor = cs_item.similarity_score >= 0.80 ? "#15803d"
                          : cs_item.similarity_score >= 0.60 ? "#92400e" : "#b91c1c";
                        const mBg = cs_item.similarity_score >= 0.80 ? "#dcfce7"
                          : cs_item.similarity_score >= 0.60 ? "#fef9c3" : "#fee2e2";
                        return (
                          <div key={cidx} style={{
                            background: "var(--bg-secondary)", border: "1px solid var(--border-light)",
                            borderRadius: 9, padding: "12px 14px"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", gap: 8, flex: 1 }}>
                                <span style={{ background: "var(--accent-light)", color: "var(--accent-color)", padding: "2px 8px", borderRadius: 5, fontSize: "0.72rem", fontWeight: 700, flexShrink: 0, height: "fit-content", marginTop: 2 }}>
                                  C{cidx + 1}
                                </span>
                                <p style={{ margin: 0, fontSize: "0.87rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                                  {cs_item.concept}
                                </p>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                                <span style={{ background: mBg, color: mColor, padding: "3px 9px", borderRadius: 99, fontSize: "0.75rem", fontWeight: 700 }}>
                                  {(cs_item.similarity_score * 100).toFixed(0)}% match
                                </span>
                                <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                                  {cs_item.awarded_marks.toFixed(2)}/{cs_item.max_marks}
                                </span>
                              </div>
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <ScoreBar value={cs_item.similarity_score} max={1} color={mColor} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Per-question marks override */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0" }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#15803d" }}>
                      Final marks for Q{qNum}:
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={qMax}
                      step={0.5}
                      value={marksOverride[ev.id] ?? ev.total_marks}
                      onChange={e => setMarksOverride(p => ({ ...p, [ev.id]: e.target.value }))}
                      style={{
                        width: 80, padding: "6px 10px", border: "1.5px solid #86efac",
                        borderRadius: 8, fontSize: "1rem", fontWeight: 700,
                        color: "#15803d", background: "white", outline: "none"
                      }}
                    />
                    <span style={{ fontSize: "0.88rem", color: "#6b7280" }}>/ {qMax} marks</span>
                    <button
                      onClick={() => setMarksOverride(p => ({ ...p, [ev.id]: String(ev.total_marks) }))}
                      style={{ marginLeft: "auto", fontSize: "0.78rem", background: "none", border: "none", color: "#6b7280", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Reset to AI
                    </button>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Faculty decision ── */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)" }}>
          Faculty Decision — {student.student_name}
        </h3>

        {/* Total summary */}
        <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ padding: "10px 18px", background: "var(--bg-secondary)", borderRadius: 9, border: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 2 }}>AI TOTAL</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--accent-color)" }}>{totalAI.toFixed(1)} / {totalMax}</span>
          </div>
          <div style={{ padding: "10px 18px", background: "#f0fdf4", borderRadius: 9, border: "1px solid #bbf7d0" }}>
            <span style={{ fontSize: "0.78rem", color: "#15803d", fontWeight: 600, display: "block", marginBottom: 2 }}>YOUR TOTAL</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#15803d" }}>{totalFinal.toFixed(1)} / {totalMax}</span>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Comments (Optional — applies to all questions for this student)</label>
          <textarea
            className="form-input"
            value={comments}
            onChange={e => setComments(e.target.value)}
            placeholder="Add any feedback or notes about this student's overall performance…"
            style={{ minHeight: 90, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid var(--border-light)" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-tertiary)" }}>
            Submitting {sortedEvals.length} question review{sortedEvals.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleSubmitReview}
            disabled={submitting}
            className="btn btn-primary"
            style={{ padding: "12px 28px", fontSize: "1rem" }}
          >
            <Check size={18} />
            {submitting ? "Saving…" : studentIdx < students.length - 1 ? "Confirm & Next Student" : "Confirm & Finish"}
          </button>
        </div>
      </div>
    </div>
  );
}
