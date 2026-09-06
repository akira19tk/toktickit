# Lab 2 API Specification — TokTickIT Requester Ticketing MVP

All endpoints are prefixed `/api`. The current Development Requester context is sent on
every request as header `x-requester-id: <int>`. This is a Lab 2 testing convention only
(see `specification.md` BR-03, BR-26) — it will be replaced by real session/token identity
in Lab 3.

## 1. GET /api/dev-requesters

Purpose: list active Development Requesters for the Selection screen.

- **Request**: no params.
- **Response 200**:
```json
[
  { "id": 1, "name": "Jennifer Anderson", "email": "jennifer@example.com" },
  { "id": 2, "name": "Michael Brown", "email": "michael@example.com" }
]
```
- Inactive Requesters are excluded server-side (BR-04).
- **Response 500**: `{ "error": "Unable to load requesters" }` on DB failure.

## 2. GET /api/categories

Purpose: list active ticket categories (Lab 1 carryover).

- **Response 200**: `[{ "id": 1, "name": "Account and Access" }, ...]`

## 3. GET /api/related-systems

Purpose: list active related systems.

- **Response 200**: `[{ "id": 1, "name": "Email" }, { "id": 2, "name": "Campus Wi-Fi" }, ...]`

## 4. POST /api/tickets

Purpose: create one validated Ticket for the current Requester, with optional attachments.

- **Request** (`multipart/form-data` to support file attachments):
```
categoryId: 2
relatedSystemId: 5
summary: "Laptop battery drains quickly"
description: "Battery drains fast even when idle..."
requestedPriority: "MEDIUM"
attachments: [file, file, ...]   // optional, 0-5 files
```
- **Validation rules**:
  - `categoryId`, `relatedSystemId` must reference existing active records → else `400`
  - `summary`: required, trimmed, 5–120 chars → else `400`
  - `description`: required, trimmed, 10–2000 chars → else `400`
  - `requestedPriority`: required, one of `LOW|MEDIUM|HIGH` → else `400`
  - each attachment: type in `jpg,jpeg,png,webp,pdf`, size ≤5MB, total active ≤5 → else
    that file is rejected (see error shape below); if all core fields are valid, the
    Ticket is still created (BR-15)
- **Response 201** (success, all attachments ok):
```json
{
  "id": 41,
  "ticketNumber": "TKT-2026-000041",
  "requesterId": 3,
  "categoryId": 2,
  "relatedSystemId": 5,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drains fast even when idle...",
  "requestedPriority": "MEDIUM",
  "currentStatus": "NEW",
  "createdAt": "2026-09-06T10:15:00Z",
  "attachments": [
    { "id": 101, "fileName": "screenshot.png", "sizeBytes": 204800 }
  ],
  "attachmentErrors": []
}
```
- **Response 201** (ticket created, one attachment rejected — BR-15):
```json
{
  "id": 42,
  "ticketNumber": "TKT-2026-000042",
  "...": "...",
  "attachments": [],
  "attachmentErrors": [
    { "fileName": "video.mov", "reason": "Unsupported file type" }
  ]
}
```
- **Response 400** (field validation failure):
```json
{ "errors": { "summary": "Summary must be 5-120 characters" } }
```

## 5. GET /api/tickets

Purpose: paginated, searchable, filterable, sortable list of the current Requester's own
Tickets.

- **Query params**:
  - `search` — string, matched against Ticket Number and Summary (case-insensitive substring)
  - `category` — Category name or id
  - `priority` — `LOW|MEDIUM|HIGH`
  - `status` — ticket status (only `NEW` exists in Lab 2)
  - `sortBy` — `createdAt` (default) | `ticketNumber`
  - `sortDir` — `asc` | `desc` (default `desc`)
  - `page` — integer ≥1, default 1 (invalid → 1)
  - `pageSize` — integer 1–50, default 10 (invalid/out-of-range → 10)
- **Response 200**:
```json
{
  "data": [
    {
      "id": 41,
      "ticketNumber": "TKT-2026-000041",
      "createdAt": "2026-09-06T10:15:00Z",
      "summary": "Laptop battery drains quickly",
      "category": "Hardware",
      "requestedPriority": "MEDIUM",
      "currentStatus": "NEW",
      "updatedAt": "2026-09-06T10:15:00Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "totalCount": 42, "totalPages": 5 }
}
```
- Only Tickets where `requesterId` matches `x-requester-id` are ever returned (BR-07).

## 6. GET /api/tickets/:id

Purpose: retrieve one Ticket owned by the current Requester.

- **Response 200**: full Ticket object (same shape as POST response) including
  `attachments` (active only) with `id, fileName, sizeBytes, uploadedAt`.
- **Response 404**: `{ "error": "Ticket not found" }` — returned both when the id truly
  does not exist and when it belongs to a different Requester (BR-25; no distinction is
  leaked to the client).

## 7. POST /api/tickets/:id/attachments

Purpose: add an Attachment to an existing, owned Ticket.

- **Request**: `multipart/form-data`, single `file` field.
- **Response 201**: `{ "id": 102, "fileName": "log.pdf", "sizeBytes": 51200, "uploadedAt": "..." }`
- **Response 400**: `{ "error": "File exceeds 5MB limit" }` or `"Unsupported file type"` or
  `"Ticket already has 5 active attachments"`
- **Response 404**: Ticket not found / not owned by current Requester.

## 8. GET /api/tickets/:id/attachments/:attachmentId/download

Purpose: download an active Attachment.

- **Response 200**: binary file stream with correct `Content-Type` and
  `Content-Disposition: attachment; filename="..."`.
- **Response 404**: Attachment or Ticket not found / not owned.
- **Response 410 Gone**: Attachment exists but has been soft-removed (BR-16).

## 9. DELETE /api/tickets/:id/attachments/:attachmentId

Purpose: soft-remove an owned, currently-active Attachment.

- **Request body**: `{ "reason": "Uploaded wrong file" }` — `reason` required, ≥3 chars
  (BR-18) → else `400`.
- **Response 200**:
```json
{ "id": 101, "removedAt": "2026-09-06T11:00:00Z", "removalReason": "Uploaded wrong file" }
```
- **Response 404**: Ticket/Attachment not found or not owned.
- **Response 409 Conflict**: Attachment already removed.

## 10. HTTP Status Summary

| Status | Meaning in this API |
|---|---|
| 200 | Successful retrieval, download, or soft-removal |
| 201 | Ticket or Attachment successfully created |
| 400 | Validation failure (field errors, bad file type/size, missing reason) |
| 404 | Resource does not exist, or exists but is not owned by the current Requester |
| 409 | Conflicting state (e.g. attachment already removed) |
| 410 | Resource existed but has been soft-removed (download only) |
| 500 | Unexpected server/database error — response body never leaks stack traces |
