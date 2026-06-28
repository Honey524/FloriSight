"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { farmerAPI, supervisorAPI, managerAPI } from "../agrisense/agrisense-api";

function daysAgoLabel(days) {
  if (days === null || days === undefined) return "Never visited";
  if (days === 0) return "Visited today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const CATEGORY_CLASS = {
  "Irrigation": "irrigation", "Pesticide": "pesticide", "Crop Health": "crop-health",
  "Fertilizer": "fertilizer", "Disease": "disease", "Urgent": "urgent",
  "General": "general", "Farmer Note": "farmer-note",
};

function useDebounce(value, delay = 380) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function initials(name = "") {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ──────────────────────────────────────────────────────────────
// Farmer View Components (Worker)
// ──────────────────────────────────────────────────────────────
function Avatar({ name }) {
  const i = name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  return <div className="fr-avatar">{i}</div>;
}

function StatusBadge({ visits }) {
  if (!visits?.length) return (
    <div className="fr-status-badge fr-status-grey">
      <span className="fr-status-dot" /> No visits recorded yet
    </div>
  );
  const last  = visits[0];
  const label = last.category || "General Visit";
  const date  = new Date(last.visit_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const cat   = (last.category || "").toLowerCase();
  let variant = "fr-status-green";
  if (cat.includes("treatment") || cat.includes("pest") || cat.includes("disease")) variant = "fr-status-yellow";
  if (cat.includes("critical") || cat.includes("emergency")) variant = "fr-status-red";
  return (
    <div className={`fr-status-badge ${variant}`}>
      <span className="fr-status-dot" />
      <span>{label} · {date}</span>
    </div>
  );
}

function ActionCenter({ nextSteps, completedTasks, farmId, onToggle }) {
  const [pending, setPending] = useState({});

  const handleToggle = async (taskText) => {
    const nowDone = !completedTasks.includes(taskText);
    setPending(p => ({ ...p, [taskText]: true }));
    try {
      const data = await farmerAPI.toggleTask({ farm_id: farmId, task_text: taskText, is_completed: nowDone });
      onToggle(data.completed_tasks);
    } catch { /* stay optimistic */ }
    finally { setPending(p => ({ ...p, [taskText]: false })); }
  };

  if (!nextSteps?.length) return (
    <div className="fr-empty-state">
      <div className="fr-empty-icon">📋</div>
      <div className="fr-empty-msg">No tasks yet.</div>
      <div className="fr-empty-sub">Your supervisor will assign actions after the next visit.</div>
    </div>
  );

  const doneCount = nextSteps.filter(s => completedTasks.includes(s)).length;

  return (
    <>
      <div className="fr-task-summary">
        <span>{doneCount}/{nextSteps.length} completed</span>
        <div className="fr-task-mini-bar">
          <div className="fr-task-mini-fill" style={{ width: `${Math.round((doneCount / nextSteps.length) * 100)}%` }} />
        </div>
      </div>
      <ul className="fr-checklist">
        {nextSteps.map((step, i) => {
          const done = completedTasks.includes(step);
          const busy = pending[step];
          return (
            <li key={i} className={`fr-check-item${done ? " fr-check-done" : ""}${busy ? " fr-check-pending" : ""}`} onClick={() => !busy && handleToggle(step)}>
              <span className="fr-checkbox">{done ? "✓" : ""}</span>
              <div className="fr-check-body">
                <span className="fr-check-label">{step}</span>
                {done && <span className="fr-check-confirm">✓ Updated for Supervisor</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function VisitTimeline({ visits }) {
  const [expandedId, setExpandedId] = useState(null);
  if (!visits?.length) return (
    <div className="fr-empty-state">
      <div className="fr-empty-icon">📅</div>
      <div className="fr-empty-msg">No visits yet</div>
      <div className="fr-empty-sub">Field visits will appear here after your supervisor records them.</div>
    </div>
  );
  return (
    <ul className="fr-timeline">
      {visits.map(v => {
        const vDate = new Date(v.visit_date);
        const today = new Date();
        const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        let label;
        if (vDate.toDateString() === today.toDateString()) label = "Today";
        else if (vDate.toDateString() === yesterday.toDateString()) label = "Yesterday";
        else label = vDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        const fullText = v.transcript || v.notes || "";
        const summary  = fullText.slice(0, 80) || "Visit recorded";
        const isLong   = fullText.length > 80;
        const isExpanded = expandedId === v.id;
        return (
          <li key={v.id} className="fr-timeline-item">
            <div className="fr-timeline-dot" />
            <div className="fr-timeline-content">
              <div className="fr-timeline-label">{label}</div>
              <div className="fr-timeline-title">{v.category || "General Visit"}</div>
              <div className="fr-timeline-summary">{isExpanded ? fullText : summary}{!isExpanded && isLong ? "…" : ""}</div>
              {isLong && (
                <button onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  style={{ background: "none", border: "none", padding: 0, fontSize: ".72rem", fontWeight: 600, color: "#2563eb", cursor: "pointer", marginTop: 4 }}>
                  {isExpanded ? "▲ Collapse" : "▼ Read full transcript"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ReportIssueModal({ farmId, onClose, onSubmitted }) {
  const [message, setMessage] = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) { setError("Please describe the issue."); return; }
    setSaving(true); setError("");
    try {
      const data = await farmerAPI.reportIssue({ farm_id: farmId, message: message.trim() });
      onSubmitted?.(data.visit);
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.3rem" }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#1a1a1a" }}>Report an Issue</div>
            <div style={{ fontSize: ".76rem", color: "#888" }}>Your supervisor will see this at their next review</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#aaa" }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "18px 22px" }}>
            {error && <div style={{ background: "#fff5f5", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: ".8rem", marginBottom: 12 }}>{error}</div>}
            <textarea placeholder="Describe what you're seeing…" value={message} onChange={e => setMessage(e.target.value)} rows={4}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: ".88rem", lineHeight: 1.55, resize: "vertical", fontFamily: "inherit", outline: "none", color: "#1a1a1a" }}
              onFocus={e => { e.target.style.borderColor = "#f59e0b"; }} onBlur={e => { e.target.style.borderColor = "#e5e7eb"; }} autoFocus />
          </div>
          <div style={{ padding: "12px 22px 18px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: ".82rem", fontWeight: 600, cursor: "pointer", color: "#555" }}>Cancel</button>
            <button type="submit" disabled={saving || !message.trim()} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: "#d97706", color: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving || !message.trim() ? 0.6 : 1 }}>
              {saving ? "Sending…" : "Submit Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgriSenseFarmerSubView({ user }) {
  const [data,           setData]           = useState(null);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const json = await farmerAPI.myFarm(selectedFarmId);
        setData(json);
        setCompletedTasks(json.master_report?.completed_tasks || []);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [selectedFarmId]);

  const handleTaskToggle = useCallback(updated => setCompletedTasks(updated), []);
  const handleIssueSubmitted = useCallback(newVisit => {
    setData(prev => prev ? { ...prev, visits: [newVisit, ...(prev.visits || [])] } : prev);
  }, []);

  const nextSteps = data?.master_report?.supervisor_instructions ?? data?.master_report?.next_steps ?? [];

  return (
    <div className="fr-shell" style={{ background: "none", minHeight: "auto", padding: 0 }}>
      {data?.farms?.length > 1 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 24, borderBottom: "1px solid #e5ede8", paddingBottom: 16, overflowX: "auto" }}>
          {data.farms.map(f => {
            const isActive = f.id === (data?.farm?.id || selectedFarmId);
            return (
              <button key={f.id} onClick={() => setSelectedFarmId(f.id)} style={{
                padding: "8px 20px", borderRadius: 99, border: isActive ? "1px solid #16a34a" : "1px solid #e5ede8",
                background: isActive ? "#f0fdf4" : "#fff", color: isActive ? "#166534" : "#4b6b57",
                fontWeight: isActive ? 700 : 500, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
              }}>
                {f.name} <span style={{ opacity: isActive ? 0.8 : 0.5, fontSize: "0.8rem", marginLeft: 4, fontWeight: 500 }}>· {f.location}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="fr-alert fr-alert-error">{error}</div>}

      {loading && !data && (
        <div className="fr-loading" style={{ color: "var(--color-text)", padding: "20px 0" }}>
          <span className="fr-spinner">🌿</span>
          <span>Loading your farm…</span>
        </div>
      )}

      {data && (
        <div className="fr-layout" style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s", pointerEvents: loading ? "none" : "auto" }}>
          <div className="fr-col-left">
            <section className="fr-section">
              <div className="fr-section-title">Last Visit Outcome</div>
              <StatusBadge visits={data?.visits} />
            </section>

            <section className="fr-section">
              <div className="fr-section-title">
                Your Tasks
                <span className="fr-section-sub"> · Supervisor Instructions</span>
              </div>
              <ActionCenter nextSteps={nextSteps} completedTasks={completedTasks} farmId={data?.farm?.id} onToggle={handleTaskToggle} />
            </section>
          </div>

          <div className="fr-col-right">
            <section className="fr-section fr-section-sidebar">
              <div className="fr-section-title">Visit History</div>
              <VisitTimeline visits={data?.visits} />
            </section>

            <section className="fr-section fr-section-sidebar" style={{ marginTop: 16 }}>
              <div className="fr-section-title">Farm Health Report</div>
              {data?.master_report ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: ".8rem", fontWeight: 700, color: "#166534", marginBottom: 4 }}>Current Live Report</div>
                  <div style={{ fontSize: ".72rem", color: "#6b7280", marginBottom: 10 }}>Generated from recent visits</div>
                </div>
              ) : (
                <div style={{ fontSize: ".8rem", color: "#9ca3af", fontStyle: "italic", padding: "10px 0", lineHeight: 1.5 }}>
                  Your supervisor hasn&apos;t published a report yet. Check back after their next visit.
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {data?.farm?.id && (
        <div className="fr-fab-wrap">
          <button className="fr-fab" aria-label="Report an issue" onClick={() => setShowIssueModal(true)} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 4px 20px rgba(217,119,6,.4)" }}>
            ⚠️
          </button>
        </div>
      )}

      {showIssueModal && data?.farm?.id && (
        <ReportIssueModal farmId={data.farm.id} onClose={() => setShowIssueModal(false)} onSubmitted={handleIssueSubmitted} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Supervisor & Admin View Components
// ──────────────────────────────────────────────────────────────
function MetricCard({ icon, value, label, accent, loading }) {
  return (
    <div className={`sup-metric-card ${accent ? `accent-${accent}` : ""} ${loading ? "is-loading" : ""}`}>
      <span className="sup-metric-icon">{icon}</span>
      <div className="sup-metric-value">{loading ? "" : value}</div>
      <div className="sup-metric-label">{label}</div>
    </div>
  );
}

function FarmerProfileSubView({ farmerId, onBack, onOpenFarm }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/agrisense/supervisor/farmers/${farmerId}`);
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Unable to load farmer profile");
        }
        setData(json);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [farmerId]);

  return (
    <div className="sup-shell" style={{ background: "none", minHeight: "auto", padding: 0 }}>
      <div className="sup-page-header" style={{ marginBottom: 20 }}>
        <div>
          <button onClick={onBack} className="sup-btn sup-btn-primary sup-btn-sm" style={{ padding: "6px 14px", fontWeight: 700, fontSize: "0.8rem", borderRadius: 8, cursor: "pointer", background: "linear-gradient(135deg, #217a4a, #2da05f)", border: "none", color: "#fff", marginBottom: 14 }}>
            ← Back
          </button>
          <h1 className="sup-page-title" style={{ fontSize: "1.6rem" }}>{data?.farmer?.name || "Farmer Profile"}</h1>
          <p className="sup-page-date">
            {data?.farmer?.village || "Village unavailable"} · {data?.farmer?.farm_count || 0} farm{data?.farmer?.farm_count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {loading && (
        <div className="sup-section-block">
          <div className="sup-empty-title">Loading farmer profile…</div>
        </div>
      )}

      {error && !loading && <div className="sup-alert sup-alert-error">{error}</div>}

      {data && !loading && (
        <>
          <div className="sup-section-block">
            <div className="sup-section-header">
              <div>
                <div className="sup-section-title-text">Assigned Farms</div>
                <div className="sup-section-subtitle">Open any farm to review visit history and current instructions</div>
              </div>
            </div>

            <div className="mg-farm-grid">
              {data.farms.map((farm) => (
                <div
                  key={farm.id}
                  className={`mg-farm-card mg-farm-${farm.health_tier}`}
                >
                  <div className="mg-farm-header">
                    <div className="mg-farm-name">{farm.name}</div>
                    <span className={`mg-tier-badge mg-tier-${farm.health_tier || "grey"}`}>
                      <span className="mg-tier-dot" /> {(farm.health_tier || "grey").toUpperCase()}
                    </span>
                  </div>
                  <div className="mg-farm-meta">
                    <span className="mg-farm-meta-row">{farm.location}</span>
                    <span className="mg-farm-meta-row">{farm.risk_count || 0} active risk{farm.risk_count === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mg-farm-footer">
                    <button
                      onClick={() => {
                        console.log("AgriSensePanel: Open Farm clicked, farm.id:", farm.id);
                        onOpenFarm(farm.id);
                      }}
                      className="sup-btn sup-btn-primary sup-btn-sm"
                      style={{ padding: "8px 18px", fontSize: "0.8rem", borderRadius: 8, cursor: "pointer", background: "linear-gradient(135deg, #217a4a, #2da05f)", border: "none", color: "#fff" }}
                    >
                      Open Farm
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sup-section-block">
            <div className="sup-section-header">
              <div>
                <div className="sup-section-title-text">Recent Activity</div>
                <div className="sup-section-subtitle">Latest visits and recorded notes for this farmer</div>
              </div>
            </div>

            {data.visits.length === 0 ? (
              <div className="sup-empty">
                <div className="sup-empty-title">No visits recorded yet</div>
              </div>
            ) : (
              <div className="sup-my-visits-list">
                {data.visits.map((visit) => (
                  <div key={visit.id} className="sup-my-visit-card">
                    <div className="sup-my-visit-left">
                      <div className="sup-my-visit-date">{fmtDate(visit.created_at)}</div>
                      <div className="sup-my-visit-names">
                        <span className="sup-my-visit-farm">{visit.farm_name}</span>
                      </div>
                      <div className="sup-my-visit-notes" style={{ fontSize: "0.85rem", color: "#1a2e25", lineHeight: 1.5, marginTop: 4 }}>{visit.notes}</div>
                    </div>
                    <div className="sup-my-visit-right">
                      <span className="sup-badge sup-badge-general">{visit.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FarmDetailSubView({ farmerId, farmId, onBack }) {
  const [farm, setFarm] = useState(null);
  const [visits, setVisits] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("General");
  const [recordingTime, setRecordingTime] = useState(0);
  const [submittingVisit, setSubmittingVisit] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    async function loadFarm() {
      try {
        setLoading(true);
        setError(null);

        const [farmResponse, visitResponse] = await Promise.all([
          fetch(`/api/agrisense/farms/${farmId}`),
          fetch(`/api/agrisense/farms/${farmId}/visits`),
        ]);

        const farmJson = await farmResponse.json();
        const visitJson = await visitResponse.json();

        if (!farmResponse.ok) {
          throw new Error(farmJson.error || "Unable to load farm details");
        }
        if (!visitResponse.ok) {
          throw new Error(visitJson.error || "Unable to load farm visits");
        }

        setFarm(farmJson.farm);
        setVisits(visitJson.visits || []);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadFarm();
  }, [farmId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await handleTranscribe(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access denied or not supported in this browser.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const handleTranscribe = async (blob) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      const response = await fetch("/api/agrisense/sarvam/transcribe", {
        method: "POST",
        body: formData,
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to transcribe audio");
      }

      if (json.transcript) {
        setNotes((prev) => (prev ? prev + "\n" + json.transcript : json.transcript));
      }
    } catch (err) {
      alert("Transcription failed: " + err.message);
    } finally {
      setTranscribing(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmitVisit = async (e) => {
    e.preventDefault();
    console.log("AgriSensePanel: handleSubmitVisit called, notes:", notes, "category:", category);
    if (!notes.trim()) {
      console.log("AgriSensePanel: notes is empty, ignoring.");
      return;
    }
    setSubmittingVisit(true);
    try {
      const url = `/api/agrisense/farms/${farmId}/visits`;
      console.log("AgriSensePanel: POSTing to URL:", url);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, category }),
      });
      console.log("AgriSensePanel: Response status:", response.status);
      const json = await response.json();
      console.log("AgriSensePanel: Response json:", json);
      if (!response.ok) {
        throw new Error(json.error || "Failed to save visit");
      }

      setNotes("");
      setCategory("General");
      setVisits((prev) => [json.visit, ...prev]);

      const farmRes = await fetch(`/api/agrisense/farms/${farmId}`);
      console.log("AgriSensePanel: Reload farm details status:", farmRes.status);
      const farmJson = await farmRes.json();
      if (farmRes.ok) {
        setFarm(farmJson.farm);
      }
    } catch (err) {
      console.error("AgriSensePanel: Error saving visit:", err);
      alert("Error saving visit: " + err.message);
    } finally {
      setSubmittingVisit(false);
    }
  };

  return (
    <div className="sup-shell" style={{ background: "none", minHeight: "auto", padding: 0 }}>
      <main className="sup-page">
        <div className="sup-page-header" style={{ marginBottom: 20 }}>
          <div>
            <button onClick={onBack} className="sup-btn sup-btn-primary sup-btn-sm" style={{ padding: "6px 14px", fontWeight: 700, fontSize: "0.8rem", borderRadius: 8, cursor: "pointer", background: "linear-gradient(135deg, #217a4a, #2da05f)", border: "none", color: "#fff", marginBottom: 14 }}>
              ← Back
            </button>
            <h1 className="sup-page-title" style={{ fontSize: "1.6rem" }}>{farm?.name || "Farm Detail"}</h1>
            <p className="sup-page-date">{farm?.location || "Location unavailable"}</p>
          </div>
        </div>

        {loading && (
          <div className="sup-section-block">
            <div className="sup-empty-title">Loading farm detail…</div>
          </div>
        )}

        {error && !loading && <div className="sup-alert sup-alert-error">{error}</div>}

        {farm && !loading && (
          <>
            <div className="sup-metric-row">
              <div className="sup-metric-card">
                <div className="sup-metric-value">{farm.health_tier?.toUpperCase() || "NA"}</div>
                <div className="sup-metric-label">Current Health</div>
              </div>
              <div className="sup-metric-card accent-amber">
                <div className="sup-metric-value">{farm.risk_count ?? 0}</div>
                <div className="sup-metric-label">Open Risks</div>
              </div>
              <div className="sup-metric-card accent-blue">
                <div className="sup-metric-value">{farm.task_count ?? 0}</div>
                <div className="sup-metric-label">Tracked Tasks</div>
              </div>
            </div>

            <div className="sup-section-block">
              <div className="sup-section-header">
                <div>
                  <div className="sup-section-title-text">Latest Farm Report</div>
                  <div className="sup-section-subtitle">Supervisor guidance and current summary</div>
                </div>
              </div>

              <div className="sup-card" style={{ padding: 20 }}>
                <p style={{ marginTop: 0, color: "#1a2e25", lineHeight: 1.6 }}>
                  {farm.master_report?.summary || "No report summary available yet."}
                </p>
                {farm.master_report?.supervisor_instructions && farm.master_report.supervisor_instructions.length > 0 && (
                  <div className="sup-my-visit-snippet" style={{ marginTop: 14 }}>
                    {farm.master_report.supervisor_instructions.join(" ")}
                  </div>
                )}
              </div>
            </div>

            {/* Record New Visit Block */}
            <div className="sup-section-block">
              <div className="sup-section-header">
                <div>
                  <div className="sup-section-title-text">Record Field Visit</div>
                  <div className="sup-section-subtitle">Record conversation with the farmer or dictate visit notes</div>
                </div>
              </div>

              <form onSubmit={handleSubmitVisit}>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#4d6659" }}>Visit Category:</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: "1.5px solid #d9e8de",
                        background: "#fff",
                        fontSize: "0.82rem",
                        outline: "none",
                        fontWeight: 600,
                        color: "#217a4a",
                      }}
                    >
                      <option value="General">General</option>
                      <option value="Irrigation">Irrigation</option>
                      <option value="Pesticide">Pesticide</option>
                      <option value="Crop Health">Crop Health</option>
                      <option value="Fertilizer">Fertilizer</option>
                      <option value="Disease">Disease</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Farmer Note">Farmer Note</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "4px 0" }}>
                    <button
                      type="button"
                      onClick={recording ? stopRecording : startRecording}
                      disabled={transcribing}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 20px",
                        borderRadius: "99px",
                        border: "none",
                        background: recording
                          ? "linear-gradient(135deg, #dc2626, #ef4444)"
                          : "linear-gradient(135deg, #217a4a, #2da05f)",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        boxShadow: recording
                          ? "0 4px 16px rgba(220,38,38,0.25)"
                          : "0 4px 16px rgba(33,122,74,0.18)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {recording ? (
                        <>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: "#fff",
                              display: "inline-block",
                              animation: "agriPulse 1s infinite alternate",
                            }}
                          />
                          Stop Recording ({formatTime(recordingTime)})
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                          </svg>
                          Record Conversation
                        </>
                      )}
                    </button>

                    {transcribing && (
                      <span style={{ fontSize: "0.82rem", color: "#4d6659", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 14,
                            height: 14,
                            border: "2px solid #217a4a",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            animation: "agriSpin .8s linear infinite",
                          }}
                        />
                        Transcribing voice input…
                      </span>
                    )}
                  </div>

                  <textarea
                    placeholder="Type your notes here, or record a conversation to transcribe automatically using Sarvam AI..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1.5px solid #d9e8de",
                      background: "#fff",
                      fontSize: "0.85rem",
                      lineHeight: "1.6",
                      fontFamily: "inherit",
                      outline: "none",
                      color: "#1a2e25",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#2da05f")}
                    onBlur={(e) => (e.target.style.borderColor = "#d9e8de")}
                  />

                  <div>
                    <button
                      type="submit"
                      disabled={submittingVisit || !notes.trim()}
                      className="sup-btn sup-btn-primary"
                      style={{
                        padding: "8px 20px",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        opacity: !notes.trim() || submittingVisit ? 0.6 : 1,
                        cursor: !notes.trim() || submittingVisit ? "not-allowed" : "pointer",
                      }}
                    >
                      {submittingVisit ? "Saving..." : "Save Visit Log"}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            <div className="sup-section-block">
              <div className="sup-section-header">
                <div>
                  <div className="sup-section-title-text">Visit Timeline</div>
                  <div className="sup-section-subtitle">Recent recordings and notes for this farm</div>
                </div>
              </div>

              {visits.length === 0 ? (
                <div className="sup-empty">
                  <div className="sup-empty-title">No visits yet</div>
                </div>
              ) : (
                <div className="sup-my-visits-list">
                  {visits.map((visit) => (
                    <div key={visit.id} className="sup-my-visit-card">
                      <div className="sup-my-visit-left">
                        <div className="sup-my-visit-date">{fmtDate(visit.created_at)}</div>
                        <div className="sup-my-visit-notes" style={{ fontSize: "0.85rem", color: "#1a2e25", lineHeight: 1.5, marginTop: 4 }}>{visit.notes}</div>
                      </div>
                      <div className="sup-my-visit-right">
                        <span className={`sup-badge sup-badge-${visit.category?.toLowerCase() || "general"}`}>{visit.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function AgriSenseSupervisorSubView({ onOpenProfile, onOpenFarm }) {
  const [stats, setStats]               = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [allFarmers, setAllFarmers]     = useState([]);
  const [farmersLoading, setFarmersLoading] = useState(true);
  const [farmersExpanded, setFarmersExpanded] = useState(false);
  const [copyStatus, setCopyStatus]     = useState("idle");
  const [myVisits, setMyVisits]         = useState([]);
  const [myVisitsLoading, setMyVisitsLoading] = useState(true);
  const [query, setQuery]               = useState("");
  const [farmers, setFarmers]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const debouncedQ = useDebounce(query);
  const FARMERS_PREVIEW = 3;

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  useEffect(() => {
    supervisorAPI.stats().then(setStats).catch(() => {}).finally(() => setStatsLoading(false));
    supervisorAPI.farmers().then(d => setAllFarmers(d.farmers || [])).catch(() => {}).finally(() => setFarmersLoading(false));
    supervisorAPI.myVisits().then(d => setMyVisits(d.visits || [])).catch(() => {}).finally(() => setMyVisitsLoading(false));
  }, []);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setFarmers([]); return; }
    setLoading(true); setError(null);
    try {
      const data = await supervisorAPI.search(q);
      setFarmers(data.farmers || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { search(debouncedQ); }, [debouncedQ, search]);

  const visibleFarmers = farmersExpanded ? allFarmers : allFarmers.slice(0, FARMERS_PREVIEW);
  const hasMore = allFarmers.length > FARMERS_PREVIEW;

  const copyInviteLink = async () => {
    if (copyStatus !== "idle") return;
    setCopyStatus("copying");
    try {
      const data = await supervisorAPI.myInviteLink();
      await navigator.clipboard.writeText(data.invite_url);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      setCopyStatus("idle");
    }
  };

  return (
    <div className="sup-shell" style={{ background: "none", minHeight: "auto", padding: 0 }}>
      <main className="sup-page">
        <div className="sup-page-header">
          <div>
            <h1 className="sup-page-title" style={{ fontSize: "1.6rem" }}>Supervisor Dashboard</h1>
            <p className="sup-page-date">{today}</p>
          </div>
        </div>

        <div className="sup-metric-row">
          <MetricCard icon="🌾" value={stats?.total_farms ?? 0} label="Total Farms" loading={statsLoading} />
          <MetricCard icon="📅" value={stats?.active_visits ?? 0} label="Visits This Week" accent="amber" loading={statsLoading} />
          <MetricCard icon="👥" value={stats?.total_farmers ?? 0} label="Registered Farmers" accent="blue" loading={statsLoading} />
          <MetricCard icon="📋" value={stats?.monthly_visits ?? 0} label="Visits This Month" loading={statsLoading} />
        </div>

        <div className="sup-section-block">
          <div className="sup-section-header">
            <div>
              <div className="sup-section-title-text">Find a Farmer</div>
              <div className="sup-section-subtitle">Search by name, village, or farm location</div>
            </div>
          </div>

          <div className="sup-search-wrap" style={{ marginBottom: 0 }}>
            <span className="sup-search-icon">🔍</span>
            <input
              type="text"
              className="sup-search-input"
              placeholder="Search by name, village, or farm location…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#4d6659", fontSize: "1rem", padding: "0 8px" }}>×</button>
            )}
          </div>

          {error && <div className="sup-alert sup-alert-error" style={{ marginTop: 14 }}>{error}</div>}

          {loading && (
            <div className="sup-farmer-list" style={{ marginTop: 16 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="sup-card" style={{ padding: "18px 20px", display: "flex", gap: 16, alignItems: "center" }}>
                  <div className="sup-skeleton" style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sup-skeleton" style={{ height: 14, width: "40%", marginBottom: 8 }} />
                    <div className="sup-skeleton" style={{ height: 11, width: "60%" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && farmers.length === 0 && query.trim() && !error && (
            <div className="sup-empty" style={{ padding: "28px 0" }}>
              <div className="sup-empty-title">No farmers found</div>
              <div className="sup-empty-sub">Try a different name, village, or farm area.</div>
            </div>
          )}

          {!loading && !query.trim() && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", marginTop: 10, background: "#f0f7f2", border: "1px solid #d9e8de", borderRadius: 10, fontSize: ".82rem", color: "#4d6659" }}>
              Start typing to search across all farmers in your network
            </div>
          )}

          {!loading && farmers.length > 0 && (
            <div className="sup-farmer-list" style={{ marginTop: 16 }}>
              {farmers.map(farmer => (
                <div
                  key={farmer.id}
                  className="sup-card sup-farmer-card sup-card-interactive"
                  onClick={() => onOpenProfile(farmer.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="sup-farmer-avatar">{initials(farmer.name)}</div>
                  <div className="sup-farmer-info">
                    <div className="sup-farmer-name">{farmer.name}</div>
                    <div className="sup-farmer-meta">
                      <span>{farmer.farm_count || 0} plot{farmer.farm_count !== "1" ? "s" : ""}</span>
                    </div>
                  </div>
                  <button
                    className="sup-btn sup-btn-primary sup-btn-sm"
                    onClick={e => { e.stopPropagation(); onOpenProfile(farmer.id); }}
                    tabIndex={-1}
                  >
                    View Profile →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sup-section-block">
          <div className="sup-section-header">
            <div>
              <div className="sup-section-title-text">Your Farmers</div>
              <div className="sup-section-subtitle">
                {farmersLoading ? "Loading…" : `${allFarmers.length} farmer${allFarmers.length !== 1 ? "s" : ""} in your network`}
              </div>
            </div>
            <button
              className="sup-btn sup-btn-primary sup-btn-sm"
              onClick={copyInviteLink}
              disabled={copyStatus !== "idle"}
            >
              {copyStatus === "copied" ? "Copied!" : copyStatus === "copying" ? "⋯" : "Copy Invite Link"}
            </button>
          </div>

          {farmersLoading && (
            <div className="sup-farmer-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="sup-card" style={{ padding: "18px 20px", display: "flex", gap: 16, alignItems: "center" }}>
                  <div className="sup-skeleton" style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sup-skeleton" style={{ height: 14, width: "40%", marginBottom: 8 }} />
                    <div className="sup-skeleton" style={{ height: 11, width: "60%" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!farmersLoading && allFarmers.length === 0 && (
            <div className="sup-empty" style={{ padding: "32px 0" }}>
              <div className="sup-empty-title">No farmers yet</div>
              <div className="sup-empty-sub">Use the <strong>Copy Invite Link</strong> above to add your first farmer.</div>
            </div>
          )}

          {!farmersLoading && allFarmers.length > 0 && (
            <>
              <div className="sup-farmer-list">
                {visibleFarmers.map(farmer => (
                  <div
                    key={farmer.id}
                    className="sup-card sup-farmer-card sup-card-interactive"
                    onClick={() => onOpenProfile(farmer.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="sup-farmer-avatar" style={{
                      background: farmer.status === "pending" ? "linear-gradient(135deg,#fef3c7,#fde68a)" : undefined,
                      color: farmer.status === "pending" ? "#92400e" : undefined,
                    }}>
                      {initials(farmer.name)}
                    </div>
                    <div className="sup-farmer-info">
                      <div className="sup-farmer-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {farmer.name}
                        {farmer.status === "pending" && (
                          <span style={{ fontSize: ".62rem", fontWeight: 700, padding: "2px 7px", background: "#fef3c7", color: "#92400e", borderRadius: 99, border: "1px solid #fde68a", textTransform: "uppercase", letterSpacing: ".05em" }}>
                            Invite Pending
                          </span>
                        )}
                      </div>
                      <div className="sup-farmer-meta">
                        <span>{farmer.farm_count || 0} plot{farmer.farm_count !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <button
                      className="sup-btn sup-btn-primary sup-btn-sm"
                      onClick={e => { e.stopPropagation(); onOpenProfile(farmer.id); }}
                      tabIndex={-1}
                      disabled={farmer.status === "pending"}
                      style={farmer.status === "pending" ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                    >
                      {farmer.status === "pending" ? "Awaiting…" : "View Profile →"}
                    </button>
                  </div>
                ))}
              </div>

              {hasMore && (
                <button className="sup-expand-btn" onClick={() => setFarmersExpanded(v => !v)}>
                  {farmersExpanded ? "▲ Show less" : `▼ Show ${allFarmers.length - FARMERS_PREVIEW} more farmer${allFarmers.length - FARMERS_PREVIEW !== 1 ? "s" : ""}`}
                </button>
              )}
            </>
          )}
        </div>

        {/* My Recent Visits */}
        <div className="sup-section-block">
          <div className="sup-section-header">
            <div>
              <div className="sup-section-title-text">My Recent Visits</div>
              <div className="sup-section-subtitle">Last 5 visits you recorded with farmers</div>
            </div>
          </div>

          {myVisitsLoading && (
            <div className="sup-intel-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="sup-intel-item">
                  <div style={{ flex: 1 }}>
                    <div className="sup-skeleton" style={{ height: 13, width: "35%", marginBottom: 7 }} />
                    <div className="sup-skeleton" style={{ height: 11, width: "65%" }} />
                  </div>
                  <div className="sup-skeleton" style={{ height: 22, width: 72, borderRadius: 99 }} />
                </div>
              ))}
            </div>
          )}

          {!myVisitsLoading && myVisits.length === 0 && (
            <div className="sup-empty" style={{ padding: "32px 0" }}>
              <div className="sup-empty-title">No visits recorded yet</div>
              <div className="sup-empty-sub">Your field visits will appear here once you start recording.</div>
            </div>
          )}

          {!myVisitsLoading && myVisits.length > 0 && (
            <div className="sup-my-visits-list">
              {myVisits.map(v => {
                const cls = CATEGORY_CLASS[v.category] || "general";
                const snippet = v.transcript_snippet
                  ? v.transcript_snippet.slice(0, 120) + (v.transcript_snippet.length > 120 ? "…" : "")
                  : v.notes?.slice(0, 120) + (v.notes?.length > 120 ? "…" : "");
                return (
                  <div
                    key={v.id}
                    className="sup-my-visit-card sup-card-interactive"
                    onClick={() => onOpenFarm(v.farmer_id, v.farm_id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="sup-my-visit-left">
                      <div className="sup-my-visit-date">{fmtDate(v.visit_date || v.created_at)}</div>
                      <div className="sup-my-visit-names">
                        <span className="sup-my-visit-farmer">{v.farmer_name}</span>
                        <span className="sup-my-visit-dot">·</span>
                        <span className="sup-my-visit-farm">{v.farm_name}</span>
                      </div>
                      {snippet && <div className="sup-my-visit-snippet">{snippet}</div>}
                    </div>
                    <div className="sup-my-visit-right">
                      <span className={`sup-badge sup-badge-${cls}`}>{v.category || "General"}</span>
                      <span className="sup-my-visit-ago">{timeAgo(v.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Manager View Components (Admin)
// ──────────────────────────────────────────────────────────────
function BriefingPanel({ onOpenFarm }) {
  const [loading,     setLoading]     = useState(false);
  const [briefing,    setBriefing]    = useState(null);
  const [error,       setError]       = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [followedUp,  setFollowedUp]  = useState(new Set());

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const data = await managerAPI.briefing();
      setBriefing(data.briefing);
      setGeneratedAt(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleFollowUp = (audit) => {
    const key = audit.farm_name;
    setFollowedUp(prev => new Set([...prev, key]));
    setTimeout(() => setFollowedUp(prev => { const n = new Set(prev); n.delete(key); return n; }), 2500);
  };

  const timeLabel = generatedAt
    ? `Generated at ${generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
    : "Supervisor & farmer accountability breakdown";

  const redAudits = briefing?.audits?.filter(a => a.status?.toLowerCase() === "red") || [];

  return (
    <div className="mg-report-section">
      <div className="mg-report-header">
        <div className="mg-report-title-block">
          <span className="mg-report-icon">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </span>
          <div>
            <div className="mg-report-title">Operations Audit</div>
            <div className="mg-report-sub">{timeLabel}</div>
          </div>
        </div>
        <button className={`mg-report-btn${loading ? "" : " mg-report-btn-active"}`} onClick={handleGenerate} disabled={loading}>
          {loading ? <><span className="mg-btn-spinner" />Analyzing…</> : briefing ? "Regenerate Report" : "Generate AI Report"}
        </button>
      </div>

      {loading && (
        <div className="mg-report-loading">
          <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #22c55e", borderTopColor: "transparent", borderRadius: "50%", animation: "agriSpin .7s linear infinite" }} />
          <span>Analyzing supervisor & farmer activity across all farms…</span>
        </div>
      )}

      {error && !loading && <div className="mg-report-error">{error}</div>}

      {!loading && !briefing && !error && (
        <div className="mg-report-placeholder">
          <div className="mg-placeholder-icon">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <p>Generate the audit to see a structured accountability breakdown — who visited, what was flagged, and what action each farm needs.</p>
        </div>
      )}

      {!loading && briefing && (
        <div className="mg-report-body">
          {briefing.audits?.length === 0 ? (
            <div className="mg-report-all-clear">✅ <span>No farms need immediate attention. Portfolio is healthy.</span></div>
          ) : (
            <>
              <div className="mg-report-summary">
                <span className="mg-summary-total">{briefing.audits.length} farms flagged</span>
                {redAudits.length > 0 && <span className="mg-summary-chip mg-summary-red">{redAudits.length} Critical</span>}
              </div>
              {redAudits.length > 0 && (
                <div className="mg-report-group">
                  <div className="mg-group-label mg-group-red">Critical — Immediate Action Required</div>
                  <div className="mg-audit-grid">
                    {redAudits.map((audit, i) => {
                      const tier = audit.status?.toLowerCase() === "red" ? "red" : "yellow";
                      const daysLabel = audit.days_since_visit === null || audit.days_since_visit === undefined
                        ? "Never visited" : audit.days_since_visit === 0 ? "Visited today" : audit.days_since_visit === 1 ? "Visited yesterday" : `Visited ${audit.days_since_visit} days ago`;
                      return (
                        <div key={i} className={`mg-audit-card mg-audit-${tier}`}>
                          <div className="mg-audit-header">
                            <span className={`mg-audit-dot mg-audit-dot-${tier}`} />
                            <span className="mg-audit-farm-name">{audit.farm_name}</span>
                            <span className={`mg-audit-badge mg-audit-badge-${tier}`}>{audit.status}</span>
                          </div>
                          <div className="mg-audit-people">
                            <span className="mg-audit-person mg-audit-farmer">Supervisor Review</span>
                            <span className="mg-audit-person mg-audit-supervisor" onClick={() => handleFollowUp(audit)} title="Mark follow-up reminder">
                              {audit.supervisor_name}<span className="mg-sup-arrow">↗</span>
                            </span>
                            {followedUp.has(audit.farm_name) && <span className="mg-follow-toast">Noted</span>}
                          </div>
                          <div className="mg-audit-days">
                            <span>{daysLabel}</span>
                          </div>
                          {audit.situation && (
                            <div className="mg-audit-situation"><span className="mg-situation-icon">!</span><span>{audit.situation}</span></div>
                          )}
                          {audit.action && (
                            <div className="mg-audit-action"><span className="mg-action-arrow">→</span><span>{audit.action}</span></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {briefing.regional_outlook && (
            <div className="mg-report-outlook">
              <span className="mg-outlook-label">Regional Outlook</span>
              <p className="mg-outlook-text">{briefing.regional_outlook}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, count, tier, active, onClick }) {
  return (
    <button
      className={`mg-kpi-card ${tier ? `mg-kpi-${tier}` : "mg-kpi-total"} ${active ? "mg-kpi-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="mg-kpi-count">{count ?? "—"}</div>
      <div className="mg-kpi-label">{label}</div>
      {tier && <div className="mg-kpi-hint">Click to filter</div>}
    </button>
  );
}

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.grey;
  return (
    <span className={`mg-tier-badge ${cfg.cssClass}`}>
      <span className="mg-tier-dot" /> {cfg.label}
    </span>
  );
}

const TIER_CONFIG = {
  red:   { label: "At Risk",  cssClass: "mg-tier-red"   },
  green: { label: "Healthy",  cssClass: "mg-tier-green" },
  grey:  { label: "No Data",  cssClass: "mg-tier-grey"  },
};

function AgriSenseManagerSubView({ onOpenFarm }) {
  const [portfolio, setPortfolio] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState("all");
  const [expandedSupervisorId, setExpandedSupervisorId] = useState(null);

  useEffect(() => {
    managerAPI.portfolio().then(setPortfolio).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const toggleFilter = (tier) => setFilter(prev => prev === tier ? "all" : tier);
  const visibleFarms = portfolio?.farms.filter(f => filter === "all" || f.health_tier === filter) || [];

  const groupedBySupervisor = visibleFarms.reduce((groups, farm) => {
    const supId = farm.supervisor_id || "unassigned";
    const supName = farm.supervisor_name || "Unassigned";
    if (!groups[supId]) {
      groups[supId] = {
        id: supId,
        name: supName,
        farms: [],
      };
    }
    groups[supId].farms.push(farm);
    return groups;
  }, {});

  const supervisorsList = Object.values(groupedBySupervisor);

  return (
    <div className="mg-shell" style={{ background: "none", minHeight: "auto", padding: 0 }}>
      <main className="mg-main">
        <div style={{ marginBottom: 20 }}>
          <h1 className="sup-page-title" style={{ fontSize: "1.6rem" }}>Portfolio Manager Dashboard</h1>
          <p className="sup-page-date">Overview of all supervisor networks and active plots</p>
        </div>

        {loading && (
          <div className="mg-loading">
            <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #22c55e", borderTopColor: "transparent", borderRadius: "50%", animation: "agriSpin .7s linear infinite" }} />
            <span>Loading portfolio…</span>
          </div>
        )}

        {error && !loading && <div className="mg-alert mg-alert-error">{error}</div>}

        {portfolio && !loading && (
          <>
            {/* KPI Strip */}
            <div className="mg-kpi-strip">
              <KpiCard label="Total Farms" count={portfolio.summary.total} active={filter === "all"} onClick={() => setFilter("all")} />
              <KpiCard label="At Risk" count={portfolio.summary.red} tier="red" active={filter === "red"} onClick={() => toggleFilter("red")} />
              <KpiCard label="Healthy" count={portfolio.summary.green} tier="green" active={filter === "green"} onClick={() => toggleFilter("green")} />
            </div>

            {/* Supervisor Network & Farms */}
            <div className="mg-farm-section">
              <div className="mg-grid-header">
                <span className="mg-grid-title">
                  Supervisor Network & Farms
                  <span className="mg-grid-count">
                    {filter === "all" ? `${portfolio.summary.total} farms` : `${visibleFarms.length} of ${portfolio.summary.total} shown`}
                  </span>
                </span>
                {filter !== "all" && (
                  <button className="mg-clear-filter" onClick={() => setFilter("all")}>Clear filter</button>
                )}
              </div>

              {supervisorsList.length === 0 ? (
                <div className="mg-empty">
                  <div className="mg-empty-icon">🌿</div>
                  <div className="mg-empty-msg">No supervisor activity matching this filter</div>
                </div>
              ) : (
                <div className="mg-supervisors-list">
                  {supervisorsList.map(sup => {
                    const isExpanded = expandedSupervisorId === sup.id;
                    const totalFarms = sup.farms.length;
                    const atRiskFarms = sup.farms.filter(f => f.health_tier === "red").length;
                    const healthyFarms = sup.farms.filter(f => f.health_tier === "green").length;

                    return (
                      <div
                        key={sup.id}
                        className={`mg-supervisor-group-card ${isExpanded ? "expanded" : ""}`}
                      >
                        <div
                          className="mg-supervisor-header"
                          onClick={() => setExpandedSupervisorId(isExpanded ? null : sup.id)}
                        >
                          <div className="mg-supervisor-info-block">
                            <div className={`mg-supervisor-avatar-wrap ${sup.id === "unassigned" ? "unassigned" : ""}`}>
                              <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </div>
                            <div>
                              <h3 className="mg-supervisor-name-text">
                                {sup.id === "unassigned" ? "Unassigned Supervisors" : sup.name}
                              </h3>
                              <span className="mg-supervisor-sub-text">
                                {totalFarms} farm{totalFarms !== 1 ? "s" : ""} under supervision
                              </span>
                            </div>
                          </div>

                          <div className="mg-supervisor-right-block">
                            <div style={{ display: "flex", gap: "6px" }}>
                              {atRiskFarms > 0 && (
                                <span className="mg-tier-badge mg-tier-red">
                                  <span className="mg-tier-dot" /> {atRiskFarms} At Risk
                                </span>
                              )}
                              {healthyFarms > 0 && (
                                <span className="mg-tier-badge mg-tier-green">
                                  <span className="mg-tier-dot" /> {healthyFarms} Healthy
                                </span>
                              )}
                            </div>
                            <span className={`mg-supervisor-chevron ${isExpanded ? "expanded" : ""}`}>
                              <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mg-supervisor-farms-section">
                            <h4 className="mg-supervisor-farms-title">
                              Farmers & Plots under {sup.name}
                            </h4>
                            <div className="mg-farm-grid">
                              {sup.farms.map(farm => (
                                <div
                                  key={farm.id}
                                  className={`mg-farm-card mg-farm-${farm.health_tier}`}
                                  onClick={() => onOpenFarm(farm.farmer_id, farm.id)}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="mg-farm-header">
                                    <div className="mg-farm-name">{farm.name}</div>
                                    <TierBadge tier={farm.health_tier} />
                                  </div>

                                  <div className="mg-farm-meta">
                                    <span className="mg-farm-meta-row">
                                      <span className="mg-meta-icon">
                                        <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                                      </span>
                                      {farm.location}
                                    </span>
                                    <span className="mg-farm-meta-row">
                                      <span className="mg-meta-icon">
                                        <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                      </span>
                                      Supervisor: {farm.supervisor_name ? farm.supervisor_name : <em className="mg-meta-muted">Unassigned</em>}
                                    </span>
                                  </div>

                                  <div className="mg-farm-footer">
                                    <span className="mg-visit-label">{daysAgoLabel(farm.days_since_visit)}</span>
                                    {farm.risk_count > 0 && <span className="mg-risk-chip">{farm.risk_count} risk{farm.risk_count > 1 ? "s" : ""}</span>}
                                    {farm.task_count > 0 && farm.risk_count === 0 && (
                                      <span className="mg-task-chip">{farm.completed_count}/{farm.task_count} tasks</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Operations Audit */}
            <BriefingPanel onOpenFarm={onOpenFarm} />
          </>
        )}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Unified AgriSense Panel
// ──────────────────────────────────────────────────────────────
export default function AgriSensePanel({ role, session }) {
  const user = session?.user;
  const userRole = String(role || user?.role || "Worker").toLowerCase();

  const [viewState, setViewState] = useState({
    view: "root", // "root", "farmer-profile", "farm-detail"
    farmerId: null,
    farmId: null,
    returnTo: "root"
  });

  // Reset viewState if role changes
  useEffect(() => {
    setViewState({
      view: "root",
      farmerId: null,
      farmId: null,
      returnTo: "root"
    });
  }, [userRole]);

  // Worker flow: direct rendering of farmer page logic
  if (userRole === "worker" || userRole === "farmer") {
    return <AgriSenseFarmerSubView user={user} />;
  }

  // Supervisor Flow
  if (userRole === "supervisor") {
    if (viewState.view === "farmer-profile") {
      return (
        <FarmerProfileSubView
          farmerId={viewState.farmerId}
          onBack={() => setViewState({ view: "root", farmerId: null, farmId: null })}
          onOpenFarm={(farmId) => {
            console.log("AgriSensePanel: onOpenFarm wrapper called, farmerId:", viewState.farmerId, "farmId:", farmId);
            setViewState({ view: "farm-detail", farmerId: viewState.farmerId, farmId });
          }}
        />
      );
    }
    if (viewState.view === "farm-detail") {
      return (
        <FarmDetailSubView
          farmerId={viewState.farmerId}
          farmId={viewState.farmId}
          onBack={() => setViewState({ view: "farmer-profile", farmerId: viewState.farmerId, farmId: null })}
        />
      );
    }

    return (
      <AgriSenseSupervisorSubView
        onOpenProfile={(farmerId) => setViewState({ view: "farmer-profile", farmerId, farmId: null })}
        onOpenFarm={(farmerId, farmId) => setViewState({ view: "farm-detail", farmerId, farmId })}
      />
    );
  }

  // Admin/Manager Flow
  if (userRole === "admin" || userRole === "manager") {
    if (viewState.view === "farm-detail") {
      return (
        <FarmDetailSubView
          farmerId={viewState.farmerId}
          farmId={viewState.farmId}
          onBack={() => setViewState({ view: "root", farmerId: null, farmId: null })}
        />
      );
    }

    return (
      <AgriSenseManagerSubView
        onOpenFarm={(farmerId, farmId) => setViewState({ view: "farm-detail", farmerId, farmId })}
      />
    );
  }

  return (
    <div style={{ padding: 24, textAlign: "center", color: "var(--color-text)" }}>
      <h3>AgriSense View Unavailable</h3>
      <p>Role: {role}</p>
    </div>
  );
}
