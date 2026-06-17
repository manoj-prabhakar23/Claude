# storm DATA MANAGEMENT — Detailed Reference

Companion to `SKILL.md`. Verified against the storm DATA MANAGEMENT User Guide,
Doc rev 3.56 / product version 1.00.53 (15 Jun 2026), classification Public.

---

## 1. Data types

| Type | Notes |
| --- | --- |
| String | Alphanumeric, **max 256 chars**. Use for telephone numbers. |
| Integer | Any whole number. |
| Float | Any decimal number. |
| Date/Time | Many input formats accepted; converted on import to `YYYY-MM-DD HH:MM:SS`. |
| Boolean | `TRUE`/`FALSE` or `1`/`0`. |

**CSV requirements for import:** UTF-8, `.CSV` extension; fields comma-separated;
each line ends CR/LF; no spaces between fields (allowed inside strings); wrap
comma-containing fields in double quotes. Columns/types/order must match the
table. If a column disallows NULLs, every row must have a value. Don't include
headings in CSVs for tables that contain generic columns (headings import as
records); if a generic column sits between data columns, add an empty column at
that position in the CSV.

---

## 2. Creating tables

Three ways to start a table: **Tables > Create New Table**; or on the blank
workspace click **Add Column**; or select an existing table and **Save As**.

**Add a column:** Add Column → leave **User defined column** (use **System
defined column** for generic columns) → pick **Data type** → optional **Default
value** (applied to NULLs on import) → optional **Primary Key** (unique; slows
import) → optional **Allow empty string** (permits NULLs; otherwise import errors
on NULL) → **OK**. The cross removes a column immediately.

**Editing/deleting:** Tables button → select (Search tables to filter). After
data import you cannot change column settings or delete columns containing data,
but can add columns. Can't delete a table that has table views (delete views
first); hovering shows a cross to delete, with confirmation.

**Import CSV into a table:** open the table → **Browse for import File** → select
file. Validation checks: UTF-8 + `.CSV`; correct column count; non-null fields
populated; strings ≤256; data matches each column type (scheduled imports also
validate phone columns = 10–11 chars starting `0`). Errors report offending
rows/columns; you can import only valid rows or fix CSV/layout and retry (save
layout changes first). Spaces-in-field produce a warning. **Imports capped at
1,000,000 rows.**

---

## 3. Generic (system-defined) columns

Predefined name + type, populated by OUTBOUND as a campaign runs (whether or not
present in the underlying table). Add via **Add Column > System Defined Column**.

| Column | Captures |
| --- | --- |
| Row ID | Unique record identifier; range −2,147,483,647…2,147,483,647 excluding 0. |
| Last result | Result of last attempt: agent's completion code, or system value (e.g. 'Busy', 'Preview rejected by agent'). |
| Date last processed | Date/time the contact was last processed by OUTBOUND. |
| Processing attempts | Number of times processed during this campaign. |
| Scheduled callback? | True/False — whether a scheduled callback is required. |
| Callback date/time | When the callback is scheduled. |
| Callback agent | Whether callback goes to the requesting agent or any campaign agent. |
| Revised callback date/time | New date/time generated if a callback fails (original retained for reporting). |
| Created date/time | When the import that created the record began (cannot be overwritten). |
| Row status / Row sub status | Lifecycle state (see below). |
| Retry date/time | Earliest scheduled retry per the retry profile. |
| Expiry date/time | After this, record not called again except agent-scheduled callbacks (set by import, not storm). |

**Row status / sub-status values:**
- **Not Dialed** → sub blank (not yet dialled this campaign).
- **Active** (selected & locked): Not Dialed Active / Retry Active / Failure
  Active / Callback Active.
- **In Progress**: Scheduled callback; Retry and Failure call result; Retry call
  result; Failure call result.
- **Complete**: Maximum calls exceeded; Call result not in retry profile; Retry
  criteria not met.
- **Expired** → sub blank (Expiry date/time was in the past at processing time).

Notes: `szMisc9`/`szMisc10` exist only for backwards compatibility — don't use.
Generic columns reflect the most recent call and are overwritten each call; with
multiple numbers per contact, set them up per number.

---

## 4. Table views

Two types — **Standard** and **Outbound campaign** — chosen via the **Table view
for** drop-down (set 'outbound campaign' **before** adding columns; leave blank
for standard). Create via **Table Views > Create New Table View**, or **Save As**
from an existing view.

**Standard:** pick the base table (left list), tick columns in display order;
name in **View Name**; **Save View**. If the table holds data the view populates
on save.

**Outbound campaign:** as standard, but each ticked column opens a mapping window
to map it to a contact-list field (Name/Number/Email/Misc1–20), or 'no mapping'.
**Must map ≥1 column to Number.** Up to **15** columns can map to Number; all
other fields are one-to-one. After saving, the view appears in STUDIO's campaign
provisioning drop-down. **Refresh** updates generic-column values for an active
campaign.

**Multiple telephone numbers:** add Number-mapped columns in the order OUTBOUND
should try them. For each Numbers column, also add (and associate, via the
prompt) these generic columns as needed: **Last result**, **Date last
processed**, **Processing attempts**. Recommend including at least Last result so
failure completion codes can drive trying the next number.

**Filters & filter formula:** click **Filters** at the bottom → click a column →
set conditions (window varies by data type; see §9). Filters get numbers; combine
in **Filter formula** with AND/OR/brackets (AND > OR without brackets). Filters
may apply to any underlying column, not just displayed ones. Save View applies
them (and updates the contact list for outbound views). With multiple numbers:
Last result / Date last processed reference the most recent attempt; Processing
attempts references total attempts across all numbers.

**Ordering:** Order panel → click **Order** → pick column(s) to sort by → Save
View. Order determines the sequence records are taken into the campaign (default
= CSV import order). OUTBOUND processes in batches (batch size × background
processes); order within a batch is random; tried/untried percentage splits
further affect selection.

**Editing/deleting views:** Table Views → select. Can add/delete columns, change
filters, change mappings. Can't delete a view referenced by a provisioned
service/campaign — decommission first.

---

## 5. Queries

Types: **Select** (retrieve/display), **Update** (batch update matched rows),
**Delete** (delete matched rows). Create via **Table Queries > Create New Table
Query**, or **Save As**. Save at any point after choosing the table and first
column → unique name. Saved queries are usable by the FLOW Data Management action
cell.

**Build:** pick query type (drop-down) → pick table (left list) → **Select
columns** (Select: columns to display; Update: columns to update — generic
columns disabled; Delete: step not applicable). For per-number generic columns
(Last result / Date last processed / Processing attempts), choose the specific
instance. **Set criteria** in the **WHERE** panel: click WHERE, click a column,
set a **fixed** value (clear Filter value field) or **variable** value (select
Filter value field — prompts at run time, shown as `?`). See §9 for operators.

**Run** (can run without saving):
- **Select/Delete:** lists criteria; enter variable values; blank = search for
  NULL/blank. Retrieves & displays rows. Delete queries offer **View Dataset**
  (row count) before deleting; **Run Query** applies the delete.
- **Update:** pop-up with two lists — new values per updated column (blank =
  set NULL/blank, warns if disallowed) and criterion values. **View Dataset**
  shows affected count; **Run Query** applies.

After running you can **export** the result set (ad hoc only). **Edit/delete** via
Table Queries (Search Queries to filter). Before amending/deleting, check FLOW
usage.

---

## 6. Searching tables

**Table Search** button → type/select a table (partial name matches all
containing tables) → expand columns → select **one** column → if multiple tables
share that field name, choose to search all or just one → enter value →
**Search**. Only the first **20** results show. Select records (Select-all
supported), optionally enter a reason, then **Include** / **Exclude**.

Supporting columns: **Excluded?** (`0`=included, `1`=excluded from OUTBOUND) and
**Excluded Reason**. These can also be edited by exporting → editing CSV →
re-importing.

---

## 7. Excluding numbers from contact lists (DNC + Triggered Actions)

A **DNC** table (any name) holds numbers not to be dialled, created and populated
manually.

**Filter out DNC numbers:** create the campaign table view → apply a filter to
the underlying **Number** column with `NOT IN Table Column` referencing the DNC
table + its number column → OK → Save View. With multiple numbers, filter **each**
Number column.

**Auto-add to DNC via Triggered Actions:** Settings → **Triggered Actions** →
**Add Triggered Action** → name it → enter the **Completion Code** (must match
the completion code form exactly, incl. case/spaces; forms live under Contact >
Organizations > Completion Code Forms) → **Source Table** + **Source Column**
(the phone field) → for multi-number tables, optional **[Dialer Number Column]**
to use whichever number was dialled → **Destination Table** + **Destination
Column** (e.g. the DNC) → **Save**. A completion code can be used only once per
table. Edit/delete via the Triggered Action Name.

---

## 8. Importing data

Cap: **1,000,000 rows per table** (all methods). Four methods:

### 8a. Manually
Open table → Browse for import File → validate → **Import**.
- **No primary key:** clear **Replace existing data** to append; select it to
  clear-and-replace; **Go**.
- **Has primary key** (select only the listed option(s), clear the rest):
  - Clear & repopulate → **Replace existing data**.
  - Insert only unmatched, ignore matches → **Do not import duplicate rows**
    (Insert unmatched auto-selected).
  - Update matches, ignore unmatched → **Update duplicate rows** + clear **Insert
    unmatched rows**.
  - Update matches, insert unmatched → **Update duplicate rows** + **Insert
    unmatched rows**.
  - Delete matches, ignore unmatched → **Delete duplicate rows** + clear Insert
    unmatched.
  - Delete matches, insert unmatched → **Delete duplicate rows** + **Insert
    unmatched rows**.

### 8b. Scheduled CSV imports (set up by Content Guru)
Filename: `<optional_string><table_name>.<extension>` (table_name immediately
before the dot). Extensions:
- No primary key: `.CSV` (append) · `.REPLACE` (clear then load).
- With primary key: `.CSV` (insert unmatched, ignore matches) · `.REPLACE`
  (clear then load) · `.UPDATE` (update matches, insert unmatched) ·
  `.UPDATEONLY` (update matches, ignore unmatched) · `.DELETE` (delete matches,
  insert unmatched) · `.DELETEONLY` (delete matches, ignore unmatched).

### 8c. Ad hoc CSV imports via FTP (configured by Content Guru)
Files dropped on an FTP server, polled regularly. Name
`<prefix><table>.<extension>`; filename supports multibyte chars up to 3 bytes
(no 4-byte/emoji). Extensions `CSV/REPLACE/UPDATE/UPDATEONLY/DELETE/DELETEONLY`
mirror 8b (extension overrides the import-process setting). Configure via
Settings → **Automatic Imports** → **Add Automatic Import**: name; **Default
Import Action** (INSERT ONLY / UPDATE INSERT / UPDATE / REPLACE / DELETE INSERT /
DELETE); **Export Output File** (distribute results via Email or FTP/SFTP); **FTP
Location**; **Produce Results File** (`.RESULTS`), **Results Summary File**
(`.SUMMARY` — counts inserted/deleted/updated/ignored/failed), **Failure Results
File** (`.FAILURES`); **Automatic Import Enabled**.

**Results file row:** `<datamanagement row ID><import result ID><original row
data>` where row ID is +/- integer on success, 0 on failure. Result IDs: `1`
inserted · `2` updated · `3` deleted · `4` ignored · `110` failure (e.g. table
locked) · `111` invalid data · `112` invalid mapping (telephone format).

### 8d. Third-party CRM (scheduled, SQL-driven)
Create DATA MANAGEMENT tables matching the SQL result (same column count/order,
compatible types; matching names recommended). Settings → scheduled imports →
**Add Scheduled Import**: Schedule name; **Run every** (minutes/hours/days/
weeks) + **Run from** start date; **Integration** (per integrated product);
**Table**; **Query A** / **Query B** (+ **Join Clause** if both) — each query
≤20,000 chars, each WHERE ≤4,000 chars (validity is your responsibility);
**Schedule enabled**. On each run: existing record → update; new → insert;
unmatched existing rows untouched; generic columns may be overwritten. Salesforce
screen-pops supported. If the target table is in an active campaign, already-
extracted records use pre-import values and overwrite post-import values on
write-back.

---

## 9. Criteria / filter operators (Appendix 1)

For String/Integer/Float/Date-Time you can give a **fixed** value or reference a
column via **IN Table Column** / **NOT IN Table Column** (the column drop-down
lists only same-type columns). Note: `IN/NOT IN Table Column` and the **Current
Date/Time** option are **not** supported in *query* criteria (only view filters).

- **String:** Equal to, Not equal to, Starts with, Does not start with, Contains,
  Does not contain, Ends with, Does not end with; or IN / NOT IN table column.
- **Integer & Float:** Less than, Less than or equal to, Equal to, Not equal to,
  Greater than or equal to, Greater than; or IN / NOT IN table column.
- **Date/Time:** same comparison operators as Integer/Float; **Current Date/Time**
  checkbox or calendar (time optional); or IN / NOT IN table column.
- **Boolean:** True or False.

---

## 10. Exporting data

Export from a table, table view, or query in CSV. Save changes first (export uses
the saved layout). Outbound views export generic columns enriched by the campaign
(allow 5–10 min; use Refresh).

**Ad hoc:** open the item → **export** button → save. Names:
- Table: `name_of_table_YYYY-MM-DD_HHMMSS.csv`
- Table view: `name_of_table_view_YYYY-MM-DD_HHMMSS.csv`
- Query: `QueryExport_YYYY-MM-DD_HHMMSS`

**Open in Excel** (preserves leading zeros): open blank sheet → Data > Import
External Data > Import Data → Delimited → Comma → set phone columns to **Text** →
import.

**Scheduled exports** (tables/views only, not queries): Settings → **Scheduled
Exports** → **Add Schedule**: name; **Run every** (interval, min 5 minutes) +
**Run from**; **Datasource** (table or table view); **Schedule enabled**; **Send
data via** Email / FTP / sFTP. File name
`schedule_name_YYYY-MM-DD_HHMMZ.csv` — exported files are **UTC** (`Z` suffix).
Email: ≥1 address, Add Another Address, plus From/Subject/Message; files >5 MB are
zipped, and if still >5 MB a 24-hour download link is sent instead of an
attachment. FTP/sFTP require Content Guru configuration (server, credentials,
sub-folder).

---

## 11. During an OUTBOUND campaign

Live campaign: a process takes batches from the table view, calls contacts,
routes answered calls to agents. Generic columns are written back in batches
(**5–10 min**; Refresh). Bottom-left shows a summary (not-yet-dialled / in-
progress). Underlying table is locked to the campaign while running, but two
campaigns can share a table if schedules don't overlap.

- **Dynamic filtering:** add/remove filters and edit the formula live; save the
  view with the **same name** (not Save As) — changes take effect immediately.
- **Feeding data back:** Settings → Triggered Actions → Add Triggered Action;
  map a completion code to a Source Table/Column so that, when an agent enters
  the code, the value is copied to a Destination Table/Column (for later export/
  analysis/lead refinement). `[Dialer Number Column]` option for multi-number
  tables. One code per table.
- **Retrying numbers:** the OUTBOUND **retry profile** (set in STUDIO) governs
  total attempts, attempts/day, retry window, inter-retry delays per completion
  code, and (optionally) retry ordering. Failure completion codes trigger trying
  the next number for a contact. Same code can be both retry and failure. Next-
  number/retry attempts honour the overall daily cap and window, and only proceed
  based on the last call result.
- **Callbacks:** agents set **scheduled** (date/time or interval; routed to
  requesting agent or any queue agent) or **immediate** (same/different number;
  routed to the same agent) callbacks. Scheduled callbacks retry ~1 hour then
  reschedule (defaults configurable by Content Guru). Generic columns used:
  Scheduled callback?, Callback date/time, Callback agent, Revised callback date/
  time. Retrieve them with a Select query filtered `Scheduled callback? = True`.

---

## 12. Completion code forms (DM-validated free-text field)

To validate an agent's free-text completion-code entry against a DM table: create
a single-column table; populate from a CSV (one permitted value per line); create
a **Select** query selecting that column; in UC and CONTACT create a completion
code form with a free-format text field, label it, tick **Use Data Management
validation**, and pick the query. At run time storm does a **case-sensitive**
match on Submit; mismatches keep the agent in wrap to re-enter — so configure a
long/unlimited wrap time. Full setup: UC and CONTACT Configuration Guide.

---

## 13. Access profiles & rights profiles

Access profiles (created in STUDIO) control access to tables, views, and queries
— filtered drop-downs show only your profile's objects, and new views/queries
only show your profile's tables. Editing an existing view/query whose table is
outside your profile still shows that table in the sidebar (the view/query access
overrides the blocked table). User rights on the user's profile govern DM
functionality (see STUDIO User Guide).

---

## 14. Multiple database instances

To reduce contention, an org can be configured for multiple DM database instances
(contact support). The current instance shows top-right. Switch via Settings →
**Database Instances** → pick instance → OK. The DM REST API (Web Services
Reference Guide) supports multiple instances.

---

## 15. Contact list layout (Appendix 2)

| Field | Description | System variable |
| --- | --- | --- |
| Name | Contact name | `@Name` |
| Number | Telephone number dialled | `@Number` |
| Email Address | Email used to contact | `@Email` |
| Misc 1–20 | Campaign-specific data (account no., balance, renewal date, …) | `@Misc1`–`@Misc20` |

Name/Number/Email are required mappings. **Misc9 and Misc10 are reserved** for
agent name and call result. System variables can store runtime info in FLOW and
route data to agent screens. Misc1–20 are available in VIEW for historical export
reports (Response call records).

**Build a contact list:** create CSV → create matching empty table → import CSV →
create an outbound table view mapping columns to contact-list fields + apply
filters → Save View → in STUDIO provision the campaign and select the view.

---

## Cross-references (other storm guides)

STUDIO User Guide (campaigns, pacing/retry profiles, access/rights, tried/untried
splits); UC and CONTACT Configuration Guide (completion codes/forms); FLOW User
Guide + Web Services Reference Guide (Data Management action cell, REST API, CRM
screen-pops).
