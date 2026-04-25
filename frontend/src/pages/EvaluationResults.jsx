import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import { ArrowLeft, Download, Eye, RefreshCw, Clock, CheckCircle, AlertCircle, Search, BarChart3 } from "lucide-react";

export function EvaluationResults() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(false); // Changed to false - no initial loading screen
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Track whether we still have pending items (to know if polling is needed)
  const [hasPending, setHasPending] = useState(true);

  useEffect(() => {
    fetchEvaluations(false);
  }, [assignmentId]);

  // Only auto-refresh while there are pending items — stop once all done
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(() => fetchEvaluations(false), 8000);
    return () => clearInterval(interval);
  }, [assignmentId, hasPending]);

  const fetchEvaluations = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      // Get all student answers (uploaded scripts) — gracefully handles missing endpoint
      let answers = [];
      try {
        const answersRes = await API.get(`/student-answers/assignment/${assignmentId}`);
        answers = answersRes.data;
      } catch (ansErr) {
        // Fallback: if endpoint doesn't exist yet, derive students from evaluations only
        console.warn("student-answers endpoint not available, using evaluations only");
      }

      // Get evaluations
      const evalRes = await API.get(`/evaluations/assignment/${assignmentId}`);
      const evals = evalRes.data;

      // Group evaluations by student
      const evalMap = {};
      evals.forEach(ev => {
        const key = `${ev.student_name}_${ev.roll_number}`;
        if (!evalMap[key]) {
          evalMap[key] = {
            student_name: ev.student_name,
            roll_number: ev.roll_number,
            evaluations: [],
            total_marks: 0,
            max_marks: 0
          };
        }
        evalMap[key].evaluations.push(ev);
        evalMap[key].total_marks += ev.reviewed ? ev.final_marks : ev.total_marks;
        evalMap[key].max_marks += ev.max_marks;
      });

      // Get all unique students from answers
      const studentMap = {};
      answers.forEach(ans => {
        const key = `${ans.student_name}_${ans.roll_number}`;
        studentMap[key] = {
          student_name: ans.student_name,
          roll_number: ans.roll_number
        };
      });

      // Combine: create list showing all students with their status
      const allStudentsList = Object.keys(studentMap).map(key => {
        if (evalMap[key]) {
          return {
            ...evalMap[key],
            status: 'evaluated'
          };
        } else {
          return {
            ...studentMap[key],
            evaluations: [],
            total_marks: 0,
            max_marks: 0,
            status: 'pending'
          };
        }
      });

      // Sort by roll_number numerically/alphabetically — stable order even after refresh
      allStudentsList.sort((a, b) => {
        const ra = String(a.roll_number || "").padStart(12, "0");
        const rb = String(b.roll_number || "").padStart(12, "0");
        return ra.localeCompare(rb);
      });
      setAllStudents(allStudentsList);
      setEvaluations(evals);
      // Stop polling once nothing is pending
      const pendingNow = allStudentsList.filter(s => s.status === "pending").length;
      setHasPending(pendingNow > 0);
    } catch (err) {
      console.error("Error fetching evaluations:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const res = await API.get(`/export/${format}/${assignmentId}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `results_${assignmentId}.${format === 'csv' ? 'csv' : 'xlsx'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Error exporting: " + err.message);
    }
  };

  // Calculate stats
  const pendingCount = allStudents.filter(s => s.status === 'pending').length;
  const evaluatedCount = allStudents.filter(s => s.status === 'evaluated').length;

  const filteredStudents = allStudents.filter(s =>
    s.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.roll_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-wrapper" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <button onClick={() => navigate(`/assignment/${assignmentId}`)} className="btn btn-secondary" style={{ marginBottom: '24px', display: 'inline-flex' }}>
        <ArrowLeft size={18} />
        Back to Assignment
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '12px' }}>
            <BarChart3 size={32} />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Evaluation Results</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Review AI-generated marks and confidence scores.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchEvaluations(true)}
            className="btn btn-secondary"
            disabled={refreshing}
            style={{ minWidth: '120px' }}
          >
            <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>

          {evaluatedCount > 0 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => handleExport('csv')} className="btn btn-secondary">
                <Download size={18} /> CSV
              </button>
              <button onClick={() => handleExport('excel')} className="btn btn-primary">
                <Download size={18} /> Excel Report
              </button>
            </div>
          )}
        </div>
      </div>

      {pendingCount > 0 && (
        <div style={{
          background: 'var(--warning-bg)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: 'var(--warning)',
          padding: '16px 24px',
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontWeight: '500'
        }}>
          <Clock size={20} className="spinning" />
          <span><strong>{pendingCount} answer script(s)</strong> are currently being evaluated by the AI. This page will auto-refresh.</span>
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: '32px', gap: '24px' }}>
        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
            <BarChart3 size={32} />
          </div>
          <div>
            <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: '500' }}>Total Uploads</p>
            <h3 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>{allStudents.length}</h3>
          </div>
        </div>

        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ padding: '16px', background: 'var(--success-bg)', borderRadius: '12px', color: 'var(--success)' }}>
            <CheckCircle size={32} />
          </div>
          <div>
            <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: '500' }}>Evaluated</p>
            <h3 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>{evaluatedCount}</h3>
          </div>
        </div>

        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ padding: '16px', background: 'var(--warning-bg)', borderRadius: '12px', color: 'var(--warning)' }}>
            <Clock size={32} />
          </div>
          <div>
            <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: '500' }}>Pending</p>
            <h3 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>{pendingCount}</h3>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <h3 className="card-title" style={{ margin: 0 }}>Student Results</h3>

          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by name or roll..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ margin: 0, paddingLeft: '40px' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px', borderColor: 'var(--border-light)', borderTopColor: 'var(--primary)' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading evaluation data...</p>
          </div>
        ) : allStudents.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 20px', minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <BarChart3 size={64} style={{ margin: '0 auto 24px', color: 'var(--border-light)' }} />
            <h3 style={{ fontSize: '1.5rem', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No answer scripts found</h3>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '32px' }}>Upload student submissions to see the AI evaluation results here.</p>
            <button
              onClick={() => navigate(`/assignment/${assignmentId}/upload-answers`)}
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: '1.1rem' }}
            >
              Upload Answers Now
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-light)' }}>
                  <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student Details</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Score</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Confidence</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Review Needs</th>
                  <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No students found matching "{searchQuery}"
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const isEven = idx % 2 === 0;
                    const rowBg = isEven ? 'var(--bg-secondary)' : 'var(--bg-primary)';

                    if (student.status === 'pending') {
                      return (
                        <tr key={idx} style={{ background: 'var(--warning-bg)', borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '16px 24px' }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{student.student_name}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Roll: {student.roll_number}</div>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content' }}>
                              <Clock size={14} className="spinning" />
                              Evaluating...
                            </span>
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Processing</td>
                          <td style={{ padding: '16px', color: 'var(--text-muted)', fontStyle: 'italic' }}>-</td>
                          <td style={{ padding: '16px', color: 'var(--text-muted)', fontStyle: 'italic' }}>-</td>
                          <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Please wait...</span>
                          </td>
                        </tr>
                      );
                    }

                    const avgConfidence = student.evaluations.reduce((sum, ev) => sum + ev.confidence_score, 0) / student.evaluations.length;
                    const hasReview = student.evaluations.some(ev => !ev.reviewed && ev.needs_review);
                    const allReviewed = student.evaluations.every(ev => ev.reviewed || !ev.needs_review);

                    // Confidence Color Logic
                    const confColor = avgConfidence >= 0.85 ? 'var(--success)' : avgConfidence >= 0.70 ? 'var(--warning)' : 'var(--danger)';
                    const confBg = avgConfidence >= 0.85 ? 'var(--success-bg)' : avgConfidence >= 0.70 ? 'var(--warning-bg)' : 'var(--danger-bg)';

                    return (
                      <tr key={idx} style={{ background: rowBg, borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{student.student_name}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Roll: {student.roll_number}</div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={14} /> Evaluated
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>{student.total_marks.toFixed(1)}</span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>/ {student.max_marks}</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              background: confBg,
                              color: confColor,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              fontWeight: '600'
                            }}>
                              {(avgConfidence * 100).toFixed(0)}%
                            </span>
                            <div style={{ width: '60px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${avgConfidence * 100}%`, background: confColor, borderRadius: '3px' }}></div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          {allReviewed ? (
                            <span className="badge badge-success">Complete</span>
                          ) : hasReview ? (
                            <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertCircle size={14} /> Needs Review
                            </span>
                          ) : (
                            <span className="badge badge-primary">Auto-Graded</span>
                          )}
                        </td>
                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                          {hasReview ? (
                            <button
                              onClick={() => navigate(`/assignment/${assignmentId}/review`, { state: { startRoll: student.roll_number } })}
                              className="btn btn-primary"
                              style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                            >
                              <Eye size={16} />
                              Review Now
                            </button>
                          ) : (
                            <button
                              onClick={() => navigate(`/assignment/${assignmentId}/review`, { state: { startRoll: student.roll_number } })}
                              className="btn btn-secondary"
                              style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                            >
                              View Details
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
      `}</style>
    </div>
  );
}
export default EvaluationResults;
