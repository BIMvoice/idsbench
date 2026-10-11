# idsbench

idsbench is a small tool for IDS (Information Delivery Specification) files from buildingSMART. It runs entirely in your browser: there is no server, and your files are not uploaded anywhere. It is one page around one document, the IDS file: open it to see whether it is valid, add a model to see whether the model meets it, and change the file right there when something has to change.

## What the page does

- **An IDS file arrives** (opened, dropped anywhere on the page, or started with New). It is checked at once against the official IDS 1.0 schema and the rules of the buildingSMART audit tool. The stamp says Valid or Not valid. Every finding is shown at the specification it concerns, with its sentence, its line, a short code and, on demand, the lines of the file around it. Under the stamp a list says what there is to fix: "Fix" opens the specification and puts the keyboard in the field concerned; where the engine already names the answer (a class written in other letters, a missing data type of a standard property, requirements on a prohibited specification, a missing IFC version) the fix is one press, offered only after the engine has confirmed it on the changed file, and it can be undone. A name that is one or two letters away from a real one is the engine's guess ("Did you mean"): it stays in the sentence and is not made one press. A problem that is in the text of the file and not in what it says (an attribute the standard does not know) is fixed by "Write this specification again in the standard form".
- **A model arrives** (optional, any time). It is read in a worker and kept there while it is the model on the page, so that a run after an edit only checks again. If the IDS file is valid the model is checked by itself: there is no Run button. The stamp becomes Pass, Fail or Incomplete, each specification shows its own state and counts, and its failing elements are listed grouped by reason. Elements that fail the same requirement are one group even when each has a value of its own in the reason (20,000 walls with 20,000 wrong names read as one reason; each wall's own value is in its row). "Download failing elements" gives the complete list as CSV for the people who model, with the requirement in words, what to fix and the storey or space of each element beside why it failed: the first column, "Row about", says "Element" on the row of a failing element and "Whole specification" on the row of a specification that failed as a whole (it needs a matching element and there is none, or it allows fewer than there are), so a filter on that column separates the two (UTF-8 with a byte order mark, so Excel reads it; a cell that a spreadsheet would run as a formula, one that starts with =, +, - or @, gets an apostrophe in front, which is not part of the name in the model); "Download report" gives the check and the run as one JSON file, which names the bytes it is about: the size and SHA-256 of the IDS text and of the model. If the IDS file is not valid, the model waits and is checked the moment the file is.
- **Editing in place.** Every specification reads as a sentence and has Edit, which opens its form in the row. IFC classes, predefined types, standard property sets, their properties, attributes and data types are chosen from pick-lists with type-ahead, built from the IFC tables the Check engine ships. A list holds what every IFC version ticked for the specification defines, and attribute names and property sets are those of the class the specification applies to, so that nothing a list offers is rejected by the engine; a plain name stands beside the technical one ("Wall (IfcWall)") and the technical form is what goes into the file. A custom name can still be typed. A new specification starts from one of five common shapes or from an empty form. It applies to the class and its subtypes in all three IFC versions ("Every wall, including wall standard case"; one control narrows it to the exact class), is optional (a model with no doors is not failed for it; the choice is in plain view), is named from what it says until a name is typed, and a shape never fills in a value that narrows the rule beyond its title. A name typed in a standard property set that the set does not define is said at the field, and names people look for by meaning ("number" for Reference) are found through a short hand-written table (`src/core/meanings.ts`, an aid, not the standard). After a change the file is checked again and, with a model loaded, run again after a short pause.
- **No files at hand?** "Try an example" loads a small IDS file and model that ship inside the page.

**Large models.** The result keeps exact counts of everything and lists 200 failing elements per specification on the page; the complete list goes straight from the worker into the two downloads (as pieces the browser may hold on disk), so millions of failing elements are neither sent to the page nor kept in its memory, and the CSV and the report stay complete. The model is checked one range of entities at a time (400,000 of them, cut by count and not by how large their numbers are, so that a model whose numbers are far apart is not cut into thousands of empty ranges), so that the results of millions of elements are never all in memory at once. What a tab cannot hold is refused before it is parsed, in one sentence that says what to do: a file over 1 GB by its size, and a model with more entities than a tab holds. The entities are counted over the whole file, not estimated from a part of it, and weighed: an entity with a name or an identifier of its own (an element, a relationship, a property set) counts in full, every other (geometry, mostly) for a third, which is what each was measured to cost. The limit is 9.3 million of the first kind where the browser reports 8 GB of memory or more (the most it ever reports) or reports nothing at all (Firefox, Safari), and proportionally fewer where it reports less; the sentence gives the count and says which of these it is, and does not claim that the reader's computer was measured. The reader also has a limit of about 16 million distinct names and identifiers, and says so when it meets it. The worker tells the page that it is alive from inside its long steps (counting, parsing, checking); when it has said nothing for 30 seconds, or longer while a large model is being read (0.15 s more for every megabyte), the page offers "Stop and try again"; one that the browser ends without a word is noticed at once and said so. A model that cannot be read any more (moved, deleted or saved again after it was chosen) is said as that. The report names the model by the SHA-256 of the bytes the worker parsed, taken when it parsed them, so the record is of what was checked even when the file on disk has changed since. Tab crashes that the page cannot see coming (the browser ending a tab for memory) cannot be caught by any page; the limits are set below the sizes that were measured to end one.

**What writing again leaves out.** A part of the file that is changed is written from what the editor holds. Before Download the page says, part by part, what that leaves out of the opened file, in words ("Writing specification 3 (\"Fire rating\") again will leave out: 2 comments, the attribute fixed on a list value."), and the JSON report carries the same list (`writingAgainLeavesOut`). It is worked out by comparing the XML of the part as the file has it with the XML written for the same content, node by node.

**Exact classes.** IDS matches the exact IFC class: a specification for IfcWall does not apply to an IfcWallStandardCase. Where a chosen class has subtypes in a ticked IFC version the specification says so in one line ("This applies to IfcWall only, not to IfcWallElementedCase or IfcWallStandardCase.") and offers, as an undoable action, adding the subtypes as a list. The list holds the subtypes that every ticked version has as a class an element can be; one that only some of them have is named in the line with its version and is not added. A class that is abstract (IfcElement, IfcBuildingElement) can never be the class of an element: the line says that the specification applies to nothing as written, and the action puts the concrete subtypes in its place.

Two rules hold throughout. A result is never shown for another version of the document than the one on screen: each result is kept with the exact text and model it was made for, and is shown only while those are current. And the file you get is the file you made: a file that is opened and not changed is checked, run and downloaded as it is, byte for byte. Once something is changed, only the specification that was changed (or the info section) is written anew; everything else, comments, layout, line ends and byte order mark included, stays as the opened file has it, and a change that is typed back returns to the opened file. The record under the stamp says "with unsaved changes" while the document differs. Where a changed part held comments, the page says before Download that they are not kept.

idsbench accepts IDS 1.0 only. A file that declares any other version (0.9.7 included) is shown as Not valid with the engine's sentence, which names the version, and cannot be edited here.

Unsaved changes are kept in `sessionStorage` (this browser tab, gone when it closes), together with the text of the opened file they were made to, the page asks before you leave or open another file over them, and nothing is uploaded. After a reload the changes are restored and the page says so; a model is not kept and has to be chosen again. A stored draft that cannot be read is not used, and the page says that too.

An IDS file is read in the encoding it declares (UTF-8, UTF-16, ISO-8859-1 and the others a browser knows). Bytes that are not valid in that encoding are not replaced: the file is refused with the reason. A changed file is always saved as UTF-8.

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
| `@idsbench/check` (`packages/check`) | checking the IDS file itself, and the IFC tables behind the pick-lists; uses `xmllint-wasm` and `@xmldom/xmldom` || MPL-2.0 (part of this repository; see `NOTICE.md` for the MIT-licensed work it builds on) |
| `react`, `react-dom` | the interface | MIT |
| Atkinson Hyperlegible Next, Barlow Condensed | the two typefaces, bundled as local files in `src/fonts/` | SIL OFL 1.1 |

The first two are from the ifc-lite project. How the interface looks and reads is described in `DESIGN.md`. The build tools (Vite, TypeScript, Vitest, Playwright) are development dependencies only.

## Tests

```
npm test                                          # the app's unit tests, then the Check package's tests
npm run build && npm run check:browser -- <IDS clone> [a large .ifc]   # the five browser scripts in headless Chromium, network blocked (scripts/ASSERTIONS.md lists what they assert)
npm run truth -- <TestCases dir>                  # every pass-/fail- pair of the buildingSMART IDS test cases through Check and Run
npx vite-node scripts/roundtrip.ts <IDS clone> <ids.xsd with local imports> <out dir>   # read, write back and compare every IDS 1.0 file
node scripts/local-xsd.mjs <official ids.xsd> <dir with xml.xsd and XMLSchema.xsd> <out>   # the schema xmllint can read without the network
npx vite-node scripts/picklists.ts [--all-properties]   # everything the pick-lists offer, fed to the Check engine
npx vite-node scripts/fixes.ts <dir> [<dir> ...]         # every one-press fix over the IDS files the engine rejects
npx vite-node scripts/handover.ts <TestCases dir>        # CSV rows (element rows and whole-specification rows, counted apart), groups and report against the run's own counts
npx vite-node scripts/kept-model.ts <TestCases dir>      # a run served from the kept model against the run that read it
npx vite-node scripts/lost-check.ts <dir> [<dir> ...]    # what writing each specification again leaves out, and a proof that nothing else is
npx vite-node scripts/snapshot-results.ts <TestCases dir> <out.json>   # every result of the 307 pairs, for comparing two versions of the code (node scripts/compare-results.mjs a.json b.json)
node scripts/make-large-model.mjs <walls> <out.ifc> <pass|fail|filler> [<out.ids>]   # a model of any size, for measuring
node scripts/measure-browser.mjs <model.ifc> <spec.ids>   # time, longest freeze and peak memory of one model in the real page
```

`<IDS clone>` is a clone of https://github.com/buildingSMART/IDS; `<TestCases dir>` is its `Documentation/ImplementersDocumentation/TestCases`. Set `CHROMIUM_PATH` to use an installed headless Chromium. The inputs are used as they are; nothing is rewritten and no file is special-cased.

Measured on the one-page app, on the machine it was built on:

- Unit tests: 590 in the app, 44 in the Check package (1 more is skipped: it needs the official tool's output on disk).
- `truth`: 307 of 307 `pass-` / `fail-` pairs give the verdict named in the file name, and Check rejects none of their IDS files. In 9 the specification lists IFC2X3 and the model is IFC4; they are checked like the others and carry a note. All 27 `invalid-*` files are refused because Check finds problems in them.
- Check against the official audit tool: 425 of 425 IDS 1.0 files get the same valid or invalid verdict, and for the 80 it rejects the same error numbers. One file declares IDS 0.9.7 and is refused by design.
- Round trip (read, write back in full, compare): 319 files read; 319 schema-valid, 319 parse-equal, 319 equal as XML; the verdict is the same for 307 of 307 pairs.
- The file as opened: each of the 319 valid official IDS files, opened in the page and downloaded without a change, is byte for byte the file that was opened. All 760 IDS files of the two corpora that the forms can open are cut and proved for writing back; one change to one specification leaves every character outside it untouched in all of them.
- Pick-lists against the engine (`scripts/picklists.ts --all-properties`): 135,858 offers (every class, predefined type, attribute of a class, property set and property of a class with its data type, and data type, for each IFC version and each combination of versions): 0 rejected. Made from the first ticked version alone, as before, 10,734 of a sample of 33,279 were rejected.
- One-press fixes (`scripts/fixes.ts`) over the 107 files of the two corpora the engine rejects (208 findings): 18 fixes are offered and each removes its finding; 11 files are not opened in the forms at all.
- Hand-over (`scripts/handover.ts`) over the 307 pairs, 120 of which fail: the runs count 119 failing elements and the CSV files hold 119 element rows, specification by specification; the report holds the same 119. Two specifications fail as a whole with no element to list (a required specification that matches nothing, or more matches than allowed); each has its own row in the CSV, marked "Whole specification" in the first column, and these 2 rows are counted apart from the 119.
- Where findings land, over the 66 invalid files of the corpus (139 findings): 134 at a specification, 0 at "About this IDS", 5 at the file as a whole. In the 57 of those files that open in the forms (116 findings), all 116 lead to a field of the form; none is left without a place.
- Browser: 150 assertions for the page, 70 for editing and 56 for the saved file, changes under a run, the draft, odd input and the keyboard journeys, 25 for large models, the kept model and which bytes its record names, a silent or ended worker, a model that cannot be read any more and models too large to open, and 20 for exact and abstract classes, a Pset_ name that is not the standard's and Download pressed again and again, all passed, with no request to anything but the local server. Storage holds the `sessionStorage` draft and nothing else. A watch on every change of the page found no moment at which a result of another version of the document was on screen; with the guard taken out of the code, 12 assertions fail.
- Size: the first load transfers 476 KB (gzip); the tabbed app transferred 434 KB. The difference is the two typefaces (30 KB) and 13 KB more script and styles. The first IDS file fetches about 456 KB more (the engine, its WebAssembly and the IFC 4 tables).
- First check after a cold load: the specifications were on screen 62 to 77 ms after the file was chosen and the verdict after 142 to 154 ms (local server, three runs).
- A 36 MB model (638,340 entities) against a four-specification IDS file: the result appeared 0.8 s after the model was chosen. With that model loaded, typing 34 characters into a form field never blocked the page for more than 21 ms, the re-run that followed included.
- 20,000 walls that all fail one specification: the result appeared 0.8 s after the files were chosen, the page listed 200 rows and said that 19,800 more were in the downloads, and the report (2.7 MB) and the CSV each held all 20,000. A 2,000-specification IDS (1.3 MB) was checked in 0.6 s with the page never frozen for more than 170 ms (0.4 s and 105 ms before the opened text was cut and proved for writing back).
- Large models (`scripts/make-large-model.mjs`, `scripts/measure-browser.mjs`; one IDS file with one specification, "walls are named Waldo"; headless Chromium on a computer with 26 GB of memory; time from choosing the model to the result, longest freeze of the page, peak memory of all the browser's processes). Before this round, from 2.8 million walls on the page froze for seconds and a model of 4.3 million failing walls ended the tab after 40 s with no message:

| model | size | entities | failing | before | after |
| --- | --- | --- | --- | --- | --- |
| walls, all fail | 13 MB | 200,000 | 200,000 | 1.3 s, freeze 122 ms, 1.2 GB | 1.4 s, freeze 3 ms, 1.3 GB |
| walls, all fail | 47 MB | 700,000 | 700,000 | 4.6 s, freeze 405 ms, 2.2 GB | 4.5 s, freeze 2 ms, 2.3 GB |
| walls, all fail | 95 MB | 1,400,000 | 1,400,000 | 9.4 s, freeze 793 ms, 3.1 GB | 9.8 s, freeze 36 ms, 3.0 GB |
| walls, all fail | 193 MB | 2,800,000 | 2,800,000 | 20.4 s, freeze 1.8 s, 5.3 GB | 20.6 s, freeze 2 ms, 5.1 GB |
| walls, all fail | 297 MB | 4,300,000 | 4,300,000 | tab ended at 40 s, no message | 33.4 s, freeze 2 ms, 4.8 GB |
| walls, all fail | 416 MB | 6,000,000 | 6,000,000 | tab ended | 52.6 s, freeze 2 ms, 5.4 GB |
| walls, all fail | 520 MB | 7,500,000 | 7,500,000 | not measured | 65.5 s, freeze 2 ms, 4.9 GB |
| walls, all fail | 624 MB | 9,000,000 | - | not measured | refused after 18 s in one sentence: more distinct names and identifiers than the reader can hold (its table stops at 16.7 million) |
| walls, all pass | 43 MB | 700,000 | 0 | 3.0 s, 1.7 GB | 3.2 s, 1.7 GB |
| walls, all pass | 270 MB | 4,300,000 | 0 | 21.8 s, 5.4 GB | 23.9 s, 4.9 GB |
| 3 walls among other elements | 54 MB | 700,000 | 0 | 1.2 s, 1.3 GB | 1.4 s, 1.3 GB |
| 3 walls among other elements | 703 MB | 9,000,000 | 0 | not measured | 19.2 s, 5.2 GB |
| 3 walls among other elements | 781 MB | 10,200,000 | 0 | not measured | refused before it is parsed: more entities with a name of their own than a tab holds (9.3 million) |
| one entity in ten with a name, the rest geometry | 618 MB | 12,000,000 | 0 | not measured (the count alone refused it) | 10.4 s to check after reading, peak 3.2 GB above the empty page |
| 3 walls among other elements | 939 MB | 12,000,000 | 0 | not measured | with the limit taken out of a test build: the tab ended at 29 s |

  Where the time goes (in Node, the same code, 4.3 million walls): reading and parsing the model a third, checking the elements against the specification half (it is the library's own work, per element), shaping the result and writing the downloads the rest; none of it is on the page's thread any more. The time of a first run did not change; what changed is what happens to the result: before, every failing element was copied to the page, grouped there and held there (a freeze of 1.8 s at 2.8 million, the end of the tab at 4.3 million); now the page receives counts, 200 rows per specification and the pieces of the two downloads. The largest model that works on this machine is the largest one the page lets in: 9.3 million entities (703 MB measured), 7.5 million of them all failing (520 MB measured); it is the memory of the parsed model (about 540 bytes an entity in the whole browser) that sets the limit, not the number of failing elements. After the first run of a model, a run after an edit does not read it again: with 700,000 entities of which 3 apply, "Checked in" is 1.00 s for the first run and 0.00 s for the run after an edit. The page stays responsive in all of these (longest freeze 2 to 36 ms).

## Licence

idsbench is licensed under the Mozilla Public License 2.0 (MPL-2.0), see `LICENSE`. You may use it in any product, open or closed; if you change idsbench's own files and distribute them, those changes are shared under the same licence.

Third-party work that idsbench builds on or bundles keeps its own licence. `NOTICE.md` lists it.
