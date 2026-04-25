import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { ArrowLeft, BookOpen, PlusCircle } from "lucide-react";

export function CreateAssignment() {
  const [formData, setFormData] = useState({
    assignment_name: "",
    subject: "",
    date: "",
    maximum_marks: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await API.post("/assignments", {
        ...formData,
        maximum_marks: parseFloat(formData.maximum_marks)
      });
      navigate(`/assignment/${res.data.id}/questions`);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create assignment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <button
        onClick={() => navigate("/dashboard")}
        className="btn btn-secondary"
        style={{ marginBottom: '24px', display: 'inline-flex' }}
      >
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ padding: '12px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '12px' }}>
            <BookOpen size={28} />
          </div>
          <div>
            <h2 className="card-title" style={{ margin: 0, fontSize: '1.5rem' }}>Create New Assignment</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Set up a new assessment for your students.</p>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Assignment Name</label>
            <input
              type="text"
              name="assignment_name"
              className="form-input"
              placeholder="e.g., Data Structures Final Exam"
              value={formData.assignment_name}
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
                placeholder="e.g., Computer Science"
                value={formData.subject}
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
                value={formData.date}
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
              placeholder="e.g., 100"
              value={formData.maximum_marks}
              onChange={handleChange}
              required
              min="1"
              step="0.5"
            />
          </div>

          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate("/dashboard")}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <PlusCircle size={18} />
              {loading ? "Creating..." : "Create & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default CreateAssignment;