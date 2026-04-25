import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import { ArrowLeft, Plus, Trash2, Edit2, Save, CheckCircle, BookOpen, UploadCloud, AlertCircle, X } from "lucide-react";

export default function RubricManagement() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [rubrics, setRubrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfResult, setPdfResult] = useState(null);
  const rubricPdfRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [assignmentId]);

  const fetchData = async () => {
    try {
      const [questionsRes, rubricsRes] = await Promise.all([
        API.get(`/assignments/${assignmentId}/questions`),
        API.get(`/rubrics/assignment/${assignmentId}`)
      ]);

      setQuestions(questionsRes.data);

      const rubricMap = {};
      rubricsRes.data.forEach(r => {
        rubricMap[r.question_id] = {
          id: r.id,
          concepts: r.concepts
        };
      });
      setRubrics(rubricMap);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const addConcept = (questionId) => {
    setRubrics({
      ...rubrics,
      [questionId]: {
        ...rubrics[questionId],
        concepts: [...(rubrics[questionId]?.concepts || []), { description: "", marks: 1 }]
      }
    });
    // Auto-enter edit mode when adding first concept
    if (!editMode[questionId]) {
      setEditMode({ ...editMode, [questionId]: true });
    }
  };

  const updateConcept = (questionId, index, field, value) => {
    const updated = [...(rubrics[questionId]?.concepts || [])];
    updated[index][field] = field === "marks" ? parseFloat(value) || 0 : value;
    setRubrics({
      ...rubrics,
      [questionId]: {
        ...rubrics[questionId],
        concepts: updated
      }
    });
  };

  const removeConcept = (questionId, index) => {
    const updated = [...(rubrics[questionId]?.concepts || [])];
    updated.splice(index, 1);
    setRubrics({
      ...rubrics,
      [questionId]: {
        ...rubrics[questionId],
        concepts: updated
      }
    });
  };

  const toggleEditMode = (questionId) => {
    setEditMode({ ...editMode, [questionId]: !editMode[questionId] });
  };

  const saveRubric = async (questionId) => {
    const concepts = rubrics[questionId]?.concepts || [];

    if (concepts.length === 0) {
      alert("⚠️ Please add at least one concept before saving.");
      return;
    }

    // Validate concepts
    for (let i = 0; i < concepts.length; i++) {
      if (!concepts[i].description || concepts[i].description.trim().length < 5) {
        alert(`⚠️ Concept ${i + 1}: Description must be at least 5 characters.`);
        return;
      }
      if (!concepts[i].marks || concepts[i].marks <= 0) {
        alert(`⚠️ Concept ${i + 1}: Marks must be greater than 0.`);
        return;
      }
    }

    setSaving(true);
    try {
      const rubricData = {
        question_id: questionId,
        concepts: concepts
      };

      if (rubrics[questionId]?.id) {
        // Update existing rubric
        await API.put(`/rubrics/${rubrics[questionId].id}`, rubricData);
        alert("✅ Rubric updated successfully!");
      } else {
        // Create new rubric
        const res = await API.post("/rubrics", rubricData);
        setRubrics({
          ...rubrics,
          [questionId]: {
            id: res.data.id,
            concepts: res.data.concepts
          }
        });
        alert("✅ Rubric saved successfully!");
      }

      setEditMode({ ...editMode, [questionId]: false });
    } catch (err) {
      alert("❌ Error saving rubric: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const saveAllRubrics = async () => {
    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const question of questions) {
      const concepts = rubrics[question.id]?.concepts || [];
      if (concepts.length === 0) continue;

      try {
        const rubricData = {
          question_id: question.id,
          concepts: concepts
        };

        if (rubrics[question.id]?.id) {
          await API.put(`/rubrics/${rubrics[question.id].id}`, rubricData);
        } else {
          await API.post("/rubrics", rubricData);
        }
        successCount++;
      } catch (err) {
        console.error(`Error saving rubric for question ${question.id}:`, err);
        errorCount++;
      }
    }

    setSaving(false);

    if (errorCount === 0) {
      alert(`✅ All rubrics saved successfully! (${successCount} rubrics)`);
      navigate(`/assignment/${assignmentId}/upload-answers`);
    } else {
      alert(`⚠️ Saved ${successCount} rubrics, ${errorCount} failed. Please check and try again.`);
    }
  };


  // ── Rubric PDF upload ──────────────────────────────────────────────────────
  const handleRubricPdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPdf(true);
    setPdfResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await API.post(`/rubrics/upload-pdf/${assignmentId}`, formData);
      setPdfResult(res.data);
      // Reload rubrics from DB to show the newly populated data
      await fetchData();
    } catch (err) {
      alert("❌ Error uploading rubric PDF: " + (err.response?.data?.detail || err.message));
    } finally {
      setUploadingPdf(false);
      if (rubricPdfRef.current) rubricPdfRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 16px', borderColor: 'var(--border-light)', borderTopColor: 'var(--primary)' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading rubrics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
      <button onClick={() => navigate(`/assignment/${assignmentId}`)} className="btn btn-secondary" style={{ marginBottom: '24px', display: 'inline-flex' }}>
        <ArrowLeft size={18} />
        Back to Assignment
      </button>

      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ padding: '12px', background: 'var(--info-bg)', color: 'var(--info)', borderRadius: '12px' }}>
            <BookOpen size={28} />
          </div>
          <div>
            <h2 className="card-title" style={{ margin: 0, fontSize: '1.5rem' }}>Define Evaluation Rubrics</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Define key concepts and marks for accurate AI grading.</p>
          </div>
        </div>


        {/* ── PDF Upload Banner ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '16px', marginBottom: '24px',
          background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)',
          border: '1px solid rgba(99,102,241,0.25)', borderRadius: '12px',
          padding: '18px 24px'
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.95rem' }}>
              📄 Have a rubric PDF? Upload it to auto-fill all concepts instantly.
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Each question's concepts + marks will be parsed automatically.
            </p>
          </div>
          <label className="btn btn-primary" style={{ cursor: 'pointer', margin: 0, flexShrink: 0 }}>
            <UploadCloud size={17} />
            {uploadingPdf ? 'Uploading…' : 'Upload Rubric PDF'}
            <input
              type="file" accept=".pdf" ref={rubricPdfRef}
              onChange={handleRubricPdfUpload}
              disabled={uploadingPdf}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {/* PDF Result feedback */}
        {pdfResult && (
          <div style={{ marginBottom: '24px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
            <div style={{ background: '#dcfce7', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#15803d', fontSize: '0.92rem' }}>
                ✓ {pdfResult.message}
              </span>
              <button onClick={() => setPdfResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d' }}>
                <X size={16} />
              </button>
            </div>
            {pdfResult.saved?.length > 0 && (
              <div style={{ padding: '10px 18px', background: 'white' }}>
                {pdfResult.saved.map(s => (
                  <div key={s.question_number} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Q{s.question_number}: {s.concepts_count} concept{s.concepts_count !== 1 ? 's' : ''} saved
                  </div>
                ))}
              </div>
            )}
            {pdfResult.skipped?.length > 0 && (
              <div style={{ padding: '8px 18px', background: '#fef9c3', borderTop: '1px solid #fde68a' }}>
                {pdfResult.skipped.map((s, i) => (
                  <div key={i} style={{ fontSize: '0.82rem', color: '#92400e' }}>
                    ⚠ Q{s.question_number}: {s.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: '32px', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid var(--info)' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            <strong>Pro Tip:</strong> Break down the answer into specific, measurable concepts. The more precise the rubric, the more accurate the evaluation will be.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {questions.map((q) => (
            <div key={q.id} style={{ border: '1px solid var(--border-light)', borderRadius: '12px', padding: '24px', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ flex: 1, marginRight: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <span className="badge badge-primary" style={{ fontSize: '1rem', padding: '4px 10px' }}>Q{q.question_number}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--success)' }}>{q.marks} Marks Total</span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: '1.5' }}>{q.question_text}</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {rubrics[q.id]?.concepts?.length > 0 && !editMode[q.id] && (
                    <>
                      <span className="badge badge-success" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px'
                      }}>
                        <CheckCircle size={14} />
                        Saved
                      </span>
                      <button onClick={() => toggleEditMode(q.id)} className="btn btn-secondary" style={{ padding: '6px 12px' }}>
                        <Edit2 size={16} /> Edit
                      </button>
                    </>
                  )}
                  {editMode[q.id] && (
                    <button
                      onClick={() => saveRubric(q.id)}
                      className="btn btn-primary"
                      style={{ padding: '6px 16px' }}
                      disabled={saving}
                    >
                      <Save size={16} />
                      {saving ? "Saving..." : "Save"}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                {editMode[q.id] || !rubrics[q.id]?.concepts?.length ? (
                  // EDIT MODE
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(rubrics[q.id]?.concepts || []).map((concept, index) => (
                      <div key={index} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., Mentioned O(n) time complexity"
                            value={concept.description}
                            onChange={(e) => updateConcept(q.id, index, "description", e.target.value)}
                            style={{ margin: 0 }}
                          />
                        </div>
                        <div style={{ width: '120px' }}>
                          <input
                            type="number"
                            className="form-input"
                            placeholder="Marks"
                            value={concept.marks}
                            onChange={(e) => updateConcept(q.id, index, "marks", e.target.value)}
                            min="0.5"
                            step="0.5"
                            style={{ margin: 0 }}
                          />
                        </div>
                        <button
                          onClick={() => removeConcept(q.id, index)}
                          className="btn btn-secondary"
                          style={{ padding: '10px', color: 'var(--danger)', border: '1px solid var(--border-light)' }}
                          title="Remove Concept"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => addConcept(q.id)}
                      className="btn btn-secondary"
                      style={{ alignSelf: 'flex-start', marginTop: '8px' }}
                    >
                      <Plus size={16} /> Add Concept Breakdown
                    </button>
                  </div>
                ) : (
                  // VIEW MODE
                  <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    {rubrics[q.id].concepts.map((concept, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: index < rubrics[q.id].concepts.length - 1 ? '1px solid var(--border-light)' : 'none'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{index + 1}.</span>
                          <span style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{concept.description}</span>
                        </div>
                        <span className="badge badge-info" style={{ padding: '4px 10px', fontWeight: '600' }}>
                          {concept.marks} marks
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {questions.length > 0 && (
          <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={saveAllRubrics}
              className="btn btn-primary"
              disabled={saving}
              style={{ padding: '12px 24px', fontSize: '1rem' }}
            >
              <Save size={18} />
              {saving ? "Saving All..." : "Save All & Continue"}
              {!saving && <ArrowLeft size={18} style={{ transform: 'rotate(180deg)' }} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}