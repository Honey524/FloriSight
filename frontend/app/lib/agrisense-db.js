import crypto from "crypto";

import { createAlert, ensureSchema, getPool } from "./db.js";

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return [];
}

function daysSince(dateValue) {
  if (!dateValue) return null;
  const diff = Date.now() - new Date(dateValue).getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function buildHealthTier({ status, progress, attendance, riskCount }) {
  if (Number(riskCount || 0) > 0) return "red";
  const normalizedStatus = String(status || "").toLowerCase();
  const normalizedAttendance = String(attendance || "").toLowerCase();
  const numericProgress = Number(progress || 0);

  if (normalizedAttendance.includes("absent")) return "red";
  if (normalizedStatus.includes("pending") || normalizedStatus.includes("blocked")) return "red";
  if (numericProgress >= 60) return "green";
  if (normalizedStatus.includes("review") || normalizedStatus.includes("progress")) return "green";
  return "grey";
}

function buildInstructions(worker) {
  const steps = [];

  if (worker.task) {
    steps.push(`Continue ${worker.task.toLowerCase()}.`);
  }
  if (worker.zone) {
    steps.push(`Inspect conditions in ${worker.zone} and share an update after completion.`);
  }
  if (worker.attendance && worker.attendance !== "Not marked") {
    steps.push(`Keep today's status aligned with the ${worker.attendance.toLowerCase()} attendance record.`);
  }

  return steps.slice(0, 3);
}

function buildSummary(worker) {
  const task = worker.task || "No active assignment";
  const status = worker.status || "Ready";
  const progress = Number(worker.progress || 0);
  return `${task} is currently ${status.toLowerCase()} with ${progress}% progress in ${worker.zone || "the assigned zone"}.`;
}

async function ensureAgriSenseSchema() {
  await ensureSchema();

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS agrisense_farms (
      id TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'Not assigned',
      crop_type TEXT NOT NULL DEFAULT 'Floriculture',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agrisense_reports (
      farm_id TEXT PRIMARY KEY REFERENCES agrisense_farms(id) ON DELETE CASCADE,
      summary TEXT NOT NULL DEFAULT 'Awaiting the first supervisor report.',
      health_tier TEXT NOT NULL DEFAULT 'grey' CHECK (health_tier IN ('green', 'red', 'grey')),
      risk_count INTEGER NOT NULL DEFAULT 0,
      task_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      completed_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
      supervisor_instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
      next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agrisense_visits (
      id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL REFERENCES agrisense_farms(id) ON DELETE CASCADE,
      farmer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      category TEXT NOT NULL DEFAULT 'General',
      notes TEXT NOT NULL,
      transcript TEXT,
      visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS agrisense_farms_supervisor_idx
    ON agrisense_farms (supervisor_id, farmer_id);

    CREATE INDEX IF NOT EXISTS agrisense_visits_farm_idx
    ON agrisense_visits (farm_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS agrisense_visits_supervisor_idx
    ON agrisense_visits (supervisor_id, created_at DESC);
  `);

  await bootstrapAgriSenseData();
}

async function bootstrapAgriSenseData() {
  const workersResult = await getPool().query(`
    SELECT
      w.user_id,
      w.supervisor_id,
      w.zone,
      w.task,
      w.status,
      w.progress,
      w.attendance,
      worker_user.name AS worker_name
    FROM workers w
    JOIN users worker_user ON worker_user.id = w.user_id
    ORDER BY worker_user.name ASC
  `);

  const REAL_LOCATIONS = [
    "Devanahalli Floriculture Hub, Bengaluru",
    "Hosur Rose Valley, Tamil Nadu",
    "Chikkaballapur Marigold Fields, Karnataka",
    "Doddaballapura Jasmine Gardens, Bengaluru",
    "Anekal Orchid Farms, Bengaluru",
    "Nelamangala Carnation Plots, Bengaluru",
    "Kanakapura Anthurium Valley, Ramanagara",
    "Malur Gerbera Greenhouses, Kolar",
    "Kolar Daisy Beds, Karnataka",
    "Yelahanka Tulip Sanctuary, Bengaluru"
  ];

  let locIdx = 0;
  for (const worker of workersResult.rows) {
    const farmId = `farm-${worker.user_id}`;
    const displayName = String(worker.worker_name || "Farmer").split(" ")[0];
    const instructions = buildInstructions(worker);
    const completedTasks = [];
    const location = REAL_LOCATIONS[locIdx % REAL_LOCATIONS.length];
    locIdx++;

    await getPool().query(
      `
        INSERT INTO agrisense_farms (id, farmer_id, supervisor_id, name, location, crop_type, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE
        SET
          supervisor_id = EXCLUDED.supervisor_id,
          name = EXCLUDED.name,
          location = EXCLUDED.location,
          crop_type = EXCLUDED.crop_type,
          updated_at = NOW()
      `,
      [
        farmId,
        worker.user_id,
        worker.supervisor_id || null,
        `${displayName}'s Farm`,
        location,
        "Floriculture",
      ]
    );

    await getPool().query(
      `
        INSERT INTO agrisense_reports (
          farm_id,
          summary,
          health_tier,
          risk_count,
          task_count,
          completed_count,
          completed_tasks,
          supervisor_instructions,
          next_steps,
          updated_at
        )
        VALUES ($1, $2, $3, 0, $4, 0, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
        ON CONFLICT (farm_id) DO NOTHING
      `,
      [
        farmId,
        buildSummary(worker),
        buildHealthTier({ ...worker, riskCount: 0 }),
        instructions.length,
        JSON.stringify(completedTasks),
        JSON.stringify(instructions),
        JSON.stringify(instructions),
      ]
    );

    const existingVisits = await getPool().query(
      `SELECT 1 FROM agrisense_visits WHERE farm_id = $1 LIMIT 1`,
      [farmId]
    );

    if (!existingVisits.rows.length) {
      await getPool().query(
        `
          INSERT INTO agrisense_visits (
            id,
            farm_id,
            farmer_id,
            supervisor_id,
            category,
            notes,
            transcript,
            visit_date,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
        `,
        [
          crypto.randomUUID(),
          farmId,
          worker.user_id,
          worker.supervisor_id || null,
          "General",
          buildSummary(worker),
          buildSummary(worker),
        ]
      );
    }
  }
}

async function getFarmRows(filterSql = "", values = []) {
  await ensureAgriSenseSchema();

  const result = await getPool().query(
    `
      SELECT
        f.id,
        f.farmer_id,
        f.supervisor_id,
        f.name,
        f.location,
        f.crop_type,
        farmer_user.name AS farmer_name,
        farmer_user.email AS farmer_email,
        worker.zone AS farmer_village,
        worker.task,
        worker.status,
        worker.progress,
        worker.attendance,
        supervisor_user.name AS supervisor_name,
        COALESCE(r.summary, 'Awaiting the first supervisor report.') AS summary,
        COALESCE(r.health_tier, 'grey') AS health_tier,
        COALESCE(r.risk_count, 0) AS risk_count,
        COALESCE(r.task_count, 0) AS task_count,
        COALESCE(r.completed_count, 0) AS completed_count,
        COALESCE(r.completed_tasks, '[]'::jsonb) AS completed_tasks,
        COALESCE(r.supervisor_instructions, '[]'::jsonb) AS supervisor_instructions,
        COALESCE(r.next_steps, '[]'::jsonb) AS next_steps,
        MAX(v.visit_date) AS last_visit_at,
        COUNT(v.id)::int AS visit_count
      FROM agrisense_farms f
      JOIN users farmer_user ON farmer_user.id = f.farmer_id
      LEFT JOIN workers worker ON worker.user_id = f.farmer_id
      LEFT JOIN users supervisor_user ON supervisor_user.id = f.supervisor_id
      LEFT JOIN agrisense_reports r ON r.farm_id = f.id
      LEFT JOIN agrisense_visits v ON v.farm_id = f.id
      ${filterSql}
      GROUP BY
        f.id,
        f.farmer_id,
        f.supervisor_id,
        f.name,
        f.location,
        f.crop_type,
        farmer_user.name,
        farmer_user.email,
        worker.zone,
        worker.task,
        worker.status,
        worker.progress,
        worker.attendance,
        supervisor_user.name,
        r.summary,
        r.health_tier,
        r.risk_count,
        r.task_count,
        r.completed_count,
        r.completed_tasks,
        r.supervisor_instructions,
        r.next_steps
      ORDER BY farmer_user.name ASC
    `,
    values
  );

  return result.rows.map((row) => ({
    id: row.id,
    farmer_id: row.farmer_id,
    supervisor_id: row.supervisor_id,
    name: row.name,
    location: row.location,
    crop_type: row.crop_type,
    farmer_name: row.farmer_name,
    farmer_email: row.farmer_email,
    farmer_village: row.farmer_village || row.location,
    supervisor_name: row.supervisor_name,
    task: row.task,
    status: row.status,
    progress: Number(row.progress || 0),
    attendance: row.attendance,
    health_tier: row.health_tier,
    risk_count: Number(row.risk_count || 0),
    task_count: Number(row.task_count || 0),
    completed_count: Number(row.completed_count || 0),
    visit_count: Number(row.visit_count || 0),
    days_since_visit: daysSince(row.last_visit_at),
    master_report: {
      summary: row.summary,
      completed_tasks: toArray(row.completed_tasks),
      supervisor_instructions: toArray(row.supervisor_instructions),
      next_steps: toArray(row.next_steps),
    },
  }));
}

async function getVisits({ filterSql = "", values = [] } = {}) {
  await ensureAgriSenseSchema();

  const result = await getPool().query(
    `
      SELECT
        v.id,
        v.farm_id,
        v.farmer_id,
        v.supervisor_id,
        v.category,
        v.notes,
        v.transcript,
        v.visit_date,
        v.created_at,
        f.name AS farm_name,
        farmer_user.name AS farmer_name
      FROM agrisense_visits v
      JOIN agrisense_farms f ON f.id = v.farm_id
      JOIN users farmer_user ON farmer_user.id = v.farmer_id
      ${filterSql}
      ORDER BY v.created_at DESC
    `,
    values
  );

  return result.rows.map((row) => ({
    id: row.id,
    farm_id: row.farm_id,
    farmer_id: row.farmer_id,
    supervisor_id: row.supervisor_id,
    farm_name: row.farm_name,
    farmer_name: row.farmer_name,
    category: row.category,
    notes: row.notes,
    transcript: row.transcript || row.notes,
    transcript_snippet: String(row.transcript || row.notes || "").slice(0, 160),
    visit_date: row.visit_date,
    created_at: row.created_at,
  }));
}

function buildActor(token) {
  return {
    id: token.userId || token.sub || null,
    email: token.email || null,
    role: token.role || null,
    supervisorId: token.supervisorId || null,
    workerId: token.workerId || null,
    name: token.name || null,
  };
}

export async function getAgriSenseActor(token) {
  await ensureAgriSenseSchema();
  return buildActor(token);
}

export async function getSupervisorStats(actor) {
  const supervisorId = actor.role === "Supervisor" ? actor.id : actor.supervisorId || actor.id;
  const farms = await getFarmRows(`WHERE f.supervisor_id = $1`, [supervisorId]);
  const visits = await getVisits({ filterSql: `WHERE v.supervisor_id = $1`, values: [supervisorId] });

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return {
    total_farms: farms.length,
    active_visits: visits.filter((visit) => new Date(visit.created_at).getTime() >= weekAgo).length,
    total_farmers: new Set(farms.map((farm) => farm.farmer_id)).size,
    monthly_visits: visits.filter((visit) => new Date(visit.created_at).getTime() >= monthAgo).length,
  };
}

export async function getSupervisorFarmers(actor) {
  const supervisorId = actor.role === "Supervisor" ? actor.id : actor.supervisorId || actor.id;
  const farms = await getFarmRows(`WHERE f.supervisor_id = $1`, [supervisorId]);

  const farmers = Array.from(
    farms.reduce((map, farm) => {
      if (!map.has(farm.farmer_id)) {
        map.set(farm.farmer_id, {
          id: farm.farmer_id,
          name: farm.farmer_name,
          village: farm.farmer_village,
          farm_count: 0,
          status: "active",
        });
      }
      map.get(farm.farmer_id).farm_count += 1;
      return map;
    }, new Map()).values()
  );

  return { farmers };
}

export async function searchSupervisorFarmers(actor, query) {
  const supervisorId = actor.role === "Supervisor" ? actor.id : actor.supervisorId || actor.id;
  const farms = await getFarmRows(`WHERE f.supervisor_id = $1`, [supervisorId]);
  const normalizedQuery = String(query || "").trim().toLowerCase();

  if (!normalizedQuery) {
    return { farmers: [] };
  }

  const matches = farms.filter((farm) => {
    return [
      farm.farmer_name,
      farm.farmer_village,
      farm.name,
      farm.location,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
  });

  const farmers = Array.from(
    matches.reduce((map, farm) => {
      if (!map.has(farm.farmer_id)) {
        map.set(farm.farmer_id, {
          id: farm.farmer_id,
          name: farm.farmer_name,
          village: farm.farmer_village,
          farm_count: 0,
          status: "active",
        });
      }
      map.get(farm.farmer_id).farm_count += 1;
      return map;
    }, new Map()).values()
  );

  return { farmers };
}

export async function getSupervisorInviteLink(origin, actor) {
  return {
    invite_url: `${origin}/auth?mode=register&source=agrisense&supervisor=${encodeURIComponent(actor.id || "")}`,
  };
}

export async function getSupervisorVisits(actor) {
  const supervisorId = actor.role === "Supervisor" ? actor.id : actor.supervisorId || actor.id;
  const visits = await getVisits({ filterSql: `WHERE v.supervisor_id = $1`, values: [supervisorId] });
  return { visits: visits.slice(0, 5) };
}

export async function getSupervisorFarmerProfile(actor, farmerId) {
  const roleLower = String(actor.role || "").toLowerCase();
  const isManager = roleLower === "manager" || roleLower === "admin";
  let farms;

  if (isManager) {
    farms = await getFarmRows(`WHERE f.farmer_id = $1`, [farmerId]);
  } else {
    const supervisorId = actor.role === "Supervisor" ? actor.id : actor.supervisorId || actor.id;
    farms = await getFarmRows(`WHERE f.supervisor_id = $1 AND f.farmer_id = $2`, [supervisorId, farmerId]);
  }

  if (!farms.length) return null;

  const visits = await getVisits({ filterSql: `WHERE v.farmer_id = $1`, values: [farmerId] });
  return {
    farmer: {
      id: farmerId,
      name: farms[0].farmer_name,
      village: farms[0].farmer_village,
      farm_count: farms.length,
      status: "active",
    },
    farms,
    visits,
  };
}

export async function getManagerPortfolio() {
  const farms = await getFarmRows();
  return {
    summary: {
      total: farms.length,
      red: farms.filter((farm) => farm.health_tier === "red").length,
      green: farms.filter((farm) => farm.health_tier === "green").length,
    },
    farms,
  };
}

export async function getManagerBriefing() {
  const farms = await getFarmRows();
  const audits = farms
    .filter((farm) => farm.health_tier !== "green")
    .map((farm) => ({
      farm_name: farm.name,
      farmer_name: farm.farmer_name,
      supervisor_name: farm.supervisor_name || "Unassigned",
      status: farm.health_tier === "red" ? "Red" : "Yellow",
      days_since_visit: farm.days_since_visit,
      situation:
        farm.health_tier === "red"
          ? farm.master_report.summary
          : "This farm needs an updated visit to move out of the grey state.",
      action:
        farm.health_tier === "red"
          ? "Schedule a revisit and close the active field risks."
          : "Record a supervisor visit and publish the first field report.",
    }));

  return {
    briefing: {
      audits,
      regional_outlook:
        audits.length > 0
          ? "Priority attention is needed on farms with low progress or unresolved field risks."
          : "The current AgriSense farm portfolio looks stable across active farms.",
    },
  };
}

export async function getFarmerFarmView(actor, farmId) {
  const farmerId = actor.workerId || actor.id;
  const farms = await getFarmRows(`WHERE f.farmer_id = $1`, [farmerId]);
  if (!farms.length) return null;

  const activeFarm = farms.find((farm) => farm.id === farmId) || farms[0];
  const visits = await getVisits({ filterSql: `WHERE v.farm_id = $1`, values: [activeFarm.id] });

  return {
    farm: {
      id: activeFarm.id,
      name: activeFarm.name,
      location: activeFarm.location,
    },
    farms: farms.map((farm) => ({
      id: farm.id,
      name: farm.name,
      location: farm.location,
    })),
    visits,
    master_report: activeFarm.master_report,
  };
}

export async function updateFarmerTasks(actor, farmId, taskText, isCompleted) {
  const farmerId = actor.workerId || actor.id;
  const farmRows = await getFarmRows(`WHERE f.id = $1 AND f.farmer_id = $2`, [farmId, farmerId]);
  const farm = farmRows[0];
  if (!farm) return null;

  const completedTasks = new Set(farm.master_report.completed_tasks);
  if (isCompleted) {
    completedTasks.add(taskText);
  } else {
    completedTasks.delete(taskText);
  }

  await getPool().query(
    `
      UPDATE agrisense_reports
      SET
        completed_tasks = $2::jsonb,
        completed_count = $3,
        updated_at = NOW()
      WHERE farm_id = $1
    `,
    [farmId, JSON.stringify(Array.from(completedTasks)), completedTasks.size]
  );

  return { completed_tasks: Array.from(completedTasks) };
}

export async function createFarmerIssue(actor, farmId, message) {
  const farmerId = actor.workerId || actor.id;
  const farmRows = await getFarmRows(`WHERE f.id = $1 AND f.farmer_id = $2`, [farmId, farmerId]);
  const farm = farmRows[0];
  if (!farm) return null;

  const visit = {
    id: crypto.randomUUID(),
    farmId,
    farmerId,
    supervisorId: farm.supervisor_id,
    category: "Farmer Note",
    notes: message,
  };

  await getPool().query(
    `
      INSERT INTO agrisense_visits (
        id, farm_id, farmer_id, supervisor_id, category, notes, transcript, visit_date, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW(), NOW())
    `,
    [visit.id, visit.farmId, visit.farmerId, visit.supervisorId, visit.category, visit.notes]
  );

  await getPool().query(
    `
      UPDATE agrisense_reports
      SET
        health_tier = 'red',
        risk_count = risk_count + 1,
        summary = $2,
        updated_at = NOW()
      WHERE farm_id = $1
    `,
    [farmId, message]
  );

  if (farm.supervisor_id) {
    await createAlert({
      createdBy: farmerId,
      zone: farm.location,
      severity: "medium",
      title: "AgriSense issue reported",
      detail: `${farm.farmer_name} reported: ${message}`,
    });
  }

  const visits = await getVisits({ filterSql: `WHERE v.id = $1`, values: [visit.id] });
  return visits[0] || null;
}

export async function getFarmDetail(farmId) {
  const farms = await getFarmRows(`WHERE f.id = $1`, [farmId]);
  return farms[0] || null;
}

export async function getFarmVisits(farmId) {
  return {
    visits: await getVisits({ filterSql: `WHERE v.farm_id = $1`, values: [farmId] }),
  };
}

export async function createFarmVisit(actor, farmId, payload = {}) {
  console.log("[agrisense-db] createFarmVisit: actor:", actor, "farmId:", farmId, "payload:", payload);
  const farm = await getFarmDetail(farmId);
  console.log("[agrisense-db] createFarmVisit: farm detail retrieved:", farm);
  if (!farm) {
    console.log("[agrisense-db] createFarmVisit: farm not found!");
    return null;
  }

  const visitId = crypto.randomUUID();
  const notes = String(payload.notes || payload.summary || "Supervisor visit recorded.").trim();
  const category = String(payload.category || "General").trim();
  const supervisorId = actor.role === "Supervisor" ? actor.id : farm.supervisor_id;

  await getPool().query(
    `
      INSERT INTO agrisense_visits (
        id, farm_id, farmer_id, supervisor_id, category, notes, transcript, visit_date, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), NOW(), NOW())
    `,
    [visitId, farmId, farm.farmer_id, supervisorId, category, notes]
  );

  const nextHealth = String(category).toLowerCase().includes("disease") || String(category).toLowerCase().includes("urgent")
    ? "red"
    : "green";

  await getPool().query(
    `
      UPDATE agrisense_reports
      SET
        summary = $2,
        health_tier = $3,
        risk_count = CASE WHEN $3 = 'red' THEN GREATEST(risk_count, 1) ELSE 0 END,
        updated_at = NOW()
      WHERE farm_id = $1
    `,
    [farmId, notes, nextHealth]
  );

  const visits = await getVisits({ filterSql: `WHERE v.id = $1`, values: [visitId] });
  return visits[0] || null;
}

export async function updateVisitReport(visitId, payload = {}) {
  const notes = String(payload.notes || payload.summary || "").trim();
  const category = String(payload.category || "").trim() || null;

  const result = await getPool().query(
    `
      UPDATE agrisense_visits
      SET
        notes = COALESCE($2, notes),
        transcript = COALESCE($3, transcript),
        category = COALESCE($4, category),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [visitId, notes || null, notes || null, category]
  );

  if (!result.rows[0]) return null;
  const visits = await getVisits({ filterSql: `WHERE v.id = $1`, values: [visitId] });
  return visits[0] || null;
}
