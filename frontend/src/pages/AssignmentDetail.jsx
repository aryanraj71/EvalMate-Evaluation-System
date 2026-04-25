import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import { ArrowLeft, FileQuestion, BookOpen, Upload, BarChart, Eye, Edit2, Save, X, RefreshCw } from "lucide-react";

export function AssignmentDetail() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [stats, setStats] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    assignment_name: "",
    subject: "",
    date: "",
    maximum_marks: ""
  });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAssignment();
    fetchStats();
  }, [assignmentId]);

  const fetchAssignment = async () => {
    try {
      const assignmentRes = await API.get(`/assignments/${assignmentId}`);
      setAssignment(assignmentRes.data);
      setEditData({
        assignment_name: assignmentRes.data.assignment_name,
        subject: assignmentRes.data.subject,
        date: assignmentRes.data.date,
        maximum_marks: assignmentRes.data.maximum_marks
      });
    } catch (err) {
      console.error("Error fetching assignment:", err);
    }
  };

  const fetchStats = async () => {
    try {
      const statsRes = await API.get(`/statistics/assignment/${assignmentId}`);
      setStats(statsRes.data);
    } catch (statsErr) {
      console.error("Error fetching stats:", statsErr);
      setStats({ total_questions: 0, total_students: 0, completed: 0, needs_review: 0 });
    }
  };

  const fetchData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    await Promise.allSettled([fetchAssignment(), fetchStats()]);
    if (showRefreshing) setRefreshing(false);
  };

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    if (assignment) {
      setEditData({
        assignment_name: assignment.assignment_name,
        subject: assignment.subject,
        date: assignment.date,
        maximum_marks: assignment.maximum_marks
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editData.assignment_name || !editData.subject || !editData.date || !editData.maximum_marks) {
      alert("Please fill in all fields");
      return;
    }

    setSaving(true);
    try {
      const updatePayload = {
        assignment_name: editData.assignment_name,
        subject: editData.subject,
        date: editData.date,
        maximum_marks: parseFloat(editData.maximum_marks)
      };

      await API.put(`/assignments/${assignmentId}`, updatePayload);
      alert("✅ Assignment updated successfully!");
      setEditMode(false);
      fetchData();
    } catch (err) {
      alert("❌ Error updating assignment: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
  };

  return (
    <div className="page-wrapper">
      <button
        onClick={() => navigate("/dashboard")}
        className="btn btn-secondary"
        style={{ marginBottom: '24px', display: 'inline-flex' }}
      >
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <div className="card" style={{ padding: '32px' }}>
        {assignment ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
              <div style={{ flex: 1, marginRight: '24px' }}>
                {editMode ? (
                  <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderRadius: '12px' }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '600' }}>Edit Assignment Details</h3>
                    <div className="form-group">
                      <label className="form-label">Assignment Name</label>
                      <input
                        type="text"
                        name="assignment_name"
                        className="form-input"
                        value={editData.assignment_name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="grid grid-2" style={{ gap: '20px' }}>
                      <div className="form-group">
                        <label className="form-label">Subject</label>
                        <input
                          type="text"
                          name="subject"
                          className="form-input"
                          value={editData.subject}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date</label>
                        <input
                          type="date"
                          name="date"
                          className="form-input"
                          value={editData.date}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group" style={{ maxWidth: '50%' }}>
                      <label className="form-label">Maximum Marks</label>
                      <input
                        type="number"
                        name="maximum_marks"
                        className="form-input"
                        value={editData.maximum_marks}
                        onChange={handleChange}
                        required
                        min="1"
                        step="0.5"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                      <button
                        onClick={handleSaveEdit}
                        className="btn btn-primary"
                        disabled={saving}
                      >
                        <Save size={16} />
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                      <button onClick={handleCancelEdit} className="btn btn-secondary">
                        <X size={16} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h1 className="card-title" style={{ fontSize: '2rem', marginBottom: '16px' }}>
                      {assignment.assignment_name}
                    </h1>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span className="badge badge-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>{assignment.subject}</span>
                      <span className="badge badge-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>{assignment.date}</span>
                      <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>{assignment.maximum_marks} Marks</span>
                    </div>
                  </div>
                )}
              </div>

              {!editMode && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => fetchData(true)}
                    className="btn btn-secondary"
                    disabled={refreshing}
                    title="Refresh statistics"
                    style={{ padding: '10px' }}
                  >
                    <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
                  </button>
                  <button onClick={handleEdit} className="btn btn-primary" style={{ padding: '10px 20px' }}>
                    <Edit2 size={18} />
                    Edit Details
                  </button>
                </div>
              )}
            </div>

            {!editMode && stats && (
              <div className="stats-grid" style={{ marginBottom: '32px' }}>
                <div className="stat-card">
                  <div className="stat-label">Total Questions</div>
                  <div className="stat-value">{stats.total_questions}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Students</div>
                  <div className="stat-value">{stats.total_students}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Evaluated</div>
                  <div className="stat-value">{stats.completed}</div>
                </div>
                <div className="stat-card" style={{ background: stats.needs_review > 0 ? 'var(--warning-bg)' : 'white' }}>
                  <div className="stat-label" style={{ color: stats.needs_review > 0 ? 'var(--warning)' : 'inherit' }}>Needs Review</div>
                  <div className="stat-value" style={{ color: stats.needs_review > 0 ? 'var(--warning)' : 'inherit' }}>{stats.needs_review}</div>
                </div>
              </div>
            )}

            {!editMode && (
              <>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>Assignment Workflows</h3>
                <div className="grid grid-2" style={{ gap: '16px' }}>
                  <button
                    onClick={() => navigate(`/assignment/${assignmentId}/questions`)}
                    className="action-card"
                    style={{ textAlign: 'left', border: 'none', background: 'var(--bg-tertiary)', width: '100%', alignItems: 'flex-start' }}
                  >
                    <div style={{ padding: '12px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '12px', marginBottom: '16px' }}>
                      <FileQuestion size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Manage Questions</h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Add, edit, or remove questions for this assignment.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate(`/assignment/${assignmentId}/rubrics`)}
                    className="action-card"
                    style={{ textAlign: 'left', border: 'none', background: 'var(--bg-tertiary)', width: '100%', alignItems: 'flex-start' }}
                  >
                    <div style={{ padding: '12px', background: 'var(--info-bg)', color: 'var(--info)', borderRadius: '12px', marginBottom: '16px' }}>
                      <BookOpen size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Define Rubrics</h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Set up evaluation criteria to ensure consistent grading.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate(`/assignment/${assignmentId}/upload-answers`)}
                    className="action-card"
                    style={{ textAlign: 'left', border: 'none', background: 'var(--bg-tertiary)', width: '100%', alignItems: 'flex-start' }}
                  >
                    <div style={{ padding: '12px', background: 'var(--success-bg)', color: 'var(--success)', borderRadius: '12px', marginBottom: '16px' }}>
                      <Upload size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Upload Scripts</h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Upload student answer scripts for AI evaluation.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate(`/assignment/${assignmentId}/results`)}
                    className="action-card"
                    style={{ textAlign: 'left', border: 'none', background: 'var(--bg-tertiary)', width: '100%', alignItems: 'flex-start' }}
                  >
                    <div style={{ padding: '12px', background: 'var(--accent-light)', color: 'var(--accent-color)', borderRadius: '12px', marginBottom: '16px' }}>
                      <BarChart size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>View Results</h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Analyze grading statistics and student performance.</p>
                    </div>
                  </button>
                </div>

                {stats && stats.needs_review > 0 && (
                  <div style={{ marginTop: '24px', background: 'var(--warning-bg)', padding: '24px', borderRadius: '12px', border: '1px solid var(--warning)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                      <Eye size={24} color="var(--warning)" />
                      <div>
                        <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Reviews Pending</h4>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{stats.needs_review} answer(s) require manual review due to low confidence.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/assignment/${assignmentId}/review`)}
                      className="btn btn-primary"
                      style={{ background: 'var(--warning)', color: 'white', border: 'none' }}
                    >
                      Start Review
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div>
            <div style={{ height: '40px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '20px', width: '50%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
              <div style={{ height: '30px', width: '100px', background: 'var(--bg-tertiary)', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: '30px', width: '100px', background: 'var(--bg-tertiary)', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>

            <div className="grid grid-2" style={{ gap: '16px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: '140px', background: 'var(--bg-tertiary)', borderRadius: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .spinning {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
export default AssignmentDetail;
