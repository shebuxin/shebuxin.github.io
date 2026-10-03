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

Teaching links to ECE 685 at `/teaching/course-development/ece685/`, with a Chinese mirror at `/zh/teaching/course-development/ece685/`. The course overview includes seven completed bilingual modules, with lessons under `modules/`: system overview, generation planning, single-phase AC, three-phase AC, transformer modeling, per-unit, and Exam-1 review. Original slide pages link to their corresponding module. The framework also imports 34 current slide decks from `ECE685_Course_Package_v2/01_lectures`, retaining their original IDs, order, L09b supplement, and numbering gaps. Every lecture has a concept outline and previous/next navigation. L05 retains its separate phasor teaching loop; later course modules remain planned. The old DC power-flow demo has been removed.

`_data/ece685.json` holds the imported slide titles, counts, and source filenames. `_data/ece685_topics.json` holds Chinese titles, bilingual summaries, topic groups, and proposed experiment directions. `_layouts/ece685.html`, `_includes/ece685-*.html`, `assets/css/ece685.css`, and `assets/js/ece685.js` provide the shared interface. Search includes both languages and original slide headings; topic and reading filters, keyboard-accessible section tabs, and browser-local reading marks are supported. Reading progress refers to reviewing outlines, not completing lessons. Slide PDFs and instructor materials are not copied into the website.

To refresh the outline and bilingual lecture page stubs after editing the current decks:

```sh
python3 scripts/import_ece685_outline.py /path/to/ECE685_Course_Package_v2
```

Add new lecture metadata to `_data/ece685_topics.json` before importing new IDs. Develop each lecture through the shared workspaces. Set its `lesson` metadata to select a completed lesson include; the importer preserves this metadata and page bodies. L05 uses continuous section anchors instead of hidden tabs. General course pages use the `course` layout and `assets/css/course.css`.

Lecture 05 (`l05-single-phase-ac-i`) follows the source opening question, CE-2A, and CE-2D: diagnose RMS → study representations → predict and adjust voltage phasors → edit Python → solve and explain. `_includes/ece685-l05.html` provides both languages. `assets/js/l05-phasor-model.js` and `assets/code/l05_phasors.py` implement cosine-reference RMS phasors at a shared angular frequency, rectangular addition, waveform reconstruction, numerical RMS, and voltage/current phase comparison. SVG diagrams update immediately; a time cursor reads instantaneous voltages without rotating the reference phasors. Zero resultant magnitude has an undefined angle. Practice checks fixed source inputs with ±0.05 V/° tolerance and angles modulo 360°; it unlocks worked steps after an attempt.

The L05 Python panel reuses `course-python-runner.js` and `course-python-worker.js`. Students can edit experiment and model code, scan phases, stop a run, and download a runnable standard-library experiment. Its result waveform and input snapshot are shown alongside the current slider reference. Python's first browser run needs jsDelivr access. Run `node --test tests/l05_phasor_test.cjs` for source-example checks, cancellation and quadrant handling, independent time-domain integration, frequency behavior, input rejection, and Python/JavaScript parity. After building, `python3 tests/ece685_rendered_test.py` checks bilingual lesson structure and the other lecture pages.

The seven-module content is maintained in `_data/ece685_stage_one.json`, with thin bilingual page wrappers and shared `ece685-stage-*.html` includes. `assets/js/ece685-stage-model.js` and `assets/code/ece685_stage_one.py` implement matching, independently executable models. Each module provides authored SVG diagrams, formulas and worked steps, live controls and plots, editable Python with parameter scans and downloads, and fixed practice with tolerances and diagnostic feedback. Numerical and understanding checks must both pass before a browser-local practice mark is saved; the mark is separate from outline reading progress. Python plots retain their own sampling grids and are compared with the current valid reference without extrapolation.

The overview uses prescribed P/Q accounting, not a power-flow solver. Generation keeps L03 daily energy separate from L04 annual screening curves, applies adjustable renewable capacity credits, and labels its rounded portfolio as illustrative rather than an optimized commitment schedule. Three-phase models derive line quantities from terminal phasors and support ABC/ACB sequences. Transformer modeling distinguishes winding and line ratios, approximate bank regulation/losses, and a separate single-phase OC/SC test example; L20–L21 bank connections are labeled post-Exam-1 extensions. Per-unit checks preserve physical quantities under base changes. Review calculations follow public L16–L17 slide practice. Run `node --test tests/ece685_stage_test.cjs` for source examples, power identities, terminal KCL, transformer test recovery, base/referral invariants, invalid inputs, and Python/JavaScript parity across all seven modules. The rendered-site test checks both course overviews, all 14 module pages, source bridges, scoped assets and language routes. Former `lecture-01/` URLs redirect to the course overview and canonical module URLs.

The Teaching catalog in `_includes/teaching-courses.html` also highlights the IEEE AI for Power & Energy Systems program. A separate **Physics-informed GNN for microgrid N-1 security prediction** course contains Balanced Power Flow, Unbalanced Power Flow, and PandaPower-based Implementation interactive lessons.

### IBR courses

The bilingual IBR series starts at `/teaching/course-development/ibr/` and `/zh/teaching/course-development/ibr/`. It contains three core courses and two advanced topics:

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

C1 content lives in `_data/ibr_modeling.json` and `_includes/ibr-modeling-*.html`. Its wrappers use `ibr_modeling: true`, which scopes the additional stylesheet, KaTeX, Python runner and lesson script. Course/module status values are `lessons`/`lesson`, with `readiness: developed`; other courses remain `framework`/`outline`.

`assets/code/ibr-modeling.py` is a separately authored, standard-library teaching solver. It uses the source power-invariant dq convention but does **not** copy or claim equivalence to the full-order `ibrsim` controllers. The frame experiment audits power invariance. The open-loop LCL experiment retains six electrical states, using a 2 μs RK4 step. Low-frequency GFL/droop/VSM/parallel cases retain 4/3/4/7 states, use a common PCC and nominal-frequency algebraic impedances, and start at total PCC P=0.6, Q=0. The switch demo explicitly reconstructs the incoming VSM source and recalibrates its command/voltage offset; it is not a same-command transition or the source's full transition model. DC, limits, protection and switching ripple are omitted. Declared parameters and source paths accompany each lesson.

The lab and editable-code panel run that Python source through the existing Pyodide 0.28.3 worker, with fresh namespaces, stop/restart and timeout handling. Precomputed previews come from the same solver and include its SHA-256; controls require Run before the curve updates. JSON export stores the result's actual parameter snapshot. No Python parameters or code are sent to a computation server. First initialization needs jsDelivr. VSM may not settle in 4 seconds; the duration control extends to 20 seconds, and the lesson preserves oscillatory cases rather than assuming stability.

After changing C1 content or equations, regenerate downloads/previews and verify:

```sh
python3 scripts/build_ibr_modeling_baselines.py
python3 scripts/build_ibr_modeling_notebooks.py
JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter
python3 tests/ibr_modeling_test.py
```

The tests check analytic Park/power results, terminal equilibrium matching, KCL and branch power sums, VSM RoCoF, droop steady slope, explicit reset continuity away from equilibrium, exact event boundaries, energy balance, timestep refinement, invalid inputs, baseline/source consistency, notebook execution, and bilingual rendered structure. These establish mathematical and numerical consistency within the stated teaching domain; they do not constitute external or full-order model validation.

The Balanced Power Flow chapter lives at `/teaching/course-development/physics-informed-gnn/balanced-power-flow/`. English and Chinese lesson pages share `_includes/balanced-*.html`, `_data/balanced_controls.yml`, and `assets/css/balanced-power-flow.css`. It uses a three-bus balanced AC constant-PQ model with an analytic Newton Jacobian, line outages, and radial/meshed configurations. `assets/js/balanced-power-flow-model.js` powers the immediate slider response; `assets/js/balanced-power-flow-lesson.js` renders SVG diagrams and connects the controls.

The code panel runs the editable `assets/code/balanced_power_flow.py` solver through Pyodide 0.28.3. `assets/js/balanced-python-worker.js` keeps the original URL and imports the shared `course-python-worker.js`. Python executes in the student's browser, without a server kernel or external Python packages. Its first load needs access to jsDelivr; Stop terminates the worker. Each run receives a fresh `case` snapshot, and the resulting Python voltage profile is separate from the slider reference. KaTeX 0.16.22 renders formulas. Both CDN versions are pinned.

The three power-flow chapters also share eight instructional figures through `_includes/power-flow-illustration.html` and `assets/css/power-flow-illustrations.css`. The balanced chapter adds a symbolic branch-to-admittance diagram: `assets/js/power-flow-illustrations.js` highlights each branch's four matrix contributions and updates them when a branch opens. It uses generic bus labels independently of the worked feeder. Run `node --test tests/power_flow_illustrations_test.cjs` to check complex-current KCL across all eight switch configurations and the four-entry removal rule.

Run `node --test tests/balanced_power_flow_test.cjs` to check the analytic Jacobian against finite differences, radial solutions against an independent backward/forward sweep, branch power balance, topology failures, and JavaScript/Python agreement. Python 3 must be available. The 0.95–1.05 pu band and adjustable current limits are teaching settings, not claims of compliance with a particular network standard.

The Unbalanced Power Flow chapter lives at `/teaching/course-development/physics-informed-gnn/unbalanced-power-flow/`, with a matching Chinese page. Its JavaScript model (`assets/js/unbalanced-power-flow-model.js`) uses a damped backward/forward sweep on an explicit four-conductor radial feeder. Wye constant-PQ loads see local phase-to-neutral voltages; the source neutral is grounded and downstream neutrals return through the wire. The illustrative series matrices include phase mutual reactance, finite or ideal neutral impedance, and no phase-neutral mutual terms or earth-return paths. Controls set phase loads, PV connection, neutral/line impedances, and branch outages. VUF is the complex negative/positive sequence ratio; phase voltages and neutral displacement are also shown.

`_includes/course-code.html`, `assets/js/course-python-runner.js`, and the shared worker run the editable `assets/code/unbalanced_power_flow.py` model. UI markup and controls live in `_includes/unbalanced-*.html` and `_data/unbalanced_controls.yml`, with chapter-specific SVG rendering in `assets/js/unbalanced-power-flow-lesson.js`. Stop/restart, experiment download, and solver editing are supported.

Run `node --test tests/unbalanced_power_flow_test.cjs` for an independent rectangular Newton comparison, reduction to the balanced AC lesson, conductor KCL/KVL, per-phase constant power, neutral and phase I²R loss, sequence conventions, topology/error handling, and Python parity. The 2% VUF threshold is a teaching reference, alongside the voltage and conductor-current limits. Delta loads, transformers, harmonics, downstream grounding, and an open-neutral-only fault are outside this chapter's model.

The PandaPower-based Implementation chapter lives at `/teaching/course-development/physics-informed-gnn/pandapower-based-implementation/`, with a Chinese mirror. `_includes/pandapower-lab.html`, `_data/pandapower_controls.yml`, and `assets/js/pandapower-implementation-lesson.js` provide parameter controls, generated construction code, network/voltage/loading figures, and result tables. `assets/code/pandapower_implementation.py` builds and solves real pandapower networks and reads result DataFrames. Balanced `runpp()` reproduces the prior balanced AC lesson; `runpp_3ph()` uses phase powers and sequence/earth-return assumptions, which differ from the explicit finite-neutral model of the preceding chapter.

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
