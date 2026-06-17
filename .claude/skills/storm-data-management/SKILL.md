---
name: storm-data-management
description: >-
  Verified reference for Content Guru storm® DATA MANAGEMENT — the storm STUDIO
  application for building data tables and table views, querying them, and
  supplying/enriching contact lists for storm OUTBOUND dialler campaigns. Use
  when a user asks about storm Data Management tables, columns/data types,
  generic (system-defined) columns, table views (standard vs outbound campaign),
  queries (Select/Update/Delete), filters and criteria, searching tables,
  Do-Not-Call/excluding numbers, triggered actions, importing data (manual,
  scheduled, ad hoc FTP, third-party CRM), exporting (ad hoc/scheduled, email/
  FTP/sFTP), OUTBOUND campaign behaviour (retries, callbacks, dynamic filtering,
  feeding data back), the contact list layout, multiple database instances, or
  how Data Management queries are used by the FLOW Data Management action cell.
---

# Content Guru storm® DATA MANAGEMENT

Verified against the official **storm DATA MANAGEMENT User Guide**, Doc revision
3.56 / product version 1.00.53 (15 Jun 2026), classification Public. Content Guru
is part of the Redwood Technologies Group. For exhaustive step-by-step detail,
field tables, and edge cases, read **`reference.md`** alongside this file.

## What it is

storm DATA MANAGEMENT is a browser-based application inside **storm STUDIO**. It
lets you create **tables** of data (typically imported from a CSV exported from a
CRM or other system), build filtered **table views** over them, run **queries**,
and import/export data. Its primary purpose is to create and enrich **contact
lists for storm CONTACT:OUTBOUND dialler campaigns**, but tables/views are also
used for general inbound/outbound call handling and reporting.

It is licensed (not all users see every feature) and accessed via a supported
browser (Edge, Firefox, Chrome). Audience: people who design/configure telephony
services using customer data; assumes basic database + telephony knowledge.

### Access

Log in to STUDIO, then **Service Configuration > Data Management**. Regional
STUDIO URLs:

| Region | URL |
| --- | --- |
| United Kingdom | `https://www.timeforstorm.com/stormstudio` (ESP: `https://www.stormesp.com/stormstudio`) |
| United States | `https://www.stormportal.us/stormstudio` |
| Europe | `https://www.timeforstorm.eu/stormstudio` |
| Japan | `https://www.connectstorm.jp/stormstudio` |

## Core concepts

- **Table** — a structured store of rows/columns held in the storm cloud. Column
  count, order, and data types must match the CSV used to import data. Data
  types: **String** (≤256 chars), **Integer**, **Float**, **Date/Time** (stored
  as `YYYY-MM-DD HH:MM:SS`), **Boolean** (`TRUE/FALSE` or `1/0`). Use **String**
  for telephone numbers (to preserve leading zeros).
- **Generic / system-defined columns** — predefined columns (Row ID, Last
  result, Date last processed, Processing attempts, Scheduled callback?, Callback
  date/time, Callback agent, Row status/sub-status, Expiry, etc.) auto-populated
  by OUTBOUND as a campaign runs. Available to any table/view without a matching
  CSV column. (Full table in `reference.md`.)
- **Table view** — a subset (or all) of a table's columns, with filters. Two
  types:
  - **Standard** — for viewing/exporting/reporting.
  - **Outbound campaign** — also usable as a **contact list**; its columns are
    mapped to OUTBOUND contact-list fields and the view is assigned to a campaign
    in STUDIO. Must map ≥1 column to the **Number** field; up to **15** columns
    can map to Number (for multiple phone numbers per contact).
- **Query** — three types: **Select** (retrieve/display), **Update** (batch
  update matched rows), **Delete** (delete matched rows). You pick columns and
  set criteria in a **WHERE** panel; criteria can be fixed or variable (set at
  run time). Saved queries become available to the **FLOW Data Management action
  cell**.
- **Filters & criteria** — applied per column; combined via a **filter formula**
  using AND/OR and brackets (AND precedes OR without brackets). Operators depend
  on data type. Filters (unlike query criteria) also support `IN Table Column` /
  `NOT IN Table Column` and a Current Date/Time option. (Operator lists in
  `reference.md`.)
- **DNC (Do Not Call)** — a manually created table of numbers not to be dialled;
  excluded from contact lists via a `NOT IN Table Column` filter on the Number
  column. Numbers can be auto-added via **Triggered Actions** keyed on completion
  codes.
- **Contact list layout** — standard OUTBOUND fields: **Name** (`@Name`),
  **Number** (`@Number`), **Email Address** (`@Email`), **Misc 1–20**
  (`@Misc1`–`@Misc20`). Misc9/Misc10 are reserved for agent name / call result.

## How it relates to storm FLOW

If your org uses storm **FLOW**, its **Data Management action cell** can run
saved Data Management queries to retrieve/update/delete rows, and can use data
from an external source (web service / custom API) to add or update rows. Before
amending or deleting a query, check whether any FLOW script uses it. (See the Web
Services Reference Guide for the Data Management REST API.)

## The workspace (key buttons)

Tables · Table Views · Table Queries · Table Search · **Settings** (CSV export
scheduler, Automatic Imports, Scheduled Exports, **Triggered Actions**, Database
Instances, feed-back config) · Help · Logout · **Save As** (new) · **Save**.

## Typical OUTBOUND lifecycle

1. Create a CSV outside storm; create a matching **table**; import the CSV.
2. Create an **outbound campaign table view**; select columns and map them to
   contact-list fields (at least Number). Add generic columns to capture results.
3. Apply **filters** (e.g. `NOT IN` the DNC table; age/location/recency) and set
   **order**.
4. Provision the campaign in STUDIO against the table view.
5. As it runs, generic columns are written back in batches (allow **5–10 min**;
   use **Refresh**). Use **dynamic filtering**, retries, callbacks, and
   triggered actions to manage and enrich the data live.
6. **Export** the enriched view (ad hoc or scheduled; email/FTP/sFTP) for
   reporting or re-targeting (e.g. re-run only 'busy'/'no answer' records).

## Key limits & gotchas (verified)

- **Imports are capped at 1,000,000 rows per table.** Once reached, no more rows
  can be imported.
- **String columns: 256 char max.** CSV must be **UTF-8**, `.CSV` extension,
  comma-separated, CR/LF line endings, no inter-field spaces, quote fields
  containing commas.
- **You cannot delete a column** once data is imported or once the column is used
  in a table view. You can still add new columns.
- **You cannot delete a table** that has table views — delete the views first.
  Can't delete a view referenced by a provisioned service/campaign — decommission
  it first.
- **Primary keys** make values unique and enable update/delete-on-match imports,
  but slow imports.
- **A table view can be used by only one campaign at a time** (but two
  non-overlapping campaigns can share a table).
- For telephone-number columns, scheduled imports validate 10–11 chars starting
  with `0`; ask support to extend this to manual imports / barred-prefix checks.
- Excel strips leading zeros from numbers — import exported CSVs as **Text** for
  phone columns (see `reference.md`).

## See also

`reference.md` — full procedures and field tables for: data types & table
creation; the complete generic-column list; table views & column mapping;
multiple numbers; queries (build/run/edit); searching tables; excluding numbers
& triggered actions; importing (manual primary-key matrix, scheduled `.CSV/
.REPLACE/.UPDATE/.UPDATEONLY/.DELETE/.DELETEONLY` extensions, ad hoc FTP,
third-party CRM with SQL, results/summary/failure files and result codes);
exporting (naming, scheduled, distribution); OUTBOUND retries/callbacks/dynamic
filtering/feeding data back; criteria operators per data type; contact list
layout; multiple database instances.
