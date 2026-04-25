import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import {
  ArrowLeft, Upload, CheckCircle, Clock, AlertCircle,
  Trash2, Plus, UploadCloud, FolderOpen, Info, X
} from "lucide-react";

// ── Parse  SAPID_Name.pdf  from a filename ──────────────────────────────────
function parseSapFilename(filename) {
  const stem = filename.replace(/\.[^/.]+$/, ""); // strip extension
  // primary: digits_Name
  let m = stem.match(/^(\d{1,20})[_\-\s]+(.+)$/);
  if (m) return { sap_id: m[1].trim(), name: m[2].trim() };
  // fallback: leading digits then letters
  m = stem.match(/^(\d{1,20})([A-Za-z].*)$/);
  if (m) return { sap_id: m[1].trim(), name: m[2].trim() };
  return null; // cannot parse
}

export default function UploadAnswers() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  // ── Tabs: 'single' | 'bulk' ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("single");

  // ── Single upload form ────────────────────────────────────────────────────
  const [formData, setFormData] = useState({ student_name: "", roll_number: "", file: null });
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  // ── Queue shared by both modes ────────────────────────────────────────────
  const [queue, setQueue] = useState([]);
  const isProcessing = useRef(false);

  // ── Bulk upload state ─────────────────────────────────────────────────────
  const [bulkFiles, setBulkFiles] = useState([]); // parsed preview list
  const [bulkParseErrors, setBulkParseErrors] = useState([]);
  const folderInputRef = useRef(null);

  // ── Counts ────────────────────────────────────────────────────────────────
  const doneCount      = queue.filter(i => i.status === "done").length;
  const uploadingCount = queue.filter(i => i.status === "uploading").length;
  const queuedCount    = queue.filter(i => i.status === "queued").length;
  const errorCount     = queue.filter(i => i.status === "error").length;

  // ════════════════════════════════════════════════════════════════════════
  // UPLOAD HELPERS
  // ════════════════════════════════════════════════════════════════════════

  const uploadItem = async (item) => {
    try {
      const data = new FormData();
      data.append("file", item.file);
      data.append("assignment_id", assignmentId);
      data.append("student_name", item.student_name);
      data.append("roll_number", item.roll_number);
      await API.post("/answer-scripts/upload", data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.response?.data?.detail || err.message || "Upload failed" };
    }
  };

  const processNextItem = async (currentQueue) => {
    if (isProcessing.current) return;
    const nextItem = currentQueue.find(i => i.status === "queued");
    if (!nextItem) { isProcessing.current = false; return; }

    isProcessing.current = true;
    setQueue(q => q.map(i => i.id === nextItem.id ? { ...i, status: "uploading" } : i));

    const result = await uploadItem(nextItem);

    setQueue(q => {
      const updated = q.map(i =>
        i.id === nextItem.id
          ? { ...i, status: result.ok ? "done" : "error", error: result.error || null }
          : i
      );
      isProcessing.current = false;
      const nextQueued = updated.find(i => i.status === "queued");
      if (nextQueued) setTimeout(() => processNextItem(updated), 100);
      return updated;
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // SINGLE UPLOAD
  // ════════════════════════════════════════════════════════════════════════

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, file }));
      setFileName(file.name);
    }
  };

  const handleAddToQueue = (e) => {
    e.preventDefault();
    if (!formData.file) { alert("Please select a PDF or image file"); return; }

    const newItem = {
      id: Date.now() + Math.random(),
      student_name: formData.student_name.trim(),
      roll_number: formData.roll_number.trim(),
      file: formData.file,
      status: "queued",
      error: null,
    };

    const updatedQueue = [...queue, newItem];
    setQueue(updatedQueue);
    setFormData({ student_name: "", roll_number: "", file: null });
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!isProcessing.current) processNextItem(updatedQueue);
  };

  // ════════════════════════════════════════════════════════════════════════
  // BULK / FOLDER UPLOAD
  // ════════════════════════════════════════════════════════════════════════

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files);
    const valid = [];
    const errors = [];

    files.forEach(file => {
      const ext = file.name.split(".").pop().toLowerCase();
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) return; // skip non-script files

      const parsed = parseSapFilename(file.name);
      if (!parsed) {
        errors.push({ filename: file.name, reason: "Cannot parse SAP ID. Rename to: SAPID_Name.pdf" });
        return;
      }
      valid.push({ file, sap_id: parsed.sap_id, name: parsed.name });
    });

    // Deduplicate by SAP ID — keep last occurrence
    const sapSeen = {};
    valid.forEach(v => { sapSeen[v.sap_id] = v; });
    const deduped = Object.values(sapSeen);

    setBulkFiles(deduped);
    setBulkParseErrors(errors);
  };

  const removeBulkFile = (sap_id) => {
    setBulkFiles(prev => prev.filter(f => f.sap_id !== sap_id));
  };

  const handleBulkAddToQueue = () => {
    if (bulkFiles.length === 0) { alert("No valid files to upload."); return; }

    const newItems = bulkFiles.map(f => ({
      id: Date.now() + Math.random(),
      student_name: f.name,
      roll_number: f.sap_id,
      file: f.file,
      status: "queued",
      error: null,
    }));

    const updatedQueue = [...queue, ...newItems];
    setQueue(updatedQueue);
    setBulkFiles([]);
    setBulkParseErrors([]);
    if (folderInputRef.current) folderInputRef.current.value = "";

    if (!isProcessing.current) processNextItem(updatedQueue);
  };

  // ════════════════════════════════════════════════════════════════════════
  // QUEUE ACTIONS
  // ════════════════════════════════════════════════════════════════════════

  const removeQueued = (id) => setQueue(q => q.filter(i => !(i.id === id && i.status === "queued")));

  const retryItem = (id) => {
    setQueue(q => {
      const updated = q.map(i => i.id === id ? { ...i, status: "queued", error: null } : i);
      if (!isProcessing.current) processNextItem(updated);
      return updated;
    });
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="page-wrapper" style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      <button
        onClick={() => navigate(`/assignment/${assignmentId}`)}
        className="btn btn-secondary"
        style={{ marginBottom: 24, display: "inline-flex" }}
      >
        <ArrowLeft size={18} /> Back to Assignment
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ padding: 12, background: "var(--success-bg)", color: "var(--success)", borderRadius: 12 }}>
          <UploadCloud size={28} />
        </div>
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>Upload Answer Scripts</h2>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0" }}>Upload student submissions for AI evaluation.</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 24, alignItems: "start" }}>

        {/* ── LEFT: Upload Panel ── */}
        <div className="card" style={{ padding: 32 }}>

          {/* Tab switcher */}
          <div style={{
            display: "flex", gap: 0, marginBottom: 28,
            background: "var(--bg-tertiary)", borderRadius: 10, padding: 4
          }}>
            {[
              { key: "single", label: "Single Upload", icon: <Upload size={15} /> },
              { key: "bulk",   label: "Folder / Bulk",  icon: <FolderOpen size={15} /> },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 7, padding: "9px 16px", border: "none", cursor: "pointer",
                  borderRadius: 8, fontWeight: 600, fontSize: "0.9rem",
                  transition: "all 0.18s",
                  background: activeTab === tab.key ? "white" : "transparent",
                  color: activeTab === tab.key ? "var(--accent-color)" : "var(--text-secondary)",
                  boxShadow: activeTab === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ── SINGLE TAB ── */}
          {activeTab === "single" && (
            <>
              <div style={{
                background: "var(--info-bg)", padding: 20, borderRadius: 12, marginBottom: 24,
                border: "1px solid rgba(59,130,246,0.2)"
              }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--info)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <Clock size={18} /> Queue System — No Waiting!
                </h3>
                <ul style={{ fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.6, margin: "8px 0 0 20px", padding: 0 }}>
                  <li style={{ marginBottom: 4 }}>Fill form → click <strong>Add to Queue</strong> → form resets instantly</li>
                  <li style={{ marginBottom: 4 }}>Queue processes uploads one-by-one automatically</li>
                  <li>Navigate away anytime — processing continues in background</li>
                </ul>
              </div>

              <form onSubmit={handleAddToQueue}>
                <div className="form-group">
                  <label className="form-label">Student Name *</label>
                  <input
                    type="text" className="form-input" placeholder="Enter student name"
                    value={formData.student_name}
                    onChange={e => setFormData({ ...formData, student_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Roll Number *</label>
                  <input
                    type="text" className="form-input" placeholder="Enter roll number"
                    value={formData.roll_number}
                    onChange={e => setFormData({ ...formData, roll_number: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Answer Script (PDF or Image) *</label>
                  <div
                    className={`file-upload-area ${formData.file ? "active" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadCloud size={32} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px", display: "block" }} />
                    <p style={{ fontWeight: 600, color: "var(--text-primary)" }}>Click to browse files</p>
                    <p style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>Supports PDF, JPG, PNG files</p>
                    <input
                      type="file" accept=".pdf,.jpg,.jpeg,.png"
                      ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }}
                    />
                  </div>
                  {fileName && (
                    <div style={{ marginTop: 12, padding: "8px 16px", background: "var(--success-bg)", borderRadius: 8, fontSize: "0.9rem", color: "var(--success)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle size={16} /> {fileName}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 32 }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: 12 }}>
                    <Plus size={18} /> Add to Queue
                  </button>
                  <button
                    type="button" onClick={() => navigate(`/assignment/${assignmentId}/results`)}
                    className="btn btn-secondary" style={{ flex: 1, padding: 12 }}
                  >
                    View Results {doneCount > 0 && <span className="badge badge-success" style={{ marginLeft: 8 }}>{doneCount}</span>}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── BULK TAB ── */}
          {activeTab === "bulk" && (
            <>
              {/* How-to info box */}
              <div style={{
                background: "linear-gradient(135deg,#eef2ff,#f5f3ff)", padding: 20,
                borderRadius: 12, marginBottom: 24, border: "1px solid rgba(99,102,241,0.2)"
              }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent-color)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <Info size={17} /> How bulk upload works
                </h3>
                <ul style={{ fontSize: "0.88rem", color: "var(--text-primary)", lineHeight: 1.7, margin: "0 0 0 18px", padding: 0 }}>
                  <li><strong>Rename files</strong> as <code style={{ background: "rgba(0,0,0,0.07)", padding: "1px 5px", borderRadius: 4 }}>SAPID_StudentName.pdf</code></li>
                  <li>Example: <code style={{ background: "rgba(0,0,0,0.07)", padding: "1px 5px", borderRadius: 4 }}>500120443_AryanRaj.pdf</code></li>
                  <li>SAP ID is used as the unique Roll Number</li>
                  <li>Select all files at once (or the whole folder)</li>
                </ul>
              </div>

              {/* Folder / multi-file picker */}
              <div
                className="file-upload-area"
                onClick={() => folderInputRef.current?.click()}
                style={{ marginBottom: 20 }}
              >
                <FolderOpen size={36} style={{ color: "var(--accent-color)", margin: "0 auto 12px", display: "block" }} />
                <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "1rem" }}>
                  Click to select folder / files
                </p>
                <p style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
                  Select all PDFs/images at once — names auto-parsed
                </p>
                {/* webkitdirectory lets users pick a whole folder in Chrome/Edge */}
                <input
                  type="file" multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  ref={folderInputRef}
                  onChange={handleFolderSelect}
                  style={{ display: "none" }}
                  // folder support (Chrome/Edge)
                  {...{ webkitdirectory: "", mozdirectory: "" }}
                />
              </div>

              {/* Parse errors */}
              {bulkParseErrors.length > 0 && (
                <div style={{ background: "var(--danger-bg)", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                  <p style={{ fontWeight: 700, color: "var(--danger)", margin: "0 0 8px", fontSize: "0.9rem" }}>
                    ⚠ {bulkParseErrors.length} file(s) could not be parsed:
                  </p>
                  {bulkParseErrors.map((e, i) => (
                    <p key={i} style={{ margin: "2px 0", fontSize: "0.82rem", color: "var(--danger-text)" }}>
                      • <strong>{e.filename}</strong> — {e.reason}
                    </p>
                  ))}
                </div>
              )}

              {/* Parsed files preview */}
              {bulkFiles.length > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                      {bulkFiles.length} script{bulkFiles.length !== 1 ? "s" : ""} ready to upload
                    </p>
                    <button
                      onClick={() => { setBulkFiles([]); setBulkParseErrors([]); if (folderInputRef.current) folderInputRef.current.value = ""; }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <X size={14} /> Clear all
                    </button>
                  </div>

                  <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, paddingRight: 4 }}>
                    {bulkFiles.map(f => (
                      <div key={f.sap_id} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                        background: "var(--bg-tertiary)", borderRadius: 8,
                        border: "1px solid var(--border-light)"
                      }}>
                        <CheckCircle size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.name}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>
                            SAP ID: {f.sap_id} &nbsp;·&nbsp; {f.file.name}
                          </div>
                        </div>
                        <button
                          onClick={() => removeBulkFile(f.sap_id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4, borderRadius: 6, flexShrink: 0 }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text-tertiary)"}
                          title="Remove"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleBulkAddToQueue} className="btn btn-primary" style={{ width: "100%", padding: 14, fontSize: "1rem" }}>
                    <UploadCloud size={18} />
                    Add All {bulkFiles.length} Scripts to Queue
                  </button>
                </>
              )}

              {bulkFiles.length === 0 && bulkParseErrors.length === 0 && (
                <p style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.9rem", marginTop: 8 }}>
                  No files selected yet. Click the area above to choose files.
                </p>
              )}
            </>
          )}

          {/* Pro tips — shown on both tabs */}
          <div style={{
            background: "var(--bg-tertiary)", padding: 20, borderRadius: 12, marginTop: 32,
            borderTop: "1px solid var(--border-light)"
          }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 12, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={18} color="var(--accent-color)" /> Pro Tips
            </h3>
            <ul style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 0 20px", padding: 0 }}>
              <li style={{ marginBottom: 4 }}>Evaluations appear in Results page as they complete</li>
              <li style={{ marginBottom: 4 }}>Low confidence evaluations are flagged for manual review</li>
              <li>You can leave this page — processing continues in background</li>
            </ul>
          </div>
        </div>

        {/* ── RIGHT: Queue Status Panel ── */}
        <div className="card" style={{ padding: 32, position: "sticky", top: 100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Upload Status</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {uploadingCount > 0 && <span className="badge badge-primary">↑ {uploadingCount} Uploading</span>}
              {queuedCount   > 0 && <span className="badge" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>⏳ {queuedCount} Waiting</span>}
              {doneCount     > 0 && <span className="badge badge-success">✓ {doneCount} Done</span>}
              {errorCount    > 0 && <span className="badge badge-danger">✗ {errorCount} Failed</span>}
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="empty-state" style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <Clock size={48} style={{ margin: "0 auto 16px", color: "var(--text-tertiary)" }} />
              <h4 style={{ fontWeight: 600, fontSize: "1.1rem", margin: "0 0 8px", color: "var(--text-primary)" }}>Queue is empty</h4>
              <p style={{ fontSize: "0.95rem", margin: 0, color: "var(--text-secondary)" }}>Add students from the form to start uploading.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 500, overflowY: "auto", paddingRight: 8 }}>
              {queue.map((item, idx) => (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: 12,
                  background: item.status === "uploading" ? "var(--info-bg)"
                    : item.status === "done"      ? "var(--success-bg)"
                    : item.status === "error"     ? "var(--danger-bg)"
                    : "var(--bg-tertiary)",
                  border: `1px solid ${item.status === "uploading" ? "rgba(59,130,246,0.3)"
                    : item.status === "done"  ? "rgba(16,185,129,0.3)"
                    : item.status === "error" ? "rgba(239,68,68,0.3)"
                    : "var(--border-light)"}`,
                  transition: "all 0.3s ease"
                }}>
                  <div style={{ flexShrink: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {item.status === "uploading" && <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2, borderColor: "rgba(59,130,246,0.2)", borderTopColor: "var(--info)" }} />}
                    {item.status === "queued"    && <Clock size={20} color="var(--text-tertiary)" />}
                    {item.status === "done"      && <CheckCircle size={20} color="var(--success)" />}
                    {item.status === "error"     && <AlertCircle size={20} color="var(--danger)" />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "0.82rem" }}>#{idx + 1}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.student_name}</span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 3 }}>SAP / Roll: {item.roll_number}</div>
                    {item.error && <div style={{ fontSize: "0.82rem", color: "var(--danger)", marginTop: 3, fontWeight: 500 }}>✗ {item.error}</div>}
                  </div>

                  <span style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
                    background: item.status === "uploading" ? "rgba(59,130,246,0.1)"
                      : item.status === "done"  ? "rgba(16,185,129,0.1)"
                      : item.status === "error" ? "rgba(239,68,68,0.1)"
                      : "var(--bg-secondary)",
                    color: item.status === "uploading" ? "var(--info)"
                      : item.status === "done"  ? "var(--success)"
                      : item.status === "error" ? "var(--danger)"
                      : "var(--text-secondary)",
                  }}>
                    {item.status === "uploading" ? "Uploading…"
                      : item.status === "done"   ? "Uploaded ✓"
                      : item.status === "error"  ? "Failed"
                      : "In Queue"}
                  </span>

                  {item.status === "queued" && (
                    <button
                      onClick={() => removeQueued(item.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 6, flexShrink: 0, borderRadius: 8, transition: "background 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--danger-bg)"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                      title="Remove from queue"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                  {item.status === "error" && (
                    <button onClick={() => retryItem(item.id)} className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: "0.82rem", flexShrink: 0 }}>
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {queue.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border-light)", fontSize: "0.88rem", color: "var(--text-secondary)", textAlign: "center", fontWeight: 500 }}>
              {(uploadingCount > 0 || queuedCount > 0)
                ? "⚡ Processing in background — navigate away anytime"
                : "✅ All uploads complete! Evaluation running in background."}
            </div>
          )}

          {doneCount > 0 && queuedCount === 0 && uploadingCount === 0 && (
            <button
              onClick={() => navigate(`/assignment/${assignmentId}/results`)}
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 16 }}
            >
              View Results →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
