# idsbench

idsbench is a small tool for IDS (Information Delivery Specification) files from buildingSMART. It runs entirely in your browser: there is no server, and your files are not uploaded anywhere. The aim is to take one IDS file from blank to proven, in three tabs: Write, Check and Run.

## What works today

- **Run**: choose an IDS file and an IFC model, press Run. You get one line saying how many specifications passed, failed or could not be checked, and one row per specification. Each failing row lists the first 200 failing elements with IFC class, name, GlobalId and the reason. You can download the result as one JSON file; it holds every failing element, not only the 200 on the page.
- **Write** and **Check** are tabs only. They say they are not built yet.

Run reads IFC files in the STEP format (`.ifc`) for IFC2X3, IFC4 and IFC4X3. It does not read IFCX, ifcXML or zipped IFC files, and it reads IDS 1.0 only. A file it cannot use is refused with a sentence that says why: a model that is cut off, zipped or of another IFC version, an IDS draft (0.9.x), an IDS with no specifications, or the two files put in each other's box.

Each row has one of four states:

| State | Meaning |
| --- | --- |
| Pass | The model meets the specification. For a prohibited specification: none of the elements it names is in the model. |
| Fail | At least one element does not meet it, a required specification matches nothing, or a prohibited specification matches something. |
| Nothing to check | An optional specification that matches nothing in the model. The standard counts this as a pass, and so does the headline, which says how many there are. |
| Not checked | No verdict: the specification names no elements to apply to, or uses a text pattern that is not safe to run. The headline then never says that all passed. |

The IFC version a specification lists (`ifcVersion`) does not decide whether it is checked. The official test cases treat it as metadata ("Specification version is purely metadata and does not impact pass or fail result"), so every specification is checked, and a row whose listed versions do not include the model's version says so.

Run does not check that the IDS file itself is valid; that is the job of the Check tab. Every result says so.

## Run it locally

You need Node.js 20.19 or newer.

```
npm install
npm run dev
```

Then open http://localhost:5173.

## Build

```
npm run build
```

The static site is written to `dist/`. Serve it with any static file server, for example `npm run preview` (http://localhost:4173). The built site makes no network requests of its own.

## Privacy

Files are read and checked in your browser, in a Web Worker. Nothing is sent to a server, there is no analytics, and the page loads no fonts or scripts from other sites.

## Libraries

| Library | Used for | Licence |
| --- | --- | --- |
| `@ifc-lite/parser` | reading the IFC model | MPL-2.0 |
| `@ifc-lite/ids` | reading the IDS and checking the model against it | MPL-2.0 |
| `react`, `react-dom` | the interface | MIT |

These are from the ifc-lite project. The build tools (Vite, TypeScript, Vitest, Playwright) are development dependencies only.

## Tests

```
npm test                 # unit tests: result states, error messages, file checks, and runs through the real libraries
npm run truth -- <dir>   # runs every pass-/fail- pair of the buildingSMART IDS test cases
npm run build && node scripts/browser-check.mjs <dir>   # drives the built site in headless Chromium with the network blocked
```

For `truth` and the browser check, clone https://github.com/buildingSMART/IDS and point them at `Documentation/ImplementersDocumentation/TestCases`. The inputs are used as they are; nothing is rewritten and no file is special-cased.

Measured on the 307 official `pass-*` and `fail-*` pairs: 307 give the verdict named in the file name. In 9 of them the specification lists IFC2X3 and the model is IFC4; they are checked like the others and carry the note described above. The 27 IDS files marked `invalid-*` are not part of this number: Run does not judge the IDS file, so all 27 are run, and all 27 come out as failed.

The browser check also generates a model of 20,000 walls that all fail one specification. On the machine it was measured on, the result appeared 0.8 s after pressing Run, the page listed 200 rows and said that 19,800 more were in the report, and the downloaded report (2.7 MB) held all 20,000.

## Licence

See `LICENSE`.
