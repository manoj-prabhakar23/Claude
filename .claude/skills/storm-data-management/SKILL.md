---
name: storm-data-management
description: >-
  Reference and guidance for Content Guru storm® DATA MANAGEMENT — the storm
  portal module for building data tables and queries, managing OUTBOUND dialler
  campaign contact lists, and feeding data into storm FLOW. Use when a user asks
  about storm Data Management tables, table views, queries (Select/Insert/
  Update), searching tables, importing/exporting data, excluding numbers from
  contact lists, OUTBOUND campaigns, completion code forms, access/rights
  profiles, setting criteria, or how Data Management queries are referenced from
  storm FLOW.
---

# Content Guru storm® DATA MANAGEMENT

> **Source & verification status.** Built from the official help system at
> `https://www.stormportal.us/datamanagement/assets/help/welcome.htm`
> (Adobe RoboHelp 2022; title: *"storm DATA MANAGEMENT Help"*).
> - **Verified** from the help's own navigation: the product name, the help
>   platform, and the **full top-level Table of Contents / topic titles** below.
> - **Not yet verified** (the per-topic body pages load in a separate iframe that
>   was not captured): exact step-by-step procedures, field names, screenshots,
>   and the child topics inside each book. These are described at a sensible,
>   inferred level and flagged. Verify against the live help before relying on
>   exact UI steps. See "Completing this skill" at the end.

## What storm DATA MANAGEMENT is

storm® DATA MANAGEMENT is a module of Content Guru's **storm** cloud Customer
Experience platform, accessed through the storm portal. It lets administrators
and campaign managers:

- store structured data in **tables** held in the storm cloud;
- build **queries** (Select / Insert / Update) over those tables;
- expose query results to **storm FLOW** (the storm flow/IVR/interaction
  designer) so live interactions can read and write data; and
- manage **OUTBOUND campaign contact lists** — including importing contacts,
  excluding numbers (suppression / do-not-call), completion codes, and exporting
  results.

In short, it is storm's native **data + contact-list management layer**, with a
strong orientation toward **outbound dialler campaigns**.

It is related to but distinct from **storm CKS®** (the Customer Data Platform /
aggregation overlay across systems of record) and **storm INTEGRATE** (API
connectors / the storm Exchange). DATA MANAGEMENT is about data held *natively
inside storm* and the contact lists that drive OUTBOUND.

## Authoritative Table of Contents (verified)

The help system's complete top-level navigation. Book entries (▸) contain
further child topics that load dynamically and were not captured here.

1. **What's New in This Release**
2. **Welcome**
3. ▸ **Introduction**
   - How the DATA MANAGEMENT Application Works
   - Queries and FLOW
   - OUTBOUND Campaigns
   - Completion Code Forms
   - Access Profiles and Rights Profiles
4. ▸ **Getting Started**
5. ▸ **Creating Tables**
6. ▸ **Creating Table Views**
7. ▸ **Queries**
8. ▸ **Searching Tables**
9. ▸ **Excluding Numbers From Contact Lists**
10. ▸ **Importing Data into Tables**
11. ▸ **Exporting Data From Tables and Table Views**
12. ▸ **During an OUTBOUND Campaign**
13. **Appendix 1 – Setting Criteria**
14. **Appendix 2 – The Contact List Layout**
15. **Copyright and Disclaimer**

## Key concepts and areas

> Descriptions below the verified titles are inferred from the topic names and
> general storm knowledge; treat specifics as approximate until checked.

### Tables
The core data store. A **table** holds rows of structured data (e.g. a contact
list for a campaign, or reference/lookup data). "Creating Tables" covers defining
a table and its columns/fields.

### Table Views
A **table view** is a defined, usually filtered or projected, view over a table
— a way to present or work with a subset of a table's columns/rows without
duplicating the data. "Creating Table Views" covers defining these.

### Queries
Reusable statements against a table. The three core operations are:
- **Select** — retrieve rows (read). A Select query is referenced from storm
  **FLOW** via a **Fetch Query Result** step so the running flow can use the data.
- **Insert** — add rows to a table.
- **Update** — overwrite values in existing rows.

You can create a new query or reuse an existing saved one. See the dedicated
**Queries** book and the **Queries and FLOW** topic for how flows consume them.

### Searching Tables
Finding and filtering records within a table, typically using **criteria**
(see Appendix 1 – Setting Criteria).

### OUTBOUND campaigns & contact lists
DATA MANAGEMENT underpins outbound dialler campaigns:
- **Importing Data into Tables** — bulk-load contacts into a table / contact list.
- **Excluding Numbers From Contact Lists** — suppression / do-not-call handling,
  removing numbers that must not be dialled.
- **During an OUTBOUND Campaign** — how data behaves while a campaign runs.
- **Completion Code Forms** — the outcome/disposition codes agents apply to
  contacts.
- **Appendix 2 – The Contact List Layout** — the expected structure/format of a
  contact list.
- **Exporting Data From Tables and Table Views** — extracting results/records.

### Access Profiles and Rights Profiles
storm's permission model controlling who can view/modify tables, queries and
campaign data. "Access Profiles and Rights Profiles" (under Introduction) is the
authoritative topic.

### Setting Criteria (Appendix 1)
How to build filter criteria used by searches, views, and queries.

## How DATA MANAGEMENT relates to storm FLOW

A common pattern: a flow built in storm FLOW reaches a point where it needs data
held in DATA MANAGEMENT. It references a saved **Select** query and uses a
**Fetch Query Result** step to read the returned rows/fields into flow variables,
which then drive routing, prompts, screen behaviour, or further logic. Insert/
Update queries let flows write back (e.g. recording an interaction outcome). The
**"Queries and FLOW"** topic is the authoritative reference for this.

## When to use this skill

Use it to orient on storm DATA MANAGEMENT's scope, navigate to the right help
topic, explain the table/table-view/query model, or explain the OUTBOUND
contact-list lifecycle (import → exclude → run → complete → export). For exact,
current procedures and field names, defer to the live help topics listed above.

## Completing this skill (to make it fully verified)

The uploaded source was the help's **Welcome shell page**, which yielded the TOC
but not the individual topic bodies (they load from a separate iframe/content
file). To upgrade every section above from "inferred" to "verified":

1. From a browser where the portal loads, open each topic in the TOC above
   (URLs follow the pattern
   `https://www.stormportal.us/datamanagement/assets/help/<Folder>/<Topic>.htm`,
   e.g. `.../Queries/Queries.htm`, `.../Importing_data_into_tables/Importing_Data_Into_Tables.htm`).
2. Save **"Webpage, Complete"** (which includes the `_files` folder with the
   topic body `saved_resource.html` and the `toc1.new.js` / `gdata1.new.js`
   data files that contain the child-topic structure), or print each topic to
   PDF, and provide those.
3. Replace the inferred descriptions with the verified procedures, field names,
   child topics, and any limits/screenshots.

### Verified topic URL map (top level)

| Topic | Path under `.../assets/help/` |
| --- | --- |
| What's New in This Release | `Welcome/What_s_New_in_This_Release.htm` |
| Welcome | `Welcome/Welcome.htm` |
| Introduction | `Introduction/Introduction.htm` |
| – How the DATA MANAGEMENT Application Works | `Introduction/How_the_DATA_MANAGEMENT_Application_Works.htm` |
| – Queries and FLOW | `Introduction/Queries_and_FLOW.htm` |
| – OUTBOUND Campaigns | `Introduction/OUTBOUND_Campaigns.htm` |
| – Completion Code Forms | `Introduction/Completion_Code_Forms.htm` |
| – Access Profiles and Rights Profiles | `Introduction/Access_Profiles_and_Rights_Profiles.htm` |
| Getting Started | `Getting_started/Getting_Started.htm` |
| Creating Tables | `Creating_tables/Creating_Tables.htm` |
| Creating Table Views | `Creating_table_views/Creating_Table_Views.htm` |
| Queries | `Queries/Queries.htm` |
| Searching Tables | `Searching_Tables/Searching_Tables.htm` |
| Excluding Numbers From Contact Lists | `Excluding_numbers_from_contact_lists/Excluding_Numbers_from_Contact_Lists.htm` |
| Importing Data into Tables | `Importing_data_into_tables/Importing_Data_Into_Tables.htm` |
| Exporting Data From Tables and Table Views | `Exporting_data_from_tables_and_table_views/Exporting_Data_from_Tables_and_Table_Views.htm` |
| During an OUTBOUND Campaign | `During_an_OUTBOUND_campaign/During_an_OUTBOUND_Campaign.htm` |
| Appendix 1 – Setting Criteria | `Appendix_1_setting_filters/Appendix_1_–_Setting_Criteria.htm` |
| Appendix 2 – The Contact List Layout | `Appendix_2_the_contact_list_layout/Appendix_2_–_The_Contact_List_Layout.htm` |
| Copyright and Disclaimer | `Welcome/Copyright_and_Disclaimer_US.htm` |
