import crypto from "crypto";
import pg from "pg";
import seedData from "../data/florisight.seed.json";
import { hashPassword, verifyPassword } from "./passwords";
import {
  buildChatMessageDocument,
  buildCopilotAnswer,
  buildWorkforcePaymentDocument,
  buildWorkforceTaskDocument,
  buildCropDocument,
  buildSaleDocument,
  buildOrderDocument,
  buildExpenseDocument,
  buildEquipmentDocument,
  buildAlertDocument,
  cosineSimilarity,
  vectorizeText,
} from "./rag";
import { getLocalLlmStatus } from "./local-llm";

const { Pool } = pg;

// Use global scope so the pool and schema-init promise survive Next.js hot
// reloads and are shared across all API route module instances in the same
// Node.js process. Without this, each route module gets its own copy and
// syncSeedData runs on every request, resetting saved data to seed values.
if (!global._florisightDb) {
  global._florisightDb = {
    pool: null,
    schemaReady: null,
    pgvectorEnabled: null,
    seedSignature: null,
    seedSyncPromise: null,
    lastDailyResetDate: null,
    lastAutoAbsentRunDate: null,
  };
}

export function getPool() {
  if (!global._florisightDb.pool) {
    global._florisightDb.pool = new Pool(getDatabaseConfig());
  }

  return global._florisightDb.pool;
}

function serializeVectorForPg(vector = []) {
  return `[${vector.map((value) => Number(value || 0)).join(",")}]`;
}

function getDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const parsedUrl = new URL(connectionString);

  if (!parsedUrl.password && parsedUrl.hostname) {
    throw new Error(
      "DATABASE_URL must include a PostgreSQL password, for example postgres://postgres:your-password@localhost:5432/florisight"
    );
  }

  return { connectionString };
}



function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function normalizePhoneNumber(phoneNumber) {
  const raw = String(phoneNumber || "").trim();

  if (!raw) {
    return "";
  }

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D+/g, "");
  return digits ? `${hasPlus ? "+" : ""}${digits}` : "";
}

function maskPhoneNumber(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!normalized) {
    return "";
  }

  const visibleSuffix = normalized.slice(-4);
  const prefix = normalized.startsWith("+") ? "+" : "";
  return `${prefix}${"*".repeat(Math.max(0, normalized.length - visibleSuffix.length - prefix.length))}${visibleSuffix}`;
}

function hashOtpCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function formatTimeLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(date));
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function getSeedSignature() {
  return "force-sync-v3-" + JSON.stringify({
    users: seedData.users.map((user) => ({
      id: user.id,
      role: user.role,
      supervisorId: user.supervisorId || null,
      email: normalizeEmail(user.email),
    })),
    supervisors: seedData.supervisors.map((supervisor) => ({
      id: supervisor.id,
      zone: supervisor.zone,
    })),
    workers: seedData.workers.map((worker) => ({
      id: worker.id,
      supervisorId: worker.supervisorId,
      zone: worker.zone,
      task: worker.task,
      status: worker.status,
      progress: worker.progress,
      attendance: worker.attendance,
      logsToday: worker.logsToday,
      salaryStatus: worker.salaryStatus,
      dailyWage: worker.dailyWage,
      paymentMode: worker.paymentMode,
    })),
  });
}

function getAttendanceMultiplier(attendance) {
  if (attendance === "Present") {
    return 1;
  }

  if (attendance === "Late") {
    return 0.75;
  }

  return 0;
}

const KNOWN_ZONES = [
  "Greenhouse A",
  "Packing Unit",
  "Visitor Gate",
  "Nursery Bay",
];

function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectZoneFromText(text, fallbackZone = "") {
  const normalized = normalizeLooseText(text);
  const entries = [
    ["greenhouse a", "Greenhouse A"],
    ["packing unit", "Packing Unit"],
    ["visitor gate", "Visitor Gate"],
    ["gate", "Visitor Gate"],
    ["nursery bay", "Nursery Bay"],
    ["nursery", "Nursery Bay"],
  ];

  for (const [needle, zone] of entries) {
    if (normalized.includes(needle)) {
      return zone;
    }
  }

  return fallbackZone || "Visitor Gate";
}

function parseVisitorCountFromText(text) {
  const normalized = normalizeLooseText(text);

  if (!/\b(visitors?|people|persons?|guests?|tourists?)\b/.test(normalized)) {
    return null;
  }

  const match = normalized.match(/(\d+)\s+(visitors?|people|persons?|guests?|tourists?)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseAttendanceFromText(text) {
  const normalized = normalizeLooseText(text);

  if (/\babsent|leave|off duty|not coming\b/.test(normalized)) {
    return "Absent";
  }

  if (/\blate|delayed|running late\b/.test(normalized)) {
    return "Late";
  }

  if (/\bpresent|checked in|on site|arrived\b/.test(normalized)) {
    return "Present";
  }

  return null;
}

function inferTaskStatusFromText(text) {
  const normalized = normalizeLooseText(text);

  if (/\bdone|completed|finished|closed\b/.test(normalized)) {
    return "Done";
  }

  if (/\breview|checking|checked\b/.test(normalized)) {
    return "Review";
  }

  if (/\bin progress|working|ongoing\b/.test(normalized)) {
    return "In progress";
  }

  if (/\bpending|blocked|waiting\b/.test(normalized)) {
    return "Pending";
  }

  if (/\bready|start\b/.test(normalized)) {
    return "Ready";
  }

  return null;
}

function parseProgressFromText(text) {
  const match = String(text || "").match(/(\d{1,3})\s*%/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(parsed, 100));
}

function shouldCreateAlertFromText(text) {
  return /\b(alert|issue|warning|urgent|overcrowd|overcrowding|idle|emergency|risk)\b/i.test(
    String(text || "")
  );
}

function inferAlertSeverity(text) {
  const normalized = normalizeLooseText(text);

  if (/\b(emergency|urgent|critical|overcrowd|overcrowding)\b/.test(normalized)) {
    return "high";
  }

  if (/\b(issue|warning|idle|delay|blocked|risk)\b/.test(normalized)) {
    return "medium";
  }

  return "low";
}

function buildAlertTitle(text) {
  const normalized = String(text || "").trim();

  if (!normalized) {
    return "Chat-detected alert";
  }

  const trimmed = normalized.length > 54 ? `${normalized.slice(0, 51).trim()}...` : normalized;
  return trimmed;
}

function parseDailyWageFromText(text) {
  const normalized = String(text || "");
  const match =
    normalized.match(/(?:daily wage|wage|salary)\s*(?:is|=|rs\.?|inr)?\s*(\d{2,6})/i) ||
    normalized.match(/(?:rs\.?|inr)\s*(\d{2,6})/i);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSalaryStatusFromText(text) {
  const normalized = normalizeLooseText(text);

  if (/\bsalary recorded|wage recorded|payroll recorded|payment recorded\b/.test(normalized)) {
    return "Recorded";
  }

  if (/\bpending review|salary pending|wage pending\b/.test(normalized)) {
    return "Pending review";
  }

  if (/\bnot recorded|salary not recorded|wage not recorded\b/.test(normalized)) {
    return "Not recorded";
  }

  return null;
}

function parsePaymentModeFromText(text) {
  const normalized = normalizeLooseText(text);

  if (/\bmonthly payroll|monthly\b/.test(normalized)) {
    return "Monthly payroll";
  }

  if (/\bshift wage|shift\b/.test(normalized)) {
    return "Shift wage";
  }

  if (/\bdaily wage|daily\b/.test(normalized)) {
    return "Daily wage";
  }

  return null;
}

function parseTaskTitleFromText(text) {
  const input = String(text || "").trim();
  const match =
    input.match(/(?:task|assignment)\s*(?:is|:)?\s*([^,.]+)/i) ||
    input.match(/assign(?:ed)?\s+[^,.]*?\s+to\s+([^,.]+)/i) ||
    input.match(/working on\s+([^,.]+)/i);

  if (!match) {
    return null;
  }

  const task = String(match[1] || "").trim();
  return task ? task.slice(0, 120) : null;
}

function toUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    supervisorId: row.supervisor_id,
    phoneNumber: row.phone_number || null,
  };
}

function toChatMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    supervisorId: row.supervisor_id,
    workerId: row.worker_id,
    groupId: row.group_id || null,
    scope: row.scope,
    tag: row.tag,
    text: row.text,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    timeLabel: formatTimeLabel(row.created_at),
  };
}

function toChatEmbeddingRow(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    supervisorId: row.supervisor_id,
    workerId: row.worker_id,
    groupId: row.group_id || null,
    scope: row.scope,
    tag: row.tag,
    text: row.text,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    timeLabel: formatTimeLabel(row.created_at),
    embedding: Array.isArray(row.embedding)
      ? row.embedding.map((value) => Number(value))
      : JSON.parse(row.embedding || "[]"),
  };
}

function toAlert(row) {
  return {
    id: row.id,
    zone: row.zone,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    createdAt: row.created_at,
    timeLabel: formatTimeLabel(row.created_at),
    resolvedAt: row.resolved_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

function toVisitorEvent(row) {
  return {
    id: row.id,
    zone: row.zone,
    count: row.visitor_count,
    note: row.note,
    reporterName: row.reporter_name,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    timeLabel: formatTimeLabel(row.created_at),
  };
}

function toTrackingAnalysis(row) {
  return {
    id: row.id,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    zone: row.zone,
    fileName: row.file_name,
    status: row.status,
    visitorCount: row.visitor_count,
    uniqueTracks: row.unique_tracks,
    summary: row.summary_json || {},
    createdAt: row.created_at,
    timeLabel: formatTimeLabel(row.created_at),
  };
}

function defaultMessageState(row, userId) {
  return {
    userId,
    lastReadAt: row?.last_read_at || null,
    notificationsEnabled: Boolean(row?.notifications_enabled),
  };
}

async function syncSeedData(client) {
  // Clear AgriSense tables so they can be re-bootstrapped fresh on next request
  await client.query(`DROP TABLE IF EXISTS agrisense_visits CASCADE;`);
  await client.query(`DROP TABLE IF EXISTS agrisense_reports CASCADE;`);
  await client.query(`DROP TABLE IF EXISTS agrisense_farms CASCADE;`);

  const seedUserIds = seedData.users.map((user) => user.id);

  await client.query(
    `
      DELETE FROM users
      WHERE email LIKE '%@florisight.local'
        AND NOT (id = ANY($1::text[]))
    `,
    [seedUserIds]
  );

  for (const user of seedData.users) {
    await client.query(
      `
        INSERT INTO users (id, name, email, password_hash, role, supervisor_id, phone_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          supervisor_id = EXCLUDED.supervisor_id,
          phone_number = EXCLUDED.phone_number
      `,
      [
        user.id,
        user.name,
        normalizeEmail(user.email),
        hashPassword(user.password),
        user.role,
        user.supervisorId || null,
        normalizePhoneNumber(user.phoneNumber),
      ]
    );
  }

  for (const supervisor of seedData.supervisors) {
    await client.query(
      `
        INSERT INTO supervisors
          (user_id, zone, active_tasks, completed_today, visitor_logs, alerts, performance)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE
        SET
          zone = EXCLUDED.zone,
          active_tasks = EXCLUDED.active_tasks,
          completed_today = EXCLUDED.completed_today,
          visitor_logs = EXCLUDED.visitor_logs,
          alerts = EXCLUDED.alerts,
          performance = EXCLUDED.performance
      `,
      [
        supervisor.id,
        supervisor.zone,
        supervisor.activeTasks,
        supervisor.completedToday,
        supervisor.visitorLogs,
        supervisor.alerts,
        supervisor.performance,
      ]
    );
  }

  for (const worker of seedData.workers) {
    await client.query(
      `
        INSERT INTO workers (
          user_id, supervisor_id, zone, task, status, progress, attendance,
          logs_today, salary_status, daily_wage, payment_mode
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (user_id) DO UPDATE
        SET
          supervisor_id = EXCLUDED.supervisor_id,
          zone = EXCLUDED.zone,
          task = EXCLUDED.task,
          status = EXCLUDED.status,
          progress = EXCLUDED.progress,
          attendance = EXCLUDED.attendance,
          logs_today = EXCLUDED.logs_today,
          salary_status = EXCLUDED.salary_status,
          daily_wage = EXCLUDED.daily_wage,
          payment_mode = EXCLUDED.payment_mode
      `,
      [
        worker.id,
        worker.supervisorId || null,
        worker.zone || "Not assigned",
        worker.task || "No active assignment",
        worker.status || "Ready",
        Number(worker.progress || 0),
        worker.attendance || "Not marked",
        Number(worker.logsToday || 0),
        worker.salaryStatus || "Not recorded",
        Number(worker.dailyWage || 0),
        worker.paymentMode || "Daily wage"
      ]
    );
  }

  for (const log of seedData.activityLogs) {
    await client.query(
      `
        INSERT INTO activity_logs (time_label, person, tag, text)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [log.time, log.person, log.tag, log.text]
    );
  }

  await client.query(
    `
      INSERT INTO visitor_events (id, reporter_id, reporter_name, zone, visitor_count, note)
      VALUES
        ('visitor-seed-1', 'sup-1', 'Asha Menon', 'Visitor Gate', 5, 'Morning greenhouse tour check-in'),
        ('visitor-seed-2', 'wrk-6', 'Neha Rao', 'Nursery Bay', 12, 'School group reached Nursery Bay')
      ON CONFLICT (id) DO UPDATE
      SET
        reporter_id = EXCLUDED.reporter_id,
        reporter_name = EXCLUDED.reporter_name,
        zone = EXCLUDED.zone,
        visitor_count = EXCLUDED.visitor_count,
        note = EXCLUDED.note
    `
  );

  await client.query(
    `
      INSERT INTO alerts (id, created_by, zone, severity, title, detail)
      VALUES
        ('alert-seed-1', 'sup-2', 'Visitor Gate', 'high', 'Overcrowding detected', 'Visitor Gate density is above normal.'),
        ('alert-seed-2', 'sup-1', 'Packing Unit', 'medium', 'Review pending cartons', 'Packing batch B-18 requires supervisor review.')
      ON CONFLICT (id) DO UPDATE
      SET
        created_by = EXCLUDED.created_by,
        zone = EXCLUDED.zone,
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        detail = EXCLUDED.detail
    `
  );

  const seedCrops = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Red Rose',
      variety: 'Red',
      zone: 'Greenhouse A',
      quantity: 500,
      growth_stage: 'Blooming',
      health_status: 'Healthy',
      planted_date: '2024-01-15',
      expected_harvest: '2024-05-15',
      notes: 'Planted on schedule in bed B-01.',
      bed: 'B-01',
      cost: 2.50,
      price: 8.00,
      batch_code: 'ROSE-RED-2024-001'
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Red Rose',
      variety: 'Red',
      zone: 'Nursery Bay',
      quantity: 300,
      growth_stage: 'Growth',
      health_status: 'Healthy',
      planted_date: '2024-02-01',
      expected_harvest: '2024-06-01',
      notes: 'Bed B-02. Strong stems.',
      bed: 'B-02',
      cost: 2.50,
      price: 8.00,
      batch_code: 'ROSE-RED-2024-002'
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'White Carnation',
      variety: 'White',
      zone: 'Greenhouse A',
      quantity: 400,
      growth_stage: 'Harvest',
      health_status: 'Healthy',
      planted_date: '2024-01-20',
      expected_harvest: '2024-04-20',
      notes: 'Ready for picking in B-03.',
      bed: 'B-03',
      cost: 1.50,
      price: 5.00,
      batch_code: 'CARN-WHT-2024-001'
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Yellow Chrysanthemum',
      variety: 'Yellow',
      zone: 'Nursery Bay',
      quantity: 200,
      growth_stage: 'Germination',
      health_status: 'Healthy',
      planted_date: '2024-03-01',
      expected_harvest: '2024-06-01',
      notes: 'Bed B-04.',
      bed: 'B-04',
      cost: 1.80,
      price: 6.00,
      batch_code: 'CHRY-YEL-2024-001'
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Pink Rose',
      variety: 'Pink',
      zone: 'Greenhouse A',
      quantity: 150,
      growth_stage: 'Seed',
      health_status: 'Healthy',
      planted_date: '2024-03-10',
      expected_harvest: '2024-07-08',
      notes: 'Bed B-05.',
      bed: 'B-05',
      cost: 2.50,
      price: 8.50,
      batch_code: 'ROSE-PNK-2024-001'
    },
    {
      id: '66666666-6666-6666-6666-666666666666',
      name: 'Lavender',
      variety: 'French',
      zone: 'Nursery Bay',
      quantity: 100,
      growth_stage: 'Growth',
      health_status: 'Healthy',
      planted_date: '2024-02-15',
      expected_harvest: '2024-07-15',
      notes: 'Bed B-06.',
      bed: 'B-06',
      cost: 3.00,
      price: 10.00,
      batch_code: 'LAV-2024-001'
    },
    {
      id: '77777777-7777-7777-7777-777777777777',
      name: 'Tulip Bulb Mix',
      variety: 'Mixed',
      zone: 'Visitor Gate',
      quantity: 1000,
      growth_stage: 'Seed',
      health_status: 'Healthy',
      planted_date: '2024-03-01',
      expected_harvest: '2024-05-15',
      notes: 'Bulbs sown directly.',
      bed: null,
      cost: 0.80,
      price: 3.50,
      batch_code: 'TULIP-MIX-2024-001'
    },
    {
      id: '88888888-8888-8888-8888-888888888888',
      name: 'Peace Lily',
      variety: 'Sensation',
      zone: 'Visitor Gate',
      quantity: 75,
      growth_stage: 'Blooming',
      health_status: 'Healthy',
      planted_date: '2024-01-01',
      expected_harvest: '2024-06-30',
      notes: 'Sleek white flowers.',
      bed: null,
      cost: 5.00,
      price: 18.00,
      batch_code: 'PLILY-2024-001'
    }
  ];

  for (const crop of seedCrops) {
    await client.query(
      `
        INSERT INTO crops (id, name, variety, zone, quantity, growth_stage, health_status, planted_date, expected_harvest, notes, bed, cost, price, batch_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE
        SET
          name = EXCLUDED.name,
          variety = EXCLUDED.variety,
          zone = EXCLUDED.zone,
          quantity = EXCLUDED.quantity,
          growth_stage = EXCLUDED.growth_stage,
          health_status = EXCLUDED.health_status,
          planted_date = EXCLUDED.planted_date,
          expected_harvest = EXCLUDED.expected_harvest,
          notes = EXCLUDED.notes,
          bed = EXCLUDED.bed,
          cost = EXCLUDED.cost,
          price = EXCLUDED.price,
          batch_code = EXCLUDED.batch_code
      `,
      [
        crop.id,
        crop.name,
        crop.variety,
        crop.zone,
        crop.quantity,
        crop.growth_stage,
        crop.health_status,
        crop.planted_date,
        crop.expected_harvest,
        crop.notes,
        crop.bed,
        crop.cost,
        crop.price,
        crop.batch_code
      ]
    );
  }
  const seedSales = [
    { name: 'Yellow Chrysanthemum', customer: 'Sofia Rodriguez', qty: 60, price: 6.00, total: 360.00, status: 'paid', date: '2026-04-15' },
    { name: 'Red Rose', customer: 'Anna Thompson', qty: 90, price: 8.00, total: 720.00, status: 'paid', date: '2026-04-10' },
    { name: 'White Carnation', customer: 'Michael Chen', qty: 120, price: 5.00, total: 600.00, status: 'paid', date: '2026-04-01' },
    { name: 'Lavender', customer: 'David Park', qty: 30, price: 10.00, total: 300.00, status: 'paid', date: '2026-03-20' },
    { name: 'Red Rose', customer: 'Emily Watson', qty: 75, price: 8.00, total: 600.00, status: 'paid', date: '2026-03-15' },
    { name: 'Red Rose', customer: 'Garden Center Ltd', qty: 1500, price: 8.00, total: 12000.00, status: 'paid', date: '2026-06-18' },
    { name: 'White Carnation', customer: 'City Landscaping', qty: 2500, price: 5.00, total: 12500.00, status: 'paid', date: '2026-06-20' },
    { name: 'Lavender', customer: 'Floral Boutique', qty: 800, price: 10.00, total: 8000.00, status: 'paid', date: '2026-06-21' },
    { name: 'Yellow Chrysanthemum', customer: 'Garden Center Ltd', qty: 2000, price: 6.00, total: 12000.00, status: 'paid', date: '2026-06-21' }
  ];

  const salesCountRes = await client.query("SELECT count(*)::int FROM sales");
  if (salesCountRes.rows[0].count < 9) {
    await client.query("TRUNCATE TABLE sales CASCADE");
    for (const s of seedSales) {
      await client.query(
        `INSERT INTO sales (plant_name, customer_name, quantity, unit_price, total_amount, status, sale_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [s.name, s.customer, s.qty, s.price, s.total, s.status, s.date]
      );
    }
  }

  const seedInvoices = [
    { id: 'INV-00102', customer: 'Garden Center Ltd', amount: 1250.00, status: 'paid', due: '2026-04-15' },
    { id: 'INV-00103', customer: 'City Landscaping', amount: 3400.00, status: 'overdue', due: '2026-04-10' },
    { id: 'INV-00104', customer: 'Sofia Rodriguez', amount: 360.00, status: 'paid', due: '2026-04-20' },
    { id: 'INV-00105', customer: 'Floral Boutique', amount: 890.00, status: 'unpaid', due: '2026-05-15' }
  ];

  for (const inv of seedInvoices) {
    await client.query(
      `INSERT INTO invoices (id, customer_name, amount, status, due_date) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET customer_name = EXCLUDED.customer_name, amount = EXCLUDED.amount, status = EXCLUDED.status, due_date = EXCLUDED.due_date`,
      [inv.id, inv.customer, inv.amount, inv.status, inv.due]
    );
  }

  const seedExpenses = [
    { desc: 'Monthly labor costs - June', cat: 'Labor Costs', pay: 'Bank Transfer', amount: 12000.00, date: '2026-06-20' },
    { desc: 'Delivery truck fuel - June', cat: 'Transportation', pay: 'Cash', amount: 900.00, date: '2026-06-18' },
    { desc: 'Foliar spray fertilizer + micronutrients - June', cat: 'Fertilizers', pay: 'Bank Transfer', amount: 1100.00, date: '2026-06-15' },
    { desc: 'Monthly irrigation water bill - June', cat: 'Water', pay: 'Bank Transfer', amount: 850.00, date: '2026-06-12' },
    { desc: 'Monthly labor costs - April', cat: 'Labor Costs', pay: 'Bank Transfer', amount: 12000.00, date: '2026-04-30' },
    { desc: 'Monthly labor costs - March', cat: 'Labor Costs', pay: 'Bank Transfer', amount: 12000.00, date: '2026-03-31' },
    { desc: 'Monthly irrigation water bill - March', cat: 'Water', pay: 'Bank Transfer', amount: 780.00, date: '2026-03-25' },
    { desc: 'Delivery truck fuel - March', cat: 'Transportation', pay: 'Cash', amount: 800.00, date: '2026-03-15' },
    { desc: 'Foliar spray fertilizer + micronutrients', cat: 'Fertilizers', pay: 'Bank Transfer', amount: 950.00, date: '2026-03-08' }
  ];

  const expensesCountRes = await client.query("SELECT count(*)::int FROM expenses");
  if (expensesCountRes.rows[0].count < 9) {
    await client.query("TRUNCATE TABLE expenses CASCADE");
    for (const exp of seedExpenses) {
      await client.query(
        `INSERT INTO expenses (description, category, payment_method, amount, expense_date) VALUES ($1, $2, $3, $4, $5)`,
        [exp.desc, exp.cat, exp.pay, exp.amount, exp.date]
      );
    }
  }

  const seedOrders = [
    { id: 'ORD-00001', customer: 'Emily Watson', company: 'WATSON FLORALS', odate: '2026-06-10', ddate: '2026-06-15', status: 'Delivered', pay: 'paid', amount: 1600.00 },
    { id: 'ORD-00002', customer: 'Anna Thompson', company: 'WEDDING BLISS', odate: '2026-06-12', ddate: '2026-06-18', status: 'Shipped', pay: 'paid', amount: 2550.00 },
    { id: 'ORD-00003', customer: 'David Park', company: 'PARK EVENTS CO', odate: '2026-06-14', ddate: '2026-06-20', status: 'Processing', pay: 'unpaid', amount: 900.00 },
    { id: 'ORD-00004', customer: 'Sofia Rodriguez', company: 'GREEN GARDEN CENTER', odate: '2026-06-16', ddate: '2026-06-22', status: 'Confirmed', pay: 'unpaid', amount: 1350.00 },
    { id: 'ORD-00005', customer: 'Michael Chen', company: 'CITY SUPERMARKET', odate: '2026-06-18', ddate: '2026-06-25', status: 'Pending', pay: 'unpaid', amount: 750.00 },
    { id: 'ORD-00006', customer: 'Garden Center Ltd', company: 'GARDEN DECOR', odate: '2026-06-15', ddate: '2026-06-20', status: 'Processing', pay: 'paid', amount: 12000.00 },
    { id: 'ORD-00007', customer: 'City Landscaping', company: 'CITY DESIGN', odate: '2026-06-18', ddate: '2026-06-22', status: 'Confirmed', pay: 'paid', amount: 12500.00 }
  ];

  for (const ord of seedOrders) {
    await client.query(
      `INSERT INTO orders (id, customer_name, company_name, order_date, delivery_date, status, payment_status, total_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET customer_name = EXCLUDED.customer_name, company_name = EXCLUDED.company_name, order_date = EXCLUDED.order_date, delivery_date = EXCLUDED.delivery_date, status = EXCLUDED.status, payment_status = EXCLUDED.payment_status, total_amount = EXCLUDED.total_amount`,
      [ord.id, ord.customer, ord.company, ord.odate, ord.ddate, ord.status, ord.pay, ord.amount]
    );
  }

  // Update existing legacy 2024 sales and expenses to 2026
  await client.query("UPDATE sales SET sale_date = (sale_date + INTERVAL '2 years') WHERE sale_date < '2025-01-01'");
  await client.query("UPDATE expenses SET expense_date = (expense_date + INTERVAL '2 years') WHERE expense_date < '2025-01-01'");

  const seedForecasts = [
    { month: 'July', plant: 'White Carnation', event: 'Monsoon season', demand: 320, confidence: 88, action: 'MONITOR SOIL' },
    { month: 'August', plant: 'Red Rose', event: 'Festival Season', demand: 450, confidence: 91, action: 'PLAN PROPAGATION' },
    { month: 'September', plant: 'Yellow Chrysanthemum', event: 'Autumn Harvest', demand: 380, confidence: 87, action: 'ADJUST IRRIGATION' }
  ];

  const forecastsCountRes = await client.query("SELECT count(*)::int FROM seasonal_forecasts");
  if (forecastsCountRes.rows[0].count < 3) {
    await client.query("TRUNCATE TABLE seasonal_forecasts CASCADE");
    for (const f of seedForecasts) {
      await client.query(
        `INSERT INTO seasonal_forecasts (month, plant_name, event, predicted_demand, confidence, action) VALUES ($1, $2, $3, $4, $5, $6)`,
        [f.month, f.plant, f.event, f.demand, f.confidence, f.action]
      );
    }
  }

  const seedSupplies = [
    { name: 'Fungicide Spray', cat: 'Pesticides', qty: 45, unit: 'Liters', reorder: 75, cost: 15.00 },
    { name: 'Neem Oil Pesticide', cat: 'Pesticides', qty: 80, unit: 'Liters', reorder: 50, cost: 22.00 },
    { name: 'Peat Moss', cat: 'Soil', qty: 15, unit: 'Bags', reorder: 10, cost: 8.50 },
    { name: 'Plastic Pots 6"', cat: 'Pots', qty: 500, unit: 'Pieces', reorder: 200, cost: 0.45 },
    { name: 'NPK Fertilizer', cat: 'Fertilizers', qty: 120, unit: 'Kg', reorder: 100, cost: 4.80 }
  ];

  const suppliesCountRes = await client.query("SELECT count(*)::int FROM supplies");
  if (suppliesCountRes.rows[0].count === 0) {
    for (const sup of seedSupplies) {
      await client.query(
        `INSERT INTO supplies (name, category, quantity, unit, reorder_level, cost) VALUES ($1, $2, $3, $4, $5, $6)`,
        [sup.name, sup.cat, sup.qty, sup.unit, sup.reorder, sup.cost]
      );
    }
  }

  const seedAlerts = [
    { id: 'alert-custom-1', created_by: 'sup-1', zone: 'Greenhouse A', severity: 'medium', title: 'Low Stock: Fungicide Spray', detail: 'Fungicide Spray (FS-FS-001) is below reorder level. Current: 45, Reorder Level: 75.' },
    { id: 'alert-custom-2', created_by: 'sup-2', zone: 'Nursery Bay', severity: 'medium', title: 'FIFO Alert: Neem Oil Pesticide', detail: 'Batch from Feb 2024 should be used before newer stock. Expiry approaching.' },
    { id: 'alert-custom-3', created_by: 'sup-2', zone: 'Visitor Gate', severity: 'low', title: 'Scheduled Maintenance: Rotary Tiller', detail: 'Honda F720 Rotary Tiller is due for scheduled maintenance this week.' }
  ];

  for (const a of seedAlerts) {
    await client.query(
      `INSERT INTO alerts (id, created_by, zone, severity, title, detail) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET created_by = EXCLUDED.created_by, zone = EXCLUDED.zone, severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail`,
      [a.id, a.created_by, a.zone, a.severity, a.title, a.detail]
    );
  }

  // Bulk index all seeded records into the generic RAG embeddings table
  await reindexAllRagEmbeddings(client);

  // Prevent daily reset and auto-absent from instantly wiping seeded worker data
  const todayKey = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().slice(0, 10);
  global._florisightDb.lastDailyResetDate = todayKey;
  global._florisightDb.lastAutoAbsentRunDate = todayKey;
}

async function detectPgvector(client = null) {
  if (typeof global._florisightDb.pgvectorEnabled === "boolean") {
    return global._florisightDb.pgvectorEnabled;
  }

  const runner = client || getPool();

  try {
    const result = await runner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'chat_message_embeddings'
          AND column_name = 'embedding_vector'
        LIMIT 1
      `
    );

    global._florisightDb.pgvectorEnabled = Boolean(result.rows.length);
  } catch (_error) {
    global._florisightDb.pgvectorEnabled = false;
  }

  return global._florisightDb.pgvectorEnabled;
}

async function enablePgvectorIfPossible(client) {
  try {
    await client.query("SAVEPOINT florisight_pgvector_setup");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(
      `
        ALTER TABLE chat_message_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vector vector(768)
      `
    );
    await client.query(
      `
        CREATE INDEX IF NOT EXISTS chat_message_embeddings_vector_idx
        ON chat_message_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
      `
    );
    await client.query(
      `
        ALTER TABLE workforce_payment_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vector vector(768)
      `
    );
    await client.query(
      `
        CREATE INDEX IF NOT EXISTS workforce_payment_embeddings_vector_idx
        ON workforce_payment_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
      `
    );
    await client.query(
      `
        ALTER TABLE workforce_task_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vector vector(768)
      `
    );
    await client.query(
      `
        CREATE INDEX IF NOT EXISTS workforce_task_embeddings_vector_idx
        ON workforce_task_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
      `
    );
    await client.query(
      `
        ALTER TABLE florisight_rag_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vector vector(768)
      `
    );
    await client.query(
      `
        CREATE INDEX IF NOT EXISTS florisight_rag_embeddings_vector_idx
        ON florisight_rag_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
      `
    );
    global._florisightDb.pgvectorEnabled = true;
  } catch (_error) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT florisight_pgvector_setup");
    } catch (_rollbackError) {
      // If savepoint rollback fails, the outer transaction handler will reset the connection.
    }
    global._florisightDb.pgvectorEnabled = false;
  } finally {
    try {
      await client.query("RELEASE SAVEPOINT florisight_pgvector_setup");
    } catch (_releaseError) {
      // Ignore when the savepoint was already rolled back or never created.
    }
  }
}

async function syncSeedDataIfNeeded() {
  const nextSignature = getSeedSignature();

  if (global._florisightDb.seedSignature === nextSignature) {
    return;
  }

  if (!global._florisightDb.seedSyncPromise) {
    global._florisightDb.seedSyncPromise = (async () => {
      const client = await getPool().connect();

      try {
        await client.query("BEGIN");
        await syncSeedData(client);
        await client.query("COMMIT");
        global._florisightDb.seedSignature = nextSignature;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
        global._florisightDb.seedSyncPromise = null;
      }
    })();
  }

  await global._florisightDb.seedSyncPromise;
}

export async function ensureSchema() {
  if (!global._florisightDb.schemaReady) {
    global._florisightDb.schemaReady = (async () => {
      const client = await getPool().connect();

      try {
        await client.query("BEGIN");
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('Admin', 'Supervisor', 'Worker')),
            supervisor_id TEXT,
            phone_number TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS supervisors (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            zone TEXT NOT NULL DEFAULT 'Not assigned',
            active_tasks INTEGER NOT NULL DEFAULT 0,
            completed_today INTEGER NOT NULL DEFAULT 0,
            visitor_logs INTEGER NOT NULL DEFAULT 0,
            alerts INTEGER NOT NULL DEFAULT 0,
            performance TEXT NOT NULL DEFAULT 'New'
          );

          CREATE TABLE IF NOT EXISTS workers (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            zone TEXT NOT NULL DEFAULT 'Not assigned',
            task TEXT NOT NULL DEFAULT 'No active assignment',
            status TEXT NOT NULL DEFAULT 'Ready',
            progress INTEGER NOT NULL DEFAULT 0,
            attendance TEXT NOT NULL DEFAULT 'Not marked',
            logs_today INTEGER NOT NULL DEFAULT 0,
            salary_status TEXT NOT NULL DEFAULT 'Not recorded',
            daily_wage INTEGER NOT NULL DEFAULT 0,
            payment_mode TEXT NOT NULL DEFAULT 'Daily wage',
            payment_amount INTEGER,
            payment_txn_id TEXT,
            payment_date TEXT,
            attendance_marked_at TIMESTAMPTZ
          );

          CREATE TABLE IF NOT EXISTS activity_logs (
            id BIGSERIAL PRIMARY KEY,
            time_label TEXT NOT NULL,
            person TEXT NOT NULL,
            tag TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS visitor_events (
            id TEXT PRIMARY KEY,
            reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reporter_name TEXT NOT NULL,
            zone TEXT NOT NULL,
            visitor_count INTEGER NOT NULL CHECK (visitor_count >= 0),
            note TEXT NOT NULL,
            image_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            zone TEXT NOT NULL,
            severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
            title TEXT NOT NULL,
            detail TEXT NOT NULL,
            resolved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS chat_groups (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS chat_group_members (
            group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (group_id, user_id)
          );

          CREATE TABLE IF NOT EXISTS chat_messages (
            id UUID PRIMARY KEY,
            sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sender_name TEXT NOT NULL,
            sender_role TEXT NOT NULL CHECK (sender_role IN ('Admin', 'Supervisor', 'Worker')),
            supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            worker_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
            scope TEXT NOT NULL CHECK (scope IN ('global', 'team', 'worker', 'group')),
            tag TEXT NOT NULL DEFAULT 'Update',
            text TEXT NOT NULL,
            image_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          
          ALTER TABLE workers ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ;

          ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE;
          
          -- Update check constraint for scope safely
          ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_scope_check;
          ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_scope_check CHECK (scope IN ('global', 'team', 'worker', 'group'));

          ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

          CREATE TABLE IF NOT EXISTS user_message_state (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            last_read_at TIMESTAMPTZ,
            notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS chat_message_embeddings (
            message_id UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
            embedding JSONB NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS chat_message_extractions (
            message_id UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
            extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS workforce_payment_embeddings (
            worker_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            worker_name TEXT NOT NULL,
            supervisor_name TEXT,
            zone TEXT NOT NULL,
            salary_status TEXT NOT NULL,
            payment_mode TEXT NOT NULL,
            payment_amount INTEGER NOT NULL DEFAULT 0,
            payment_txn_id TEXT,
            payment_date TEXT,
            daily_wage INTEGER NOT NULL DEFAULT 0,
            earned_today INTEGER NOT NULL DEFAULT 0,
            content TEXT NOT NULL,
            embedding JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS worker_task_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            assigned_by TEXT NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Ready',
            progress INTEGER NOT NULL DEFAULT 0,
            zone TEXT NOT NULL DEFAULT 'Not assigned',
            attendance TEXT,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS worker_task_assignments_worker_idx
          ON worker_task_assignments (worker_id, recorded_at DESC);

          CREATE INDEX IF NOT EXISTS worker_task_assignments_supervisor_idx
          ON worker_task_assignments (supervisor_id, recorded_at DESC);

          CREATE TABLE IF NOT EXISTS workforce_task_embeddings (
            worker_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            worker_name TEXT NOT NULL,
            supervisor_name TEXT,
            zone TEXT NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            attendance TEXT,
            content TEXT NOT NULL,
            embedding JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS video_analyses (
            id UUID PRIMARY KEY,
            uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            uploaded_by_name TEXT NOT NULL,
            zone TEXT NOT NULL,
            file_name TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
            visitor_count INTEGER NOT NULL DEFAULT 0,
            unique_tracks INTEGER NOT NULL DEFAULT 0,
            summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS activity_logs_seed_unique_idx
          ON activity_logs (time_label, person, tag, text);

          CREATE INDEX IF NOT EXISTS visitor_events_created_at_idx
          ON visitor_events (created_at DESC);

          CREATE INDEX IF NOT EXISTS alerts_created_at_idx
          ON alerts (created_at DESC);

          CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
          ON chat_messages (created_at DESC);

          CREATE INDEX IF NOT EXISTS chat_message_embeddings_updated_at_idx
          ON chat_message_embeddings (updated_at DESC);

          CREATE INDEX IF NOT EXISTS chat_message_extractions_updated_at_idx
          ON chat_message_extractions (updated_at DESC);

          CREATE INDEX IF NOT EXISTS workforce_payment_embeddings_updated_at_idx
          ON workforce_payment_embeddings (updated_at DESC);

          CREATE INDEX IF NOT EXISTS workforce_task_embeddings_updated_at_idx
          ON workforce_task_embeddings (updated_at DESC);

          CREATE INDEX IF NOT EXISTS video_analyses_created_at_idx
          ON video_analyses (created_at DESC);

          CREATE TABLE IF NOT EXISTS task_notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            assigned_by TEXT NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL,
            zone TEXT NOT NULL,
            dismissed BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS task_notifications_worker_idx
          ON task_notifications (worker_id, dismissed, created_at DESC);

          CREATE TABLE IF NOT EXISTS florisight_rag_embeddings (
            id TEXT PRIMARY KEY,
            reference_id TEXT NOT NULL,
            section TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS florisight_rag_embeddings_section_idx ON florisight_rag_embeddings (section);
          CREATE INDEX IF NOT EXISTS florisight_rag_embeddings_updated_at_idx ON florisight_rag_embeddings (updated_at DESC);

          CREATE TABLE IF NOT EXISTS admin_login_otps (
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            phone_number TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            consumed_at TIMESTAMPTZ,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS crops (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            variety TEXT,
            zone TEXT NOT NULL DEFAULT 'Not assigned',
            quantity INTEGER NOT NULL DEFAULT 0,
            growth_stage TEXT NOT NULL DEFAULT 'Seedling',
            health_status TEXT NOT NULL DEFAULT 'Healthy',
            planted_date DATE,
            expected_harvest DATE,
            notes TEXT,
            created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            bed TEXT,
            cost NUMERIC(10,2),
            price NUMERIC(10,2),
            batch_code TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS crops_zone_idx ON crops (zone);
          CREATE INDEX IF NOT EXISTS crops_created_at_idx ON crops (created_at DESC);

          ALTER TABLE crops ADD COLUMN IF NOT EXISTS bed TEXT;
          ALTER TABLE crops ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2);
          ALTER TABLE crops ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
          ALTER TABLE crops ADD COLUMN IF NOT EXISTS batch_code TEXT;

          CREATE TABLE IF NOT EXISTS leave_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            worker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            worker_name TEXT NOT NULL,
            supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            reason TEXT NOT NULL,
            leave_type TEXT NOT NULL DEFAULT 'Sick',
            status TEXT NOT NULL DEFAULT 'Pending',
            reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS leave_requests_worker_idx ON leave_requests (worker_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS leave_requests_supervisor_idx ON leave_requests (supervisor_id, status, created_at DESC);

          CREATE TABLE IF NOT EXISTS equipment (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'General',
            zone TEXT NOT NULL DEFAULT 'Not assigned',
            status TEXT NOT NULL DEFAULT 'Operational',
            purchase_date DATE,
            last_service_date DATE,
            next_service_date DATE,
            notes TEXT,
            created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS equipment_zone_idx ON equipment (zone);
          CREATE INDEX IF NOT EXISTS equipment_status_idx ON equipment (status);
          CREATE INDEX IF NOT EXISTS equipment_next_service_idx ON equipment (next_service_date);

          CREATE TABLE IF NOT EXISTS maintenance_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
            service_type TEXT NOT NULL DEFAULT 'Routine',
            description TEXT,
            cost INTEGER,
            performed_by TEXT,
            performed_date DATE NOT NULL DEFAULT CURRENT_DATE,
            next_due_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS maintenance_logs_equipment_idx ON maintenance_logs (equipment_id, performed_date DESC);

          CREATE TABLE IF NOT EXISTS sales (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plant_name TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            status TEXT NOT NULL DEFAULT 'paid',
            sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            status TEXT NOT NULL DEFAULT 'paid',
            due_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            payment_method TEXT NOT NULL,
            amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            company_name TEXT,
            order_date DATE NOT NULL DEFAULT CURRENT_DATE,
            delivery_date DATE,
            status TEXT NOT NULL DEFAULT 'Pending',
            payment_status TEXT NOT NULL DEFAULT 'unpaid',
            total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS seasonal_forecasts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            month TEXT NOT NULL,
            plant_name TEXT NOT NULL,
            event TEXT,
            predicted_demand INTEGER NOT NULL DEFAULT 0,
            confidence INTEGER NOT NULL DEFAULT 0,
            action TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS supplies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            unit TEXT NOT NULL,
            reorder_level INTEGER NOT NULL DEFAULT 0,
            cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await client.query(`
          ALTER TABLE users
          ADD COLUMN IF NOT EXISTS phone_number TEXT;
        `);
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS users_phone_number_unique_idx
          ON users (phone_number)
          WHERE phone_number IS NOT NULL AND phone_number <> '';
        `);
        await client.query(`
          ALTER TABLE workers
          ADD COLUMN IF NOT EXISTS daily_wage INTEGER NOT NULL DEFAULT 0;
        `);
        await client.query(`
          ALTER TABLE workers
          ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'Daily wage';
        `);
        await client.query(`
          ALTER TABLE workers
          ADD COLUMN IF NOT EXISTS payment_amount INTEGER;
        `);
        await client.query(`
          ALTER TABLE workers
          ADD COLUMN IF NOT EXISTS payment_txn_id TEXT;
        `);
        await client.query(`
          ALTER TABLE workers
          ADD COLUMN IF NOT EXISTS payment_date TEXT;
        `);
        await enablePgvectorIfPossible(client);
        await syncSeedData(client);
        global._florisightDb.seedSignature = getSeedSignature();
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })();
  }

  try {
    await global._florisightDb.schemaReady;
    await syncSeedDataIfNeeded();
  } catch (error) {
    global._florisightDb.schemaReady = null;
    throw error;
  }
}

export async function createUser({ name, email, password, role, phoneNumber }) {
  await ensureSchema();

  const id = crypto.randomUUID();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const client = await getPool().connect();

  if (role === "Admin" && !normalizedPhoneNumber) {
    throw new Error("Admin accounts require a phone number for OTP sign-in.");
  }

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        INSERT INTO users (id, name, email, password_hash, role, phone_number)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, email, role, supervisor_id, phone_number
      `,
      [id, name.trim(), normalizedEmail, hashPassword(password), role, normalizedPhoneNumber || null]
    );

    if (role === "Supervisor") {
      await client.query(
        "INSERT INTO supervisors (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        [id]
      );
    }

    if (role === "Worker") {
      await client.query(
        "INSERT INTO workers (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        [id]
      );
    }

    await client.query("COMMIT");

    return toUser(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function validateUserCredentials(email, password) {
  await ensureSchema();

  const result = await getPool().query(
    `
      SELECT id, name, email, password_hash, role, supervisor_id, phone_number
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizeEmail(email)]
  );

  const row = result.rows[0];

  if (!row || !verifyPassword(password, row.password_hash)) {
    return null;
  }

  return toUser(row);
}

export async function getUserByEmail(email) {
  await ensureSchema();

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const result = await getPool().query(
    `
      SELECT id, name, email, role, supervisor_id, phone_number
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return toUser(result.rows[0]);
}

export async function ensureOAuthUser({ email, name, role = "Worker" }) {
  await ensureSchema();

  const normalizedEmail = normalizeEmail(email);
  const trimmedName = String(name || "").trim();

  if (!normalizedEmail) {
    return null;
  }

  const existingUser = await getUserByEmail(normalizedEmail);

  if (existingUser) {
    return existingUser;
  }

  const id = crypto.randomUUID();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        INSERT INTO users (id, name, email, password_hash, role, phone_number)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, email, role, supervisor_id, phone_number
      `,
      [
        id,
        trimmedName || normalizedEmail.split("@")[0] || "Google User",
        normalizedEmail,
        hashPassword(crypto.randomUUID()),
        role,
        null,
      ]
    );

    if (role === "Supervisor") {
      await client.query(
        "INSERT INTO supervisors (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        [id]
      );
    }

    if (role === "Worker") {
      await client.query(
        "INSERT INTO workers (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        [id]
      );
    }

    await client.query("COMMIT");
    return toUser(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error?.code === "23505") {
      return getUserByEmail(normalizedEmail);
    }

    throw error;
  } finally {
    client.release();
  }
}


function buildChatVisibilityClause(user) {
  if (user.role === "Admin") {
    return {
      sql: "TRUE",
      values: [],
    };
  }

  if (user.role === "Supervisor") {
    return {
      sql: `
        (
          scope = 'global'
          OR sender_id = $1
          OR (scope = 'team' AND supervisor_id = $1)
          OR (scope = 'worker' AND supervisor_id = $1)
          OR (scope = 'group' AND group_id IN (SELECT group_id FROM chat_group_members WHERE user_id = $1))
        )
      `,
      values: [user.supervisorId || user.id],
    };
  }

  return {
    sql: `
      (
        scope = 'global'
        OR sender_id = $1
        OR (scope = 'team' AND supervisor_id = $2)
        OR (scope = 'worker' AND worker_id = $1)
        OR (scope = 'group' AND group_id IN (SELECT group_id FROM chat_group_members WHERE user_id = $1))
      )
    `,
    values: [user.workerId || user.id, user.supervisorId || null],
  };
}

async function getChatMessagesForUser(user) {
  const visibility = buildChatVisibilityClause(user);
  const result = await getPool().query(
    `
      SELECT
        id,
        sender_id,
        sender_name,
        sender_role,
        supervisor_id,
        worker_id,
        group_id,
        scope,
        tag,
        text,
        image_url,
        created_at
      FROM chat_messages
      WHERE ${visibility.sql}
      ORDER BY created_at DESC
      LIMIT 24
    `,
    visibility.values
  );

  return result.rows.map(toChatMessage).reverse();
}

async function upsertChatMessageEmbedding(client, message) {
  const content = buildChatMessageDocument(message);
  const embedding = await vectorizeText(content);

  await client.query(
    `
      INSERT INTO chat_message_embeddings (message_id, embedding, content, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (message_id) DO UPDATE
      SET
        embedding = EXCLUDED.embedding,
        content = EXCLUDED.content,
        updated_at = NOW()
    `,
    [message.id, JSON.stringify(embedding), content]
  );

  if (await detectPgvector(client)) {
    await client.query(
      `
        UPDATE chat_message_embeddings
        SET embedding_vector = $2::vector,
            updated_at = NOW()
        WHERE message_id = $1
      `,
      [message.id, serializeVectorForPg(embedding)]
    );
  }
}

async function ensureWorkforcePaymentEmbeddingSchema(client = getPool()) {
  await client.query(
    `
      CREATE TABLE IF NOT EXISTS workforce_payment_embeddings (
        worker_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        worker_name TEXT NOT NULL,
        supervisor_name TEXT,
        zone TEXT NOT NULL,
        salary_status TEXT NOT NULL,
        payment_mode TEXT NOT NULL,
        payment_amount INTEGER NOT NULL DEFAULT 0,
        payment_txn_id TEXT,
        payment_date TEXT,
        daily_wage INTEGER NOT NULL DEFAULT 0,
        earned_today INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        embedding JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  await client.query(
    `
      CREATE INDEX IF NOT EXISTS workforce_payment_embeddings_updated_at_idx
      ON workforce_payment_embeddings (updated_at DESC)
    `
  );

  if (await detectPgvector(client)) {
    await client.query(
      `
        ALTER TABLE workforce_payment_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vector vector(768)
      `
    );
    await client.query(
      `
        CREATE INDEX IF NOT EXISTS workforce_payment_embeddings_vector_idx
        ON workforce_payment_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
      `
    );
  }
}

async function getWorkforcePaymentRagRow(workerId, client = getPool()) {
  await ensureWorkforcePaymentEmbeddingSchema(client);

  const result = await client.query(
    `
      SELECT
        w.user_id AS worker_id,
        w.supervisor_id,
        worker_user.name AS worker_name,
        supervisor_user.name AS supervisor_name,
        w.zone,
        w.salary_status,
        w.payment_mode,
        COALESCE(w.payment_amount, 0) AS payment_amount,
        w.payment_txn_id,
        w.payment_date,
        COALESCE(w.daily_wage, 0) AS daily_wage,
        CASE
          WHEN w.attendance = 'Present' THEN COALESCE(w.daily_wage, 0)
          WHEN w.attendance = 'Late' THEN ROUND(COALESCE(w.daily_wage, 0) * 0.75)
          ELSE 0
        END::int AS earned_today
      FROM workers w
      JOIN users worker_user ON worker_user.id = w.user_id
      LEFT JOIN users supervisor_user ON supervisor_user.id = w.supervisor_id
      WHERE w.user_id = $1
      LIMIT 1
    `,
    [workerId]
  );

  return result.rows[0] || null;
}

async function upsertWorkforcePaymentEmbedding(client, workerRecord) {
  if (!workerRecord?.worker_id) {
    return;
  }

  await ensureWorkforcePaymentEmbeddingSchema(client);

  const content = buildWorkforcePaymentDocument({
    workerName: workerRecord.worker_name,
    supervisorName: workerRecord.supervisor_name,
    zone: workerRecord.zone,
    salaryStatus: workerRecord.salary_status,
    paymentMode: workerRecord.payment_mode,
    paymentAmount: workerRecord.payment_amount,
    paymentTxnId: workerRecord.payment_txn_id,
    paymentDate: workerRecord.payment_date,
    dailyWage: workerRecord.daily_wage,
    earnedToday: workerRecord.earned_today,
  });
  const embedding = await vectorizeText(content);

  await client.query(
    `
      INSERT INTO workforce_payment_embeddings (
        worker_id,
        supervisor_id,
        worker_name,
        supervisor_name,
        zone,
        salary_status,
        payment_mode,
        payment_amount,
        payment_txn_id,
        payment_date,
        daily_wage,
        earned_today,
        content,
        embedding,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW())
      ON CONFLICT (worker_id) DO UPDATE
      SET
        supervisor_id = EXCLUDED.supervisor_id,
        worker_name = EXCLUDED.worker_name,
        supervisor_name = EXCLUDED.supervisor_name,
        zone = EXCLUDED.zone,
        salary_status = EXCLUDED.salary_status,
        payment_mode = EXCLUDED.payment_mode,
        payment_amount = EXCLUDED.payment_amount,
        payment_txn_id = EXCLUDED.payment_txn_id,
        payment_date = EXCLUDED.payment_date,
        daily_wage = EXCLUDED.daily_wage,
        earned_today = EXCLUDED.earned_today,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `,
    [
      workerRecord.worker_id,
      workerRecord.supervisor_id,
      workerRecord.worker_name,
      workerRecord.supervisor_name || null,
      workerRecord.zone,
      workerRecord.salary_status,
      workerRecord.payment_mode,
      Number(workerRecord.payment_amount || 0),
      workerRecord.payment_txn_id || null,
      workerRecord.payment_date || null,
      Number(workerRecord.daily_wage || 0),
      Number(workerRecord.earned_today || 0),
      content,
      JSON.stringify(embedding),
    ]
  );

  if (await detectPgvector(client)) {
    await client.query(
      `
        UPDATE workforce_payment_embeddings
        SET embedding_vector = $2::vector,
            updated_at = NOW()
        WHERE worker_id = $1
      `,
      [workerRecord.worker_id, serializeVectorForPg(embedding)]
    );
  }
}

async function upsertWorkforcePaymentEmbeddingForWorker(workerId, client = null) {
  const runner = client || getPool();
  const workerRecord = await getWorkforcePaymentRagRow(workerId, runner);

  if (!workerRecord) {
    return;
  }

  await upsertWorkforcePaymentEmbedding(runner, workerRecord);
}

async function ensureWorkforceTaskEmbeddingSchema(client = getPool()) {
  await client.query(
    `
      CREATE TABLE IF NOT EXISTS workforce_task_embeddings (
        worker_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        worker_name TEXT NOT NULL,
        supervisor_name TEXT,
        zone TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        attendance TEXT,
        content TEXT NOT NULL,
        embedding JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  await client.query(
    `
      CREATE INDEX IF NOT EXISTS workforce_task_embeddings_updated_at_idx
      ON workforce_task_embeddings (updated_at DESC)
    `
  );

  if (await detectPgvector(client)) {
    await client.query(
      `
        ALTER TABLE workforce_task_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vector vector(768)
      `
    );
    await client.query(
      `
        CREATE INDEX IF NOT EXISTS workforce_task_embeddings_vector_idx
        ON workforce_task_embeddings
        USING ivfflat (embedding_vector vector_cosine_ops)
      `
    );
  }
}

async function getWorkforceTaskRagRow(workerId, client = getPool()) {
  await ensureWorkforceTaskEmbeddingSchema(client);

  const result = await client.query(
    `
      SELECT
        w.user_id AS worker_id,
        w.supervisor_id,
        worker_user.name AS worker_name,
        supervisor_user.name AS supervisor_name,
        w.zone,
        w.task,
        w.status,
        w.progress,
        w.attendance
      FROM workers w
      JOIN users worker_user ON worker_user.id = w.user_id
      LEFT JOIN users supervisor_user ON supervisor_user.id = w.supervisor_id
      WHERE w.user_id = $1
      LIMIT 1
    `,
    [workerId]
  );

  return result.rows[0] || null;
}

async function upsertWorkforceTaskEmbedding(client, workerRecord) {
  if (!workerRecord?.worker_id) {
    return;
  }

  await ensureWorkforceTaskEmbeddingSchema(client);

  const content = buildWorkforceTaskDocument({
    workerName: workerRecord.worker_name,
    supervisorName: workerRecord.supervisor_name,
    zone: workerRecord.zone,
    task: workerRecord.task,
    status: workerRecord.status,
    progress: workerRecord.progress,
    attendance: workerRecord.attendance,
  });
  const embedding = await vectorizeText(content);

  await client.query(
    `
      INSERT INTO workforce_task_embeddings (
        worker_id,
        supervisor_id,
        worker_name,
        supervisor_name,
        zone,
        task,
        status,
        progress,
        attendance,
        content,
        embedding,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
      ON CONFLICT (worker_id) DO UPDATE
      SET
        supervisor_id = EXCLUDED.supervisor_id,
        worker_name = EXCLUDED.worker_name,
        supervisor_name = EXCLUDED.supervisor_name,
        zone = EXCLUDED.zone,
        task = EXCLUDED.task,
        status = EXCLUDED.status,
        progress = EXCLUDED.progress,
        attendance = EXCLUDED.attendance,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `,
    [
      workerRecord.worker_id,
      workerRecord.supervisor_id,
      workerRecord.worker_name,
      workerRecord.supervisor_name || null,
      workerRecord.zone,
      workerRecord.task || "No active assignment",
      workerRecord.status || "Ready",
      Number(workerRecord.progress || 0),
      workerRecord.attendance || null,
      content,
      JSON.stringify(embedding),
    ]
  );

  if (await detectPgvector(client)) {
    await client.query(
      `
        UPDATE workforce_task_embeddings
        SET embedding_vector = $2::vector,
            updated_at = NOW()
        WHERE worker_id = $1
      `,
      [workerRecord.worker_id, serializeVectorForPg(embedding)]
    );
  }
}

async function upsertWorkforceTaskEmbeddingForWorker(workerId, client = null) {
  const runner = client || getPool();
  const workerRecord = await getWorkforceTaskRagRow(workerId, runner);

  if (!workerRecord) {
    return;
  }

  await upsertWorkforceTaskEmbedding(runner, workerRecord);
}

export async function upsertRagEmbedding(section, record, client = null) {
  const runner = client || getPool();

  let content = "";
  let refId = "";

  if (section === "crops") {
    refId = record.id;
    content = buildCropDocument(record);
  } else if (section === "sales") {
    refId = record.id;
    content = buildSaleDocument(record);
  } else if (section === "orders") {
    refId = record.id;
    content = buildOrderDocument(record);
  } else if (section === "expenses") {
    refId = record.id;
    content = buildExpenseDocument(record);
  } else if (section === "equipment") {
    refId = record.id;
    content = buildEquipmentDocument(record);
  } else if (section === "alerts") {
    refId = record.id;
    content = buildAlertDocument(record);
  } else if (section === "supplies") {
    refId = record.id;
    content = [
      "farm supply record",
      record.name ? `supply name ${record.name}` : "",
      record.category ? `category ${record.category}` : "",
      Number.isFinite(Number(record.quantity)) ? `quantity ${Number(record.quantity)} ${record.unit || ""}` : "",
      Number.isFinite(Number(record.reorderLevel)) ? `reorder level ${Number(record.reorderLevel)}` : "",
      Number.isFinite(Number(record.cost)) ? `cost ${Number(record.cost)} rupees` : "",
    ].filter(Boolean).join(". ");
  } else if (section === "leave_requests") {
    refId = record.id;
    content = [
      "employee leave request",
      record.workerName ? `worker ${record.workerName}` : "",
      record.leaveType ? `leave type ${record.leaveType}` : "",
      record.startDate ? `start date ${record.startDate}` : "",
      record.endDate ? `end date ${record.endDate}` : "",
      record.reason ? `reason ${record.reason}` : "",
      record.status ? `status ${record.status}` : "",
    ].filter(Boolean).join(". ");
  } else if (section === "visitor_events") {
    refId = record.id;
    content = [
      "visitor event entry log",
      record.reporterName ? `reporter ${record.reporterName}` : "",
      record.zone ? `zone ${record.zone}` : "",
      Number.isFinite(Number(record.visitorCount)) ? `visitor count ${Number(record.visitorCount)} visitors` : "",
      record.note ? `note ${record.note}` : "",
    ].filter(Boolean).join(". ");
  }

  if (!refId || !content) return;

  const embedding = await vectorizeText(content);
  const docId = `${section}-${refId}`;

  await runner.query(
    `
      INSERT INTO florisight_rag_embeddings (id, reference_id, section, content, embedding, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
      SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `,
    [docId, refId, section, content, JSON.stringify(embedding)]
  );

  if (await detectPgvector(runner)) {
    await runner.query(
      `
        UPDATE florisight_rag_embeddings
        SET embedding_vector = $2::vector,
            updated_at = NOW()
        WHERE id = $1
      `,
      [docId, serializeVectorForPg(embedding)]
    );
  }
}

export async function reindexAllRagEmbeddings(client) {
  console.log("Re-indexing all generic RAG embeddings...");
  await client.query("DELETE FROM florisight_rag_embeddings");

  // Index crops
  const cropsRes = await client.query("SELECT * FROM crops");
  for (const row of cropsRes.rows) {
    await upsertRagEmbedding("crops", {
      id: row.id,
      name: row.name,
      variety: row.variety,
      zone: row.zone,
      quantity: row.quantity,
      growthStage: row.growth_stage,
      healthStatus: row.health_status,
      plantedDate: row.planted_date,
      expectedHarvest: row.expected_harvest,
      notes: row.notes,
      bed: row.bed,
      cost: row.cost,
      price: row.price,
      batchCode: row.batch_code,
    }, client);
  }

  // Index sales
  const salesRes = await client.query("SELECT * FROM sales");
  for (const row of salesRes.rows) {
    await upsertRagEmbedding("sales", {
      id: row.id,
      plantName: row.plant_name,
      customerName: row.customer_name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      totalAmount: row.total_amount,
      status: row.status,
      saleDate: row.sale_date,
    }, client);
  }

  // Index orders
  const ordersRes = await client.query("SELECT * FROM orders");
  for (const row of ordersRes.rows) {
    await upsertRagEmbedding("orders", {
      id: row.id,
      customerName: row.customer_name,
      companyName: row.company_name,
      orderDate: row.order_date,
      deliveryDate: row.delivery_date,
      status: row.status,
      paymentStatus: row.payment_status,
      totalAmount: row.total_amount,
    }, client);
  }

  // Index expenses
  const expensesRes = await client.query("SELECT * FROM expenses");
  for (const row of expensesRes.rows) {
    await upsertRagEmbedding("expenses", {
      id: row.id,
      description: row.description,
      category: row.category,
      paymentMethod: row.payment_method,
      amount: row.amount,
      expenseDate: row.expense_date,
    }, client);
  }

  // Index equipment
  const equipmentRes = await client.query("SELECT * FROM equipment");
  for (const row of equipmentRes.rows) {
    await upsertRagEmbedding("equipment", {
      id: row.id,
      name: row.name,
      category: row.type,
      zone: row.zone,
      status: row.status,
      purchaseDate: row.purchase_date,
      lastServiceDate: row.last_service_date,
      notes: row.notes,
    }, client);
  }

  // Index alerts
  const alertsRes = await client.query("SELECT * FROM alerts");
  for (const row of alertsRes.rows) {
    await upsertRagEmbedding("alerts", {
      id: row.id,
      zone: row.zone,
      severity: row.severity,
      title: row.title,
      detail: row.detail,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }, client);
  }

  // Index supplies
  const suppliesRes = await client.query("SELECT * FROM supplies");
  for (const row of suppliesRes.rows) {
    await upsertRagEmbedding("supplies", {
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: row.quantity,
      unit: row.unit,
      reorderLevel: row.reorder_level,
      cost: row.cost,
    }, client);
  }

  // Index leave_requests
  const leaveRes = await client.query("SELECT * FROM leave_requests");
  for (const row of leaveRes.rows) {
    await upsertRagEmbedding("leave_requests", {
      id: row.id,
      workerName: row.worker_name,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
    }, client);
  }

  // Index visitor_events
  const visitorRes = await client.query("SELECT * FROM visitor_events");
  for (const row of visitorRes.rows) {
    await upsertRagEmbedding("visitor_events", {
      id: row.id,
      reporterName: row.reporter_name,
      zone: row.zone,
      visitorCount: row.visitor_count,
      note: row.note,
    }, client);
  }
}

async function indexMissingChatMessageEmbeddings() {
  await ensureSchema();
  let indexedCount = 0;

  while (true) {
    const result = await getPool().query(
      `
        SELECT
          m.id,
          m.sender_id,
          m.sender_name,
          m.sender_role,
          m.supervisor_id,
          m.worker_id,
          m.scope,
          m.tag,
          m.text,
          m.image_url,
          m.created_at
        FROM chat_messages m
        LEFT JOIN chat_message_embeddings e ON e.message_id = m.id
        WHERE e.message_id IS NULL
        ORDER BY m.created_at ASC
        LIMIT 200
      `
    );

    if (!result.rows.length) {
      return indexedCount;
    }

    const client = await getPool().connect();

    try {
      await client.query("BEGIN");

      for (const row of result.rows) {
        await upsertChatMessageEmbedding(client, toChatMessage(row));
      }

      await client.query("COMMIT");
      indexedCount += result.rows.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function indexAllWorkforcePaymentEmbeddings() {
  await ensureSchema();

  const result = await getPool().query(
    `
      SELECT w.user_id AS worker_id
      FROM workers w
      ORDER BY w.user_id ASC
    `
  );

  if (!result.rows.length) {
    return 0;
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await ensureWorkforcePaymentEmbeddingSchema(client);

    for (const row of result.rows) {
      await upsertWorkforcePaymentEmbeddingForWorker(row.worker_id, client);
    }

    await client.query("COMMIT");
    return result.rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function indexAllWorkforceTaskEmbeddings() {
  await ensureSchema();

  const result = await getPool().query(
    `
      SELECT w.user_id AS worker_id
      FROM workers w
      ORDER BY w.user_id ASC
    `
  );

  if (!result.rows.length) {
    return 0;
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await ensureWorkforceTaskEmbeddingSchema(client);

    for (const row of result.rows) {
      await upsertWorkforceTaskEmbeddingForWorker(row.worker_id, client);
    }

    await client.query("COMMIT");
    return result.rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getRankedChatMatches(user, question, limit = 5) {
  await ensureSchema();
  await indexMissingChatMessageEmbeddings();

  const visibility = buildChatVisibilityClause(user);
  const queryEmbedding = await vectorizeText(question);
  const normalized = normalizeLooseText(question);

  const isToday = /\b(today|now|current|recent|latest|today's|todays)\b/i.test(normalized);
  const isStatusQuery = /\b(was there|is there|any|did anyone|did they|update|status|progress|report)\b/i.test(normalized);
  const wantsAllTime = /\b(all time|history|ever|past|old|before|previous|all-time)\b/i.test(normalized);
  const hasSpecificDate = /\b(january|february|march|april|may|june|july|august|september|october|november|december|yesterday|last week|ago|date|month)\b/i.test(normalized);

  const filterToday = (isToday || isStatusQuery) && !wantsAllTime && !hasSpecificDate;

  if (await detectPgvector()) {
    const values = [...visibility.values, serializeVectorForPg(queryEmbedding), limit];
    const vectorParam = `$${visibility.values.length + 1}`;
    const limitParam = `$${visibility.values.length + 2}`;
    const result = await getPool().query(
      `
        SELECT
          m.id,
          m.sender_id,
          m.sender_name,
          m.sender_role,
          m.supervisor_id,
          m.worker_id,
          m.group_id,
          m.scope,
          m.tag,
          m.text,
          m.image_url,
          m.created_at,
          e.embedding,
          1 - (e.embedding_vector <=> ${vectorParam}::vector) AS similarity
        FROM chat_messages m
        JOIN chat_message_embeddings e ON e.message_id = m.id
        WHERE ${visibility.sql}
          AND e.embedding_vector IS NOT NULL
          ${filterToday ? "AND m.created_at >= CURRENT_DATE" : ""}
        ORDER BY e.embedding_vector <=> ${vectorParam}::vector ASC
        LIMIT ${limitParam}
      `,
      values
    );

    return result.rows
      .map((row) => {
        const message = toChatEmbeddingRow(row);
        return {
          ...message,
          score: Number(row.similarity || 0),
        };
      })
      .filter((row) => row.score > 0.08);
  }

  const result = await getPool().query(
    `
      SELECT
        m.id,
        m.sender_id,
        m.sender_name,
        m.sender_role,
        m.supervisor_id,
        m.worker_id,
        m.group_id,
        m.scope,
        m.tag,
        m.text,
        m.image_url,
        m.created_at,
        e.embedding
      FROM chat_messages m
      JOIN chat_message_embeddings e ON e.message_id = m.id
      WHERE ${visibility.sql}
        ${filterToday ? "AND m.created_at >= CURRENT_DATE" : ""}
      ORDER BY m.created_at DESC
      LIMIT 500
    `,
    visibility.values
  );

  return result.rows
    .map((row) => {
      const message = toChatEmbeddingRow(row);

      return {
        ...message,
        score: cosineSimilarity(queryEmbedding, message.embedding),
      };
    })
    .filter((row) => row.score > 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

async function getRankedWorkforcePaymentMatches(user, question, limit = 5) {
  await ensureSchema();
  await indexAllWorkforcePaymentEmbeddings();
  await ensureWorkforcePaymentEmbeddingSchema();

  const queryEmbedding = await vectorizeText(question);
  const values = [];
  const clauses = [];

  if (user.role === "Supervisor") {
    values.push(user.supervisorId || user.id);
    clauses.push(`supervisor_id = $${values.length}`);
  } else if (user.role === "Worker") {
    values.push(user.workerId || user.id);
    clauses.push(`worker_id = $${values.length}`);
  }

  const whereClause = clauses.length ? clauses.join(" AND ") : "TRUE";

  if (await detectPgvector()) {
    values.push(serializeVectorForPg(queryEmbedding), limit);
    const vectorParam = `$${values.length - 1}`;
    const limitParam = `$${values.length}`;
    const result = await getPool().query(
      `
        SELECT
          worker_id,
          supervisor_id,
          worker_name,
          supervisor_name,
          zone,
          salary_status,
          payment_mode,
          payment_amount,
          payment_txn_id,
          payment_date,
          daily_wage,
          earned_today,
          updated_at,
          1 - (embedding_vector <=> ${vectorParam}::vector) AS similarity
        FROM workforce_payment_embeddings
        WHERE ${whereClause}
          AND embedding_vector IS NOT NULL
        ORDER BY embedding_vector <=> ${vectorParam}::vector ASC
        LIMIT ${limitParam}
      `,
      values
    );

    return result.rows
      .map((row) => ({
        id: `payment-${row.worker_id}`,
        senderName: row.worker_name,
        tag: "Payment",
        timeLabel: row.payment_date || formatTimeLabel(row.updated_at),
        text:
          `${row.worker_name} in ${row.zone} has ${formatCurrency(row.payment_amount)} paid ` +
          `via ${row.payment_mode}. Status: ${row.salary_status}.` +
          (row.payment_txn_id ? ` Txn ${row.payment_txn_id}.` : ""),
        score: Number(row.similarity || 0),
        sourceType: "workforce_payment",
        workerId: row.worker_id,
      }))
      .filter((row) => row.score > 0.08);
  }

  const result = await getPool().query(
    `
      SELECT
        worker_id,
        supervisor_id,
        worker_name,
        zone,
        salary_status,
        payment_mode,
        payment_amount,
        payment_txn_id,
        payment_date,
        updated_at,
        embedding
      FROM workforce_payment_embeddings
      WHERE ${whereClause}
      ORDER BY updated_at DESC
      LIMIT 500
    `,
    values
  );

  return result.rows
    .map((row) => ({
      id: `payment-${row.worker_id}`,
      senderName: row.worker_name,
      tag: "Payment",
      timeLabel: row.payment_date || formatTimeLabel(row.updated_at),
      text:
        `${row.worker_name} in ${row.zone} has ${formatCurrency(row.payment_amount)} paid ` +
        `via ${row.payment_mode}. Status: ${row.salary_status}.` +
        (row.payment_txn_id ? ` Txn ${row.payment_txn_id}.` : ""),
      score: cosineSimilarity(
        queryEmbedding,
        Array.isArray(row.embedding) ? row.embedding.map((value) => Number(value)) : JSON.parse(row.embedding || "[]")
      ),
      sourceType: "workforce_payment",
      workerId: row.worker_id,
    }))
    .filter((row) => row.score > 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

async function getRankedWorkforceTaskMatches(user, question, limit = 5) {
  await ensureSchema();
  await indexAllWorkforceTaskEmbeddings();
  await ensureWorkforceTaskEmbeddingSchema();

  const queryEmbedding = await vectorizeText(question);
  const values = [];
  const clauses = [];

  if (user.role === "Supervisor") {
    values.push(user.supervisorId || user.id);
    clauses.push(`supervisor_id = $${values.length}`);
  } else if (user.role === "Worker") {
    values.push(user.workerId || user.id);
    clauses.push(`worker_id = $${values.length}`);
  }

  const whereClause = clauses.length ? clauses.join(" AND ") : "TRUE";

  if (await detectPgvector()) {
    values.push(serializeVectorForPg(queryEmbedding), limit);
    const vectorParam = `$${values.length - 1}`;
    const limitParam = `$${values.length}`;
    const result = await getPool().query(
      `
        SELECT
          worker_id,
          supervisor_id,
          worker_name,
          supervisor_name,
          zone,
          task,
          status,
          progress,
          attendance,
          updated_at,
          1 - (embedding_vector <=> ${vectorParam}::vector) AS similarity
        FROM workforce_task_embeddings
        WHERE ${whereClause}
          AND embedding_vector IS NOT NULL
        ORDER BY embedding_vector <=> ${vectorParam}::vector ASC
        LIMIT ${limitParam}
      `,
      values
    );

    return result.rows
      .map((row) => ({
        id: `task-${row.worker_id}`,
        senderName: row.worker_name,
        tag: "Task",
        timeLabel: formatTimeLabel(row.updated_at),
        text:
          `${row.worker_name} is assigned ${row.task} in ${row.zone}. ` +
          `Status: ${row.status}. Progress: ${row.progress}%.` +
          (row.attendance ? ` Attendance: ${row.attendance}.` : ""),
        score: Number(row.similarity || 0),
        sourceType: "workforce_task",
        workerId: row.worker_id,
      }))
      .filter((row) => row.score > 0.08);
  }

  const result = await getPool().query(
    `
      SELECT
        worker_id,
        supervisor_id,
        worker_name,
        zone,
        task,
        status,
        progress,
        attendance,
        updated_at,
        embedding
      FROM workforce_task_embeddings
      WHERE ${whereClause}
      ORDER BY updated_at DESC
      LIMIT 500
    `,
    values
  );

  return result.rows
    .map((row) => ({
      id: `task-${row.worker_id}`,
      senderName: row.worker_name,
      tag: "Task",
      timeLabel: formatTimeLabel(row.updated_at),
      text:
        `${row.worker_name} is assigned ${row.task} in ${row.zone}. ` +
        `Status: ${row.status}. Progress: ${row.progress}%.` +
        (row.attendance ? ` Attendance: ${row.attendance}.` : ""),
      score: cosineSimilarity(
        queryEmbedding,
        Array.isArray(row.embedding) ? row.embedding.map((value) => Number(value)) : JSON.parse(row.embedding || "[]")
      ),
      sourceType: "workforce_task",
      workerId: row.worker_id,
    }))
    .filter((row) => row.score > 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function getRankedGenericRagMatches(user, question, limit = 5, sections = null) {
  await ensureSchema();
  const queryEmbedding = await vectorizeText(question);
  
  let sectionFilter = "TRUE";
  const queryParams = [];
  
  if (Array.isArray(sections) && sections.length > 0) {
    const paramsList = [];
    sections.forEach((sec) => {
      queryParams.push(sec);
      paramsList.push(`$${queryParams.length}`);
    });
    sectionFilter = `section IN (${paramsList.join(", ")})`;
  }
  
  const mapping = {
    crops: { senderName: "Inventory", tag: "Crop" },
    sales: { senderName: "Sales", tag: "Sale" },
    orders: { senderName: "Orders", tag: "Order" },
    expenses: { senderName: "Expenses", tag: "Expense" },
    equipment: { senderName: "Equipment", tag: "Equipment" },
    alerts: { senderName: "Alerts", tag: "Alert" },
    supplies: { senderName: "Supplies", tag: "Supply" },
    leave_requests: { senderName: "Leave Requests", tag: "Leave Request" },
    visitor_events: { senderName: "Visitor Logs", tag: "Visitor Event" },
  };

  if (await detectPgvector()) {
    queryParams.push(serializeVectorForPg(queryEmbedding), limit);
    const vectorParam = `$${queryParams.length - 1}`;
    const limitParam = `$${queryParams.length}`;
    
    const result = await getPool().query(
      `
        SELECT
          id,
          reference_id,
          section,
          content,
          embedding,
          updated_at,
          1 - (embedding_vector <=> ${vectorParam}::vector) AS similarity
        FROM florisight_rag_embeddings
        WHERE ${sectionFilter}
          AND embedding_vector IS NOT NULL
        ORDER BY embedding_vector <=> ${vectorParam}::vector ASC
        LIMIT ${limitParam}
      `,
      queryParams
    );

    return result.rows
      .map((row) => {
        const info = mapping[row.section] || { senderName: row.section, tag: "Generic" };
        return {
          id: row.id,
          senderName: info.senderName,
          tag: info.tag,
          timeLabel: formatTimeLabel(row.updated_at),
          text: row.content,
          score: Number(row.similarity || 0),
          sourceType: row.section,
        };
      })
      .filter((row) => row.score > 0.08);
  }

  const result = await getPool().query(
    `
      SELECT
        id,
        reference_id,
        section,
        content,
        embedding,
        updated_at
      FROM florisight_rag_embeddings
      WHERE ${sectionFilter}
      ORDER BY updated_at DESC
      LIMIT 500
    `,
    queryParams
  );

  return result.rows
    .map((row) => {
      const info = mapping[row.section] || { senderName: row.section, tag: "Generic" };
      const parsedEmbedding = Array.isArray(row.embedding)
        ? row.embedding.map((val) => Number(val))
        : JSON.parse(row.embedding || "[]");
        
      return {
        id: row.id,
        senderName: info.senderName,
        tag: info.tag,
        timeLabel: formatTimeLabel(row.updated_at),
        text: row.content,
        score: cosineSimilarity(queryEmbedding, parsedEmbedding),
        sourceType: row.section,
      };
    })
    .filter((row) => row.score > 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

async function ensureMessageState(userId) {
  if (!userId) {
    return;
  }

  try {
    await getPool().query(
      `
        INSERT INTO user_message_state (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );
  } catch (error) {
    if (error.code === "23503") {
      console.warn(`ensureMessageState: User ${userId} is not present in 'users' table. Skipping.`);
      return;
    }
    throw error;
  }
}

async function getMessageState(userId) {
  await ensureSchema();

  if (!userId) {
    return defaultMessageState(null, null);
  }

  await ensureMessageState(userId);

  const result = await getPool().query(
    `
      SELECT user_id, last_read_at, notifications_enabled
      FROM user_message_state
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return defaultMessageState(result.rows[0], userId);
}

export async function markChatMessagesRead(user) {
  await ensureSchema();
  await ensureMessageState(user.id);

  const result = await getPool().query(
    `
      UPDATE user_message_state
      SET
        last_read_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id, last_read_at, notifications_enabled
    `,
    [user.id]
  );

  return defaultMessageState(result.rows[0], user.id);
}

export async function setNotificationsEnabled(userId, enabled) {
  await ensureSchema();
  await ensureMessageState(userId);

  const result = await getPool().query(
    `
      UPDATE user_message_state
      SET
        notifications_enabled = $2,
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id, last_read_at, notifications_enabled
    `,
    [userId, Boolean(enabled)]
  );

  return defaultMessageState(result.rows[0], userId);
}

export async function createVideoAnalysis({
  uploadedBy,
  uploadedByName,
  zone,
  fileName,
  status = "processing",
  visitorCount = 0,
  uniqueTracks = 0,
  summary = {},
}) {
  await ensureSchema();

  const id = crypto.randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO video_analyses (
        id,
        uploaded_by,
        uploaded_by_name,
        zone,
        file_name,
        status,
        visitor_count,
        unique_tracks,
        summary_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING id, uploaded_by, uploaded_by_name, zone, file_name, status, visitor_count, unique_tracks, summary_json, created_at
    `,
    [
      id,
      uploadedBy,
      uploadedByName,
      zone,
      fileName,
      status,
      visitorCount,
      uniqueTracks,
      JSON.stringify(summary || {}),
    ]
  );

  return toTrackingAnalysis(result.rows[0]);
}

export async function updateVideoAnalysis(id, { status, visitorCount, uniqueTracks, summary }) {
  await ensureSchema();

  const result = await getPool().query(
    `
      UPDATE video_analyses
      SET
        status = COALESCE($2, status),
        visitor_count = COALESCE($3, visitor_count),
        unique_tracks = COALESCE($4, unique_tracks),
        summary_json = COALESCE($5::jsonb, summary_json)
      WHERE id = $1
      RETURNING id, uploaded_by, uploaded_by_name, zone, file_name, status, visitor_count, unique_tracks, summary_json, created_at
    `,
    [
      id,
      status || null,
      Number.isFinite(visitorCount) ? visitorCount : null,
      Number.isFinite(uniqueTracks) ? uniqueTracks : null,
      summary ? JSON.stringify(summary) : null,
    ]
  );

  return result.rows[0] ? toTrackingAnalysis(result.rows[0]) : null;
}

export async function createTrackingVisitorEvent({
  reporterId,
  reporterName,
  zone,
  visitorCount,
  analysisId,
  mode,
}) {
  const count = Number.parseInt(visitorCount, 10);

  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }

  const detectionMode = String(mode || "live").trim() || "live";
  const analysisSuffix = analysisId ? ` Analysis ${analysisId.slice(0, 8)}.` : "";
  const note = `${detectionMode === "image" ? "Live camera frame" : "Live monitoring clip"} detected ${count} human${count === 1 ? "" : "s"} in ${zone}.${analysisSuffix}`;

  return createVisitorEvent({
    reporterId,
    reporterName,
    zone,
    visitorCount: count,
    note,
    imageUrl: null,
  });
}

async function getUnreadMessageCount(user, lastReadAt) {
  const visibility = buildChatVisibilityClause(user);
  const values = [...visibility.values];
  const lastReadParam = `$${values.length + 1}`;
  const selfParam = `$${values.length + 2}`;
  values.push(lastReadAt || new Date(0).toISOString(), user.id);

  const result = await getPool().query(
    `
      SELECT COUNT(*)::int AS count
      FROM chat_messages
      WHERE ${visibility.sql}
        AND created_at > ${lastReadParam}
        AND sender_id <> ${selfParam}
    `,
    values
  );

  return result.rows[0]?.count || 0;
}

export async function createChatMessage({
  senderId,
  senderName,
  senderRole,
  supervisorId,
  workerId,
  groupId,
  text,
  imageUrl,
  tag,
}) {
  await ensureSchema();

  const messageText = String(text || "").trim();
  const normalizedImageUrl = String(imageUrl || "").trim() || null;

  if (!messageText && !normalizedImageUrl) {
    throw new Error("Add a message or photo before sending.");
  }

  if (normalizedImageUrl && normalizedImageUrl.length > 2_000_000) {
    throw new Error("Attached image is too large.");
  }

  const scope =
    groupId ? "group" : senderRole === "Admin" ? "global" : senderRole === "Supervisor" ? "team" : "worker";
  const id = crypto.randomUUID();

  const result = await getPool().query(
    `
      INSERT INTO chat_messages (
        id,
        sender_id,
        sender_name,
        sender_role,
        supervisor_id,
        worker_id,
        group_id,
        scope,
        tag,
        text,
        image_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        sender_id,
        sender_name,
        sender_role,
        supervisor_id,
        worker_id,
        group_id,
        scope,
        tag,
        text,
        image_url,
        created_at
    `,
    [
      id,
      senderId,
      senderName,
      senderRole,
      supervisorId || null,
      workerId || null,
      groupId || null,
      scope,
      tag || "Update",
      messageText || "Photo attached",
      normalizedImageUrl,
    ]
  );

  if (senderRole === "Worker") {
    await getPool().query(
      `
        UPDATE workers
        SET logs_today = logs_today + 1
        WHERE user_id = $1
      `,
      [workerId || senderId]
    );
  }

  await getPool().query(
    `
      INSERT INTO activity_logs (time_label, person, tag, text)
      VALUES ($1, $2, $3, $4)
    `,
    [
      formatTimeLabel(new Date()),
      senderName,
      tag || "Update",
      normalizedImageUrl ? `${messageText} [Photo attached]` : messageText,
    ]
  );

  const message = toChatMessage(result.rows[0]);
  const client = await getPool().connect();

  try {
    await upsertChatMessageEmbedding(client, message);
  } finally {
    client.release();
  }

  return message;
}

async function getScopedWorkersForUser(user) {
  await ensureSchema();

  if (user.role === "Worker") {
    const result = await getPool().query(
      `
        SELECT w.user_id AS id, u.name, w.zone
        FROM workers w
        JOIN users u ON u.id = w.user_id
        WHERE w.user_id = $1
      `,
      [user.workerId || user.id]
    );

    return result.rows;
  }

  if (user.role === "Supervisor") {
    const result = await getPool().query(
      `
        SELECT w.user_id AS id, u.name, w.zone
        FROM workers w
        JOIN users u ON u.id = w.user_id
        WHERE w.supervisor_id = $1
        ORDER BY u.name ASC
      `,
      [user.supervisorId || user.id]
    );

    return result.rows;
  }

  const result = await getPool().query(
    `
      SELECT w.user_id AS id, u.name, w.zone
      FROM workers w
      JOIN users u ON u.id = w.user_id
      ORDER BY u.name ASC
    `
  );

  return result.rows;
}

async function getDefaultZoneForUser(user) {
  await ensureSchema();

  if (user.role === "Worker") {
    const result = await getPool().query(
      "SELECT zone FROM workers WHERE user_id = $1 LIMIT 1",
      [user.workerId || user.id]
    );

    return result.rows[0]?.zone || "Visitor Gate";
  }

  if (user.role === "Supervisor") {
    const result = await getPool().query(
      "SELECT zone FROM supervisors WHERE user_id = $1 LIMIT 1",
      [user.supervisorId || user.id]
    );

    return result.rows[0]?.zone?.split(" and ")[0] || "Visitor Gate";
  }

  return "Visitor Gate";
}

function findMentionedWorker(text, workers = []) {
  const normalized = normalizeLooseText(text);

  return (
    workers.find((worker) => normalized.includes(normalizeLooseText(worker.name))) ||
    workers.find((worker) => {
      const [firstName] = String(worker.name || "").split(" ");
      return firstName ? normalized.includes(normalizeLooseText(firstName)) : false;
    }) ||
    null
  );
}

async function answerExactWorkerPaymentQuestion(user, question) {
  const normalized = normalizeLooseText(question);

  if (!/\b(payment|paid|amount|salary|wage|payroll|receipt|transaction|txn|earned)\b/.test(normalized)) {
    return null;
  }

  const workers = await getScopedWorkersForUser(user);
  const mentionedWorker = findMentionedWorker(question, workers);

  if (!mentionedWorker?.id) {
    return null;
  }

  const paymentRecord = await getWorkforcePaymentRagRow(mentionedWorker.id);

  if (!paymentRecord) {
    return null;
  }

  const amountPaid = Number(paymentRecord.payment_amount || 0);
  const hasRecordedPayment =
    amountPaid > 0 || Boolean(paymentRecord.payment_txn_id) || Boolean(paymentRecord.payment_date);
  const method = paymentRecord.payment_mode || "payment method not recorded";
  const txnId = paymentRecord.payment_txn_id || "not recorded";
  const paymentDate = paymentRecord.payment_date || "not recorded";

  if (!hasRecordedPayment) {
    return {
      title: "Payment record",
      summary: `No recorded payment was found yet for ${paymentRecord.worker_name}.`,
      evidence: buildStructuredEvidence([
        {
          id: `payment-${paymentRecord.worker_id}`,
          senderName: paymentRecord.worker_name,
          tag: "Payment",
          timeLabel: formatTimeLabel(new Date()),
          text: `${paymentRecord.worker_name} has no recorded payment yet. Status: ${paymentRecord.salary_status}.`,
        },
      ]),
    };
  }

  const wantsTxn = /\b(transaction|txn|transaction id|receipt)\b/.test(normalized);
  const wantsAmount = /\b(amount|how much|paid|payment)\b/.test(normalized);
  const summary = wantsTxn
    ? `${paymentRecord.worker_name} was paid ${formatCurrency(amountPaid)} via ${method}. Transaction ID: ${txnId}. Paid on ${paymentDate}.`
    : wantsAmount
    ? `${paymentRecord.worker_name} was paid ${formatCurrency(amountPaid)} via ${method}. Transaction ID: ${txnId}.`
    : `${paymentRecord.worker_name} has a recorded payment of ${formatCurrency(amountPaid)} via ${method}.`;

  return {
    title: "Payment record",
    summary,
    evidence: buildStructuredEvidence([
      {
        id: `payment-${paymentRecord.worker_id}`,
        senderName: paymentRecord.worker_name,
        tag: "Payment",
        timeLabel: paymentDate,
        text: `${paymentRecord.worker_name} in ${paymentRecord.zone} was paid ${formatCurrency(amountPaid)} via ${method}. Txn ${txnId}.`,
      },
    ]),
  };
}

async function answerExactWorkerTaskQuestion(user, question) {
  const normalized = normalizeLooseText(question);

  if (!/\b(task|assigned|work|job|status|progress|attendance)\b/.test(normalized)) {
    return null;
  }

  const workers = await getScopedWorkersForUser(user);
  const mentionedWorker = findMentionedWorker(question, workers);

  if (!mentionedWorker?.id) {
    return null;
  }

  const taskRecord = await getWorkforceTaskRagRow(mentionedWorker.id);

  if (!taskRecord) {
    return null;
  }

  const hasActiveTask = taskRecord.task && !taskRecord.task.toLowerCase().includes("no active assignment");

  if (!hasActiveTask) {
    return {
      title: "Task assignment",
      summary: `${taskRecord.worker_name} has no active assignment in ${taskRecord.zone}.`,
      evidence: buildStructuredEvidence([
        {
          id: `task-${taskRecord.worker_id}`,
          senderName: taskRecord.worker_name,
          tag: "Task",
          timeLabel: formatTimeLabel(new Date()),
          text: `${taskRecord.worker_name} has no active task in ${taskRecord.zone}. Status: ${taskRecord.status}.`,
        },
      ]),
    };
  }

  return {
    title: "Task assignment",
    summary: `${taskRecord.worker_name} is assigned ${taskRecord.task} in ${taskRecord.zone}. Status: ${taskRecord.status}. Progress: ${taskRecord.progress}%.`,
    evidence: buildStructuredEvidence([
      {
        id: `task-${taskRecord.worker_id}`,
        senderName: taskRecord.worker_name,
        tag: "Task",
        timeLabel: formatTimeLabel(taskRecord.updated_at || new Date()),
        text: `${taskRecord.worker_name} is assigned ${taskRecord.task} in ${taskRecord.zone}. Status: ${taskRecord.status}. Progress: ${taskRecord.progress}%.`,
      },
    ]),
  };
}

async function saveChatExtraction(messageId, extracted) {
  await getPool().query(
    `
      INSERT INTO chat_message_extractions (message_id, extracted, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (message_id) DO UPDATE
      SET
        extracted = EXCLUDED.extracted,
        updated_at = NOW()
    `,
    [messageId, JSON.stringify(extracted || {})]
  );
}

async function getChatExtraction(messageId) {
  const result = await getPool().query(
    `
      SELECT extracted
      FROM chat_message_extractions
      WHERE message_id = $1
      LIMIT 1
    `,
    [messageId]
  );

  return result.rows[0]?.extracted || null;
}

export async function processChatMessageIntelligence(user, message) {
  await ensureSchema();

  const existing = await getChatExtraction(message.id);
  if (existing) {
    return existing;
  }

  const text = String(message?.text || "").trim();
  const normalizedText = normalizeLooseText(text);
  const extracted = {
    messageId: message.id,
    zone: null,
    actions: [],
  };

  if (!text) {
    await saveChatExtraction(message.id, extracted);
    return extracted;
  }

  const defaultZone = await getDefaultZoneForUser(user);
  const resolvedZone = detectZoneFromText(text, defaultZone);
  extracted.zone = resolvedZone;

  const workers = await getScopedWorkersForUser(user);
  const mentionedWorker = findMentionedWorker(text, workers);
  const attendance = parseAttendanceFromText(text);
  const visitorCount = parseVisitorCountFromText(text);
  const progress = parseProgressFromText(text);
  const status = inferTaskStatusFromText(text);
  const dailyWage = parseDailyWageFromText(text);
  const salaryStatus = parseSalaryStatusFromText(text);
  const paymentMode = parsePaymentModeFromText(text);
  const taskTitle = parseTaskTitleFromText(text);

  if (Number.isFinite(visitorCount)) {
    const event = await createVisitorEvent({
      reporterId: user.id,
      reporterName: user.name || user.email,
      zone: resolvedZone,
      visitorCount,
      note: text,
      imageUrl: message.imageUrl,
    });

    extracted.actions.push({
      type: "visitor_event",
      zone: resolvedZone,
      visitorCount,
      eventId: event.id,
    });
  }

  const shouldUpdateAttendance =
    attendance &&
    (user.role === "Worker" ||
      Boolean(mentionedWorker) ||
      /\battendance|check in|checked in|present|late|absent\b/.test(normalizedText));

  if (shouldUpdateAttendance) {
    const targetWorkerId =
      user.role === "Worker"
        ? user.workerId || user.id
        : mentionedWorker?.id || null;

    if (targetWorkerId) {
      const updatedWorker = await updateWorkerTask({
        workerId: targetWorkerId,
        attendance,
        actorName: user.name || user.email,
        actorRole: user.role,
      });

      extracted.actions.push({
        type: "attendance",
        workerId: targetWorkerId,
        attendance,
        zone: updatedWorker.zone,
      });
    }
  }

  const shouldUpdateProgress =
    (Number.isFinite(progress) || status || taskTitle || Number.isFinite(dailyWage) || salaryStatus || paymentMode) &&
    (user.role === "Worker" ||
      Boolean(mentionedWorker) ||
      /\btask|progress|complete|done|review|salary|wage|payroll|payment|assign(?:ed)?\b/.test(normalizedText));

  if (shouldUpdateProgress) {
    const targetWorkerId =
      user.role === "Worker"
        ? user.workerId || user.id
        : mentionedWorker?.id || null;

    if (targetWorkerId) {
      const updatedWorker = await updateWorkerTask({
        workerId: targetWorkerId,
        task: taskTitle || undefined,
        progress: Number.isFinite(progress) ? progress : undefined,
        status: status || undefined,
        dailyWage: Number.isFinite(dailyWage) ? dailyWage : undefined,
        salaryStatus: salaryStatus || undefined,
        paymentMode: paymentMode || undefined,
        actorName: user.name || user.email,
        actorRole: user.role,
      });

      extracted.actions.push({
        type: "task_update",
        workerId: targetWorkerId,
        task: taskTitle || updatedWorker.task,
        progress: Number.isFinite(progress) ? progress : updatedWorker.progress,
        status: status || updatedWorker.status,
        dailyWage: Number.isFinite(dailyWage) ? dailyWage : updatedWorker.daily_wage,
        salaryStatus: salaryStatus || updatedWorker.salary_status,
        paymentMode: paymentMode || updatedWorker.payment_mode,
      });
    }
  }

  if (shouldCreateAlertFromText(text)) {
    const alert = await createAlert({
      createdBy: user.id,
      zone: resolvedZone,
      severity: inferAlertSeverity(text),
      title: buildAlertTitle(text),
      detail: text,
    });

    extracted.actions.push({
      type: "alert",
      alertId: alert.id,
      zone: resolvedZone,
      severity: alert.severity,
    });
  }

  await saveChatExtraction(message.id, extracted);
  return extracted;
}

export async function createVisitorEvent({
  reporterId,
  reporterName,
  zone,
  visitorCount,
  note,
  imageUrl,
}) {
  await ensureSchema();

  const id = crypto.randomUUID();
  const normalizedZone = String(zone || "").trim();
  const normalizedNote = String(note || "").trim();
  const normalizedImageUrl = String(imageUrl || "").trim() || null;
  const count = Number.parseInt(visitorCount, 10);

  if (!normalizedZone || !normalizedNote || Number.isNaN(count)) {
    throw new Error("Zone, visitor count, and note are required.");
  }

  const result = await getPool().query(
    `
      INSERT INTO visitor_events (id, reporter_id, reporter_name, zone, visitor_count, note, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, zone, visitor_count, note, reporter_name, image_url, created_at
    `,
    [id, reporterId, reporterName, normalizedZone, count, normalizedNote, normalizedImageUrl]
  );

  await getPool().query(
    `
      INSERT INTO activity_logs (time_label, person, tag, text)
      VALUES ($1, $2, 'Visitor entry', $3)
    `,
    [formatTimeLabel(new Date()), reporterName, `${count} visitors logged in ${normalizedZone}.`]
  );

  if (count >= 8) {
    await createAlert({
      createdBy: reporterId,
      zone: normalizedZone,
      severity: "high",
      title: "Visitor density spike",
      detail: `${count} visitors were logged in ${normalizedZone}.`,
    });
  }

  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("visitor_events", {
      id: row.id,
      reporterName: row.reporter_name,
      zone: row.zone,
      visitorCount: row.visitor_count,
      note: row.note,
    });
  }

  return toVisitorEvent({
    ...row,
    visitor_count: row.visitor_count,
    reporter_name: row.reporter_name,
    image_url: row.image_url,
  });
}

export async function createAlert({ createdBy, zone, severity, title, detail }) {
  await ensureSchema();

  const id = crypto.randomUUID();
  const result = await getPool().query(
    `
      INSERT INTO alerts (id, created_by, zone, severity, title, detail)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, zone, severity, title, detail, created_at, resolved_at
    `,
    [id, createdBy, zone, severity, title, detail]
  );

  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("alerts", {
      id: row.id,
      zone: row.zone,
      severity: row.severity,
      title: row.title,
      detail: row.detail,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    });
  }
  return toAlert(row);
}

function getNowIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function getISTHourMinute() {
  const now = getNowIST();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

async function autoMarkAbsentWorkers() {
  const { hour, minute } = getISTHourMinute();
  const todayKey = getNowIST().toISOString().slice(0, 10);

  if (global._florisightDb.lastAutoAbsentRunDate === todayKey) {
    return;
  }

  if (hour < 9 || (hour === 9 && minute < 5)) {
    return;
  }

  global._florisightDb.lastAutoAbsentRunDate = todayKey;

  const result = await getPool().query(
    `
      UPDATE workers
      SET attendance = 'Absent',
          attendance_marked_at = NOW()
      WHERE attendance = 'Not marked'
      RETURNING user_id
    `
  );

  if (result.rows.length > 0) {
    await getPool().query(
      `
        INSERT INTO activity_logs (time_label, person, tag, text)
        VALUES ($1, $2, $3, $4)
      `,
      [
        formatTimeLabel(new Date()),
        "System",
        "Attendance",
        `Auto-marked ${result.rows.length} worker(s) as Absent (no check-in by 9:05 AM).`,
      ]
    );
  }
}

export function clearDailyResetCache() {
  global._florisightDb.lastDailyResetDate = null;
}

async function resetDailyAttendance() {
  const now = getNowIST();
  const todayKey = now.toISOString().slice(0, 10);

  if (global._florisightDb.lastDailyResetDate === todayKey) {
    return;
  }

  global._florisightDb.lastDailyResetDate = todayKey;
  global._florisightDb.lastAutoAbsentRunDate = null;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
        UPDATE workers
        SET attendance = 'Not marked',
            attendance_marked_at = NULL,
            task = 'No active assignment',
            status = 'Ready',
            progress = 0,
            zone = 'Not assigned',
            logs_today = 0
      `
    );

    await client.query(
      `
        INSERT INTO activity_logs (time_label, person, tag, text)
        VALUES ($1, $2, $3, $4)
      `,
      [
        formatTimeLabel(new Date()),
        "System",
        "Daily Reset",
        `Auto-reset daily attendance and task assignments for ${todayKey}.`,
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to run daily reset:", error);
    global._florisightDb.lastDailyResetDate = null;
    return;
  } finally {
    client.release();
  }

  // Update workforce task embeddings to keep AI/RAG search updated
  try {
    const workersResult = await getPool().query("SELECT user_id FROM workers");
    for (const row of workersResult.rows) {
      await upsertWorkforceTaskEmbeddingForWorker(row.user_id);
    }
  } catch (error) {
    console.error("Failed to update task embeddings during daily reset:", error);
  }
}

let lastMonthlyResetMonth = null;

export function clearMonthlyResetCache() {
  lastMonthlyResetMonth = null;
}

async function resetMonthlyPayroll() {
  const now = getNowIST();
  const currentMonth = now.toISOString().slice(0, 7);

  if (lastMonthlyResetMonth === currentMonth) {
    return;
  }

  const pool = getPool();
  try {
    const logCheck = await pool.query(
      `SELECT 1 FROM activity_logs WHERE tag = 'Monthly Reset' AND text LIKE $1 LIMIT 1`,
      [`%${currentMonth}%`]
    );

    if (logCheck.rows.length > 0) {
      lastMonthlyResetMonth = currentMonth;
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`
        UPDATE workers
        SET salary_status = 'Not recorded',
            payment_amount = NULL,
            payment_txn_id = NULL,
            payment_date = NULL
      `);

      await client.query(`
        INSERT INTO activity_logs (time_label, person, tag, text)
        VALUES ($1, $2, $3, $4)
      `, [
        formatTimeLabel(now),
        "System",
        "Monthly Reset",
        `Auto-reset monthly payroll for all workers for ${currentMonth}.`
      ]);

      const workersResult = await client.query(`SELECT user_id FROM workers`);
      for (const row of workersResult.rows) {
        const resetRecord = await getWorkforcePaymentRagRow(row.user_id, client);
        if (resetRecord) {
          await upsertWorkforcePaymentEmbedding(client, resetRecord);
        }
      }

      await client.query("COMMIT");
      lastMonthlyResetMonth = currentMonth;
      console.log(`Monthly payroll reset completed for ${currentMonth}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Monthly payroll reset failed, rolled back:", err);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Failed checking monthly reset log:", err);
  }
}

export async function updateWorkerTask({
  workerId,
  task,
  status,
  progress,
  zone,
  attendance,
  salaryStatus,
  dailyWage,
  paymentMode,
  paymentAmount,
  paymentTxnId,
  paymentDate,
  actorName,
  actorRole,
  previousAttendance,
}) {
  await ensureSchema();

  let resolvedAttendance = attendance || null;
  if (resolvedAttendance === "Present" || resolvedAttendance === "Late") {
    const { hour, minute } = getISTHourMinute();
    const totalMinutes = hour * 60 + minute;
    if (totalMinutes >= 9 * 60 + 30) {
      resolvedAttendance = "Late";
    }
  }

  const isAttendanceChange = resolvedAttendance && resolvedAttendance !== previousAttendance;

  const result = await getPool().query(
    `
      UPDATE workers
      SET
        task = COALESCE($2, task),
        status = COALESCE($3, status),
        progress = COALESCE($4, progress),
        zone = COALESCE($5, zone),
        attendance = COALESCE($6, attendance),
        salary_status = COALESCE($7, salary_status),
        daily_wage = COALESCE($8, daily_wage),
        payment_mode = COALESCE($9, payment_mode),
        payment_amount = COALESCE($10, payment_amount),
        payment_txn_id = COALESCE($11, payment_txn_id),
        payment_date = COALESCE($12, payment_date),
        attendance_marked_at = CASE WHEN $6 IS NOT NULL AND $6 != attendance THEN NOW() ELSE attendance_marked_at END
      WHERE user_id = $1
      RETURNING user_id, supervisor_id, zone, task, status, progress, attendance, logs_today, salary_status, daily_wage, payment_mode, payment_amount, payment_txn_id, payment_date
    `,
    [
      workerId,
      task || null,
      status || null,
      Number.isFinite(progress) ? progress : null,
      zone || null,
      resolvedAttendance,
      salaryStatus || null,
      Number.isFinite(dailyWage) ? dailyWage : null,
      paymentMode || null,
      Number.isFinite(paymentAmount) ? paymentAmount : null,
      paymentTxnId || null,
      paymentDate || null,
    ]
  );

  if (!result.rows[0]) {
    throw new Error("Worker not found.");
  }

  const hasPayment = Number.isFinite(Number(paymentAmount)) && Number(paymentAmount) > 0;
  const logTag = hasPayment
    ? "Payment"
    : resolvedAttendance && resolvedAttendance !== previousAttendance
    ? "Attendance"
    : "Task update";
  const logText = hasPayment
    ? `${actorName} recorded a payment of ${formatCurrency(paymentAmount)} via ${paymentMode || "unknown method"} for ${workerId}.`
    : resolvedAttendance && resolvedAttendance !== previousAttendance
    ? `${actorName} marked attendance as ${resolvedAttendance} for ${workerId}.`
    : `Updated assignment for ${workerId}.`;

  await getPool().query(
    `
      INSERT INTO activity_logs (time_label, person, tag, text)
      VALUES ($1, $2, $3, $4)
    `,
    [formatTimeLabel(new Date()), actorName, logTag, logText]
  );

  const workerRow = result.rows[0];
  const shouldCreateNotification = actorRole !== "Worker";

  // Create a task notification so the worker sees it on their dashboard
  if (shouldCreateNotification) {
    try {
      await getPool().query(
        `
          INSERT INTO task_notifications (worker_id, assigned_by, task, status, zone)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          workerId,
          actorName || "System",
          task || workerRow?.task || "Updated assignment",
          status || workerRow?.status || "Ready",
          zone || workerRow?.zone || "",
        ]
      );
    } catch (_notifError) {
      // Non-fatal: notification failure should not block the task update
    }
  }

  await upsertWorkforcePaymentEmbeddingForWorker(workerId);

  return workerRow;
}

export async function getTaskNotificationsForWorker(workerId) {
  await ensureSchema();

  const result = await getPool().query(
    `
      SELECT id, worker_id, assigned_by, task, status, zone, created_at
      FROM task_notifications
      WHERE worker_id = $1
        AND dismissed = FALSE
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [workerId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    workerId: row.worker_id,
    assignedBy: row.assigned_by,
    task: row.task,
    status: row.status,
    zone: row.zone,
    createdAt: row.created_at,
  }));
}

export async function dismissTaskNotification(notificationId, workerId) {
  await ensureSchema();

  await getPool().query(
    `
      UPDATE task_notifications
      SET dismissed = TRUE
      WHERE id = $1
        AND worker_id = $2
    `,
    [notificationId, workerId]
  );
}

export async function getWorkerRecord(workerId) {
  await ensureSchema();

  const result = await getPool().query(
    `
      SELECT user_id, supervisor_id, zone, task, status, progress, attendance, logs_today, salary_status, daily_wage, payment_mode, payment_amount, payment_txn_id, payment_date
      FROM workers
      WHERE user_id = $1
      LIMIT 1
    `,
    [workerId]
  );

  return result.rows[0] || null;
}

export async function createCrop({ name, variety, zone, quantity, growthStage, healthStatus, plantedDate, expectedHarvest, notes, createdBy, bed, cost, price, batchCode }) {
  await ensureSchema();
  const result = await getPool().query(
    `
      INSERT INTO crops (name, variety, zone, quantity, growth_stage, health_status, planted_date, expected_harvest, notes, created_by, bed, cost, price, batch_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, name, variety, zone, quantity, growth_stage, health_status, planted_date, expected_harvest, notes, bed, cost, price, batch_code, created_at, updated_at
    `,
    [
      name,
      variety || null,
      zone || 'Not assigned',
      Number.isFinite(quantity) ? quantity : 0,
      growthStage || 'Seedling',
      healthStatus || 'Healthy',
      plantedDate || null,
      expectedHarvest || null,
      notes || null,
      createdBy || null,
      bed || null,
      cost != null ? Number(cost) : null,
      price != null ? Number(price) : null,
      batchCode || null
    ]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("crops", {
      id: row.id,
      name: row.name,
      variety: row.variety,
      zone: row.zone,
      quantity: row.quantity,
      growthStage: row.growth_stage,
      healthStatus: row.health_status,
      plantedDate: row.planted_date,
      expectedHarvest: row.expected_harvest,
      notes: row.notes,
      bed: row.bed,
      cost: row.cost,
      price: row.price,
      batchCode: row.batch_code,
    });
  }
  return row;
}

export async function updateCrop(id, { name, variety, zone, quantity, growthStage, healthStatus, plantedDate, expectedHarvest, notes, bed, cost, price, batchCode }) {
  await ensureSchema();
  const result = await getPool().query(
    `
      UPDATE crops
      SET
        name = COALESCE($2, name),
        variety = COALESCE($3, variety),
        zone = COALESCE($4, zone),
        quantity = COALESCE($5, quantity),
        growth_stage = COALESCE($6, growth_stage),
        health_status = COALESCE($7, health_status),
        planted_date = COALESCE($8, planted_date),
        expected_harvest = COALESCE($9, expected_harvest),
        notes = COALESCE($10, notes),
        bed = COALESCE($11, bed),
        cost = COALESCE($12, cost),
        price = COALESCE($13, price),
        batch_code = COALESCE($14, batch_code),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, variety, zone, quantity, growth_stage, health_status, planted_date, expected_harvest, notes, bed, cost, price, batch_code, created_at, updated_at
    `,
    [
      id,
      name || null,
      variety || null,
      zone || null,
      Number.isFinite(quantity) ? quantity : null,
      growthStage || null,
      healthStatus || null,
      plantedDate || null,
      expectedHarvest || null,
      notes || null,
      bed === undefined ? null : bed,
      cost === undefined ? null : (cost != null ? Number(cost) : null),
      price === undefined ? null : (price != null ? Number(price) : null),
      batchCode === undefined ? null : batchCode
    ]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("crops", {
      id: row.id,
      name: row.name,
      variety: row.variety,
      zone: row.zone,
      quantity: row.quantity,
      growthStage: row.growth_stage,
      healthStatus: row.health_status,
      plantedDate: row.planted_date,
      expectedHarvest: row.expected_harvest,
      notes: row.notes,
      bed: row.bed,
      cost: row.cost,
      price: row.price,
      batchCode: row.batch_code,
    });
  }
  return row || null;
}

export async function deleteCrop(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM crops WHERE id = $1`, [id]);
}

export async function getCrops({ zone } = {}) {
  await ensureSchema();
  const where = zone ? "WHERE zone = $1" : "";
  const values = zone ? [zone] : [];
  const result = await getPool().query(
    `
      SELECT id, name, variety, zone, quantity, growth_stage, health_status, planted_date, expected_harvest, notes, bed, cost, price, batch_code, created_at, updated_at
      FROM crops
      ${where}
      ORDER BY created_at DESC
    `,
    values
  );
  return result.rows;
}

export async function createLeaveRequest({ workerId, workerName, supervisorId, startDate, endDate, reason, leaveType }) {
  await ensureSchema();
  const result = await getPool().query(
    `
      INSERT INTO leave_requests (worker_id, worker_name, supervisor_id, start_date, end_date, reason, leave_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, worker_id, worker_name, supervisor_id, start_date, end_date, reason, leave_type, status, reviewed_by, reviewed_at, created_at
    `,
    [workerId, workerName, supervisorId || null, startDate, endDate, reason, leaveType || 'Sick']
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("leave_requests", {
      id: row.id,
      workerName: row.worker_name,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
    });
  }
  return row;
}

export async function reviewLeaveRequest({ requestId, status, reviewedBy }) {
  await ensureSchema();
  const result = await getPool().query(
    `
      UPDATE leave_requests
      SET status = $2, reviewed_by = $3, reviewed_at = NOW()
      WHERE id = $1
      RETURNING id, worker_id, worker_name, supervisor_id, start_date, end_date, reason, leave_type, status, reviewed_by, reviewed_at, created_at
    `,
    [requestId, status, reviewedBy]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("leave_requests", {
      id: row.id,
      workerName: row.worker_name,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
    });
  }
  return row || null;
}

export async function getLeaveRequestsForWorker(workerId) {
  await ensureSchema();
  const result = await getPool().query(
    `
      SELECT id, worker_id, worker_name, supervisor_id, start_date, end_date, reason, leave_type, status, reviewed_by, reviewed_at, created_at
      FROM leave_requests
      WHERE worker_id = $1
      ORDER BY created_at DESC
    `,
    [workerId]
  );
  return result.rows;
}

export async function getLeaveRequestsForSupervisor(supervisorId) {
  await ensureSchema();
  const result = await getPool().query(
    `
      SELECT lr.id, lr.worker_id, lr.worker_name, lr.supervisor_id, lr.start_date, lr.end_date, lr.reason, lr.leave_type, lr.status, lr.reviewed_by, lr.reviewed_at, lr.created_at,
             u.name AS reviewer_name
      FROM leave_requests lr
      LEFT JOIN users u ON u.id = lr.reviewed_by
      WHERE lr.supervisor_id = $1
      ORDER BY lr.created_at DESC
    `,
    [supervisorId]
  );
  return result.rows;
}

export async function createEquipment({ name, type, zone, status, purchaseDate, lastServiceDate, nextServiceDate, notes, createdBy }) {
  await ensureSchema();
  const result = await getPool().query(
    `
      INSERT INTO equipment (name, type, zone, status, purchase_date, last_service_date, next_service_date, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, name, type, zone, status, purchase_date, last_service_date, next_service_date, notes, created_at, updated_at
    `,
    [name, type || 'General', zone || 'Not assigned', status || 'Operational', purchaseDate || null, lastServiceDate || null, nextServiceDate || null, notes || null, createdBy || null]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("equipment", {
      id: row.id,
      name: row.name,
      category: row.type,
      zone: row.zone,
      status: row.status,
      purchaseDate: row.purchase_date,
      lastServiceDate: row.last_service_date,
      notes: row.notes,
    });
  }
  return row;
}

export async function updateEquipment(id, { name, type, zone, status, purchaseDate, lastServiceDate, nextServiceDate, notes }) {
  await ensureSchema();
  const result = await getPool().query(
    `
      UPDATE equipment
      SET
        name = COALESCE($2, name),
        type = COALESCE($3, type),
        zone = COALESCE($4, zone),
        status = COALESCE($5, status),
        purchase_date = COALESCE($6, purchase_date),
        last_service_date = COALESCE($7, last_service_date),
        next_service_date = COALESCE($8, next_service_date),
        notes = COALESCE($9, notes),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, type, zone, status, purchase_date, last_service_date, next_service_date, notes, created_at, updated_at
    `,
    [id, name || null, type || null, zone || null, status || null, purchaseDate || null, lastServiceDate || null, nextServiceDate || null, notes || null]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("equipment", {
      id: row.id,
      name: row.name,
      category: row.type,
      zone: row.zone,
      status: row.status,
      purchaseDate: row.purchase_date,
      lastServiceDate: row.last_service_date,
      notes: row.notes,
    });
  }
  return row || null;
}

export async function deleteEquipment(id) {
  await ensureSchema();
  await getPool().query(`DELETE FROM equipment WHERE id = $1`, [id]);
}

export async function getEquipment() {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, name, type, zone, status, purchase_date, last_service_date, next_service_date, notes, created_at, updated_at FROM equipment ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function createMaintenanceLog({ equipmentId, serviceType, description, cost, performedBy, performedDate, nextDueDate }) {
  await ensureSchema();
  const result = await getPool().query(
    `
      INSERT INTO maintenance_logs (equipment_id, service_type, description, cost, performed_by, performed_date, next_due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, equipment_id, service_type, description, cost, performed_by, performed_date, next_due_date, created_at
    `,
    [equipmentId, serviceType || 'Routine', description || null, Number.isFinite(cost) ? cost : null, performedBy || null, performedDate || new Date().toISOString().slice(0,10), nextDueDate || null]
  );
  return result.rows[0];
}

export async function getMaintenanceLogs(equipmentId) {
  await ensureSchema();
  const result = await getPool().query(
    `SELECT id, equipment_id, service_type, description, cost, performed_by, performed_date, next_due_date, created_at FROM maintenance_logs WHERE equipment_id = $1 ORDER BY performed_date DESC`,
    [equipmentId]
  );
  return result.rows;
}

export async function getDatabaseViewerData() {
  await ensureSchema();

  const tableNames = [
    "users",
    "supervisors",
    "workers",
    "visitor_events",
    "video_analyses",
    "alerts",
    "leave_requests",
    "equipment",
  ];

  const countResults = await Promise.all(
    tableNames.map((tableName) =>
      getPool().query(`SELECT COUNT(*)::int AS count FROM ${tableName}`)
    )
  );

  const previews = await Promise.all([
    getPool().query(`
      SELECT id, name, email, role, supervisor_id, phone_number, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 12
    `),
    getPool().query(`
      SELECT id, zone, visitor_count, note, reporter_name, created_at
      FROM visitor_events
      ORDER BY created_at DESC
      LIMIT 12
    `),
    getPool().query(`
      SELECT id, zone, status, visitor_count, unique_tracks, uploaded_by_name, created_at
      FROM video_analyses
      ORDER BY created_at DESC
      LIMIT 12
    `),
    getPool().query(`
      SELECT id, zone, severity, title, detail, created_at, resolved_at
      FROM alerts
      ORDER BY created_at DESC
      LIMIT 12
    `),
  ]);

  return {
    tableStats: tableNames.map((name, index) => ({
      name,
      count: countResults[index].rows[0]?.count || 0,
    })),
    previews: {
      users: previews[0].rows,
      visitorEvents: previews[1].rows,
      videoAnalyses: previews[2].rows,
      alerts: previews[3].rows,
    },
  };
}

export async function getDashboardData(user) {
  await ensureSchema();
  await resetDailyAttendance();
  await autoMarkAbsentWorkers();
  await resetMonthlyPayroll();
  const messageState = await getMessageState(user.id);
  const localLlm = getLocalLlmStatus();
  const pgvectorEnabled = await detectPgvector();

  const taskNotifications =
    user.role === "Worker"
      ? await getTaskNotificationsForWorker(user.workerId || user.id)
      : [];

  const [
    usersResult,
    supervisorsResult,
    workersResult,
    logsResult,
    chatMessages,
    visitorEventsResult,
    alertsResult,
    unreadMessageCount,
    videoAnalysesResult,
    chatGroupsResult,
    cropsResult,
    leaveRequestsResult,
    equipmentResult,
    maintenanceResult,
    salesResult,
    invoicesResult,
    expensesResult,
    ordersResult,
    forecastsResult,
    suppliesResult,
  ] = await Promise.all([
    getPool().query("SELECT id, name, email, role, supervisor_id FROM users ORDER BY created_at ASC"),
    getPool().query(`
      SELECT
        s.user_id AS id,
        u.name,
        u.email,
        s.zone,
        s.active_tasks,
        s.completed_today,
        s.visitor_logs,
        s.alerts,
        s.performance,
        COUNT(w.user_id)::int AS workers
      FROM supervisors s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN workers w ON w.supervisor_id = s.user_id
      GROUP BY s.user_id, u.name, u.email, s.zone, s.active_tasks, s.completed_today, s.visitor_logs, s.alerts, s.performance
      ORDER BY u.name ASC
    `),
    getPool().query(`
      SELECT
        w.user_id AS id,
        w.supervisor_id,
        u.name,
        u.email,
        w.zone,
        w.task,
        w.status,
        w.progress,
        w.attendance,
        w.logs_today,
        w.salary_status,
        w.daily_wage,
        w.payment_mode,
        w.payment_amount,
        w.payment_txn_id,
        w.payment_date
      FROM workers w
      JOIN users u ON u.id = w.user_id
      ORDER BY u.name ASC
    `),
    getPool().query(`
      SELECT time_label, person, tag, text, created_at
      FROM activity_logs
      ORDER BY created_at DESC, id DESC
      LIMIT 12
    `),
    getChatMessagesForUser(user),
    getPool().query(`
      SELECT id, zone, visitor_count, note, reporter_name, image_url, created_at
      FROM visitor_events
      ORDER BY created_at DESC
      LIMIT 20
    `),
    getPool().query(`
      SELECT id, zone, severity, title, detail, created_at, resolved_at, acknowledged_at
      FROM alerts
      ORDER BY created_at DESC
      LIMIT 100
    `),
    getUnreadMessageCount(user, messageState.lastReadAt),
    getPool().query(`
      SELECT id, uploaded_by, uploaded_by_name, zone, file_name, status, visitor_count, unique_tracks, summary_json, created_at
      FROM video_analyses
      ORDER BY created_at DESC
      LIMIT 12
    `),
    getPool().query(`
      SELECT cg.id, cg.name, cg.created_by, cg.created_at,
             COALESCE(json_agg(json_build_object('id', cgm.user_id, 'addedAt', cgm.added_at)), '[]'::json) as members
      FROM chat_groups cg
      JOIN chat_group_members cgm ON cgm.group_id = cg.id
      WHERE cg.id IN (SELECT group_id FROM chat_group_members WHERE user_id = $1)
      GROUP BY cg.id, cg.name, cg.created_by, cg.created_at
      ORDER BY cg.created_at DESC
    `, [user.id]),
    getPool().query(`
      SELECT id, name, variety, zone, quantity, growth_stage, health_status, planted_date, expected_harvest, notes, bed, cost, price, batch_code, created_at, updated_at
      FROM crops
      ORDER BY created_at DESC
      LIMIT 100
    `),
    user.role === "Worker"
      ? getPool().query(`
          SELECT id, worker_id, worker_name, supervisor_id, start_date, end_date, reason, leave_type, status, reviewed_by, reviewed_at, created_at
          FROM leave_requests
          WHERE worker_id = $1
          ORDER BY created_at DESC
          LIMIT 20
        `, [user.workerId || user.id])
      : user.role === "Supervisor"
      ? getPool().query(`
          SELECT lr.id, lr.worker_id, lr.worker_name, lr.supervisor_id, lr.start_date, lr.end_date, lr.reason, lr.leave_type, lr.status, lr.reviewed_by, lr.reviewed_at, lr.created_at,
                 u.name AS reviewer_name
          FROM leave_requests lr
          LEFT JOIN users u ON u.id = lr.reviewed_by
          WHERE lr.supervisor_id = $1
          ORDER BY lr.created_at DESC
          LIMIT 20
        `, [user.supervisorId || user.id])
      : getPool().query(`
          SELECT lr.id, lr.worker_id, lr.worker_name, lr.supervisor_id, lr.start_date, lr.end_date, lr.reason, lr.leave_type, lr.status, lr.reviewed_by, lr.reviewed_at, lr.created_at,
                 u.name AS reviewer_name
          FROM leave_requests lr
          LEFT JOIN users u ON u.id = lr.reviewed_by
          ORDER BY lr.created_at DESC
          LIMIT 20
        `),
    getPool().query(`
      SELECT id, name, type, zone, status, purchase_date, last_service_date, next_service_date, notes, created_at, updated_at
      FROM equipment
      ORDER BY created_at DESC
      LIMIT 100
    `),
    getPool().query(`
      SELECT id, equipment_id, service_type, description, cost, performed_by, performed_date, next_due_date, created_at
      FROM maintenance_logs
      ORDER BY performed_date DESC
      LIMIT 100
    `),
    getPool().query("SELECT id, plant_name, customer_name, quantity, unit_price, total_amount, status, sale_date, created_at FROM sales ORDER BY sale_date DESC, created_at DESC LIMIT 100"),
    getPool().query("SELECT id, customer_name, amount, status, due_date, created_at FROM invoices ORDER BY due_date ASC, created_at DESC"),
    getPool().query("SELECT id, description, category, payment_method, amount, expense_date, created_at FROM expenses ORDER BY expense_date DESC, created_at DESC LIMIT 100"),
    getPool().query("SELECT id, customer_name, company_name, order_date, delivery_date, status, payment_status, total_amount, created_at FROM orders ORDER BY order_date DESC, created_at DESC LIMIT 100"),
    getPool().query("SELECT id, month, plant_name, event, predicted_demand, confidence, action, created_at FROM seasonal_forecasts ORDER BY confidence DESC"),
    getPool().query("SELECT id, name, category, quantity, unit, reorder_level, cost, created_at, updated_at FROM supplies ORDER BY name ASC"),
  ]);

  const workers = workersResult.rows.map((row) => {
    const dailyWage = Number(row.daily_wage || 0);
    const earnedToday = Math.round(dailyWage * getAttendanceMultiplier(row.attendance));

    return {
      id: row.id,
      supervisorId: row.supervisor_id,
      name: row.name,
      email: row.email,
      zone: row.zone,
      task: row.task,
      status: row.status,
      progress: `${row.progress}%`,
      progressValue: row.progress,
      attendance: row.attendance,
      logsToday: row.logs_today,
      salaryStatus: row.salary_status,
      dailyWage,
      paymentMode: row.payment_mode,
      paymentAmount: row.payment_amount,
      paymentTxnId: row.payment_txn_id,
      paymentDate: row.payment_date,
      earnedToday,
      dailyWageLabel: formatCurrency(dailyWage),
      earnedTodayLabel: formatCurrency(earnedToday),
    };
  });

  const activityLogs = logsResult.rows.map((row) => ({
    timeLabel: row.time_label,
    person: row.person,
    tag: row.tag,
    text: row.text,
    createdAt: row.created_at,
  }));

  const visitorEvents = visitorEventsResult.rows.map((row) =>
    toVisitorEvent({
      ...row,
      visitor_count: row.visitor_count,
      reporter_name: row.reporter_name,
      image_url: row.image_url,
    })
  );

  const alerts = alertsResult.rows.map(toAlert);
  const totalRecentVisitors = visitorEvents.reduce((total, event) => total + event.count, 0);

  const supervisors = supervisorsResult.rows.map((row) => {
    const ownedWorkers = workers.filter((worker) => worker.supervisorId === row.id);
    const ownedZones = new Set(ownedWorkers.map((worker) => worker.zone));
    const averageProgress = ownedWorkers.length
      ? Math.round(
          ownedWorkers.reduce((total, worker) => total + Number(worker.progressValue || 0), 0) /
            ownedWorkers.length
        )
      : 0;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      zone: row.zone,
      workers: ownedWorkers.length,
      activeTasks: ownedWorkers.filter((worker) => worker.status !== "Done").length,
      completedToday: ownedWorkers.filter((worker) => worker.status === "Done").length,
      visitorLogs: visitorEvents
        .filter((event) => ownedZones.has(event.zone))
        .reduce((total, event) => total + event.count, 0),
      alerts: alerts.filter((alert) => ownedZones.has(alert.zone)).length,
      performance: `${averageProgress}%`,
    };
  });

  const zoneStats = [
    "Greenhouse A",
    "Packing Unit",
    "Visitor Gate",
    "Nursery Bay",
  ].map((zone) => {
    const workersInZone = workers.filter((worker) => worker.zone === zone).length;
    const recentVisitors = visitorEvents
      .filter((event) => event.zone === zone)
      .reduce((total, event) => total + event.count, 0);
    const activeAlerts = alerts.filter((alert) => alert.zone === zone).length;

    return {
      zone,
      workers: workersInZone,
      visitors: recentVisitors,
      alerts: activeAlerts,
      activityScore: workersInZone * 10 + recentVisitors,
    };
  });

  const admins = usersResult.rows
    .filter((row) => row.role === "Admin")
    .map((row) => ({ id: row.id, name: row.name, email: row.email, role: row.role }));

  const attendanceSummary = {
    present: workers.filter((worker) => worker.attendance === "Present").length,
    late: workers.filter((worker) => worker.attendance === "Late").length,
    absent: workers.filter((worker) => worker.attendance === "Absent").length,
    total: workers.length,
  };

  const wageSummary = {
    totalDailyWages: workers.reduce((total, worker) => total + worker.dailyWage, 0),
    totalEarnedToday: workers.reduce((total, worker) => total + worker.earnedToday, 0),
    recorded: workers.filter((worker) => worker.salaryStatus === "Recorded").length,
    pendingReview: workers.filter((worker) => worker.salaryStatus === "Pending review").length,
    notRecorded: workers.filter((worker) => worker.salaryStatus === "Not recorded").length,
  };

  const todayISTKey = getNowIST().toISOString().slice(0, 10);
  const paidTodayCount = workers.filter((w) => w.salaryStatus === "Recorded" && w.paymentDate && w.paymentDate.startsWith(todayISTKey)).length;
  const pendingTodayCount = workers.filter((w) => w.salaryStatus === "Pending review" && (w.attendance === "Present" || w.attendance === "Late")).length;
  const notRecordedTodayCount = workers.filter((w) => (w.attendance === "Present" || w.attendance === "Late") && w.salaryStatus !== "Recorded" && w.salaryStatus !== "Pending review").length;

  const topWorker = [...workers].sort((a, b) => (b.progressValue || 0) - (a.progressValue || 0))[0];
  const mostActiveZone =
    [...zoneStats].sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0))[0]?.zone ||
    "No active zone";
  const completedTasks = workers.filter((worker) => worker.status === "Done").length;
  const activeTasks = workers.filter((worker) => worker.status !== "Done").length;
  const totalLogsToday = workers.reduce((total, worker) => total + Number(worker.logsToday || 0), 0);
  const totalVisitorEntries = visitorEvents.reduce((total, event) => total + Number(event.count || 0), 0);
  const dailyReport = {
    title: "Daily operations report",
    headline: `${attendanceSummary.present}/${attendanceSummary.total} workers present, ${formatCurrency(
      wageSummary.totalEarnedToday
    )} earned today.`,
    summary: `This report summarizes attendance, task execution, visitor activity, alerts, tracking results, and wage status for the full day. ${mostActiveZone} was the busiest zone in the latest update.`,
    bullets: [
      `${attendanceSummary.present} present, ${attendanceSummary.late} late, ${attendanceSummary.absent} absent across the workforce.`,
      `${paidTodayCount} salary records were cleared today, ${pendingTodayCount} are pending review today, and ${notRecordedTodayCount} are not recorded yet.`,
      topWorker
        ? `${topWorker.name} is leading progress at ${topWorker.progress} in ${topWorker.zone}.`
        : "No worker progress data is available yet.",
      `${alerts.length} active alerts and ${visitorEvents.length} recent visitor entries are included in this brief.`,
    ],
    sections: [
      {
        title: "Task execution",
        text: `${completedTasks} assignments were completed while ${activeTasks} remain active, pending, or under review. ${totalLogsToday} worker updates were logged into the system across the day.`,
      },
      {
        title: "Attendance and payroll",
        text: `${attendanceSummary.present} workers were present today, and ${formatCurrency(
          wageSummary.totalEarnedToday
        )} has been earned so far from ${formatCurrency(wageSummary.totalDailyWages)} in tracked daily wage commitments.`,
      },
      {
        title: "Movement, alerts, and tracking",
        text: `${totalVisitorEntries} visitors were recorded across ${visitorEvents.length} visitor events, ${alerts.length} unresolved alerts remain active, and ${videoAnalysesResult.rows.length} video analysis records are stored for retrieval and review.`,
      },
      {
        title: "Team communication",
        text: `${chatMessages.length} chat updates were captured through the day so supervisors and admins can review field coordination, task updates, and incident follow-ups in one place.`,
      },
    ],
    sources: {
      workers: workers.length,
      visitorEvents: visitorEvents.length,
      alerts: alerts.length,
      chatMessages: chatMessages.length,
      videoAnalyses: videoAnalysesResult.rows.length,
      vectorEntries: chatMessages.length,
    },
    generatedAt: new Date().toISOString(),
  };

  const scopedData = applyRoleScopeToDashboardData(user, {
    currentUser: user,
    users: usersResult.rows.map(row => ({ id: row.id, name: row.name, role: row.role, email: row.email })),
    admins,
    supervisors,
    workers,
    activityLogs,
    chatMessages,
    visitorEvents,
    alerts,
    zoneStats,
    customGroups: chatGroupsResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      members: row.members
    })),
    attendanceSummary,
    wageSummary: {
      ...wageSummary,
      totalDailyWagesLabel: formatCurrency(wageSummary.totalDailyWages),
      totalEarnedTodayLabel: formatCurrency(wageSummary.totalEarnedToday),
    },
    dailyReport,
    unreadMessageCount,
    messageState,
    videoAnalyses: videoAnalysesResult.rows.map(toTrackingAnalysis),
    taskNotifications,
    systemCapabilities: {
      localLlm,
      pgvectorEnabled,
      textToSqlEnabled: true,
      autoExtractionEnabled: true,
      trackingPipeline: "YOLOv8 + DeepSORT",
      storage: {
        relational: "PostgreSQL",
        vector: pgvectorEnabled ? "pgvector" : "JSON embeddings fallback",
      },
    },
    crops: cropsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      variety: row.variety,
      zone: row.zone,
      quantity: row.quantity,
      growthStage: row.growth_stage,
      healthStatus: row.health_status,
      plantedDate: row.planted_date,
      expectedHarvest: row.expected_harvest,
      notes: row.notes,
      bed: row.bed,
      cost: row.cost,
      price: row.price,
      batchCode: row.batch_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    leaveRequests: leaveRequestsResult.rows.map((row) => ({
      id: row.id,
      workerId: row.worker_id,
      workerName: row.worker_name,
      supervisorId: row.supervisor_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      leaveType: row.leave_type,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewerName: row.reviewer_name,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    })),
    equipment: equipmentResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      zone: row.zone,
      status: row.status,
      purchaseDate: row.purchase_date,
      lastServiceDate: row.last_service_date,
      nextServiceDate: row.next_service_date,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    maintenanceLogs: maintenanceResult.rows.map((row) => ({
      id: row.id,
      equipmentId: row.equipment_id,
      serviceType: row.service_type,
      description: row.description,
      cost: row.cost,
      performedBy: row.performed_by,
      performedDate: row.performed_date,
      nextDueDate: row.next_due_date,
      createdAt: row.created_at,
    })),
    sales: salesResult.rows.map((row) => ({
      id: row.id,
      plantName: row.plant_name,
      customerName: row.customer_name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      totalAmount: row.total_amount,
      status: row.status,
      saleDate: row.sale_date,
      createdAt: row.created_at,
    })),
    invoices: invoicesResult.rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      amount: row.amount,
      status: row.status,
      dueDate: row.due_date,
      createdAt: row.created_at,
    })),
    expenses: expensesResult.rows.map((row) => ({
      id: row.id,
      description: row.description,
      category: row.category,
      paymentMethod: row.payment_method,
      amount: row.amount,
      expenseDate: row.expense_date,
      createdAt: row.created_at,
    })),
    orders: ordersResult.rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      companyName: row.company_name,
      orderDate: row.order_date,
      deliveryDate: row.delivery_date,
      status: row.status,
      paymentStatus: row.payment_status,
      totalAmount: row.total_amount,
      createdAt: row.created_at,
    })),
    seasonalForecasts: forecastsResult.rows.map((row) => ({
      id: row.id,
      month: row.month,
      plantName: row.plant_name,
      event: row.event,
      predictedDemand: row.predicted_demand,
      confidence: row.confidence,
      action: row.action,
      createdAt: row.created_at,
    })),
    supplies: suppliesResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: row.quantity,
      unit: row.unit,
      reorderLevel: row.reorder_level,
      cost: row.cost,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    metrics: [
      { label: "Admins", value: String(admins.length), detail: "Project administrators" },
      { label: "Supervisors", value: String(supervisors.length), detail: "Active farm leads" },
      { label: "Workers", value: String(workers.length), detail: "Registered field team" },
      {
        label: "Visitors tracked",
        value: String(totalRecentVisitors),
        detail: "Live visitor count from PostgreSQL",
      },
    ],
  });

  return scopedData;
}

function buildStructuredEvidence(items = []) {
  return items
    .filter(Boolean)
    .slice(0, 4)
    .map((item, index) => ({
      id: item.id || `structured-${index}`,
      senderName: item.senderName || "System",
      tag: item.tag || "SQL",
      timeLabel: item.timeLabel || formatTimeLabel(new Date()),
      text: item.text || "",
      score: 1,
    }));
}

function applyRoleScopeToDashboardData(user, data) {
  function buildScopedShape(base) {
    const attendanceSummary = {
      present: base.workers.filter((worker) => worker.attendance === "Present").length,
      late: base.workers.filter((worker) => worker.attendance === "Late").length,
      absent: base.workers.filter((worker) => worker.attendance === "Absent").length,
      total: base.workers.length,
    };
    const wageSummary = {
      totalDailyWages: base.workers.reduce((sum, worker) => sum + Number(worker.dailyWage || 0), 0),
      totalEarnedToday: base.workers.reduce((sum, worker) => sum + Number(worker.earnedToday || 0), 0),
      recorded: base.workers.filter((worker) => worker.salaryStatus === "Recorded").length,
      pendingReview: base.workers.filter((worker) => worker.salaryStatus === "Pending review").length,
      notRecorded: base.workers.filter((worker) => worker.salaryStatus === "Not recorded").length,
    };

    return {
      ...base,
      customGroups: base.customGroups,
      attendanceSummary,
      wageSummary: {
        ...wageSummary,
        totalDailyWagesLabel: formatCurrency(wageSummary.totalDailyWages),
        totalEarnedTodayLabel: formatCurrency(wageSummary.totalEarnedToday),
      },
      metrics: [
        { label: "Workers", value: String(base.workers.length), detail: "Visible in your scope" },
        {
          label: "Visitors tracked",
          value: String(base.visitorEvents.reduce((sum, event) => sum + Number(event.count || 0), 0)),
          detail: "Visible visitor records",
        },
        { label: "Alerts", value: String(base.alerts.length), detail: "Active alerts in scope" },
        { label: "Zones", value: String(base.zoneStats.length), detail: "Visible work zones" },
      ],
    };
  }

  if (user.role === "Admin") {
    return data;
  }

  if (user.role === "Supervisor") {
    const supervisorId = user.supervisorId || user.id;
    const workers = (data.workers || []).filter((worker) => worker.supervisorId === supervisorId);
    const zones = new Set(workers.map((worker) => worker.zone));
    const supervisors = (data.supervisors || []).filter((supervisor) => supervisor.id === supervisorId);
    const visitorEvents = (data.visitorEvents || []).filter((event) => zones.has(event.zone));
    const alerts = (data.alerts || []).filter((alert) => zones.has(alert.zone));
    const videoAnalyses = (data.videoAnalyses || []).filter((analysis) => zones.has(analysis.zone));
    const zoneStats = (data.zoneStats || []).filter((zone) => zones.has(zone.zone));

    return buildScopedShape({
      ...data,
      admins: [],
      supervisors,
      workers,
      visitorEvents,
      alerts,
      videoAnalyses,
      zoneStats,
    });
  }

  const workerId = user.workerId || user.id;
  const workers = (data.workers || []).filter((worker) => worker.id === workerId);
  const currentWorker = workers[0] || null;
  const zones = new Set(currentWorker?.zone ? [currentWorker.zone] : []);
  const supervisors = (data.supervisors || []).filter(
    (supervisor) => supervisor.id === currentWorker?.supervisorId
  );
  const visitorEvents = (data.visitorEvents || []).filter((event) => zones.has(event.zone));
  const alerts = (data.alerts || []).filter((alert) => zones.has(alert.zone));
  const videoAnalyses = (data.videoAnalyses || []).filter((analysis) => zones.has(analysis.zone));
  const zoneStats = (data.zoneStats || []).filter((zone) => zones.has(zone.zone));

  return buildScopedShape({
    ...data,
    admins: [],
    supervisors,
    workers,
    visitorEvents,
    alerts,
    videoAnalyses,
    zoneStats,
  });
}

function buildTextToSqlPlan(question) {
  const normalized = normalizeLooseText(question);
  const zone = detectZoneFromText(question, "NONE");
  const zoneSpecific = KNOWN_ZONES.includes(zone) ? zone : "";
  const isToday = /\btoday|now|current\b/i.test(normalized);

  if (/\bhow many|count|total\b/.test(normalized) && /\bvisitors?|people|guests?\b/.test(normalized)) {
    const timeContext = isToday ? "today" : "all time";
    return zoneSpecific
      ? {
          title: "Visitor summary",
          sql: isToday
            ? `
              SELECT zone, COALESCE(SUM(visitor_count), 0)::int AS total_visitors, COUNT(*)::int AS event_count
              FROM visitor_events
              WHERE zone = $1 AND created_at >= CURRENT_DATE
              GROUP BY zone
            `
            : `
              SELECT zone, COALESCE(SUM(visitor_count), 0)::int AS total_visitors, COUNT(*)::int AS event_count
              FROM visitor_events
              WHERE zone = $1
              GROUP BY zone
            `,
          values: [zoneSpecific],
          present(rows) {
            const row = rows[0] || { zone: zoneSpecific, total_visitors: 0, event_count: 0 };
            return {
              title: "Visitor summary",
              summary: `${row.total_visitors} visitors are recorded for ${row.zone} across ${row.event_count} logged events ${timeContext}.`,
              evidence: buildStructuredEvidence([
                {
                  senderName: "Text-to-SQL",
                  tag: "SQL",
                  text: `Found ${row.total_visitors} visitors for ${row.zone} across ${row.event_count} logged events ${timeContext}.`,
                },
              ]),
            };
          },
        }
      : {
          title: "Visitor summary",
          sql: isToday
            ? `
              SELECT COALESCE(SUM(visitor_count), 0)::int AS total_visitors, COUNT(*)::int AS event_count
              FROM visitor_events
              WHERE created_at >= CURRENT_DATE
            `
            : `
              SELECT COALESCE(SUM(visitor_count), 0)::int AS total_visitors, COUNT(*)::int AS event_count
              FROM visitor_events
            `,
          values: [],
          present(rows) {
            const row = rows[0] || { total_visitors: 0, event_count: 0 };
            return {
              title: "Visitor summary",
              summary: `${row.total_visitors} visitors are recorded across ${row.event_count} logged events ${timeContext}.`,
              evidence: buildStructuredEvidence([
                {
                  senderName: "Text-to-SQL",
                  tag: "SQL",
                  text: `Found ${row.total_visitors} visitors across ${row.event_count} logged events ${timeContext}.`,
                },
              ]),
            };
          },
        };
  }

  if ((/\bmost active|busiest|highest activity\b/.test(normalized) && /\bzone\b/.test(normalized)) ||
      /\bwhich zone is most active\b/.test(normalized)) {
    return {
      title: "Zone activity",
      sql: `
        SELECT
          zone,
          SUM(visitors)::int AS visitors,
          SUM(workers)::int AS workers,
          SUM(alerts)::int AS alerts,
          SUM(activity_score)::int AS activity_score
        FROM (
          SELECT
            z.zone,
            COALESCE(v.visitors, 0) AS visitors,
            COALESCE(w.workers, 0) AS workers,
            COALESCE(a.alerts, 0) AS alerts,
            (COALESCE(v.visitors, 0) + (COALESCE(w.workers, 0) * 10)) AS activity_score
          FROM (VALUES ('Greenhouse A'), ('Packing Unit'), ('Visitor Gate'), ('Nursery Bay')) AS z(zone)
          LEFT JOIN (
            SELECT zone, SUM(visitor_count)::int AS visitors
            FROM visitor_events
            GROUP BY zone
          ) v ON v.zone = z.zone
          LEFT JOIN (
            SELECT zone, COUNT(*)::int AS workers
            FROM workers
            GROUP BY zone
          ) w ON w.zone = z.zone
          LEFT JOIN (
            SELECT zone, COUNT(*)::int AS alerts
            FROM alerts
            WHERE resolved_at IS NULL
            GROUP BY zone
          ) a ON a.zone = z.zone
        ) stats
        GROUP BY zone
        ORDER BY activity_score DESC
        LIMIT 1
      `,
      values: [],
      present(rows) {
        const row = rows[0];
        if (!row) return null;
        return {
          title: "Zone activity",
          summary: `${row.zone} is the most active zone right now with ${row.workers} workers, ${row.visitors} visitors, and ${row.alerts} active alerts.`,
          evidence: buildStructuredEvidence([
            {
              senderName: "Text-to-SQL",
              tag: "SQL",
              text: `Zone activity ranking placed ${row.zone} first with score ${row.activity_score}.`,
            },
          ]),
        };
      },
    };
  }

  if (/\bwho\b/.test(normalized) && /\babsent\b/.test(normalized)) {
    return {
      title: "Absent workers",
      sql: `
        SELECT u.name, w.zone
        FROM workers w
        JOIN users u ON u.id = w.user_id
        WHERE w.attendance = 'Absent'
        ORDER BY u.name ASC
      `,
      values: [],
      present(rows) {
        return {
          title: "Absent workers",
          summary: rows.length
            ? `${rows.map((row) => row.name).join(", ")} are marked absent.`
            : "No workers are marked absent right now.",
          evidence: buildStructuredEvidence(
            rows.map((row, index) => ({
              id: `absent-row-${index}`,
              senderName: row.name,
              tag: "SQL",
              text: `${row.name} is absent in ${row.zone}.`,
            }))
          ),
        };
      },
    };
  }

  if (/\battendance|present|late|absent\b/.test(normalized)) {
    return {
      title: "Attendance summary",
      sql: `
        SELECT
          COUNT(*) FILTER (WHERE attendance = 'Present')::int AS present_count,
          COUNT(*) FILTER (WHERE attendance = 'Late')::int AS late_count,
          COUNT(*) FILTER (WHERE attendance = 'Absent')::int AS absent_count,
          COUNT(*)::int AS total_count
        FROM workers
      `,
      values: [],
      present(rows) {
        const row = rows[0] || {
          present_count: 0,
          late_count: 0,
          absent_count: 0,
          total_count: 0,
        };
        return {
          title: "Attendance summary",
          summary: `${row.present_count} present, ${row.late_count} late, and ${row.absent_count} absent out of ${row.total_count} tracked workers.`,
          evidence: buildStructuredEvidence([
            {
              senderName: "Text-to-SQL",
              tag: "SQL",
              text: "Attendance totals were computed directly from the workers table.",
            },
          ]),
        };
      },
    };
  }

  if (/\balert|alerts|warning|issue|overcrowd|idle\b/.test(normalized)) {
    return zoneSpecific
      ? {
          title: "Alert summary",
          sql: `
            SELECT zone, severity, title, detail, created_at
            FROM alerts
            WHERE resolved_at IS NULL
              AND zone = $1
            ORDER BY created_at DESC
            LIMIT 5
          `,
          values: [zoneSpecific],
          present(rows) {
            return {
              title: "Alert summary",
              summary: rows.length
                ? `${rows.length} active alerts are open in ${zoneSpecific}. Latest: ${rows[0].title}.`
                : `There are no active alerts in ${zoneSpecific}.`,
              evidence: buildStructuredEvidence(
                rows.map((row, index) => ({
                  id: `zone-alert-${index}`,
                  senderName: row.zone,
                  tag: `${row.severity} alert`,
                  timeLabel: formatTimeLabel(row.created_at),
                  text: `${row.title}: ${row.detail}`,
                }))
              ),
            };
          },
        }
      : {
          title: "Alert summary",
          sql: `
            SELECT zone, severity, title, detail, created_at
            FROM alerts
            WHERE resolved_at IS NULL
            ORDER BY created_at DESC
            LIMIT 5
          `,
          values: [],
          present(rows) {
            return {
              title: "Alert summary",
              summary: rows.length
                ? `${rows.length} active alerts are open. Latest: ${rows[0].title}.`
                : "There are no active alerts right now.",
              evidence: buildStructuredEvidence(
                rows.map((row, index) => ({
                  id: `alert-${index}`,
                  senderName: row.zone,
                  tag: `${row.severity} alert`,
                  timeLabel: formatTimeLabel(row.created_at),
                  text: `${row.title}: ${row.detail}`,
                }))
              ),
            };
          },
        };
  }

  if (/\btask|progress|complete|completion|status\b/.test(normalized) && !/\b(tiller|tractor|equipment|machine|machinery|tool|mower|pump|crop|crops|plant|plants|rose|carnation|lavender|marigold|order|orders| ORD-|sale|sales|expense|expenses|leave|leaves|visitor|visitors)\b/i.test(normalized)) {
    return {
      title: "Task progress",
      sql: `
        SELECT u.name, w.zone, w.task, w.status, w.progress
        FROM workers w
        JOIN users u ON u.id = w.user_id
        ORDER BY w.progress DESC, u.name ASC
        LIMIT 3
      `,
      values: [],
      present(rows) {
        const lead = rows[0];
        if (!lead) return null;
        return {
          title: "Task progress",
          summary: `${lead.name} is leading progress at ${lead.progress}% on ${lead.task}.`,
          evidence: buildStructuredEvidence(
            rows.map((row, index) => ({
              id: `progress-${index}`,
              senderName: row.name,
              tag: "SQL",
              text: `${row.task} in ${row.zone} is at ${row.progress}% and currently ${row.status}.`,
            }))
          ),
        };
      },
    };
  }

  if (/\bwage|salary|payroll|earned|payment\b/.test(normalized)) {
    return {
      title: "Payroll summary",
      sql: `
        SELECT
          COALESCE(SUM(daily_wage), 0)::int AS total_daily_wages,
          COALESCE(SUM(
            CASE
              WHEN attendance = 'Present' THEN daily_wage
              WHEN attendance = 'Late' THEN ROUND(daily_wage * 0.75)
              ELSE 0
            END
          ), 0)::int AS total_earned_today,
          COUNT(*) FILTER (WHERE salary_status = 'Recorded')::int AS recorded_count,
          COUNT(*) FILTER (WHERE salary_status = 'Pending review')::int AS pending_review_count,
          COUNT(*) FILTER (WHERE salary_status = 'Not recorded')::int AS not_recorded_count
        FROM workers
      `,
      values: [],
      present(rows) {
        const row = rows[0] || {};
        return {
          title: "Payroll summary",
          summary: `${formatCurrency(row.total_earned_today)} has been earned today from ${formatCurrency(row.total_daily_wages)} in tracked daily wages.`,
          evidence: buildStructuredEvidence([
            {
              senderName: "Text-to-SQL",
              tag: "SQL",
              text: `${row.recorded_count || 0} recorded, ${row.pending_review_count || 0} pending review, ${row.not_recorded_count || 0} not recorded.`,
            },
          ]),
        };
      },
    };
  }

  return null;
}

async function executeTextToSqlPlan(plan) {
  if (!plan) {
    return null;
  }

  const result = await getPool().query(plan.sql, plan.values || []);
  return plan.present(result.rows || []);
}

function answerStructuredCopilotQuestion(question, data, matches = []) {
  const normalized = normalizeLooseText(question);
  const zone = detectZoneFromText(question, "NONE");
  const zoneSpecific = KNOWN_ZONES.includes(zone) ? zone : "";
  const chatEvidence = matches.slice(0, 2).map((match) => ({
    id: match.id,
    senderName: match.senderName,
    tag: match.tag,
    timeLabel: match.timeLabel,
    text: match.text,
    score: match.score,
  }));

  if (/\bhow many|count|total\b/.test(normalized) && /\bvisitors?|people|guests?\b/.test(normalized)) {
    const isToday = /\btoday|now|current\b/i.test(normalized);
    let zoneEvents = zoneSpecific
      ? data.visitorEvents.filter((event) => event.zone === zoneSpecific)
      : data.visitorEvents;

    if (isToday) {
      const todayStr = new Date().toLocaleDateString("en-CA");
      zoneEvents = zoneEvents.filter((event) => {
        const eventDateStr = new Date(event.createdAt || event.created_at).toLocaleDateString("en-CA");
        return eventDateStr === todayStr;
      });
    }

    const totalVisitors = zoneEvents.reduce((sum, event) => sum + Number(event.count || 0), 0);
    const timeContext = isToday ? "today" : "all time";

    return {
      title: "Visitor summary",
      summary: zoneSpecific
        ? `${totalVisitors} visitors are recorded for ${zoneSpecific} across ${zoneEvents.length} logged events ${timeContext}.`
        : `${totalVisitors} visitors are recorded across ${zoneEvents.length} logged events ${timeContext}.`,
      evidence: buildStructuredEvidence([
        {
          senderName: "Visitor events",
          tag: "SQL",
          text: zoneSpecific
            ? `${zoneSpecific}: ${totalVisitors} visitors from ${zoneEvents.length} event records ${timeContext}.`
            : `${totalVisitors} visitors from ${zoneEvents.length} event records ${timeContext}.`,
        },
        ...chatEvidence,
      ]),
    };
  }

  if ((/\bmost active|busiest|highest activity\b/.test(normalized) && /\bzone\b/.test(normalized)) ||
      /\bwhich zone is most active\b/.test(normalized)) {
    const topZone = [...(data.zoneStats || [])].sort(
      (left, right) => (right.activityScore || 0) - (left.activityScore || 0)
    )[0];

    if (!topZone) {
      return null;
    }

    return {
      title: "Zone activity",
      summary: `${topZone.zone} is the most active zone right now with ${topZone.workers} workers, ${topZone.visitors} visitors, and ${topZone.alerts} active alerts.`,
      evidence: buildStructuredEvidence([
        {
          senderName: "Zone analytics",
          tag: "SQL",
          text: `${topZone.zone} leads by combined worker and visitor activity.`,
        },
        ...chatEvidence,
      ]),
    };
  }

  if (/\battendance|present|late|absent\b/.test(normalized)) {
    if (/\bwho\b/.test(normalized) && /\babsent\b/.test(normalized)) {
      const absentWorkers = data.workers.filter((worker) => worker.attendance === "Absent");
      return {
        title: "Absent workers",
        summary: absentWorkers.length
          ? `${absentWorkers.map((worker) => worker.name).join(", ")} are marked absent.`
          : "No workers are marked absent right now.",
        evidence: buildStructuredEvidence(
          absentWorkers.map((worker) => ({
            id: `absent-${worker.id}`,
            senderName: worker.name,
            tag: "Attendance",
            text: `${worker.name} is marked absent in ${worker.zone}.`,
          }))
        ),
      };
    }

    return {
      title: "Attendance summary",
      summary: `${data.attendanceSummary.present} present, ${data.attendanceSummary.late} late, and ${data.attendanceSummary.absent} absent out of ${data.attendanceSummary.total} tracked workers.`,
      evidence: buildStructuredEvidence([
        {
          senderName: "Attendance register",
          tag: "SQL",
          text: `${data.attendanceSummary.present} present, ${data.attendanceSummary.late} late, ${data.attendanceSummary.absent} absent.`,
        },
      ]),
    };
  }

  if (/\balert|alerts|warning|issue|overcrowd|idle\b/.test(normalized)) {
    const alerts = zoneSpecific
      ? data.alerts.filter((alert) => alert.zone === zoneSpecific)
      : data.alerts;
    const latest = alerts[0];

    return {
      title: "Alert summary",
      summary: alerts.length
        ? zoneSpecific
          ? `${alerts.length} active alerts are open in ${zoneSpecific}. Latest: ${latest.title}.`
          : `${alerts.length} active alerts are open. Latest: ${latest.title}.`
        : zoneSpecific
        ? `There are no active alerts in ${zoneSpecific}.`
        : "There are no active alerts right now.",
      evidence: buildStructuredEvidence(
        alerts.map((alert) => ({
          id: alert.id,
          senderName: alert.zone,
          tag: `${alert.severity} alert`,
          timeLabel: alert.timeLabel,
          text: `${alert.title}: ${alert.detail}`,
        }))
      ),
    };
  }

  if (/\btask|progress|complete|completion|status\b/.test(normalized) && !/\b(tiller|tractor|equipment|machine|machinery|tool|mower|pump|crop|crops|plant|plants|rose|carnation|lavender|marigold|order|orders| ORD-|sale|sales|expense|expenses|leave|leaves|visitor|visitors)\b/i.test(normalized)) {
    if (zoneSpecific) {
      const zoneWorkers = data.workers.filter((worker) => worker.zone === zoneSpecific);
      const zoneAverage = zoneWorkers.length
        ? Math.round(
            zoneWorkers.reduce((sum, worker) => sum + Number(worker.progressValue || 0), 0) /
              zoneWorkers.length
          )
        : 0;

      return {
        title: "Zone task summary",
        summary: zoneWorkers.length
          ? `${zoneSpecific} is averaging ${zoneAverage}% progress across ${zoneWorkers.length} workers.`
          : `No workers are assigned in ${zoneSpecific}.`,
        evidence: buildStructuredEvidence(
          zoneWorkers.map((worker) => ({
            id: `zone-worker-${worker.id}`,
            senderName: worker.name,
            tag: "Task",
            text: `${worker.task} is ${worker.progress} and currently ${worker.status}.`,
          }))
        ),
      };
    }

    const topWorker = [...data.workers].sort(
      (left, right) => Number(right.progressValue || 0) - Number(left.progressValue || 0)
    )[0];

    if (!topWorker) {
      return null;
    }

    return {
      title: "Task progress",
      summary: `${topWorker.name} is leading progress at ${topWorker.progress} on ${topWorker.task}.`,
      evidence: buildStructuredEvidence([
        {
          id: `top-worker-${topWorker.id}`,
          senderName: topWorker.name,
          tag: "Task",
          text: `${topWorker.task} in ${topWorker.zone} is at ${topWorker.progress}.`,
        },
        ...chatEvidence,
      ]),
    };
  }

  if (/\bwage|salary|payroll|earned|payment\b/.test(normalized)) {
    return {
      title: "Payroll summary",
      summary: `${data.wageSummary.totalEarnedTodayLabel} has been earned today from ${data.wageSummary.totalDailyWagesLabel} in tracked daily wages.`,
      evidence: buildStructuredEvidence([
        {
          senderName: "Payroll",
          tag: "SQL",
          text: `${data.wageSummary.recorded} recorded, ${data.wageSummary.pendingReview} pending review, ${data.wageSummary.notRecorded} not recorded.`,
        },
      ]),
    };
  }

  return null;
}

export async function answerCopilotQuestion(user, question) {
  const normalizedQuestion = String(question || "").trim();

  if (!normalizedQuestion) {
    throw new Error("Ask a question for the copilot.");
  }

  const exactWorkerPaymentAnswer = await answerExactWorkerPaymentQuestion(user, normalizedQuestion);
  if (exactWorkerPaymentAnswer) {
    return exactWorkerPaymentAnswer;
  }

  const exactWorkerTaskAnswer = await answerExactWorkerTaskQuestion(user, normalizedQuestion);
  if (exactWorkerTaskAnswer) {
    return exactWorkerTaskAnswer;
  }

  const wantsCrops = /\b(crop|crops|plant|plants|inventory|grow|growth|variety|bed|greenhouse)\b/i.test(normalizedQuestion);
  const wantsSales = /\b(sale|sales|sell|sold|transaction|transactions|revenue|customer|customers)\b/i.test(normalizedQuestion);
  const wantsOrders = /\b(order|orders)\b/i.test(normalizedQuestion);
  const wantsExpenses = /\b(expense|expenses|spend|spent|cost|costs)\b/i.test(normalizedQuestion);
  const wantsEquipment = /\b(equipment|machinery|machine|machines|tool|tools|tiller|tractor|service|maintenance|maintain)\b/i.test(normalizedQuestion);
  const wantsAlerts = /\b(alert|alerts|warning|severity|resolved|active alert)\b/i.test(normalizedQuestion);
  const wantsSupplies = /\b(supply|supplies|stock|reorder)\b/i.test(normalizedQuestion);
  const wantsLeaves = /\b(leave|leaves|vacation|off|request)\b/i.test(normalizedQuestion);
  const wantsVisitors = /\b(visitor|visitors|guest|guests|tour|tours)\b/i.test(normalizedQuestion);

  const targetSections = [];
  if (wantsCrops) targetSections.push("crops");
  if (wantsSales) targetSections.push("sales");
  if (wantsOrders) targetSections.push("orders");
  if (wantsExpenses) targetSections.push("expenses");
  if (wantsEquipment) targetSections.push("equipment");
  if (wantsAlerts) targetSections.push("alerts");
  if (wantsSupplies) targetSections.push("supplies");
  if (wantsLeaves) targetSections.push("leave_requests");
  if (wantsVisitors) targetSections.push("visitor_events");

  const [chatMatches, workforcePaymentMatches, workforceTaskMatches, genericMatches] = await Promise.all([
    getRankedChatMatches(user, normalizedQuestion, 5),
    getRankedWorkforcePaymentMatches(user, normalizedQuestion, 5),
    getRankedWorkforceTaskMatches(user, normalizedQuestion, 5),
    getRankedGenericRagMatches(user, normalizedQuestion, 5, targetSections.length > 0 ? targetSections : null),
  ]);

  const wantsChatLog = /\b(message|chat|send|sent|say|said|wrote|write|text|conversation|group|groups|post|posted)\b/i.test(normalizedQuestion);
  const wantsPayment = /\b(payment|paid|receipt|txn|transaction|salary|wage|payroll|earned|pay)\b/i.test(normalizedQuestion);
  const wantsTask = /\b(task|assigned|work|job|status|progress|todo|doing)\b/i.test(normalizedQuestion);

  let selectedMatches = [];
  if (wantsChatLog) {
    // Only search chat messages if they explicitly ask about chat/group/messages
    selectedMatches = chatMatches;
  } else {
    // Otherwise, select matching categories
    if (wantsPayment) {
      selectedMatches.push(...workforcePaymentMatches);
    }
    if (wantsTask) {
      selectedMatches.push(...workforceTaskMatches);
    }
    if (wantsCrops || wantsSales || wantsOrders || wantsExpenses || wantsEquipment || wantsAlerts || wantsSupplies || wantsLeaves || wantsVisitors) {
      selectedMatches.push(...genericMatches);
    }
    // If no specific category matched, combine all as fallback
    if (!wantsPayment && !wantsTask && !wantsCrops && !wantsSales && !wantsOrders && !wantsExpenses && !wantsEquipment && !wantsAlerts && !wantsSupplies && !wantsLeaves && !wantsVisitors) {
      selectedMatches = [...chatMatches, ...workforcePaymentMatches, ...workforceTaskMatches, ...genericMatches];
    }
  }

  const ragMatches = selectedMatches
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, 5);

  const isDefinitional = /^\s*(what\s+is|what\s+are|define|explain|meaning\s+of|tell\s+me\s+about|describe|how\s+does|how\s+do|why\s+is|why\s+do|what\s+does)\b/i.test(
    normalizedQuestion
  );
  if (isDefinitional && !ragMatches.length) {
    return buildCopilotAnswer(normalizedQuestion, []);
  }

  const prefersRagGrounding = /\b(message|chat|update|payment|paid|receipt|txn|transaction|salary|wage|payroll|earned|task|assigned|work|job|status|progress|attendance|crop|crops|plant|plants|inventory|grow|growth|variety|bed|greenhouse|sale|sales|sell|sold|order|orders|expense|expenses|spend|spent|cost|costs|equipment|machinery|machine|machines|tool|tools|tiller|tractor|service|maintenance|maintain|alert|alerts|warning|severity|resolved|supply|supplies|stock|reorder|leave|leaves|vacation|off|request|visitor|visitors|guest|guests|tour|tours)\b/i.test(
    normalizedQuestion
  );

  // 1. If asking explicitly about chat logs or messages, run RAG first
  if (wantsChatLog && prefersRagGrounding && ragMatches.length) {
    return buildCopilotAnswer(normalizedQuestion, ragMatches);
  }

  // 2. Run Text-to-SQL plans for general/analytical questions (e.g. totals, lists, salaries)
  // Skip SQL plans if the user explicitly asked about chat logs/groups
  if (!wantsChatLog) {
    const sqlPlan = buildTextToSqlPlan(normalizedQuestion);
    const sqlAnswer = await executeTextToSqlPlan(sqlPlan);
    if (sqlAnswer) {
      return sqlAnswer;
    }
  }

  // 3. Fallback to general prefersRagGrounding if no SQL plan matched
  if (prefersRagGrounding && ragMatches.length) {
    return buildCopilotAnswer(normalizedQuestion, ragMatches);
  }

  if (!wantsChatLog) {
    const dashboardData = await getDashboardData(user);
    const structuredAnswer = answerStructuredCopilotQuestion(normalizedQuestion, dashboardData, ragMatches);
    if (structuredAnswer) {
      return structuredAnswer;
    }
  }

  return buildCopilotAnswer(normalizedQuestion, ragMatches);
}

export async function getSales() {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT id, plant_name, customer_name, quantity, unit_price, total_amount, status, sale_date, created_at FROM sales ORDER BY sale_date DESC, created_at DESC"
  );
  return result.rows.map(row => ({
    id: row.id,
    plantName: row.plant_name,
    customerName: row.customer_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalAmount: row.total_amount,
    status: row.status,
    saleDate: row.sale_date,
    createdAt: row.created_at
  }));
}

export async function createSale({ plantName, customerName, quantity, unitPrice, totalAmount, status, saleDate }) {
  await ensureSchema();
  const qty = Number(quantity || 0);
  const price = Number(unitPrice || 0);
  const total = Number(totalAmount || (qty * price));
  const date = saleDate || new Date().toISOString().slice(0, 10);
  const sStatus = status || 'paid';
  const result = await getPool().query(
    `INSERT INTO sales (plant_name, customer_name, quantity, unit_price, total_amount, status, sale_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, plant_name, customer_name, quantity, unit_price, total_amount, status, sale_date, created_at`,
    [plantName, customerName, qty, price, total, sStatus, date]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("sales", {
      id: row.id,
      plantName: row.plant_name,
      customerName: row.customer_name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      totalAmount: row.total_amount,
      status: row.status,
      saleDate: row.sale_date,
    });
  }
  return {
    id: row.id,
    plantName: row.plant_name,
    customerName: row.customer_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalAmount: row.total_amount,
    status: row.status,
    saleDate: row.sale_date,
    createdAt: row.created_at
  };
}

export async function getInvoices() {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT id, customer_name, amount, status, due_date, created_at FROM invoices ORDER BY due_date ASC, created_at DESC"
  );
  return result.rows.map(row => ({
    id: row.id,
    customerName: row.customer_name,
    amount: row.amount,
    status: row.status,
    dueDate: row.due_date,
    createdAt: row.created_at
  }));
}

export async function createInvoice({ id, customerName, amount, status, dueDate }) {
  await ensureSchema();
  const invId = id || `INV-${Math.floor(10000 + Math.random() * 90000)}`;
  const amt = Number(amount || 0);
  const date = dueDate || null;
  const sStatus = status || 'unpaid';
  const result = await getPool().query(
    `INSERT INTO invoices (id, customer_name, amount, status, due_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET customer_name = EXCLUDED.customer_name, amount = EXCLUDED.amount, status = EXCLUDED.status, due_date = EXCLUDED.due_date
     RETURNING id, customer_name, amount, status, due_date, created_at`,
    [invId, customerName, amt, sStatus, date]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    customerName: row.customer_name,
    amount: row.amount,
    status: row.status,
    dueDate: row.due_date,
    createdAt: row.created_at
  };
}

export async function getExpenses() {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT id, description, category, payment_method, amount, expense_date, created_at FROM expenses ORDER BY expense_date DESC, created_at DESC"
  );
  return result.rows.map(row => ({
    id: row.id,
    description: row.description,
    category: row.category,
    paymentMethod: row.payment_method,
    amount: row.amount,
    expenseDate: row.expense_date,
    createdAt: row.created_at
  }));
}

export async function createExpense({ description, category, paymentMethod, amount, expenseDate }) {
  await ensureSchema();
  const amt = Number(amount || 0);
  const date = expenseDate || new Date().toISOString().slice(0, 10);
  const result = await getPool().query(
    `INSERT INTO expenses (description, category, payment_method, amount, expense_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, description, category, payment_method, amount, expense_date, created_at`,
    [description, category, paymentMethod, amt, date]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("expenses", {
      id: row.id,
      description: row.description,
      category: row.category,
      paymentMethod: row.payment_method,
      amount: row.amount,
      expenseDate: row.expense_date,
    });
  }
  return {
    id: row.id,
    description: row.description,
    category: row.category,
    paymentMethod: row.payment_method,
    amount: row.amount,
    expenseDate: row.expense_date,
    createdAt: row.created_at
  };
}

export async function getOrders() {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT id, customer_name, company_name, order_date, delivery_date, status, payment_status, total_amount, created_at FROM orders ORDER BY order_date DESC, created_at DESC"
  );
  return result.rows.map(row => ({
    id: row.id,
    customerName: row.customer_name,
    companyName: row.company_name,
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    status: row.status,
    paymentStatus: row.payment_status,
    totalAmount: row.total_amount,
    createdAt: row.created_at
  }));
}

export async function createOrder({ id, customerName, companyName, orderDate, deliveryDate, status, paymentStatus, totalAmount }) {
  await ensureSchema();
  const ordId = id || `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
  const oDate = orderDate || new Date().toISOString().slice(0, 10);
  const dDate = deliveryDate || null;
  const ordStatus = status || 'Pending';
  const payStatus = paymentStatus || 'unpaid';
  const amount = Number(totalAmount || 0);
  const result = await getPool().query(
    `INSERT INTO orders (id, customer_name, company_name, order_date, delivery_date, status, payment_status, total_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET customer_name = EXCLUDED.customer_name, company_name = EXCLUDED.company_name, order_date = EXCLUDED.order_date, delivery_date = EXCLUDED.delivery_date, status = EXCLUDED.status, payment_status = EXCLUDED.payment_status, total_amount = EXCLUDED.total_amount
     RETURNING id, customer_name, company_name, order_date, delivery_date, status, payment_status, total_amount, created_at`,
    [ordId, customerName, companyName, oDate, dDate, ordStatus, payStatus, amount]
  );
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("orders", {
      id: row.id,
      customerName: row.customer_name,
      companyName: row.company_name,
      orderDate: row.order_date,
      deliveryDate: row.delivery_date,
      status: row.status,
      paymentStatus: row.payment_status,
      totalAmount: row.total_amount,
    });
  }
  return {
    id: row.id,
    customerName: row.customer_name,
    companyName: row.company_name,
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    status: row.status,
    paymentStatus: row.payment_status,
    totalAmount: row.total_amount,
    createdAt: row.created_at
  };
}

export async function updateOrder(id, { status, paymentStatus, deliveryDate }) {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE orders
     SET status = COALESCE($2, status),
         payment_status = COALESCE($3, payment_status),
         delivery_date = COALESCE($4, delivery_date)
     WHERE id = $1
     RETURNING id, customer_name, company_name, order_date, delivery_date, status, payment_status, total_amount, created_at`,
    [id, status, paymentStatus, deliveryDate]
  );
  if (result.rows.length === 0) {
    throw new Error(`Order with ID ${id} not found.`);
  }
  const row = result.rows[0];
  if (row) {
    await upsertRagEmbedding("orders", {
      id: row.id,
      customerName: row.customer_name,
      companyName: row.company_name,
      orderDate: row.order_date,
      deliveryDate: row.delivery_date,
      status: row.status,
      paymentStatus: row.payment_status,
      totalAmount: row.total_amount,
    });
  }
  return {
    id: row.id,
    customerName: row.customer_name,
    companyName: row.company_name,
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    status: row.status,
    paymentStatus: row.payment_status,
    totalAmount: row.total_amount,
    createdAt: row.created_at
  };
}

export async function getSeasonalForecasts() {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT id, month, plant_name, event, predicted_demand, confidence, action, created_at FROM seasonal_forecasts ORDER BY created_at DESC"
  );
  return result.rows.map(row => ({
    id: row.id,
    month: row.month,
    plantName: row.plant_name,
    event: row.event,
    predictedDemand: row.predicted_demand,
    confidence: row.confidence,
    action: row.action,
    createdAt: row.created_at
  }));
}

export async function getSupplies() {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT id, name, category, quantity, unit, reorder_level, cost, created_at, updated_at FROM supplies ORDER BY name ASC"
  );
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    reorderLevel: row.reorder_level,
    cost: row.cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function createSupply({ name, category, quantity, unit, reorderLevel, cost }) {
  await ensureSchema();
  const qty = Number(quantity || 0);
  const reorder = Number(reorderLevel || 0);
  const itemCost = Number(cost || 0);
  const result = await getPool().query(
    `INSERT INTO supplies (name, category, quantity, unit, reorder_level, cost)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, category, quantity, unit, reorder_level, cost, created_at, updated_at`,
    [name, category, qty, unit, reorder, itemCost]
  );
  const row = result.rows[0];
  const supply = {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    reorderLevel: row.reorder_level,
    cost: row.cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  await upsertRagEmbedding("supplies", supply);
  return supply;
}

export async function updateSupply(id, { quantity, reorderLevel, cost }) {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE supplies
     SET quantity = COALESCE($2, quantity),
         reorder_level = COALESCE($3, reorder_level),
         cost = COALESCE($4, cost),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, category, quantity, unit, reorder_level, cost, created_at, updated_at`,
    [id, quantity, reorderLevel, cost]
  );
  if (result.rows.length === 0) {
    throw new Error(`Supply with ID ${id} not found.`);
  }
  const row = result.rows[0];
  const supply = {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    reorderLevel: row.reorder_level,
    cost: row.cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  await upsertRagEmbedding("supplies", supply);
  return supply;
}

export async function resolveAlert(id) {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE alerts
     SET resolved_at = NOW()
     WHERE id = $1
     RETURNING id, zone, severity, title, detail, created_at, resolved_at, acknowledged_at`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new Error(`Alert with ID ${id} not found.`);
  }
  const row = result.rows[0];
  await upsertRagEmbedding("alerts", {
    id: row.id,
    zone: row.zone,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  });
  return toAlert(row);
}

export async function acknowledgeAlert(id) {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE alerts
     SET acknowledged_at = NOW()
     WHERE id = $1
     RETURNING id, zone, severity, title, detail, created_at, resolved_at, acknowledged_at`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new Error(`Alert with ID ${id} not found.`);
  }
  const row = result.rows[0];
  await upsertRagEmbedding("alerts", {
    id: row.id,
    zone: row.zone,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  });
  return toAlert(row);
}
