---
name: storm-data-management
description: >-
  Reference and guidance for Content Guru storm® Data Management — the storm
  module for storing and querying customer/business data in tables and using it
  from storm flows (DTA/Service Designer). Use when a user asks about storm Data
  Management tables, fields, records, queries (Select/Insert/Update), importing
  or exporting data, the "Data Management" or "Fetch Query Result" flow action
  cells, or how Data Management relates to storm CKS and storm INTEGRATE.
---

# Content Guru storm® Data Management

> **Source & accuracy note.** The authoritative documentation lives in the gated
> help portal at
> `https://www.stormportal.us/datamanagement/assets/help/welcome.htm`
> (mirror: `https://www.timeforstorm.com/datamanagement`). That portal is behind
> a login/WAF and could not be crawled when this skill was authored, so the
> content below is assembled from **publicly available, high-level sources** and
> is intentionally marked where details are uncertain. Treat exact field names,
> menu labels, and screen-by-screen steps as **approximate** and verify against
> the live help/portal before relying on them. See "Gaps to fill" at the end.

## What storm Data Management is

storm® Data Management™ is a module within Content Guru's **storm** cloud
Customer Experience (CX) platform. It lets an organisation store structured
business and customer data in **tables** inside the storm cloud and then
**query** that data — typically so storm contact-handling flows can read from and
write to it in real time (for example, looking up a caller's account details,
recording the outcome of an interaction, or driving routing decisions).

It is the data-storage and query layer that storm **flows** lean on. In storm's
flow designer (DTA / Service Designer), the **Data Management** action cell and
the **Fetch Query Result** action cell are the primary ways a flow interacts with
these tables.

Data Management is closely related to, but distinct from:

- **storm CKS®** (Customer Knowledge System) — Content Guru's Customer Data
  Platform / data-aggregation overlay that presents data from many systems of
  record in one view.
- **storm INTEGRATE** — the integration layer (off-the-shelf and custom API
  integrations, the storm Exchange) used to push/pull data between storm and
  external systems (CRMs, databases, web services).

Data Management is the place to keep data *natively inside storm*; CKS/INTEGRATE
are about surfacing and connecting data that lives elsewhere.

## Core concepts

| Concept | Meaning |
| --- | --- |
| **Table** | A named, structured store of rows, conceptually like a database table. You create tables to hold a particular kind of record (e.g. customers, cases, lookup values). |
| **Field / Column** | A typed attribute on a table (e.g. account number, name, status). |
| **Record / Row** | A single entry in a table. |
| **Query** | A saved/defined statement that operates on a table. The three core operations are **Select**, **Insert**, and **Update**. |

### Query operations

When you build a query against a Data Management table you choose one of:

- **Select** — retrieve information from a table (read). A Select query is what
  you reference from a **Fetch Query Result** action cell in a flow to pull data
  into the running script.
- **Insert** — add new rows to a table.
- **Update** — overwrite information in existing rows.

You can either **create a new query statement** or **use an existing one**. In a
flow, a saved Select query is referenced by name so the flow can fetch its
result.

## How it's used from storm flows

A typical pattern in a storm flow (Service Designer / DTA):

1. A flow reaches a **Data Management** action cell.
2. The cell is configured with a target **table** and a **query** (Select /
   Insert / Update), either newly created or an existing saved query.
3. For a **Select**, the flow then uses a **Fetch Query Result** action cell to
   read the returned rows/fields into flow variables, which can drive routing,
   prompts, screen-pops, or further logic.
4. For **Insert/Update**, the flow writes the configured values back to the
   table (e.g. logging an interaction outcome).

Because the data lives in the storm cloud alongside the contact-handling engine,
these lookups and writes happen inline during a live interaction.

## Common tasks (high level)

> Exact UI steps are not reproduced here because they could not be verified
> against the live help. The list below reflects the capabilities the module is
> documented to provide.

- **Create and manage tables** — define a table and its fields/columns.
- **Add and edit records** — manually maintain rows, or have flows write them.
- **Import data** — bulk-load records into a table (e.g. from a file/spreadsheet).
- **Export data** — extract records out of a table.
- **Define queries** — build reusable Select/Insert/Update statements.
- **Reference queries from flows** — wire Select queries to Fetch Query Result
  cells, and Insert/Update queries to Data Management cells.
- **Manage access** — control which users/roles can view or modify tables
  (storm portals are role/permission based).

## Glossary of related storm terms

- **storm®** — Content Guru's omni-channel cloud CX platform.
- **DTA (Desktop Task Assistant)** — agent desktop that can surface third-party
  and storm data during interactions.
- **Service Designer / Flow** — the visual tool for building call/contact
  handling logic out of **action cells**.
- **Action cell** — a single configurable step in a flow (e.g. *Data
  Management*, *Fetch Query Result*).
- **CKS® (Customer Knowledge System)** — storm's Customer Data Platform.
- **storm INTEGRATE** — integration layer / API connectors and the storm
  Exchange.

## When to use this skill

Use it to orient a user or yourself on storm Data Management concepts and the
flow-integration pattern, to explain the Select/Insert/Update query model, or to
point at the correct action cells. For exact, current procedures, **defer to the
official help portal**.

## Gaps to fill (verify against the live help)

The following were **not** verifiable from public sources and should be filled in
from the authoritative help when access is available:

- The full Data Management help table of contents ("all pages") and topic names.
- Exact table/field creation UI, supported field/data types and limits.
- Exact query-builder syntax and any filtering/parameter/WHERE-style options.
- Step-by-step **import** and **export** procedures and supported file formats.
- Scheduling / automation features (if any).
- Permissions/roles model specific to Data Management.
- Limits (table count, row count, size) and data-retention behaviour.

### How to complete this skill later

When the help portal is reachable (host added to the environment's network
egress allowlist *and* a way past the site WAF, e.g. an authenticated/exported
copy), crawl from
`https://www.stormportal.us/datamanagement/assets/help/welcome.htm#t=Welcome%2FWelcome.htm`,
walk every TOC topic, and replace the "high level" sections above with verified,
step-by-step content and screenshots/field names.
