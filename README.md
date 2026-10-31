# PhD Analyzer

**Analyze, plan and run your whole PhD journey, powered by Talvis.** Everything lives on one screen: universities and deadlines, research topics, who works on what, real papers, research gaps, publication venues and your daily plan. At the center sits **Talvis**, a Claude-powered assistant that sees the entire system and works only from real sources.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Node 20+](https://img.shields.io/badge/Node-20%2B-339933.svg)
![Claude Agent SDK](https://img.shields.io/badge/Claude-Agent%20SDK-D97757.svg)

> The user interface is in Azerbaijani. Button names below are given in Azerbaijani with an English translation in parentheses.

---

## Contents

- [What it does](#what-it-does)
- [Interface](#interface)
- [Talvis: the AI core](#talvis-the-ai-core)
- [Connected services and technologies](#connected-services-and-technologies)
- [Architecture](#architecture)
- [Modules](#modules)
- [Background research jobs](#background-research-jobs)
- [Talvis tools](#talvis-tools)
- [Claude accounts and automatic switching](#claude-accounts-and-automatic-switching)
- [Installation and running](#installation-and-running)
- [First steps](#first-steps)
- [Settings](#settings)
- [Data and privacy](#data-and-privacy)
- [Project structure](#project-structure)
- [API](#api)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What it does

| Need | How the system handles it |
|---|---|
| Which universities should I apply to? | Finds universities that match your profile criteria (research directions, countries, QS/THE/ARWU ranking limit, conditions such as "no IELTS/TOEFL required"), and records each ranking and language requirement **with an official source link** |
| Who works on my topic at this university? | Finds authors at a university for a topic via OpenAlex: h-index, number of matching papers, and whether they are still affiliated there |
| Their publications | Filters a researcher's papers by topic; adds them to your library in one click |
| Deadlines | Taken from official pages, marked "verified / unverified", with a countdown |
| What should I do today? | Builds a daily plan from deadlines, unread papers and professors you have not contacted yet |
| Research gaps | Scans the literature across OpenAlex, Semantic Scholar and arXiv, records each gap with evidence papers and checks whether it is already solved |
| Where should I publish? | Suggests real journals and conferences where similar work appears, with h-index, OA/APC, DOAJ status and predatory-journal warnings |
| NLP or Adaptive learning: which fits me? | Splits the whole board into research direction groups and compares them on eight weighted criteria (personal fit, your own interest, PhD opportunities, supervisors, field momentum, novelty, feasibility, career), each score with evidence |
| Which PhD positions are open for me? | Searches PhD portals (DAAD, jobs.ac.uk, AcademicPositions directly; PhDPortal, FindAPhD, EURAXESS, ScholarshipPortal, Nature Careers through a site-restricted web search), reads each listing and saves funding, supervisor and deadline as the listing states them |
| What do students at this university say? | Analyses Reddit (the university's own subreddit, r/PhD, r/gradadmissions, r/AskAcademia): supervision, stipend vs cost of living, workload, international-student experience, with a quote and link for every point |
| The fact is inside a PDF (paper full text, doctoral regulations, fee schedule) | `read_pdf` downloads it, extracts the text page by page and quotes the exact passage with its page number; for a library paper it finds the open-access copy itself (OpenAlex locations, arXiv, the landing page's `citation_pdf_url`). `browse_page` reads PDF links too |
| The official page only loads with JavaScript | Talvis reads it with a real browser (the Edge or Chrome already on the computer), including closed accordions and tabs where admission rules and deadlines often sit |
| SOP, research proposal, emails to professors | Drafts and reviews documents using the real data on your board |

Core principle: **nothing is made up.** Papers, authors, venues, rankings and deadlines come only from tool results or official pages (see the [integrity rules](#integrity-rules) below).

## Interface

- **Modules view:** the Talvis chat in the center, surrounded by 14 module cards arranged in neural-network layers. Cards are connected with lines; when Talvis works on a module, that card and its path to the core light up. Cards can be dragged, resized and zoomed; the layout is remembered.
- **Network view:** every object (you, topics, universities, groups, researchers, papers, gaps, venues, deadlines) shown as a knowledge graph on the left, with the Talvis chat docked on the right. Drag the divider to resize the chat; module panels open over the graph and never cover the chat.
- **HUD:** date, time, countdown to the next deadline, today's tasks, library size and the active Claude account.
- Design: dark "Jarvis"-style HUD with Inter and JetBrains Mono fonts (Azerbaijani characters supported).

## Talvis: the AI core

Talvis runs on the **Claude Agent SDK**, so the Claude Code engine powers it, but only this system's tools are allowed:

- On every message it receives a full summary of the board (profile, criteria, topics, universities, deadlines, tasks, researchers, papers, gaps, venues, documents).
- Anything lasting you tell it (a topic, a university, a decision) is saved to the board right away.
- It replies in Azerbaijani, keeps paper titles in their original language, and refers to board items by IDs such as `[P12]` or `[R3]`.
- Long tasks (gap analysis, university search, and so on) run as [background jobs](#background-research-jobs) and post their report to the chat.

### Integrity rules

These are not just instructions; the tools themselves enforce them:

| Rule | How it is enforced |
|---|---|
| Papers cannot be invented | `save_papers` accepts only IDs (OpenAlex, DOI, arXiv, Semantic Scholar); title, authors, year and abstract are fetched from the source on the server |
| No gap without evidence | `add_gap` accepts only references to papers that are already in the library |
| No "verified" deadline without a source | `add_deadline` requires an official `sourceUrl` for `verified=true` |
| No ranking or language requirement without a source | `add_university` requires `rankSource` for `rankLabel` and `langCertSource` for `langCert` |
| DOI check | `verify_doi` confirms on Crossref that a DOI actually exists |
| No invented links | `save_position` and `add_insight` accept only URLs that appeared in a tool result (portal search, browser, Reddit, WebSearch, WebFetch) or that you pasted in the chat |

## Connected services and technologies

### External services

| Service | Used for | Key | Notes |
|---|---|---|---|
| **Claude** (Anthropic) | The brain of Talvis: chat, planning, analysis, gap finding | Not needed: sign in with a Claude subscription (Pro/Max) via OAuth | Claude Agent SDK; Claude Opus 5.5 by default, Claude Sonnet 5.5 as fallback. Multiple accounts supported |
| **Claude WebSearch / WebFetch** | Official university pages, rankings, language requirements, deadlines, calls for papers | Included with the Claude sign-in | Used by Talvis only |
| **Local browser** (Edge / Chrome via `playwright-core`) | Pages that need JavaScript (SPAs, portals, accordions) | Not needed | Nothing is downloaded; `npm run browser:install` adds Playwright's Chromium if neither browser is installed. Sites that answer with a bot check are reported as blocked, never worked around |
| **[Reddit](https://www.reddit.com/dev/api/)** | Student voice: what students say about a university | Optional (free "script" app) | Without a key the public RSS feeds are used: a few requests a minute, no scores. With a key (Settings) the official API gives scores, comment counts and full text |
| **PhD portals** | Positions and programs | Not needed | DAAD (official JSON API), jobs.ac.uk, AcademicPositions are searched directly; portals whose robots.txt disallows automated search (PhDPortal, EURAXESS) or that sit behind a bot check (FindAPhD) are reached through a `site:` web search, and single listings are read on request |
| **[OpenAlex](https://openalex.org)** | Paper search, citations, institution search, "who works on this", researcher publications, venue statistics (h-index, OA, DOAJ, APC), topic trends | Optional (free) | Without a key there is a small free daily budget per IP; get a free key at [openalex.org/settings/api](https://openalex.org/settings/api) |
| **[Semantic Scholar](https://www.semanticscholar.org/product/api)** | Paper search, TLDR summaries, similar-paper recommendations | Optional | Strict rate limits without a key; the system queues requests and retries |
| **[arXiv API](https://info.arxiv.org/help/api/index.html)** | The newest preprints | Not needed | Respects the one-request-per-3-seconds rule; when arXiv blocks requests, arXiv papers come from OpenAlex's arXiv index instead |
| **[Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)** | DOI verification | Not needed | |

All external responses are cached in SQLite (from 6 hours up to 30 days), so repeated queries do not waste rate limits.

### Local technologies

| Part | Technology |
|---|---|
| Server | Node.js 20+, Express 5, TypeScript (tsx) |
| Database | SQLite (better-sqlite3), WAL mode |
| AI integration | `@anthropic-ai/claude-agent-sdk` (bundles Claude Code), in-process MCP server, `zod` schemas |
| Live updates | Server-Sent Events (SSE) |
| Frontend | React 19, Vite 6, React Flow (`@xyflow/react`) 12, d3-force, react-markdown + remark-gfm, lucide-react |
| Fonts | Inter, JetBrains Mono (`@fontsource`, offline) |
| XML | fast-xml-parser (arXiv Atom feed) |

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Browser: React + React Flow"]
    Board["Modules board"]
    Graph["Network view"]
    Chat["Talvis chat"]
  end
  subgraph Server["Local server: Express, 127.0.0.1:5179"]
    API["REST API + SSE"]
    DB[("SQLite<br/>data/phd.db")]
    Runner["Talvis runner<br/>chat + background jobs"]
    Tools["48 MCP tools"]
    Accounts["Account manager<br/>automatic switching"]
  end
  subgraph Claude["Claude: your subscription"]
    SDK["Claude Agent SDK<br/>Claude Code"]
    Web["WebSearch / WebFetch"]
  end
  subgraph Sources["Open scholarly sources"]
    OA["OpenAlex"]
    S2["Semantic Scholar"]
    AX["arXiv"]
    CR["Crossref"]
  end
  Browser <-->|HTTP + SSE| API
  API --> DB
  API --> Runner
  Runner --> Accounts --> SDK
  SDK --> Web
  SDK <-->|MCP| Tools
  Tools --> DB
  Tools --> OA & S2 & AX & CR
  API --> OA & S2 & AX
```

How a question flows: you type in the chat → the server sends it to Talvis together with the board summary → Talvis calls the tools it needs (for example an OpenAlex search, then saving results to the library) → each tool call lights up the matching card on the board → the answer streams into the chat and the board refreshes automatically.

## Modules

| # | Module | What it stores | Main actions |
|---|---|---|---|
| M-01 | **Profil** (Profile) | Name, field, stage, target intake, citizenship, education (with teaching language), research directions, target countries, ranking limit, extra conditions | Criteria-based university search; Claude accounts; settings |
| M-02 | **Universitetlər** (Universities) | University, country, ranking (with source), language-test requirement (with source), fit note, status | Search by name in OpenAlex; "Kəşf et" (Scout: researchers, groups, deadlines); deadline check |
| M-03 | **Deadline-lar** (Deadlines) | Application, scholarship, interview, document, conference and journal dates | Verify against official sources; verified / unverified; countdown |
| M-04 | **Bugün** (Today) | Tasks (overdue / today / upcoming) | AI daily plan; todo → in progress → done |
| M-05 | **Sənədlər** (Documents) | SOP, research proposal, CV, emails, cover letters, notes | Editor; "Talvis yazsın" (Talvis drafts), "Talvis yoxlasın" (Talvis reviews) |
| M-06 | **Mövzular** (Topics) | Topics, keywords, priority | Gap analysis; paper search; OpenAlex publication trend |
| M-07 | **Tədqiqat qrupları** (Research groups) | Lab, university, principal investigator (PI), link | Filled automatically when scouting a university |
| M-08 | **Tədqiqatçılar** (Researchers) | Name, university, h-index, topic papers, relevance, contact status, links | "Who works on this?" search; view their papers; draft an email |
| M-09 | **Məqalələr** (Papers) | Real papers, abstract, TLDR, reading status, notes | Search OpenAlex / Semantic Scholar / arXiv; explain; find related work |
| M-10 | **Research gap** | Gap, evidence papers, novelty and feasibility scores, methods | Real gap analysis; turn into research questions; re-check |
| M-11 | **Nəşr** (Publish) | Journals and conferences, fit, h-index, OA/APC, DOAJ | AI venue matching; quick statistical search |
| M-12 | **PhD elanları** (PhD positions) | Positions and programs from portals: university, funding, supervisor, deadline, status | Portal search (pick portals, field, country); "AI: scan all portals for my profile"; save; fit check |
| M-14 | **İstiqamətlər** (Directions) | Direction groups (name, keywords, status, your interest 1-5) and Talvis' fit analysis per group | Side-by-side comparison table; "AI: explore and compare"; analyse one group; filter the board to a group |
| M-13 | **Tələbə səsi** (Student voice) | Per-university analysis of what students say: summary, sentiment, themes, evidence quotes with links, caveats | "AI: what do students say on Reddit?" per university (also from the Universities table); direct Reddit search |

### Profile criteria

| Criterion | Options |
|---|---|
| Research directions | Free text + suggestions (NLP, Adaptive learning systems, Intelligent tutoring systems, Educational data mining, Learning analytics, ...) |
| Target countries | Free text + suggestions |
| Ranking | QS, THE, ARWU or any; top 50 / 100 / 200 / 300 / 500 / 1000 or no limit |
| Extra conditions | No IELTS/TOEFL required, funded, no tuition, English-taught, no GRE, no application fee, no master's required, rolling admission + free text |
| Citizenship and education | Used to check whether a language-test waiver applies to you |

## Background research jobs

Long tasks run in the background with their own instructions, without blocking the chat. Progress shows on the card and in the module panel; when a job finishes, its report is posted to the chat.

| Job | Started from | What it does |
|---|---|---|
| `find_universities` | Profile, Universities | Checks rankings on official sites, keeps universities with active researchers in your directions, verifies conditions on official pages, saves the matches, and lists strong candidates it excluded together with the reason |
| `scout_university` | Universities, Researchers | For one university: 4-8 researchers on your topics, their key papers, group pages and PhD deadlines |
| `gap_analysis` | Topics, Research gap | Searches three sources with several phrasings, checks the trend, drafts 5-8 candidate gaps, tests each one with a "is this already solved?" search, then saves 3-6 gaps with evidence papers |
| `verify_deadlines` | Deadlines, Universities | Checks dates on official admission and scholarship pages, updates them and adds missing ones |
| `daily_plan` | Today | 3-6 concrete tasks with time estimates, based on deadlines and the board |
| `direction_fit` | Directions | For each direction group (or one): trend, literature, supervisors, positions, novelty and personal fit with the same depth; saves items into the group, scores 8 criteria with evidence, and reports which group fits best and whether a hybrid fits better |
| `venue_match` | Publish | Real venues for a title and abstract: scope, review time, APC, next conference deadline |
| `student_voice` | Student voice, Universities | Finds the university's subreddit, runs 5-8 Reddit searches, reads the most relevant threads, groups them into themes and saves one evidence-backed insight with caveats (sample size, dates) |
| `portal_scan` | PhD positions | Searches every portal for each research direction, reads the promising listings, saves the ones that pass your criteria and adds deadlines due within 120 days |

## Talvis tools

Talvis can only use these tools plus Claude's WebSearch / WebFetch (file system, terminal and other built-in tools are disabled):

| Group | Tools |
|---|---|
| Read the board | `get_overview`, `list_items`, `get_item` |
| Write to the board | `save_profile`, `add_topic`, `add_university`, `add_deadline`, `add_task`, `add_group`, `add_researcher`, `save_papers`, `add_gap`, `add_venue`, `save_document`, `update_item`, `delete_item` (only when you ask) |
| Real research | `search_papers`, `paper_details`, `related_papers` (citing works, references, similar papers), `find_institution`, `find_researchers_at`, `search_authors`, `researcher_works`, `find_venues`, `verify_doi`, `topic_trend` |
| Direction groups | `save_direction`, `tag_directions`, `save_direction_analysis` |
| TRDesk | `trdesk_plans`, `trdesk_plan`, `trdesk_sync`, `trdesk_add_tasks`, `trdesk_update_task`, `trdesk_task_done`, `trdesk_delete_task` (only when you ask), `trdesk_day_note`, `trdesk_manage_plan`, `trdesk_agenda` |
| The web | `read_pdf` (PDF from a URL, or a library paper's open-access full text by its P id; `find` returns passages with page numbers), `browse_page` (any page, real browser when needed; `find` pulls matching paragraphs, `linkFilter` follows sub-pages, JSON-LD job postings/programs), `reddit_search`, `reddit_thread`, `find_subreddits`, `portal_search`, `save_position`, `add_insight` |
| Background | `start_job` |

## Research direction groups

The strip under the HUD (**İstiqamət: Hamısı · NLP · Adaptive learning · Müqayisə**) filters the whole board to one direction group: cards, panels, the network view and the HUD. Talvis is told which group you are looking at and works inside it.

- **Grouping** (`shared/directions.ts`): an item's own text decides (paper title and abstract, a researcher's OpenAlex concepts, a university's fit note): the group with the most keyword matches, or both when the scores are close (hybrids). Only when the text says nothing does an item inherit from its topics; a university belongs to every group with real presence among its researchers, groups and positions. Talvis can override a single item with `tag_directions`, and group keywords are editable in the panel.
- **Comparison** (M-14): rate your interest with stars (it is never guessed by the AI), then "AI: istiqamətləri araşdır və müqayisə et" runs the `direction_fit` job: the same depth of search for every group (trend, key papers, supervisors at your target universities, open positions, open problems), saves what it finds into that group and scores it with evidence. Tasks, documents and deadlines without a university stay visible in every group.
- Two groups (NLP, Adaptive learning) are created on first start; add, rename, drop or delete groups in the panel.

## TRDesk (task manager)

Talvis manages a **"PhD plan"** in TRDesk through its agent API, so PhD work shows up in the TRDesk widget next to everything else.

- Key: TRDesk → Ayarlar → "Claude API (agent)" → "Yeni açar" (`trd_…`), then Profil → Ayarlar → **TRDesk açarı**. The address defaults to the deployed TRDesk; the plan field takes a plan name or id (default "PhD plan").
- **Sinxronlaşdır** (Today panel) or `trdesk_sync`: creates the PhD plan if it is missing, puts every open deadline (type W) and every dated board task on its date in TRDesk, carries unfinished overdue tasks to today, and syncs completion both ways (ticked in TRDesk = done on the board and the other way round). Each TRDesk task carries a `Talvis D12` / `Talvis K7` marker in its section, so running it again never duplicates.
- In the chat Talvis can read and change any plan (also the study plan "Azərbaycan NLP Phd"): add tasks on dates with type and minutes, move, complete, write day notes, create or archive plans. Deleting tasks or plans happens only when you ask.

## Claude accounts and automatic switching

- Open **Profil → Claude hesabları** (Profile → Claude accounts), or click the **CLAUDE** button in the header.
- **Hesab 1** (Account 1) is the computer's default Claude sign-in. **Hesab əlavə et** (Add account) adds as many other accounts as you like; each one is stored separately in `data/accounts/acc-N`.
- For each account you see: plan, email, 5-hour and 7-day usage percentages, and the reset time if its limit is reached.
- With **automatic switching** on, when the active account hits its limit Talvis moves to the next ready account and continues the answer there. Once the limit resets, that account becomes available again.
- Claude sessions are stored per account, so when the account changes, the recent messages are carried over and the conversation does not break.

```mermaid
sequenceDiagram
  participant U as You
  participant T as Talvis
  participant A1 as Account 1
  participant A2 as Account 2
  U->>T: question
  T->>A1: request
  A1-->>T: limit reached (with reset time)
  T->>T: Account 1 marked limited, Account 2 active
  T->>A2: same request + recent messages
  A2-->>T: answer
  T-->>U: "Account 1 hit its limit, switched to Account 2" + answer
```

Only add Claude accounts that you own; every account is subject to Anthropic's terms of use.

## Installation and running

### Requirements

- Windows, macOS or Linux
- [Node.js](https://nodejs.org) 20 or newer, with npm
- A Claude Pro or Max subscription (no API key needed)
- An internet connection

### Steps

```bash
npm install
npm start
```

Then open <http://localhost:5179>.

On Windows you can simply double-click `Talvis.bat`: it installs packages if needed, starts the system and opens the browser.

### First Claude sign-in (once)

1. Click **Claude-a qoşul** (Connect to Claude) in the chat.
2. On the page that opens, sign in to your Claude account and click **Authorize** (the browser may open on its own).
3. Paste the code it shows into the box in Talvis and click **Təsdiqlə** (Confirm).

The sign-in is remembered on this computer. You can also sign in from a terminal with `claude auth login`.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Builds the UI and runs everything on port 5179 |
| `npm run dev` | Development mode: API on 5179 (auto-restart) + UI on 5178 (live reload) |
| `npm run build` | Builds only the UI into `dist/` |
| `npm run typecheck` | TypeScript check |
| `npm run fetch -- page <url> [--browser] [--find "words"] [--links] [--json] [--out file]` | Read any page from the terminal, with the real browser when it needs JavaScript |
| `npm run fetch -- reddit "<query>" [--sub PhD] [--sort top] [--time year]` | Reddit search; `fetch -- thread <url>` reads a thread, `fetch -- subs "<name>"` finds subreddits |
| `npm run fetch -- portals "<field>" [--portal daad,jobsacuk] [--country Germany]` | PhD portal search |
| `npm run fetch -- pdf <url> [--pages 1-3] [--find "words"]` | Read a PDF from the terminal |
| `npm run browser:check` | Shows which browser works on this computer |
| `npm run browser:install` | Downloads Playwright's Chromium (only if neither Edge nor Chrome is installed) |

### Environment variables (optional)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5179` | Server port |
| `PHD_DATA_DIR` | `./data` | Data folder (point it to a separate folder for testing) |
| `PHD_USE_API_KEY` | - | When `1`, uses `ANTHROPIC_API_KEY` instead of the subscription |

## Deploying to Google Cloud Run

The deployed Talvis keeps everything in **PostgreSQL** (e.g. Neon) and is protected by a **password**.

- **Data:** with `DATABASE_URL` set, `server/start.ts` fills a local SQLite working copy from Postgres on start and `server/pgsync.ts` mirrors every write back within about a second (tables `talvis_*`). The Claude sign-ins made on the server (`data/accounts/*`) are backed up there too, so a restart does not log you out. Run **one instance** per database. `npm run db:push` copies the local board into an empty Postgres (`-- --force` overwrites); `npm run db:push -- --logins-only` uploads the Talvis Claude logins (`data/accounts/*`, never `~/.claude`) so the cloud starts signed in; a login used in two places may ask to sign in again on one side after its token refreshes.
- **Access:** with `APP_PASSWORD` set, every `/api` route needs the login cookie (30 days, httpOnly); 8 wrong tries per 10 minutes per address are allowed.
- **Container:** `Dockerfile` (Playwright image: Node + Chromium for JavaScript pages and PDFs). `.gcloudignore` keeps `data/` (keys, logins) out of the upload.

One-time secrets (project `trdesk-510213`, service account `50524487911-compute@developer.gserviceaccount.com`):

```bash
printf '%s' 'postgresql://USER:PASSWORD@HOST/neondb?sslmode=verify-full' | gcloud secrets create talvis-database-url --replication-policy=automatic --data-file=-
printf '%s' 'YOUR-LOGIN-PASSWORD' | gcloud secrets create talvis-app-password --replication-policy=automatic --data-file=-
gcloud secrets add-iam-policy-binding talvis-database-url --member=serviceAccount:50524487911-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding talvis-app-password --member=serviceAccount:50524487911-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

Deploy (free tier: scales to zero, at most one instance):

```bash
gcloud run deploy talvis-phd --source . --region us-east4 --memory 2Gi --cpu 1 --min-instances 0 --max-instances 1 --timeout 3600 --allow-unauthenticated --set-secrets DATABASE_URL=talvis-database-url:latest,APP_PASSWORD=talvis-app-password:latest --quiet
```

Free-tier notes: Cloud Run bills by request time, so CPU runs while the board is open in a browser (its live event stream counts as a request). Background jobs keep going while the tab is open; close the tab and they pause until the next visit. The free monthly allowance is about 50 hours of open board at 2 GiB / 1 vCPU; the container image (~2 GB in Artifact Registry) costs a few cents a month.

## First steps

1. **Profile:** pick your research directions (for example NLP, Adaptive learning systems), target countries, ranking limit and conditions (for example no IELTS/TOEFL required), fill in citizenship and education, then click **Yadda saxla** (Save).
2. Click **"Bu kriteriyalarla universitet tap"** (Find universities with these criteria). Talvis saves matching universities to the board with ranking and language-requirement sources.
3. **Topics:** add your concrete research topics and start a **Gap analizi** (Gap analysis) for each.
4. **Universities:** on a university you like, click **Kəşf et** (Scout); researchers, groups and deadlines fill in.
5. **Researchers:** open a promising professor, look at their papers and ask for an **Email qaralaması** (Email draft).
6. Every morning, ask in the chat: "Bu gün nə etməliyəm?" (What should I do today?)

## Settings

Profile → Settings:

| Setting | Options | Default |
|---|---|---|
| Model | Claude Opus 5.5, Claude Sonnet 5.5, Claude Fable 5.1, Claude Haiku 5.5 | Claude Opus 5.5 |
| Chat depth (effort) | low, medium, high, xhigh | medium |
| Research job depth | medium, high, xhigh, max | high |
| OpenAlex API key | free key | empty |
| Semantic Scholar key | key | empty |
| OpenAlex mailto | email | empty |
| Automatic account switching | on / off | on |
| Browser for JavaScript pages | auto (Edge, then Chrome), Edge, Chrome, Chromium | auto |
| Show the browser window | on / off (for checking what it sees) | off |
| TRDesk key / address / plan | `trd_…` key, TRDesk URL, plan name or id | empty / deployed TRDesk / "PhD plan" |
| Reddit app client id / secret | from [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) ("script" app) | empty (public RSS) |

Model availability depends on your Claude plan; if the selected model is not available, the fallback model takes over.

## Data and privacy

- All board data stays **on this computer only**: `data/phd.db` (SQLite).
- Claude sign-ins: Account 1 in the default Claude folder (`~/.claude`), extra accounts under `data/accounts/`. Do not share these folders.
- The server listens on `127.0.0.1` only; other devices on the network cannot connect to it.
- What leaves your computer: chat messages and the board summary go to Claude (under Anthropic's terms); only search queries go to the scholarly APIs, Reddit and the portals; pages are opened by the local browser like any visit; API keys you enter are sent only to their own service.
- Student-voice analyses quote public posts with links and do not name or profile individual Reddit users.
- `data/`, `dist/` and `node_modules/` are listed in `.gitignore`.

## Project structure

```text
├── server/
│   ├── index.ts            REST API, SSE, static UI
│   ├── db.ts               SQLite schema, CRUD, profile, settings, chat, API cache
│   ├── events.ts           SSE broadcasting
│   ├── library.ts          Saving search results without duplicates
│   ├── integrations/
│   │   └── trdesk.ts       TRDesk agent API client and board <-> PhD plan sync
│   ├── browser/
│   │   ├── render.ts       Real browser (Edge/Chrome via playwright-core), text/links/JSON-LD extraction
│   │   ├── read.ts         HTTP first, browser when the page needs JavaScript, PDFs to pdf.ts
│   │   ├── pdf.ts          PDF download (landing page -> PDF link) and text extraction (unpdf)
│   │   └── robots.ts       robots.txt check for automated listing searches
│   ├── agent/
│   │   ├── runner.ts       Chat, background jobs, account failover
│   │   ├── accounts.ts     Claude accounts, status, usage, limits
│   │   ├── login.ts        In-app Claude sign-in
│   │   ├── tools.ts        48 MCP tools
│   │   ├── prompts.ts      Talvis and job instructions
│   │   └── overview.ts     Board summary (sent with every message)
│   └── research/
│       ├── openalex.ts     OpenAlex client
│       ├── scholar.ts      Semantic Scholar, arXiv, Crossref
│       ├── reddit.ts       Reddit (official API with a key, public RSS without)
│       ├── portals.ts      PhD portals: DAAD, jobs.ac.uk, AcademicPositions, EURAXESS, PhDPortal, FindAPhD, ...
│       ├── index.ts        Combined search and de-duplication
│       └── http.ts         Request queue, retries, cache
├── shared/
│   ├── types.ts            Shared data model
│   ├── criteria.ts         Profile criteria and conditions
│   └── directions.ts       Direction groups: grouping of items, filtered board, comparison criteria
├── web/
│   ├── index.html
│   └── src/
│       ├── App.tsx         HUD and views
│       ├── store.tsx       State, SSE, actions
│       ├── board/          Board, neural edges, cards, chat, network view
│       ├── modules/        Card summaries and module registry
│       └── panels/         Module panels and Claude accounts
├── scripts/
│   └── fetch.ts            Terminal access to the page reader, Reddit and portals
├── Talvis.bat              Windows launcher
├── LICENSE                 MIT
└── README.md
```

## API

Everything lives under `http://localhost:5179/api`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/state` | Full board state |
| GET | `/events` | SSE: `changed`, `activity`, `pulse`, `job`, `chat`, `claude`, `login`, `accounts` |
| GET / POST / PATCH / DELETE | `/items/:coll[/:id]` | `topics`, `universities`, `groups`, `researchers`, `papers`, `deadlines`, `tasks`, `gaps`, `venues`, `docs`, `positions`, `insights` |
| PUT | `/profile`, `/settings` | Profile and settings |
| GET | `/research/papers`, `/research/institutions`, `/research/researchers`, `/research/author-works`, `/research/venues`, `/research/trend` | Direct research queries |
| GET | `/portals`, `/portals/search`, `/reddit/search`, `/reddit/thread`, `/reddit/subreddits`, `/browse`, `/browser/status` | Web sources |
| POST | `/positions` | Save a portal listing |
| POST / GET / PUT | `/trdesk/sync`, `/trdesk/upcoming`, `/trdesk/tasks/:id/done` | TRDesk PhD plan |
| POST | `/research/save-paper`, `/research/save-researcher`, `/research/save-venue`, `/universities/resolve` | Save results |
| GET / POST | `/chat`, `/chat/stop`, `/chat/new` | Chat |
| POST | `/jobs`, `/jobs/:id/stop` | Background jobs |
| GET / POST | `/claude`, `/claude/login`, `/claude/login/code`, `/claude/login/cancel` | Claude status and sign-in |
| GET / POST / PATCH / DELETE / PUT | `/accounts`, `/accounts/:id/activate`, `/accounts/:id/check`, `/accounts/:id`, `/accounts/auto-switch` | Claude accounts |

## Troubleshooting

| Problem | Fix |
|---|---|
| "Claude-a giriş lazımdır" (Claude sign-in required) | Click **Claude-a qoşul** (Connect to Claude) and follow the steps, or run `claude auth login` in a terminal |
| Usage limit reached | Profile → Claude accounts: add another account and turn on automatic switching, or wait for the reset time |
| OpenAlex returns nothing / 429 | The free daily budget is used up: add a free OpenAlex key in Settings |
| arXiv results are slow | arXiv throttles requests; the system switches to OpenAlex's arXiv index automatically |
| Semantic Scholar 429 | The system waits and retries; get a key for regular use |
| Port already in use | Close the old process or run `PORT=5180 npm start` |
| `better-sqlite3` fails to install | Use Node 20 LTS (prebuilt binaries exist); newer Node versions may need Visual Studio Build Tools |
| A page "loads with JavaScript" / WebFetch returns nothing | Talvis switches to `browse_page`; check `npm run browser:check`. If no browser is found, install Edge/Chrome or run `npm run browser:install` |
| "sayt bloklayır" (site blocks) on a portal | The site shows a bot check (Cloudflare) or its robots.txt disallows automated search. Use the "Portalda aç" link to open it yourself; Talvis falls back to web search |
| A PDF "is not available" | Paywalled papers have no open copy; Talvis says so and uses the abstract. Scanned PDFs without a text layer are reported as scans (no OCR) |
| Reddit 429 / slow | The public feeds allow only a few requests a minute; the system waits for the reset. Add a free Reddit app key in Settings for a higher limit |
| The board looks empty | Check that the server is running (a red "Server ilə əlaqə yoxdur", "No connection to the server", notice appears at the top) and reload the page |

## License

This project is released under the **MIT License**. Full text: [LICENSE](LICENSE).

In short: you may use, copy, modify, merge, publish, distribute, sublicense and sell the software, as long as the copyright notice and the license text are kept. The software is provided "as is", without warranty of any kind.

Third-party services and packages have their own terms:

- Use of Claude is subject to Anthropic's terms of use and policies.
- Data from OpenAlex, Semantic Scholar, arXiv and Crossref is provided under each service's own terms; remember to cite your sources.
- npm packages are distributed under their own licenses (see `node_modules`).

This project is not officially affiliated with Anthropic, OpenAlex, Semantic Scholar, arXiv or Crossref.
