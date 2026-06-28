import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_VECTOR_SIZE = 768;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "with",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));
}

function hashToken(token, seed = 0) {
  let hash = 2166136261 ^ seed;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

export async function vectorizeText(value, size = DEFAULT_VECTOR_SIZE) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) {
    return new Array(size).fill(0);
  }

  const client = getGeminiClient();
  if (client) {
    for (const modelName of ["gemini-embedding-2", "text-embedding-004"]) {
      try {
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.embedContent({
          content: { parts: [{ text: cleanValue }] },
          outputDimensionality: size,
        });
        const embedding = result.embedding;
        if (embedding && embedding.values && embedding.values.length === size) {
          return embedding.values;
        }
      } catch (error) {
        console.error(`Gemini embedding with model ${modelName} failed`, error);
      }
    }
  }

  // Fallback local hashing if Gemini fails or is missing API key
  const tokens = tokenize(cleanValue);
  const vector = new Array(size).fill(0);

  tokens.forEach((token) => {
    const bucket = hashToken(token) % size;
    const sign = hashToken(token, 17) % 2 === 0 ? 1 : -1;
    vector[bucket] += sign * (1 + Math.min(token.length, 12) / 12);
  });

  return normalizeVector(vector);
}

export function cosineSimilarity(left = [], right = []) {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }

  let score = 0;

  for (let index = 0; index < left.length; index += 1) {
    score += Number(left[index] || 0) * Number(right[index] || 0);
  }

  return score;
}

export function buildChatMessageDocument(message) {
  const parts = [
    message.tag ? `tag ${message.tag}` : "",
    message.senderName ? `sender ${message.senderName}` : "",
    message.senderRole ? `role ${message.senderRole}` : "",
    message.text || "",
    message.imageUrl ? "photo attached" : "",
  ].filter(Boolean);

  return parts.join(". ");
}

export function buildWorkforcePaymentDocument(worker) {
  const parts = [
    "workforce payment record",
    worker.workerName ? `worker ${worker.workerName}` : "",
    worker.zone ? `zone ${worker.zone}` : "",
    worker.supervisorName ? `supervisor ${worker.supervisorName}` : "",
    worker.salaryStatus ? `salary status ${worker.salaryStatus}` : "",
    worker.paymentMode ? `payment mode ${worker.paymentMode}` : "",
    Number.isFinite(Number(worker.paymentAmount))
      ? `amount paid ${Number(worker.paymentAmount)} rupees`
      : "amount paid 0 rupees",
    worker.paymentTxnId ? `transaction ${worker.paymentTxnId}` : "",
    worker.paymentDate ? `payment date ${worker.paymentDate}` : "",
    Number.isFinite(Number(worker.dailyWage)) ? `daily wage ${Number(worker.dailyWage)} rupees` : "",
    Number.isFinite(Number(worker.earnedToday))
      ? `earned today ${Number(worker.earnedToday)} rupees`
      : "",
  ].filter(Boolean);

  return parts.join(". ");
}

export function buildWorkforceTaskDocument(worker) {
  const parts = [
    "workforce task assignment",
    worker.workerName ? `worker ${worker.workerName}` : "",
    worker.zone ? `zone ${worker.zone}` : "",
    worker.supervisorName ? `supervisor ${worker.supervisorName}` : "",
    worker.task ? `task ${worker.task}` : "task no active assignment",
    worker.status ? `status ${worker.status}` : "",
    Number.isFinite(Number(worker.progress)) ? `progress ${Number(worker.progress)} percent` : "",
    worker.attendance ? `attendance ${worker.attendance}` : "",
  ].filter(Boolean);

  return parts.join(". ");
}

export function buildCopilotAnswer(question, matches = []) {
  const cleanQuestion = String(question || "").trim();

  if (!matches.length) {
    return {
      title: "General knowledge",
      summary: cleanQuestion || "No specific data found.",
      evidence: [],
      isGeneralKnowledge: true,
    };
  }

  const lead = matches[0];
  const evidence = matches.slice(0, 2).map((match) => ({
    id: match.id,
    senderName: match.senderName,
    tag: match.tag,
    timeLabel: match.timeLabel,
    text: match.text,
    score: match.score,
  }));

  const summaryParts = [
    cleanQuestion ? `Question: ${cleanQuestion}.` : "",
    `Best match: ${lead.senderName} reported "${lead.text}" at ${lead.timeLabel}.`,
  ];

  return {
    title: "Grounded answer",
    summary: summaryParts.filter(Boolean).join(" "),
    evidence,
  };
}

export function buildCropDocument(crop) {
  const parts = [
    "inventory crop record",
    crop.name ? `crop name ${crop.name}` : "",
    crop.variety ? `variety ${crop.variety}` : "",
    crop.zone ? `zone ${crop.zone}` : "",
    Number.isFinite(Number(crop.quantity)) ? `quantity ${Number(crop.quantity)} items` : "",
    crop.growthStage ? `growth stage ${crop.growthStage}` : "",
    crop.healthStatus ? `health status ${crop.healthStatus}` : "",
    crop.plantedDate ? `planted date ${crop.plantedDate}` : "",
    crop.expectedHarvest ? `expected harvest ${crop.expectedHarvest}` : "",
    crop.notes ? `notes ${crop.notes}` : "",
    crop.bed ? `bed ${crop.bed}` : "",
    Number.isFinite(Number(crop.cost)) ? `cost ${Number(crop.cost)} rupees` : "",
    Number.isFinite(Number(crop.price)) ? `price ${Number(crop.price)} rupees` : "",
    crop.batchCode ? `batch code ${crop.batchCode}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

export function buildSaleDocument(sale) {
  const parts = [
    "sales transaction record",
    sale.plantName ? `plant ${sale.plantName}` : "",
    sale.customerName ? `customer ${sale.customerName}` : "",
    Number.isFinite(Number(sale.quantity)) ? `quantity ${Number(sale.quantity)}` : "",
    Number.isFinite(Number(sale.unitPrice)) ? `unit price ${Number(sale.unitPrice)} rupees` : "",
    Number.isFinite(Number(sale.totalAmount)) ? `total amount ${Number(sale.totalAmount)} rupees` : "",
    sale.status ? `status ${sale.status}` : "",
    sale.saleDate ? `sale date ${sale.saleDate}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

export function buildOrderDocument(order) {
  const parts = [
    "customer order record",
    order.id ? `order id ${order.id}` : "",
    order.customerName ? `customer ${order.customerName}` : "",
    Number.isFinite(Number(order.totalAmount)) ? `total amount ${Number(order.totalAmount)} rupees` : "",
    order.status ? `status ${order.status}` : "",
    order.paymentStatus ? `payment status ${order.paymentStatus}` : "",
    order.orderDate ? `order date ${order.orderDate}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

export function buildExpenseDocument(expense) {
  const parts = [
    "farm expense record",
    expense.category ? `category ${expense.category}` : "",
    Number.isFinite(Number(expense.amount)) ? `amount spent ${Number(expense.amount)} rupees` : "",
    expense.recipient ? `recipient vendor ${expense.recipient}` : "",
    expense.expenseDate ? `expense date ${expense.expenseDate}` : "",
    expense.description ? `description ${expense.description}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

export function buildEquipmentDocument(eq) {
  const parts = [
    "farm equipment record",
    eq.name ? `equipment name ${eq.name}` : "",
    eq.category ? `category ${eq.category}` : "",
    eq.status ? `status ${eq.status}` : "",
    eq.lastMaintenance ? `last maintenance ${eq.lastMaintenance}` : "",
    Number.isFinite(Number(eq.cost)) ? `cost ${Number(eq.cost)} rupees` : "",
    eq.purchaseDate ? `purchase date ${eq.purchaseDate}` : "",
    eq.notes ? `notes ${eq.notes}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

export function buildAlertDocument(alert) {
  const parts = [
    "system operational alert",
    alert.zone ? `zone ${alert.zone}` : "",
    alert.severity ? `severity ${alert.severity}` : "",
    alert.title ? `title ${alert.title}` : "",
    alert.detail ? `details ${alert.detail}` : "",
    alert.createdAt ? `created at ${alert.createdAt}` : "",
    alert.resolvedAt ? `resolved at ${alert.resolvedAt}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

