import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import {
  FolderOpen, ChevronRight, ChevronDown, Edit2, Trash2, Save, X,
  FileText, Users, CheckCircle, AlertCircle, BookOpen, Upload,
  BarChart2, Plus, Eye, RefreshCw
} from "lucide-react";

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ background: "white", borderRadius: 16, padding: "32px", maxWidth: 420, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 10, background: "#fee2e2", borderRadius: 10, color: "#b91c1c" }}>
            <Trash2 size={20} />
          </div>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Delete Assignment</h3>
        </div>
        <p style={{ color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button onClick={onConfirm} style={{
            padding: "10px 20px", background: "#ef4444", color: "white", border: "none",
            borderRadius: 8, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6
          }}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function StatChip({ icon, label, value, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 14px", background: "var(--bg-secondary)", borderRadius: 8,
      border: "1px solid var(--border-light)"
    }}>
      <span style={{ color }}>{icon}</span>
      <div>
        <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>{value}</p>
      </div>
    </div>
  );
}

export default function Assignments() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({}); // { [id]: { stats, questions } }
  const [loadingDetail, setLoadingDetail] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // assignment to delete

  useEffect(() => { fetchAssignments(); }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const res = await API.get("/assignments");
      setAssignments(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    if (details[id]) return; // already loaded
    setLoadingDetail(p => ({ ...p, [id]: true }));
    try {
      const [statsRes, questionsRes] = await Promise.allSettled([
        API.get(`/statistics/assignment/${id}`),
        API.get(`/assignments/${id}/questions`)
      ]);
      setDetails(p => ({
        ...p,
        [id]: {
          stats: statsRes.status === "fulfilled" ? statsRes.value.data : null,
          questions: questionsRes.status === "fulfilled" ? questionsRes.value.data : []
        }
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(p => ({ ...p, [id]: false }));
    }
  };

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadDetail(id);
    }
  };

  const startEdit = (a) => {
    setEditingId(a.id);
    setEditData({
      assignment_name: a.assignment_name,
      subject: a.subject,
      date: a.date,
      maximum_marks: a.maximum_marks
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async (id) => {
    if (!editData.assignment_name || !editData.subject || !editData.date || !editData.maximum_marks) {
      alert("Please fill in all fields"); return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      Object.entries(editData).forEach(([k, v]) => form.append(k, v));
      await API.put(`/assignments/${id}`, form);
      await fetchAssignments();
      setDetails(p => { const c = { ...p }; delete c[id]; return c; }); // invalidate cache
      setEditingId(null);
    } catch (e) {
      alert("Error saving: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteAssignment = async () => {
    if (!confirmDelete) return;
    try {
      await API.delete(`/assignments/${confirmDelete.id}`);
      setAssignments(p => p.filter(a => a.id !== confirmDelete.id));
      if (expandedId === confirmDelete.id) setExpandedId(null);
      setDetails(p => { const c = { ...p }; delete c[confirmDelete.id]; return c; });
    } catch (e) {
      alert("Error deleting: " + e.message);
    } finally {
      setConfirmDelete(null);
    }
  };

  const refreshDetail = async (id) => {
    setDetails(p => { const c = { ...p }; delete c[id]; return c; });
    await loadDetail(id);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
      {confirmDelete && (
        <ConfirmDialog
          message={`Are you sure you want to delete "${confirmDelete.assignment_name}"? This will also delete all questions, rubrics, and student evaluations.`}
          onConfirm={confirmDeleteAssignment}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ padding: 12, background: "var(--accent-light)", borderRadius: 12, color: "var(--accent-color)" }}>
            <FolderOpen size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Assignments</h2>
            <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: "0.9rem" }}>
              {assignments.length} assignment{assignments.length !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>
        <button onClick={() => navigate("/create-assignment")} className="btn btn-primary">
          <Plus size={18} /> New Assignment
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 16px", borderColor: "var(--border-light)", borderTopColor: "var(--accent-color)" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading assignments…</p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📚</div>
          <h3 className="empty-state-title">No assignments yet</h3>
          <p className="empty-state-text">Create your first assignment to get started.</p>
          <button onClick={() => navigate("/create-assignment")} className="btn btn-primary">
            <Plus size={18} /> Create Assignment
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {assignments.map(a => {
            const isExpanded = expandedId === a.id;
            const isEditing = editingId === a.id;
            const d = details[a.id];
            const isLoadingDetail = loadingDetail[a.id];

            return (
              <div key={a.id} className="card" style={{ padding: 0, overflow: "hidden", transition: "box-shadow 0.2s" }}>
                {/* Assignment row header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "18px 22px", cursor: "pointer",
                  borderBottom: isExpanded ? "1px solid var(--border-light)" : "none"
                }}
                  onClick={() => toggleExpand(a.id)}>
                  <div style={{
                    padding: 10, borderRadius: 10,
                    background: isExpanded ? "var(--accent-color)" : "var(--accent-light)",
                    color: isExpanded ? "white" : "var(--accent-color)", transition: "all 0.2s", flexShrink: 0
                  }}>
                    <BookOpen size={18} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>{a.assignment_name}</h3>
                      <span className="badge badge-primary" style={{ fontSize: "0.72rem" }}>{a.subject}</span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "var(--text-tertiary)" }}>
                      {a.date} · {a.maximum_marks} marks
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => startEdit(a)}
                      title="Edit"
                      style={{ padding: "7px 10px", background: "var(--bg-secondary)", border: "1px solid var(--border-light)", borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(a)}
                      title="Delete"
                      style={{ padding: "7px 10px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, cursor: "pointer", color: "#b91c1c", display: "flex", alignItems: "center" }}
                    >
                      <Trash2 size={15} />
                    </button>
                    <div style={{ color: "var(--text-tertiary)", marginLeft: 4 }}>
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>
                </div>

                {/* Edit form */}
                {isEditing && (
                  <div style={{ padding: "20px 22px", background: "#f8faff", borderBottom: "1px solid var(--border-light)" }}>
                    <h4 style={{ margin: "0 0 16px", fontWeight: 700, color: "var(--text-primary)" }}>Edit Assignment</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      {[
                        { label: "Assignment Name", key: "assignment_name", type: "text" },
                        { label: "Subject",          key: "subject",         type: "text" },
                        { label: "Date",             key: "date",            type: "date" },
                        { label: "Maximum Marks",    key: "maximum_marks",   type: "number" },
                      ].map(f => (
                        <div key={f.key}>
                          <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 5 }}>{f.label}</label>
                          <input
                            type={f.type}
                            className="form-input"
                            value={editData[f.key] || ""}
                            onChange={e => setEditData(p => ({ ...p, [f.key]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                      <button onClick={() => saveEdit(a.id)} disabled={saving} className="btn btn-primary" style={{ minWidth: 110 }}>
                        {saving ? <><RefreshCw size={15} className="spinning" /> Saving…</> : <><Save size={15} /> Save Changes</>}
                      </button>
                      <button onClick={cancelEdit} className="btn btn-secondary"><X size={15} /> Cancel</button>
                    </div>
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "20px 22px" }}>
                    {isLoadingDetail ? (
                      <div style={{ textAlign: "center", padding: "24px 0" }}>
                        <div className="loading-spinner" style={{ margin: "0 auto 10px", width: 28, height: 28, borderColor: "var(--border-light)", borderTopColor: "var(--accent-color)" }} />
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>Loading details…</p>
                      </div>
                    ) : d ? (
                      <>
                        {/* Stats chips */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                          <StatChip icon={<FileText size={15} />}   label="Questions"     value={d.stats?.total_questions ?? "—"} color="#6366f1" />
                          <StatChip icon={<Users size={15} />}       label="Scripts"       value={d.stats?.total_students ?? "—"}  color="#22c55e" />
                          <StatChip icon={<CheckCircle size={15} />} label="Evaluated"     value={d.stats?.completed ?? "—"}       color="#0ea5e9" />
                          <StatChip icon={<AlertCircle size={15} />} label="Needs Review"  value={d.stats?.needs_review ?? "—"}    color="#f59e0b" />
                        </div>

                        {/* Questions list */}
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <h4 style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>Questions & Rubrics</h4>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => refreshDetail(a.id)} title="Refresh" style={{ padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border-light)", borderRadius: 7, cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>
                                <RefreshCw size={13} />
                              </button>
                              <button onClick={() => navigate(`/assignment/${a.id}/questions`)} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "0.82rem" }}>
                                <Edit2 size={13} /> Manage Questions
                              </button>
                            </div>
                          </div>

                          {d.questions.length === 0 ? (
                            <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: 10, textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.88rem" }}>
                              No questions added yet. <span style={{ color: "var(--accent-color)", cursor: "pointer", fontWeight: 600 }} onClick={() => navigate(`/assignment/${a.id}/questions`)}>Add Questions →</span>
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                              {d.questions.map((q, i) => (
                                <div key={q.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: "var(--bg-secondary)", borderRadius: 9, border: "1px solid var(--border-light)" }}>
                                  <span style={{ fontWeight: 700, color: "var(--accent-color)", fontSize: "0.85rem", flexShrink: 0, marginTop: 1 }}>Q{q.question_number}</span>
                                  <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-primary)", flex: 1, lineHeight: 1.5 }}>{q.question_text || "No text"}</p>
                                  <span style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", fontWeight: 600, flexShrink: 0 }}>{q.marks} marks</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border-light)" }}>
                          <button onClick={() => navigate(`/assignment/${a.id}`)} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
                            <Eye size={15} /> Full Detail
                          </button>
                          <button onClick={() => navigate(`/assignment/${a.id}/questions`)} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
                            <FileText size={15} /> Questions
                          </button>
                          <button onClick={() => navigate(`/assignment/${a.id}/rubrics`)} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
                            <BookOpen size={15} /> Rubrics
                          </button>
                          <button onClick={() => navigate(`/assignment/${a.id}/upload-answers`)} className="btn btn-secondary" style={{ fontSize: "0.85rem" }}>
                            <Upload size={15} /> Upload Scripts
                          </button>
                          <button onClick={() => navigate(`/assignment/${a.id}/results`)} className="btn btn-primary" style={{ fontSize: "0.85rem" }}>
                            <BarChart2 size={15} /> View Results
                          </button>
                        </div>
                      </>
                    ) : (
                      <p style={{ color: "var(--text-tertiary)", textAlign: "center", padding: "16px 0" }}>Could not load details.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
