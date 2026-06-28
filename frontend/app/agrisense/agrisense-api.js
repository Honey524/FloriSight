/**
 * AgriSense API client for Next.js pages.
 * Calls the local Next.js AgriSense backend at /api/agrisense/*.
 */

const BASE = "/api/agrisense";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

async function requestFormData(path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── Supervisor APIs ────────────────────────────────────────────
export const supervisorAPI = {
  stats:      () => request("/supervisor/stats"),
  farmers:    () => request("/supervisor/farmers"),
  myVisits:   () => request("/supervisor/my-visits"),
  search:     (q) => request(`/farmers/search?q=${encodeURIComponent(q)}`),
  myInviteLink: () => request("/supervisor/my-invite-link"),
};

// ── Farmer APIs ───────────────────────────────────────────────
export const farmerAPI = {
  myFarm: (farmId) => request(`/farmer/my-farm${farmId ? `?farm_id=${farmId}` : ""}`),
  toggleTask: (payload) => request("/farmer/tasks", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),
  reportIssue: (payload) => request("/farmer/report-issue", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
};

// ── Manager APIs ───────────────────────────────────────────────
export const managerAPI = {
  portfolio: () => request("/manager/portfolio"),
  briefing:  () => request("/manager/briefing", { method: "POST" }),
};

// ── Farm detail APIs ───────────────────────────────────────────
export const farmsAPI = {
  detail:     (farmId) => request(`/farms/${farmId}`),
  visits:     (farmId) => request(`/farms/${farmId}/visits`),
  createVisit: (farmId, payload) => request(`/farms/${farmId}/visits`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  updateReport: (visitId, payload) => request(`/visits/${visitId}/report`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }),
  submitAudio: (formData) => requestFormData("/sarvam/transcribe", formData),
};

// ── Chat API ──────────────────────────────────────────────────
export const chatAPI = {
  ask: (formData) => requestFormData("/chat/ask", formData),
};
