import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import {
  BarChart2, ChevronDown, FileText, Users, CheckCircle, Clock,
  AlertCircle, Download, RefreshCw, Search, Eye, Trash2, X
} from "lucide-react";

function ScoreBadge({ score, max }) {
  if (score == null || max == null || max === 0) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  const pct = (score / max) * 100;
  const color = pct >= 80 ? "#16a34a" : pct >= 60 ? "#d97706" : "#b91c1c";
  const bg    = pct >= 80 ? "#dcfce7" : pct >= 60 ? "#fef9c3" : "#fee2e2";
  return (
    <span style={{ background: bg, color, padding: "3px 10px", borderRadius: 99, fontWeight: 700, fontSize: "0.82rem" }}>
      {score.toFixed(1)}/{max} ({pct.toFixed(0)}%)
    </span>
  );
}

// ── Confirmation dialog ──────────────────────────────────────────────────────
function DeleteConfirmModal({ student, onConfirm, onCancel, deleting }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24
    }}>
      <div style={{
        background: "white", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%",
        boxShadow: "0 25px 50px rgba(0,0,0,0.2)", animation: "fadeUp 0.2s ease"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ padding: 10, background: "var(--danger-bg)", borderRadius: 10, color: "var(--danger)", flexShrink: 0 }}>
              <Trash2 size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Delete Student Records
            </h3>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ background: "var(--danger-bg)", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
          <p style={{ margin: 0, color: "var(--danger-text)", fontSize: "0.92rem", fontWeight: 500 }}>
            ⚠ This will permanently delete all uploaded scripts, answers and evaluations for:
          </p>
          <p style={{ margin: "8px 0 0", fontWeight: 700, color: "var(--danger)", fontSize: "1rem" }}>
            {student.student_name} &nbsp;·&nbsp; Roll: {student.roll_number}
          </p>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0 0 24px" }}>
          This action cannot be undone. Are you sure you want to proceed?
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="btn btn-secondary" disabled={deleting}>
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-danger" disabled={deleting}
            style={{ background: "var(--danger)", color: "white" }}>
            {deleting ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Results() {
  const navigate = useNavigate();
  const [assignments, setAssignments]           = useState([]);
  const [selectedId, setSelectedId]             = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [dropdownOpen, setDropdownOpen]         = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  const [allStudents, setAllStudents]           = useState([]);
  const [loadingResults, setLoadingResults]     = useState(false);
  const [refreshing, setRefreshing]             = useState(false);
  const [searchQuery, setSearchQuery]           = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget]         = useState(null); // student object
  const [deleting, setDeleting]                 = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    API.get("/assignments")
      .then(res => setAssignments(res.data))
      .catch(console.error)
      .finally(() => setLoadingAssignments(false));
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const h = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dropdownOpen]);

  const fetchResults = async (id, showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoadingResults(true);
    try {
      let answers = [];
      try {
        const aRes = await API.get(`/student-answers/assignment/${id}`);
        answers = aRes.data;
      } catch { /* fallback */ }

      const evalRes = await API.get(`/evaluations/assignment/${id}`);
      const evals = evalRes.data;

      const evalMap = {};
      evals.forEach(ev => {
        const key = `${ev.student_name}__${ev.roll_number}`;
        if (!evalMap[key]) {
          evalMap[key] = {
            student_name: ev.student_name, roll_number: ev.roll_number,
            total_marks: 0, max_marks: 0, evaluations: [], needs_review: false
          };
        }
        evalMap[key].total_marks += ev.reviewed ? (ev.final_marks ?? ev.total_marks) : ev.total_marks;
        evalMap[key].max_marks   += ev.max_marks;
        evalMap[key].evaluations.push(ev);
        if (ev.needs_review && !ev.reviewed) evalMap[key].needs_review = true;
      });

      const studentMap = {};
      answers.forEach(ans => {
        const key = `${ans.student_name}__${ans.roll_number}`;
        studentMap[key] = { student_name: ans.student_name, roll_number: ans.roll_number };
      });

      const list = Object.keys({ ...studentMap, ...evalMap }).map(key => {
        if (evalMap[key]) return { ...evalMap[key], status: evalMap[key].needs_review ? "review" : "evaluated" };
        return { ...studentMap[key], total_marks: 0, max_marks: 0, evaluations: [], status: "pending" };
      });

      // Sort by roll number (stable — doesn't jump around on refresh)
      list.sort((a, b) => {
        const ra = String(a.roll_number || "").padStart(12, "0");
        const rb = String(b.roll_number || "").padStart(12, "0");
        return ra.localeCompare(rb);
      });
      setAllStudents(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingResults(false);
      setRefreshing(false);
    }
  };

  const handleSelect = (a) => {
    setSelectedId(a.id);
    setSelectedAssignment(a);
    setDropdownOpen(false);
    setAllStudents([]);
    fetchResults(a.id);
  };

  const handleExport = async (format) => {
    try {
      const res = await API.get(`/results/export/${selectedId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `results_${selectedId}.${format === "csv" ? "csv" : "xlsx"}`);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (e) { alert("Export error: " + e.message); }
  };

  // ── Delete a student's records ────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Call the delete endpoint on the backend
      await API.delete(
        `/student-records/${selectedId}/${encodeURIComponent(deleteTarget.roll_number)}`
      );
      // Remove from local state immediately
      setAllStudents(prev =>
        prev.filter(s => !(s.roll_number === deleteTarget.roll_number && s.student_name === deleteTarget.student_name))
      );
      setDeleteTarget(null);
    } catch (err) {
      alert("Failed to delete: " + (err.response?.data?.detail || err.message));
    } finally {
      setDeleting(false);
    }
  };

  const filtered = allStudents.filter(s =>
    s.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.roll_number && s.roll_number.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const evaluatedCount = allStudents.filter(s => s.status !== "pending").length;
  const pendingCount   = allStudents.filter(s => s.status === "pending").length;
  const reviewCount    = allStudents.filter(s => s.status === "review").length;
  const avgScore = evaluatedCount > 0
    ? allStudents.filter(s => s.max_marks > 0).reduce((acc, s) => acc + (s.total_marks / s.max_marks * 100), 0) / evaluatedCount
    : null;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", width: "100%" }}>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          student={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ padding: 12, background: "#ede9fe", borderRadius: 12, color: "#7c3aed" }}>
            <BarChart2 size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Results</h2>
            <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: "0.9rem" }}>
              {selectedAssignment ? `Viewing: ${selectedAssignment.assignment_name}` : "Select an assignment to view results"}
            </p>
          </div>
        </div>

        {/* Assignment dropdown */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
              borderRadius: 10, border: "2px solid var(--accent-color)",
              background: selectedId ? "var(--accent-color)" : "white",
              color: selectedId ? "white" : "var(--accent-color)",
              fontWeight: 600, cursor: "pointer", fontSize: "0.9rem", minWidth: 200
            }}
          >
            <FileText size={16} />
            {selectedAssignment ? selectedAssignment.assignment_name : (loadingAssignments ? "Loading…" : "Select Assignment")}
            <ChevronDown size={16} style={{ marginLeft: "auto", transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          {dropdownOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 260,
              background: "white", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              border: "1px solid var(--border-light)", zIndex: 100, overflow: "hidden"
            }}>
              {assignments.map(a => (
                <div key={a.id} onClick={() => handleSelect(a)} style={{
                  padding: "12px 18px", cursor: "pointer", transition: "background 0.15s",
                  background: a.id === selectedId ? "var(--accent-light)" : "white",
                  borderBottom: "1px solid var(--border-light)"
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg-tertiary)"}
                  onMouseLeave={e => e.currentTarget.style.background = a.id === selectedId ? "var(--accent-light)" : "white"}
                >
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{a.assignment_name}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginTop: 2 }}>{a.subject} · {a.maximum_marks} marks</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* No selection */}
      {!selectedId && (
        <div style={{ background: "linear-gradient(135deg,#eef2ff,#f5f3ff)", border: "1px dashed var(--accent-color)", borderRadius: 14, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>📊</div>
          <h3 style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>No assignment selected</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Choose an assignment from the dropdown above to view student results and scores.</p>
        </div>
      )}

      {/* Loading */}
      {selectedId && loadingResults && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 16px", borderColor: "var(--border-light)", borderTopColor: "var(--accent-color)" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading results…</p>
        </div>
      )}

      {/* Results */}
      {selectedId && !loadingResults && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Scripts", value: allStudents.length,  icon: <Users size={20} />,        bg: "#eef2ff", color: "#6366f1" },
              { label: "Evaluated",     value: evaluatedCount,      icon: <CheckCircle size={20} />,   bg: "#dcfce7", color: "#16a34a" },
              { label: "Pending",       value: pendingCount,        icon: <Clock size={20} />,         bg: "#fef9c3", color: "#d97706" },
              { label: "Avg Score",     value: avgScore != null ? `${avgScore.toFixed(1)}%` : "—", icon: <BarChart2 size={20} />, bg: "#f0f9ff", color: "#0369a1" },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ padding: 10, background: c.bg, borderRadius: 10, color: c.color, flexShrink: 0 }}>{c.icon}</div>
                <div>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</p>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: "1.3rem", color: "var(--text-primary)" }}>{c.value}</p>
                </div>
              </div>
            ))}
          </div>

          {pendingCount > 0 && (
            <div style={{ background: "#fef9c3", border: "1px solid #fde68a", color: "#92400e", padding: "12px 18px", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontWeight: 500, fontSize: "0.9rem" }}>
              <Clock size={16} />
              <span><strong>{pendingCount} script(s)</strong> are still being processed by AI.</span>
            </div>
          )}

          {/* Controls */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border-light)", flexWrap: "wrap", gap: 12 }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                <input
                  type="text" placeholder="Search by name or roll no..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: "1px solid var(--border-light)", borderRadius: 8, fontSize: "0.88rem", outline: "none", color: "var(--text-primary)", background: "var(--bg-secondary)" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => fetchResults(selectedId, true)} disabled={refreshing} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
                  <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} /> Refresh
                </button>
                {evaluatedCount > 0 && (
                  <button onClick={() => handleExport("excel")} className="btn btn-primary" style={{ fontSize: "0.85rem" }}>
                    <Download size={14} /> Export Excel
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            {allStudents.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "var(--text-tertiary)" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📋</div>
                <p style={{ fontWeight: 600 }}>No scripts uploaded yet for this assignment.</p>
                <button onClick={() => navigate(`/assignment/${selectedId}/upload-answers`)} className="btn btn-primary" style={{ marginTop: 16 }}>
                  Upload Answer Scripts
                </button>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)" }}>
                      {["#", "Student Name", "SAP / Roll No.", "Score", "Status", "Actions"].map(h => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border-light)", transition: "background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(243,244,246,0.5)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "12px 16px", color: "var(--text-tertiary)", fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)" }}>{s.student_name}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "0.85rem" }}>{s.roll_number || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <ScoreBadge score={s.total_marks} max={s.max_marks} />
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {s.status === "evaluated" && (
                            <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 10px", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600 }}>✓ Evaluated</span>
                          )}
                          {s.status === "review" && (
                            <span style={{ background: "#fef9c3", color: "#92400e", padding: "3px 10px", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600 }}>⚠ Needs Review</span>
                          )}
                          {s.status === "pending" && (
                            <span style={{ background: "#f1f5f9", color: "#64748b", padding: "3px 10px", borderRadius: 99, fontSize: "0.78rem", fontWeight: 600 }}>⏳ Pending</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button
                              onClick={() => navigate(`/assignment/${selectedId}/review`, { state: { startRoll: s.roll_number } })}
                              style={{ padding: "5px 12px", background: "var(--accent-light)", color: "var(--accent-color)", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 5 }}
                            >
                              <Eye size={13} /> Detail
                            </button>
                            <button
                              onClick={() => setDeleteTarget(s)}
                              title="Delete student records"
                              style={{
                                padding: "5px 8px", background: "transparent", color: "var(--text-tertiary)",
                                border: "1px solid var(--border-light)", borderRadius: 7, cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 4,
                                transition: "all 0.15s", fontSize: "0.8rem"
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "#fca5a5"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderColor = "var(--border-light)"; }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && searchQuery && (
                  <div style={{ textAlign: "center", padding: 28, color: "var(--text-tertiary)", fontSize: "0.9rem" }}>
                    No results match "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
