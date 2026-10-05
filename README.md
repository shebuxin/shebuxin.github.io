# Buxin She Personal Website

This repository contains the source for [shebuxin.github.io](https://shebuxin.github.io), a personal academic website built with Jekyll and GitHub Pages.

## Prerequisites

- Ruby 3.3.11 (see `.ruby-version`)
- Bundler 2.6.9
- Node.js 24.17.0 (see `.node-version`)
- npm 11.13.0
- Python 3.10 or newer for the visitor-map updater; Python 3.12 recommended for the local pandapower course experiments

A version manager such as `rbenv`, `asdf`, or `mise` can install the versions declared by the two version files.

## Install dependencies

Install the locked Ruby and JavaScript dependencies from the repository root:

```sh
gem install bundler -v 2.6.9
bundle _2.6.9_ config set --local path vendor/bundle
bundle _2.6.9_ install
npm ci
python -m pip install -r scripts/requirements-visitor-map.txt
```

## Build and preview

Rebuild the committed JavaScript bundle, then start Jekyll with the development configuration:

```sh
npm run build:js
bundle exec jekyll serve --host 127.0.0.1 --config _config.yml,_config.dev.yml
```

The site will be available at <http://localhost:4000>.

GitHub Pages 232 currently requires WEBrick 1.9.2, which has no released fix for CVE-2026-38969. WEBrick is used by the local preview server and is not included in the generated static site. Keep previews bound to `127.0.0.1` and do not expose them to an untrusted network until an updated dependency is available.

For a production build, run:

```sh
JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter
```

## Bilingual content

English pages keep their existing URLs. Simplified Chinese mirrors live under `_pages/zh/` and publish under `/zh/`. The header language switch derives the matching URL from that shared path structure, so each public English page should have a Chinese page with the same trailing path.

The Chinese publications page reuses the English publication list and translates only its framing and generic labels. Update publication entries in `_pages/publications.md`; do not duplicate them in the Chinese page.

## Course development

Teaching links to ECE 685 at `/teaching/ece685/`, with a Chinese mirror at `/zh/teaching/ece685/`. Both use one complete **Lecture Navigation** containing 30 knowledge lectures, retaining their original IDs, order, L09b supplement, and numbering gaps. The approved L01–L15 material is integrated into its original lecture pages (16 available lectures including L09b). Each page combines its own slides with diagrams, experiments, editable Python and companion practice. L20 onward is marked **to be released**. Exam practice/review chapters L16, L17, L30 and L41, their legacy routes, and their published assets are removed. The old DC power-flow demo remains removed.

`_data/ece685.json` holds the imported slide outlines and release state. `_data/ece685_topics.json` maintains translations, topic groups, release metadata, experiment mappings, and `excluded_lectures`; the importer skips excluded exam chapters when refreshing the original course package. `_data/ece685_lecture_lessons.json` selects each lecture’s supplemental concepts and focus. The shared course layout supports bilingual search, topic/reading filters, section links, previous/next lecture navigation, and browser-local outline reading marks.

Released student PDFs are copied unchanged into `assets/slides/ece685/`; `_data/ece685_slides.json` records their SHA256 hashes, page counts and reader assets. The slide reader displays every original page in sequence as WebP, includes extracted page text and keyboard navigation, and links to the exact PDF. Instructor/narration materials and actual exam papers are excluded. PDF pages are the authoritative lecture content; authored diagrams and calculations supplement them.

To refresh the original outline, bilingual pages, and released slide assets:

```sh
python3 scripts/import_ece685_outline.py /path/to/ECE685_Course_Package_v2
python3 scripts/import_ece685_lecture_assets.py /path/to/ECE685_Course_Package_v2
```

The asset importer requires Poppler, Pillow and pypdf. Add lecture metadata before importing new IDs; set `released: true` only when content is ready, `lesson: integrated` and `interactive_model` to attach a reusable experiment, or `lesson: l05-phasors` for L05. The outline importer preserves page bodies and generates asset flags and legacy redirects. Original IDs always control course order. Released lessons use continuous sections; upcoming pages retain the outline and reserved workspaces.

Lecture 05 (`l05-single-phase-ac-i`) preserves the opening diagnostic, CE-2A and CE-2D, waveform/phasor predictions, editable Python and fixed practice. Its source slides are now included in the same page. `l05-phasor-model.js` and `l05_phasors.py` use cosine-reference RMS phasors, rectangular addition, waveform reconstruction, numerical RMS and voltage/current phase comparison. A time cursor reads instantaneous voltages without rotating reference phasors; zero resultant angle is undefined. Practice checks fixed source inputs with ±0.05 V/° tolerance and angles modulo 360°.

The six reusable experiment families remain internally in `_data/ece685_stage_one.json` and shared `ece685-stage-*.html` includes, with JavaScript/Python parity in `ece685-stage-model.js` and `ece685_stage_one.py`. They render directly within their mapped original lectures, without independent module pages or navigation. Students can change controls, inspect numerical checks, edit experiment and model code, run parameter scans, stop Python, and download standalone scripts. Python plots retain their own sampling grids and compare with the current valid reference without extrapolation. Browser-local practice marks are keyed by **lecture ID**, separate from outline reading marks. The first browser Python run requires jsDelivr access.

Overview calculations use prescribed P/Q accounting. Generation distinguishes L03 daily energy from L04 annual screening curves and labels its rounded portfolio as illustrative. Three-phase models derive line quantities from terminal phasors and support ABC/ACB. Transformer models distinguish winding/line ratios, approximate regulation/losses, and single-phase OC/SC test recovery; later connection extensions do not make L20–L21 available. Per-unit checks preserve physical quantities under base changes.

Run `node --test tests/l05_phasor_test.cjs tests/ece685_stage_test.cjs` for source examples, physical identities and independent Python parity. After building, `python3 tests/ece685_rendered_test.py` verifies the single complete navigation, original lecture order, bilingual inline lessons, future release states, unchanged student PDF hashes, all reader pages, legacy redirects, and absence of assessment pages/assets. Former `/modules/<topic>/` and `/lecture-01/<topic>/` knowledge routes redirect to their corresponding original lecture; `/lecture-01/` redirects to the course overview.

AI Chat corpus preparation exports released lessons and registered course references without an API account or model calls:

```sh
JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter
python3 scripts/export_ece685_chat_corpus.py --lecture L05
python3 scripts/export_ece685_chat_corpus.py
```

Exports go into ignored, unpublished `tmp/ece685-chat/<corpus-version>/` folders. `documents.jsonl` contains stable document IDs, bilingual source links, source/content hashes and course positions. `manifest.json` enumerates the exact Markdown files for a later index upload; consumers must verify its hashes and use this list, rather than scan directories. The corpus version changes with the selected scope or its content. Upload file hashes remain stable for unchanged documents. `quality-report.json` covers every physical PDF page and flags missing/sparse text, suspicious glyphs and math layout needing review. PDF extraction does not preserve mathematical layout or diagram meaning; formulas authored on the webpage retain their original `data-math`/`data-stage-math` LaTeX. Review flags do not certify unflagged pages.

The exporter checks release state, excluded lecture IDs, student asset paths, PDF hashes, page ordering and rendered lecture identity. It extracts only each lecture's rendered teaching sections, omitting navigation, shared JSON config, hidden answers, editable fields and future-source lists. Python excerpts contain the current teaching handler, its helpers and model defaults. Unreleased lessons, exam chapters and instructor materials are outside the allowlist. Build Jekyll again after changing course sources before exporting.

Lecture coverage is only one part of RAG preparation. `_source/ece685-rag/sources.json` registers the Fall 2026 syllabus, Glover/Overbye/Sarma **sixth edition (2017)**, and two original course-archive EIA readings. On 2026-10-04 the instructor selected the sixth edition as the platform textbook basis. This choice is a separate indexed material-selection record; the original syllabus's **seventh edition (2023)** wording is preserved. Preparing this platform no longer requires locating the seventh edition. Section, page, example and exercise identities default to the sixth edition; an explicitly requested different edition must use its own exercise text. The textbook import covers notation and Chapters 1–6 based on the syllabus, with chapter/section bookmarks, printed pages and physical PDF pages kept separately. Textbook chapters can provide background for syllabus topics whose lecture pages are not yet released; unpublished lecture files remain excluded. Archive syllabi, student work, grades, actual exams and solution archives are not current reference sources.

Raw registered PDFs belong in ignored `_source/ece685-rag/materials/`; file names, checksums and page ranges are explicit in the registry. Install `scripts/requirements-ece685-rag.txt` in a Python environment before preparing references:

```sh
python3 scripts/import_ece685_chat_references.py
python3 scripts/export_ece685_chat_corpus.py --references tmp/ece685-chat/references/<reference-version>
```

The importer outputs eligible `references.jsonl`, withheld `quarantine.jsonl`, a coverage report and a hash-checked manifest. PDF mathematical fonts can produce false characters (for example, “=” extracted as “5”); affected pages and suspicious glyphs are quarantined and never copied into upload Markdown. Verified, source-hash-bound formula notes are maintained separately in `_source/ece685-rag/verified-notes.json`. Math layout and tabular readings still need review even when no damaged-font flag is found. Dated EIA data retain publication years, units and cost assumptions; the archive file named AEO2025 is dated January **2024** on its cover.

Combined corpus manifests use schema 2 and identify the selected textbook edition and the material-selection document. Public lessons have webpage URLs; private reference citations have edition/year/chapter/printed-page/PDF-page labels and **null URLs**, rather than invented public textbook links. The instructor's material-selection record has its own dated citation and no PDF page. Later server-side citations must preserve this distinction and use only eligible records for retrieval or direct model context. Reference corpora are restricted to ignored output locations inside the repo. They are not website assets. Default lecture-only exports report `lecture_only_incomplete`; combined exports report `preparation_in_progress`. Formula/table repair and actual retrieval/model evaluation remain explicit work. Fifteen reference evaluation cases are in `_source/ece685-rag/evaluation-cases.json`, including the scoped instructor choice and exercise-coverage limitations. Run `python3 -m unittest discover -s tests -p 'test_ece685_chat_*.py'` for corpus and reference checks; CI uses fixtures, without private PDFs or paid APIs.

Slide citations use `?slide=N#lecture-overview`, where N is the **physical PDF page**, not the outline number (L05 has 32 outline entries and 34 PDF pages). The reader exposes `data-current-page` and emits a bubbling `ece685:slide-change` event with course ID, lecture ID, page number and section ID for the chat component. Invalid links open page 1. Run `python3 -m unittest discover -s tests -p 'test_ece685_chat_corpus.py'` and `node --test tests/ece685_slides_test.cjs`; after building, `python3 tests/ece685_chat_rendered_test.py` verifies all released lecture mappings and selected formulas.

The bilingual chat sidebar is implemented behind `course_chat.enabled: false`. It captures question context before sending, previews selected text, attaches selected student code only through an explicit action, renders escaped Markdown and KaTeX, and handles streamed completion, cancellation and failure. The Cloudflare backend, D1 sessions/atomic quotas, Responses/File Search adapter and index sync tool are implemented and tested locally with a mock provider. Real index upload, model evaluation and cloud deployment are pending account configuration. A loopback-only demonstration streams labeled fixed responses using real corpus positions; it makes no model calls. See `services/course-chat/README.md` for the request/SSE contract and local preview:

```sh
JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter --config _config.yml,services/course-chat/preview.yml --destination tmp/ece685-chat/site
python3 scripts/serve_ece685_chat_preview.py --corpus tmp/ece685-chat/ece685-2cb02ab2374b55da3f58
```

Open `http://127.0.0.1:8788/zh/teaching/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview` and use the demonstration invitation code `DEMO`. Only L05 is enabled in this preview. CI checks the disabled production build and both language versions of the enabled preview. Run `node --test tests/ece685_chat_test.cjs` for context, rendering and stream checks, and `python3 tests/ece685_chat_ui_rendered_test.py --site-dir tmp/ece685-chat/site --enabled` after the preview build.

Backend code is shared by the root Pages Functions route and a standalone Worker. `services/course-chat/migrations/0001.sql` defines D1 storage; a scheduled cleanup handler removes expired sessions. `scripts/sync_ece685_chat_index.py --corpus <version-directory>` validates the exact manifest and regenerated upload content offline. `--mock` prepares a local-only mapping; `--upload` prompts for a private API key, resumes bounded uploads, reuses unchanged hashes and checks remote index membership before generating staged import and separate activation SQL. Generated files include private textbook excerpts and remain under ignored `tmp/ece685-chat/`. The local Wrangler configuration cannot be used for deployment. See [account configuration](services/course-chat/cloudflare-setup.md); production stays disabled until real course-answer and citation evaluations pass.

The Teaching catalog in `_includes/teaching-courses.html` also highlights the IEEE AI for Power & Energy Systems program. A separate **Physics-informed GNN for microgrid N-1 security prediction** course contains Balanced Power Flow, Unbalanced Power Flow, and PandaPower-based Implementation interactive lessons.

### IBR courses

The bilingual IBR series starts at `/teaching/ibr/` and `/zh/teaching/ibr/`. It contains three core courses and two advanced topics:

| ID | Course | Modules |
| --- | --- | ---: |
| C1 | IBR Dynamic Modeling and Simulation | 9 |
| C2 | IBR Stability, Model Reduction, and Validation | 8 |
| C3 | Physics-Informed Neural ODEs for IBR Dynamics | 9 |
| T1 | IBR Identification and Learned-Model Validation | 4 |
| T2 | Multi-IBR Network Dynamics | 4 |

C1 has nine authored bilingual lessons with equations, browser Python simulations, editable experiments, worked practice, and downloadable course notebooks. C2, C3, T1, and T2 retain their module outlines. Preparation and research writing are shared across the series. C1 supplies the modeling foundation for C2 and the advanced C3 project. T1 follows C1/C3, and T2 follows C1/C2.

`_data/ibr_courses.json` is the shared curriculum and module metadata. `_data/ibr_materials.json` maps source IDs to existing paths relative to the **PINN-IBR** repository, reviewed on October 3, 2026. These paths are maintainer references; the website does not publish local filesystem links, research attachments, or copied model outputs. A module's `sources` list points to this material index. `readiness` distinguishes existing material needing adaptation (`adaptation`), a new teaching experiment (`new`), models and data awaiting a learning pipeline (`data`), and a research case needing scoped teaching treatment (`research`). Original PINN-IBR files remain the source of the model equations, parameters, and experiment evidence.

`_includes/ibr-*.html` render the series, course, and module pages through the existing `course` layout. `assets/css/ibr-courses.css` is loaded only for pages with `ibr_courses: true`. Each module has section anchors, previous/next navigation, and its course's module list. English and Chinese URLs have matching trailing paths.

After adding new courses or modules to the data, create missing page wrappers with:

```sh
python3 scripts/build_ibr_course_pages.py
```

The generator preserves existing pages, including authored page bodies. Develop an individual lesson in its bilingual page bodies or a dedicated include, while retaining its IDs and permalink. Update the shared outline and preparation note as content becomes available. Run a strict Jekyll build and the existing generated-HTML checks after changing routes or navigation.

C1 content lives in `_data/ibr_modeling.json` and `_includes/ibr-modeling-*.html`. The dedicated `ibr-modeling` layout presents three curriculum stages and nine case-driven lessons. Each lesson connects an opening decision, illustrated causal chapters, equations, a worked numerical case, calculated response reading, a live lab, calculation/concept checks and a decision debrief. Chapter equation indices place formulas beside the relevant derivation. Its wrappers use `ibr_modeling: true`, which scopes the additional stylesheet, KaTeX, Python runner and lesson script. Course/module status values are `lessons`/`lesson`, with `readiness: developed`; other courses remain `framework`/`outline`.

`assets/code/ibr-modeling.py` is a separately authored, standard-library teaching solver. It uses the source power-invariant dq convention but does **not** copy or claim equivalence to the full-order `ibrsim` controllers. The frame experiment audits power invariance. The open-loop LCL experiment retains six electrical states, using a 2 μs RK4 step. Low-frequency GFL/droop/VSM/parallel cases retain 4/3/4/7 states, use a common PCC and nominal-frequency algebraic impedances, and start at total PCC P=0.6, Q=0. The switch demo explicitly reconstructs the incoming VSM source and recalibrates its command/voltage offset; it is not a same-command transition or the source's full transition model. DC, limits, protection and switching ripple are omitted. Declared parameters and source paths accompany each lesson.

The lab and editable-code panel run that Python source through the existing Pyodide 0.28.3 worker, with fresh namespaces, stop/restart and timeout handling. Precomputed previews come from the same solver and include its SHA-256; controls require Run before the curve updates. JSON export stores the result's actual parameter snapshot. No Python parameters or code are sent to a computation server. First initialization needs jsDelivr. VSM may not settle in 4 seconds; the duration control extends to 20 seconds, and the lesson preserves oscillatory cases rather than assuming stability.

The 18 figure types in `assets/images/ibr-modeling/` have separate English/Chinese SVGs. `scripts/build_ibr_modeling_figures.py` draws the schematics and calculates response curves from the teaching solver; plot metadata records the case and source SHA-256. `_data/ibr_modeling_figures.json` is the generated asset manifest. Notebook images are embedded as Markdown attachments, so they remain available offline.

After changing C1 content, equations or figures, regenerate downloads/previews and verify:

```sh
python3 scripts/build_ibr_modeling_baselines.py
python3 scripts/build_ibr_modeling_figures.py
python3 scripts/build_ibr_modeling_notebooks.py
JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter
python3 tests/ibr_modeling_test.py
```

The tests check analytic Park/power results, terminal equilibrium matching, KCL and branch power sums, VSM RoCoF, droop steady slope, explicit reset continuity away from equilibrium, exact event boundaries, energy balance, timestep refinement, invalid inputs, baseline/source consistency, notebook execution, analytic answers for all nine calculation exercises, figure accessibility/source metadata, offline figure attachments, and bilingual rendered structure. These establish mathematical and numerical consistency within the stated teaching domain; they do not constitute external or full-order model validation.

The Balanced Power Flow chapter lives at `/teaching/physics-informed-gnn/balanced-power-flow/`. English and Chinese lesson pages share `_includes/balanced-*.html`, `_data/balanced_controls.yml`, and `assets/css/balanced-power-flow.css`. It uses a three-bus balanced AC constant-PQ model with an analytic Newton Jacobian, line outages, and radial/meshed configurations. `assets/js/balanced-power-flow-model.js` powers the immediate slider response; `assets/js/balanced-power-flow-lesson.js` renders SVG diagrams and connects the controls.

The code panel runs the editable `assets/code/balanced_power_flow.py` solver through Pyodide 0.28.3. `assets/js/balanced-python-worker.js` keeps the original URL and imports the shared `course-python-worker.js`. Python executes in the student's browser, without a server kernel or external Python packages. Its first load needs access to jsDelivr; Stop terminates the worker. Each run receives a fresh `case` snapshot, and the resulting Python voltage profile is separate from the slider reference. KaTeX 0.16.22 renders formulas. Both CDN versions are pinned.

All three power-flow chapters use `_data/power_flow_code.yml` and `_includes/power-flow-code-guide.html` to show the input dictionary, folded editable source, dependencies/function map, commented `main()` and result-field guide. `assets/js/power-flow-code-examples.js` supplies bilingual entry programs and a live Python-literal input preview. Source runs before the entry program in the worker's shared namespace; downloaded experiments combine inputs, source and main. After installing the pandapower requirements, `node --test tests/power_flow_code_examples_test.cjs` executes both language versions against the real models, including three-phase and islanded cases.

The three power-flow chapters also share eight instructional figures through `_includes/power-flow-illustration.html` and `assets/css/power-flow-illustrations.css`. The balanced chapter adds a symbolic branch-to-admittance diagram: `assets/js/power-flow-illustrations.js` highlights each branch's four matrix contributions and updates them when a branch opens. It uses generic bus labels independently of the worked feeder. Run `node --test tests/power_flow_illustrations_test.cjs` to check complex-current KCL across all eight switch configurations and the four-entry removal rule.

Run `node --test tests/balanced_power_flow_test.cjs` to check the analytic Jacobian against finite differences, radial solutions against an independent backward/forward sweep, branch power balance, topology failures, and JavaScript/Python agreement. Python 3 must be available. The 0.95–1.05 pu band and adjustable current limits are teaching settings, not claims of compliance with a particular network standard.

The Unbalanced Power Flow chapter lives at `/teaching/physics-informed-gnn/unbalanced-power-flow/`, with a matching Chinese page. Its JavaScript model (`assets/js/unbalanced-power-flow-model.js`) uses a damped backward/forward sweep on an explicit four-conductor radial feeder. Wye constant-PQ loads see local phase-to-neutral voltages; the source neutral is grounded and downstream neutrals return through the wire. The illustrative series matrices include phase mutual reactance, finite or ideal neutral impedance, and no phase-neutral mutual terms or earth-return paths. Controls set phase loads, PV connection, neutral/line impedances, and branch outages. VUF is the complex negative/positive sequence ratio; phase voltages and neutral displacement are also shown.

`_includes/course-code.html`, `assets/js/course-python-runner.js`, and the shared worker run the editable `assets/code/unbalanced_power_flow.py` model. UI markup and controls live in `_includes/unbalanced-*.html` and `_data/unbalanced_controls.yml`, with chapter-specific SVG rendering in `assets/js/unbalanced-power-flow-lesson.js`. Stop/restart, experiment download, and solver editing are supported.

Run `node --test tests/unbalanced_power_flow_test.cjs` for an independent rectangular Newton comparison, reduction to the balanced AC lesson, conductor KCL/KVL, per-phase constant power, neutral and phase I²R loss, sequence conventions, topology/error handling, and Python parity. The 2% VUF threshold is a teaching reference, alongside the voltage and conductor-current limits. Delta loads, transformers, harmonics, downstream grounding, and an open-neutral-only fault are outside this chapter's model.

The PandaPower-based Implementation chapter lives at `/teaching/physics-informed-gnn/pandapower-based-implementation/`, with a Chinese mirror. `_includes/pandapower-lab.html`, `_data/pandapower_controls.yml`, and `assets/js/pandapower-implementation-lesson.js` provide parameter controls, generated construction code, network/voltage/loading figures, and result tables. `assets/code/pandapower_implementation.py` builds and solves real pandapower networks and reads result DataFrames. Balanced `runpp()` reproduces the prior balanced AC lesson; `runpp_3ph()` uses phase powers and sequence/earth-return assumptions, which differ from the explicit finite-neutral model of the preceding chapter.

`assets/js/pandapower-worker.js` lazily loads Pyodide 0.28.3 and the scientific stack, then installs pinned pandapower 3.2.1. The lab and code panel use separate workers; Stop terminates the corresponding runtime. Every operating point is computed by pandapower, with `numba=False`, not by a JavaScript approximation. Initialization requires jsDelivr, PyPI, and files.pythonhosted.org and may take a minute or longer. Each run has a fresh namespace/case; slider changes are debounced and obsolete results are discarded. User code can be interrupted with Stop. The parameter lab uses the original model even if the code-panel model source is edited.

Download `assets/code/pandapower_implementation.ipynb` for a self-contained Notebook, or install `assets/code/requirements-pandapower.txt` in an isolated Python environment and run the `.py` model. Regenerate the Notebook after model changes with `python scripts/build_pandapower_notebook.py`. Verify with `python tests/pandapower_implementation_test.py`: real-library results are compared with the independent balanced solver, symmetric three-phase reduction, reconstructed phase KCL/KVL/impedance losses, supply/security labels, and execution of all Notebook computation cells. The result reader is scoped to a line-only feeder; richer equipment needs corresponding connectivity and balance handling.

## Checks

Run the same deterministic JavaScript checks used by CI:

```sh
npm ci
npm audit
npm run check:js
```

CI also builds the site with the locked GitHub Pages dependency set, checks for duplicate HTML IDs, and verifies generated internal links. External URLs are intentionally excluded from CI because third-party availability is outside this repository's control.

## Website visitor map

An independently deployable replacement is available in [`services/analytics`](services/analytics/README.md): owned Python/SQLite storage, authenticated reporting, detailed pageview records, referral/campaign breakdowns, optional offline geolocation, and CSV export. Deploy it before switching `_config.yml` to `self-hosted`; the current GoatCounter configuration remains active until then. The owned backend uses a separate public map snapshot and preserves the existing historical data.

GoatCounter continues to collect site analytics through the existing Jekyll analytics include. The `Update visitor map` workflow reads aggregate visitor countries across the website each day and updates `_data/visitor_countries.json` only when the public data changes.

One-time setup:

1. In the `buxin.goatcounter.com` account, keep country-level location collection enabled. For a cumulative map, set data retention to never delete, then create an API token with read-statistics access for this site only. The workflow assumes the GoatCounter account timezone is `America/Chicago`; if it differs, set an Actions repository variable named `GOATCOUNTER_TIMEZONE` to the account's IANA timezone.
2. In this GitHub repository, add that token as an Actions repository secret named `GOATCOUNTER_API_TOKEN`.
3. Run the `Update visitor map` workflow once from the Actions tab.

To seed the map from a GoatCounter JSON export without committing the raw archive, install the dependencies above and run:

```sh
python scripts/import_goatcounter_export.py /path/to/goatcounter-export.zip
```

The importer validates the export version and site, combines all page paths into country-level totals, and applies the same public minimum as the daily updater. The API updater then re-queries the complete date range and replaces this snapshot; it never adds new totals to the export, which would double-count visits. It also refuses a different scope, a later start date, or a lower cumulative total so retention and filter changes cannot silently erase the imported history.

Public country records contain only names, ISO codes, coarse country centroids, and aggregate visitor counts; the file also carries update dates and summary totals. It omits countries below two website visitors by default; set the optional Actions repository variable `VISITOR_MAP_MIN_COUNT` to another positive integer to change that threshold. Do not commit the GoatCounter token or expose it in browser-side JavaScript.

## Updating dependencies

Dependabot opens monthly npm, Bundler, and GitHub Actions updates. After accepting an npm dependency update, commit both `package-lock.json` and any regenerated `assets/js/main.min.js`. After accepting a Ruby dependency update, commit `Gemfile.lock`.
