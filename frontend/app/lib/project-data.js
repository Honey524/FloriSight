export const farmUsers = [
  {
    id: "admin-1",
    name: "Farm Administrator",
    email: "admin@florisight.local",
    password: "admin123",
    role: "Admin",
  },
  {
    id: "sup-1",
    name: "Asha Menon",
    email: "asha@florisight.local",
    password: "supervisor123",
    role: "Supervisor",
    supervisorId: "sup-1",
  },
  {
    id: "sup-2",
    name: "Ravi Kumar",
    email: "ravi@florisight.local",
    password: "supervisor123",
    role: "Supervisor",
    supervisorId: "sup-2",
  },
  {
    id: "wrk-1",
    name: "Meera Nair",
    email: "meera@florisight.local",
    password: "worker123",
    role: "Worker",
    supervisorId: "sup-1",
    workerId: "wrk-1",
  },
  {
    id: "wrk-2",
    name: "Anil Das",
    email: "anil@florisight.local",
    password: "worker123",
    role: "Worker",
    supervisorId: "sup-1",
    workerId: "wrk-2",
  },
  {
    id: "wrk-3",
    name: "Neha Rao",
    email: "neha@florisight.local",
    password: "worker123",
    role: "Worker",
    supervisorId: "sup-2",
    workerId: "wrk-3",
  },
  {
    id: "wrk-4",
    name: "Kiran Shetty",
    email: "kiran@florisight.local",
    password: "worker123",
    role: "Worker",
    supervisorId: "sup-2",
    workerId: "wrk-4",
  },
];

export const supervisors = [
  {
    id: "sup-1",
    name: "Asha Menon",
    email: "asha@florisight.local",
    zone: "Greenhouse A and Packing Unit",
    workers: 2,
    activeTasks: 8,
    completedToday: 5,
    visitorLogs: 34,
    alerts: 1,
    performance: "92%",
  },
  {
    id: "sup-2",
    name: "Ravi Kumar",
    email: "ravi@florisight.local",
    zone: "Nursery Bay and Visitor Gate",
    workers: 2,
    activeTasks: 6,
    completedToday: 4,
    visitorLogs: 24,
    alerts: 2,
    performance: "87%",
  },
];

export const workers = [
  {
    id: "wrk-1",
    supervisorId: "sup-1",
    name: "Meera Nair",
    email: "meera@florisight.local",
    zone: "Greenhouse A",
    task: "Harvest Dutch roses",
    status: "In progress",
    progress: "62%",
    attendance: "Present",
    logsToday: 6,
    salaryStatus: "Recorded",
    dailyWage: 950,
    paymentMode: "Daily wage",
  },
  {
    id: "wrk-2",
    supervisorId: "sup-1",
    name: "Anil Das",
    email: "anil@florisight.local",
    zone: "Packing Unit",
    task: "Pack export cartons",
    status: "Review",
    progress: "88%",
    attendance: "Present",
    logsToday: 4,
    salaryStatus: "Pending review",
    dailyWage: 900,
    paymentMode: "Daily wage",
  },
  {
    id: "wrk-3",
    supervisorId: "sup-2",
    name: "Neha Rao",
    email: "neha@florisight.local",
    zone: "Visitor Gate",
    task: "Visitor entry validation",
    status: "In progress",
    progress: "71%",
    attendance: "Present",
    logsToday: 8,
    salaryStatus: "Recorded",
    dailyWage: 980,
    paymentMode: "Daily wage",
  },
  {
    id: "wrk-4",
    supervisorId: "sup-2",
    name: "Kiran Shetty",
    email: "kiran@florisight.local",
    zone: "Nursery Bay",
    task: "Seedling tray inspection",
    status: "Pending",
    progress: "34%",
    attendance: "Late",
    logsToday: 2,
    salaryStatus: "Pending review",
    dailyWage: 870,
    paymentMode: "Daily wage",
  },
];

export const activityLogs = [
  ["09:20", "Asha Menon", "Visitor entry", "5 visitors entered through Gate 2."],
  ["10:05", "Meera Nair", "Task update", "Packing batch B-18 image uploaded."],
  ["10:42", "Ravi Kumar", "Alert", "Visitor Gate density is above normal."],
  ["11:10", "Neha Rao", "Visitor update", "School group checked into Nursery Bay."],
];

export const farmMetrics = [
  { label: "Supervisors", value: "2", detail: "Both active today" },
  { label: "Workers", value: "4", detail: "3 present, 1 late" },
  { label: "Visitor logs", value: "58", detail: "12 in Greenhouse A" },
  { label: "Open tasks", value: "14", detail: "4 awaiting review" },
];

export function findUserByEmail(email) {
  return farmUsers.find(
    (user) => user.email.toLowerCase() === String(email || "").toLowerCase().trim()
  );
}

export function getWorkersForSupervisor(supervisorId) {
  return workers.filter((worker) => worker.supervisorId === supervisorId);
}

export function getSupervisorById(supervisorId) {
  return supervisors.find((supervisor) => supervisor.id === supervisorId);
}

export function getWorkerById(workerId) {
  return workers.find((worker) => worker.id === workerId);
}
