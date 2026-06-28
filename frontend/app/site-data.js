export const capabilities = [
  {
    title: "Smart logging",
    text: "Turn daily text and image updates into structured farm records.",
  },
  {
    title: "Visitor tracking",
    text: "Track movement, density, and zone activity across farm areas.",
  },
  {
    title: "AI copilot",
    text: "Ask operational questions and retrieve grounded farm insights.",
  },
  {
    title: "Role control",
    text: "Separate admin, supervisor, and worker workflows cleanly.",
  },
];

export const platformLayers = [
  ["Input layer", "Text updates, image uploads, and combined field reports."],
  ["Processing layer", "Natural language extraction, computer vision, and multimodal validation."],
  ["Storage layer", "Operational records, worker data, visitor logs, and searchable context."],
  ["Retrieval layer", "Text-to-SQL, semantic search, and copilot-ready responses."],
];

export const roles = [
  ["Admin", "Global analytics, configuration, user access, and complete visibility."],
  ["Supervisor", "Worker coordination, task assignment, zone monitoring, and reports."],
  ["Worker", "Assigned tasks, status updates, image submissions, and daily logs."],
];

export const workflowSteps = [
  "Text and image updates",
  "AI extraction and validation",
  "PostgreSQL-ready operational records",
  "Copilot answers with SQL and RAG context",
];

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export const staggerGroup = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};
