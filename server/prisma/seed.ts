// Seeds reference data and development accounts for TokTickIT.
// Idempotent: safe to run multiple times (upsert by email / ticket number).
// Never overwrites an existing passwordHash or mustChangePassword (BR-62).
// Lab 3: Users, Sessions cleared; Categories and Related Systems unchanged;
//         ~24 reserved Tickets with all statuses/priorities; PublicComments; InternalNotes.

import { PrismaClient, Role, Priority, TicketStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_INITIAL_PASSWORD || "Welcome#2026";
const BCRYPT_COST = parseInt(process.env.BCRYPT_COST || "10", 10);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];

const RELATED_SYSTEMS = [
  { name: "Email",                      isActive: true  },
  { name: "Campus Wi-Fi",               isActive: true  },
  { name: "VPN",                        isActive: true  },
  { name: "Student Information System", isActive: true  },
  { name: "Learning Management System", isActive: true  },
  { name: "Library Database",           isActive: true  },
  { name: "Legacy CRM",                 isActive: false },
];

// ---------------------------------------------------------------------------
// User seed data
// ---------------------------------------------------------------------------
// Requesters are migrated from Lab 2 DevRequesters; they get the initial
// password only if their passwordHash is currently NULL (BR-59).
// Staff and Admin accounts are new; they are created with mustChangePassword=false.

const REQUESTERS = [
  { name: "Alice Johnson", email: "alice@example.com",  isActive: true  },
  { name: "Bob Smith",     email: "bob@example.com",    isActive: true  },
  { name: "Carol Davis",   email: "carol@example.com",  isActive: true  },
  { name: "David Wilson",  email: "david@example.com",  isActive: true  },
  { name: "Eve Martinez",  email: "eve@example.com",    isActive: false },
];

const STAFF = [
  { name: "Michael Brown",  email: "michael.brown@example.com",  isActive: true  },
  { name: "Sarah Johnson",  email: "sarah.johnson@example.com",  isActive: true  },
  { name: "David Lee",      email: "david.lee@example.com",      isActive: true  },
  { name: "Emma Clark",     email: "emma.clark@example.com",     isActive: false },
];

const ADMIN = { name: "Admin", email: "admin@example.com", isActive: true };

// ---------------------------------------------------------------------------
// Ticket seed data (reserved numbers TKT-2026-900001..900024)
// ---------------------------------------------------------------------------

type TicketSeed = {
  ticketNumber: string;
  requesterEmail: string;
  ownerEmail: string | null;
  category: string;
  relatedSystem: string;
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  requesterResolvedAt: Date | null;
  resolutionSummary: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
};

const PAST = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000);

const SEEDED_TICKETS: TicketSeed[] = [
  {
    ticketNumber: "TKT-2026-900001",
    requesterEmail: "alice@example.com",
    ownerEmail: null,
    category: "Account and Access",
    relatedSystem: "Email",
    summary: "Cannot access email after password reset",
    description: "Email access blocked following a recent IT password reset. All login attempts fail with an authentication error.",
    requestedPriority: Priority.LOW,
    itPriority: Priority.LOW,
    currentStatus: TicketStatus.NEW,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900002",
    requesterEmail: "bob@example.com",
    ownerEmail: null,
    category: "Hardware",
    relatedSystem: "Campus Wi-Fi",
    summary: "Laptop keyboard keys not responding",
    description: "Several keys on the keyboard are unresponsive. Issue started after a firmware update was applied automatically.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.NEW,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900003",
    requesterEmail: "carol@example.com",
    ownerEmail: "michael.brown@example.com",
    category: "Software",
    relatedSystem: "VPN",
    summary: "VPN client fails to connect from off-campus",
    description: "The VPN client cannot establish a connection when working off-campus. Error code: AUTH_TIMEOUT. Affects remote access to university resources.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.OPEN,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900004",
    requesterEmail: "david@example.com",
    ownerEmail: "sarah.johnson@example.com",
    category: "Hardware",
    relatedSystem: "Campus Wi-Fi",
    summary: "Network printer in room 204 offline",
    description: "The shared network printer in room 204 shows as offline. Print jobs queue but never process. Other devices on the same network segment can communicate normally.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.OPEN,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900005",
    requesterEmail: "alice@example.com",
    ownerEmail: "michael.brown@example.com",
    category: "Software",
    relatedSystem: "Student Information System",
    summary: "SIS portal returns 500 error on grade submission",
    description: "The Student Information System portal throws an internal server error (HTTP 500) when attempting to submit final grades. Affects all instructors in the Faculty of Engineering.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.IN_PROGRESS,
    requesterResolvedAt: PAST(1),
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900006",
    requesterEmail: "bob@example.com",
    ownerEmail: "emma.clark@example.com", // inactive staff: demonstrates BR-29/AC-78 "(inactive)" owner marker
    category: "Software",
    relatedSystem: "Learning Management System",
    summary: "LMS video upload fails for files over 500 MB",
    description: "Uploading lecture recordings larger than 500 MB to the LMS results in a timeout error. Smaller files upload successfully. This is blocking course content delivery.",
    requestedPriority: Priority.LOW,
    itPriority: Priority.LOW,
    currentStatus: TicketStatus.IN_PROGRESS,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900007",
    requesterEmail: "carol@example.com",
    ownerEmail: "sarah.johnson@example.com",
    category: "Software",
    relatedSystem: "Library Database",
    summary: "Library database search returns empty results for known titles",
    description: "Searching for confirmed available titles in the library catalogue returns no results. The database was recently migrated to a new server. The issue affects all library database queries.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.WAITING_FOR_REQUESTER,
    requesterResolvedAt: PAST(2),
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900008",
    requesterEmail: "david@example.com",
    ownerEmail: "michael.brown@example.com",
    category: "Network",
    relatedSystem: "VPN",
    summary: "VPN drops connection every 15 minutes",
    description: "The VPN connection disconnects automatically approximately every 15 minutes. Reconnection is manual and disruptive. Issue affects only users with Windows 11 clients.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.WAITING_FOR_REQUESTER,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900009",
    requesterEmail: "alice@example.com",
    ownerEmail: "david.lee@example.com",
    category: "Account and Access",
    relatedSystem: "Email",
    summary: "Email account locked out — unable to receive password reset link",
    description: "Account locked after multiple incorrect password attempts. Password reset emails are not arriving at the alternative address on file. Full email access required urgently.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.RESOLVED,
    requesterResolvedAt: null,
    resolutionSummary: "Account unlocked and password reset link delivered to verified alternative address. User confirmed access restored.",
    resolvedAt: PAST(5),
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900010",
    requesterEmail: "bob@example.com",
    ownerEmail: "sarah.johnson@example.com",
    category: "Software",
    relatedSystem: "Learning Management System",
    summary: "Cannot enrol in elective course on LMS",
    description: "The course enrolment button for elective courses is greyed out on the LMS. Core courses enrol normally. The issue appeared after the semester changeover.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.RESOLVED,
    requesterResolvedAt: null,
    resolutionSummary: "Resolved a misconfigured enrolment rule that restricted elective access. User has been manually enrolled in the requested course.",
    resolvedAt: PAST(7),
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900011",
    requesterEmail: "carol@example.com",
    ownerEmail: "michael.brown@example.com",
    category: "Network",
    relatedSystem: "Campus Wi-Fi",
    summary: "Wi-Fi in Building C drops every morning between 8–9 AM",
    description: "Campus Wi-Fi in Building C is consistently unreliable between 8 and 9 AM on weekdays. Students attending morning lectures are unable to connect. Issue has persisted for three weeks.",
    requestedPriority: Priority.LOW,
    itPriority: Priority.LOW,
    currentStatus: TicketStatus.CLOSED,
    requesterResolvedAt: null,
    resolutionSummary: "Access point firmware updated and channel interference resolved. Monitored for one week with no recurrence. User confirmed Wi-Fi stable.",
    resolvedAt: PAST(14),
    closedAt: PAST(7),
  },
  {
    ticketNumber: "TKT-2026-900012",
    requesterEmail: "david@example.com",
    ownerEmail: "david.lee@example.com",
    category: "Software",
    relatedSystem: "Student Information System",
    summary: "SIS transcript request page unresponsive",
    description: "The transcript request page in SIS times out after clicking Submit. The issue is intermittent but has occurred on five consecutive attempts over two days.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.CLOSED,
    requesterResolvedAt: null,
    resolutionSummary: "Database query optimisation applied to the transcript generation module. Page now loads and submits within normal response time. Confirmed resolved by requester.",
    resolvedAt: PAST(10),
    closedAt: PAST(4),
  },
  {
    ticketNumber: "TKT-2026-900013",
    requesterEmail: "alice@example.com",
    ownerEmail: "sarah.johnson@example.com",
    category: "Account and Access",
    relatedSystem: "Email",
    summary: "Email signature missing after client upgrade",
    description: "The configured email signature disappeared from outgoing messages following the email client upgrade last Tuesday. The signature is still visible in settings but does not appear in sent messages.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.REOPENED,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900014",
    requesterEmail: "bob@example.com",
    ownerEmail: "michael.brown@example.com",
    category: "Software",
    relatedSystem: "Library Database",
    summary: "Library database advanced search filters not saving",
    description: "Custom search filter configurations in the library database are not persisted between sessions. Users must reconfigure filters each time they log in, which is time-consuming for research workflows.",
    requestedPriority: Priority.LOW,
    itPriority: Priority.LOW,
    currentStatus: TicketStatus.REOPENED,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900015",
    requesterEmail: "carol@example.com",
    ownerEmail: null,
    category: "Hardware",
    relatedSystem: "Campus Wi-Fi",
    summary: "Docking station USB hub not recognised",
    description: "The USB hub ports on the docking station in Office 315 do not recognise connected peripherals. Direct USB connections to the laptop work. The docking station was replaced last month.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.CANCELLED,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900016",
    requesterEmail: "david@example.com",
    ownerEmail: "david.lee@example.com",
    category: "Network",
    relatedSystem: "VPN",
    summary: "VPN not available during scheduled maintenance window",
    description: "VPN access was unexpectedly unavailable during the announced maintenance window, preventing remote access to critical systems. The issue is now resolved but formal documentation is required.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.CANCELLED,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900017",
    requesterEmail: "alice@example.com",
    ownerEmail: null,
    category: "Account and Access",
    relatedSystem: "Email",
    summary: "Two-factor authentication not sending SMS codes",
    description: "SMS verification codes for two-factor authentication are not arriving. The phone number on the account is correct. Email-based fallback verification also fails.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.NEW,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900018",
    requesterEmail: "bob@example.com",
    ownerEmail: "sarah.johnson@example.com",
    category: "Software",
    relatedSystem: "Learning Management System",
    summary: "LMS quiz timer continues after submission",
    description: "After submitting a quiz on the LMS, the countdown timer continues running and triggers a late-submission warning even though the quiz was submitted before the deadline.",
    requestedPriority: Priority.LOW,
    itPriority: Priority.LOW,
    currentStatus: TicketStatus.OPEN,
    requesterResolvedAt: PAST(3),
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900019",
    requesterEmail: "carol@example.com",
    ownerEmail: "david.lee@example.com",
    category: "Network",
    relatedSystem: "Campus Wi-Fi",
    summary: "Network outage in postgraduate lab — no Wi-Fi for 48 hours",
    description: "The postgraduate research lab has had no Wi-Fi connectivity for 48 hours. Wired connections work. Multiple students and faculty are affected. The issue started after an overnight maintenance window.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.IN_PROGRESS,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900020",
    requesterEmail: "david@example.com",
    ownerEmail: "michael.brown@example.com",
    category: "Software",
    relatedSystem: "Student Information System",
    summary: "SIS course registration opens a blank page",
    description: "The course registration page in SIS loads as a blank white page. Clearing browser cache and trying a different browser does not help. Registration deadline is in three days.",
    requestedPriority: Priority.LOW,
    itPriority: Priority.LOW,
    currentStatus: TicketStatus.WAITING_FOR_REQUESTER,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900021",
    requesterEmail: "alice@example.com",
    ownerEmail: "sarah.johnson@example.com",
    category: "Account and Access",
    relatedSystem: "Email",
    summary: "Shared mailbox permissions not propagating after role change",
    description: "After a staff role change, the shared departmental mailbox permissions have not updated. The affected user cannot send on behalf of the shared mailbox despite the role change being confirmed in Active Directory.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.RESOLVED,
    requesterResolvedAt: null,
    resolutionSummary: "Mailbox permissions cache flushed and delegation rules reapplied. Permissions now propagated correctly. User confirmed full access to shared mailbox.",
    resolvedAt: PAST(3),
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900022",
    requesterEmail: "bob@example.com",
    ownerEmail: null,
    category: "Hardware",
    relatedSystem: "Campus Wi-Fi",
    summary: "Monitor flickering at random intervals",
    description: "The external monitor connected via HDMI flickers briefly at random intervals — approximately once every 5 to 10 minutes. The cable and monitor have been tested on another machine without issue.",
    requestedPriority: Priority.MEDIUM,
    itPriority: Priority.MEDIUM,
    currentStatus: TicketStatus.OPEN,
    requesterResolvedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900023",
    requesterEmail: "carol@example.com",
    ownerEmail: "michael.brown@example.com",
    category: "Software",
    relatedSystem: "Learning Management System",
    summary: "LMS gradebook calculation error for weighted assignments",
    description: "The LMS gradebook is computing incorrect weighted averages for courses with multiple assignment categories. The final grade displayed does not match the manual calculation. Affects several active courses.",
    requestedPriority: Priority.LOW,
    itPriority: Priority.LOW,
    currentStatus: TicketStatus.IN_PROGRESS,
    requesterResolvedAt: PAST(1),
    resolutionSummary: null,
    resolvedAt: null,
    closedAt: null,
  },
  {
    ticketNumber: "TKT-2026-900024",
    requesterEmail: "david@example.com",
    ownerEmail: "david.lee@example.com",
    category: "Software",
    relatedSystem: "Library Database",
    summary: "Library database export to CSV truncates long abstracts",
    description: "When exporting search results to CSV from the library database, article abstracts longer than 255 characters are silently truncated. This corrupts research data exports used for systematic reviews.",
    requestedPriority: Priority.HIGH,
    itPriority: Priority.HIGH,
    currentStatus: TicketStatus.CLOSED,
    requesterResolvedAt: null,
    resolutionSummary: "Root cause identified as a legacy column length constraint in the export module. Constraint raised to 4000 characters and CSV export retested with long abstracts. Data integrity confirmed.",
    resolvedAt: PAST(8),
    closedAt: PAST(2),
  },
];

// ---------------------------------------------------------------------------
// Comment / note seed data (only for seeded tickets that have none yet)
// ---------------------------------------------------------------------------

type CommentSeed = { ticketNumber: string; authorEmail: string; body: string };

const SEEDED_COMMENTS: CommentSeed[] = [
  {
    ticketNumber: "TKT-2026-900003",
    authorEmail: "carol@example.com",
    body: "Hi, just checking in — has there been any progress on the VPN issue? I have been unable to work remotely for three days now.",
  },
  {
    ticketNumber: "TKT-2026-900005",
    authorEmail: "michael.brown@example.com",
    body: "We have identified the root cause and are applying a patch to the SIS server. Please expect a brief maintenance window this afternoon. We will update you once the patch is applied.",
  },
  {
    ticketNumber: "TKT-2026-900009",
    authorEmail: "alice@example.com",
    body: "Thank you for resolving this so quickly. I now have full access to my email account.",
  },
  {
    ticketNumber: "TKT-2026-900013",
    authorEmail: "alice@example.com",
    body: "The signature issue appeared again after today's client update. The fix from last week did not persist.",
  },
  {
    ticketNumber: "TKT-2026-900018",
    authorEmail: "sarah.johnson@example.com",
    body: "We have reproduced the timer issue in a test environment. A hotfix is being prepared and will be deployed in the next maintenance window.",
  },
  {
    ticketNumber: "TKT-2026-900021",
    authorEmail: "alice@example.com",
    body: "Confirmed — I now have full access to the shared mailbox and can send on behalf of the department. Thank you for the quick resolution.",
  },
];

const SEEDED_NOTES: CommentSeed[] = [
  {
    ticketNumber: "TKT-2026-900003",
    authorEmail: "michael.brown@example.com",
    body: "Checked the VPN gateway logs — authentication timeout is caused by a misconfigured RADIUS server entry after the network reconfiguration last Friday. Escalating to the network team.",
  },
  {
    ticketNumber: "TKT-2026-900007",
    authorEmail: "sarah.johnson@example.com",
    body: "Post-migration index rebuild is still running on the library catalogue server. ETA two more hours. Waiting for requester to confirm whether search is functional in read-only mode.",
  },
  {
    ticketNumber: "TKT-2026-900009",
    authorEmail: "david.lee@example.com",
    body: "Password reset link was blocked by an overly aggressive spam filter rule added last week. Rule has been adjusted. Monitoring the mail queue to ensure future reset links are delivered.",
  },
  {
    ticketNumber: "TKT-2026-900013",
    authorEmail: "sarah.johnson@example.com",
    body: "Root cause: the email client update overwrites the signature registry key. The registry fix we applied last week is not persistent across updates. Need to push a group policy to lock the key.",
  },
  {
    ticketNumber: "TKT-2026-900018",
    authorEmail: "michael.brown@example.com",
    body: "Timer bug is a JavaScript timezone offset issue in the LMS quiz module. PR raised in the vendor issue tracker. Temporary workaround: set quiz time zone to UTC in course settings.",
  },
  {
    ticketNumber: "TKT-2026-900021",
    authorEmail: "sarah.johnson@example.com",
    body: "AD role propagation delay confirmed — Exchange Online takes up to 4 hours to sync delegation changes. Forced a delta sync to apply immediately. Documented in the runbook.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertUser(data: {
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordHash: string;
}): Promise<number> {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, passwordHash: true },
  });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        mustChangePassword: data.mustChangePassword,
        passwordHash: data.passwordHash,
      },
      select: { id: true },
    });
    return created.id;
  }

  // BR-62: never overwrite an existing passwordHash or mustChangePassword
  if (existing.passwordHash === null) {
    await prisma.user.update({
      where: { email: data.email },
      data: {
        passwordHash: data.passwordHash,
        mustChangePassword: data.mustChangePassword,
      },
    });
  }

  return existing.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // --- Categories ---
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories.`);

  // --- Related Systems ---
  for (const s of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name: s.name },
      update: { isActive: s.isActive },
      create: s,
    });
  }
  console.log(`Seeded ${RELATED_SYSTEMS.length} related systems.`);

  // --- Hash the initial password once ---
  const initialHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  // --- Requesters (migrated from Lab 2; hash only if currently null) ---
  let createdRequesters = 0;
  let updatedRequesters = 0;
  for (const r of REQUESTERS) {
    const before = await prisma.user.findUnique({
      where: { email: r.email },
      select: { id: true, passwordHash: true },
    });
    await upsertUser({
      ...r,
      role: Role.REQUESTER,
      mustChangePassword: true,
      passwordHash: initialHash,
    });
    const after = await prisma.user.findUnique({
      where: { email: r.email },
      select: { passwordHash: true },
    });
    if (!before) createdRequesters++;
    else if (before.passwordHash === null && after?.passwordHash !== null) updatedRequesters++;
  }
  console.log(
    `Requesters: ${createdRequesters} created, ${updatedRequesters} passwords assigned ` +
    `(${REQUESTERS.length - createdRequesters - updatedRequesters} already had passwords).`
  );

  // --- IT Staff ---
  let staffCreated = 0;
  for (const s of STAFF) {
    const before = await prisma.user.findUnique({ where: { email: s.email }, select: { id: true } });
    await upsertUser({
      ...s,
      role: Role.IT_STAFF,
      mustChangePassword: false,
      passwordHash: initialHash,
    });
    if (!before) staffCreated++;
  }
  console.log(`Seeded ${STAFF.length} IT staff accounts (${staffCreated} new).`);

  // --- Administrator ---
  const adminBefore = await prisma.user.findUnique({ where: { email: ADMIN.email }, select: { id: true } });
  await upsertUser({
    ...ADMIN,
    role: Role.ADMIN,
    mustChangePassword: false,
    passwordHash: initialHash,
  });
  console.log(`Seeded admin account${adminBefore ? " (already existed)" : " (new)"}.`);

  // --- Build lookup maps ---
  const userByEmail = new Map<string, number>();
  const allSeedEmails = [
    ...REQUESTERS.map(r => r.email),
    ...STAFF.map(s => s.email),
    ADMIN.email,
  ];
  for (const email of allSeedEmails) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) userByEmail.set(email, u.id);
  }

  const catByName = new Map<string, number>();
  for (const cat of await prisma.category.findMany({ select: { id: true, name: true } })) {
    catByName.set(cat.name, cat.id);
  }

  const sysByName = new Map<string, number>();
  for (const sys of await prisma.relatedSystem.findMany({ select: { id: true, name: true } })) {
    sysByName.set(sys.name, sys.id);
  }

  // --- Seeded Tickets (upsert by ticketNumber; never overwrite existing data) ---
  let ticketsCreated = 0;
  for (const t of SEEDED_TICKETS) {
    const requesterId = userByEmail.get(t.requesterEmail);
    const ownerId = t.ownerEmail ? userByEmail.get(t.ownerEmail) ?? null : null;
    const categoryId = catByName.get(t.category);
    const relatedSystemId = sysByName.get(t.relatedSystem);

    if (!requesterId || !categoryId || !relatedSystemId) {
      console.warn(`  Skipping ${t.ticketNumber}: missing lookup for requester/category/system.`);
      continue;
    }

    const existing = await prisma.ticket.findUnique({
      where: { ticketNumber: t.ticketNumber },
      select: { id: true },
    });
    if (!existing) {
      await prisma.ticket.create({
        data: {
          ticketNumber: t.ticketNumber,
          requesterId,
          ownerId,
          categoryId,
          relatedSystemId,
          summary: t.summary,
          description: t.description,
          requestedPriority: t.requestedPriority,
          itPriority: t.itPriority,
          currentStatus: t.currentStatus,
          requesterResolvedAt: t.requesterResolvedAt,
          resolutionSummary: t.resolutionSummary,
          resolvedAt: t.resolvedAt,
          closedAt: t.closedAt,
        },
      });
      ticketsCreated++;
    }
  }
  console.log(`Seeded ${ticketsCreated} new reserved tickets (${SEEDED_TICKETS.length - ticketsCreated} already existed).`);

  // --- Public Comments (only for seeded tickets with no comments yet) ---
  const ticketByNumber = new Map<string, number>();
  for (const t of await prisma.ticket.findMany({
    where: { ticketNumber: { in: SEEDED_TICKETS.map(t => t.ticketNumber) } },
    select: { id: true, ticketNumber: true },
  })) {
    ticketByNumber.set(t.ticketNumber, t.id);
  }

  let commentsCreated = 0;
  for (const c of SEEDED_COMMENTS) {
    const ticketId = ticketByNumber.get(c.ticketNumber);
    const authorId = userByEmail.get(c.authorEmail);
    if (!ticketId || !authorId) continue;

    const count = await prisma.publicComment.count({ where: { ticketId } });
    if (count === 0) {
      await prisma.publicComment.create({ data: { ticketId, authorId, body: c.body } });
      commentsCreated++;
    }
  }
  console.log(`Seeded ${commentsCreated} public comments.`);

  // --- Internal Notes (only for seeded tickets with no notes yet) ---
  let notesCreated = 0;
  for (const n of SEEDED_NOTES) {
    const ticketId = ticketByNumber.get(n.ticketNumber);
    const authorId = userByEmail.get(n.authorEmail);
    if (!ticketId || !authorId) continue;

    const count = await prisma.internalNote.count({ where: { ticketId } });
    if (count === 0) {
      await prisma.internalNote.create({ data: { ticketId, authorId, body: n.body } });
      notesCreated++;
    }
  }
  console.log(`Seeded ${notesCreated} internal notes.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
