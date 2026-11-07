# PhD Analyzer user guide

PhD Analyzer helps you go from "I am interested in NLP and HCI" to a concrete PhD plan: research directions, universities and supervisors that fit you, real papers and research gaps, open positions, deadlines, an estimated admission chance per university, and a daily to-do list. **Talvis**, the AI core, does the research with real sources and keeps everything on one board.

This guide is for people who use the app. For developers (architecture, every tool, API, deployment) see the [README](../README.md).

---

## Contents

| # | Section | What you will learn |
|---|---|---|
| 1 | [Quick start](#1-quick-start) | Install, run and connect Claude |
| 2 | [First run: your research interests](#2-first-run-your-research-interests) | How the app turns your interests into direction groups |
| 3 | [The screen](#3-the-screen) | Board, network view, header, direction filter, system log |
| 4 | [Talvis, the AI core](#4-talvis-the-ai-core) | What to ask, board IDs, how it stays factual |
| 5 | [Modules one by one](#5-modules-one-by-one) | What every card stores and does |
| 6 | [Background jobs](#6-background-jobs) | Long research tasks and what each one produces |
| 7 | [Admission chance](#7-admission-chance) | How the estimate works and how to read it |
| 8 | [Direction groups and comparison](#8-direction-groups-and-comparison) | Grouping, filtering, the 8 scoring criteria |
| 9 | [Settings](#9-settings) | Model, effort, language, keys, browser |
| 10 | [Claude accounts](#10-claude-accounts) | Several subscriptions, automatic switching |
| 11 | [Optional integrations](#11-optional-integrations) | OpenAlex, Semantic Scholar, Reddit, TRDesk |
| 12 | [Data and privacy](#12-data-and-privacy) | What stays local and what leaves your computer |
| 13 | [Running it online](#13-running-it-online) | Password-protected hosting |
| 14 | [Tips and troubleshooting](#14-tips-and-troubleshooting) | Common questions |

---

## 1. Quick start

**You need:** Node.js 20 or newer, a Claude Pro or Max subscription (no API key needed), and an internet connection. Windows, macOS and Linux all work.

```bash
git clone <this repository>
cd phd-analyzer
npm install
npm start
```

Open <http://localhost:5179>. On Windows you can double-click `Talvis.bat` instead: it installs packages if needed, starts the app and opens the browser.

**Connect Claude (once):**

1. Click **Connect to Claude** in the chat (or the **CLAUDE** button in the header).
2. Sign in on the page that opens and click **Authorize**.
3. Paste the code it shows into the box in the app and confirm.

The sign-in is remembered on this computer. You can also sign in from a terminal with `claude auth login`.

---

## 2. First run: your research interests

On first start a welcome screen asks one question: **what do you want to research?** Type your interests the way you would say them, short or long, abbreviations are fine:

> NLP, adaptive learning, HCI, LLMs, language learning apps

Optionally add target countries, then click **Group my interests and start**. Talvis then runs the `setup_directions` background job:

| Step | What Talvis does | Where you see it |
|---|---|---|
| 1 | Looks up each interest in the literature (OpenAlex) to learn the established field name and its vocabulary | Chat, system log |
| 2 | Groups your interests into 2-5 **direction groups**: PhD-sized areas a supervisor would recognise | Directions card |
| 3 | Adds one or two starter **topics** per group | Topics card |
| 4 | Starts `find_universities`: universities with active researchers in your groups that meet your criteria | Universities card |
| 5 | Starts `direction_fit`: compares the groups with evidence so you can choose | Directions card |

**Example of grouping**

| Your interests | Direction group Talvis might create | Why |
|---|---|---|
| adaptive learning, language learning apps, HCI | Human-computer interaction | Systems built around how people learn and interact |
| NLP, LLMs | Natural language processing | Same research community, venues and supervisors |
| NLP + adaptive learning | NLP for education (hybrid) | Created only when your interests clearly bridge both |

Every interest lands in at least one group, and Talvis never adds interests you did not mention. You can rename, merge, drop or delete groups later in the **Directions** panel, and run the grouping again from the Profile or Directions panel after you change your interests.

You can skip the welcome screen and fill the board by hand; it does not come back once you have interests or direction groups.

---

## 3. The screen

| Part | What it shows |
|---|---|
| **Header** | App name, date, next deadline countdown, today's task count, view switch, docs button, Claude account status |
| **Direction filter** (under the header) | `All` plus one chip per direction group. Picking a group filters every card, panel and the network view to that group; Talvis is told which group you are looking at |
| **Modules view** | Module cards on the left, the Talvis chat on the right. Click a card title to open or close it, the expand icon to open its full panel |
| **Network view** | Everything as a knowledge graph (you, topics, universities, groups, researchers, papers, gaps, venues, deadlines) with the chat docked beside it |
| **System log** | The latest actions of Talvis and of you, with time stamps |
| **Expanded panel** | The full editor of one module. The Universities panel opens across the full width; long notes collapse into an eye button you click to read |

When Talvis works on a module, its card lights up and shows the job progress.

---

## 4. Talvis, the AI core

Talvis is a Claude agent that can use only this app's tools plus web search. On every message it gets a fresh summary of your whole board, so you can ask in plain words:

| You ask | Talvis does |
|---|---|
| "What should I do today?" | Builds a plan from deadlines, open tasks and unread papers, saves 3-6 tasks |
| "Who works on learning analytics at TU Delft?" | Searches OpenAlex for researchers there, with h-index and matching papers |
| "Find recent papers on LLM tutors" | Searches OpenAlex, Semantic Scholar and arXiv, saves the important ones |
| "Is a language test required at ETH Zurich for me?" | Reads the official page, checks whether a waiver applies to your citizenship and degree |
| "Draft an email to [R12]" | Writes a draft in Documents using the researcher's real papers |
| "Estimate my admission chance at [U4]" | Reads the admission rules and numbers, saves the estimate with reasons |

Anything lasting you tell it (a topic, a target university, a deadline, a professor you emailed) is saved to the board right away.

**Board IDs.** Talvis refers to items with a letter and a number so you can find them:

| Prefix | Item | Prefix | Item |
|---|---|---|---|
| `T` | Topic | `P` | Paper |
| `U` | University | `X` | Research gap |
| `D` | Deadline | `V` | Venue (journal / conference) |
| `K` | Task | `S` | Document |
| `R` | Researcher | `J` | PhD position |
| `G` | Research group | `I` | Student-voice insight |
| `A` | Direction group | | |

**It does not make things up.** The tools enforce it, not just the instructions:

| Rule | How it is enforced |
|---|---|
| Papers are real | Papers are saved only by ID (OpenAlex, DOI, arXiv, Semantic Scholar); the metadata is fetched from the source |
| Gaps have evidence | A research gap can only cite papers already in your library |
| Verified deadlines have a source | `verified` needs the official page URL |
| Rankings and language rules have a source | A rank or a language-test status is saved only with its source URL |
| Links were really seen | Positions, student-voice evidence and admission-chance sources must be URLs that appeared in a search or page Talvis actually read |

---

## 5. Modules one by one

| Module | What it stores | Main actions |
|---|---|---|
| **Profile** | Research interests, target countries, ranking limit, conditions, name, field, stage, target intake, citizenship, education, background | Group interests into directions, find universities |
| **Directions** | Direction groups (name, description, keywords, status, your interest 1-5) and Talvis' evidence-based fit analysis | Compare all groups, analyse one, edit keywords, filter the board |
| **Universities** | University, country, ranking (with source), language-test rule (with source), fit note, **admission chance**, status, researchers, next deadline | AI search by criteria, search by name, estimate admission chances, Scout, check deadlines, Reddit analysis |
| **PhD positions** | Positions and programmes from portals: university, funding, supervisor, deadline, status | Search portals, scan all portals for your profile, save, shortlist |
| **Student voice** | What students say about a university on Reddit: summary, sentiment, themes, quotes with links, caveats | Analyse a university, search Reddit directly |
| **Deadlines** | Application, scholarship, interview, document, conference and journal dates | Verify against official pages, countdown, mark done |
| **Today** | Tasks: overdue, today, upcoming | AI daily plan, add tasks, todo / doing / done |
| **Documents** | SOP, research proposal, CV, emails, cover letters, notes | Editor, **Ask Talvis to write**, **Ask Talvis to review** |
| **Topics** | Concrete research topics, keywords, priority | Gap analysis, paper search, publication trend |
| **Research groups** | Labs, their university, PI and link | Filled when you scout a university |
| **Researchers** | Name, university, h-index, matching papers, relevance, contact status, links | "Who works on this?" search, their papers, email draft |
| **Papers** | Real papers with abstract, TLDR, reading status, notes | Search three sources, explain, related work |
| **Research gaps** | Gap, evidence papers, novelty and feasibility (1-5), methods | Gap analysis, turn into research questions |
| **Publish** | Journals and conferences with fit, h-index, OA/APC, DOAJ status | Venue matching for a title and abstract |

**Profile criteria** decide which universities and positions count as a match:

| Criterion | Options |
|---|---|
| Research interests | Free text with suggestions; Talvis groups them into direction groups |
| Target countries | Free text with suggestions; empty means anywhere |
| Ranking | QS, THE, ARWU or any; top 50 / 100 / 200 / 300 / 500 / 1000 or no limit |
| Conditions | No IELTS/TOEFL required, funded, no tuition, taught in English, no GRE, no application fee, no master's required, rolling admission, plus free text |
| Citizenship and education | Used to check whether a language-test waiver applies to you and to estimate admission chances |

---

## 6. Background jobs

Long tasks run in the background, so the chat stays free. Progress shows on the card; when a job ends, its report is posted in the chat. You can stop a running job from its button.

| Job | Start it from | What it produces |
|---|---|---|
| `setup_directions` | Welcome screen, Profile, Directions | Direction groups from your interests, starter topics, then starts the university search and the comparison |
| `find_universities` | Profile, Universities | 6-12 universities that meet your criteria, with ranking and language-rule sources, fit notes, admission chances and a list of strong candidates it excluded and why |
| `admission_chance` | Universities | An estimated admission chance (0-100) with reasons for every university, or one |
| `scout_university` | Universities ("Scout") | 4-8 matching researchers, their key papers, lab pages and PhD deadlines for one university |
| `verify_deadlines` | Deadlines, Universities | Dates checked on official pages, missing deadlines added |
| `gap_analysis` | Topics, Research gaps | 3-6 research gaps, each tested against "is this already solved?" and backed by papers |
| `direction_fit` | Directions | The same depth of research for every group, scored on 8 criteria, with a verdict |
| `portal_scan` | PhD positions | Open positions from all portals that pass your criteria, with deadlines |
| `student_voice` | Student voice, Universities | One evidence-backed analysis of what students say about a university |
| `venue_match` | Publish | Real venues for your manuscript with fit, tier and next deadline |
| `daily_plan` | Today | 3-6 concrete tasks for today with time estimates |

Jobs use your Claude subscription. Deeper jobs (Settings → research job effort) are more thorough and use more of your plan limit.

---

## 7. Admission chance

Each university can carry Talvis' **estimate** of your chance of being admitted, shown as a coloured scale. The board card and the Universities panel are sorted by it; universities without an estimate come last, by rank.

| Band | Range | Meaning |
|---|---|---|
| good | 65-100 | You meet the requirements and the competition is manageable |
| moderate | 40-64 | Realistic, but depends on supervisor fit or funding |
| low | 20-39 | Competitive for your profile; apply as a reach |
| very low | 0-19 | Very selective, or a requirement you do not meet |

How Talvis estimates it, in order of weight:

1. **Formal eligibility.** A hard requirement you do not meet (degree, minimum grade, a test without a waiver that applies to you) caps the chance at 10.
2. **Competition.** Published acceptance rates and applicants per funded place; without numbers, the ranking and how sought-after the programme is.
3. **Research fit and supervisors.** Matching researchers who take PhD students raise it.
4. **Funding.** Funded places open to your citizenship.
5. **Your record.** Degrees, grades, publications and research experience.

Click the eye next to the scale to read the reasons and the source. Run **AI: estimate admission chance** again after you change your profile or contact a professor. It is an estimate to help you balance your list, not a prediction.

---

## 8. Direction groups and comparison

Direction groups organise the whole board. Every paper, researcher, topic, university and position falls into the groups whose keywords match its own text (paper title and abstract, researcher concepts, fit notes). When an item matches two groups about equally, it belongs to both. Talvis can correct a single item, and you can edit a group's keywords.

The **Directions** panel compares the groups side by side. Rate your own interest with stars (Talvis never guesses it), then run the comparison. Each group is scored 0-10 on:

| Criterion | Weight | What it measures |
|---|---|---|
| Personal fit | 20% | How well your experience, skills and education prepare you |
| Interest | 15% | Your own rating (1-5) |
| PhD opportunities | 15% | Funded positions and programmes in your target countries |
| Supervisors | 15% | Active, well-matched professors at your target universities |
| Field momentum | 10% | Whether publications in the area are growing |
| Novelty potential | 10% | Open gaps and fresh angles |
| Feasibility | 10% | Data, resources, finishing in 3-4 years |
| Career | 5% | Prospects in academia and industry |

Every score comes with a one-line reason and evidence (board IDs or links).

---

## 9. Settings

Click the **settings (gear) button** in the top bar.

| Setting | Options | Default |
|---|---|---|
| Model | Claude Opus 5.5, Claude Sonnet 5.5, Claude Fable 5.1, Claude Haiku 5.5 | Claude Opus 5.5 |
| Board language | Any language name, e.g. English, German, Turkish | English |
| Chat effort | low, medium, high, xhigh | medium |
| Research job effort | medium, high, xhigh, max | high |
| OpenAlex API key / mailto | Free key from openalex.org | empty |
| Semantic Scholar key | Optional key | empty |
| Browser for JS-heavy sites | auto (Edge, then Chrome), Edge, Chrome, Chromium | auto |
| Show the browser window | on / off | off |
| Reddit app client id / secret | From reddit.com/prefs/apps ("script" app) | empty |
| TRDesk key / address / plan | Optional integration | empty (off) |

**Board language** is the language of notes, analyses and job reports that Talvis saves. In the chat it always answers in the language you write in.

---

## 10. Claude accounts

Click **Claude** in the top bar.

- **Account 1** is this computer's default Claude sign-in. **Add account** adds more; each is stored separately under `data/accounts/`.
- For each account you see the plan, email, 5-hour and 7-day usage, and when a reached limit resets.
- With **automatic switching** on, when the active account reaches its limit, Talvis continues on the next ready account and carries the recent conversation over.

Only add accounts you own; every account is subject to Anthropic's terms.

---

## 11. Optional integrations

| Integration | What it adds | How to turn it on |
|---|---|---|
| OpenAlex key | A bigger daily budget for paper, researcher and venue search | Free key at [openalex.org/settings/api](https://openalex.org/settings/api), paste in Settings |
| Semantic Scholar key | Fewer rate limits for TLDRs and recommendations | Settings |
| Reddit app | Scores, comment counts and full text in Student voice (without it, public RSS feeds are used) | Create a free "script" app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps), paste id and secret in Settings |
| TRDesk | Talvis mirrors deadlines and dated tasks into a "PhD plan" in the TRDesk task manager and syncs completion both ways | Paste a TRDesk agent key (`trd_...`) and the TRDesk address in Settings. Without a key, TRDesk is hidden everywhere |

---

## 12. Data and privacy

- Your board lives **only on your computer** in `data/phd.db` (SQLite). The server listens on `127.0.0.1`, so other devices cannot reach it.
- Claude sign-ins: Account 1 in your default Claude folder, extra accounts under `data/accounts/`. Do not share these folders.
- What leaves your computer: chat messages and the board summary go to Claude (under Anthropic's terms); search queries go to the scholarly APIs, Reddit and the PhD portals; web pages are opened like any normal visit; each key goes only to its own service.
- Student-voice analyses quote public posts with links and never name or profile individual Reddit users.
- `data/` is in `.gitignore`, so it never ends up in a repository.

---

## 13. Running it online

You can host the app (for example on Google Cloud Run) and open it from anywhere:

- Everyone signs in with their own account and gets their own board: universities, papers, tasks, chat and jobs are never shared. Visitors who are signed out see the welcome page first, then **Sign in** or **Create account**; creating an account also asks for research interests, field, stage and target countries, which fill the new board's profile.
- The first account is the **admin**: it keeps the board that existed before accounts, and only it changes Settings (model, keys, browser, TRDesk) and the Claude accounts everyone's Talvis runs on.
- Anyone who can open the address can create an account, and every account's Talvis runs on the admin's Claude subscription. Sessions last 30 days; **Sign out** is in the navbar and in Settings → Your account, where you can also change your password.
- Set `DATABASE_URL` to a PostgreSQL database: the board and the Claude sign-ins made on the server are kept there, so restarts lose nothing. Run one instance per database.
- `deploy.ps1 -Project <your-gcp-project>` builds and deploys the container and stores both secrets in Secret Manager.

Details are in the README under "Deploy to Google Cloud Run".

---

## 14. Tips and troubleshooting

| Situation | What to do |
|---|---|
| "Claude sign-in required" | Click **Connect to Claude**, or run `claude auth login` in a terminal |
| A job seems stuck | Open its module panel to see progress; stop it and start again. Very deep jobs can take 10-30 minutes |
| A page did not load for Talvis | Some sites block automated visits. Talvis says so and gives you the link to open yourself |
| Few universities found | Relax a condition, raise the ranking limit, or add countries |
| Port 5179 is in use | Close the other process, or run with another port: `PORT=5180 npm start` |
| The board looks empty | Check the server is running (a red "no connection" notice appears at the top) and reload |
| Wrong grouping of an item | Ask Talvis to move it ("[P12] belongs to HCI"), or edit the group's keywords |
| Want to start over | Stop the app and move `data/phd.db` away; a fresh board starts with the welcome screen |

Good luck with your PhD.
