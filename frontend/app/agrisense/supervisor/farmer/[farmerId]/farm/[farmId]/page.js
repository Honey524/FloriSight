"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SupervisorFarmDetailPage({ params }) {
  const resolvedParams = use(params);
  const farmId = resolvedParams.farmId;
  const farmerId = resolvedParams.farmerId;

  const [farm, setFarm] = useState(null);
  const [visits, setVisits] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Visit Recording & Transcription State
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

  // Audio Recording Functions
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
    console.log("SupervisorFarmDetailPage: handleSubmitVisit called, notes:", notes, "category:", category);
    if (!notes.trim()) {
      console.log("SupervisorFarmDetailPage: notes is empty, ignoring.");
      return;
    }
    setSubmittingVisit(true);
    try {
      const url = `/api/agrisense/farms/${farmId}/visits`;
      console.log("SupervisorFarmDetailPage: POSTing to URL:", url);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, category }),
      });
      console.log("SupervisorFarmDetailPage: Response status:", response.status);
      const json = await response.json();
      console.log("SupervisorFarmDetailPage: Response json:", json);
      if (!response.ok) {
        throw new Error(json.error || "Failed to save visit");
      }

      setNotes("");
      setCategory("General");
      setVisits((prev) => [json.visit, ...prev]);

      const farmRes = await fetch(`/api/agrisense/farms/${farmId}`);
      console.log("SupervisorFarmDetailPage: Reload farm details status:", farmRes.status);
      const farmJson = await farmRes.json();
      if (farmRes.ok) {
        setFarm(farmJson.farm);
      }
    } catch (err) {
      console.error("SupervisorFarmDetailPage: Error saving visit:", err);
      alert("Error saving visit: " + err.message);
    } finally {
      setSubmittingVisit(false);
    }
  };

  return (
    <div className="sup-shell">
      <main className="sup-page">
        <div className="sup-page-header">
          <div>
            <p className="sup-page-date">
              <Link href={`/agrisense/supervisor/farmer/${farmerId}`} className="agri-back-to-florisight">← Back to Farmer Profile</Link>
            </p>
            <h1 className="sup-page-title">{farm?.name || "Farm Detail"}</h1>
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
                  {farm.summary || "No report summary available yet."}
                </p>
                {farm.supervisor_instructions && farm.supervisor_instructions.length > 0 && (
                  <div className="sup-my-visit-snippet" style={{ marginTop: 14 }}>
                    {farm.supervisor_instructions.join(" ")}
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
                        <div className="sup-my-visit-date">{formatDate(visit.created_at)}</div>
                        <div className="sup-my-visit-snippet">{visit.notes}</div>
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
