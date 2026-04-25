import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import { ArrowLeft, Plus, Upload, Trash2, Edit2, Save, X, FileQuestion, UploadCloud } from "lucide-react";

export default function QuestionManagement() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [manualQuestion, setManualQuestion] = useState({
    question_text: "",
    question_number: 1,
    marks: ""
  });

  useEffect(() => {
    fetchQuestions();
  }, [assignmentId]);

  const fetchQuestions = async () => {
    try {
      const res = await API.get(`/assignments/${assignmentId}/questions`);
      setQuestions(res.data);
      if (res.data.length > 0) {
        setManualQuestion({ ...manualQuestion, question_number: res.data.length + 1 });
      }
    } catch (err) {
      console.error("Error fetching questions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddManual = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("assignment_id", assignmentId);
      formData.append("question_text", manualQuestion.question_text);
      formData.append("question_number", manualQuestion.question_number);
      formData.append("marks", parseFloat(manualQuestion.marks));

      await API.post("/questions", formData);
      alert("✅ Question added successfully!");
      setManualQuestion({ question_text: "", question_number: questions.length + 2, marks: "" });
      setShowManualForm(false);
      fetchQuestions();
    } catch (err) {
      alert("❌ Error adding question: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleUploadPdf = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("assignment_id", assignmentId);

      const res = await API.post("/questions/upload-pdf", formData);
      alert(`✅ ${res.data.message}`);
      fetchQuestions();
    } catch (err) {
      alert("❌ Error uploading PDF: " + (err.response?.data?.detail || err.message));
    } finally {
      setUploadingPdf(false);
      e.target.value = ''; // Reset file input
    }
  };

  const startEdit = (question) => {
    setEditingQuestion({
      id: question.id,
      question_text: question.question_text,
      marks: question.marks
    });
  };

  const cancelEdit = () => {
    setEditingQuestion(null);
  };

  const saveEdit = async (questionId) => {
    try {
      const formData = new FormData();
      formData.append("question_text", editingQuestion.question_text);
      formData.append("marks", parseFloat(editingQuestion.marks));

      await API.put(`/questions/${questionId}`, formData);
      alert("✅ Question updated successfully!");
      setEditingQuestion(null);
      fetchQuestions();
    } catch (err) {
      alert("❌ Error updating question: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (questionId) => {
    if (!confirm("⚠️ Are you sure you want to delete this question? This will also delete its rubric.")) return;

    try {
      await API.delete(`/questions/${questionId}`);
      alert("✅ Question deleted successfully!");
      fetchQuestions();
    } catch (err) {
      alert("❌ Error deleting question: " + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="page-wrapper" style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
      <button onClick={() => navigate(`/assignment/${assignmentId}`)} className="btn btn-secondary" style={{ marginBottom: '24px', display: 'inline-flex' }}>
        <ArrowLeft size={18} />
        Back to Assignment
      </button>

      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ padding: '12px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '12px' }}>
            <FileQuestion size={28} />
          </div>
          <div>
            <h2 className="card-title" style={{ margin: 0, fontSize: '1.5rem' }}>Manage Questions</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Add or edit questions for this assessment.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowManualForm(!showManualForm)} className="btn btn-primary">
            <Plus size={18} />
            Add Manual Question
          </button>

          <label className="btn btn-secondary" style={{ margin: 0, cursor: 'pointer' }}>
            <UploadCloud size={18} />
            {uploadingPdf ? "Uploading..." : "Upload PDF Question Paper"}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleUploadPdf}
              disabled={uploadingPdf}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {showManualForm && (
          <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderRadius: '12px', marginBottom: '32px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>Add New Question</h3>
            <form onSubmit={handleAddManual}>
              <div className="grid grid-2" style={{ gap: '20px' }}>
                <div className="form-group">
                  <label className="form-label">Question Number</label>
                  <input
                    type="number"
                    className="form-input"
                    value={manualQuestion.question_number}
                    onChange={(e) => setManualQuestion({ ...manualQuestion, question_number: parseInt(e.target.value) })}
                    required
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Marks</label>
                  <input
                    type="number"
                    className="form-input"
                    value={manualQuestion.marks}
                    onChange={(e) => setManualQuestion({ ...manualQuestion, marks: e.target.value })}
                    required
                    min="0.5"
                    step="0.5"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Question Text</label>
                <textarea
                  className="form-textarea"
                  value={manualQuestion.question_text}
                  onChange={(e) => setManualQuestion({ ...manualQuestion, question_text: e.target.value })}
                  required
                  placeholder="Enter the complete question..."
                  rows={4}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary">
                  <Plus size={16} /> Add Question
                </button>
                <button type="button" onClick={() => setShowManualForm(false)} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px', borderColor: 'var(--border-light)', borderTopColor: 'var(--primary)' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading questions...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <h3 className="empty-state-title">No questions added yet</h3>
            <p className="empty-state-text">Start by adding questions manually or upload a question paper PDF.</p>
            <button onClick={() => setShowManualForm(true)} className="btn btn-primary" style={{ marginTop: '16px' }}>
              <Plus size={18} /> Add First Question
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {questions.map((q) => (
              <div key={q.id} style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', transition: 'all 0.2s' }}>
                {editingQuestion?.id === q.id ? (
                  // EDIT MODE
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-light)' }}>
                      <span className="badge badge-primary" style={{ fontSize: '1rem', padding: '6px 12px' }}>Q{q.question_number}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => saveEdit(q.id)} className="btn btn-primary" style={{ padding: '6px 16px' }}>
                          <Save size={16} />
                          Save
                        </button>
                        <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '6px 16px' }}>
                          <X size={16} />
                          Cancel
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Question Text</label>
                      <textarea
                        className="form-textarea"
                        value={editingQuestion.question_text}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })}
                        style={{ minHeight: '120px' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, maxWidth: '200px' }}>
                      <label className="form-label">Marks</label>
                      <input
                        type="number"
                        className="form-input"
                        value={editingQuestion.marks}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, marks: e.target.value })}
                        min="0.5"
                        step="0.5"
                      />
                    </div>
                  </div>
                ) : (
                  // VIEW MODE
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="badge badge-primary" style={{ fontSize: '0.9rem', padding: '4px 10px' }}>Q{q.question_number}</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--success)' }}>{q.marks} Marks</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => startEdit(q)}
                          className="btn btn-secondary"
                          style={{ padding: '8px', border: 'none', background: 'transparent' }}
                          title="Edit Question"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="btn btn-secondary"
                          style={{ padding: '8px', border: 'none', background: 'transparent', color: 'var(--danger)' }}
                          title="Delete Question"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <p style={{ color: 'var(--text-primary)', lineHeight: '1.6', margin: '0', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                      {q.question_text}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {questions.length > 0 && (
          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => navigate(`/assignment/${assignmentId}/rubrics`)}
              className="btn btn-primary"
            >
              Continue to Define Rubrics
              <ArrowLeft size={18} style={{ transform: 'rotate(180deg)' }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}