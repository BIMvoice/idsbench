# idsbench

idsbench is a small tool for IDS (Information Delivery Specification) files from buildingSMART. It runs entirely in your browser: there is no server, and your files are not uploaded anywhere. The aim is to take one IDS file from blank to proven, in three tabs: Write, Check and Run.

## What works today

- **Write**: create or open an IDS 1.0 file with plain forms, and download it. The form covers the document information, specifications (IFC versions, required / optional / prohibited), and the six facet kinds in "Applies to" and "Must have", with values that are exact, a list, a pattern, a number range or a text length. Each specification has a one-sentence reading of itself. Items the schema forbids are stopped as you type, and Download stays off with the reason shown. "Use this IDS in Run" hands the file to the Run tab without saving it. Write opens IDS 1.0 files only and refuses any other version. Your draft is kept in `sessionStorage` (this browser tab, gone when it closes), the page asks before you leave with unsaved changes, and nothing is uploaded.
- **Check**: choose an IDS file and it is checked at once. You get one sentence (valid, or how many problems), the IDS version found, and one row per finding with what is wrong, where it is (line and column) and a short code. A row opens to show the line of the file with two lines around it. You can download the findings as one JSON file. A file that is not XML, not an IDS, empty, or an IFC model chosen by mistake gets one sentence saying what to do.
- **Run**: choose an IDS file and an IFC model, press Run. Run first checks the IDS file with the same engine as Check; if it has problems, Run does not start, says how many there are, and "Show them in Check" opens the same file there. Otherwise you get one line saying how many specifications passed, failed or could not be checked, and one row per specification. Each failing row lists the first 200 failing elements with IFC class, name, GlobalId and the reason. You can download the result as one JSON file; it holds every failing element, not only the 200 on the page.

Check and Run accept IDS 1.0 only. A file that declares any other version (0.9.7 included) is refused with a sentence that names the version.

Run reads IFC files in the STEP format (`.ifc`) for IFC2X3, IFC4 and IFC4X3. It does not read IFCX, ifcXML or zipped IFC files. A file it cannot use is refused with a sentence that says why: a model that is cut off, zipped or of another IFC version, an IDS file with problems, or the two files put in each other's box.

Each row has one of four states:

| State | Meaning |
| --- | --- |
| Pass | The model meets the specification. For a prohibited specification: none of the elements it names is in the model. |
| Fail | At least one element does not meet it, a required specification matches nothing, or a prohibited specification matches something. |
| Nothing to check | An optional specification that matches nothing in the model. The standard counts this as a pass, and so does the headline, which says how many there are. |
| Not checked | No verdict: the specification names no elements to apply to, or uses a text pattern that is not safe to run. The headline then never says that all passed. |

The IFC version a specification lists (`ifcVersion`) does not decide whether it is checked. The official test cases treat it as metadata ("Specification version is purely metadata and does not impact pass or fail result"), so every specification is checked, and a row whose listed versions do not include the model's version says so.


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

## How Check was measured

Check is the package in `packages/check` (see its README). It validates the IDS file against the official IDS 1.0 schema, then applies the rules of the buildingSMART IDS audit tool. Measured against the official tool on the IDS files in the two buildingSMART repositories: 425 of 425 IDS 1.0 files get the same valid or invalid verdict, and for the 80 the tool rejects the same set of error numbers. One more file declares IDS 0.9.7; the tool accepts it with a warning and idsbench refuses it by design. These files were used while building, so this is a regression guard, not an independent score.

- Audit tool: [buildingSMART/IDS-Audit-tool](https://github.com/buildingSMART/IDS-Audit-tool), MIT licence. Its rules and IFC tables are ported to TypeScript. idsbench is not endorsed by buildingSMART.
- Schema validator: [xmllint-wasm](https://github.com/noppa/xmllint-wasm) (libxml2 compiled to WebAssembly), MIT licence.

Check loads only when you first open a file in it, about 410 KB over the wire (gzip), so the first page load and Run are not slowed.

## Privacy

Files are read and checked in your browser, in Web Workers. The Write tab keeps an unsaved draft in `sessionStorage` only (cleared when the tab closes); Check and Run store nothing. Nothing is sent to a server, there is no analytics, and the page loads no fonts or scripts from other sites.

## Libraries

| Library | Used for | Licence |
| --- | --- | --- |
| `@ifc-lite/parser` | reading the IFC model | MPL-2.0 |
| `@ifc-lite/ids` | reading the IDS and checking the model against it (it cannot write IDS; the Write tab has its own writer) | MPL-2.0 |
| `@idsbench/check` (`packages/check`) | checking the IDS file itself; uses `xmllint-wasm` and `@xmldom/xmldom` | MIT |
| `react`, `react-dom` | the interface | MIT |

These are from the ifc-lite project. The build tools (Vite, TypeScript, Vitest, Playwright) are development dependencies only.

## Tests

```
npm test                 # the app's unit tests (finding order, excerpts, the Run gate, result states, error messages, runs through the real libraries), then the Check package's tests, including its comparison with the official tool
npm run truth -- <dir>   # runs every pass-/fail- pair of the buildingSMART IDS test cases
npm run build && node scripts/browser-check.mjs <dir>   # drives the built site in headless Chromium with the network blocked
npm run build && node scripts/write-check.mjs <IDS clone> <ids.xsd with local imports>   # the Write tab in headless Chromium
npx vite-node scripts/roundtrip.ts <dir> <ids.xsd with local imports> <out dir>   # read, write back and compare every IDS 1.0 file under a directory
node scripts/local-xsd.mjs <official ids.xsd> <dir with xml.xsd and XMLSchema.xsd> <out>   # makes the schema xmllint can read without the network
```

For `truth` and the browser check, clone https://github.com/buildingSMART/IDS and point them at `Documentation/ImplementersDocumentation/TestCases`. The inputs are used as they are; nothing is rewritten and no file is special-cased.

Measured on the 307 official `pass-*` and `fail-*` pairs, with Run opening each IDS file through Check first: 307 give the verdict named in the file name, and Check rejects none of their IDS files. In 9 of them the specification lists IFC2X3 and the model is IFC4; they are checked like the others and carry the note described above. The 27 IDS files marked `invalid-*` are not part of this number: Run refuses all 27 because Check finds problems in them.

The browser check also generates a model of 20,000 walls that all fail one specification. On the machine it was measured on, the result appeared 0.8 s after pressing Run, the page listed 200 rows and said that 19,800 more were in the report, and the downloaded report (2.7 MB) held all 20,000.

## Licence

See `LICENSE`.
