"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { signOut, useSession } from "next-auth/react";
import { LiveFarmMapContainer } from "../components/LiveFarmMapContainer";
import OnboardingTour, { useShouldShowTour } from "../components/OnboardingTour";
import { Menu, Paperclip, Send, Users, Search, MoreVertical, Smile, Mic, X, CheckCheck, ChevronDown, Star, Edit2, Trash2, Info, ArrowLeft, Moon, Sun, Plus, Sprout, RefreshCw, FileDown, TrendingUp, TrendingDown, DollarSign, CreditCard, Calendar, AlertTriangle, CheckCircle, Clock, ArrowRight, PieChart, PlusCircle, Layers, Settings, ShieldAlert, ShoppingBag, Truck, CalendarDays } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import "../agrisense/agrisense.css";
import AgriSensePanel from "../components/AgriSensePanel";

const dashboardSections = [
  { id: "overview", label: "Overview" },
  { id: "messages", label: "Messages" },
  { id: "workforce", label: "Workforce" },
  { id: "inventory", label: "Inventory" },
  { id: "sales", label: "Sales & Finance" },
  { id: "orders", label: "Orders" },
  { id: "analytics", label: "ML Analytics" },
  { id: "tracking", label: "Tracking" },
  { id: "report", label: "Report" },
  { id: "alerts", label: "Alerts" },
  { id: "copilot", label: "AgriSage" },
  { id: "agrisense", label: "AgriSense" },
];

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Tooltip
);

const chartOptions = {
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: "#cbd5e1",
        boxWidth: 12,
        boxHeight: 12,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: "#94a3b8" },
      grid: { color: "rgba(255, 255, 255, 0.08)" },
    },
    y: {
      ticks: { color: "#94a3b8" },
      grid: { color: "rgba(255, 255, 255, 0.08)" },
    },
  },
};

const reportRangeOptions = [
  { id: "weekly", label: "Weekly", days: 7 },
  { id: "monthly", label: "Monthly", days: 30 },
  { id: "quarterly", label: "Quarterly", days: 90 },
];

function parseTimelineDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const fallback = new Date(`${String(value).trim()}T00:00:00+05:30`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatTimelineLabel(date, rangeId) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  if (rangeId === "quarterly") {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: rangeId === "monthly" ? "short" : undefined,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function buildTimelineChartData({ visitorEvents = [], videoAnalyses = [], salaryRecords = [], rangeId = "weekly" }) {
  const option = reportRangeOptions.find((item) => item.id === rangeId) || reportRangeOptions[0];
  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (option.days - 1));

  const buckets = [];
  for (let index = 0; index < option.days; index += 1) {
    const bucketDate = new Date(start);
    bucketDate.setDate(start.getDate() + index);
    buckets.push({
      key: bucketDate.toISOString().slice(0, 10),
      label: formatTimelineLabel(bucketDate, rangeId),
      visitors: 0,
      analyses: 0,
      salaries: 0,
    });
  }

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const applyToBucket = (dateValue, updater) => {
    const parsed = parseTimelineDate(dateValue);
    if (!parsed) {
      return;
    }
    const key = parsed.toISOString().slice(0, 10);
    const bucket = bucketMap.get(key);
    if (bucket) {
      updater(bucket);
    }
  };

  visitorEvents.forEach((event) => {
    applyToBucket(event.createdAt, (bucket) => {
      bucket.visitors += Number(event.count || 0);
    });
  });

  videoAnalyses.forEach((analysis) => {
    applyToBucket(analysis.createdAt, (bucket) => {
      bucket.analyses += 1;
    });
  });

  salaryRecords.forEach((record) => {
    applyToBucket(record.paymentDate, (bucket) => {
      bucket.salaries += Number(record.paymentAmount || 0);
    });
  });

  return {
    labels: buckets.map((bucket) => bucket.label),
    datasets: [
      {
        label: "Visitors",
        data: buckets.map((bucket) => bucket.visitors),
        borderColor: "#2f7cf6",
        backgroundColor: "rgba(47, 124, 246, 0.14)",
        fill: true,
        tension: 0.35,
      },
      {
        label: "Video checks",
        data: buckets.map((bucket) => bucket.analyses),
        borderColor: "#1da57a",
        backgroundColor: "rgba(29, 165, 122, 0.12)",
        fill: true,
        tension: 0.35,
      },
    ],
    salaryValues: buckets.map((bucket) => bucket.salaries),
  };
}


function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function formatReportDate(date) {
  if (!date) {
    return "Live now";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(date));
}

function sanitizeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAnswerComparison(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function openReportPdf(reportTitle, reportMarkup) {
  if (typeof window === "undefined") {
    return;
  }

  const previewWindow = window.open("", "_blank", "noopener,noreferrer,width=1280,height=900");

  if (!previewWindow) {
    return;
  }

  previewWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${sanitizeHtml(reportTitle)} - FloriSight Preview</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page {
            size: A4;
            margin: 14mm;
          }
          :root {
            --ink: #173127;
            --muted: #5a7064;
            --line: #d8dfd0;
            --paper: #ffffff;
            --shell: #e8efe4;
            --panel: #faf8f2;
            --panel-strong: #eef4e6;
            --accent: #1b5a40;
            --warm: #f2dfbd;
          }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: var(--shell);
            color: var(--ink);
            font-family: "Bookman Old Style", Bookman, "URW Bookman L", "Palatino Linotype", Georgia, serif;
          }
          body {
            min-height: 100vh;
          }
          .preview-toolbar {
            position: sticky;
            top: 0;
            z-index: 20;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 14px 22px;
            border-bottom: 1px solid rgba(23, 49, 39, 0.12);
            background: rgba(248, 250, 245, 0.92);
            backdrop-filter: blur(14px);
          }
          .preview-toolbar-copy {
            display: grid;
            gap: 4px;
          }
          .preview-toolbar-copy strong {
            font-size: 16px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .preview-toolbar-copy span {
            color: var(--muted);
            font-size: 12px;
          }
          .preview-toolbar-actions {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .preview-toolbar-actions button {
            min-height: 42px;
            border-radius: 999px;
            padding: 0 18px;
            border: 1px solid rgba(23, 49, 39, 0.14);
            background: var(--paper);
            color: var(--ink);
            font: inherit;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
          }
          .preview-toolbar-actions .primary {
            border-color: transparent;
            background: linear-gradient(135deg, #173127, #2d5746);
            color: #f7fbf4;
          }
          .preview-shell {
            padding: 24px 16px 36px;
            display: grid;
            place-items: start center;
          }
          .preview-frame {
            display: block;
            width: min(100%, 860px);
            height: calc(100vh - 118px);
            min-height: 720px;
            border: 0;
            border-radius: 20px;
            background: transparent;
            box-shadow: 0 28px 80px rgba(24, 52, 34, 0.12);
          }
          @media (max-width: 900px) {
            .preview-frame {
              height: calc(100vh - 106px);
              min-height: 640px;
              width: 100%;
              border-radius: 16px;
            }
          }
        </style>
      </head>
      <body>
        <div class="preview-toolbar">
          <div class="preview-toolbar-copy">
            <strong>FloriSight Report Preview</strong>
            <span>Review the A4 layout first, then print or save as PDF from the browser preview.</span>
          </div>
          <div class="preview-toolbar-actions">
            <button type="button" id="print-report-button" class="primary">Print / Save PDF</button>
            <button type="button" onclick="window.close()">Close</button>
          </div>
        </div>
        <div class="preview-shell">
          <iframe id="report-preview-frame" class="preview-frame" title="FloriSight report preview"></iframe>
        </div>
        <script>
          (function () {
            const frame = document.getElementById("report-preview-frame");
            const printButton = document.getElementById("print-report-button");
            const frameDoc = \`
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <style>
                    @page {
                      size: A4;
                      margin: 14mm;
                    }
                    :root {
                      --ink: #173127;
                      --muted: #5a7064;
                      --line: #d8dfd0;
                      --paper: #ffffff;
                      --panel: #faf8f2;
                      --panel-strong: #eef4e6;
                      --accent: #1b5a40;
                      --warm: #f2dfbd;
                    }
                    * { box-sizing: border-box; }
                    html, body {
                      margin: 0;
                      padding: 0;
                      background: #e8efe4;
                      color: var(--ink);
                      font-family: "Bookman Old Style", Bookman, "URW Bookman L", "Palatino Linotype", Georgia, serif;
                    }
                    body {
                      padding: 20px 0 32px;
                    }
                    .report-print {
                      display: grid;
                      gap: 18px;
                      width: calc(210mm - 28mm);
                      min-height: calc(297mm - 28mm);
                      margin: 0 auto;
                      padding: 0;
                      color: var(--ink);
                    }
                    .report-print > * {
                      break-inside: avoid;
                      page-break-inside: avoid;
                    }
                    .report-print-header {
                      display: flex;
                      justify-content: space-between;
                      align-items: flex-start;
                      gap: 20px;
                      padding-bottom: 14px;
                      border-bottom: 2px solid var(--ink);
                    }
                    .report-print-heading {
                      display: grid;
                      gap: 6px;
                    }
                    .report-print-heading .brand {
                      color: var(--muted);
                      font-size: 11px;
                      font-weight: 700;
                      letter-spacing: 0.18em;
                      text-transform: uppercase;
                    }
                    .report-print-heading h1 {
                      margin: 0;
                      font-size: 28px;
                      line-height: 1.1;
                    }
                    .report-print-heading p {
                      margin: 0;
                      color: var(--muted);
                      font-size: 13px;
                      line-height: 1.55;
                    }
                    .report-print-meta {
                      min-width: 180px;
                      padding: 10px 12px;
                      border: 1px solid var(--line);
                      border-radius: 12px;
                      background: var(--panel-strong);
                      text-align: right;
                      font-size: 12px;
                      font-weight: 700;
                      line-height: 1.5;
                    }
                    .report-print-grid {
                      display: grid;
                      grid-template-columns: repeat(4, minmax(0, 1fr));
                      gap: 12px;
                    }
                    .report-print-card,
                    .report-print-panel {
                      border: 1px solid var(--line);
                      border-radius: 16px;
                      background: var(--panel);
                    }
                    .report-print-card {
                      padding: 16px;
                    }
                    .report-print-card span,
                    .report-print-panel p,
                    .report-print-panel li,
                    .report-print-table td {
                      color: var(--muted);
                    }
                    .report-print-card strong {
                      display: block;
                      margin-top: 8px;
                      font-size: 22px;
                    }
                    .report-print-panels {
                      display: grid;
                      grid-template-columns: 1.55fr 1fr;
                      gap: 16px;
                    }
                    .report-print-panel {
                      padding: 18px;
                    }
                    .report-print-panel h2 {
                      margin: 0 0 12px;
                      font-size: 17px;
                    }
                    .report-print-list {
                      margin: 0;
                      padding-left: 18px;
                      display: grid;
                      gap: 8px;
                    }
                    .report-print-table {
                      width: 100%;
                      border-collapse: collapse;
                    }
                    .report-print-table th,
                    .report-print-table td {
                      padding: 8px 0;
                      border-bottom: 1px solid var(--line);
                      text-align: left;
                      font-size: 13px;
                    }
                    .report-print-table th {
                      color: var(--ink);
                      font-size: 11px;
                      letter-spacing: 0.08em;
                      text-transform: uppercase;
                    }
                    .report-print-bar {
                      height: 10px;
                      border-radius: 999px;
                      background: #e3ead8;
                      overflow: hidden;
                    }
                    .report-print-bar > span {
                      display: block;
                      height: 100%;
                      background: linear-gradient(90deg, var(--accent), #59b18d);
                    }
                    .report-print-kpi {
                      display: inline-flex;
                      align-items: center;
                      gap: 8px;
                      border-radius: 999px;
                      background: var(--warm);
                      padding: 6px 10px;
                      font-size: 12px;
                      font-weight: 700;
                    }
                    @media print {
                      html, body {
                        background: white;
                      }
                      body {
                        padding: 0;
                      }
                      .report-print {
                        width: auto;
                        min-height: auto;
                        margin: 0;
                      }
                    }
                  </style>
                </head>
                <body>
                  ${reportMarkup}
                </body>
              </html>
            \`;
            frame.srcdoc = frameDoc;
            printButton.addEventListener("click", function () {
              setTimeout(function () {
                if (frame.contentWindow) {
                  frame.contentWindow.focus();
                  frame.contentWindow.print();
                }
              }, 150);
            });
          })();
        </script>
      </body>
    </html>
  `);

  previewWindow.document.close();
}

async function downloadReportPdf(reportTitle, reportMarkup) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const tempRoot = document.createElement("div");
  tempRoot.setAttribute("aria-hidden", "true");
  tempRoot.style.position = "fixed";
  tempRoot.style.left = "-10000px";
  tempRoot.style.top = "0";
  tempRoot.style.width = "794px";
  tempRoot.style.padding = "0";
  tempRoot.style.margin = "0";
  tempRoot.style.background = "#ffffff";
  tempRoot.style.zIndex = "-1";

  tempRoot.innerHTML = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;800&family=Playfair+Display:ital,wght@0,700;1,400&display=swap" rel="stylesheet">
    <style>
      :root {
        --ink: #173127;
        --muted: #5a7064;
        --line: #d8dfd0;
        --paper: #ffffff;
        --panel: #faf8f2;
        --panel-strong: #eef4e6;
        --accent: #1b5a40;
        --warm: #f2dfbd;
      }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .report-print {
        display: grid;
        gap: 16px;
        width: 794px;
        margin: 0 auto;
        padding: 0;
        background: #ffffff;
        color: var(--ink);
        font-family: 'Outfit', sans-serif;
        box-sizing: border-box;
      }
      .report-print > * {
        width: 100%;
        margin-bottom: 8px;
      }
      .report-print-header {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-bottom: 20px;
      }
      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .logo-area {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--accent);
      }
      .logo-icon {
        color: var(--accent);
      }
      .logo-text {
        display: flex;
        flex-direction: column;
      }
      .company-name {
        font-family: 'Outfit', sans-serif;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.05em;
        line-height: 1.1;
      }
      .company-tagline {
        font-size: 8px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--muted);
      }
      .company-contact {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        font-size: 9px;
        color: var(--muted);
        text-align: right;
        line-height: 1.4;
      }
      .header-divider {
        height: 2px;
        background: linear-gradient(90deg, var(--accent), var(--warm));
        border-radius: 999px;
        margin: 4px 0;
      }
      .header-bottom {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
      }
      .report-print-heading {
        display: grid;
        gap: 4px;
        flex: 1;
      }
      .report-print-heading h1 {
        margin: 0;
        font-family: 'Playfair Display', serif;
        font-size: 24px;
        font-weight: 700;
        line-height: 1.1;
      }
      .report-print-heading p {
        margin: 4px 0 0 0;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.4;
      }
      .report-print-meta {
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel-strong);
        text-align: left;
        font-size: 9px;
        line-height: 1.5;
        color: var(--ink);
        min-width: 190px;
      }
      .report-print-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .report-print-card,
      .report-print-panel {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
      }
      .report-print-card {
        padding: 16px;
      }
      .report-print-card span,
      .report-print-panel p,
      .report-print-panel li,
      .report-print-table td {
        color: var(--muted);
      }
      .report-print-card strong {
        display: block;
        margin-top: 8px;
        font-size: 22px;
      }
      .report-print-panels {
        display: grid;
        grid-template-columns: 1.55fr 1fr;
        gap: 16px;
      }
      .report-print-panel {
        padding: 18px;
      }
      .report-print-panel h2 {
        margin: 0 0 12px;
        font-size: 17px;
      }
      .report-print-list {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 8px;
      }
      .report-print-table {
        width: 100%;
        border-collapse: collapse;
      }
      .report-print-table th,
      .report-print-table td {
        padding: 8px 0;
        border-bottom: 1px solid var(--line);
        text-align: left;
        font-size: 13px;
      }
      .report-print-table th {
        color: var(--ink);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .report-print-bar {
        height: 10px;
        border-radius: 999px;
        background: #e3ead8;
        overflow: hidden;
      }
      .report-print-bar > span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, var(--accent), #59b18d);
      }
      .report-print-kpi {
        display: inline-flex;
        margin-top: 8px;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(27, 90, 64, 0.08);
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    </style>
    ${reportMarkup}
  `;

  document.body.appendChild(tempRoot);

  try {
    const target = tempRoot.querySelector(".report-print") || tempRoot;
    const sections = Array.from(target.children).filter((el) => {
      const tag = el.tagName.toUpperCase();
      return tag !== "STYLE" && tag !== "LINK" && tag !== "SCRIPT" && tag !== "META";
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15; // 15mm margins
    const contentWidth = pageWidth - (margin * 2); // 180mm
    let currentY = margin;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      const canvas = await html2canvas(section, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (currentY + imgHeight > pageHeight - margin) {
        pdf.addPage();
        currentY = margin;
      }

      pdf.addImage(imgData, "PNG", margin, currentY, imgWidth, imgHeight);
      currentY += imgHeight + 8; // 8mm gap between sections
    }

    const safeName = String(reportTitle || "FloriSight_Report")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .replace(/^_+|_+$/g, "");

    pdf.save(`${safeName || "FloriSight_Report"}.pdf`);
  } finally {
    tempRoot.remove();
  }
}

function MetricGrid({ metrics, className = "" }) {
  return (
    <section className={className ? `metric-grid ${className}` : "metric-grid"}>
      {metrics.map(({ label, value, detail }) => (
        <article className="metric-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <p>{detail}</p>
        </article>
      ))}
    </section>
  );
}

function OverviewPeoplePanel({ groups, selectedGroupId, onSelectGroup }) {
  const selectedGroup = selectedGroupId
    ? groups.find((group) => group.id === selectedGroupId) || null
    : null;

  return (
    <>
      <section className="metric-grid overview-top-grid">
        {groups.map((group) => {
          const interactive = Boolean(group.people?.length);

          return (
            <button
              className={selectedGroup?.id === group.id ? "overview-summary-card active" : "overview-summary-card"}
              key={group.id}
              onClick={() => interactive && onSelectGroup(group.id)}
              type="button"
            >
              <span>{group.label}</span>
              <strong>{group.count}</strong>
              <p>{group.description}</p>
            </button>
          );
        })}
      </section>

      {selectedGroup ? (
        <div className="overview-modal-backdrop" onClick={() => onSelectGroup("")} role="presentation">
          <div
            className="overview-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overview-modal-title"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Selected group</p>
                <h2 id="overview-modal-title">{selectedGroup.label}</h2>
              </div>
              <button className="text-button compact-button" onClick={() => onSelectGroup("")} type="button">
                Close
              </button>
            </div>
            {selectedGroup.people?.length ? (
              <div className="overview-person-list">
                {selectedGroup.people.map((person) => (
                  <div className="overview-person-card" key={person.id}>
                    <strong>{person.name}</strong>
                    <span>{person.email}</span>
                    {person.meta ? <em>{person.meta}</em> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No people available in this group.</div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function WorkerTable({ rows }) {
  return (
    <div className="data-table">
      <div className="data-row table-head">
        <span>Worker</span>
        <span>Zone</span>
        <span>Task</span>
        <span>Status</span>
        <span>Progress</span>
      </div>
      {rows.map((worker) => (
        <div className="data-row" key={worker.id}>
          <span>
            <strong>{worker.name}</strong>
            <em>{worker.email}</em>
          </span>
          <span>{worker.zone}</span>
          <span>{worker.task}</span>
          <span>{worker.status}</span>
          <span>
            <div className="progress">
              <span style={{ width: worker.progress }} />
            </div>
            <em>{worker.progress}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

function ActivityPanel({ title, rows }) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Recent activity</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="activity-list">
        {rows.map(([time, person, tag, text]) => (
          <div className="activity-item" key={`${time}-${person}-${tag}`}>
            <span>{time}</span>
            <strong>{person}</strong>
            <em>{tag}</em>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function ChatFeed({ rows, emptyMessage, currentUserId, variant = "default" }) {
  if (!rows.length) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className={variant === "whatsapp" ? "wa-body" : "chat-list"}>
      {rows.map((row, index) => {
        const isOwn = row.senderId === currentUserId;
        const msgId = row.id || `${row.senderName}-${row.timeLabel}-${index}`;
        const initials = String(row.senderName || "U")
          .split(" ")
          .map((part) => part[0] || "")
          .join("")
          .slice(0, 2)
          .toUpperCase();

        return (
          <div className={variant === "whatsapp"
            ? `wa-message ${isOwn ? "own-message" : "other-message"}`
            : `chat-message ${isOwn ? "own-message" : "other-message"}`}
            key={msgId}
          >
            {variant === "whatsapp" ? null : <div className="avatar" aria-hidden>{initials}</div>}
            <div className={variant === "whatsapp" ? "wa-bubble" : "chat-bubble"}>
              {variant === "whatsapp" ? (
                <span className="wa-sender">
                  {row.senderName}
                  {row.tag ? <em className="chat-chip">{row.tag}</em> : null}
                </span>
              ) : (
                <div className="chat-meta">
                  <span className="chat-sender">{row.senderName}</span>
                  <span className="chat-time">{row.timeLabel}</span>
                </div>
              )}
              {row.text ? <p className={variant === "whatsapp" ? "wa-text" : ""}>{row.text}</p> : null}
              {row.imageUrl && (
                <img
                  className={variant === "whatsapp" ? "wa-photo" : "chat-photo"}
                  src={row.imageUrl}
                  alt={`Attachment from ${row.senderName}`}
                />
              )}
              {variant === "whatsapp" ? (
                <div className="wa-meta">
                  <span className="wa-time">{row.timeLabel}</span>
                  {isOwn ? (
                    <span className="wa-ticks" aria-hidden>
                      <CheckCheck size={14} />
                    </span>
                  ) : null}
                </div>
              ) : (
                <>
                  {row.tag ? <em className="chat-chip">{row.tag}</em> : null}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessagesPanel({ chatMessages = [], onSend, isSending, currentUser, allowedTags = null, title = "Operations feed", supervisors = [], workers = [], customGroups = [], users = [] }) {
  const [editingMessage, setEditingMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [localCustomGroups, setLocalCustomGroups] = useState(customGroups);
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  useEffect(() => {
    setLocalCustomGroups((prev) => {
      const existingIds = new Set(prev.map((g) => g.id));
      const merged = [...prev];
      for (const g of customGroups) {
        if (!existingIds.has(g.id)) merged.push(g);
      }
      return merged;
    });
  }, [customGroups]);

  const groups = supervisors.length > 0
    ? supervisors.map(s => {
        const myWorkers = workers.filter(w => w.supervisorId === s.id);
        const participantList = [
          { name: s.name || s.zone, role: "Supervisor" },
          ...myWorkers.map(w => ({ name: w.name || "Worker", role: w.task || "Worker" }))
        ];
        const memberIds = new Set([s.id, ...myWorkers.map(w => w.id)]);
        return { 
          id: s.id, 
          name: `${s.name || s.zone}'s Team`, 
          zone: s.zone,
          participants: participantList,
          memberIds,
        };
      })
    : [];
    
  const allGroups = [
    ...(supervisors.length > 0 ? groups : [{ id: 'general', name: title, participants: workers, memberIds: null, type: 'general' }]),
    ...localCustomGroups.map(cg => ({
      id: cg.id,
      name: cg.name,
      zone: 'Custom Group',
      participants: cg.members.map(m => {
        const u = users.find(user => user.id === m.id);
        return { id: m.id, name: u?.name || m.id, role: u?.role || 'Member' };
      }),
      memberIds: new Set(cg.members.map(m => m.id)),
      type: 'custom',
      createdBy: cg.createdBy
    }))
  ];

  const visibleGroups = allGroups.filter(g => {
    if (currentUser?.role === "Admin") return true;
    if (g.type === 'general') return currentUser?.role !== "Worker";
    return g.memberIds?.has(currentUser?.id);
  });

  const [activeGroupId, setActiveGroupId] = useState(visibleGroups[0]?.id);
  const activeGroup = visibleGroups.find(g => g.id === activeGroupId) || visibleGroups[0];

  const handleGroupSwitch = (groupId) => {
    setActiveGroupId(groupId);
  };

  // Filter messages per group
  const getGroupMessages = (group) => {
    if (!group) return [];
    if (!group.memberIds) return chatMessages; // 'general' group shows all
    if (group.type === 'custom') {
      return chatMessages.filter(msg => msg.groupId === group.id);
    }
    return chatMessages.filter(msg =>
      (!msg.groupId) && (
        group.memberIds.has(msg.senderId) ||
        group.memberIds.has(msg.supervisorId) ||
        group.memberIds.has(msg.workerId) ||
        msg.supervisorId === group.id
      )
    );
  };

  const toggleMember = (id) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    const members = Array.from(selectedMemberIds);
    if (!name || members.length === 0) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/chat/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, members }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Unable to create group.");
      }
      setLocalCustomGroups((prev) => [...prev, data.group]);
      setActiveGroupId(data.group.id);
      setShowCreateModal(false);
      setNewGroupName("");
      setSelectedMemberIds(new Set());
    } catch (err) {
      alert(err.message);
    } finally {
      setIsCreating(false);
    }
  }

  const activeGroupMessages = getGroupMessages(activeGroup);

  // Build a map of groupId -> last message for sidebar preview
  const groupLastMessage = {};
  for (const g of visibleGroups) {
    const msgs = getGroupMessages(g);
    if (msgs.length > 0) {
      groupLastMessage[g.id] = msgs[msgs.length - 1];
    }
  }

  const filteredGroups = visibleGroups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <section className="dashboard-grid">
      <article className="panel large-panel wa-panel dashboard-chat-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Team communication</p>
            <h2>{activeGroup?.name || title}</h2>
          </div>
        </div>

        <div className="wa-layout">
          <aside className="wa-sidebar-chatlist">
            <div className="wa-chatlist-header">
              <strong>Chats</strong>
              <button className="wa-icon-btn" type="button" aria-label="Create group" onClick={() => setShowCreateModal(true)}>
                <Plus size={18} />
              </button>
            </div>
            <div className="wa-chatlist-search">
              <div className="wa-chatlist-search-inner">
                <Search size={16} />
                <input
                  aria-label="Search groups"
                  placeholder="Search groups"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="wa-chatlist-content">
              {filteredGroups.map((group) => {
                const lastMessage = groupLastMessage[group.id];
                return (
                  <button
                    key={group.id}
                    type="button"
                    className={`wa-chat-item ${activeGroupId === group.id ? "active" : ""}`}
                    onClick={() => handleGroupSwitch(group.id)}
                  >
                    <div className="wa-chat-item-avatar" aria-hidden>
                      {String(group.name || "G").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="wa-chat-item-info">
                      <div className="wa-chat-item-top">
                        <strong>{group.name}</strong>
                        <span>{lastMessage?.timeLabel || "Live"}</span>
                      </div>
                      <div className="wa-chat-item-bottom">
                        {lastMessage?.text ? (
                          <>
                            <span className="wa-chat-preview-sender">{lastMessage.senderName}: </span>
                            {lastMessage.text}
                          </>
                        ) : (
                          group.zone || `${group.participants?.length || 0} members`
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="wa-chat-area">
            <div className="wa-header">
              <div 
                className="wa-header-left" 
                onClick={() => setShowGroupInfo(!showGroupInfo)}
                style={{ cursor: "pointer" }}
              >
                <div className="wa-avatar" aria-hidden>
                  {String(activeGroup?.name || "G").slice(0, 1).toUpperCase()}
                </div>
                <div className="wa-header-info">
                  <h2>{activeGroup?.name || title}</h2>
                  <span>{activeGroup?.zone || `${activeGroup?.participants?.length || 0} members in conversation`}</span>
                </div>
              </div>
              <div className="wa-header-actions">
                <button type="button" aria-label="Search conversation">
                  <Search size={18} />
                </button>
                <button 
                  type="button" 
                  aria-label="Conversation info"
                  onClick={() => setShowGroupInfo(!showGroupInfo)}
                >
                  <Info size={18} />
                </button>
              </div>
            </div>

            <ChatFeed
              rows={activeGroupMessages}
              emptyMessage={activeGroup ? `No live communication yet in ${activeGroup.name}.` : "You are not a member of any group yet."}
              currentUserId={currentUser?.id}
              variant="whatsapp"
            />

            {activeGroup ? (
              <LiveComposer
                onSend={(payload) => {
                  const isCustom = activeGroup?.type === "custom";
                  const isGeneral = activeGroup?.id === "general";
                  onSend({
                    ...payload,
                    targetSupervisorId: !isCustom && !isGeneral ? activeGroup?.id : null,
                    groupId: isCustom ? activeGroup?.id : null,
                  });
                }}
                isSending={isSending}
                defaultTag="Update"
                allowedTags={allowedTags}
                editingMessage={editingMessage}
                onCancelEdit={() => setEditingMessage(null)}
              />
            ) : null}
          </div>

          <aside className={`wa-sidebar-info ${showGroupInfo ? "open" : ""}`}>
            <div className="wa-sidebar-header">
              <button 
                className="wa-icon-btn" 
                type="button" 
                aria-label="Close panel" 
                onClick={() => setShowGroupInfo(false)}
              >
                <X size={18} />
              </button>
              <h2>Group info</h2>
            </div>
            
            <div className="wa-sidebar-content">
              <div className="wa-sidebar-section" style={{ textAlign: "center" }}>
                <div className="wa-sidebar-avatar" aria-hidden>
                  {String(activeGroup?.name || "G").slice(0, 1).toUpperCase()}
                </div>
                <h3 className="wa-sidebar-title">{activeGroup?.name || "Group"}</h3>
                <p className="wa-sidebar-subtitle">
                  {activeGroup?.zone || `${activeGroup?.participants?.length || 0} members`}
                </p>
              </div>

              {activeGroup ? (
                <div className="wa-sidebar-section">
                  <h4 className="wa-sidebar-section-title">
                    Members ({activeGroup.participants?.length || 0})
                  </h4>
                  <div className="wa-participant-list">
                    {activeGroup.participants?.map((participant, index) => (
                      <div key={index} className="wa-participant-item">
                        <div className="wa-participant-avatar" aria-hidden>
                          {String(participant.name || "M").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="wa-participant-info">
                          <strong>{participant.name}</strong>
                          <span>{participant.role}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </article>
      {showCreateModal && (
        <div className="group-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="group-modal" onClick={(e) => e.stopPropagation()}>
            <div className="group-modal-header">
              <h3>New group</h3>
              <button className="wa-icon-btn" type="button" aria-label="Close" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="group-modal-body">
              <label className="group-modal-label">
                Group name
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Enter group name"
                />
              </label>
              <strong className="group-modal-section-title">Select members</strong>
              <div className="group-modal-user-list">
                {users.map((u) => (
                  <label key={u.id} className="group-modal-user-row">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(u.id)}
                      onChange={() => toggleMember(u.id)}
                    />
                    <div className="wa-chat-item-avatar" aria-hidden>
                      {String(u.name || "U").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="group-modal-user-info">
                      <span className="group-modal-user-name">{u.name}</span>
                      <span className="group-modal-user-role">{u.role}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="group-modal-footer">
              <button type="button" className="group-modal-btn-secondary" onClick={() => setShowCreateModal(false)} disabled={isCreating}>
                Cancel
              </button>
              <button type="button" className="group-modal-btn-primary" onClick={handleCreateGroup} disabled={isCreating || !newGroupName.trim() || selectedMemberIds.size === 0}>
                {isCreating ? "Creating..." : "Create group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FarmMapPanel({ zoneStats = [] }) {
  const zoneClasses = {
    "Visitor Gate": "gate",
    "Greenhouse A": "greenhouse",
    "Packing Unit": "packing",
    "Nursery Bay": "nursery",
  };

  const dots = [
    { className: "d1", delay: 0 },
    { className: "d2", delay: 0.1 },
    { className: "d3", delay: 0.2 },
    { className: "d4", delay: 0.3 },
  ];

  return (
    <article className="panel large-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Live farm map</p>
          <h2>Zone activity visualization</h2>
        </div>
        <span className="live-pill">Live</span>
      </div>
      <div className="dashboard-map">
        {zoneStats.map((zone) => (
          <div className={`map-zone ${zoneClasses[zone.zone] || ""}`} key={zone.zone}>
            <strong>{zone.zone}</strong>
            <span>{zone.visitors} visitors</span>
          </div>
        ))}
        {dots.map((dot) => (
          <motion.div
            key={dot.className}
            className={`map-dot ${dot.className}`}
            animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.45, 1, 0.45] }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2.4, delay: dot.delay }}
          />
        ))}
      </div>
      <div className="zone-list">
        {zoneStats.map((zone) => (
          <div key={zone.zone}>
            <span>{zone.zone}</span>
            <strong>{zone.visitors} visitors</strong>
            <em>{zone.workers} workers</em>
          </div>
        ))}
      </div>
    </article>
  );
}

function WeatherWidget({ className = "", style = {} }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=12.9719&longitude=77.5937&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FKolkata");
        const data = await res.json();
        if (!cancelled) setWeather(data.current);
      } catch (_e) { /* ignore */ }
      if (!cancelled) setLoading(false);
    }
    fetchWeather();
    const id = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const code = weather?.weather_code ?? -1;
  const label =
    code === 0 ? "Clear sky" :
    code === 1 ? "Mainly clear" :
    code === 2 ? "Partly cloudy" :
    code === 3 ? "Overcast" :
    [45,48].includes(code) ? "Fog" :
    [51,53,55,56,57].includes(code) ? "Drizzle" :
    [61,63,65,66,67,80,81,82].includes(code) ? "Rain" :
    [71,73,75,77,85,86].includes(code) ? "Snow" :
    [95,96,99].includes(code) ? "Thunderstorm" :
    "—";

  const conditionClass =
    [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)
      ? "is-rainy"
      : [1,2,3,45,48].includes(code)
      ? "is-cloudy"
      : code === 0
      ? "is-clear"
      : "is-cloudy";

  return (
    <article className={`panel weather-widget ${conditionClass} ${className}`} style={{ gridColumn: "1 / -1", ...style }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Live conditions</p>
          <h2>Farm weather — Bengaluru</h2>
        </div>
        <span className="live-pill">Live</span>
      </div>

      <div className="weather-stage">
        <div className="weather-stat weather-stat-left">
          <span className="weather-stat-label">Temperature</span>
          <p className="weather-stat-value">
            {loading ? "—" : `${weather?.temperature_2m ?? "—"}°C`}
          </p>
        </div>

        <div className="weather-stat weather-stat-middle">
          <span className="weather-stat-label">Humidity</span>
          <p className="weather-stat-value">
            {loading ? "—" : `${weather?.relative_humidity_2m ?? "—"}%`}
          </p>
        </div>

        <div className="weather-stat weather-stat-right">
          <div className="weather-stat-info">
            <span className="weather-stat-label">Condition</span>
            <p className="weather-condition-value">{label}</p>
          </div>
          <div className="weather-visual" aria-hidden="true">
            <div className="weather-visual-inner">
              <div className="weather-halo" />
              <div className="weather-sun" />
              <div className="weather-cloud weather-cloud-back" />
              <div className="weather-cloud weather-cloud-main" />
              <div className="weather-cloud weather-cloud-front" />
              <div className="weather-rain">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="weather-mist" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function buildHistoricalTrackingHistory(analyses = [], zoneFilter = "") {
  const normalizedZone = String(zoneFilter || "").trim().toLowerCase();

  return analyses
    .filter((analysis) => {
      const analysisZone = String(analysis?.zone || "").trim().toLowerCase();
      if (normalizedZone && analysisZone && analysisZone !== normalizedZone) {
        return false;
      }

      const summary = analysis?.summary || {};
      const total = Math.max(
        Number(analysis?.visitorCount || 0),
        Number(summary?.effectiveVisitorCount || 0),
        Number(summary?.visitorCount || 0),
        Number(summary?.trackCount || 0)
      );

      return total > 0;
    })
    .slice(0, 6)
    .map((analysis) => {
    const summary = analysis?.summary || {};
    const total = Math.max(
      Number(analysis?.visitorCount || 0),
      Number(summary?.effectiveVisitorCount || 0),
      Number(summary?.visitorCount || 0),
      Number(summary?.trackCount || 0)
    );

    return {
      id: `analysis-${analysis.id}`,
      type: "analysis",
      zone: analysis.zone || "Visitor Gate",
      startedAt: analysis.createdAt || null,
      count: total,
      status: analysis.status || "completed",
      label: analysis.fileName || "Past tracking analysis",
    };
  });
}

function CropInventoryPanel({ crops, zones, onCreate, onUpdate, onDelete, canEdit, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", variety: "", zone: "", quantity: 0, growthStage: "Seed", healthStatus: "Healthy", plantedDate: "", expectedHarvest: "", notes: "", bed: "", cost: "", price: "", batchCode: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStageFilter, setActiveStageFilter] = useState(null);

  function startEdit(crop) {
    setEditingId(crop.id);
    setForm({
      name: crop.name || "",
      variety: crop.variety || "",
      zone: crop.zone || "",
      quantity: crop.quantity || 0,
      growthStage: crop.growthStage || "Seed",
      healthStatus: crop.healthStatus || "Healthy",
      plantedDate: crop.plantedDate || "",
      expectedHarvest: crop.expectedHarvest || "",
      notes: crop.notes || "",
      bed: crop.bed || "",
      cost: crop.cost !== null && crop.cost !== undefined ? String(crop.cost) : "",
      price: crop.price !== null && crop.price !== undefined ? String(crop.price) : "",
      batchCode: crop.batchCode || "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", variety: "", zone: "", quantity: 0, growthStage: "Seed", healthStatus: "Healthy", plantedDate: "", expectedHarvest: "", notes: "", bed: "", cost: "", price: "", batchCode: "" });
    setShowForm(false);
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.batchCode.trim()) return;
    const payload = {
      ...form,
      cost: form.cost ? Number(form.cost) : null,
      price: form.price ? Number(form.price) : null,
    };
    if (editingId) {
      await onUpdate(editingId, payload);
    } else {
      await onCreate(payload);
    }
    resetForm();
  }

  const growthOptions = ["Seed", "Germination", "Growth", "Blooming", "Harvest", "Packaging"];
  const healthOptions = ["Healthy", "Needs attention", "Diseased", "Recovering"];
  const uniqueZones = [...new Set([...zones, ...crops.map((c) => c.zone)].filter(Boolean))];

  const getNormalizedStage = (stageStr) => {
    const s = String(stageStr || "").trim().toLowerCase();
    if (s.startsWith("seed")) return "seed";
    if (s.startsWith("germ")) return "germination";
    if (s.startsWith("grow") || s === "vegetative") return "growth";
    if (s.startsWith("bloom") || s === "flowering") return "blooming";
    if (s.startsWith("harv") || s === "mature") return "harvest";
    if (s.startsWith("pack")) return "packaging";
    return s;
  };

  const getStageStats = (stageId) => {
    const stageCrops = crops.filter(c => getNormalizedStage(c.growthStage) === stageId);
    const count = stageCrops.length;
    const units = stageCrops.reduce((sum, c) => sum + (c.quantity || 0), 0);
    return { count, units };
  };

  const STAGES = [
    { id: "seed", label: "SEED", color: "#6366f1", dotColor: "#6366f1" },
    { id: "germination", label: "GERMINATION", color: "#a855f7", dotColor: "#a855f7" },
    { id: "growth", label: "GROWTH", color: "#22c55e", dotColor: "#22c55e" },
    { id: "blooming", label: "BLOOMING", color: "#eab308", dotColor: "#eab308" },
    { id: "harvest", label: "HARVEST", color: "#ef4444", dotColor: "#ef4444" },
    { id: "packaging", label: "PACKAGING", color: "#3b82f6", dotColor: "#3b82f6" }
  ];

  const filteredCrops = crops.filter(crop => {
    if (activeStageFilter) {
      if (getNormalizedStage(crop.growthStage) !== activeStageFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        String(crop.name || "").toLowerCase().includes(q) ||
        String(crop.variety || "").toLowerCase().includes(q) ||
        String(crop.batchCode || "").toLowerCase().includes(q) ||
        String(crop.bed || "").toLowerCase().includes(q) ||
        String(crop.zone || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    let cleanDateStr = dateStr;
    if (typeof dateStr === "string" && dateStr.includes("T")) {
      cleanDateStr = dateStr.split("T")[0];
    }
    const parts = String(cleanDateStr).split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-GB");
    } catch {
      return dateStr;
    }
  };

  const formatCropCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  };

  const getStageBadgeStyle = (stage) => {
    const normalized = getNormalizedStage(stage);
    switch (normalized) {
      case "seed":
        return { bg: "rgba(99, 102, 241, 0.15)", color: "#818cf8", border: "1px solid rgba(99, 102, 241, 0.3)" };
      case "germination":
        return { bg: "rgba(168, 85, 247, 0.15)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.3)" };
      case "growth":
        return { bg: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)" };
      case "blooming":
        return { bg: "rgba(234, 179, 8, 0.15)", color: "#facc15", border: "1px solid rgba(234, 179, 8, 0.3)" };
      case "harvest":
        return { bg: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)" };
      case "packaging":
        return { bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)" };
      default:
        return { bg: "rgba(148, 163, 184, 0.15)", color: "#94a3b8", border: "1px solid rgba(148, 163, 184, 0.3)" };
    }
  };

  const handleExportExcel = () => {
    const headers = ["Batch Name", "Batch Code", "Stage", "Quantity", "Bed", "Planted Date", "Expected Harvest", "Cost", "Price", "Notes"];
    const rows = filteredCrops.map(c => [
      c.name,
      c.batchCode || "",
      c.growthStage,
      c.quantity,
      c.bed || "—",
      c.plantedDate || "—",
      c.expectedHarvest || "—",
      c.cost || 0,
      c.price || 0,
      c.notes || ""
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plant_stock_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = async () => {
    const rowsMarkup = filteredCrops.map(c => `
      <tr>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${c.name} (${c.batchCode || '—'})</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${c.growthStage}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${c.quantity}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${c.bed || '—'}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${formatDate(c.plantedDate)}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${formatDate(c.expectedHarvest)}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${formatCropCurrency(c.cost)}</td>
        <td style="padding: 8px; border: 1px solid #cbd5e1;">${formatCropCurrency(c.price)}</td>
      </tr>
    `).join("");

    const markup = `
      <div class="report-print" style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; width: 750px;">
        <h1 style="font-size: 24px; margin-bottom: 4px; color: #0f172a;">FloriSight Plant Stock</h1>
        <p style="font-size: 13px; color: #64748b; margin-top: 0; margin-bottom: 24px;">Generated on ${new Date().toLocaleDateString("en-IN")}</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; border: 1px solid #cbd5e1;">
          <thead>
            <tr style="border-bottom: 2px solid #cbd5e1; background-color: #f8fafc;">
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">BATCH / VARIETY</th>
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">STAGE</th>
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">QTY</th>
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">BED</th>
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">PLANTED</th>
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">HARVEST</th>
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">COST</th>
              <th style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">PRICE</th>
            </tr>
          </thead>
          <tbody>
            ${rowsMarkup}
          </tbody>
        </table>
      </div>
    `;

    await downloadReportPdf(`Plant Stock Inventory`, markup);
  };

  return (
    <section className="dashboard-grid">
      <style>{`
        .plant-stock-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .plant-stock-header h2 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: var(--text);
        }
        .plant-stock-header p {
          font-size: 14px;
          color: var(--muted);
          margin: 4px 0 0 0;
        }
        .plant-stock-actions {
          display: flex;
          gap: 10px;
        }
        .plant-stock-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid var(--line);
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.03);
          color: var(--text);
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .btn-primary {
          background: #22c55e;
          border-color: #22c55e;
          color: #fff;
        }
        .btn-primary:hover {
          background: #16a34a;
          border-color: #16a34a;
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
        }
        .stage-cards-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stage-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .stage-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.04);
        }
        .stage-card.active {
          border-color: var(--accent);
          background: rgba(34, 197, 94, 0.05);
          box-shadow: 0 0 12px rgba(34, 197, 94, 0.15);
        }
        .stage-card-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 12px;
        }
        .stage-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .stage-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--muted);
          letter-spacing: 0.05em;
        }
        .stage-batches {
          font-size: 24px;
          font-weight: 700;
          color: var(--text);
          margin: 0;
          line-height: 1;
        }
        .stage-units {
          font-size: 12px;
          color: var(--muted);
          margin: 4px 0 0 0;
        }
        .search-container {
          position: relative;
          margin-bottom: 20px;
        }
        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
        }
        .search-input {
          width: 100%;
          padding: 12px 16px 12px 42px;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--line);
          border-radius: 8px;
          color: var(--text);
          outline: none;
          transition: all 0.2s;
        }
        .search-input:focus {
          border-color: var(--accent);
          background: rgba(255, 255, 255, 0.04);
        }
        .stock-table-container {
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.01);
        }
        .stock-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .stock-table th {
          padding: 14px 16px;
          font-size: 11px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 1px solid var(--line);
          background: rgba(0, 0, 0, 0.15);
        }
        .stock-table td {
          padding: 16px;
          font-size: 13px;
          color: var(--text);
          border-bottom: 1px solid var(--line);
          vertical-align: middle;
        }
        .stock-table tr:last-child td {
          border-bottom: none;
        }
        .stock-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }
        .variety-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .variety-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
        }
        .variety-details {
          display: flex;
          flex-direction: column;
        }
        .variety-name {
          font-size: 14px;
          font-weight: 600;
        }
        .variety-code {
          font-size: 11px;
          color: var(--muted);
          margin-top: 2px;
        }
        .stage-badge {
          display: inline-flex;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          text-transform: capitalize;
        }
        .qty-cell {
          font-size: 14px;
          font-weight: 700;
        }
        .bed-cell {
          font-family: monospace;
          font-size: 13px;
        }
        .actions-cell-menu {
          display: flex;
          gap: 6px;
        }
        .actions-cell-btn {
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .actions-cell-btn:hover {
          color: var(--text);
          background: rgba(255, 255, 255, 0.08);
        }
        .form-label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 500;
          color: var(--muted);
        }
        .empty-state {
          padding: 48px;
          text-align: center;
          color: var(--muted);
        }
      `}</style>

      <article className="panel large-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="plant-stock-header">
          <div>
            <p className="eyebrow">Floriculture inventory</p>
            <h2>Plant Stock</h2>
            <p>Track plants from seed to harvest</p>
          </div>
          {canEdit && (
            <div className="plant-stock-actions">
              <button className="plant-stock-btn btn-secondary" onClick={handleExportPdf} type="button">
                <FileDown size={14} /> Export PDF
              </button>
              <button className="plant-stock-btn btn-secondary" onClick={handleExportExcel} type="button">
                <FileDown size={14} /> Export Excel
              </button>
              {onRefresh && (
                <button className="plant-stock-btn btn-secondary" onClick={onRefresh} type="button">
                  <RefreshCw size={14} /> Refresh
                </button>
              )}
              <button className="plant-stock-btn btn-primary" onClick={() => setShowForm(true)} type="button">
                <Plus size={16} /> Add Batch
              </button>
            </div>
          )}
        </div>

        <section className="stage-cards-grid">
          {STAGES.map(stage => {
            const stats = getStageStats(stage.id);
            const isActive = activeStageFilter === stage.id;
            return (
              <div 
                key={stage.id} 
                className={`stage-card ${isActive ? 'active' : ''}`}
                onClick={() => setActiveStageFilter(isActive ? null : stage.id)}
              >
                <div className="stage-card-header">
                  <span className="stage-dot" style={{ backgroundColor: stage.color }} />
                  <span className="stage-title">{stage.label}</span>
                </div>
                <strong className="stage-batches">{stats.count}</strong>
                <p className="stage-units">{stats.units.toLocaleString()} units</p>
              </div>
            );
          })}
        </section>

        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search batches or varieties..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="stock-table-container">
          <table className="stock-table">
            <thead>
              <tr>
                <th>BATCH / VARIETY</th>
                <th>STAGE</th>
                <th>QUANTITY</th>
                <th>BED</th>
                <th>PLANTED</th>
                <th>EXPECTED HARVEST</th>
                <th>COST</th>
                <th>PRICE</th>
                {canEdit && <th>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {filteredCrops.length ? filteredCrops.map((crop) => {
                const badge = getStageBadgeStyle(crop.growthStage);
                return (
                  <tr key={crop.id}>
                    <td>
                      <div className="variety-cell">
                        <div className="variety-icon-wrap">
                          <Sprout size={16} />
                        </div>
                        <div className="variety-details">
                          <strong className="variety-name">{crop.name}</strong>
                          <span className="variety-code">{crop.batchCode || crop.variety || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="stage-badge" style={{ backgroundColor: badge.bg, color: badge.color, border: badge.border }}>
                        {crop.growthStage}
                      </span>
                    </td>
                    <td>
                      <span className="qty-cell">{crop.quantity?.toLocaleString() || 0}</span>
                    </td>
                    <td>
                      <span className="bed-cell">{crop.bed || "—"}</span>
                    </td>
                    <td>{formatDate(crop.plantedDate)}</td>
                    <td>{formatDate(crop.expectedHarvest)}</td>
                    <td>{formatCropCurrency(crop.cost)}</td>
                    <td>{formatCropCurrency(crop.price)}</td>
                    {canEdit && (
                      <td>
                        <div className="actions-cell-menu">
                          <button className="actions-cell-btn" onClick={() => startEdit(crop)} type="button" title="Edit batch">
                            <Edit2 size={14} />
                          </button>
                          <button className="actions-cell-btn" onClick={() => onDelete(crop.id)} type="button" title="Delete batch" style={{ color: "rgba(239, 68, 68, 0.8)" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={canEdit ? 9 : 8}>
                    <div className="empty-state">No matching plant batches found.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {showForm && (
        <div className="overview-modal-backdrop" onClick={resetForm} role="presentation">
          <div 
            className="overview-modal" 
            onClick={(event) => event.stopPropagation()} 
            role="dialog" 
            aria-modal="true"
            style={{ maxWidth: "680px", width: "95%" }}
          >
            <div className="panel-heading" style={{ marginBottom: "20px" }}>
              <div>
                <p className="eyebrow">{editingId ? "Update batch" : "Create batch"}</p>
                <h2>{editingId ? "Edit Plant Batch" : "Add Plant Batch"}</h2>
              </div>
              <button className="text-button compact-button" onClick={resetForm} type="button">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div>
                  <label className="form-label">Batch Name</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Red Rose" required />
                </div>
                <div>
                  <label className="form-label">Batch Code</label>
                  <input className="form-input" value={form.batchCode} onChange={(e) => setForm((f) => ({ ...f, batchCode: e.target.value }))} placeholder="e.g. ROSE-RED-2024-001" required />
                </div>
                <div>
                  <label className="form-label">Variety</label>
                  <input className="form-input" value={form.variety} onChange={(e) => setForm((f) => ({ ...f, variety: e.target.value }))} placeholder="e.g. Hybrid Tea" />
                </div>
                <div>
                  <label className="form-label">Zone</label>
                  <select className="form-input" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} required>
                    <option value="">Select zone</option>
                    {uniqueZones.map((z) => (<option key={z} value={z}>{z}</option>))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Bed / Location</label>
                  <input className="form-input" value={form.bed} onChange={(e) => setForm((f) => ({ ...f, bed: e.target.value }))} placeholder="e.g. B-01" />
                </div>
                <div>
                  <label className="form-label">Quantity</label>
                  <input className="form-input" type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} min="1" required />
                </div>
                <div>
                  <label className="form-label">Growth Stage</label>
                  <select className="form-input" value={form.growthStage} onChange={(e) => setForm((f) => ({ ...f, growthStage: e.target.value }))}>
                    {growthOptions.map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Health Status</label>
                  <select className="form-input" value={form.healthStatus} onChange={(e) => setForm((f) => ({ ...f, healthStatus: e.target.value }))}>
                    {healthOptions.map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Cost per unit (₹)</label>
                  <input className="form-input" type="number" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} placeholder="e.g. 2.50" />
                </div>
                <div>
                  <label className="form-label">Price per unit (₹)</label>
                  <input className="form-input" type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g. 8.00" />
                </div>
                <div>
                  <label className="form-label">Planted Date</label>
                  <input className="form-input" type="date" value={form.plantedDate} onChange={(e) => setForm((f) => ({ ...f, plantedDate: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Expected Harvest</label>
                  <input className="form-input" type="date" value={form.expectedHarvest} onChange={(e) => setForm((f) => ({ ...f, expectedHarvest: e.target.value }))} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this crop batch..." style={{ minHeight: "60px", resize: "vertical" }} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button className="plant-stock-btn btn-secondary" onClick={resetForm} type="button">
                  Cancel
                </button>
                <button className="plant-stock-btn btn-primary" type="submit">
                  {editingId ? "Save Changes" : "Create Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function LeaveRequestsPanel({ requests, workers, role, onCreate, onReview, currentUser }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "", leaveType: "Sick", supervisorId: "" });

  async function handleSubmit() {
    if (!form.startDate || !form.endDate || !form.reason.trim()) return;
    await onCreate({ ...form, supervisorId: form.supervisorId || currentUser?.supervisorId });
    setShowForm(false);
    setForm({ startDate: "", endDate: "", reason: "", leaveType: "Sick", supervisorId: "" });
  }

  const supervisors = [...new Set(workers.map((w) => w.supervisorId).filter(Boolean))];
  const isWorker = role === "Worker";

  return (
    <section className="dashboard-grid">
      <article className="panel large-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Time off</p>
            <h2>Leave requests</h2>
          </div>
          {isWorker ? (
            <button className="primary-link" onClick={() => setShowForm(true)} type="button">
              <Plus size={16} style={{ marginRight: 6 }} /> Request leave
            </button>
          ) : null}
        </div>

        {showForm && isWorker ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginTop: "16px", padding: "16px", border: "1px solid #e0e0e0", borderRadius: "12px", background: "#fafbfc" }}>
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>From</label>
              <input className="form-input" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>To</label>
              <input className="form-input" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>Type</label>
              <select className="form-input" value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}>
                {["Sick", "Casual", "Emergency", "Personal"].map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>Supervisor</label>
              <select className="form-input" value={form.supervisorId} onChange={(e) => setForm((f) => ({ ...f, supervisorId: e.target.value }))}>
                <option value="">Select supervisor</option>
                {supervisors.map((sid) => {
                  const sup = workers.find((w) => w.supervisorId === sid);
                  return <option key={sid} value={sid}>{sup?.supervisorName || sid}</option>;
                })}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>Reason</label>
              <input className="form-input" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Brief reason for leave..." />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
              <button className="primary-link" onClick={handleSubmit} type="button">Submit request</button>
              <button className="secondary-link" onClick={() => setShowForm(false)} type="button">Cancel</button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {requests.length ? requests.map((req) => (
            <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #e8e8e8", borderRadius: "10px", background: "#fff" }}>
              <div>
                <strong style={{ fontSize: 15 }}>{req.workerName}</strong>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 0" }}>
                  {req.leaveType} · {req.startDate} to {req.endDate} · {req.reason}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className={`status-pill ${req.status.toLowerCase()}`}>{req.status}</span>
                {!isWorker && req.status === "Pending" ? (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button className="primary-link" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onReview(req.id, "Approved")} type="button">Approve</button>
                    <button className="secondary-link" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onReview(req.id, "Rejected")} type="button">Reject</button>
                  </div>
                ) : null}
              </div>
            </div>
          )) : <p style={{ color: "var(--muted)" }}>No leave requests found.</p>}
        </div>
      </article>
    </section>
  );
}

function EquipmentPanel({ equipment, maintenanceLogs, zones, canEdit, onCreate, onUpdate, onDelete, onAddMaintenance }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({ name: "", type: "", zone: "", status: "Operational", purchaseDate: "", lastServiceDate: "", nextServiceDate: "", notes: "" });
  const [maintForm, setMaintForm] = useState({ serviceType: "Routine", description: "", cost: "", performedDate: "", nextDueDate: "" });

  function startEdit(item) {
    setEditingId(item.id);
    setForm({ name: item.name || "", type: item.type || "", zone: item.zone || "", status: item.status || "Operational", purchaseDate: item.purchaseDate || "", lastServiceDate: item.lastServiceDate || "", nextServiceDate: item.nextServiceDate || "", notes: item.notes || "" });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", type: "", zone: "", status: "Operational", purchaseDate: "", lastServiceDate: "", nextServiceDate: "", notes: "" });
    setShowForm(false);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    if (editingId) await onUpdate(editingId, form);
    else await onCreate(form);
    resetForm();
  }

  async function handleAddMaintenance(equipmentId) {
    if (!maintForm.description.trim()) return;
    await onAddMaintenance(equipmentId, { ...maintForm, cost: Number(maintForm.cost) || 0 });
    setMaintForm({ serviceType: "Routine", description: "", cost: "", performedDate: "", nextDueDate: "" });
  }

  const statusColors = { Operational: "#3c8f61", "Needs service": "#c48e34", "Out of order": "#c44", Retired: "#888" };
  const uniqueZones = [...new Set([...zones, ...equipment.map((e) => e.zone)].filter(Boolean))];

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      const datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
      const [year, month, day] = datePart.split("-");
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
      return datePart;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <section className="dashboard-grid">
      <article className="panel large-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Farm machinery & tools</p>
            <h2 style={{ color: "#f5f0e0" }}>Equipment</h2>
          </div>
          {canEdit ? (
            <button className="primary-link" onClick={() => setShowForm(true)} type="button">
              <Plus size={16} style={{ marginRight: 6 }} /> Add equipment
            </button>
          ) : null}
        </div>

        {showForm ? (
          <div className="equipment-form-wrapper">
            <div><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Name</label><input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Tractor" /></div>
            <div><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Type</label><input className="form-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="e.g. Heavy machinery" /></div>
            <div><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Zone</label><select className="form-input" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}><option value="">Select zone</option>{uniqueZones.map((z) => (<option key={z} value={z}>{z}</option>))}</select></div>
            <div><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Status</label><select className="form-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>{["Operational", "Needs service", "Out of order", "Retired"].map((s) => (<option key={s} value={s}>{s}</option>))}</select></div>
            <div><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Purchase date</label><input className="form-input" type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} /></div>
            <div><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Last service</label><input className="form-input" type="date" value={form.lastServiceDate} onChange={(e) => setForm((f) => ({ ...f, lastServiceDate: e.target.value }))} /></div>
            <div><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Next service</label><input className="form-input" type="date" value={form.nextServiceDate} onChange={(e) => setForm((f) => ({ ...f, nextServiceDate: e.target.value }))} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 13, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Notes</label><input className="form-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." /></div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px", marginTop: "8px" }}>
              <button className="primary-link" onClick={handleSubmit} type="button">{editingId ? "Update" : "Add"} equipment</button>
              <button className="secondary-link" onClick={resetForm} type="button">Cancel</button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {equipment.length ? equipment.map((item) => {
            const isExpanded = expandedId === item.id;
            const logs = maintenanceLogs.filter((l) => l.equipmentId === item.id);
            return (
              <div key={item.id} className="equipment-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: 16, color: "#f5f0e0" }}>{item.name}</strong>
                    <p style={{ fontSize: 13, color: "#8fa99a", margin: "4px 0 0" }}>{item.type} · {item.zone}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: "20px", background: statusColors[item.status] + "1a", color: statusColors[item.status] }}>{item.status}</span>
                    {canEdit ? (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button className="secondary-link" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => startEdit(item)} type="button"><Edit2 size={14} /></button>
                        <button className="secondary-link" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => onDelete(item.id)} type="button"><Trash2 size={14} /></button>
                      </div>
                    ) : null}
                    <button className="secondary-link" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setExpandedId(isExpanded ? null : item.id)} type="button">{isExpanded ? "Hide" : "Logs"}</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px", fontSize: 13, marginTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "12px" }}>
                  <div><span style={{ color: "#8fa99a" }}>Purchase:</span> <strong style={{ color: "#f5f0e0", marginLeft: "4px" }}>{formatDate(item.purchaseDate)}</strong></div>
                  <div><span style={{ color: "#8fa99a" }}>Last service:</span> <strong style={{ color: "#f5f0e0", marginLeft: "4px" }}>{formatDate(item.lastServiceDate)}</strong></div>
                  <div><span style={{ color: "#8fa99a" }}>Next service:</span> <strong style={{ color: "#f5f0e0", marginLeft: "4px" }}>{formatDate(item.nextServiceDate)}</strong></div>
                </div>
                {isExpanded ? (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, marginBottom: "8px", color: "#f5f0e0" }}>Maintenance logs ({logs.length})</p>
                    {logs.length ? logs.map((log) => (
                      <div key={log.id} style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", color: "#d4ceb8" }}>
                        <strong style={{ color: "#f5f0e0" }}>{log.serviceType}</strong> · {formatDate(log.performedDate)} · {log.performedBy || "Unknown"} · <span style={{ color: "#7ee0be", fontWeight: "600" }}>₹{log.cost || 0}</span>
                        {log.description ? <span style={{ color: "#8fa99a" }}> · {log.description}</span> : null}
                      </div>
                    )) : <p style={{ fontSize: 13, color: "#8fa99a", margin: "8px 0" }}>No logs yet.</p>}
                    {canEdit ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px", marginTop: "12px", padding: "16px", background: "rgba(0, 0, 0, 0.2)", border: "1px solid rgba(45, 160, 95, 0.15)", borderRadius: "8px" }}>
                        <div><label style={{ fontSize: 12, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Type</label><select className="form-input" value={maintForm.serviceType} onChange={(e) => setMaintForm((f) => ({ ...f, serviceType: e.target.value }))}>{["Routine", "Repair", "Replacement", "Inspection"].map((t) => (<option key={t} value={t}>{t}</option>))}</select></div>
                        <div><label style={{ fontSize: 12, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Date</label><input className="form-input" type="date" value={maintForm.performedDate} onChange={(e) => setMaintForm((f) => ({ ...f, performedDate: e.target.value }))} /></div>
                        <div><label style={{ fontSize: 12, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Next due</label><input className="form-input" type="date" value={maintForm.nextDueDate} onChange={(e) => setMaintForm((f) => ({ ...f, nextDueDate: e.target.value }))} /></div>
                        <div><label style={{ fontSize: 12, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Cost (₹)</label><input className="form-input" type="number" value={maintForm.cost} onChange={(e) => setMaintForm((f) => ({ ...f, cost: e.target.value }))} /></div>
                        <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 12, color: "#8fa99a", fontWeight: "600", display: "block", marginBottom: "4px" }}>Description</label><input className="form-input" value={maintForm.description} onChange={(e) => setMaintForm((f) => ({ ...f, description: e.target.value }))} placeholder="What was done..." /></div>
                        <div style={{ gridColumn: "1 / -1", marginTop: "4px" }}><button className="primary-link" onClick={() => handleAddMaintenance(item.id)} type="button">Add log</button></div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          }) : <p style={{ color: "#8fa99a" }}>No equipment recorded yet.</p>}
        </div>
      </article>
    </section>
  );
}

function TaskManagerPanel({ rows = [], selectedWorkerId, onSelectWorker }) {
  return (
    <article className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Workflow management</p>
          <h2>All worker assignments</h2>
        </div>
        <span style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700 }}>{rows.length} workers</span>
      </div>
      <div className="task-table">
        <div className="task-header-row">
          <span>Worker</span>
          <span>Current Task</span>
          <span>Attendance</span>
          <span>Status</span>
          <span>Progress</span>
        </div>
        {rows.length === 0 && (
          <div className="empty-state">No workers found.</div>
        )}
        {rows.map((worker) => (
          <button
            className={selectedWorkerId === worker.id ? "task-row active-row" : "task-row"}
            key={worker.id}
            onClick={() => onSelectWorker(worker.id)}
            type="button"
          >
            <span>{worker.name}</span>
            <strong>{worker.task}</strong>
            <span>{worker.attendance}</span>
            <span>{worker.status}</span>
            <span>{worker.progress}</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function buildTaskFormState(worker) {
  return {
    task: worker?.task || "",
    status: worker?.status || "Ready",
    progress: String(worker?.progressValue || 0),
    zone: worker?.zone || "",
    attendance: worker?.attendance || "Present",
    salaryStatus: worker?.salaryStatus || "Not recorded",
    dailyWage: String(worker?.dailyWage || 0),
    paymentMode: worker?.paymentMode || "Daily wage",
  };
}

function normalizeProgressValue(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMoneyValue(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function patchWorkerCollection(workers = [], workerId, updates = {}) {
  return workers.map((worker) => {
    if (String(worker.id) !== String(workerId)) {
      return worker;
    }

    const progressValue = normalizeProgressValue(
      updates.progressValue ?? updates.progress ?? worker.progressValue,
      worker.progressValue ?? 0
    );

    return {
      ...worker,
      task: updates.task ?? worker.task,
      status: updates.status ?? worker.status,
      progress: `${progressValue}%`,
      progressValue,
      zone: updates.zone ?? worker.zone,
      attendance: updates.attendance ?? worker.attendance,
      salaryStatus: updates.salaryStatus ?? updates.salary_status ?? worker.salaryStatus,
      dailyWage: updates.dailyWage ?? updates.daily_wage ?? worker.dailyWage,
      paymentMode: updates.paymentMode ?? updates.payment_mode ?? worker.paymentMode,
      paymentAmount: updates.paymentAmount ?? updates.payment_amount ?? worker.paymentAmount,
      paymentTxnId: updates.paymentTxnId ?? updates.payment_txn_id ?? worker.paymentTxnId,
      paymentDate: updates.paymentDate ?? updates.payment_date ?? worker.paymentDate,
    };
  });
}

function TaskEditor({
  worker,
  allWorkers = [],
  selectedWorkerId,
  onSelectWorker,
  canEditAllFields,
  onSubmit,
  isSubmitting,
}) {
  const currentEditorWorker =
    allWorkers.find((w) => w.id === selectedWorkerId) || worker || allWorkers[0] || null;
  const [form, setForm] = useState(() => buildTaskFormState(currentEditorWorker));
  const [isDirty, setIsDirty] = useState(false);
  const editorTitle = currentEditorWorker?.name || "Select Worker";
  const editorWorkerId = currentEditorWorker?.id || "";
  const editorWorkerSignature = [
    currentEditorWorker?.id || "",
    currentEditorWorker?.task || "",
    currentEditorWorker?.status || "",
    currentEditorWorker?.progressValue || 0,
    currentEditorWorker?.zone || "",
    currentEditorWorker?.attendance || "",
    currentEditorWorker?.salaryStatus || "",
    currentEditorWorker?.dailyWage || 0,
    currentEditorWorker?.paymentMode || "",
  ].join("::");

  useEffect(() => {
    setForm(buildTaskFormState(currentEditorWorker));
    setIsDirty(false);
  }, [editorWorkerId]);

  useEffect(() => {
    if (!isDirty) {
      setForm(buildTaskFormState(currentEditorWorker));
    }
  }, [editorWorkerSignature, currentEditorWorker, isDirty]);

  if (!worker && allWorkers.length === 0) {
    return <article className="panel"><div className="empty-state">No workers available.</div></article>;
  }

  function updateFormField(field, value) {
    setIsDirty(true);
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    const targetWorkerId = selectedWorkerId || editorWorkerId;

    if (!targetWorkerId) {
      return;
    }

    const saved = await onSubmit({
      workerId: targetWorkerId,
      task: form.task,
      status: form.status,
      progress: Number(form.progress),
      zone: form.zone,
      attendance: form.attendance,
      salaryStatus: form.salaryStatus,
      dailyWage: Number(form.dailyWage),
      paymentMode: form.paymentMode,
    });

    if (saved) {
      setIsDirty(false);
    }
  }

  return (
    <article className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Task editor</p>
          <h2>{editorTitle}</h2>
        </div>
      </div>
      <div className="editor-grid">
        <label>
          Assign to worker
          <select
            value={selectedWorkerId || ""}
            onChange={(event) => {
              const nextWorkerId = event.target.value;
              const nextWorker = allWorkers.find((w) => w.id === nextWorkerId) || null;
              onSelectWorker?.(nextWorkerId);
              setForm(buildTaskFormState(nextWorker));
              setIsDirty(false);
            }}
          >
            <option value="">-- Select a worker --</option>
            {allWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.zone})
              </option>
            ))}
          </select>
        </label>
        <label>
          Task
          <input
            value={form.task}
            disabled={!canEditAllFields}
            onChange={(event) => updateFormField("task", event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(event) => updateFormField("status", event.target.value)}
          >
            <option>Ready</option>
            <option>Pending</option>
            <option>In progress</option>
            <option>Review</option>
            <option>Done</option>
          </select>
        </label>
        <label>
          Progress
          <input
            type="number"
            min="0"
            max="100"
            value={form.progress}
            onChange={(event) => updateFormField("progress", event.target.value)}
          />
        </label>
        <label>
          Attendance
          <select
            value={form.attendance}
            onChange={(event) => updateFormField("attendance", event.target.value)}
          >
            <option>Present</option>
            <option>Late</option>
            <option>Absent</option>
          </select>
        </label>
        <label>
          Zone
          <input
            value={form.zone}
            disabled={!canEditAllFields}
            onChange={(event) => updateFormField("zone", event.target.value)}
          />
        </label>
        <label>
          Salary record
          <select
            value={form.salaryStatus}
            disabled={!canEditAllFields}
            onChange={(event) => updateFormField("salaryStatus", event.target.value)}
          >
            <option>Recorded</option>
            <option>Pending review</option>
            <option>Not recorded</option>
          </select>
        </label>
        <label>
          Daily wage
          <input
            type="number"
            min="0"
            value={form.dailyWage}
            disabled={!canEditAllFields}
            onChange={(event) => updateFormField("dailyWage", event.target.value)}
          />
        </label>
        <label>
          Payment mode
          <select
            value={form.paymentMode}
            disabled={!canEditAllFields}
            onChange={(event) => updateFormField("paymentMode", event.target.value)}
          >
            <option>Daily wage</option>
            <option>Shift wage</option>
            <option>Monthly payroll</option>
          </select>
        </label>
      </div>
      <button
        className="primary-link"
        style={{ marginTop: "20px" }}
        onClick={handleSubmit}
        type="button"
        disabled={isSubmitting || !(selectedWorkerId || editorWorkerId)}
      >
        {isSubmitting ? "Saving..." : "Save task update"}
      </button>
    </article>
  );
}

function TaskNotificationBanner({ notifications, onDismiss }) {
  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="task-notif-list">
      {notifications.map((notif) => (
        <div className="task-notif" key={notif.id}>
          <div className="task-notif-icon" aria-hidden>📋</div>
          <div className="task-notif-body">
            <strong>New task assigned by {notif.assignedBy}</strong>
            <span>Task: {notif.task} · Zone: {notif.zone} · Status: {notif.status}</span>
          </div>
          <button
            className="task-notif-dismiss"
            onClick={() => onDismiss(notif.id)}
            type="button"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function getISTTime() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return { hour: now.getHours(), minute: now.getMinutes(), totalMinutes: now.getHours() * 60 + now.getMinutes() };
}

const FARM_ALLOWED_ZONES = [
  { name: "Greenhouse A", lat: 13.0827, lng: 77.5797 },
  { name: "Packing Unit", lat: 13.1377, lng: 77.4875 },
  { name: "Visitor Gate", lat: 12.9507, lng: 77.5848 },
  { name: "Nursery Bay", lat: 12.8008, lng: 77.5773 },
];

const ATTENDANCE_RADIUS_METERS = 500;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinFarmZone(lat, lng) {
  for (const zone of FARM_ALLOWED_ZONES) {
    const distance = haversineDistance(lat, lng, zone.lat, zone.lng);
    if (distance <= ATTENDANCE_RADIUS_METERS) {
      return { allowed: true, zone: zone.name, distance: Math.round(distance) };
    }
  }
  const nearest = FARM_ALLOWED_ZONES.reduce(
    (best, zone) => {
      const d = haversineDistance(lat, lng, zone.lat, zone.lng);
      return d < best.distance ? { zone: zone.name, distance: d } : best;
    },
    { zone: "", distance: Infinity }
  );
  return { allowed: false, zone: nearest.zone, distance: Math.round(nearest.distance) };
}

function AttendanceMarkerPanel({ worker, onSubmit, isSubmitting, onOpenOverview, className = "", style = {} }) {
  const [selectedAttendance, setSelectedAttendance] = useState(worker?.attendance || "Present");
  const [statusMessage, setStatusMessage] = useState("");
  const [locationState, setLocationState] = useState({
    status: "idle",
    coords: null,
    allowed: null,
    zone: null,
    distance: null,
    error: null,
  });
  const lastWorkerIdRef = useRef(null);
  const lastWorkerAttendanceRef = useRef(null);
  const lastIsLateWindowRef = useRef(null);

  const { totalMinutes } = getISTTime();
  const isAfterCutoff = totalMinutes >= 9 * 60 + 5;
  const isLateWindow = totalMinutes >= 9 * 60 + 30;
  const alreadyMarked = worker?.attendance === "Present" || worker?.attendance === "Late";

  const attendanceOptions = [
    {
      value: "Present",
      label: isLateWindow ? "Present (will be marked Late)" : "Present",
      accentClass: "present",
      disabled: false,
    },
    {
      value: "Late",
      label: "Late",
      accentClass: "late",
      disabled: false,
    },
    {
      value: "Absent",
      label: "Absent",
      accentClass: "absent",
      disabled: false,
    },
  ];

  useEffect(() => {
    const currentId = worker?.id;
    const currentAttendance = worker?.attendance;
    const isLateWindowChanged = isLateWindow !== lastIsLateWindowRef.current;

    if (
      currentId !== lastWorkerIdRef.current ||
      currentAttendance !== lastWorkerAttendanceRef.current ||
      (isLateWindowChanged && !alreadyMarked)
    ) {
      lastWorkerIdRef.current = currentId;
      lastWorkerAttendanceRef.current = currentAttendance;
      lastIsLateWindowRef.current = isLateWindow;

      if (currentAttendance === "Present" || currentAttendance === "Late" || currentAttendance === "Absent") {
        setSelectedAttendance(currentAttendance);
      } else if (isLateWindow) {
        setSelectedAttendance("Late");
      } else {
        setSelectedAttendance("Present");
      }
    }
  }, [worker?.id, worker?.attendance, isLateWindow, alreadyMarked]);

  useEffect(() => {
    if (alreadyMarked) return;
    verifyLocation();
  }, []);

  function verifyLocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationState({
        status: "error",
        coords: null,
        allowed: false,
        zone: null,
        distance: null,
        error: "Geolocation is not supported by this browser.",
      });
      return;
    }

    setLocationState((prev) => ({ ...prev, status: "loading", error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const check = isWithinFarmZone(latitude, longitude);
        setLocationState({
          status: "done",
          coords: { lat: latitude, lng: longitude },
          allowed: check.allowed,
          zone: check.zone,
          distance: check.distance,
          error: null,
        });
      },
      (error) => {
        let errorMsg = "Unable to get your location.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = "Location permission denied. Please allow location access to mark attendance.";
        } else if (error.code === error.TIMEOUT) {
          errorMsg = "Location request timed out. Please try again.";
        }
        setLocationState({
          status: "error",
          coords: null,
          allowed: false,
          zone: null,
          distance: null,
          error: errorMsg,
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  const locationVerified = locationState.status === "done" && locationState.allowed === true;
  const locationDenied = locationState.status === "done" && locationState.allowed === false;
  const locationLoading = locationState.status === "loading";
  const locationError = locationState.status === "error";

  const canSubmitAttendance = (locationVerified || selectedAttendance === "Absent") && !isSubmitting && !!worker?.id;

  async function handleSubmit() {
    if (!worker?.id) return;

    if (selectedAttendance !== "Absent" && !locationVerified) {
      setStatusMessage("You must be at the farm location to mark attendance.");
      return;
    }

    const saved = await onSubmit({
      workerId: worker.id,
      attendance: selectedAttendance,
      locationLat: locationState.coords?.lat || null,
      locationLng: locationState.coords?.lng || null,
      locationZone: locationState.zone || null,
    });

    if (saved) {
      const effectiveStatus = isLateWindow && selectedAttendance === "Present" ? "Late" : selectedAttendance;
      setStatusMessage(`Attendance marked as ${effectiveStatus} by server.`);
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("workerAttendanceUpdated", {
              detail: { workerId: worker.id, attendance: effectiveStatus },
            })
          );
        }
      } catch (e) {
        // ignore
      }
    }
  }

  const timeRuleText = isLateWindow
    ? "It is past 9:30 AM — attendance will be recorded as Late."
    : isAfterCutoff
    ? "Unmarked workers were auto-marked Absent at 9:05 AM."
    : "Mark attendance before 9:05 AM to be marked Present.";

  function renderLocationStatus() {
    if (alreadyMarked) return null;

    if (locationLoading) {
      return (
        <div className="attendance-location-status loading">
          <span className="attendance-loc-spinner" />
          <span>Verifying your location...</span>
        </div>
      );
    }

    if (locationError) {
      return (
        <div className="attendance-location-status error">
          <span>&#x26A0;</span>
          <span>{locationState.error}</span>
          <button className="secondary-link small" onClick={verifyLocation} type="button">Retry</button>
        </div>
      );
    }

    if (locationDenied) {
      return (
        <div className="attendance-location-status denied">
          <span>&#x1F6AB;</span>
          <span>
            You are <strong>{locationState.distance}m</strong> from the nearest zone ({locationState.zone}).
            You must be within {ATTENDANCE_RADIUS_METERS}m of a farm zone to mark attendance.
          </span>
          <button className="secondary-link small" onClick={verifyLocation} type="button">Re-check</button>
        </div>
      );
    }

    if (locationVerified) {
      return (
        <div className="attendance-location-status verified">
          <span>&#x2705;</span>
          <span>
            Location verified — <strong>{locationState.zone}</strong> ({locationState.distance}m away)
          </span>
        </div>
      );
    }

    return null;
  }

  return (
    <section className={`attendance-panel-shell ${className}`} style={{ gridColumn: "1 / -1", ...style }}>
      <article className="panel large-panel attendance-stage">
        <div className="attendance-stage-glow" aria-hidden />
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Daily check-in</p>
            <h2>Mark attendance</h2>
          </div>
          <em className={`status-pill ${(worker?.attendance || "not marked").toLowerCase().replace(/\s+/g, "-")}`}>
            {worker?.attendance || "Not marked"}
          </em>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>{timeRuleText}</p>
        {renderLocationStatus()}
        <div className="attendance-stage-grid">
          <div className="attendance-holo-card">
            <div className="attendance-holo-stack" aria-hidden>
              <span className="attendance-orbit orbit-a" />
              <span className="attendance-orbit orbit-b" />
              <span className="attendance-orbit orbit-c" />
            </div>
            <div className="attendance-holo-copy">
              <span className="attendance-kicker">{worker?.name || "Worker"}</span>
              <strong>{selectedAttendance}</strong>
            </div>
            <div className="attendance-detail-grid">
              <span>{worker?.zone || "Not assigned"}</span>
              <span>{worker?.attendance || "Not marked"}</span>
            </div>
          </div>

          <div className="attendance-selector">
            {attendanceOptions.map((option, index) => {
              const isActive = selectedAttendance === option.value;

              return (
                <motion.button
                  className={`attendance-option ${option.accentClass} ${isActive ? "active" : ""} ${alreadyMarked ? "disabled" : ""}`}
                  key={option.value}
                  onClick={() => setSelectedAttendance(option.value)}
                  disabled={alreadyMarked}
                  type="button"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.08 }}
                  whileHover={alreadyMarked ? {} : { y: -6, rotateX: -4, rotateY: option.value === "Absent" ? -2 : 2 }}
                  whileTap={alreadyMarked ? {} : { scale: 0.98 }}
                >
                  <span className="attendance-option-top">
                    <em className={`attendance-signal ${option.accentClass}`} />
                    <strong>{option.label}</strong>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
        <div className="composer-tag-row attendance-actions">
          <button className="primary-link" onClick={handleSubmit} type="button" disabled={!canSubmitAttendance}>
            {isSubmitting ? "Saving..." : locationLoading ? "Checking location..." : "Save attendance"}
          </button>
          {onOpenOverview ? (
            <button className="secondary-link" onClick={onOpenOverview} type="button">
              Back to overview
            </button>
          ) : null}
        </div>
        {statusMessage ? <p className="form-message">{statusMessage}</p> : null}
      </article>
    </section>
  );
}

function AttendancePanel({ workers = [], summary }) {
  return (
    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Attendance snapshot</p>
            <h2>Today&apos;s attendance</h2>
          </div>
        </div>
        <div className="detail-list">
          <span>Present: {summary?.present || 0}</span>
          <span>Late: {summary?.late || 0}</span>
          <span>Absent: {summary?.absent || 0}</span>
          <span>Total tracked: {summary?.total || 0}</span>
        </div>
      </article>

      <article className="panel large-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Live worker status</p>
            <h2>Attendance register</h2>
          </div>
        </div>
        <div className="status-grid">
          {workers.map((worker) => (
            <div className="status-card" key={worker.id}>
              <strong>{worker.name}</strong>
              <span>{worker.zone}</span>
              <em className={`status-pill ${worker.attendance.toLowerCase().replace(/\s+/g, "-")}`}>
                {worker.attendance}
              </em>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}



function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PaymentGateway({ worker, onClose, onPaymentComplete, initialStep = "amount_entry", initialAmount, initialTxnDetails, initialMethod, paymentType = "wage" }) {
  const [method, setMethod] = useState(initialMethod || "UPI");
  const [step, setStep] = useState(initialStep);
  const [amount, setAmount] = useState(
    initialAmount !== undefined
      ? normalizeMoneyValue(initialAmount, 0)
      : (worker.earnedToday || worker.dailyWage || 0)
  );
  const [txnDetails, setTxnDetails] = useState(initialTxnDetails || null);
  const [errorMsg, setErrorMsg] = useState("");
  const receiptRef = useRef(null);

  useEffect(() => {
    if (paymentType === "order" && step === "amount_entry") {
      handleProceedToPay();
    }
  }, [paymentType, step]);

  async function handleProceedToPay() {
    if (amount <= 0) {
      setErrorMsg("Please enter a valid amount.");
      return;
    }
    setErrorMsg("");
    setStep("processing");

    try {
      const res = await fetch("/api/payment/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, workerId: worker.id }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const orderData = await res.json();

      // Real Razorpay flow
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error("Failed to load Razorpay SDK.");
      }

      const options = {
        key: orderData.keyId,
        amount: Math.round(orderData.amount * 100),
        currency: orderData.currency,
        name: "FloriSight Operations",
        description: paymentType === "order" ? `Order payment for ${worker.id}` : `Wage payment to ${worker.name}`,
        order_id: orderData.orderId,
        handler: async function (response) {
          setStep("processing");
          try {
            const verifyRes = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            if (!verifyRes.ok) {
              throw new Error("Verification failed.");
            }

            const verifyData = await verifyRes.json();
            if (verifyData.verified) {
              const completedTxnDetails = {
                id: response.razorpay_payment_id,
                date: new Date().toISOString(),
              };
              setTxnDetails(completedTxnDetails);
              setStep("success");
              onPaymentComplete({
                method: "Razorpay",
                amount: amount,
                txnId: completedTxnDetails.id,
                date: completedTxnDetails.date,
              });
            } else {
              throw new Error("Signature validation failed.");
            }
          } catch (err) {
            console.error("Verification error:", err);
            setErrorMsg("Verification failed: " + err.message);
            setStep(paymentType === "order" ? "method_selection" : "amount_entry");
          }
        },
        modal: {
          ondismiss: function () {
            setStep("amount_entry");
          },
        },
        prefill: {
          name: worker.name,
          ...(worker.email && worker.email.includes("@") ? { email: worker.email.replace(".local", ".com") } : {}),
          method: "upi",
        },
        theme: {
          color: "#2c5939",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Payment initialization failed:", err);
      setErrorMsg(err.message || "Failed to initialize payment");
      setStep("amount_entry");
    }
  }

  async function downloadReceipt() {
    if (!receiptRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(receiptRef.current, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Receipt_${txnDetails?.id || "Payment"}.pdf`);
    } catch (error) {
      console.error("Failed to generate receipt:", error);
    }
  }

  return (
    <div className="pg-backdrop" onClick={() => step === "amount_entry" && onClose()}>
      <div className="pg-container" onClick={e => e.stopPropagation()} style={{ borderRadius: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: '800px', height: '560px' }}>
        <div className="pg-header" style={{ background: '#2c5939', padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}>
          <div className="pg-header-left" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>FloriSight Enterprises</h3>
            <span style={{ fontSize: '12px', opacity: 0.9 }}>SECURE CHECKOUT</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button onClick={() => onClose()} style={{background:'none', border:'none', color:'white', fontSize:'24px', cursor:'pointer', padding: 0, lineHeight: 1}}>&times;</button>
          </div>
        </div>

        {step === "amount_entry" && (
          <div className="pg-body" style={{ background: '#f8f9fa', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', width: '100%', maxWidth: '320px' }}>
              <p style={{ margin: '0 0 16px 0', color: '#596377', fontSize: '15px' }}>
                {paymentType === "order" ? (
                  <span>Payment amount for Order <strong>{worker.id}</strong></span>
                ) : (
                  <span>Enter amount to pay to <strong>{worker.name}</strong></span>
                )}
              </p>
              {errorMsg && <p style={{ color: '#e53e3e', fontSize: '13px', margin: '0 0 16px 0', fontWeight: 500 }}>{errorMsg}</p>}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
                <span style={{ position: 'absolute', left: '16px', fontSize: '32px', color: '#101620', fontWeight: 600 }}>₹</span>
                <input 
                  type="number" 
                  value={amount === 0 ? '' : amount} 
                  onChange={(e) => setAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="0"
                  style={{ width: '100%', padding: '16px 16px 16px 48px', fontSize: '36px', fontWeight: 700, color: '#101620', border: '2px solid #2c5939', borderRadius: '8px', textAlign: 'left', outline: 'none' }} 
                  autoFocus
                />
              </div>
              <button 
                onClick={handleProceedToPay}
                style={{ width: '100%', padding: '16px', background: '#2c5939', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                Proceed to Pay <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        )}

        {(step === "processing" || step === "success") && (
          <div className="pg-state-overlay" style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {step === "processing" ? (
              <>
                <div className="pg-spinner" style={{ borderTopColor: '#2c5939' }}></div>
                <h3 style={{ color: '#101620', margin: '0 0 8px 0', fontSize: '18px' }}>Processing Payment</h3>
                <p style={{ color: '#596377', margin: 0, fontSize: '14px' }}>Please do not close this window.</p>
              </>
            ) : (
              <>
                <div ref={receiptRef} style={{ background: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #eef2f5', marginBottom: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div className="pg-success-icon" style={{ background: '#0e9f6e', margin: '0 auto 16px auto', width: '48px', height: '48px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px' }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h3 style={{ color: '#101620', margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700 }}>Payment Successful</h3>
                    <p style={{ color: '#596377', margin: 0, fontSize: '14px', fontWeight: 500 }}>FloriSight Enterprises</p>
                  </div>
                  
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '24px', textAlign: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Amount Paid</span>
                    <h2 style={{ color: '#0f172a', margin: '4px 0 0 0', fontSize: '28px', fontWeight: 800 }}>{formatCurrency(amount)}</h2>
                  </div>

                  <div style={{ borderTop: '2px dashed #e2e8f0', borderBottom: '2px dashed #e2e8f0', padding: '20px 0', margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {paymentType === "order" ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontSize: '14px' }}>Payment for</span>
                        <strong style={{ color: '#0f172a', fontSize: '14px' }}>Order {worker.id}</strong>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontSize: '14px' }}>Paid to</span>
                        <strong style={{ color: '#0f172a', fontSize: '14px' }}>{worker.name}</strong>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b', fontSize: '14px' }}>Method</span><strong style={{ color: '#0f172a', fontSize: '14px' }}>Razorpay</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b', fontSize: '14px' }}>Date & Time</span><strong style={{ color: '#0f172a', fontSize: '14px' }}>{txnDetails?.date}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b', fontSize: '14px' }}>Txn ID</span><strong style={{ color: '#0f172a', fontSize: '14px' }}>{txnDetails?.id}</strong></div>
                  </div>

                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    <svg width="100%" height="32" viewBox="0 0 200 32" preserveAspectRatio="none"><path d="M0,0h4v32h-4zM8,0h2v32h-2zM14,0h8v32h-8zM26,0h2v32h-2zM32,0h6v32h-6zM42,0h2v32h-2zM48,0h4v32h-4zM56,0h8v32h-8zM68,0h2v32h-2zM74,0h6v32h-6zM84,0h2v32h-2zM90,0h4v32h-4zM98,0h8v32h-8zM110,0h2v32h-2zM116,0h6v32h-6zM126,0h2v32h-2zM132,0h4v32h-4zM140,0h8v32h-8zM152,0h2v32h-2zM158,0h6v32h-6zM168,0h2v32h-2zM174,0h4v32h-4zM182,0h8v32h-8zM194,0h6v32h-6z" fill="#cbd5e1" /></svg>
                    <p style={{ margin: '8px 0 0 0' }}>Keep this receipt for your records.</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                  <button onClick={downloadReceipt} style={{ padding: '14px 24px', background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Download PDF
                  </button>
                  <button onClick={() => onClose()} style={{ padding: '14px 40px', background: '#2c5939', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 6px rgba(44,89,57,0.2)' }}>Done</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkforcePanel({ workers = [], attendanceSummary, wageSummary, currentUser, onUpdateTask, isSavingTask, allWorkers = [], leaveRequests = [], onCreateLeaveRequest, onReviewLeaveRequest }) {
  const isAdmin = currentUser?.role === "Admin";
  const isSupervisor = currentUser?.role === "Supervisor";
  const isWorker = currentUser?.role === "Worker";
  const showPayroll = isAdmin || isWorker;
  const canAssignAndPay = isAdmin || isSupervisor;

  const [assignWorkerId, setAssignWorkerId] = useState(null);
  const [paymentWorkerId, setPaymentWorkerId] = useState(null);
  const [viewReceiptWorkerId, setViewReceiptWorkerId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("Google Pay (UPI)");

  const paymentWorker = workers.find(w => w.id === paymentWorkerId);
  const assignWorker = workers.find(w => w.id === assignWorkerId);
  const viewReceiptWorker = workers.find(w => w.id === viewReceiptWorkerId);

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!paymentWorkerId) return;
    
    await onUpdateTask({
      workerId: paymentWorkerId,
      salaryStatus: "Recorded",
      paymentMode: paymentMethod
    });
    setPaymentWorkerId(null);
  }

  return (
    <section className="dashboard-grid">
      {assignWorkerId && (
        <div className="overview-modal-backdrop" onClick={() => setAssignWorkerId(null)}>
          <div className="overview-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Assign Work: {assignWorker?.name}</h2>
              <button onClick={() => setAssignWorkerId(null)} style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <TaskEditor 
              worker={assignWorker} 
              allWorkers={workers} 
              selectedWorkerId={assignWorkerId}
              onSelectWorker={setAssignWorkerId}
              canEditAllFields={true}
              onSubmit={async (payload) => {
                await onUpdateTask(payload);
                setAssignWorkerId(null);
              }}
              isSubmitting={isSavingTask}
            />
          </div>
        </div>
      )}

      {paymentWorkerId && paymentWorker && (
        <PaymentGateway
          worker={paymentWorker}
          onClose={() => setPaymentWorkerId(null)}
          initialAmount={paymentWorker.paymentAmount ?? paymentWorker.earnedToday ?? paymentWorker.dailyWage ?? 0}
          onPaymentComplete={async ({ method, amount, txnId, date }) => {
            await onUpdateTask({
              workerId: paymentWorkerId,
              salaryStatus: "Recorded",
              paymentMode: method,
              paymentAmount: amount,
              paymentTxnId: txnId,
              paymentDate: date,
            });
            // We intentionally DO NOT close the modal here. The "Done" button inside the success screen calls onClose.
          }}
        />
      )}

      {viewReceiptWorkerId && viewReceiptWorker && (
        <PaymentGateway
          worker={viewReceiptWorker}
          onClose={() => setViewReceiptWorkerId(null)}
          onPaymentComplete={() => {}}
          initialStep="success"
          initialAmount={viewReceiptWorker.paymentAmount ?? viewReceiptWorker.earnedToday ?? viewReceiptWorker.dailyWage ?? 0}
          initialTxnDetails={{
            id: viewReceiptWorker.paymentTxnId || "N/A",
            date: viewReceiptWorker.paymentDate || "N/A",
          }}
          initialMethod={viewReceiptWorker.paymentMode || "UPI"}
        />
      )}

      <article className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{isWorker ? "My Analytics" : (isAdmin ? "Workforce Analytics" : "Team Analytics")}</p>
            <h2>{isWorker ? "My overview & payroll" : (isAdmin ? "Team overview & payroll" : "Team overview")}</h2>
          </div>
        </div>
        <div className="attendance-grid">
          {workers.map((w) => (
            (() => {
              const paymentAmount = normalizeMoneyValue(w.paymentAmount, 0);
              const hasRecordedPayment =
                w.salaryStatus === "Recorded" &&
                (paymentAmount > 0 || Boolean(w.paymentTxnId) || Boolean(w.paymentDate));

              return (
                <div className={`workforce-card ${canAssignAndPay ? "is-actionable" : ""}`} key={w.id}>
                  <div className="workforce-card-header">
                    <Link href={`/workers/${w.id}`}>
                      <strong className="workforce-card-name">{w.name}</strong>
                    </Link>
                    <span className={`attendance-indicator workforce-attendance ${
                      w.attendance === "Present" ? "present" : w.attendance === "Late" ? "late" : "absent"
                    }`}>
                      {w.attendance || "Not marked"}
                    </span>
                  </div>

                  <div className="workforce-card-body">
                    <div className="workforce-meta-block">
                      <span className="workforce-meta-label">Zone</span>
                      <p className="workforce-meta-value">{w.zone || 'Not assigned'}</p>
                    </div>
                    <div className="workforce-meta-block">
                      <span className="workforce-meta-label">Task & progress</span>
                      <p className="workforce-meta-value">
                        {w.task} <em className="workforce-status-inline">({w.status})</em>
                      </p>
                      <div className="progress">
                        <span style={{ width: w.progress }} />
                      </div>
                    </div>
                    {hasRecordedPayment && (
                      <div className="workforce-payment-banner">
                        <div>
                          <span className="workforce-meta-label">Paid already</span>
                          <p className="workforce-pay-value">
                            {formatCurrency(paymentAmount)}
                          </p>
                        </div>
                        <div className="workforce-payroll-end">
                          <span className="workforce-meta-label">Status</span>
                          <p className="workforce-payment-status">
                            Receipt ready
                          </p>
                        </div>
                      </div>
                    )}
                    {canAssignAndPay && (
                      <div className={`workforce-card-actions ${showPayroll || hasRecordedPayment ? "" : "solo-actions"}`}>
                        <button
                          onClick={() => setAssignWorkerId(w.id)}
                          className="workforce-action-button secondary"
                        >
                          Assign Work
                        </button>
                        {hasRecordedPayment ? (
                          <>
                            <button
                              onClick={() => setPaymentWorkerId(w.id)}
                              className="workforce-action-button primary"
                            >
                              Pay Again
                            </button>
                            <button
                              onClick={() => setViewReceiptWorkerId(w.id)}
                              className="workforce-action-button secondary"
                            >
                              Download Receipt
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setPaymentWorkerId(w.id)}
                            className="workforce-action-button primary"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ))}
        </div>
      </article>

      <LeaveRequestsPanel
        requests={leaveRequests}
        workers={allWorkers}
        role={currentUser?.role || "Worker"}
        onCreate={onCreateLeaveRequest}
        onReview={onReviewLeaveRequest}
        currentUser={currentUser}
      />
    </section>
  );
}

function DailyReportPanel({ report, data, currentUser }) {
  const zoneStats = data?.zoneStats || [];
  const workers = data?.workers || [];
  const alerts = data?.alerts || [];
  const visitorEvents = data?.visitorEvents || [];
  const activityLogs = data?.activityLogs || [];
  const videoAnalyses = data?.videoAnalyses || [];
  const wageSummary = data?.wageSummary || {};
  const attendanceSummary = data?.attendanceSummary || {};
  const [timelineRange, setTimelineRange] = useState("weekly");
  const topZones = [...zoneStats].sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0)).slice(0, 4);
  const topWorkers = [...workers]
    .sort((a, b) => (b.progressValue || 0) - (a.progressValue || 0))
    .slice(0, 5);
  const recentLogs = activityLogs
    .map((log) => {
      if (Array.isArray(log)) {
        return { time: log[0], person: log[1], tag: log[2], text: log[3], createdAt: null };
      }
      const date = log.createdAt ? new Date(log.createdAt) : null;
      const timeStr = date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(date)
        : (log.timeLabel || log.time || "");
      return { time: timeStr, person: log.person, tag: log.tag, text: log.text, createdAt: log.createdAt };
    })
    .slice(0, 4);
  const reportTitle = report?.title || "Daily report";
  const generatedAt = formatReportDate(report?.generatedAt);
  const completedWorkers = workers.filter((worker) => worker.status === "Done");
  const activeWorkers = workers.filter((worker) => worker.status !== "Done");
  const salaryRecords = [...workers]
    .filter((worker) => Number(worker.paymentAmount || 0) > 0 || worker.paymentTxnId || worker.paymentDate)
    .sort((left, right) => {
      const leftDate = parseTimelineDate(left.paymentDate)?.getTime() || 0;
      const rightDate = parseTimelineDate(right.paymentDate)?.getTime() || 0;
      return rightDate - leftDate;
    });
  const salaryCreditedTotal = salaryRecords.reduce((sum, worker) => sum + Number(worker.paymentAmount || 0), 0);
  const todayIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayKey = `${todayIST.getFullYear()}-${String(todayIST.getMonth() + 1).padStart(2, "0")}-${String(todayIST.getDate()).padStart(2, "0")}`;

  const todaySalaryRecords = salaryRecords.filter((record) => {
    if (record.paymentDate) {
      const pDate = parseTimelineDate(record.paymentDate);
      if (pDate) {
        const pDateKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, "0")}-${String(pDate.getDate()).padStart(2, "0")}`;
        return pDateKey === todayKey;
      }
    }
    return false;
  });
  const todaySalaryCreditedTotal = todaySalaryRecords.reduce((sum, worker) => sum + Number(worker.paymentAmount || 0), 0);
  const zoneProgressRows = topZones.map((zone) => {
    const zoneWorkers = workers.filter((worker) => worker.zone === zone.zone);
    const averageProgress = zoneWorkers.length
      ? Math.round(zoneWorkers.reduce((sum, worker) => sum + Number(worker.progressValue || 0), 0) / zoneWorkers.length)
      : 0;

    return {
      label: zone.zone,
      averageProgress,
      completed: zoneWorkers.filter((worker) => worker.status === "Done").length,
    };
  });
  const timelineChart = buildTimelineChartData({
    visitorEvents,
    videoAnalyses,
    salaryRecords,
    rangeId: timelineRange,
  });
  const salaryCreditChart = {
    labels: timelineChart.labels,
    datasets: [
      {
        label: "Salary credited",
        data: timelineChart.salaryValues,
        backgroundColor: "rgba(246, 183, 77, 0.72)",
        borderColor: "#e39b17",
        borderWidth: 1,
        borderRadius: 10,
      },
    ],
  };
  const payrollStatusChart = {
    labels: ["Credited", "Pending review", "Not recorded"],
    datasets: [
      {
        data: [
          salaryRecords.length,
          wageSummary.pendingReview || 0,
          wageSummary.notRecorded || 0,
        ],
        backgroundColor: ["#17a577", "#f4b544", "#d9e3dc"],
        borderColor: "#f7fbf4",
      },
    ],
  };
  const workStatusChart = {
    labels: zoneProgressRows.map((row) => row.label),
    datasets: [
      {
        label: "Average progress %",
        data: zoneProgressRows.map((row) => row.averageProgress),
        backgroundColor: ["#2f7cf6", "#17a577", "#f4b544", "#8aa2f2"],
        borderRadius: 12,
      },
    ],
  };

  async function handleDownloadPdf() {
    const topZoneRows = topZones
      .map(
        (zone) => `
          <tr>
            <td>${sanitizeHtml(zone.zone)}</td>
            <td>${sanitizeHtml(String(zone.workers || 0))}</td>
            <td>${sanitizeHtml(String(zone.visitors || 0))}</td>
          </tr>
        `
      )
      .join("");

    const workerRows = topWorkers
      .map(
        (worker) => `
          <tr>
            <td>${sanitizeHtml(worker.name)}</td>
            <td>${sanitizeHtml(worker.zone)}</td>
            <td>${sanitizeHtml(worker.status)}</td>
            <td style="width: 120px;">
              <div class="report-print-bar"><span style="width: ${Math.max(0, Math.min(100, worker.progressValue || 0))}%"></span></div>
            </td>
            <td>${sanitizeHtml(worker.progress || "0%")}</td>
          </tr>
        `
      )
      .join("");

    const sectionItems = (report?.sections || [])
      .map(
        (section) => `
          <li><strong>${sanitizeHtml(section.title)}:</strong> ${sanitizeHtml(section.text)}</li>
        `
      )
      .join("");

    const reportMarkup = `
      <main class="report-print">
        <header class="report-print-header">
          <div class="header-top">
            <div class="logo-area">
              <svg class="logo-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" style="display: inline-block; vertical-align: middle;">
                <path d="M12 22C12 22 20 18 20 12C20 6 12 2 12 2C12 2 4 6 4 12C4 18 12 22 12 22Z" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 2V22" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 8C12 8 16 10 16 12C16 14 12 16 12 16" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 12C12 12 8 14 8 16" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div class="logo-text" style="display: inline-flex; flex-direction: column; vertical-align: middle; margin-left: 8px;">
                <span class="company-name" style="font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; line-height: 1.1; color: var(--accent);">FloriSight</span>
                <span class="company-tagline" style="font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted);">Smart Workforce & Crop Systems</span>
              </div>
            </div>
            <div class="company-contact" style="display: flex; flex-direction: column; align-items: flex-end; font-size: 9px; color: var(--muted); text-align: right; line-height: 1.4;">
              <span>info@florisight.com</span>
              <span>www.florisight.com</span>
              <span>+91 98765 43210</span>
            </div>
          </div>
          <div class="header-divider" style="height: 2px; background: linear-gradient(90deg, var(--accent), var(--warm)); border-radius: 999px; margin: 8px 0 6px 0;"></div>
          <div class="header-bottom" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-top: 4px;">
            <div class="report-print-heading" style="display: grid; gap: 4px; flex: 1;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: var(--ink);">${sanitizeHtml(reportTitle)}</h1>
              <p style="margin: 4px 0 0 0; color: var(--muted); font-size: 11px; line-height: 1.4;">${sanitizeHtml(report?.summary || "")}</p>
            </div>
            <div class="report-print-meta" style="padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-strong); text-align: left; font-size: 9px; line-height: 1.5; color: var(--ink); min-width: 190px;">
              <strong>DOCUMENT TYPE:</strong> Executive Report<br />
              <strong>PREPARED BY:</strong> ${sanitizeHtml(currentUser?.name || "FloriSight")}<br />
              <strong>DATE:</strong> ${sanitizeHtml(generatedAt)}
            </div>
          </div>
        </header>

        <section class="report-print-grid">
          <article class="report-print-card">
            <span>Attendance</span>
            <strong>${sanitizeHtml(String(attendanceSummary.present || 0))}/${sanitizeHtml(String(attendanceSummary.total || 0))}</strong>
            <p>Workers present today</p>
          </article>
          <article class="report-print-card">
            <span>Salary Credited</span>
            <strong>${sanitizeHtml(formatCurrency(todaySalaryCreditedTotal))}</strong>
            <p>Salary credited today</p>
          </article>
          <article class="report-print-card">
            <span>Work Completed</span>
            <strong>${sanitizeHtml(String(completedWorkers.length || 0))}</strong>
            <p>Tasks completed today</p>
          </article>
          <article class="report-print-card">
            <span>Earned Today</span>
            <strong>${sanitizeHtml(wageSummary.totalEarnedTodayLabel || formatCurrency(0))}</strong>
            <p>Tracked labor payout today</p>
          </article>
        </section>

        <section class="report-print-panels">
          <article class="report-print-panel">
            <h2>Operational Highlights</h2>
            <div class="report-print-kpi">${sanitizeHtml(report?.headline || "")}</div>
            <ul class="report-print-list">
              ${(report?.bullets || []).map((item) => `<li>${sanitizeHtml(item)}</li>`).join("")}
              ${sectionItems}
            </ul>
          </article>
          <article class="report-print-panel">
            <h2>Zone Overview</h2>
            <table class="report-print-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Workers</th>
                  <th>Visitors</th>
                </tr>
              </thead>
              <tbody>
                ${topZoneRows}
              </tbody>
            </table>
          </article>
        </section>

        <section class="report-print-panel">
          <h2>Top Worker Progress</h2>
          <table class="report-print-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Zone</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              ${workerRows}
            </tbody>
          </table>
        </section>
      </main>
    `;

    await downloadReportPdf(`${reportTitle} - FloriSight`, reportMarkup);
  }

  return (
    <section className="dashboard-grid">
      <article className="panel large-panel report-panel-shell">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Operations report</p>
            <h2>{reportTitle}</h2>
            <p className="live-status">Generated at {generatedAt}</p>
          </div>
          <div className="report-actions">
            <button className="secondary-link report-download-button" onClick={handleDownloadPdf} type="button">
              Download PDF
            </button>
          </div>
        </div>
        <div className="report-kpi-grid">
          <motion.article
            className="report-kpi-card rose"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <span>Attendance</span>
            <strong>
              {attendanceSummary.present || 0}/{attendanceSummary.total || 0}
            </strong>
            <p>{attendanceSummary.late || 0} late, {attendanceSummary.absent || 0} absent</p>
          </motion.article>
          <motion.article
            className="report-kpi-card amber"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
          >
            <span>Salary credited</span>
            <strong>{formatCurrency(todaySalaryCreditedTotal)}</strong>
            <p>{todaySalaryRecords.length} live credit records with transaction data today</p>
          </motion.article>
          <motion.article
            className="report-kpi-card teal"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.49, ease: "easeOut" }}
          >
            <span>Work completed</span>
            <strong>{completedWorkers.length}</strong>
            <p>{activeWorkers.length} assignments are still active or under review</p>
          </motion.article>
          <motion.article
            className="report-kpi-card ink"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.56, ease: "easeOut" }}
          >
            <span>Earned today</span>
            <strong>{wageSummary.totalEarnedTodayLabel || formatCurrency(0)}</strong>
            <p>{visitorEvents.length} visitor records, {videoAnalyses.length} video checks</p>
          </motion.article>
        </div>

        <motion.section
          className="report-command-card report-data-hero"
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="report-command-copy">
            <span className="report-chip">Live executive report</span>
            <h3>{report?.headline || "0/11 workers present, ₹0 earned today."}</h3>
            <p>{report?.summary || ""}</p>
            <div className="report-command-meta">
              <div>
                <span className="report-mini-label">Prepared for</span>
                <strong>Gnanavi</strong>
              </div>
              <div>
                <span className="report-mini-label">Last refresh</span>
                <strong>{generatedAt}</strong>
              </div>
            </div>
          </div>
          <div className="report-stage-3d">
            <div className="report-stage-glow report-stage-glow-one" />
            <div className="report-stage-glow report-stage-glow-two" />
            <div className="report-stage-screen">
              <div className="report-stage-topbar">
                <span />
                <span />
                <span />
              </div>
              <div className="report-stage-panels">
                <div className="report-stage-chart report-stage-pie" />
                <div className="report-stage-chart report-stage-lines">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="report-stage-bars">
                <span style={{ height: "42%" }} />
                <span style={{ height: "76%" }} />
                <span style={{ height: "54%" }} />
                <span style={{ height: "92%" }} />
                <span style={{ height: "63%" }} />
              </div>
            </div>
            <div className="report-floating-tag report-floating-tag-left">
              <span>Active zones</span>
              <strong>4 live</strong>
            </div>
            <div className="report-floating-tag report-floating-tag-right">
              <span>Total tracking</span>
              <strong>98%</strong>
            </div>
          </div>
        </motion.section>

        <div className="report-immersive-grid">
          <motion.section
            className="report-card report-performance-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div className="report-chart-header">
              <div className="report-card-heading">
                <strong>Weekly / monthly timeline</strong>
                <span>Real-time visitors and video checks from live records</span>
              </div>
              <div className="report-range-switcher">
                {reportRangeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={timelineRange === option.id ? "active" : ""}
                    onClick={() => setTimelineRange(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="report-line-chart">
              <Line data={timelineChart} options={chartOptions} />
            </div>
          </motion.section>

          <motion.div
            className="report-card report-timeline-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.68, ease: "easeOut" }}
          >
            <div className="report-card-heading">
              <strong>Recent field updates</strong>
              <span>Latest operational notes captured in the live system</span>
            </div>
            <div className="report-log-list">
              {recentLogs.map((log, idx) => (
                <div className="report-log-item" key={idx}>
                  <span>{log.time}</span>
                  <strong>{log.person}</strong>
                  <p>{log.text}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="report-main-grid">
          <motion.div
            className="report-card report-performance-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, ease: "easeOut" }}
          >
            <div className="report-card-heading">
              <strong>Salary credit timeline</strong>
              <span>Actual credited amounts from worker payment records</span>
            </div>
            <div className="report-bar-chart">
              <Bar data={salaryCreditChart} options={chartOptions} />
            </div>
          </motion.div>

          <motion.div
            className="report-card report-performance-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.52, ease: "easeOut" }}
          >
            <div className="report-card-heading">
              <strong>Payroll record status</strong>
              <span>Live split of credited and pending salary records</span>
            </div>
            <div className="report-donut-chart">
              <Doughnut data={payrollStatusChart} options={{ maintainAspectRatio: false, plugins: chartOptions.plugins }} />
            </div>
          </motion.div>
        </div>

      </article>
    </section>
  );
}

function TrackingPanel({ analyses = [], isAnalyzingVideo, defaultZone, onRefresh }) {
  const [zone, setZone] = useState(defaultZone || "Visitor Gate");
  const [localError, setLocalError] = useState("");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isMonitoringLive, setIsMonitoringLive] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState("Ready to detect people in real-time with YOLO.");
  const [liveDetections, setLiveDetections] = useState([]);
  const [liveFrameMeta, setLiveFrameMeta] = useState({ width: 0, height: 0 });
  const [lastLiveDetections, setLastLiveDetections] = useState([]);
  const [lastLiveCount, setLastLiveCount] = useState(0);
  const [lastLivePeakCount, setLastLivePeakCount] = useState(0);
  const [lastLiveFrameMeta, setLastLiveFrameMeta] = useState({ width: 0, height: 0 });
  const [detectionFps, setDetectionFps] = useState(0);
  const [sessionVisitorCount, setSessionVisitorCount] = useState(0);
  const [sessionHistory, setSessionHistory] = useState([]);
  const videoPreviewRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const monitoringLoopRef = useRef(false);
  const frameCanvasRef = useRef(null);
  const sessionStartedAtRef = useRef(null);
  const sessionZoneRef = useRef(defaultZone || "Visitor Gate");
  const sessionPeakCountRef = useRef(0);

  useEffect(() => {
    if (defaultZone) {
      setZone(defaultZone);
    }
  }, [defaultZone]);

  useEffect(() => {
    setSessionHistory((current) =>
      current.filter((item) => item.type === "live")
    );
  }, [analyses]);

  useEffect(() => {
    return () => {
      monitoringLoopRef.current = false;
      stopCamera();
    };
  }, []);

  function stopCamera() {
    const preview = videoPreviewRef.current;
    const stream = mediaStreamRef.current;

    if (preview) {
      preview.srcObject = null;
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    mediaStreamRef.current = null;
    setIsCameraReady(false);
    setLiveDetections([]);

    // Clear the overlay canvas
    const overlay = canvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }

  function resetLiveSession() {
    sessionStartedAtRef.current = new Date();
    sessionZoneRef.current = zone;
    sessionPeakCountRef.current = 0;
    setSessionVisitorCount(0);
    setLastLivePeakCount(0);
  }

  function finalizeLiveSession() {
    const startedAt = sessionStartedAtRef.current;
    if (!startedAt) {
      return;
    }

    const count = sessionPeakCountRef.current;
    if (count > 0) {
      setSessionHistory((current) => [
        {
          id: `live-${startedAt.getTime()}`,
          type: "live",
          zone: sessionZoneRef.current || zone,
          startedAt,
          count,
          status: "completed",
          label: "Live monitoring session",
          logs: [],
        },
        ...current,
      ].slice(0, 10));
    }
  }

  async function startCamera() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setLocalError("Camera access is not supported in this browser.");
      return false;
    }

    if (mediaStreamRef.current) {
      setIsCameraReady(true);
      return true;
    }

    try {
      setIsStartingCamera(true);
      setLocalError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      const preview = videoPreviewRef.current;

      if (preview) {
        preview.srcObject = stream;
        preview.muted = true;
        preview.playsInline = true;
        await preview.play().catch(() => {});
      }

      setIsCameraReady(true);
      setMonitorStatus("Camera connected. Ready for real-time detection.");
      return true;
    } catch (error) {
      setLocalError(error?.message || "Unable to access the camera.");
      stopCamera();
      return false;
    } finally {
      setIsStartingCamera(false);
    }
  }

  function captureFrameAsJpeg() {
    const video = videoPreviewRef.current;
    if (!video || video.readyState < 2) return null;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    if (!frameCanvasRef.current) {
      frameCanvasRef.current = document.createElement("canvas");
    }
    const fc = frameCanvasRef.current;
    fc.width = w;
    fc.height = h;
    const ctx = fc.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    return { dataUrl: fc.toDataURL("image/jpeg", 0.7), width: w, height: h };
  }

  function drawOverlay(detections, frameWidth, frameHeight) {
    const overlay = canvasRef.current;
    const video = videoPreviewRef.current;
    if (!overlay || !video) return;

    const displayW = video.clientWidth || overlay.width;
    const displayH = video.clientHeight || overlay.height;
    overlay.width = displayW;
    overlay.height = displayH;

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, displayW, displayH);

    if (!detections.length || !frameWidth || !frameHeight) return;

    const scaleX = displayW / frameWidth;
    const scaleY = displayH / frameHeight;

    detections.forEach((det, idx) => {
      const box = det.box;
      if (!box) return;

      const x = box.x1 * scaleX;
      const y = box.y1 * scaleY;
      const w = (box.x2 - box.x1) * scaleX;
      const h = (box.y2 - box.y1) * scaleY;

      // Draw bounding box
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(0, 255, 136, 0.5)";
      ctx.shadowBlur = 6;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;

      // Draw corner accents
      const cornerLen = Math.min(w, h) * 0.2;
      ctx.strokeStyle = "#00ffaa";
      ctx.lineWidth = 3.5;
      // Top-left
      ctx.beginPath(); ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y); ctx.stroke();
      // Top-right
      ctx.beginPath(); ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen); ctx.stroke();
      // Bottom-left
      ctx.beginPath(); ctx.moveTo(x, y + h - cornerLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerLen, y + h); ctx.stroke();
      // Bottom-right
      ctx.beginPath(); ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen); ctx.stroke();

      // Draw plain YOLO-style label
      const confPct = det.confidence != null
        ? (det.confidence > 1 ? Math.round(det.confidence) : Math.round(det.confidence * 100))
        : 0;
      const label = `Person ${idx + 1} (${confPct}%)`;
      ctx.font = "bold 13px Inter, system-ui, sans-serif";
      const metrics = ctx.measureText(label);
      const labelW = metrics.width + 14;
      const labelH = 24;
      const labelX = x;
      const labelY = Math.max(0, y - labelH - 3);

      ctx.fillStyle = "rgba(0, 255, 136, 0.9)";
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, 5);
      ctx.fill();

      ctx.fillStyle = "#0a2e1a";
      ctx.fillText(label, labelX + 7, labelY + 16);
    });
  }

  async function captureAndDetect() {
    const frame = captureFrameAsJpeg();
    if (!frame) return null;

    try {
      const res = await fetch("/api/tracking/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame: frame.dataUrl, confidence: 0.25 }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.warn("[tracking] frame detection failed:", data.message || data.error || res.status);
        setLocalError(data.message || "Detection server error");
        return null;
      }

      // Clear any previous error on success
      setLocalError("");

      return {
        detections: data.detections || [],
        count: data.count || 0,
        width: data.width || frame.width,
        height: data.height || frame.height,
      };
    } catch (err) {
      console.warn("[tracking] fetch error:", err);
      return null;
    }
  }

  async function handleToggleLiveMonitoring() {
    if (isMonitoringLive) {
      const frame = captureFrameAsJpeg();
      monitoringLoopRef.current = false;
      setIsMonitoringLive(false);
      stopCamera();
      setMonitorStatus("Live monitoring stopped.");
      setDetectionFps(0);

      if (frame) {
        const timestamp = Date.now();
        const fileName = `live-frame-${timestamp}.jpg`;
        fetch("/api/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zone,
            imageDataUrl: frame.dataUrl,
            fileName,
            peakVisitorCount: sessionPeakCountRef.current,
          }),
        })
          .then((res) => {
            if (res.ok && onRefresh) {
              onRefresh();
            }
          })
          .catch((err) => {
            console.error("Failed to save live tracking snapshot:", err);
          });
      }
      return;
    }

    const ready = await startCamera();
    if (!ready) return;

    resetLiveSession();
    setIsMonitoringLive(true);
    monitoringLoopRef.current = true;
    setLocalError("");
    setMonitorStatus("Real-time detection active — YOLO is analyzing each frame...");

    let lastTime = Date.now();
    let frameCount = 0;

    while (monitoringLoopRef.current) {
      const result = await captureAndDetect();

      if (!monitoringLoopRef.current) break;

      if (result) {
        setLiveDetections(result.detections);
        setLiveFrameMeta({ width: result.width, height: result.height });
        setLastLiveDetections(result.detections);
        setSessionVisitorCount(result.count || 0);
        sessionPeakCountRef.current = Math.max(sessionPeakCountRef.current, result.count || 0);
        setLastLiveCount(result.count || 0);
        setLastLivePeakCount(sessionPeakCountRef.current);
        setLastLiveFrameMeta({ width: result.width, height: result.height });
        drawOverlay(result.detections, result.width, result.height);

        frameCount++;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        if (elapsed >= 2) {
          setDetectionFps(Math.round((frameCount / elapsed) * 10) / 10);
          frameCount = 0;
          lastTime = now;
        }

        const count = result.detections.length;
        const label = count === 1 ? "person" : "people";
        setMonitorStatus(
          count > 0
            ? `Detecting ${count} ${label} in the current frame · peak ${sessionPeakCountRef.current} this session`
            : "Scanning — no person detected in current frame"
        );
      }

      // Small delay to avoid overloading — yields ~2-3 FPS detection
      await new Promise((r) => setTimeout(r, 150));
    }

    monitoringLoopRef.current = false;
    setIsMonitoringLive(false);
    stopCamera();
    setDetectionFps(0);
  }

  const latestAnalysis = analyses[0] || null;
  const latestSummary = latestAnalysis?.summary || {};
  const shownMoments = latestSummary.notableMoments || latestSummary.moments || [];
  const shownTracks = latestSummary.trackSummaries || latestSummary.tracks || [];

  // Merge live detections with historical analysis
  const activeLiveCount = liveDetections.length;
  const historicalCount = Math.max(
    Number(latestAnalysis?.visitorCount || 0),
    Number(latestSummary.effectiveVisitorCount || 0),
    Number(latestSummary.visitorCount || 0),
    Number(latestSummary.trackCount || 0)
  );
  const detectedPeopleCount = isMonitoringLive
    ? sessionVisitorCount
    : (lastLiveCount || historicalCount);
  const peopleLabel = detectedPeopleCount === 1 ? "person" : "people";

  const detectionDescription = isMonitoringLive
    ? activeLiveCount > 0
      ? `${activeLiveCount} ${peopleLabel} detected in the current frame. Peak simultaneous detection in this session is ${sessionPeakCountRef.current}.`
      : "YOLO is scanning each frame in real-time. When people are visible, they will appear as Person 1, Person 2, and so on."
    : lastLiveCount > 0
      ? `${lastLiveCount} ${peopleLabel} were visible in the last captured frame. Peak simultaneous detection in that session was ${lastLivePeakCount}.`
      : historicalCount > 0
        ? `${historicalCount} ${peopleLabel} detected from the last analysis.`
        : "No person detected yet. Start live monitoring to begin.";

  function buildDetectionDetails(detections, frameMeta) {
    return detections.map((det, idx) => {
      if (det.description) {
        return { id: idx, text: det.description };
      }
      const confPct = det.confidence != null
        ? (det.confidence > 1 ? Math.round(det.confidence) : Math.round(det.confidence * 100))
        : 0;
      const side = det.position || (det.box
        ? det.box.centerX < (frameMeta.width * 0.33) ? "left"
          : det.box.centerX > (frameMeta.width * 0.66) ? "right"
          : "center"
        : "unknown");
      return {
        id: idx,
        text: `Person ${idx + 1} — ${confPct}% confidence, ${side} side of frame`,
      };
    });
  }

  const liveDetectionDetails = buildDetectionDetails(liveDetections, liveFrameMeta);
  const lastLiveDetectionDetails = buildDetectionDetails(lastLiveDetections, lastLiveFrameMeta);

  const identifiedTracks = isMonitoringLive
    ? liveDetectionDetails
    : lastLiveDetections.length
      ? lastLiveDetectionDetails
      : shownTracks.length
        ? shownTracks.map((track) => ({
            id: track.trackId,
            text: `Person ID ${track.trackId} moved from ${track.firstSide || "unknown"} to ${track.lastSide || "unknown"}, visible for ${track.dwellSeconds || 0}s.`,
          }))
        : [];

  const historicalZoneItems = buildHistoricalTrackingHistory(analyses, zone);
  const liveZoneItems = sessionHistory.filter((item) => {
    const itemZone = String(item?.zone || "").trim().toLowerCase();
    const selectedZone = String(zone || "").trim().toLowerCase();
    return !selectedZone || itemZone === selectedZone;
  });
  const historyItems = [...liveZoneItems, ...historicalZoneItems]
    .slice(0, 8);

  return (
    <section className="dashboard-grid tracking-grid">
      <article className="panel large-panel tracking-monitor-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Live monitoring</p>
            <h2>Real-time person detection</h2>
          </div>
          {isMonitoringLive && (
            <div className="tracking-live-badge">
              <span className="tracking-live-dot" />
              LIVE
              {detectionFps > 0 && <span className="tracking-fps">{detectionFps} FPS</span>}
            </div>
          )}
        </div>

        <div className="tracking-live-grid">
          <div className="tracking-camera-stage">
            <video ref={videoPreviewRef} className="tracking-camera-preview" autoPlay muted playsInline />
            <canvas
              ref={canvasRef}
              className="tracking-canvas-overlay"
              aria-hidden="true"
            />
            {!isCameraReady && (
              <div className="tracking-camera-overlay">
                <strong>Real-time detection preview</strong>
                <span>Start live monitoring to detect people with YOLO in real-time.</span>
              </div>
            )}
          </div>

          <div className="tracking-controls-card">
            <button
              className={isMonitoringLive ? "secondary-link tracking-live-button active" : "primary-link tracking-live-button"}
              type="button"
              onClick={handleToggleLiveMonitoring}
              disabled={(isAnalyzingVideo || isStartingCamera) && !isMonitoringLive}
            >
              {isStartingCamera
                ? "Connecting..."
                : isMonitoringLive
                  ? "Stop live monitoring"
                  : "Start live monitoring"}
            </button>

            <p className="tracking-status-note">{monitorStatus}</p>
            {localError && <p className="form-message">{localError}</p>}
          </div>
        </div>

      </article>

      <article className="panel large-panel tracking-results-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Detection results</p>
            <h2>People detected</h2>
          </div>
        </div>
        <div className="tracking-detection-summary">
          <strong>{detectedPeopleCount}</strong>
          <div>
            <span>{peopleLabel} detected{isMonitoringLive ? " (live)" : ""}</span>
            <p>{detectionDescription}</p>
          </div>
        </div>

        <div className="tracking-result-stats">
          <div className="tracking-result-stat">
            <span>Currently in frame</span>
            <strong>{activeLiveCount}</strong>
          </div>
          <div className="tracking-result-stat">
            <span>Peak in session</span>
            <strong>{isMonitoringLive ? sessionPeakCountRef.current : (lastLivePeakCount || historicalCount)}</strong>
          </div>
        </div>

        <div className="tracking-detection-detail">
          {identifiedTracks.length ? identifiedTracks.slice(0, 8).map((track) => (
            <p key={track.id}>{track.text}</p>
          )) : shownMoments.length ? shownMoments.slice(0, 4).map((moment, index) => (
            <p key={`${moment.frame}-${moment.trackId}-${index}`}>{moment.detail}</p>
          )) : (
            <p>No tracking events logged yet.</p>
          )}
        </div>
      </article>

      <article className="panel large-panel tracking-history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Tracking history</p>
            <h2>Recent sessions and analyses</h2>
          </div>
        </div>
        <div className="tracking-history-grid">
          {historyItems.length ? historyItems.map((item) => (
            <div className="tracking-history-card" key={item.id}>
              <span className={`tracking-history-badge ${item.type === "live" ? "live" : "analysis"}`}>
                {item.type === "live" ? "Live session" : "Saved analysis"}
              </span>
              <strong>{item.count || 0} people detected</strong>
              <span>{item.zone || "Visitor Gate"}</span>
              <em>{item.startedAt ? formatReportDate(item.startedAt) : "Recent"}</em>
              <p>{item.label || "Tracking run"}</p>
            </div>
          )) : (
            <p className="tracking-history-empty">No tracking history yet. Start a live session to build it.</p>
          )}
        </div>
      </article>
    </section>
  );
}

function LiveComposer({ onSend, isSending, defaultTag = "Update", allowedTags = null, editingMessage, onCancelEdit }) {
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState(defaultTag);
  const [imageUrl, setImageUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [localError, setLocalError] = useState("");
  const fileInputRef = useRef(null);
  
  // Emoji Picker State
  const [showEmojis, setShowEmojis] = useState(false);
  const emojis = ["😀", "😂", "🥰", "😎", "🤔", "🙌", "👍", "🔥", "✨", "👏", "🎉", "👀", "🌱", "💧", "🚜", "🛠️"];
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    setTag(defaultTag);
  }, [defaultTag]);

  useEffect(() => {
    if (editingMessage) {
      setDraft(editingMessage.text || "");
      if (editingMessage.tag) setTag(editingMessage.tag);
    } else {
      setDraft("");
    }
  }, [editingMessage]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        onSend({ text: "", imageUrl: "", audioUrl, tag });
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      setLocalError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Don't save data
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingTime(0);
    }
  };

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      setImageUrl("");
      setImageName("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setLocalError("Choose an image file.");
      return;
    }

    if (file.size > 1_500_000) {
      setLocalError("Image must be under 1.5 MB.");
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Image read failed."));
      reader.readAsDataURL(file);
    }).catch((error) => {
      setLocalError(error.message);
      return "";
    });

    if (!dataUrl) return;

    setLocalError("");
    setImageUrl(dataUrl);
    setImageName(file.name);
  }

  async function handleSubmit() {
    if (!draft.trim() && !imageUrl) {
      setLocalError("Write a message or attach a photo before sending.");
      return;
    }

    setLocalError("");
    
    let sent = false;
    if (editingMessage) {
      sent = true;
      onCancelEdit?.();
    } else {
      sent = await onSend({ text: draft, imageUrl, tag });
    }

    if (sent) {
      setDraft("");
      setImageUrl("");
      setImageName("");
      setShowEmojis(false);
      setTag(defaultTag);
    }
  }

  const defaultTags = ["Update", "Task update", "Visitor entry", "Alert", "AgriSage query"];
  const tags = Array.isArray(allowedTags) && allowedTags.length ? allowedTags : defaultTags;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', background: '#f0f2f5' }}>
      {editingMessage && (
        <div className="wa-edit-banner">
          <div>
            <div style={{ fontWeight: 500, color: '#008069', marginBottom: '2px' }}>Editing message</div>
            <div style={{ color: 'var(--wa-text-secondary)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
              {editingMessage.text}
            </div>
          </div>
          <button onClick={onCancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wa-icon-color)' }}>
            <X size={20} />
          </button>
        </div>
      )}
      {imageUrl && (
        <div className="wa-preview">
          <img src={imageUrl} alt={imageName || "Selected upload"} />
          <span>{imageName || "Photo attached"}</span>
          <button
            className="text-button"
            onClick={() => {
              setImageUrl("");
              setImageName("");
            }}
            type="button"
            style={{ marginLeft: 'auto' }}
          >
            <X size={20} />
          </button>
        </div>
      )}
      {localError && <p className="form-message" style={{ margin: '8px 16px 0', color: '#e53935' }}>{localError}</p>}
      <div className="wa-footer" style={{ position: 'relative' }}>
        {showEmojis && (
          <div className="wa-emoji-picker">
            {emojis.map(e => (
              <button 
                key={e} 
                className="wa-emoji-btn" 
                onClick={() => setDraft(draft + e)}
                type="button"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        
        {isRecording ? (
          <div className="wa-recording-banner">
            <button className="wa-icon-btn" onClick={cancelRecording} type="button">
              <Trash2 size={24} color="#ef4444" />
            </button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div className="wa-recording-dot"></div>
              <span>
                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <button className="wa-icon-btn" onClick={stopRecording} type="button" style={{ background: '#008069', color: '#fff' }}>
              <Send size={18} />
            </button>
          </div>
        ) : (
          <>
            <button className="wa-icon-btn" onClick={() => setShowEmojis(!showEmojis)} type="button">
              <Smile size={24} color={showEmojis ? "#008069" : "var(--wa-icon-color)"} />
            </button>
            <button className="wa-icon-btn" onClick={() => fileInputRef.current?.click()} type="button">
              <Paperclip size={24} />
              <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} hidden />
            </button>
            <div className="wa-input-container">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type a message"
                rows={1}
                style={{ resize: 'none', overflowY: 'auto' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <select className="wa-tag-select" value={tag} onChange={(event) => setTag(event.target.value)}>
                {tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            {draft.trim() || imageUrl ? (
              <button className="wa-icon-btn" onClick={handleSubmit} disabled={isSending} type="button">
                <Send size={24} color="var(--wa-icon-color)" />
              </button>
            ) : (
              <button className="wa-icon-btn" onClick={startRecording} type="button">
                <Mic size={24} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChartPanel({ title, eyebrow, children, chartClassName = "" }) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className={chartClassName ? `chart-canvas ${chartClassName}` : "chart-canvas"}>
        {children}
      </div>
    </article>
  );
}

function AgriSageModal({
  isOpen,
  onClose,
  role,
  answer,
  query,
  onQueryChange,
  onAsk,
  isAsking,
  systemCapabilities,
}) {
  const llmLabel = systemCapabilities?.localLlm?.enabled
    ? `${systemCapabilities.localLlm.provider} · ${systemCapabilities.localLlm.model}`
    : "Built-in local logic";
  const vectorLabel = systemCapabilities?.storage?.vector || "Local retrieval";
  const normalizedSummary = normalizeAnswerComparison(answer?.summary);
  const visibleEvidence = (answer?.evidence || []).filter((item) => {
    const normalizedEvidence = normalizeAnswerComparison(item?.text);

    if (!normalizedEvidence) {
      return false;
    }

    if (!normalizedSummary) {
      return true;
    }

    return (
      !normalizedSummary.includes(normalizedEvidence) &&
      !normalizedEvidence.includes(normalizedSummary)
    );
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="agrisage-modal-backdrop" onClick={onClose}>
      <motion.div
        className="agrisage-modal"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <button className="agrisage-close" onClick={(e) => { e.stopPropagation(); onClose(); }} type="button" aria-label="Close AgriSage">
          <X size={22} />
        </button>

        <section className="agrisage-hero">
          <div className="agrisage-hero-copy">
            <span>{role} AgriSage</span>
            <h2>Chat with your farm intelligence</h2>
            <p>
              Precise, live answers grounded in messages, payroll, and workforce activity.
            </p>
          </div>

          <div className="agrisage-stage" aria-hidden>
            <motion.div
              className="agrisage-phone agrisage-phone-left"
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 6.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="agrisage-phone-top" />
              <div className="agrisage-phone-screen">
                <span>Live payroll</span>
                <strong>{systemCapabilities?.textToSqlEnabled ? "Structured facts" : llmLabel}</strong>
                <p>Exact payment records and worker updates stay query-ready.</p>
              </div>
            </motion.div>

            <motion.div
              className="agrisage-bot-shell"
              animate={{ y: [0, -16, 0] }}
              transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="agrisage-bot-halo" />
              <div className="agrisage-bot">
                <div className="agrisage-bot-antenna" />
                <div className="agrisage-bot-head">
                  <div className="agrisage-bot-face">
                    <span />
                    <span />
                  </div>
                </div>
                <div className="agrisage-bot-body">
                  <Star size={18} />
                </div>
              </div>
            </motion.div>

            <motion.div
              className="agrisage-phone agrisage-phone-right"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="agrisage-phone-top" />
              <div className="agrisage-phone-screen">
                <span>Grounded retrieval</span>
                <strong>{vectorLabel}</strong>
                <p>Answers stay focused on the exact record you ask for.</p>
              </div>
            </motion.div>
          </div>
        </section>

        <div className="agrisage-query-shell">
          <div className="agrisage-query-card">
            <input
              className="agrisage-query-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Ask about visitors, attendance, alerts, tasks, or payroll"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAsk(query);
                }
              }}
            />
            <button className="agrisage-ask-button" onClick={() => onAsk(query)} type="button" disabled={isAsking}>
              {isAsking ? "Searching..." : "Ask"}
              {!isAsking && <Send size={18} />}
            </button>
          </div>
        </div>

        {answer?.question ? (
          <motion.div
            className="copilot-answer agrisage-answer"
            key={answer.question}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div className="agrisage-answer-kicker">{answer.question}</div>
            <strong>{answer?.title}</strong>
            <span>{answer?.summary}</span>
            {visibleEvidence.length ? (
              <div className="copilot-sources">
                {visibleEvidence.map((item) => (
                  <div className="copilot-source" key={item.id}>
                    <strong>
                      {item.senderName} · {item.timeLabel}
                    </strong>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </motion.div>
        ) : (
          <div className="empty-state agrisage-empty">
            <div className="agrisage-empty-orb" />
            <strong>Ask AgriSage anything operational</strong>
            <p>Try payroll details, worker progress, visitor counts, or alerts.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function SalesFinancePanel({ sales = [], invoices = [], expenses = [], onRefresh }) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const outstandingAmount = invoices
    .filter(i => i.status !== 'paid')
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  const plantRevenue = {};
  sales.forEach(s => {
    plantRevenue[s.plantName] = (plantRevenue[s.plantName] || 0) + Number(s.totalAmount || 0);
  });
  const sortedPlants = Object.entries(plantRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const horizontalBarData = {
    labels: sortedPlants.map(p => p[0]),
    datasets: [{
      label: "Revenue (INR)",
      data: sortedPlants.map(p => p[1]),
      backgroundColor: "rgba(92, 196, 154, 0.7)",
      borderColor: "#5cc49a",
      borderWidth: 1,
      borderRadius: 6,
    }]
  };

  const filteredSales = sales.filter(s => 
    s.plantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section className="dashboard-grid">
      <style>{`
        .finance-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .flex-row {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 24px;
          margin-bottom: 24px;
          width: 100%;
        }
        .invoice-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid var(--line);
        }
        .invoice-item:last-child {
          border-bottom: none;
        }
        .badge {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-paid { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
        .badge-unpaid { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
        .badge-overdue { background: rgba(248, 113, 113, 0.15); color: #f87171; }
        .sales-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .sales-search {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px 12px;
          color: var(--ink);
          font-size: 13px;
          width: 240px;
          outline: none;
        }
        .sales-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .sales-table th {
          border-bottom: 1px solid var(--line);
          padding: 12px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
        }
        .sales-table td {
          padding: 12px;
          border-bottom: 1px solid var(--line);
          font-size: 13px;
        }
        .sales-table tr:last-child td {
          border-bottom: none;
        }
      `}</style>

      <div className="metric-grid" style={{ gridColumn: "1 / -1" }}>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="finance-icon" style={{ background: "rgba(74, 222, 128, 0.1)", color: "#4ade80" }}>
            <DollarSign size={20} />
          </div>
          <div className="finance-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Monthly Revenue</span>
            <strong>₹{totalRevenue.toLocaleString("en-IN")}</strong>
          </div>
        </div>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="finance-icon" style={{ background: "rgba(248, 113, 113, 0.1)", color: "#f87171" }}>
            <TrendingDown size={20} />
          </div>
          <div className="finance-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Monthly Expenses</span>
            <strong>₹{totalExpenses.toLocaleString("en-IN")}</strong>
          </div>
        </div>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="finance-icon" style={{ background: "rgba(125, 211, 252, 0.1)", color: "#7dd3fc" }}>
            <TrendingUp size={20} />
          </div>
          <div className="finance-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Net Profit</span>
            <strong style={{ color: netProfit >= 0 ? "#4ade80" : "#f87171" }}>
              ₹{netProfit.toLocaleString("en-IN")}
            </strong>
          </div>
        </div>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="finance-icon" style={{ background: "rgba(251, 191, 36, 0.1)", color: "#fbbf24" }}>
            <CreditCard size={20} />
          </div>
          <div className="finance-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Outstanding Invoices</span>
            <strong>₹{outstandingAmount.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </div>

      <div className="flex-row" style={{ gridColumn: "1 / -1" }}>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Visual Analytics</p>
              <h2>Top Plant Revenue</h2>
            </div>
          </div>
          <div style={{ height: "240px", marginTop: "16px" }}>
            {sortedPlants.length > 0 ? (
              <Bar 
                data={horizontalBarData} 
                options={{
                  indexAxis: 'y',
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#94a3b8" } },
                    y: { grid: { display: false }, ticks: { color: "#94a3b8" } }
                  }
                }} 
              />
            ) : (
              <div className="empty-state">No sales data available.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Collections</p>
              <h2>Recent Invoices</h2>
            </div>
          </div>
          <div style={{ marginTop: "16px", maxHeight: "240px", overflowY: "auto" }}>
            {invoices.length > 0 ? (
              invoices.slice(0, 5).map(inv => (
                <div key={inv.id} className="invoice-item">
                  <div>
                    <strong style={{ display: "block", fontSize: "13px" }}>{inv.customerName}</strong>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>{inv.id} · Due {formatDate(inv.dueDate)}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ display: "block", fontSize: "13px" }}>₹{Number(inv.amount).toLocaleString("en-IN")}</strong>
                    <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No invoices logged.</div>
            )}
          </div>
        </article>
      </div>

      <article className="panel large-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="sales-header">
          <div>
            <p className="eyebrow">Transactions Ledger</p>
            <h2>Recent Sales Table</h2>
          </div>
          <input 
            type="text" 
            placeholder="Search plant or customer..." 
            className="sales-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          {filteredSales.length > 0 ? (
            <table className="sales-table">
              <thead>
                <tr>
                  <th>PLANT NAME</th>
                  <th>CUSTOMER</th>
                  <th>QTY</th>
                  <th>UNIT PRICE</th>
                  <th>TOTAL</th>
                  <th>SALE DATE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.plantName}</strong></td>
                    <td>{s.customerName}</td>
                    <td>{s.quantity}</td>
                    <td>₹{Number(s.unitPrice).toLocaleString("en-IN")}</td>
                    <td><strong>₹{Number(s.totalAmount).toLocaleString("en-IN")}</strong></td>
                    <td>{formatDate(s.saleDate)}</td>
                    <td><span className="badge badge-paid">{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No sales transactions match the query.</div>
          )}
        </div>
      </article>
    </section>
  );
}

function ExpensesPanel({ expenses = [], onAddExpense, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: "", category: "Labor Costs", paymentMethod: "Bank Transfer", amount: "", expenseDate: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const catExpenses = {};
  expenses.forEach(e => {
    catExpenses[e.category] = (catExpenses[e.category] || 0) + Number(e.amount || 0);
  });
  const donutData = {
    labels: Object.keys(catExpenses),
    datasets: [{
      data: Object.values(catExpenses),
      backgroundColor: [
        'rgba(248, 113, 113, 0.7)',
        'rgba(125, 211, 252, 0.7)',
        'rgba(212, 168, 67, 0.7)',
        'rgba(92, 196, 154, 0.7)',
        'rgba(192, 132, 252, 0.7)',
        'rgba(251, 146, 60, 0.7)',
      ],
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
    }]
  };

  const monthlyExpenses = {};
  expenses.forEach(e => {
    const d = new Date(e.expenseDate);
    const m = d.toLocaleString('en-US', { month: 'short' });
    monthlyExpenses[m] = (monthlyExpenses[m] || 0) + Number(e.amount || 0);
  });
  const barData = {
    labels: Object.keys(monthlyExpenses),
    datasets: [{
      label: 'Monthly Expenses',
      data: Object.values(monthlyExpenses),
      backgroundColor: 'rgba(212, 168, 67, 0.7)',
      borderColor: '#d4a843',
      borderRadius: 6,
      borderWidth: 1,
    }]
  };

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          e.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = catFilter === "All" || e.category === catFilter;
    return matchesSearch && matchesCat;
  });

  const categories = ["Labor Costs", "Water", "Fertilizers", "Transportation", "Pesticides", "Other"];

  async function handleSubmit(evt) {
    evt.preventDefault();
    if (!form.description.trim() || !form.amount) return;
    await onAddExpense(form);
    setForm({ description: "", category: "Labor Costs", paymentMethod: "Bank Transfer", amount: "", expenseDate: "" });
    setShowForm(false);
    if (onRefresh) onRefresh();
  }

  const largestExpense = expenses.length > 0
    ? expenses.reduce((max, e) => Number(e.amount) > Number(max.amount) ? e : max, expenses[0])
    : null;

  const getCategoryClass = (category) => {
    const normalized = String(category || "").toLowerCase();
    if (normalized.includes("labor")) return "badge-labor";
    if (normalized.includes("water")) return "badge-water";
    if (normalized.includes("fertilizer")) return "badge-fertilizers";
    if (normalized.includes("transport")) return "badge-transportation";
    if (normalized.includes("pesticide")) return "badge-pesticides";
    return "badge-other";
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="expenses-container">
      <style>{`
        .expenses-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
          width: 100%;
        }

        .expenses-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, rgba(20, 50, 32, 0.45) 0%, rgba(12, 30, 20, 0.25) 100%);
          border: 1px solid rgba(45, 160, 95, 0.25);
          border-radius: 16px;
          padding: 24px 32px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(12px);
        }

        .expenses-header h2 {
          font-size: 24px;
          font-weight: 800;
          color: #f8fafc;
          margin: 0 0 4px 0;
          letter-spacing: -0.02em;
        }

        .expenses-header p {
          color: #8fa99a;
          margin: 0;
          font-size: 14px;
        }

        .expenses-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }

        .expenses-kpi-card {
          background: rgba(18, 38, 28, 0.3);
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .expenses-kpi-card:hover {
          transform: translateY(-4px);
          border-color: rgba(45, 160, 95, 0.45);
          box-shadow: 0 12px 30px rgba(33, 122, 74, 0.15);
        }

        .kpi-icon-wrapper {
          width: 54px;
          height: 54px;
          border-radius: 14px;
          background: rgba(45, 160, 95, 0.15);
          border: 1px solid rgba(45, 160, 95, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2da05f;
          transition: all 0.3s ease;
        }

        .expenses-kpi-card:hover .kpi-icon-wrapper {
          background: #2da05f;
          color: #ffffff;
          transform: scale(1.05);
        }

        .kpi-content {
          display: flex;
          flex-direction: column;
        }

        .kpi-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #8fa99a;
          font-weight: 700;
        }

        .kpi-stat {
          font-size: 26px;
          font-weight: 800;
          color: #f8fafc;
          margin: 6px 0 2px 0;
          letter-spacing: -0.01em;
          line-height: 1;
        }

        .kpi-desc {
          font-size: 12px;
          color: #6b8476;
        }

        .exp-flex-charts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
        }

        .exp-chart-card {
          background: rgba(18, 38, 28, 0.25);
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(12px);
        }

        .exp-chart-title {
          font-size: 16px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 16px 0;
        }

        .exp-ledger-card {
          background: rgba(18, 38, 28, 0.25);
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .ledger-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }

        .ledger-search-box {
          position: relative;
          min-width: 280px;
          flex: 1;
          max-width: 400px;
        }

        .ledger-search-box input {
          width: 100%;
          padding: 12px 16px 12px 44px;
          background: rgba(15, 23, 42, 0.45);
          border: 1.5px solid rgba(45, 160, 95, 0.2);
          border-radius: 12px;
          color: #f1f5f9;
          font-size: 14px;
          outline: none;
          transition: all 0.3s ease;
        }

        .ledger-search-box input:focus {
          border-color: #2da05f;
          background: rgba(15, 23, 42, 0.7);
          box-shadow: 0 0 0 3px rgba(45, 160, 95, 0.15);
        }

        .ledger-search-box svg {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #8fa99a;
        }

        .ledger-filter-select {
          padding: 12px 18px;
          background: rgba(15, 23, 42, 0.45);
          border: 1.5px solid rgba(45, 160, 95, 0.2);
          border-radius: 12px;
          color: #f1f5f9;
          font-size: 14px;
          outline: none;
          cursor: pointer;
          min-width: 180px;
          transition: all 0.3s ease;
        }

        .ledger-filter-select:focus {
          border-color: #2da05f;
        }

        .ledger-table-wrapper {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .premium-ledger-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .premium-ledger-table th {
          background: rgba(15, 23, 42, 0.6);
          padding: 16px 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8fa99a;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .premium-ledger-table td {
          padding: 18px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          font-size: 14px;
          vertical-align: middle;
        }

        .premium-ledger-table tr:hover td {
          background: rgba(45, 160, 95, 0.05);
          color: #ffffff;
        }

        .premium-ledger-table tr:last-child td {
          border-bottom: none;
        }

        .badge-category {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 99px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .badge-labor { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
        .badge-water { background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2); }
        .badge-fertilizers { background: rgba(234, 179, 8, 0.12); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.2); }
        .badge-transportation { background: rgba(168, 85, 247, 0.12); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.2); }
        .badge-pesticides { background: rgba(249, 115, 22, 0.12); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.2); }
        .badge-other { background: rgba(148, 163, 184, 0.12); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.2); }

        .date-display {
          font-weight: 500;
          color: #94a3b8;
        }

        .desc-text {
          font-weight: 600;
          color: #f1f5f9;
        }

        .payment-info {
          font-size: 13px;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .amount-display {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
        }

        .btn-log-expense {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #2da05f 0%, #22c55e 100%);
          border: none;
          border-radius: 12px;
          color: #ffffff;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);
        }

        .btn-log-expense:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 197, 94, 0.45);
        }

        .exp-form-modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(8px);
        }

        .exp-form-card {
          width: 480px;
          background: #0d1f14;
          border: 1px solid rgba(45, 160, 95, 0.25);
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }

        .form-row {
          margin-bottom: 16px;
        }

        .form-row label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          color: #8fa99a;
        }

        .form-input {
          width: 100%;
          padding: 10px 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(45, 160, 95, 0.2);
          border-radius: 8px;
          color: #f1f5f9;
          font-size: 14px;
          outline: none;
        }

        .form-input:focus {
          border-color: #2da05f;
        }
      `}</style>

      <div className="expenses-header">
        <div className="expenses-title-area">
          <h2>Expenses Management</h2>
          <p>Track, filter, and audit operational outflows and seasonal budgets</p>
        </div>
        <button className="btn-log-expense" onClick={() => setShowForm(true)} type="button">
          <Plus size={16} /> Log Expense
        </button>
      </div>

      <div className="expenses-kpi-grid">
        <div className="expenses-kpi-card">
          <div className="kpi-icon-wrapper">
            <TrendingUp size={24} />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Total Outflows</span>
            <span className="kpi-stat">₹{totalExpenses.toLocaleString("en-IN")}</span>
            <span className="kpi-desc">Aggregated operational outflows</span>
          </div>
        </div>

        <div className="expenses-kpi-card">
          <div className="kpi-icon-wrapper">
            <PieChart size={24} />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Active Sectors</span>
            <span className="kpi-stat">{Object.keys(catExpenses).length}</span>
            <span className="kpi-desc">Cost categories registered</span>
          </div>
        </div>

        <div className="expenses-kpi-card">
          <div className="kpi-icon-wrapper">
            <CreditCard size={24} />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Largest Single Outflow</span>
            <span className="kpi-stat">
              {largestExpense ? `₹${Number(largestExpense.amount).toLocaleString("en-IN")}` : "₹0"}
            </span>
            <span className="kpi-desc">
              {largestExpense ? largestExpense.description : "No expenses recorded"}
            </span>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="exp-form-modal">
          <form className="exp-form-card" onSubmit={handleSubmit}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: "20px", color: "#f8fafc" }}>Record New Outflow</h3>
            
            <div className="form-row">
              <label>Description</label>
              <input 
                type="text" 
                className="form-input" 
                required 
                placeholder="e.g. Labor Wages - June"
                value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
              />
            </div>

            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label>Category</label>
                <select 
                  className="form-input"
                  style={{ background: "#0d1f14" }}
                  value={form.category}
                  onChange={e => setForm({...form, category: e.target.value})}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Payment Method</label>
                <select 
                  className="form-input"
                  style={{ background: "#0d1f14" }}
                  value={form.paymentMethod}
                  onChange={e => setForm({...form, paymentMethod: e.target.value})}
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>
            </div>

            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label>Amount (INR)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  placeholder="Amount"
                  value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value})}
                />
              </div>
              <div>
                <label>Expense Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  required
                  value={form.expenseDate}
                  onChange={e => setForm({...form, expenseDate: e.target.value})}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button type="button" className="btn-secondary" style={{ background: "rgba(255,255,255,0.05)", color: "#cbd5e1", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 18px", cursor: "pointer" }} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ background: "#2da05f", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 18px", cursor: "pointer", fontWeight: "700" }}>Save Expense</button>
            </div>
          </form>
        </div>
      )}

      <div className="exp-flex-charts">
        <article className="exp-chart-card">
          <h3 className="exp-chart-title">Category Distribution</h3>
          <div style={{ height: "240px", position: "relative" }}>
            {Object.keys(catExpenses).length > 0 ? (
              <Doughnut 
                data={donutData} 
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'right', labels: { color: "#cbd5e1" } } }
                }} 
              />
            ) : (
              <div className="empty-state">No breakdown data.</div>
            )}
          </div>
        </article>

        <article className="exp-chart-card">
          <h3 className="exp-chart-title">Monthly Trend</h3>
          <div style={{ height: "240px", position: "relative" }}>
            {Object.keys(monthlyExpenses).length > 0 ? (
              <Bar 
                data={barData} 
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
                    y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } }
                  }
                }} 
              />
            ) : (
              <div className="empty-state">No monthly records.</div>
            )}
          </div>
        </article>
      </div>

      <article className="exp-ledger-card">
        <div className="ledger-top-bar">
          <div>
            <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8fa99a", fontWeight: "700" }}>Audit Ledger</span>
            <h3 style={{ margin: "4px 0 0 0", fontSize: "18px", fontWeight: "700", color: "#f8fafc" }}>Outflows Ledger</h3>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <select 
              className="ledger-filter-select" 
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
            >
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="ledger-search-box">
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Search expenses..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ledger-table-wrapper">
          {filteredExpenses.length > 0 ? (
            <table className="premium-ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Payment Method</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(e => (
                  <tr key={e.id}>
                    <td className="date-display">{formatDate(e.expenseDate)}</td>
                    <td className="desc-text">{e.description}</td>
                    <td>
                      <span className={`badge-category ${getCategoryClass(e.category)}`}>
                        {e.category}
                      </span>
                    </td>
                    <td className="payment-info">
                      <CreditCard size={14} style={{ opacity: 0.6 }} />
                      {e.paymentMethod}
                    </td>
                    <td className="amount-display" style={{ textAlign: "right" }}>
                      ₹{Number(e.amount).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: "40px", textAlignment: "center", color: "#8fa99a" }}>
              No expenses found matching the criteria.
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function OrdersPanel({ orders = [], onUpdateOrder, onRefresh }) {
  const [activeTab, setActiveTab] = useState("All");
  const [activePaymentOrder, setActivePaymentOrder] = useState(null);

  // New Order placement modal state
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [newOrderForm, setNewOrderForm] = useState({
    customerName: "",
    companyName: "",
    totalAmount: "",
    status: "Pending",
    deliveryDate: "",
    paymentStatus: "unpaid"
  });

  async function handlePlaceOrderSubmit(e) {
    e.preventDefault();
    if (!newOrderForm.customerName.trim()) {
      setOrderError("Customer name is required");
      return;
    }
    if (!newOrderForm.totalAmount || Number(newOrderForm.totalAmount) <= 0) {
      setOrderError("Total amount must be a positive number");
      return;
    }

    setIsSubmittingOrder(true);
    setOrderError("");

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: newOrderForm.customerName.trim(),
          companyName: newOrderForm.companyName.trim() || null,
          totalAmount: Number(newOrderForm.totalAmount),
          status: newOrderForm.status,
          deliveryDate: newOrderForm.deliveryDate || null,
          paymentStatus: newOrderForm.paymentStatus
        })
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Failed to place order");
      }

      setNewOrderForm({
        customerName: "",
        companyName: "",
        totalAmount: "",
        status: "Pending",
        deliveryDate: "",
        paymentStatus: "unpaid"
      });
      setShowNewOrderModal(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Failed to place order:", err);
      setOrderError(err.message || "Failed to place order");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  const totalValue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  
  const getCount = (status) => orders.filter(o => o.status === status).length;

  const filteredOrders = activeTab === "All" ? orders : orders.filter(o => o.status === activeTab);

  const upcomingDeliveries = [...orders]
    .filter(o => o.status !== "Delivered" && o.deliveryDate)
    .sort((a,b) => new Date(a.deliveryDate) - new Date(b.deliveryDate));

  async function handleStatusChange(id, newStatus) {
    await onUpdateOrder(id, { status: newStatus });
    if (onRefresh) onRefresh();
  }

  async function handlePaymentChange(id, newPay) {
    await onUpdateOrder(id, { paymentStatus: newPay });
    if (onRefresh) onRefresh();
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch (e) {
      return dateStr;
    }
  };

  const getStatusBorderColor = (status) => {
    switch (status) {
      case "Delivered": return "rgba(34, 197, 94, 0.4)";
      case "Shipped": return "rgba(99, 102, 241, 0.4)";
      case "Processing": return "rgba(59, 130, 246, 0.4)";
      case "Confirmed": return "rgba(234, 179, 8, 0.4)";
      default: return "rgba(239, 68, 68, 0.4)";
    }
  };

  return (
    <section className="dashboard-grid" style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
      <style>{`
        .order-pay-btn {
          background: #2da05f;
          border: none;
          color: white;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(45, 160, 95, 0.2);
        }
        .order-pay-btn:hover {
          background: #22864e;
          transform: translateY(-1px);
        }
        .order-pay-btn:active {
          transform: translateY(0);
        }

        .orders-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          width: 100%;
        }
        
        .order-kpi-card {
          background: rgba(18, 38, 28, 0.3);
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 12px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          transition: all 0.25s ease;
        }

        .order-kpi-card:hover {
          transform: translateY(-2px);
          border-color: rgba(45, 160, 95, 0.4);
          box-shadow: 0 8px 24px rgba(33, 122, 74, 0.1);
        }

        .order-kpi-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #8fa99a;
          font-weight: 700;
        }

        .order-kpi-val {
          font-size: 26px;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1;
        }

        .orders-subgrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          width: 100%;
        }

        .premium-orders-panel {
          background: rgba(18, 38, 28, 0.25);
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(12px);
        }

        .orders-tab-bar {
          display: flex;
          gap: 6px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 5px;
          border-radius: 10px;
        }

        .orders-tab-btn {
          padding: 6px 14px;
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 7px;
          background: transparent;
          border: none;
          color: #8fa99a;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .orders-tab-btn:hover {
          color: #f8fafc;
          background: rgba(255,255,255,0.02);
        }

        .orders-tab-btn.active {
          color: #ffffff;
          background: #2da05f;
          box-shadow: 0 2px 8px rgba(45, 160, 95, 0.2);
        }

        .table-scroll-container {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 16px;
        }

        .premium-orders-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .premium-orders-table th {
          background: rgba(15, 23, 42, 0.6);
          padding: 16px 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8fa99a;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
        }

        .premium-orders-table td {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          font-size: 13.5px;
          vertical-align: middle;
          white-space: nowrap;
        }

        .premium-orders-table td.customer-cell {
          white-space: normal;
          min-width: 220px;
        }

        .premium-orders-table tr:hover td {
          background: rgba(45, 160, 95, 0.05);
          color: #ffffff;
        }

        .premium-orders-table tr:last-child td {
          border-bottom: none;
        }

        .premium-select-status {
          background: rgba(15, 23, 42, 0.6);
          border: 1.5px solid rgba(45, 160, 95, 0.2);
          border-radius: 8px;
          color: #f1f5f9;
          font-size: 12px;
          padding: 6px 12px;
          outline: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .premium-select-status:focus {
          border-color: #2da05f;
        }

        .premium-timeline-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 12px;
          margin-bottom: 12px;
          background: rgba(18, 38, 28, 0.2);
          transition: all 0.25s ease;
        }

        .premium-timeline-item:hover {
          transform: translateX(4px);
          border-color: rgba(45, 160, 95, 0.4);
          background: rgba(45, 160, 95, 0.06);
        }

        .timeline-icon-box {
          background: rgba(212, 168, 67, 0.12);
          color: #d4a843;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(212, 168, 67, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(45, 160, 95, 0.3);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(45, 160, 95, 0.5);
        }
      `}</style>

      <div className="orders-kpi-grid">
        <div className="order-kpi-card">
          <span className="order-kpi-label">Pending</span>
          <span className="order-kpi-val" style={{ color: "#ef4444" }}>{getCount("Pending")}</span>
        </div>
        <div className="order-kpi-card">
          <span className="order-kpi-label">Confirmed</span>
          <span className="order-kpi-val" style={{ color: "#eab308" }}>{getCount("Confirmed")}</span>
        </div>
        <div className="order-kpi-card">
          <span className="order-kpi-label">Processing</span>
          <span className="order-kpi-val" style={{ color: "#3b82f6" }}>{getCount("Processing")}</span>
        </div>
        <div className="order-kpi-card">
          <span className="order-kpi-label">Shipped</span>
          <span className="order-kpi-val" style={{ color: "#6366f1" }}>{getCount("Shipped")}</span>
        </div>
        <div className="order-kpi-card">
          <span className="order-kpi-label">Delivered</span>
          <span className="order-kpi-val" style={{ color: "#22c55e" }}>{getCount("Delivered")}</span>
        </div>
        <div className="order-kpi-card">
          <span className="order-kpi-label">Total Value</span>
          <span className="order-kpi-val">₹{totalValue.toLocaleString("en-IN")}</span>
        </div>
      </div>

      <div className="orders-subgrid">
        <article className="premium-orders-panel">
          <div className="sales-header" style={{ marginBottom: "16px" }}>
            <div>
              <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8fa99a", fontWeight: "700" }}>Customer Orders</span>
              <h3 style={{ margin: "4px 0 0 0", fontSize: "18px", fontWeight: "700", color: "#f8fafc" }}>Client Base Orders Ledger</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="orders-tab-bar">
                {["All", "Pending", "Confirmed", "Processing", "Shipped", "Delivered"].map(t => (
                  <button 
                    key={t}
                    type="button"
                    className={`orders-tab-btn ${activeTab === t ? 'active' : ''}`}
                    onClick={() => setActiveTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button 
                type="button" 
                className="order-pay-btn" 
                onClick={() => setShowNewOrderModal(true)}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", height: "38px" }}
              >
                <Plus size={16} /> Place Order
              </button>
            </div>
          </div>
          <div className="table-scroll-container custom-scrollbar">
            {filteredOrders.length > 0 ? (
              <table className="premium-orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Order Date</th>
                    <th>Delivery</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 700, color: "#94a3b8" }}>{o.id}</td>
                      <td className="customer-cell">
                        <strong className="desc-text" style={{ display: "block" }}>{o.customerName}</strong>
                        {o.companyName && <span style={{ display: "block", fontSize: "11px", color: "#8fa99a", marginTop: "2px" }}>{o.companyName}</span>}
                      </td>
                      <td className="date-display">{formatDate(o.orderDate)}</td>
                      <td className="date-display" style={{ fontWeight: o.deliveryDate ? 600 : 400 }}>{o.deliveryDate ? formatDate(o.deliveryDate) : "N/A"}</td>
                      <td className="amount-display">₹{Number(o.totalAmount).toLocaleString("en-IN")}</td>
                      <td>
                        <select 
                          className="premium-select-status"
                          style={{ borderColor: getStatusBorderColor(o.status), background: "#0d1f14" }}
                          value={o.status}
                          onChange={e => handleStatusChange(o.id, e.target.value)}
                        >
                          <option style={{ background: "#0d1f14" }} value="Pending">Pending</option>
                          <option style={{ background: "#0d1f14" }} value="Confirmed">Confirmed</option>
                          <option style={{ background: "#0d1f14" }} value="Processing">Processing</option>
                          <option style={{ background: "#0d1f14" }} value="Shipped">Shipped</option>
                          <option style={{ background: "#0d1f14" }} value="Delivered">Delivered</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <select 
                            className="premium-select-status"
                            style={{ borderColor: o.paymentStatus === "paid" ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)", background: "#0d1f14" }}
                            value={o.paymentStatus}
                            onChange={e => {
                              if (e.target.value === "paid" && o.paymentStatus === "unpaid") {
                                setActivePaymentOrder(o);
                              } else {
                                handlePaymentChange(o.id, e.target.value);
                              }
                            }}
                          >
                            <option style={{ background: "#0d1f14" }} value="unpaid">Unpaid</option>
                            <option style={{ background: "#0d1f14" }} value="paid">Paid</option>
                          </select>
                          {o.paymentStatus === "unpaid" && (
                            <button
                              type="button"
                              className="order-pay-btn"
                              onClick={() => setActivePaymentOrder(o)}
                            >
                              Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: "40px", textAlign: "center", color: "#8fa99a" }}>
                No orders in this status category.
              </div>
            )}
          </div>
        </article>

        <article className="premium-orders-panel" style={{ display: "flex", flexDirection: "column" }}>
          <div className="panel-heading" style={{ marginBottom: "16px" }}>
            <div>
              <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8fa99a", fontWeight: "700" }}>Delivery Pipeline</span>
              <h3 style={{ margin: "4px 0 0 0", fontSize: "18px", fontWeight: "700", color: "#f8fafc" }}>Scheduler Timeline</h3>
            </div>
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, maxHeight: "420px", overflowY: "auto", paddingRight: "4px" }}>
            {upcomingDeliveries.length > 0 ? (
              upcomingDeliveries.map(o => {
                const daysLeft = Math.ceil((new Date(o.deliveryDate) - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={o.id} className="premium-timeline-item">
                    <div className="timeline-icon-box">
                      <Truck size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: "block", fontSize: "13.5px", color: "#f1f5f9" }}>{o.customerName}</strong>
                      <span style={{ fontSize: "11px", color: "#8fa99a", display: "block", marginTop: "2px" }}>
                        {o.id} · Delivers {formatDate(o.deliveryDate)}
                      </span>
                    </div>
                    <div>
                      <span className={`badge ${daysLeft <= 2 ? 'badge-overdue' : 'badge-paid'}`} style={{ whiteSpace: "nowrap" }}>
                        {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Today" : "Overdue"}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#8fa99a" }}>
                No upcoming deliveries scheduled.
              </div>
            )}
          </div>
        </article>
      </div>
      {activePaymentOrder && (
        <PaymentGateway
          worker={{
            id: activePaymentOrder.id,
            name: activePaymentOrder.customerName,
            email: "customer@florisight.local"
          }}
          onClose={() => setActivePaymentOrder(null)}
          initialAmount={activePaymentOrder.totalAmount}
          paymentType="order"
          onPaymentComplete={async ({ method, amount, txnId, date }) => {
            await handlePaymentChange(activePaymentOrder.id, "paid");
          }}
        />
      )}

      {showNewOrderModal && (
        <div className="overview-modal-backdrop" onClick={() => !isSubmittingOrder && setShowNewOrderModal(false)}>
          <div className="overview-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "500px", background: "linear-gradient(135deg, #0b1f14 0%, #06100a 100%)", border: "1px solid rgba(45, 160, 95, 0.3)", borderRadius: "16px", padding: "30px", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "#f8fafc" }}>Place New Customer Order</h3>
              <button 
                type="button"
                onClick={() => setShowNewOrderModal(false)} 
                style={{ background: "transparent", border: "none", color: "#8fa99a", fontSize: "24px", cursor: "pointer", padding: 0 }}
                disabled={isSubmittingOrder}
              >
                &times;
              </button>
            </div>

            {orderError && (
              <p style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "10px 16px", color: "#f87171", fontSize: "13px", margin: "0 0 20px 0" }}>
                {orderError}
              </p>
            )}

            <form onSubmit={handlePlaceOrderSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8fa99a", fontWeight: "600" }}>Customer Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Acme Corporates"
                  value={newOrderForm.customerName}
                  onChange={e => setNewOrderForm(prev => ({ ...prev, customerName: e.target.value }))}
                  style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(45, 160, 95, 0.25)", borderRadius: "8px", padding: "10px 14px", color: "#f8fafc", outline: "none", fontSize: "14px" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8fa99a", fontWeight: "600" }}>Company Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. ACME DISTRIBUTORS"
                  value={newOrderForm.companyName}
                  onChange={e => setNewOrderForm(prev => ({ ...prev, companyName: e.target.value }))}
                  style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(45, 160, 95, 0.25)", borderRadius: "8px", padding: "10px 14px", color: "#f8fafc", outline: "none", fontSize: "14px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8fa99a", fontWeight: "600" }}>Total Amount (INR) *</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    placeholder="e.g. 1500"
                    value={newOrderForm.totalAmount}
                    onChange={e => setNewOrderForm(prev => ({ ...prev, totalAmount: e.target.value }))}
                    style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(45, 160, 95, 0.25)", borderRadius: "8px", padding: "10px 14px", color: "#f8fafc", outline: "none", fontSize: "14px" }}
                  />
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8fa99a", fontWeight: "600" }}>Delivery Date</label>
                  <input 
                    type="date" 
                    value={newOrderForm.deliveryDate}
                    onChange={e => setNewOrderForm(prev => ({ ...prev, deliveryDate: e.target.value }))}
                    style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(45, 160, 95, 0.25)", borderRadius: "8px", padding: "8px 12px", color: "#f8fafc", outline: "none", fontSize: "14px" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8fa99a", fontWeight: "600" }}>Order Status</label>
                  <select 
                    value={newOrderForm.status}
                    onChange={e => setNewOrderForm(prev => ({ ...prev, status: e.target.value }))}
                    style={{ background: "#06100a", border: "1px solid rgba(45, 160, 95, 0.25)", borderRadius: "8px", padding: "10px 14px", color: "#f8fafc", outline: "none", fontSize: "14px", cursor: "pointer" }}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Processing">Processing</option>
                    <option value="Shipped">Shipped</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#8fa99a", fontWeight: "600" }}>Payment Status</label>
                  <select 
                    value={newOrderForm.paymentStatus}
                    onChange={e => setNewOrderForm(prev => ({ ...prev, paymentStatus: e.target.value }))}
                    style={{ background: "#06100a", border: "1px solid rgba(45, 160, 95, 0.25)", borderRadius: "8px", padding: "10px 14px", color: "#f8fafc", outline: "none", fontSize: "14px", cursor: "pointer" }}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
                <button 
                  type="button" 
                  onClick={() => setShowNewOrderModal(false)}
                  style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid rgba(45, 160, 95, 0.25)", borderRadius: "8px", color: "#8fa99a", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}
                  disabled={isSubmittingOrder}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  style={{ flex: 1, padding: "12px", background: "#2da05f", border: "none", borderRadius: "8px", color: "white", fontWeight: "600", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  disabled={isSubmittingOrder}
                >
                  {isSubmittingOrder ? "Placing..." : "Place Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function MlAnalyticsPanel({ seasonalForecasts = [] }) {
  const monthOrder = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
  };

  const sortedForecasts = [...seasonalForecasts].sort((a, b) => {
    return (monthOrder[a.month] || 0) - (monthOrder[b.month] || 0);
  });

  const lineData = {
    labels: sortedForecasts.map(f => f.month),
    datasets: [{
      label: 'Predicted Demand (Units)',
      data: sortedForecasts.map(f => f.predictedDemand),
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.1)',
      fill: true,
      tension: 0.35,
      borderWidth: 2.5,
      pointBackgroundColor: '#38bdf8',
      pointBorderColor: 'rgba(255, 255, 255, 0.8)',
      pointHoverRadius: 6,
    }]
  };

  const handleAuthorizePlan = (crop, month) => {
    alert(`Demand Planning Authorized: Initiating propagation cycles for ${crop} in ${month}. Workforce tasks generated.`);
  };

  return (
    <section className="dashboard-grid" style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
      <style>{`
        .ai-alerts-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
        }

        .ai-alert-banner {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 14px;
          padding: 18px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(12px);
        }

        .ai-alert-banner.warning {
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .ai-alert-banner.success {
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .ai-alert-banner.info {
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.2);
        }

        .ai-alert-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          flex-shrink: 0;
        }

        .ai-alert-icon.warning {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
        }

        .ai-alert-icon.success {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
        }

        .ai-alert-icon.info {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
        }

        .ai-alert-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .ai-alert-title {
          font-weight: 700;
          font-size: 15px;
          color: #f8fafc;
        }

        .ai-alert-desc {
          font-size: 13.5px;
          color: #cbd5e1;
          line-height: 1.4;
        }

        .ml-chart-card {
          background: rgba(18, 38, 28, 0.25);
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(12px);
        }

        .ml-chart-title {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 16px 0;
        }

        .ml-ledger-card {
          background: rgba(18, 38, 28, 0.25);
          border: 1px solid rgba(45, 160, 95, 0.15);
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .premium-ml-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .premium-ml-table th {
          background: rgba(15, 23, 42, 0.6);
          padding: 16px 20px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8fa99a;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
        }

        .premium-ml-table td {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          font-size: 13.5px;
          vertical-align: middle;
          white-space: nowrap;
        }

        .premium-ml-table tr:hover td {
          background: rgba(45, 160, 95, 0.05);
          color: #ffffff;
        }

        .premium-ml-table tr:last-child td {
          border-bottom: none;
        }

        .premium-event-badge {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.2);
          padding: 4px 12px;
          border-radius: 99px;
          font-size: 12px;
          font-weight: 600;
        }

        .confidence-bar-outer {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 99px;
          height: 8px;
          width: 90px;
          display: inline-block;
          vertical-align: middle;
          margin-left: 10px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .confidence-bar-inner {
          background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
          height: 100%;
          border-radius: 99px;
        }

        .btn-authorize-plan {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #2da05f 0%, #22c55e 100%);
          border: none;
          border-radius: 8px;
          color: #ffffff;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
        }

        .btn-authorize-plan:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 16px rgba(34, 197, 94, 0.35);
        }

        .btn-authorize-plan:active {
          transform: translateY(0);
        }

        .custom-table-container {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .custom-table-container::-webkit-scrollbar {
          height: 6px;
        }
        .custom-table-container::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.05);
        }
        .custom-table-container::-webkit-scrollbar-thumb {
          background: rgba(45, 160, 95, 0.3);
          border-radius: 99px;
        }
        .custom-table-container::-webkit-scrollbar-thumb:hover {
          background: rgba(45, 160, 95, 0.5);
        }
      `}</style>

      <div className="ai-alerts-container">
        <div className="ai-alert-banner success">
          <div className="ai-alert-icon success"><TrendingUp size={20} /></div>
          <div className="ai-alert-content">
            <span className="ai-alert-title" style={{ color: "#4ade80" }}>Sales Growth Trend Detected</span>
            <span className="ai-alert-desc">
              Red Rose sales surge forecasted for August 2026 due to upcoming wedding and festival season. ML predicts a 25% increase in purchase volumes. Recommend expanding propagation cycles and booking transportation early.
            </span>
          </div>
        </div>

        <div className="ai-alert-banner info">
          <div className="ai-alert-icon info"><Sun size={20} /></div>
          <div className="ai-alert-content">
            <span className="ai-alert-title" style={{ color: "#38bdf8" }}>Favorable Climate Forecast</span>
            <span className="ai-alert-desc">
              Optimal temperature and humidity forecasted for Bengaluru from June 24 - June 29, 2026. Crop health outlook is excellent. Automated ML rule: Adjusted irrigation schedules for maximum growth rate in Greenhouse A.
            </span>
          </div>
        </div>
      </div>

      <article className="ml-chart-card">
        <h3 className="ml-chart-title">Seasonal Demand Prediction</h3>
        <div style={{ height: "240px", position: "relative" }}>
          {seasonalForecasts.length > 0 ? (
            <Line 
              data={lineData} 
              options={{
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    labels: { color: "#cbd5e1", font: { family: "Inter" } }
                  }
                },
                scales: {
                  x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
                  y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } }
                }
              }} 
            />
          ) : (
            <div className="empty-state">No forecasts available.</div>
          )}
        </div>
      </article>

      <article className="ml-ledger-card">
        <div className="panel-heading" style={{ marginBottom: "8px" }}>
          <div>
            <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8fa99a", fontWeight: "700" }}>Recommendation Engine</span>
            <h3 style={{ margin: "4px 0 0 0", fontSize: "18px", fontWeight: "700", color: "#f8fafc" }}>Monthly Forecast Planning</h3>
          </div>
        </div>
        <div className="custom-table-container">
          {seasonalForecasts.length > 0 ? (
            <table className="premium-ml-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Plant Name</th>
                  <th>Seasonal Event</th>
                  <th>Predicted Demand</th>
                  <th>Confidence</th>
                  <th>Recommended Action</th>
                  <th>Plan Decision</th>
                </tr>
              </thead>
              <tbody>
                {seasonalForecasts.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 700, color: "#f1f5f9" }}>{f.month}</td>
                    <td style={{ fontWeight: 600, color: "#cbd5e1" }}>{f.plantName}</td>
                    <td>
                      <span className="premium-event-badge">{f.event}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: "#f1f5f9" }}>{f.predictedDemand} units</td>
                    <td style={{ fontWeight: 600, color: "#34d399" }}>
                      {f.confidence}%
                      <div className="confidence-bar-outer">
                        <div className="confidence-bar-inner" style={{ width: `${f.confidence}%` }} />
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: "#38bdf8" }}>{f.action}</td>
                    <td>
                      <button 
                        type="button" 
                        className="btn-authorize-plan"
                        onClick={() => handleAuthorizePlan(f.plantName, f.month)}
                      >
                        Authorize
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: "40px", textAlign: "center", color: "#8fa99a" }}>
              No planning forecasts populated.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

function SuppliesPanel({ supplies = [], onUpdateSupply, onRefresh }) {
  const [restockingId, setRestockingId] = useState(null);
  const [addedQty, setAddedQty] = useState("");

  async function handleRestockSubmit(evt, id, currentQty) {
    evt.preventDefault();
    if (!addedQty || isNaN(addedQty)) return;
    const newQty = Number(currentQty) + Number(addedQty);
    await onUpdateSupply(id, { quantity: newQty });
    setRestockingId(null);
    setAddedQty("");
    if (onRefresh) onRefresh();
  }

  const totalStock = supplies.reduce((sum, s) => sum + Number(s.quantity), 0);
  const lowStockCount = supplies.filter(s => Number(s.quantity) < Number(s.reorderLevel)).length;
  const categoriesCount = new Set(supplies.map(s => s.category)).size;
  const netAssetValue = supplies.reduce((sum, s) => sum + Number(s.quantity) * Number(s.cost), 0);

  return (
    <section className="dashboard-grid">
      <style>{`
        .supply-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--line);
        }
        .supplies-table-wrapper {
          overflow-x: auto;
          margin-top: 16px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.01);
        }
        .supplies-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 13px;
        }
        .supplies-table th {
          padding: 14px 18px;
          font-weight: 600;
          color: var(--muted);
          border-bottom: 1px solid var(--line);
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.05em;
        }
        .supplies-table td {
          padding: 14px 18px;
          border-bottom: 1px solid var(--line);
          color: var(--text);
          vertical-align: middle;
        }
        .supplies-table tr:last-child td {
          border-bottom: none;
        }
        .supplies-table tr:hover td {
          background: rgba(255, 255, 255, 0.01);
        }
        .badge-sufficient {
          background: rgba(16, 185, 129, 0.12);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }
        .badge-low-stock {
          background: rgba(239, 68, 68, 0.12);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
        .restock-form-inline {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .restock-input {
          width: 70px;
          padding: 6px 8px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--line);
          border-radius: 6px;
          color: var(--text);
          font-size: 12px;
          outline: none;
          transition: border-color 0.2s;
        }
        .restock-input:focus {
          border-color: var(--accent);
        }
      `}</style>

      {/* Supplies Metrics */}
      <div className="metric-grid" style={{ gridColumn: "1 / -1" }}>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="supply-icon" style={{ color: "#7f9a67" }}>
            <Layers size={20} />
          </div>
          <div className="supply-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Total Item Stock</span>
            <strong>{totalStock.toLocaleString()}</strong>
          </div>
        </div>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="supply-icon" style={{ color: lowStockCount > 0 ? "#ef4444" : "#3c8f61" }}>
            <AlertTriangle size={20} />
          </div>
          <div className="supply-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Low Stock Items</span>
            <strong>{lowStockCount}</strong>
          </div>
        </div>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="supply-icon" style={{ color: "#3b82f6" }}>
            <Layers size={20} />
          </div>
          <div className="supply-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Supply Categories</span>
            <strong>{categoriesCount}</strong>
          </div>
        </div>
        <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="supply-icon" style={{ color: "#3c8f61" }}>
            <DollarSign size={20} />
          </div>
          <div className="supply-info" style={{ display: "flex", flexDirection: "column" }}>
            <span>Net Asset Value</span>
            <strong>₹{netAssetValue.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </div>

      {/* Supplies Table */}
      <article className="panel large-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Materials & Equipment</p>
            <h2>Supplies Stock Levels</h2>
          </div>
        </div>
        <div className="supplies-table-wrapper">
          {supplies.length > 0 ? (
            <table className="supplies-table">
              <thead>
                <tr>
                  <th>SUPPLY NAME</th>
                  <th>CATEGORY</th>
                  <th>QUANTITY IN STOCK</th>
                  <th>REORDER LEVEL</th>
                  <th>UNIT COST</th>
                  <th>ASSET VALUE</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {supplies.map(s => {
                  const isLow = Number(s.quantity) < Number(s.reorderLevel);
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.category}</td>
                      <td><strong>{s.quantity} {s.unit}</strong></td>
                      <td>{s.reorderLevel} {s.unit}</td>
                      <td>₹{Number(s.cost).toLocaleString("en-IN")}</td>
                      <td>₹{(s.quantity * s.cost).toLocaleString("en-IN")}</td>
                      <td>
                        <span className={`badge-severity ${isLow ? 'badge-low-stock' : 'badge-sufficient'}`}>
                          {isLow ? "Low Stock" : "Sufficient"}
                        </span>
                      </td>
                      <td>
                        {restockingId === s.id ? (
                          <form className="restock-form-inline" onSubmit={(e) => handleRestockSubmit(e, s.id, s.quantity)}>
                            <input 
                              type="number" 
                              required 
                              placeholder="Qty"
                              className="restock-input"
                              value={addedQty}
                              onChange={e => setAddedQty(e.target.value)}
                            />
                            <button type="submit" className="btn-mini btn-mini-primary">Save</button>
                            <button type="button" className="btn-mini btn-mini-secondary" onClick={() => setRestockingId(null)}>Cancel</button>
                          </form>
                        ) : (
                          <button 
                            type="button" 
                            className="btn-mini btn-mini-secondary" 
                            onClick={() => setRestockingId(s.id)}
                          >
                            + Restock
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: "var(--muted)", textAlign: "center", padding: "30px 0", fontSize: 13 }}>
              No supplies registered in database.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

function AlertsPanel({ alerts = [], onUpdateAlert, onRefresh }) {
  const [filter, setFilter] = useState("All");

  const getFilteredAlerts = () => {
    if (filter === "All") return alerts;
    if (filter === "Unresolved") return alerts.filter(a => !a.resolvedAt);
    if (filter === "Resolved") return alerts.filter(a => a.resolvedAt);
    return alerts.filter(a => a.severity.toLowerCase() === filter.toLowerCase());
  };

  const filteredAlerts = getFilteredAlerts();

  async function handleAcknowledge(id) {
    await onUpdateAlert(id, "acknowledge");
    if (onRefresh) onRefresh();
  }

  async function handleResolve(id) {
    await onUpdateAlert(id, "resolve");
    if (onRefresh) onRefresh();
  }

  return (
    <section className="dashboard-grid">
      <style>{`
        .alert-filter-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 16px;
          width: 100%;
        }
        .tab-btn {
          padding: 8px 16px;
          font-size: 13.5px;
          font-weight: 600;
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #8fa99a;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .tab-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.02);
        }
        .tab-btn.active {
          color: #ffffff;
          background: #2da05f;
          border-color: transparent;
          box-shadow: 0 2px 8px rgba(45, 160, 95, 0.2);
        }
        .alerts-feed-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
        }
        .alert-feed-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px;
          border-radius: 12px;
          border: 1px solid rgba(45, 160, 95, 0.15);
          background: rgba(18, 38, 28, 0.2);
          transition: all 0.25s ease;
        }
        .alert-feed-item:hover {
          border-color: rgba(45, 160, 95, 0.35);
          background: rgba(45, 160, 95, 0.04);
          transform: translateX(4px);
        }
        .alert-feed-item.resolved {
          opacity: 0.55;
        }
        .severity-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 8px;
        }
        .indicator-high { background: #f87171; box-shadow: 0 0 10px #f87171; }
        .indicator-medium { background: #fbbf24; box-shadow: 0 0 10px #fbbf24; }
        .indicator-low { background: #7dd3fc; box-shadow: 0 0 10px #7dd3fc; }
        .eyebrow {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #8fa99a;
          font-weight: 700;
          margin-bottom: 4px;
        }
        h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: #f8fafc;
        }
        .alert-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
          outline: none;
          min-height: 36px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .alert-action-btn.btn-primary {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }
        .alert-action-btn.btn-primary:hover {
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
          transform: translateY(-1px);
        }
        .alert-action-btn.btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
        }
        .alert-action-btn.btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.25);
          color: #ffffff;
          transform: translateY(-1px);
        }
      `}</style>

      <div className="alert-filter-bar" style={{ gridColumn: "1 / -1" }}>
        {["All", "Unresolved", "Resolved", "High", "Medium", "Low"].map(f => (
          <button 
            key={f}
            type="button" 
            className={`tab-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <article className="panel large-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-heading" style={{ marginBottom: "20px" }}>
          <div>
            <p className="eyebrow">Incident Feed</p>
            <h2>Farm Alerts Feed</h2>
          </div>
        </div>
        <div className="alerts-feed-list">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map(alert => {
              const isResolved = !!alert.resolvedAt;
              const isAcked = !!alert.acknowledgedAt;
              const indicatorClass = `severity-indicator indicator-${alert.severity}`;

              return (
                <div key={alert.id} className={`alert-feed-item ${isResolved ? 'resolved' : ''}`}>
                  <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                    <div style={{ marginTop: "6px" }}>
                      <span className={indicatorClass} />
                    </div>
                    <div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <h4 style={{ margin: 0, fontSize: "15px" }}>{alert.title}</h4>
                        <span className={`badge ${alert.severity === 'high' ? 'badge-overdue' : alert.severity === 'medium' ? 'badge-unpaid' : 'badge-paid'}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "var(--muted)" }}>{alert.detail}</p>
                      <span style={{ display: "block", fontSize: "11px", color: "var(--muted)", marginTop: "8px" }}>
                        Zone: <strong>{alert.zone}</strong> · Reported {alert.timeLabel}
                        {isAcked && !isResolved && <span style={{ marginLeft: "10px", color: "#fbbf24" }}>✓ Acknowledged</span>}
                        {isResolved && <span style={{ marginLeft: "10px", color: "#4ade80" }}>✓ Resolved</span>}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {!isAcked && !isResolved && (
                      <button 
                        type="button" 
                        className="alert-action-btn btn-secondary"
                        onClick={() => handleAcknowledge(alert.id)}
                      >
                        Acknowledge
                      </button>
                    )}
                    {!isResolved && (
                      <button 
                        type="button" 
                        className="alert-action-btn btn-primary"
                        onClick={() => handleResolve(alert.id)}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">No alerts in this category feed.</div>
          )}
        </div>
      </article>
    </section>
  );
}

function AdminDashboard({
  data,
  currentUser,
  activeSection,
  onSendMessage,
  onAskCopilot,
  isSendingMessage,
  isAskingCopilot,
  onUpdateTask,
  onAnalyzeVideo,
  isSavingTask,
  isAnalyzingVideo,
  copilotAnswer,
  copilotQuery,
  onCopilotQueryChange,
  onCreateCrop,
  onUpdateCrop,
  onDeleteCrop,
  onCreateLeaveRequest,
  onReviewLeaveRequest,
  onCreateEquipment,
  onUpdateEquipment,
  onDeleteEquipment,
  onAddMaintenance,
  onRefresh,
  onUpdateAlert,
  onAddExpense,
  onUpdateOrder,
  onUpdateSupply,
}) {
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedOverviewGroup, setSelectedOverviewGroup] = useState("");
  const [inventoryTab, setInventoryTab] = useState("crops");
  const [financeTab, setFinanceTab] = useState("overview");
  const supervisors = data.supervisors || [];
  const [localWorkers, setLocalWorkers] = useState(data.workers || []);
  useEffect(() => {
    setLocalWorkers(data.workers || []);
  }, [data.workers]);
  const workers = localWorkers;
  const selectedId = selectedSupervisorId || supervisors[0]?.id;
  const selectedSupervisor = supervisors.find((supervisor) => supervisor.id === selectedId);
  const selectedWorkers = workers.filter((worker) => worker.supervisorId === selectedId);
  const selectedWorker =
    workers.find((worker) => worker.id === selectedWorkerId) || selectedWorkers[0] || workers[0] || null;
  const chatMessages = data.chatMessages || [];
  const copilotPrompts = [
    "How many visitors came today?",
    "Which zone is most active?",
    "What alerts are open right now?",
    "Who is leading task progress?",
  ];
  const overviewGroups = [
    {
      id: "admins",
      label: "Admins",
      count: data.admins?.length || 0,
      description: "Project owners and full-access users.",
      people: (data.admins || []).map((admin) => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        meta: admin.role,
      })),
    },
    {
      id: "supervisors",
      label: "Supervisors",
      count: supervisors.length,
      description: "Team leads managing zones and worker assignments.",
      people: supervisors.map((supervisor) => ({
        id: supervisor.id,
        name: supervisor.name,
        email: supervisor.email,
        meta: `${supervisor.zone} · ${supervisor.workers} workers`,
      })),
    },
    {
      id: "workers",
      label: "Workers",
      count: workers.length,
      description: "Field staff currently tracked in the workspace.",
      people: workers.map((worker) => ({
        id: worker.id,
        name: worker.name,
        email: worker.email,
        meta: `${worker.zone} · ${worker.task}`,
      })),
    },
  ];
  const roleGroups = overviewGroups.filter((group) => group.people);
  const adminRoleDistributionData = {
    labels: roleGroups.map((group) => group.label),
    datasets: [
      {
        data: roleGroups.map((group) => Number(group.count || 0)),
        backgroundColor: ["#1f5a4d", "#6289d9", "#d89246"],
        borderColor: "#fffaf0",
        borderWidth: 2,
      },
    ],
  };
  const zoneWorkerData = {
    labels: (data.zoneStats || []).map((zone) => zone.zone),
    datasets: [
      {
        label: "Workers",
        data: (data.zoneStats || []).map((zone) => zone.workers),
        backgroundColor: ["#447b67", "#c48e34", "#6380c7", "#7f9a67"],
        borderRadius: 8,
      },
    ],
  };
  const supervisorPerformanceData = {
    labels: supervisors.map((supervisor) => supervisor.name),
    datasets: [
      {
        label: "Performance %",
        data: supervisors.map((supervisor) => Number.parseInt(supervisor.performance, 10) || 0),
        backgroundColor: "rgba(98, 137, 217, 0.14)",
        borderColor: "#6289d9",
        pointBackgroundColor: "#1f5a4d",
      },
    ],
  };

  useEffect(() => {
    if (!selectedSupervisorId && supervisors[0]?.id) {
      setSelectedSupervisorId(supervisors[0].id);
    }
  }, [selectedSupervisorId, supervisors]);

  async function handleUpdateTask(payload) {
    const ok = await onUpdateTask?.(payload);
    if (ok) {
      setLocalWorkers((prev) =>
        prev.map((w) =>
          String(w.id) === String(payload.workerId) ? { ...w, attendance: payload.attendance ?? w.attendance } : w
        )
      );
    }
    return ok;
  }

  useEffect(() => {
    function onWorkerAttendance(e) {
      const detail = e?.detail || {};
      const { workerId, attendance } = detail;
      if (!workerId) return;
      setLocalWorkers((prev) => prev.map((w) => (String(w.id) === String(workerId) ? { ...w, attendance } : w)));
    }

    if (typeof window !== "undefined") {
      window.addEventListener("workerAttendanceUpdated", onWorkerAttendance);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("workerAttendanceUpdated", onWorkerAttendance);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkerId && selectedWorkers[0]?.id) {
      setSelectedWorkerId(selectedWorkers[0].id);
    }
  }, [selectedWorkerId, selectedWorkers]);

  if (activeSection === "messages") {
    return (
      <MessagesPanel
        chatMessages={data.chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        allowedTags={["Update", "Task update", "Copilot query"]}
        currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      />
    );
  }

  if (activeSection === "messages") {
    return (
      <MessagesPanel
        chatMessages={data.chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      />
    );
  }

  if (activeSection === "messages") {
    return (
      <MessagesPanel
        chatMessages={data.chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      />
    );
  }

  if (activeSection === "people") {
    return (
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Admin access</p>
              <h2>Project admins</h2>
            </div>
          </div>
          <div className="detail-list">
            {(data.admins || []).map((admin) => (
              <span key={admin.id}>{admin.name} - {admin.email}</span>
            ))}
          </div>
        </article>

        <article className="panel large-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Admin view</p>
              <h2>Supervisor overview</h2>
            </div>
          </div>
          <div className="supervisor-list">
            {supervisors.map((supervisor) => (
              <button
                className={
                  supervisor.id === selectedSupervisorId
                    ? "supervisor-card active"
                    : "supervisor-card"
                }
                key={supervisor.id}
                onClick={() => setSelectedSupervisorId(supervisor.id)}
                type="button"
              >
                <span>
                  <strong>{supervisor.name}</strong>
                  <em>{supervisor.email}</em>
                </span>
                <span>{supervisor.zone}</span>
                <span>{supervisor.workers} workers</span>
                <span>{supervisor.performance}</span>
              </button>
            ))}
          </div>
        </article>
      </section>
    );
  }

  if (activeSection === "tasks") {
    return (
      <div className="task-section-stack">
        <TaskManagerPanel
          rows={workers}
          selectedWorkerId={selectedWorker?.id}
          onSelectWorker={setSelectedWorkerId}
        />
        <TaskEditor
          worker={selectedWorker}
          allWorkers={workers}
          selectedWorkerId={selectedWorker?.id}
          onSelectWorker={setSelectedWorkerId}
          canEditAllFields
          onSubmit={onUpdateTask}
          isSubmitting={isSavingTask}
        />
      </div>
    );
  }

  if (activeSection === "workforce") {
    return (
      <WorkforcePanel
        workers={workers}
        attendanceSummary={data.attendanceSummary}
        wageSummary={data.wageSummary}
        currentUser={currentUser}
        onUpdateTask={onUpdateTask}
        isSavingTask={isSavingTask}
        allWorkers={workers}
        leaveRequests={data.leaveRequests || []}
        onCreateLeaveRequest={onCreateLeaveRequest}
        onReviewLeaveRequest={onReviewLeaveRequest}
      />
    );
  }

  if (activeSection === "inventory") {
    const zones = (data.zoneStats || []).map((z) => z.zone);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
          <button
            className={inventoryTab === "crops" ? "primary-link" : "secondary-link"}
            onClick={() => setInventoryTab("crops")}
            style={{ borderRadius: "8px", padding: "8px 18px", minHeight: "36px", fontSize: "13px", fontWeight: 700 }}
            type="button"
          >
            Plant Stock
          </button>
          <button
            className={inventoryTab === "supplies" ? "primary-link" : "secondary-link"}
            onClick={() => setInventoryTab("supplies")}
            style={{ borderRadius: "8px", padding: "8px 18px", minHeight: "36px", fontSize: "13px", fontWeight: 700 }}
            type="button"
          >
            Supplies
          </button>
          <button
            className={inventoryTab === "equipment" ? "primary-link" : "secondary-link"}
            onClick={() => setInventoryTab("equipment")}
            style={{ borderRadius: "8px", padding: "8px 18px", minHeight: "36px", fontSize: "13px", fontWeight: 700 }}
            type="button"
          >
            Equipment
          </button>
        </div>
        {inventoryTab === "crops" && (
          <CropInventoryPanel
            crops={data.crops || []}
            zones={zones}
            onCreate={onCreateCrop}
            onUpdate={onUpdateCrop}
            onDelete={onDeleteCrop}
            canEdit={true}
            onRefresh={onRefresh}
          />
        )}
        {inventoryTab === "supplies" && (
          <SuppliesPanel
            supplies={data.supplies || []}
            onUpdateSupply={onUpdateSupply}
            onRefresh={onRefresh}
          />
        )}
        {inventoryTab === "equipment" && (
          <EquipmentPanel
            equipment={data.equipment || []}
            maintenanceLogs={data.maintenanceLogs || []}
            zones={zones}
            canEdit={true}
            onCreate={onCreateEquipment}
            onUpdate={onUpdateEquipment}
            onDelete={onDeleteEquipment}
            onAddMaintenance={onAddMaintenance}
          />
        )}
      </div>
    );
  }

  if (activeSection === "sales") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
          <button
            className={financeTab === "overview" ? "primary-link" : "secondary-link"}
            onClick={() => setFinanceTab("overview")}
            style={{ borderRadius: "8px", padding: "8px 18px", minHeight: "36px", fontSize: "13px", fontWeight: 700 }}
            type="button"
          >
            Revenue & Sales
          </button>
          <button
            className={financeTab === "expenses" ? "primary-link" : "secondary-link"}
            onClick={() => setFinanceTab("expenses")}
            style={{ borderRadius: "8px", padding: "8px 18px", minHeight: "36px", fontSize: "13px", fontWeight: 700 }}
            type="button"
          >
            Expenses Tracker
          </button>
        </div>
        {financeTab === "overview" && (
          <SalesFinancePanel
            sales={data.sales || []}
            invoices={data.invoices || []}
            expenses={data.expenses || []}
            onRefresh={onRefresh}
          />
        )}
        {financeTab === "expenses" && (
          <ExpensesPanel
            expenses={data.expenses || []}
            onAddExpense={onAddExpense}
            onRefresh={onRefresh}
          />
        )}
      </div>
    );
  }

  if (activeSection === "orders") {
    return (
      <OrdersPanel
        orders={data.orders || []}
        onUpdateOrder={onUpdateOrder}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "analytics") {
    return (
      <MlAnalyticsPanel
        seasonalForecasts={data.seasonalForecasts || []}
      />
    );
  }

  if (activeSection === "alerts") {
    return (
      <AlertsPanel
        alerts={data.alerts || []}
        onUpdateAlert={onUpdateAlert}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "leave") {
    return (
      <LeaveRequestsPanel
        requests={data.leaveRequests || []}
        workers={workers}
        role="Admin"
        onCreate={onCreateLeaveRequest}
        onReview={onReviewLeaveRequest}
        currentUser={currentUser}
      />
    );
  }

  if (activeSection === "tracking") {
    return (
      <>
        <section className="dashboard-grid">
          <article className="panel large-panel" style={{ gridColumn: "1 / -1" }}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Bengaluru farm operations</p>
                <h2>Select farms and places on the map</h2>
              </div>
              <span className="live-pill">Maps</span>
            </div>
            <div style={{ height: "550px", marginTop: "16px" }}>
              <LiveFarmMapContainer supervisors={supervisors} workers={workers} />
            </div>
          </article>
        </section>
        <TrackingPanel
          analyses={data.videoAnalyses || []}
          isAnalyzingVideo={isAnalyzingVideo}
          defaultZone={selectedSupervisor?.zone?.split(" and ")[0] || "Visitor Gate"}
          onRefresh={onRefresh}
        />
      </>
    );
  }

  if (activeSection === "report") {
    return <DailyReportPanel report={data.dailyReport} data={data} currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []} />;
  }

  if (activeSection === "overview") {
    const sales = data.sales || [];
    const expenses = data.expenses || [];
    const orders = data.orders || [];
    const supplies = data.supplies || [];
    const alerts = data.alerts || [];
    const crops = data.crops || [];

    // Financial calculations
    const totalSalesAmount = sales.reduce((acc, sale) => acc + Number(sale.totalAmount || 0), 0);
    const totalExpensesAmount = expenses.reduce((acc, exp) => acc + Number(exp.amount || 0), 0);
    const netProfitAmount = totalSalesAmount - totalExpensesAmount;
    const marginPercent = totalSalesAmount > 0 ? ((netProfitAmount / totalSalesAmount) * 100).toFixed(1) : "0.0";

    // Orders pipeline calculations
    const activeOrders = orders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled");
    const pendingOrders = activeOrders.filter(o => o.status === "Pending");
    const processingOrders = activeOrders.filter(o => o.status === "Processing" || o.status === "Confirmed");

    // Supplies and Alerts counts
    const lowStockSupplies = supplies.filter(s => Number(s.quantity) < Number(s.reorderLevel));
    const activeAlerts = alerts.filter(a => !a.resolvedAt);
    const highSeverityAlertsCount = activeAlerts.filter(a => a.severity?.toLowerCase() === "high").length;

    // Crops
    const totalCropsCount = crops.reduce((acc, crop) => acc + Number(crop.quantity || 0), 0);

    // Sales vs Expenses Trend by Month
    const monthlyFinanceData = (() => {
      const map = {};
      const orderOfMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      const currentMonthIndex = new Date().getMonth();
      const lastFourMonths = [];
      for (let i = 3; i >= 0; i--) {
        const idx = (currentMonthIndex - i + 12) % 12;
        lastFourMonths.push(orderOfMonths[idx]);
      }
      
      lastFourMonths.forEach(m => {
        map[m] = { sales: 0, expenses: 0 };
      });

      sales.forEach(sale => {
        const dateVal = sale.saleDate || sale.sale_date;
        if (!dateVal) return;
        const m = new Date(dateVal).toLocaleString("en-US", { month: "short" });
        if (map[m]) {
          map[m].sales += Number(sale.totalAmount || 0);
        }
      });

      expenses.forEach(exp => {
        const dateVal = exp.expenseDate || exp.expense_date;
        if (!dateVal) return;
        const m = new Date(dateVal).toLocaleString("en-US", { month: "short" });
        if (map[m]) {
          map[m].expenses += Number(exp.amount || 0);
        }
      });

      return {
        labels: lastFourMonths,
        datasets: [
          {
            label: "Revenue",
            data: lastFourMonths.map(m => map[m].sales),
            backgroundColor: "#3c8f61",
            borderRadius: 6,
          },
          {
            label: "Expenses",
            data: lastFourMonths.map(m => map[m].expenses),
            backgroundColor: "#d89246",
            borderRadius: 6,
          }
        ]
      };
    })();

    // Order status breakdown for Doughnut
    const orderStatusData = (() => {
      const statuses = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered"];
      const counts = statuses.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
      orders.forEach(o => {
        if (counts[o.status] !== undefined) {
          counts[o.status]++;
        }
      });
      return {
        labels: statuses,
        datasets: [
          {
            data: statuses.map(s => counts[s]),
            backgroundColor: ["#d89246", "#3b82f6", "#10b981", "#8b5cf6", "#447b67"],
            borderColor: "rgba(255, 255, 255, 0.08)",
            borderWidth: 2,
          }
        ]
      };
    })();

    // Upcoming Deliveries
    const upcomingOrdersList = [...orders]
      .filter(o => o.status !== "Delivered" && o.status !== "Cancelled" && o.deliveryDate)
      .sort((a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate))
      .slice(0, 4);

    // Critical Alerts List
    const unresolvedAlertsList = alerts.filter(a => !a.resolvedAt).slice(0, 4);

    // Low Stock List
    const lowStockSuppliesList = lowStockSupplies.slice(0, 4);

    return (
      <section className="dashboard-grid">
        <style>{`
          .overview-metric-icon {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--line);
          }
          .overview-charts-grid {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr 1fr;
            gap: 16px;
            margin-bottom: 24px;
            width: 100%;
            grid-column: 1 / -1;
          }
          @media (max-width: 1200px) {
            .overview-charts-grid {
              grid-template-columns: 1fr;
            }
          }
          .overview-feeds-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            width: 100%;
            grid-column: 1 / -1;
            margin-bottom: 24px;
          }
          @media (max-width: 1024px) {
            .overview-feeds-grid {
              grid-template-columns: 1fr;
            }
          }
          .overview-feed-panel {
            background: rgba(255,255,255,0.015);
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          }
          .overview-feed-panel h3 {
            font-size: 15px;
            margin: 0;
            font-weight: 600;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 10px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--line);
          }
          .feed-items-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .feed-item {
            padding: 12px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--line);
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 13px;
          }
          .feed-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
          }
          .feed-item-title {
            font-weight: 600;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .feed-item-detail {
            color: var(--muted);
            font-size: 12px;
            line-height: 1.4;
          }
          .feed-item-actions {
            display: flex;
            gap: 8px;
            margin-top: 4px;
          }
          .btn-mini {
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
          }
          .btn-mini-primary {
            background: var(--accent);
            color: #fff;
            border: none;
          }
          .btn-mini-primary:hover {
            opacity: 0.9;
          }
          .btn-mini-secondary {
            background: transparent;
            border: 1px solid var(--line);
            color: var(--text);
          }
          .btn-mini-secondary:hover {
            background: rgba(255, 255, 255, 0.05);
          }
          .badge-severity {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .badge-high {
            background: rgba(239, 68, 68, 0.12);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.2);
          }
          .badge-medium {
            background: rgba(245, 158, 11, 0.12);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.2);
          }
          .badge-low {
            background: rgba(59, 130, 246, 0.12);
            color: #60a5fa;
            border: 1px solid rgba(59, 130, 246, 0.2);
          }
        `}</style>
        <WeatherWidget />

        {/* 1. Metrics Grid */}
        {/* 1. Metrics Grid */}
        <div className="metric-grid" style={{ gridColumn: "1 / -1" }}>
          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#3c8f61" }}>
              <DollarSign size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Net Profit</span>
              <strong>₹{netProfitAmount.toLocaleString("en-IN")}</strong>
              <p>{marginPercent}% Margin ({totalSalesAmount > 0 ? "Healthy" : "No Revenue"})</p>
            </div>
          </div>

          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#3b82f6" }}>
              <ShoppingBag size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Active Orders</span>
              <strong>{activeOrders.length}</strong>
              <p>{pendingOrders.length} pending · {processingOrders.length} in progress</p>
            </div>
          </div>

          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#d89246" }}>
              <AlertTriangle size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Critical Issues</span>
              <strong>{activeAlerts.length}</strong>
              <p>{highSeverityAlertsCount} high severity unresolved</p>
            </div>
          </div>

          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#7f9a67" }}>
              <Sprout size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Plant Stock</span>
              <strong>{totalCropsCount.toLocaleString()}</strong>
              <p>{crops.length} batches tracked</p>
            </div>
          </div>
        </div>

        {/* 2. Charts Section */}
        <div className="overview-charts-grid">
          <ChartPanel eyebrow="Financial Trends" title="Revenue vs Expenses">
            <Bar data={monthlyFinanceData} options={chartOptions} />
          </ChartPanel>

          <ChartPanel eyebrow="Fulfillment pipeline" title="Orders by status">
            <Doughnut
              data={orderStatusData}
              options={{ maintainAspectRatio: false, plugins: chartOptions.plugins }}
            />
          </ChartPanel>

          <ChartPanel eyebrow="Zone staffing" title="Workers by zone">
            <Bar data={zoneWorkerData} options={chartOptions} />
          </ChartPanel>
        </div>

        {/* 3. Operational Feeds Section */}
        <div className="overview-feeds-grid">
          {/* Unresolved Alerts */}
          <div className="overview-feed-panel">
            <h3>
              <AlertTriangle size={16} style={{ color: "#ef4444" }} />
              Active Alerts
            </h3>
            <div className="feed-items-list">
              {unresolvedAlertsList.length > 0 ? (
                unresolvedAlertsList.map(a => (
                  <div key={a.id} className="feed-item">
                    <div className="feed-item-header">
                      <span className={`badge-severity badge-${a.severity?.toLowerCase() || "low"}`}>
                        {a.severity}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{a.zone}</span>
                    </div>
                    <div className="feed-item-title">{a.title}</div>
                    <div className="feed-item-detail">{a.detail}</div>
                    <div className="feed-item-actions">
                      {!a.acknowledgedAt && (
                        <button
                          className="btn-mini btn-mini-secondary"
                          onClick={() => { onUpdateAlert(a.id, "acknowledge").then(onRefresh); }}
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        className="btn-mini btn-mini-primary"
                        onClick={() => { onUpdateAlert(a.id, "resolve").then(onRefresh); }}
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
                  No active alerts.
                </div>
              )}
            </div>
          </div>

          {/* Low Stock Supplies */}
          <div className="overview-feed-panel">
            <h3>
              <Sprout size={16} style={{ color: "#d89246" }} />
              Low Stock Supplies
            </h3>
            <div className="feed-items-list">
              {lowStockSuppliesList.length > 0 ? (
                lowStockSuppliesList.map(s => (
                  <div key={s.id} className="feed-item">
                    <div className="feed-item-header">
                      <strong className="feed-item-title">{s.name}</strong>
                      <span className="badge-severity badge-high">Low Stock</span>
                    </div>
                    <div className="feed-item-detail">
                      Level: {s.quantity} {s.unit} (Reorder: {s.reorderLevel} {s.unit})
                    </div>
                    <div className="feed-item-actions">
                      <button
                        className="btn-mini btn-mini-primary"
                        onClick={() => { onUpdateSupply(s.id, { quantity: Number(s.quantity) + 50 }).then(onRefresh); }}
                      >
                        + Restock 50 Units
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
                  All supplies fully stocked.
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Deliveries */}
          <div className="overview-feed-panel">
            <h3>
              <Truck size={16} style={{ color: "#3b82f6" }} />
              Upcoming Deliveries
            </h3>
            <div className="feed-items-list">
              {upcomingOrdersList.length > 0 ? (
                upcomingOrdersList.map(o => {
                  const deliveryDateFormatted = o.deliveryDate
                    ? new Date(o.deliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                    : "TBD";
                  return (
                    <div key={o.id} className="feed-item">
                      <div className="feed-item-header">
                        <strong className="feed-item-title" style={{ maxWidth: "150px" }}>{o.customerName}</strong>
                        <span style={{ fontSize: 11, fontWeight: "bold", color: "#3b82f6" }}>
                          {deliveryDateFormatted}
                        </span>
                      </div>
                      <div className="feed-item-detail" style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{o.companyName || "Individual"}</span>
                        <strong style={{ color: "var(--text)" }}>₹{Number(o.totalAmount || 0).toLocaleString("en-IN")}</strong>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span className="badge-severity badge-medium" style={{ fontSize: 9 }}>
                          {o.status}
                        </span>
                        <span className={`badge-severity ${o.paymentStatus === "paid" ? "badge-low" : "badge-high"}`} style={{ fontSize: 9 }}>
                          {o.paymentStatus}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
                  No pending deliveries scheduled.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. People Mix Panel */}
        <div style={{ gridColumn: "1 / -1" }}>
          <OverviewPeoplePanel
            groups={overviewGroups}
            selectedGroupId={selectedOverviewGroup}
            onSelectGroup={setSelectedOverviewGroup}
          />
        </div>
      </section>
    );
  }

  if (activeSection === "copilot") {
    return (
      <CopilotPanel
        role="Admin"
        prompts={copilotPrompts}
        answer={copilotAnswer}
        chatRows={chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        currentUserId={currentUser?.id}
        query={copilotQuery}
        onQueryChange={onCopilotQueryChange}
        onAsk={onAskCopilot}
        isAsking={isAskingCopilot}
        systemCapabilities={data.systemCapabilities}
      />
    );
  }

  if (activeSection === "messages") {
    return (
      <MessagesPanel
        chatMessages={chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        allowedTags={["Update", "Task update", "AgriSage query"]}
        currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      />
    );
  }

  if (activeSection === "messages") {
    return (
      <MessagesPanel
        chatMessages={chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        allowedTags={["Update", "Task update", "AgriSage query"]}
        currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      />
    );
  }

  if (activeSection === "messages") {
    return (
      <MessagesPanel
        chatMessages={chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        allowedTags={["Update", "Task update", "AgriSage query"]}
        currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      />
    );
  }

  return (
    <MessagesPanel
      chatMessages={chatMessages || []}
      onSend={onSendMessage}
      isSending={isSendingMessage}
      allowedTags={["Update", "Task update", "AgriSage query"]}
      currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      title="Operations feed"
    />
  );
}

function SupervisorDashboard({
  data,
  currentUser,
  activeSection,
  onSendMessage,
  onAskCopilot,
  isSendingMessage,
  isAskingCopilot,
  onUpdateTask,
  onAnalyzeVideo,
  isSavingTask,
  isAnalyzingVideo,
  copilotAnswer,
  copilotQuery,
  onCopilotQueryChange,
  onCreateCrop,
  onUpdateCrop,
  onDeleteCrop,
  onCreateLeaveRequest,
  onReviewLeaveRequest,
  onCreateEquipment,
  onUpdateEquipment,
  onDeleteEquipment,
  onAddMaintenance,
  onRefresh,
  onUpdateAlert,
  onAddExpense,
  onUpdateOrder,
  onUpdateSupply,
}) {
  const supervisor = data.supervisors?.[0];
  const teamWorkers = data.workers || [];
  const activityLogs = data.activityLogs || [];
  const chatMessages = data.chatMessages || [];
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const supervisorName = supervisor?.name || currentUser?.name || "Supervisor";
  const supervisorZone = supervisor?.zone || "Assigned farm zones";
  const copilotPrompts = [
    "How many visitors came today?",
    "Which zone is most active?",
    "Who is absent today?",
    "What alerts are open in my zones?",
  ];
  const selectedWorker =
    teamWorkers.find((worker) => worker.id === selectedWorkerId) || teamWorkers[0] || null;
  const teamProgressRows = teamWorkers.map((worker) => ({
    label: worker.name,
    value: worker.progressValue || Number.parseInt(worker.progress, 10) || 0,
    suffix: "%",
  }));
  const metrics = [
    { label: "Assigned workers", value: String(teamWorkers.length), detail: supervisorZone },
    {
      label: "Logs today",
      value: String(teamWorkers.reduce((total, worker) => total + worker.logsToday, 0)),
      detail: "Submitted by your team",
    },
    {
      label: "Tasks in progress",
      value: String(teamWorkers.filter((worker) => worker.status !== "Done").length),
      detail: "Across assigned zones",
    },
    { label: "Supervisor score", value: supervisor?.performance || "New", detail: "Current cycle" },
  ];
  const teamStatusData = {
    labels: teamWorkers.map((worker) => worker.name),
    datasets: [
      {
        label: "Progress %",
        data: teamWorkers.map((worker) => worker.progressValue || 0),
        backgroundColor: "#3c8f61",
        borderRadius: 8,
      },
    ],
  };
  const teamLoadTrendData = {
    labels: teamWorkers.map((worker) => worker.name),
    datasets: [
      {
        label: "Logs today",
        data: teamWorkers.map((worker) => worker.logsToday || 0),
        borderColor: "#5f86d6",
        backgroundColor: "rgba(95, 134, 214, 0.14)",
        fill: true,
        tension: 0.35,
      },
      {
        label: "Progress / 10",
        data: teamWorkers.map((worker) => Math.round((worker.progressValue || 0) / 10)),
        borderColor: "#c59a33",
        backgroundColor: "rgba(197, 154, 51, 0.12)",
        fill: true,
        tension: 0.35,
      },
    ],
  };
  // throughput and readiness charts removed per request

  useEffect(() => {
    if (!selectedWorkerId && teamWorkers[0]?.id) {
      setSelectedWorkerId(teamWorkers[0].id);
    }
  }, [selectedWorkerId, teamWorkers]);

  if (activeSection === "overview") {
    const crops = data.crops || [];
    const supplies = data.supplies || [];
    const alerts = data.alerts || [];
    const orders = data.orders || [];

    // Filter crops, alerts, workers for current supervisor zone
    const zoneCrops = crops.filter(c => c.zone === supervisorZone);
    const zoneCropsCount = zoneCrops.reduce((acc, c) => acc + Number(c.quantity || 0), 0);
    const zoneAlerts = alerts.filter(a => !a.resolvedAt && a.zone === supervisorZone);
    const highSeverityZoneAlerts = zoneAlerts.filter(a => a.severity?.toLowerCase() === "high").length;
    
    // Low stock supplies
    const lowStockSupplies = supplies.filter(s => Number(s.quantity) < Number(s.reorderLevel));

    // Order status breakdown for Doughnut
    const orderStatusData = (() => {
      const statuses = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered"];
      const counts = statuses.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
      orders.forEach(o => {
        if (counts[o.status] !== undefined) {
          counts[o.status]++;
        }
      });
      return {
        labels: statuses,
        datasets: [
          {
            data: statuses.map(s => counts[s]),
            backgroundColor: ["#d89246", "#3b82f6", "#10b981", "#8b5cf6", "#447b67"],
            borderColor: "rgba(255, 255, 255, 0.08)",
            borderWidth: 2,
          }
        ]
      };
    })();

    const zoneCropsList = zoneCrops.slice(0, 4);
    const zoneAlertsList = zoneAlerts.slice(0, 4);
    const lowStockSuppliesList = lowStockSupplies.slice(0, 4);

    return (
      <section className="dashboard-grid">
        <style>{`
          .overview-metric-icon {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--line);
          }
          .overview-charts-grid {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr;
            gap: 16px;
            margin-bottom: 24px;
            width: 100%;
            grid-column: 1 / -1;
          }
          @media (max-width: 1024px) {
            .overview-charts-grid {
              grid-template-columns: 1fr;
            }
          }
          .overview-feeds-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            width: 100%;
            grid-column: 1 / -1;
            margin-bottom: 24px;
          }
          @media (max-width: 1024px) {
            .overview-feeds-grid {
              grid-template-columns: 1fr;
            }
          }
          .overview-feed-panel {
            background: rgba(255,255,255,0.015);
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          }
          .overview-feed-panel h3 {
            font-size: 15px;
            margin: 0;
            font-weight: 600;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 10px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--line);
          }
          .feed-items-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .feed-item {
            padding: 12px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--line);
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 13px;
          }
          .feed-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
          }
          .feed-item-title {
            font-weight: 600;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .feed-item-detail {
            color: var(--muted);
            font-size: 12px;
            line-height: 1.4;
          }
          .feed-item-actions {
            display: flex;
            gap: 8px;
            margin-top: 4px;
          }
          .btn-mini {
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
          }
          .btn-mini-primary {
            background: var(--accent);
            color: #fff;
            border: none;
          }
          .btn-mini-primary:hover {
            opacity: 0.9;
          }
          .btn-mini-secondary {
            background: transparent;
            border: 1px solid var(--line);
            color: var(--text);
          }
          .btn-mini-secondary:hover {
            background: rgba(255, 255, 255, 0.05);
          }
          .badge-severity {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .badge-high {
            background: rgba(239, 68, 68, 0.12);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.2);
          }
          .badge-medium {
            background: rgba(245, 158, 11, 0.12);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.2);
          }
          .badge-low {
            background: rgba(59, 130, 246, 0.12);
            color: #60a5fa;
            border: 1px solid rgba(59, 130, 246, 0.2);
          }
        `}</style>
        <WeatherWidget />

        {/* 1. Metrics Grid */}
        {/* 1. Metrics Grid */}
        <div className="metric-grid" style={{ gridColumn: "1 / -1" }}>
          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#3c8f61" }}>
              <Users size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Assigned Workers</span>
              <strong>{teamWorkers.length}</strong>
              <p>{supervisorZone}</p>
            </div>
          </div>

          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#7f9a67" }}>
              <Sprout size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Zone Crop Stock</span>
              <strong>{zoneCropsCount.toLocaleString()}</strong>
              <p>{zoneCrops.length} active batches</p>
            </div>
          </div>

          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#ef4444" }}>
              <AlertTriangle size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Zone Active Alerts</span>
              <strong>{zoneAlerts.length}</strong>
              <p>{highSeverityZoneAlerts} high severity unresolved</p>
            </div>
          </div>

          <div className="metric-card" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="overview-metric-icon" style={{ color: "#6289d9" }}>
              <Star size={20} />
            </div>
            <div className="overview-metric-info" style={{ display: "flex", flexDirection: "column" }}>
              <span>Supervisor score</span>
              <strong>{supervisor?.performance || "New"}</strong>
              <p>Current cycle</p>
            </div>
          </div>
        </div>

        {/* 2. Charts Section */}
        <div className="overview-charts-grid">
          <ChartPanel eyebrow="Team progress" title="Worker completion">
            <Bar data={teamStatusData} options={chartOptions} />
          </ChartPanel>

          <ChartPanel eyebrow="Fulfillment pipeline" title="Orders by status">
            <Doughnut
              data={orderStatusData}
              options={{ maintainAspectRatio: false, plugins: chartOptions.plugins }}
            />
          </ChartPanel>
        </div>

        {/* 3. Feeds Row */}
        <div className="overview-feeds-grid">
          {/* Zone Alerts */}
          <div className="overview-feed-panel">
            <h3>
              <AlertTriangle size={16} style={{ color: "#ef4444" }} />
              Zone Alerts
            </h3>
            <div className="feed-items-list">
              {zoneAlertsList.length > 0 ? (
                zoneAlertsList.map(a => (
                  <div key={a.id} className="feed-item">
                    <div className="feed-item-header">
                      <span className={`badge-severity badge-${a.severity?.toLowerCase() || "low"}`}>
                        {a.severity}
                      </span>
                    </div>
                    <div className="feed-item-title">{a.title}</div>
                    <div className="feed-item-detail">{a.detail}</div>
                    <div className="feed-item-actions">
                      {!a.acknowledgedAt && (
                        <button
                          className="btn-mini btn-mini-secondary"
                          onClick={() => { onUpdateAlert(a.id, "acknowledge").then(onRefresh); }}
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        className="btn-mini btn-mini-primary"
                        onClick={() => { onUpdateAlert(a.id, "resolve").then(onRefresh); }}
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
                  No active alerts in your zone.
                </div>
              )}
            </div>
          </div>

          {/* Zone Crops */}
          <div className="overview-feed-panel">
            <h3>
              <Sprout size={16} style={{ color: "#7f9a67" }} />
              Zone Crops
            </h3>
            <div className="feed-items-list">
              {zoneCropsList.length > 0 ? (
                zoneCropsList.map(c => (
                  <div key={c.id} className="feed-item">
                    <div className="feed-item-header">
                      <strong className="feed-item-title">{c.name}</strong>
                      <span className="badge-severity badge-medium">{c.growthStage}</span>
                    </div>
                    <div className="feed-item-detail">
                      Variety: {c.variety} | Qty: {c.quantity} | Bed: {c.bed || "—"}
                    </div>
                    <div className="feed-item-detail">
                      Health: <span style={{ color: c.healthStatus?.toLowerCase() === "healthy" ? "#10b981" : "#ef4444" }}>{c.healthStatus}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
                  No crops registered in this zone.
                </div>
              )}
            </div>
          </div>

          {/* Low Stock Supplies */}
          <div className="overview-feed-panel">
            <h3>
              <Layers size={16} style={{ color: "#d89246" }} />
              Low Stock Supplies
            </h3>
            <div className="feed-items-list">
              {lowStockSuppliesList.length > 0 ? (
                lowStockSuppliesList.map(s => (
                  <div key={s.id} className="feed-item">
                    <div className="feed-item-header">
                      <strong className="feed-item-title">{s.name}</strong>
                      <span className="badge-severity badge-high">Low Stock</span>
                    </div>
                    <div className="feed-item-detail">
                      Level: {s.quantity} {s.unit} (Reorder: {s.reorderLevel} {s.unit})
                    </div>
                    <div className="feed-item-actions">
                      <button
                        className="btn-mini btn-mini-primary"
                        onClick={() => { onUpdateSupply(s.id, { quantity: Number(s.quantity) + 50 }).then(onRefresh); }}
                      >
                        + Restock 50 Units
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
                  All supplies fully stocked.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (activeSection === "tasks") {
    return (
      <div className="task-section-stack">
        <TaskManagerPanel
          rows={teamWorkers}
          selectedWorkerId={selectedWorker?.id}
          onSelectWorker={setSelectedWorkerId}
        />
        <TaskEditor
          worker={selectedWorker}
          allWorkers={teamWorkers}
          selectedWorkerId={selectedWorker?.id}
          onSelectWorker={setSelectedWorkerId}
          canEditAllFields
          onSubmit={onUpdateTask}
          isSubmitting={isSavingTask}
        />
      </div>
    );
  }

  if (activeSection === "workforce") {
    const attendanceSummary = {
      present: teamWorkers.filter((worker) => worker.attendance === "Present").length,
      late: teamWorkers.filter((worker) => worker.attendance === "Late").length,
      absent: teamWorkers.filter((worker) => worker.attendance === "Absent").length,
      total: teamWorkers.length,
    };
    const wageSummary = {
      totalDailyWagesLabel: formatCurrency(
        teamWorkers.reduce((total, worker) => total + (worker.dailyWage || 0), 0)
      ),
      totalEarnedTodayLabel: formatCurrency(
        teamWorkers.reduce((total, worker) => total + (worker.earnedToday || 0), 0)
      ),
      recorded: teamWorkers.filter((worker) => worker.salaryStatus === "Recorded").length,
      pendingReview: teamWorkers.filter((worker) => worker.salaryStatus === "Pending review").length,
      notRecorded: teamWorkers.filter((worker) => worker.salaryStatus === "Not recorded").length,
    };
    return (
      <WorkforcePanel
        workers={teamWorkers}
        attendanceSummary={attendanceSummary}
        wageSummary={wageSummary}
        currentUser={currentUser}
        onUpdateTask={onUpdateTask}
        isSavingTask={isSavingTask}
        allWorkers={teamWorkers}
        leaveRequests={data.leaveRequests || []}
        onCreateLeaveRequest={onCreateLeaveRequest}
        onReviewLeaveRequest={onReviewLeaveRequest}
      />
    );
  }

  if (activeSection === "crops") {
    const zones = (data.zoneStats || []).map((z) => z.zone);
    return (
      <CropInventoryPanel
        crops={data.crops || []}
        zones={zones}
        onCreate={onCreateCrop}
        onUpdate={onUpdateCrop}
        onDelete={onDeleteCrop}
        canEdit={true}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "supplies") {
    return (
      <SuppliesPanel
        supplies={data.supplies || []}
        onUpdateSupply={onUpdateSupply}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "sales") {
    return (
      <SalesFinancePanel
        sales={data.sales || []}
        invoices={data.invoices || []}
        expenses={data.expenses || []}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "expenses") {
    return (
      <ExpensesPanel
        expenses={data.expenses || []}
        onAddExpense={onAddExpense}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "orders") {
    return (
      <OrdersPanel
        orders={data.orders || []}
        onUpdateOrder={onUpdateOrder}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "analytics") {
    return (
      <MlAnalyticsPanel
        seasonalForecasts={data.seasonalForecasts || []}
      />
    );
  }

  if (activeSection === "alerts") {
    return (
      <AlertsPanel
        alerts={data.alerts || []}
        onUpdateAlert={onUpdateAlert}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "leave") {
    return (
      <LeaveRequestsPanel
        requests={data.leaveRequests || []}
        workers={teamWorkers}
        role="Supervisor"
        onCreate={onCreateLeaveRequest}
        onReview={onReviewLeaveRequest}
        currentUser={currentUser}
      />
    );
  }

  if (activeSection === "equipment") {
    const zones = (data.zoneStats || []).map((z) => z.zone);
    return (
      <EquipmentPanel
        equipment={data.equipment || []}
        maintenanceLogs={data.maintenanceLogs || []}
        zones={zones}
        canEdit={true}
        onCreate={onCreateEquipment}
        onUpdate={onUpdateEquipment}
        onDelete={onDeleteEquipment}
        onAddMaintenance={onAddMaintenance}
      />
    );
  }

  if (activeSection === "tracking") {
    return (
      <TrackingPanel
        analyses={(data.videoAnalyses || []).filter((analysis) =>
          (supervisorZone || "").includes(analysis.zone)
        )}
        isAnalyzingVideo={isAnalyzingVideo}
        defaultZone={supervisorZone?.split(" and ")[0] || "Visitor Gate"}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "report") {
    return null;
  }

  if (activeSection === "copilot") {
    return (
      <CopilotPanel
        role="Supervisor"
        prompts={copilotPrompts}
        answer={copilotAnswer}
        chatRows={chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        currentUserId={currentUser?.id}
        query={copilotQuery}
        onQueryChange={onCopilotQueryChange}
        onAsk={onAskCopilot}
        isAsking={isAskingCopilot}
        systemCapabilities={data.systemCapabilities}
      />
    );
  }

  return (
    <MessagesPanel
      chatMessages={chatMessages || []}
      onSend={onSendMessage}
      isSending={isSendingMessage}
      allowedTags={["Update", "Task update", "AgriSage query"]}
      currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      title="Team feed"
    />
  );
}
function TaskCompletionPanel({ worker, onSubmit, isSubmitting }) {
  const isCompleted = worker?.status === "Done" || worker?.progress === 100 || worker?.progress === "100%";
  
  async function handleToggleCompletion() {
    const nextProgress = isCompleted ? 0 : 100;
    const nextStatus = isCompleted ? "In progress" : "Done";
    
    await onSubmit({
      workerId: worker.id,
      task: worker.task,
      status: nextStatus,
      progress: nextProgress,
      zone: worker.zone,
      attendance: worker.attendance,
      salaryStatus: worker.salaryStatus,
      dailyWage: worker.dailyWage,
      paymentMode: worker.paymentMode,
    });
  }

  return (
    <article className="panel" style={{ gridColumn: "1 / -1", backgroundColor: isCompleted ? "rgba(16, 185, 129, 0.08)" : "var(--surface)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Task details</p>
          <h2>{worker?.task || "No active assignment"}</h2>
        </div>
      </div>
      <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "14px", color: "var(--ink)" }}>
        <div>
          <p style={{ margin: "4px 0", color: "var(--muted)" }}>Zone assigned:</p>
          <strong>{worker?.zone || "-"}</strong>
        </div>
        <div>
          <p style={{ margin: "4px 0", color: "var(--muted)" }}>Daily wage:</p>
          <strong>{worker?.dailyWageLabel || "₹0"} ({worker?.paymentMode || "Daily wage"})</strong>
        </div>
        <div>
          <p style={{ margin: "4px 0", color: "var(--muted)" }}>Amount paid so far:</p>
          <strong style={{ color: "var(--amber)" }}>{worker?.earnedTodayLabel || "₹0"}</strong>
        </div>
        <div>
          <p style={{ margin: "4px 0", color: "var(--muted)" }}>Salary status:</p>
          <strong>{worker?.salaryStatus || "Not recorded"}</strong>
        </div>
      </div>
      <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontSize: "16px", color: isCompleted ? "var(--green)" : "var(--ink)", fontWeight: 600 }}>
          <input 
            type="checkbox" 
            checked={isCompleted} 
            onChange={handleToggleCompletion} 
            disabled={isSubmitting || !worker?.task || worker?.task === "No active assignment"}
            style={{ width: "22px", height: "22px", accentColor: "var(--green)", cursor: "pointer" }}
          />
          {isCompleted ? "✓ Task completed (100%)" : "Mark task as completed"}
        </label>
      </div>
    </article>
  );
}


function WorkerDashboard({
  data,
  currentUser,
  activeSection,
  onSendMessage,
  onAskCopilot,
  isSendingMessage,
  isAskingCopilot,
  onUpdateTask,
  onAnalyzeVideo,
  isSavingTask,
  isAnalyzingVideo,
  copilotAnswer,
  copilotQuery,
  onCopilotQueryChange,
  onDismissNotification,
  onNavigateSection,
  onCreateLeaveRequest,
  onRefresh,
}) {
  const worker =
    data.workers?.[0] ||
    {
      id: currentUser?.id,
      name: currentUser?.name || "Worker",
      email: currentUser?.email || "",
      zone: "Not assigned",
      task: "No active assignment",
      status: "Ready",
      progress: "0%",
      attendance: "Not marked",
      logsToday: 0,
      salaryStatus: "Not recorded",
      dailyWage: 0,
      paymentMode: "Daily wage",
      earnedToday: 0,
      dailyWageLabel: formatCurrency(0),
      earnedTodayLabel: formatCurrency(0),
    };
  const supervisor = data.supervisors?.[0];
  const activityLogs = data.activityLogs || [];
  const chatMessages = data.chatMessages || [];
  const copilotPrompts = [
    "What is my current task status?",
    "What alerts are active?",
    "How many visitors came today?",
    "What is the most active zone?",
  ];
  const workerProgress = worker?.progressValue || Number.parseInt(worker?.progress || "0", 10) || 0;
  const metrics = [
    { label: "Current zone", value: worker?.zone || "-", detail: "Assigned work area" },
    { label: "Task status", value: worker?.status || "-", detail: worker?.task || "" },
    { label: "Earned today", value: worker?.earnedTodayLabel || "₹0", detail: worker?.salaryStatus || "Not recorded" },
    { label: "Logs today", value: String(worker?.logsToday || 0), detail: "Updates submitted" },
  ];

  const workerStatusData = {
    labels: ["Complete", "Remaining"],
    datasets: [
      {
        data: [workerProgress, Math.max(100 - workerProgress, 0)],
        backgroundColor: ["#3c8f61", "#e0e8df"],
        borderColor: "#fffaf0",
        borderWidth: 2,
      },
    ],
  };
  if (activeSection === "overview") {
    return (
      <section className="dashboard-grid">
        <WeatherWidget />
        <AttendanceMarkerPanel
          worker={worker}
          onSubmit={onUpdateTask}
          isSubmitting={isSavingTask}
          onOpenOverview={() => onNavigateSection?.("overview")}
        />
        <TaskCompletionPanel
          worker={worker}
          onSubmit={onUpdateTask}
          isSubmitting={isSavingTask}
        />
        <MetricGrid metrics={metrics} className="worker-overview-metrics" />
        <ChartPanel eyebrow="Assignment status" title="Task completion">
          <Doughnut data={workerStatusData} options={{ maintainAspectRatio: false, plugins: chartOptions.plugins }} />
        </ChartPanel>

      </section>
    );
  }

  if (activeSection === "workforce") {
    return (
      <section className="dashboard-grid">
        <WorkforcePanel
          workers={[worker]}
          attendanceSummary={{
            present: worker?.attendance === "Present" ? 1 : 0,
            late: worker?.attendance === "Late" ? 1 : 0,
            absent: worker?.attendance === "Absent" ? 1 : 0,
            total: 1,
          }}
          wageSummary={{
            totalDailyWages: worker?.dailyWage || 0,
            totalEarnedToday: worker?.earnedToday || 0,
            recorded: worker?.salaryStatus === "Recorded" ? 1 : 0,
            pendingReview: worker?.salaryStatus === "Pending review" ? 1 : 0,
            notRecorded: worker?.salaryStatus === "Not recorded" ? 1 : 0,
            totalDailyWagesLabel: worker?.dailyWageLabel || "₹0",
            totalEarnedTodayLabel: worker?.earnedTodayLabel || "₹0",
          }}
          currentUser={currentUser}
          onUpdateTask={onUpdateTask}
          isSavingTask={isSavingTask}
          allWorkers={[worker]}
          leaveRequests={data.leaveRequests || []}
          onCreateLeaveRequest={onCreateLeaveRequest}
          onReviewLeaveRequest={() => {}}
        />
      </section>
    );
  }

  if (activeSection === "mark-attendance") {
    return (
      <AttendanceMarkerPanel
        worker={worker}
        onSubmit={onUpdateTask}
        isSubmitting={isSavingTask}
        onOpenOverview={() => onNavigateSection?.("overview")}
      />
    );
  }

  if (activeSection === "tasks") {
    return (
      <div className="task-section-stack">
        <TaskNotificationBanner
          notifications={data.taskNotifications || []}
          onDismiss={onDismissNotification}
        />
        <TaskEditor
          worker={worker}
          allWorkers={[worker]}
          selectedWorkerId={worker?.id}
          onSelectWorker={() => {}}
          canEditAllFields={false}
          onSubmit={onUpdateTask}
          isSubmitting={isSavingTask}
        />
      </div>
    );
  }

  if (activeSection === "workforce") {
    return (
      <WorkforcePanel
        workers={[worker]}
        attendanceSummary={{
          present: worker?.attendance === "Present" ? 1 : 0,
          late: worker?.attendance === "Late" ? 1 : 0,
          absent: worker?.attendance === "Absent" ? 1 : 0,
          total: 1,
        }}
        wageSummary={{
          totalDailyWages: worker?.dailyWage || 0,
          totalEarnedToday: worker?.earnedToday || 0,
          recorded: worker?.salaryStatus === "Recorded" ? 1 : 0,
          pendingReview: worker?.salaryStatus === "Pending review" ? 1 : 0,
          notRecorded: worker?.salaryStatus === "Not recorded" ? 1 : 0,
          totalDailyWagesLabel: worker?.dailyWageLabel || "₹0",
          totalEarnedTodayLabel: worker?.earnedTodayLabel || "₹0",
        }}
        currentUser={currentUser}
        onUpdateTask={onUpdateTask}
        isSavingTask={isSavingTask}
        allWorkers={[worker]}
        leaveRequests={data.leaveRequests || []}
        onCreateLeaveRequest={onCreateLeaveRequest}
        onReviewLeaveRequest={() => {}}
      />
    );
  }

  if (activeSection === "leave") {
    return (
      <LeaveRequestsPanel
        requests={data.leaveRequests || []}
        workers={[worker]}
        role="Worker"
        onCreate={onCreateLeaveRequest}
        onReview={() => {}}
        currentUser={currentUser}
      />
    );
  }

  if (activeSection === "tracking") {
    return (
      <TrackingPanel
        analyses={(data.videoAnalyses || []).filter((analysis) => analysis.zone === worker?.zone)}
        isAnalyzingVideo={isAnalyzingVideo}
        defaultZone={worker?.zone || "Visitor Gate"}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "report") {
    return null;
  }

  if (activeSection === "copilot") {
    return (
      <CopilotPanel
        role="Worker"
        prompts={copilotPrompts}
        answer={copilotAnswer}
        chatRows={chatMessages || []}
        onSend={onSendMessage}
        isSending={isSendingMessage}
        currentUserId={currentUser?.id}
        query={copilotQuery}
        onQueryChange={onCopilotQueryChange}
        onAsk={onAskCopilot}
        isAsking={isAskingCopilot}
        systemCapabilities={data.systemCapabilities}
      />
    );
  }

  return (
    <MessagesPanel
      chatMessages={chatMessages || []}
      onSend={onSendMessage}
      isSending={isSendingMessage}
      allowedTags={["Task update", "Visitor entry"]}
      currentUser={currentUser} users={data?.users || []} supervisors={data?.supervisors || []} workers={data?.workers || []} customGroups={data?.customGroups || []}
      title="My message stream"
    />
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window === "undefined") {
      return "overview";
    }

    const hash = window.location.hash.replace("#", "");

    if (hash === "mark-attendance") {
      return "mark-attendance";
    }

    if (hash === "attendance" || hash === "salary") {
      return "workforce";
    }

    if (hash === "tasks" || hash === "people") {
      return "overview";
    }

    if (hash === "updates") {
      return "messages";
    }

    return hash || "overview";
  });
  const [dashboardData, setDashboardData] = useState(null);
  const [dataError, setDataError] = useState("");
  const [copilotQuery, setCopilotQuery] = useState("");
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotAnswer, setCopilotAnswer] = useState({
    question: "",
    title: "",
    summary: "",
    evidence: [],
  });
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isAskingCopilot, setIsAskingCopilot] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const seenMessageIdsRef = useRef(new Set());
  const setupHint =
    dataError && /database_url|postgres|database/i.test(dataError)
      ? "Check frontend/.env.local and confirm PostgreSQL is running before reopening the dashboard."
      : "";

  function resetCopilotState() {
    setCopilotQuery("");
    setCopilotAnswer({
      question: "",
      title: "",
      summary: "",
      evidence: [],
    });
  }

  function normalizeSection(section) {
    if (section === "mark-attendance") {
      return "mark-attendance";
    }

    if (section === "attendance" || section === "salary") {
      return "workforce";
    }

    if (section === "tasks") {
      return "overview";
    }

    if (section === "people") {
      return "overview";
    }

    if (section === "updates") {
      return "messages";
    }

    if (section === "copilot") {
      return "overview";
    }

    return section || "overview";
  }

  useEffect(() => {
    function syncActiveSection() {
      const hash = window.location.hash.replace("#", "");
      setActiveSection(normalizeSection(hash));
    }

    syncActiveSection();
    window.addEventListener("hashchange", syncActiveSection);

    return () => window.removeEventListener("hashchange", syncActiveSection);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);



  useEffect(() => {
    if (status !== "authenticated") {
      return undefined;
    }

    let cancelled = false;
    // let socket = null; (removed)

    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load dashboard data.");
        }

        if (!cancelled) {
          setDashboardData(data);
          setDataError("");
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (error) {
        if (!cancelled) {
          setDataError(error.message);
        }
      }
    }

    // Initial load
    loadDashboard();

    // Setup Supabase Realtime connection
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log('Supabase Realtime: Live change detected on table', payload.table, ', reloading...');
          loadDashboard();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Supabase Realtime: Connected to real-time updates server');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('Supabase Realtime channel error');
        }
      });

    // Fallback slow poll interval (15s) in case WebSocket fails
    const interval = window.setInterval(loadDashboard, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [status]);

  async function refreshDashboardNow() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load dashboard data.");
    }

    setDashboardData(data);
    setDataError("");
    setLastUpdated(new Date().toLocaleTimeString());
  }

  async function handleSendMessage(payload) {
    try {
      setIsSendingMessage(true);
      setDataError("");

      let finalPayload = { ...payload };

      if (payload.audioUrl && !payload.text) {
        const audioRes = await fetch(payload.audioUrl);
        const audioBlob = await audioRes.blob();

        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");

        const transcribeRes = await fetch("/api/agrisense/sarvam/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!transcribeRes.ok) {
          const errData = await transcribeRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to transcribe audio.");
        }

        const transcribeData = await transcribeRes.json();
        const transcriptionText = transcribeData.transcript || transcribeData.text || "";
        if (!transcriptionText.trim()) {
          throw new Error("Could not transcribe any speech from the audio.");
        }

        finalPayload.text = transcriptionText;
        delete finalPayload.audioUrl;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(finalPayload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to send update.");
      }

      if (data.message) {
        setDashboardData((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            chatMessages: [...(current.chatMessages || []), data.message].slice(-24),
          };
        });
        setLastUpdated(new Date().toLocaleTimeString());
      }

      await refreshDashboardNow();
      return true;
    } catch (error) {
      setDataError(error.message);
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleAskCopilot(question) {
    const normalizedQuestion = String(question || "").trim();

    if (!normalizedQuestion) {
      setDataError("Ask a chat question for the copilot.");
      return false;
    }

    try {
      setIsAskingCopilot(true);
      setDataError("");

      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: normalizedQuestion }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to search chat context.");
      }

      setCopilotQuery(normalizedQuestion);
      setCopilotAnswer({
        question: normalizedQuestion,
        ...(data.answer || {}),
      });

      return true;
    } catch (error) {
      setDataError(error.message);
      return false;
    } finally {
      setIsAskingCopilot(false);
    }
  }

  async function submitMutation(url, payload, setter) {
    try {
      setter(true);
      setDataError("");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to save change.");
      }

      await refreshDashboardNow();
      return true;
    } catch (error) {
      setDataError(error.message);
      return false;
    } finally {
      setter(false);
    }
  }

  async function handleTaskUpdate(payload) {
    const optimisticWorkerId = payload.workerId;
    const optimisticPatch = {
      task: payload.task,
      status: payload.status,
      progressValue: payload.progress,
      zone: payload.zone,
      attendance: payload.attendance,
      salaryStatus: payload.salaryStatus,
      dailyWage: payload.dailyWage,
      paymentMode: payload.paymentMode,
      paymentAmount: payload.paymentAmount,
      paymentTxnId: payload.paymentTxnId,
      paymentDate: payload.paymentDate,
    };

    try {
      setIsSavingTask(true);
      setDataError("");

      setDashboardData((current) => {
        if (!current) return current;
        return {
          ...current,
          workers: patchWorkerCollection(current.workers || [], optimisticWorkerId, optimisticPatch),
        };
      });
      setLastUpdated(new Date().toLocaleTimeString());

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to save task.");
      }

      // Optimistically patch the worker in local state immediately so the
      // UI reflects the saved values before the next polling cycle arrives.
      // The API returns the raw Postgres row (snake_case), so we handle both.
      if (data.worker) {
        const r = data.worker;
        const updatedId = r.user_id ?? r.id;
        setDashboardData((current) => {
          if (!current) return current;
          return {
            ...current,
            workers: patchWorkerCollection(current.workers || [], updatedId, r),
          };
        });
        setLastUpdated(new Date().toLocaleTimeString());
      }

      // Then sync with the server to get authoritative state.
      await refreshDashboardNow();
      return true;
    } catch (error) {
      setDataError(error.message);
      return false;
    } finally {
      setIsSavingTask(false);
    }
  }

  async function handleDismissNotification(notificationId) {
    try {
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      await refreshDashboardNow();
    } catch (_error) {
      // Non-fatal
    }
  }

  function handleAnalyzeVideo(payload) {
    return submitMutation("/api/tracking", payload, setIsAnalyzingVideo);
  }

  async function handleMarkMessagesRead() {
    try {
      await fetch("/api/chat/read", {
        method: "POST",
      });
      await refreshDashboardNow();
    } catch (_error) {
      // Keep the dashboard usable even if read receipts fail briefly.
    }
  }

  async function handleCreateCrop(data) {
    try {
      const res = await fetch("/api/crops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create crop");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleUpdateCrop(id, data) {
    try {
      const res = await fetch(`/api/crops/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update crop");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleDeleteCrop(id) {
    try {
      const res = await fetch(`/api/crops/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete crop");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleCreateLeaveRequest(data) {
    try {
      const res = await fetch("/api/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to request leave");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleReviewLeaveRequest(requestId, status) {
    try {
      const res = await fetch("/api/leave", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, status }) });
      if (!res.ok) throw new Error("Failed to review leave");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleCreateEquipment(data) {
    try {
      const res = await fetch("/api/equipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create equipment");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleUpdateEquipment(id, data) {
    try {
      const res = await fetch(`/api/equipment/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update equipment");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleDeleteEquipment(id) {
    try {
      const res = await fetch(`/api/equipment/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete equipment");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleAddMaintenance(equipmentId, data) {
    try {
      const res = await fetch(`/api/equipment/${equipmentId}/maintenance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to add maintenance log");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleUpdateAlert(id, action) {
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!res.ok) throw new Error("Failed to update alert");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleLogExpense(data) {
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to log expense");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleUpdateOrder(id, data) {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to update order");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleUpdateSupply(id, data) {
    try {
      const res = await fetch(`/api/supplies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to update supply");
      await refreshDashboardNow();
    } catch (e) { setDataError(e.message); }
  }

  async function handleEnableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setDataError("Browser notifications are not supported here.");
      return;
    }

    try {
      setIsUpdatingNotifications(true);
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      const response = await fetch("/api/chat/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: permission === "granted" }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to save notification preference.");
      }

      await refreshDashboardNow();
    } catch (error) {
      setDataError(error.message);
    } finally {
      setIsUpdatingNotifications(false);
    }
  }

  useEffect(() => {
    if (!dashboardData?.chatMessages?.length) {
      return;
    }

    const currentIds = new Set();

    dashboardData.chatMessages.forEach((message) => {
      currentIds.add(message.id);
    });

    if (seenMessageIdsRef.current.size === 0) {
      seenMessageIdsRef.current = currentIds;
      return;
    }

    const incomingMessages = dashboardData.chatMessages.filter(
      (message) =>
        !seenMessageIdsRef.current.has(message.id) &&
        message.senderId !== session?.user?.id
    );

    if (
      incomingMessages.length &&
      dashboardData.messageState?.notificationsEnabled &&
      notificationPermission === "granted" &&
      typeof window !== "undefined" &&
      "Notification" in window
    ) {
      incomingMessages.slice(-2).forEach((message) => {
        const notification = new Notification(message.senderName, {
          body: message.imageUrl ? `${message.text} Photo attached.` : message.text,
          tag: message.id,
        });

        notification.onclick = () => {
          window.focus();
          window.location.hash = "#updates";
        };
      });
    }

    seenMessageIdsRef.current = currentIds;
  }, [
    dashboardData?.chatMessages,
    dashboardData?.messageState?.notificationsEnabled,
    notificationPermission,
    session?.user?.id,
  ]);

  useEffect(() => {
    if (!dashboardData || activeSection !== "messages") {
      return;
    }

    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    if ((dashboardData.unreadMessageCount || 0) > 0) {
      handleMarkMessagesRead();
    }
  }, [activeSection, dashboardData]);

  const role = session?.user?.role || "Worker";
  const userName = session?.user?.name || "FloriSight User";
  const [showTour, completeTour] = useShouldShowTour(status, session?.user?.id);
  const unreadMessageCount = dashboardData?.unreadMessageCount || 0;
  const notificationsEnabled = Boolean(dashboardData?.messageState?.notificationsEnabled);
  const adminHiddenSections = new Set(["mark-attendance"]);
  const supervisorHiddenSections = new Set(["mark-attendance", "report"]);
  const workerHiddenSections = new Set(["workforce", "inventory", "sales", "orders", "analytics", "tracking", "report"]);
  const visibleDashboardSections = dashboardSections.filter((section) => {
    if (role === "Admin" && adminHiddenSections.has(section.id)) return false;
    if (role === "Supervisor" && supervisorHiddenSections.has(section.id)) return false;
    if (role === "Worker" && workerHiddenSections.has(section.id)) return false;
    return true;
  });

  useEffect(() => {
    const hiddenForRole =
      role === "Admin" ? adminHiddenSections :
      role === "Supervisor" ? supervisorHiddenSections :
      role === "Worker" ? workerHiddenSections :
      null;

    if (hiddenForRole && hiddenForRole.has(activeSection)) {
      setActiveSection("overview");

      if (typeof window !== "undefined") {
        window.location.hash = "#overview";
      }
    }
  }, [activeSection, role]);

  if (status === "loading") {
    return (
      <main className="center-page">
        <div className="loading-card">Loading workspace...</div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="center-page">
        <div className="loading-card">
          <h1>Sign in required</h1>
          <p>Use your FloriSight account to open the operations dashboard.</p>
          <Link className="primary-link" href="/auth">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <Link href="/" className="brand compact">
          FloriSight
        </Link>
        <nav className="side-nav" aria-label="Dashboard navigation">
          {visibleDashboardSections.map((section) => (
            <a
              href={`#${section.id}`}
              key={section.id}
              className={(section.id === "copilot" ? isCopilotOpen : activeSection === section.id) ? "active" : ""}
              onClick={(event) => {
                setIsSidebarOpen(false);
                if (section.id === "copilot") {
                  event.preventDefault();
                  resetCopilotState();
                  setIsCopilotOpen(true);
                  return;
                }

                setActiveSection(section.id);
              }}
            >
              <span>{section.label}</span>
              {section.id === "messages" && unreadMessageCount > 0 && (
                <span className="nav-badge">{unreadMessageCount}</span>
              )}
            </a>
          ))}
        </nav>
        <button
          className={notificationsEnabled ? "secondary-link notification-button active" : "secondary-link notification-button"}
          onClick={handleEnableNotifications}
          type="button"
          disabled={isUpdatingNotifications}
        >
          {isUpdatingNotifications
            ? "Updating..."
            : notificationsEnabled && notificationPermission === "granted"
            ? "Notifications on"
            : "Enable notifications"}
        </button>
        <ThemeToggle className="sidebar-theme-toggle" />

        <div className="role-card">
          <span>{role}</span>
          <p>
            {role === "Admin"
              ? "Complete project view across supervisors and workers."
              : role === "Supervisor"
              ? "Team view for workers assigned under you."
              : "Individual access for your own assignments and logs."}
          </p>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={24} />
            </button>
            <div>
              <p className="eyebrow">Operations dashboard</p>
              <h1>Welcome, {userName.split(" ")[0]}</h1>
              {lastUpdated && <p className="live-status">Live data updated at {lastUpdated}</p>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {role === "Admin" ? (
              <Link href="/dashboard/database" className="secondary-link">
                Database viewer
              </Link>
            ) : null}
            <button className="secondary-link" onClick={() => signOut({ callbackUrl: "/" })}>
              Sign out
            </button>
          </div>
        </header>

        {dataError && (
          <div className="loading-card dashboard-error">
            <strong>Dashboard data is unavailable.</strong>
            <p>{dataError}</p>
            {setupHint ? <p className="dashboard-error-hint">{setupHint}</p> : null}
          </div>
        )}
        {!dashboardData && !dataError && (
          <div className="loading-card dashboard-error">Loading live PostgreSQL data...</div>
        )}

        {dashboardData && activeSection === "agrisense" ? (
          <AgriSensePanel
            role={role}
            session={session}
          />
        ) : (
          <>
            {dashboardData && role === "Admin" && (
              <AdminDashboard
                data={dashboardData}
                currentUser={session?.user}
                activeSection={activeSection}
                onSendMessage={handleSendMessage}
                onAskCopilot={handleAskCopilot}
                isSendingMessage={isSendingMessage}
                isAskingCopilot={isAskingCopilot}
                onUpdateTask={handleTaskUpdate}
                onAnalyzeVideo={handleAnalyzeVideo}
                isSavingTask={isSavingTask}
                isAnalyzingVideo={isAnalyzingVideo}
                copilotAnswer={copilotAnswer}
                copilotQuery={copilotQuery}
                onCopilotQueryChange={setCopilotQuery}
                onCreateCrop={handleCreateCrop}
                onUpdateCrop={handleUpdateCrop}
                onDeleteCrop={handleDeleteCrop}
                onCreateLeaveRequest={handleCreateLeaveRequest}
                onReviewLeaveRequest={handleReviewLeaveRequest}
                onCreateEquipment={handleCreateEquipment}
                onUpdateEquipment={handleUpdateEquipment}
                onDeleteEquipment={handleDeleteEquipment}
                onAddMaintenance={handleAddMaintenance}
                onRefresh={refreshDashboardNow}
                onUpdateAlert={handleUpdateAlert}
                onAddExpense={handleLogExpense}
                onUpdateOrder={handleUpdateOrder}
                onUpdateSupply={handleUpdateSupply}
              />
            )}
            {dashboardData && role === "Supervisor" && (
              <SupervisorDashboard
                data={dashboardData}
                currentUser={session?.user}
                activeSection={activeSection}
                onSendMessage={handleSendMessage}
                onAskCopilot={handleAskCopilot}
                isSendingMessage={isSendingMessage}
                isAskingCopilot={isAskingCopilot}
                onUpdateTask={handleTaskUpdate}
                onAnalyzeVideo={handleAnalyzeVideo}
                isSavingTask={isSavingTask}
                isAnalyzingVideo={isAnalyzingVideo}
                copilotAnswer={copilotAnswer}
                copilotQuery={copilotQuery}
                onCopilotQueryChange={setCopilotQuery}
                onCreateCrop={handleCreateCrop}
                onUpdateCrop={handleUpdateCrop}
                onDeleteCrop={handleDeleteCrop}
                onCreateLeaveRequest={handleCreateLeaveRequest}
                onReviewLeaveRequest={handleReviewLeaveRequest}
                onCreateEquipment={handleCreateEquipment}
                onUpdateEquipment={handleUpdateEquipment}
                onDeleteEquipment={handleDeleteEquipment}
                onAddMaintenance={handleAddMaintenance}
                onRefresh={refreshDashboardNow}
                onUpdateAlert={handleUpdateAlert}
                onAddExpense={handleLogExpense}
                onUpdateOrder={handleUpdateOrder}
                onUpdateSupply={handleUpdateSupply}
              />
            )}
            {dashboardData && role === "Worker" && (
              <WorkerDashboard
                data={dashboardData}
                currentUser={session?.user}
                activeSection={activeSection}
                onSendMessage={handleSendMessage}
                onAskCopilot={handleAskCopilot}
                isSendingMessage={isSendingMessage}
                isAskingCopilot={isAskingCopilot}
                onUpdateTask={handleTaskUpdate}
                onAnalyzeVideo={handleAnalyzeVideo}
                isSavingTask={isSavingTask}
                isAnalyzingVideo={isAnalyzingVideo}
                copilotAnswer={copilotAnswer}
                copilotQuery={copilotQuery}
                onCopilotQueryChange={setCopilotQuery}
                onDismissNotification={handleDismissNotification}
                onNavigateSection={setActiveSection}
                onCreateLeaveRequest={handleCreateLeaveRequest}
                onRefresh={refreshDashboardNow}
              />
            )}
          </>
        )}
        <AgriSageModal
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          role={role}
          answer={copilotAnswer}
          query={copilotQuery}
          onQueryChange={setCopilotQuery}
          onAsk={handleAskCopilot}
          isAsking={isAskingCopilot}
          systemCapabilities={dashboardData?.systemCapabilities}
        />
      </section>
      {showTour && dashboardData && (
        <OnboardingTour role={role} isActive={showTour} onComplete={completeTour} />
      )}
    </main>
  );
}
