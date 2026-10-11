# idsbench

idsbench is a small tool for IDS (Information Delivery Specification) files from buildingSMART. It runs entirely in your browser: there is no server, and your files are not uploaded anywhere. The aim is to take one IDS file from blank to proven, in three tabs: Write, Check and Run.

## What works today

- **Run**: choose an IDS file and an IFC model, press Run. You get one line saying how many specifications passed, one row per specification (elements it applied to, passed, failed), and for each failing row the first 200 failing elements with IFC class, name, GlobalId and the reason. You can download the result as one JSON file.
- **Write** and **Check** are tabs only. They say they are not built yet.

Run reads IFC files in the STEP format (`.ifc`) for IFC2X3, IFC4 and IFC4X3. It does not read IFCX or zipped IFC files.

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
npm test                 # unit tests for the result shaping, error messages and the 200 cap
npm run truth -- <dir>   # runs every pass-/fail- pair of the buildingSMART IDS test cases
```

For `truth`, clone https://github.com/buildingSMART/IDS and point it at `Documentation/ImplementersDocumentation/TestCases`.

Measured on 307 official `pass-*` and `fail-*` pairs: 298 give the verdict named in the file name. The other 9 are all pairs whose IDS targets IFC2X3 while the supplied model is IFC4. idsbench refuses those with a message that the schemas do not match, instead of returning a verdict. With the IDS schema attribute rewritten to the model's own schema, all 9 match as well. The IDS files marked `invalid-*` are not part of this number: 26 of 27 are still run and give a result rather than an error, because spotting an invalid IDS is the job of the Check tab.

## Licence

See `LICENSE`.
