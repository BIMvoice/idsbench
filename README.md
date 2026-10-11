# idsbench

idsbench is a small tool for IDS (Information Delivery Specification) files from buildingSMART. It runs entirely in your browser: there is no server, and your files are not uploaded anywhere. It is one page around one document, the IDS file: open it to see whether it is valid, add a model to see whether the model meets it, and change the file right there when something has to change.

## What the page does

- **An IDS file arrives** (opened, dropped anywhere on the page, or started with New). It is checked at once against the official IDS 1.0 schema and the rules of the buildingSMART audit tool. The stamp says Valid or Not valid. Every finding is shown at the specification it concerns, with its sentence, its line, a short code and, on demand, the lines of the file around it. Under the stamp a list says what there is to fix: "Fix" opens the specification and puts the keyboard in the field concerned; where the engine already names the answer (a class written in other letters, a missing data type of a standard property, requirements on a prohibited specification, a missing IFC version) the fix is one press, offered only after the engine has confirmed it on the changed file, and it can be undone.
- **A model arrives** (optional, any time). If the IDS file is valid the model is checked by itself: there is no Run button. The stamp becomes Pass, Fail or Incomplete, each specification shows its own state and counts, and its failing elements are listed grouped by reason. "Download failing elements" gives the complete list as CSV for the people who model (UTF-8 with a byte order mark, so Excel reads it); "Download report" gives the check and the run as one JSON file. If the IDS file is not valid, the model waits and is checked the moment the file is.
- **Editing in place.** Every specification reads as a sentence and has Edit, which opens its form in the row. IFC classes, predefined types, standard property sets, their properties, attributes and data types are chosen from pick-lists with type-ahead, built from the IFC tables the Check engine ships; a plain name stands beside the technical one ("Wall (IfcWall)") and the technical form is what goes into the file. A custom name can still be typed. A new specification starts from one of five common shapes or from an empty form. After a change the file is checked again and, with a model loaded, run again after a short pause.
- **No files at hand?** "Try an example" loads a small IDS file and model that ship inside the page.

Two rules hold throughout. A result is never shown for another version of the document than the one on screen: each result is kept with the exact text and model it was made for, and is shown only while those are current. And a file that is opened and not changed is checked and run as it is, from the opened file itself; only a document that differs from the opened file is written out again, and the record under the stamp then says "with unsaved changes".

idsbench accepts IDS 1.0 only. A file that declares any other version (0.9.7 included) is shown as Not valid with the engine's sentence, which names the version, and cannot be edited here.

Unsaved changes are kept in `sessionStorage` (this browser tab, gone when it closes), the page asks before you leave or open another file over them, and nothing is uploaded.

The page reads IFC files in the STEP format (`.ifc`) for IFC2X3, IFC4 and IFC4X3. It does not read IFCX, ifcXML or zipped IFC files. A model it cannot use is refused with a sentence that says why: cut off, zipped, in an XML format or of another IFC version. A file that is not an IDS file at all is not opened, and what is on the page stays. An IDS file and a model are told apart by what they hold, so it does not matter which box a file is put in.

With a model loaded, each specification has one of four states:

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

The Check engine is not part of the first load. It is fetched when the first IDS file arrives (about 456 KB over the wire, gzip, with its WebAssembly and the IFC 4 tables); the specifications are on screen before that, read by a small reader of the page's own, and the stamp says "Checking" until the engine answers.

## Privacy

Files are read and checked in your browser, in Web Workers. Unsaved changes to the IDS file are kept in `sessionStorage` only (cleared when the tab closes); nothing else is stored. Nothing is sent to a server, there is no analytics, and the page loads no fonts or scripts from other sites.

## Libraries

| Library | Used for | Licence |
| --- | --- | --- |
| `@ifc-lite/parser` | reading the IFC model | MPL-2.0 |
| `@ifc-lite/ids` | reading the IDS and checking the model against it (it cannot write IDS; the page has its own writer) | MPL-2.0 |
| `@idsbench/check` (`packages/check`) | checking the IDS file itself, and the IFC tables behind the pick-lists; uses `xmllint-wasm` and `@xmldom/xmldom` | MIT |
| `react`, `react-dom` | the interface | MIT |
| Atkinson Hyperlegible Next, Barlow Condensed | the two typefaces, bundled as local files in `src/fonts/` | SIL OFL 1.1 |

The first two are from the ifc-lite project. How the interface looks and reads is described in `DESIGN.md`. The build tools (Vite, TypeScript, Vitest, Playwright) are development dependencies only.

## Tests

```
npm test                                          # the app's unit tests, then the Check package's tests
npm run build && npm run check:browser -- <IDS clone>   # both browser scripts in headless Chromium, network blocked (scripts/ASSERTIONS.md lists what they assert)
npm run truth -- <TestCases dir>                  # every pass-/fail- pair of the buildingSMART IDS test cases through Check and Run
npx vite-node scripts/roundtrip.ts <IDS clone> <ids.xsd with local imports> <out dir>   # read, write back and compare every IDS 1.0 file
node scripts/local-xsd.mjs <official ids.xsd> <dir with xml.xsd and XMLSchema.xsd> <out>   # the schema xmllint can read without the network
```

`<IDS clone>` is a clone of https://github.com/buildingSMART/IDS; `<TestCases dir>` is its `Documentation/ImplementersDocumentation/TestCases`. Set `CHROMIUM_PATH` to use an installed headless Chromium. The inputs are used as they are; nothing is rewritten and no file is special-cased.

Measured on the one-page app, on the machine it was built on:

- Unit tests: 300 in the app (253 before the one page, 47 new), 44 in the Check package (1 more is skipped: it needs the official tool's output on disk).
- `truth`: 307 of 307 `pass-` / `fail-` pairs give the verdict named in the file name, and Check rejects none of their IDS files. In 9 the specification lists IFC2X3 and the model is IFC4; they are checked like the others and carry a note. All 27 `invalid-*` files are refused because Check finds problems in them.
- Check against the official audit tool: 425 of 425 IDS 1.0 files get the same valid or invalid verdict, and for the 80 it rejects the same error numbers. One file declares IDS 0.9.7 and is refused by design.
- Round trip (read, write back, compare): 319 files read; 319 schema-valid, 319 parse-equal, 319 equal as XML; the verdict is the same for 307 of 307 pairs.
- Where findings land, over the 66 invalid files of the corpus (139 findings): 134 at a specification, 0 at "About this IDS", 5 at the file as a whole. In the 57 of those files that open in the forms (116 findings), 105 lead to a field of the form and 11 to a specification; none is left without a place.
- Browser: 149 assertions for the page and 66 for editing, all passed, with no request to anything but the local server. Storage holds the `sessionStorage` draft and nothing else. A watch on every change of the page found no moment at which a result of another version of the document was on screen; with the guard taken out of the code, 12 assertions fail.
- Size: the first load transfers 476 KB (gzip); the tabbed app transferred 434 KB. The difference is the two typefaces (30 KB) and 13 KB more script and styles. The first IDS file fetches about 456 KB more (the engine, its WebAssembly and the IFC 4 tables).
- First check after a cold load: the specifications were on screen 62 to 77 ms after the file was chosen and the verdict after 142 to 154 ms (local server, three runs).
- A 36 MB model (638,340 entities) against a four-specification IDS file: the result appeared 0.8 s after the model was chosen. With that model loaded, typing 34 characters into a form field never blocked the page for more than 21 ms, the re-run that followed included.
- 20,000 walls that all fail one specification: the result appeared 0.8 s after the files were chosen, the page listed 200 rows and said that 19,800 more were in the downloads, and the report (2.7 MB) and the CSV each held all 20,000. A 2,000-specification IDS (1.3 MB) was checked in 0.5 s with the page never frozen for more than 100 ms.

## Licence

See `LICENSE`.
