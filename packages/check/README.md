# @idsbench/check

The engine behind the **Check** feature: tells you whether an IDS file (buildingSMART Information Delivery
Specification, XML) is itself valid, and where it is wrong. Runs in the browser and in Node, makes no network calls.

```ts
import { checkIds } from '@idsbench/check';

const result = await checkIds(xmlText);
// { valid: boolean, idsVersion?: '1.0' | '0.9.7', findings: Finding[] }
// Finding = { severity: 'error' | 'warning', code, message, line?, column?, path? }
```

`valid` is `false` as soon as one finding has severity `error`. `message` is one plain sentence saying what is wrong and
what is expected. `line`/`column` point into the input (1-based). `path` names the element, for example
`ids/specifications/specification/applicability/entity/name`. `code` is a stable identifier (list below).

## Two layers

1. **Schema validation** against the official IDS XSD, by libxml2 compiled to WebAssembly
   ([`xmllint-wasm`](https://github.com/noppa/xmllint-wasm) 5.3.0, MIT; libxml2 2.13.8, MIT).
2. **Rules beyond the schema**: what the buildingSMART IDS audit tool reports that an XSD cannot (unknown IFC class,
   predefined type that does not exist, reserved property set prefix, wrong data type, impossible combinations, ...).
   Rule logic is ported to TypeScript from the audit tool ([buildingSMART/IDS-Audit-tool](https://github.com/buildingSMART/IDS-Audit-tool),
   MIT licence, Copyright buildingSMART International Ltd.; the IFC tables are generated from its sources, see below).
   This package is not endorsed by buildingSMART.

### IDS versions accepted

Chosen by `xsi:schemaLocation` on `<ids>`, compared exactly as the audit tool does:

| Location | Result |
|---|---|
| `http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd` | accepted (`idsVersion: '1.0'`) |
| `http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/0.9.7/ids.xsd` | accepted with warning `ids-version-transitional` |
| anything else, or missing | error `ids-version-unsupported` (the XSD to use is unknown) |

0.9.7 is the only earlier version the audit tool still embeds; it differs from 1.0 by also accepting `IFC4X3` in
`ifcVersion`. Files that declare 0.9.6 or older are refused with a message naming the 1.0 location.

### How the XSD is loaded offline

`schemas/*.xsd` are bundled and turned into `src/schemas.generated.ts` (`npm run build:schemas`) so there is no file or
network access at runtime. `ids-1.0.xsd` is byte-identical to `Schema/ids.xsd` in buildingSMART/IDS (commit
`870f9c4e`). `ids-0.9.7.xsd`, `XMLSchema.xsd` and `xml.xsd` are the copies embedded in the audit tool. The IDS schema
imports three W3C namespaces by `http://www.w3.org/...` URL; at run time those `schemaLocation` strings are rewritten
to in-memory file names and the files are handed to xmllint-wasm through its `preload` option (libxml2's virtual file
system), so nothing is fetched. The IDS schema really needs the XML Schema schema (`ref="xs:restriction"`,
`ref="xs:occurs"`), which is why that 63 KB file is bundled. The XML Schema *instance* namespace is imported by an
empty stand-in (libxml2 handles `xsi:` natively).

### Validator facts

| | |
|---|---|
| Package | `xmllint-wasm` 5.3.0, MIT (libxml2 2.13.8, MIT) |
| Size | `xmllint.wasm` 779 KB raw, 272 KB gzip; worker script 26 KB raw, 10 KB gzip |
| Worker | yes: it starts a module `Worker` per call (`new Worker(new URL('./xmllint-browser.mjs', import.meta.url))`), so the bundler must be able to emit that URL (Vite does; exclude the package from dependency pre-bundling, see `demo/vite.config.ts`) |
| Offline imports | yes, from memory via `preload` |
| Position info | line only (no column); the column is looked up from our own element tree |
| Cost | the 38 documents of `test/rules.test.ts` take 1.8 s in Node, so roughly 50 ms per call |

## Bundle impact (gzip, measured with `npm run demo:build`)

| Part | Size |
|---|---|
| module code + bundled XSDs + XML parser (`@xmldom/xmldom`) | 61 KB |
| libxml2 WebAssembly | 272 KB |
| xmllint worker | 10 KB |
| IFC tables, **loaded only for the versions a file names**: IFC2X3 / IFC4 / IFC4X3 | 49 / 63 / 89 KB |

A typical IFC4 file therefore costs about 405 KB over the wire, the worst case (all three versions) about 545 KB. The
IFC tables are separate lazy chunks (`import()` per version).

## Rules

Every audit-tool rule, with the code(s) used here. "Implemented" means ported and exercised by a failing and a passing
document in `test/rules.test.ts` unless noted. The audit tool's numbers are in `ids-lib/ErrorCodes.md`.

| Audit tool | Meaning | Our code(s) | Status |
|---|---|---|---|
| 100 | umbrella: invalid ids content | - | n/a, no rule of its own |
| 101 | applicability missing or empty | `applicability-missing`, `applicability-empty` | implemented |
| 102 | facet needs a name/value, none given | `value-missing` | implemented |
| 103 | value matches nothing valid in the IFC version | `entity-unknown-class`, `entity-unknown-predefined-type`, `attribute-unknown`, `property-unknown-in-standard-set`, `property-value-not-allowed`, `property-datatype-invalid`, `partof-relation-invalid` | implemented. `partof-relation-invalid` is defensive: the XSD enumeration already rejects every relation the rule would, so it cannot fire on a file that passed the schema and has no test |
| 104 | wrong number of matches (relation) | - | not implemented as a separate rule: the relation is a plain string, so it matches exactly one name or none (reported as 103) |
| 105 | no valid option exists (predefined type) | - | not implemented: unreachable, it needs a name matcher that matched no class, which 103 already rejected |
| 106 | empty classification system / partOf entity | `classification-system-empty`, `value-empty` | implemented. `value-empty` is defensive for the same reason as above (the XSD requires `<entity>` in `<partOf>`) |
| 107 | invalid IFC version in `ifcVersion` | `ifc-version-invalid` | implemented. Note `IFC4X3` is accepted by the rule (as in the tool) but the 1.0 XSD rejects it |
| 108 | unsupported IDS schema version | `ids-version-unsupported`, `ids-version-transitional` (warning) | implemented, broader: every location other than 1.0 and 0.9.7 is refused |
| 109 | invalid regular expression | `pattern-invalid` | implemented with the JavaScript regex engine, see limits |
| 201 | clauses that can never be met together | `conditions-impossible`, `applicability-requirements-incompatible`, `partof-entity-incompatible` | implemented, including the class lists the tool derives for attributes, standard property sets (with type classes), classification, material and partOf |
| 202 | cardinality not valid for the facet | `cardinality-needs-value` (optional without value/dataType), `cardinality-conflicts-datatype` (prohibited property with dataType) | implemented |
| 203 | value without dataType | `value-needs-datatype` | implemented |
| 204 | requirements vs applicability cardinality | `requirements-not-allowed`, `requirements-needed` | implemented |
| 301 | invalid min/max occurs | `cardinality-invalid` | implemented (suppressed when the schema layer already reported the same attribute) |
| 302 | xs facet not valid for text (`totalDigits`) | `restriction-facet-not-for-text` | implemented |
| 303 | wrong restriction base type | `restriction-base-invalid`, `attribute-value-type-mismatch`, `property-value-type-mismatch` | implemented |
| 304 | empty restriction | `restriction-empty` | implemented |
| 305 | value not valid for its base type | `value-invalid-for-type` | implemented |
| 306 | schema validation error | `xsd-unexpected-element`, `xsd-missing-element`, `xsd-unexpected-attribute`, `xsd-missing-attribute`, `xsd-invalid-value`, `xsd-unexpected-text`, `xsd-other` | implemented by libxml2 |
| 307 | schema validation warning | - | not implemented: libxml2 reports none for the IDS schema on any of the 426 files, and warnings from the validator are not surfaced |
| 308 | facet not allowed in a restriction of that base | `restriction-facet-invalid` | implemented |
| 401 | reserved `Pset_` prefix | `property-reserved-prefix` | implemented (simple value or enumeration, as in the tool) |
| 501 | unexpected scenario | - | n/a |
| 502 / crit | XML cannot be read / not an IDS stream | `xml-not-well-formed`, `not-an-ids-file` | implemented, with line and column from libxml2 |
| 503, 504 | processing exception, schema not embedded | - | n/a (`xsd-engine-failure` is reported if the validator itself cannot run) |

Things listed in the audit tool's README that are covered by the rows above: IFC type names, predefined types
(`USERDEFINED` accepts any value), attribute names and value types, property sets limited to the standard's properties,
reserved prefixes, property data types ("measures") and the data type of standard properties, facet cardinality,
type coherence.

Not audit-tool rules (the brief listed them from memory): there is **no** check for duplicate enumeration values and
none for "empty required value" beyond 102/106; the tool has no rule for either.

### Known limits

- Patterns are compiled with the JavaScript regular-expression engine (after translating `\i \c \d \w`), the tool uses
  .NET. XSD character-class subtraction (`[a-z-[aeiou]]`) is not understood and is reported as an invalid pattern.
- The tool's property tables hold list and table properties; the second data type of a table property is checked in
  neither.
- The IFC tables follow the audit tool's data (IFC2X3, IFC4 and IFC4X3_ADD2 only).

## Truth tests

`test/fixtures/corpus/` holds every IDS file in the two buildingSMART repositories that can be tested (426 files, 2.8 MB,
copied unmodified; licences in the two sub-folders):

| Source | Folder | Files |
|---|---|---|
| buildingSMART/IDS `870f9c4e` | `Documentation/Examples` | 12 |
| | `ImplementersDocumentation/TestCases/{attribute 56, classification 27, entity 33, ids 12, material 29, partof 34, property 82, restriction 25, tolerance 36}` | 334 (187 `pass-`, 120 `fail-`, 27 `invalid-`) |
| buildingSMART/IDS-Audit-tool `fdfc562f` | `testing.shared/InvalidFiles` | 39 |
| | `testing.shared/ValidFiles` (+`CanonicalVersions`, `Restriction`) | 12 |
| | `testing.shared/IssueFiles` (+`Issue 61`) | 28 |
| | `testing.shared/bsFiles` | 1 |

In the IDS repo `pass-`/`fail-` describe whether an IFC model satisfies the IDS (the IDS itself is valid) and
`invalid-` marks an invalid IDS. The audit tool's own tests (`ids-lib.tests`) use these same files plus inline XML; the
file-based ones are the ones above.

`test/fixtures/reference/reference.json` is the verdict and messages of the official tool
(`ids-tool.CommandLine` 1.0.124 from NuGet) on each file. To regenerate it:

```
dotnet tool install ids-tool.CommandLine --tool-path /tmp/idstool
DOTNET_ROLL_FORWARD=Major node scripts/run-reference.mjs /tmp/idstool/ids-tool test/fixtures/reference/reference.json
```

(`DOTNET_ROLL_FORWARD=Major` lets the net8.0 tool run on a newer installed runtime.) `test/corpus.test.ts` runs
`checkIds` over every file and compares it with that reference.

Result: **426 of 426 files get the same valid/invalid verdict as the official tool** (346 valid, 80 invalid), and for
all 80 invalid files the set of error numbers is identical too (our codes mapped through the table above; the tool's
"critical"/502 reports for non-XML input are grouped with our `xml-not-well-formed`).
Read this with care: the 426 files were used while building, so this is a regression guard, not an independent score.
The first full run (before the fixes below) agreed on 399 of 426 and disagreed on 27:

| Files | Reference | First run | Cause | Kind |
|---|---|---|---|---|
| `Issue 11`, `Issue 39`, `Issue 41`, `Issue 55 OK`, `ValidFiles/RichFile`, `RichFileAttribute_Ifc2x3/Ifc4/Ifc4x3`, `validEmptyPredefinedType`, `IDS_StructuralSafety` (10) | valid | invalid | byte-order mark in front of the XML declaration rejected by the XML parser | bug in this package |
| `Issue 56` x2, `entity/{pass,fail}-in_ifc2x3_*` x8 (10) | valid | invalid | IFC2X3 class list lacked `IFCAIRTERMINAL` (the tool's IFC2X3 table includes classes that exist in IFC4 only) | data gap in the first data source |
| `Issue 61` x4 (4) | valid | invalid | standard property sets lacked properties such as `Status` and `Reference` | data gap in the first data source |
| `InvalidFiles/InvalidIfcPartOf` | invalid (201) | valid | entity inside `<partOf>` was not audited | bug in this package |
| `partof/invalid-a_group_predefined_type_must_match_exactly_1_2` | invalid (103) | valid | same | bug in this package |
| `InvalidFiles/InvalidIfcPropertyForType` | invalid (201) | valid | class restriction implied by a standard property set not implemented yet | rule not implemented yet |

No case was found where the reference tool is wrong; none was special-cased. After the fixes: 426/426.

For files the rules were not tuned on, `scripts/make-mutants.mjs` builds altered copies of the valid corpus files: 273 with
another `ifcVersion`, and 101 with one content mutation (misspelt class, attribute or property name, bad predefined
type or data type, reserved `Pset_` prefix, broken pattern, optional cardinality). `test/mutants.test.ts` compares
them with the tool when `MUTANT_DIR`/`MUTANT_REF` are set (commands in the file header). Result on the 374 mutants, of
which the tool rejects 112: **374 of 374 same verdict**.

## Browser proof (layer 1 and 2)

`demo/` is a tiny Vite page, not part of the product. `npm run demo:build && npm run demo:run` serves the build from a
local server and opens it in headless Chromium through Playwright with every request to any other origin aborted. Last
run: 0 blocked requests, 0 page errors, the valid file reported valid, the invalid file reported invalid with one
schema finding and one rule finding, both checks done in about 100 ms. Transferred (gzip, one load of an IFC4 file):
page 0.4 KB, module 62.4 KB, IFC4 tables 62.8 KB, xmllint.wasm 274.9 KB (the worker script's own 10 KB is not counted
by Playwright's per-request sizes; the build reports it). The demo fetches the wasm twice because each `checkIds` call
starts a new worker and the demo server sends no cache headers; a real server caches it.
Set `CHROMIUM_PATH` to an installed Chromium if Playwright's own browser download is not present.

## Layout

```
src/index.ts          checkIds
src/xsd.ts            layer 1: xmllint-wasm, message mapping
src/rules.ts          layer 2: spec/facet rules
src/matcher.ts        simpleValue / xs:restriction matching (enumeration, pattern, length)
src/ifc.ts            IFC tables (lazy per version)  src/ifc-data/*.generated.ts   generated
src/xstypes.ts        base-type lexical checks, allowed facets per base type
src/report.ts         finding collection and wording
src/xml.ts            element tree with positions
schemas/              bundled XSDs     src/schemas.generated.ts   generated
scripts/              build-schemas, build-ifc-data, run-reference, make-mutants
test/                 rules.test.ts (per rule), corpus.test.ts (truth test), fixtures/
demo/                 Vite page + Playwright driver (browser proof, not part of the product)
```

Regenerate the IFC tables with `node scripts/build-ifc-data.mjs <clone of IDS-Audit-tool>`. They come from
`SchemaInfo.{Schemas,Attributes,Properties,ObjectTypes,MeasureNames,ClassAndAttributeNames}.g.cs`. The published
`@ifc-lite/data` package (6.1.0, MPL-2.0) was evaluated for this and rejected: its tables lack
standard properties that the audit tool has (for example `Status` and `Reference` in `Pset_FurnitureTypeCommon`, whose
lines in the tool's source carry no description, the probable cause) and its IFC2X3 table lacks the IFC4-only classes
the tool lists for IFC2X3 (such as `IFCAIRTERMINAL`).

## Credits and licences

- Rule logic and IFC tables: buildingSMART IDS-Audit-tool, MIT, Copyright buildingSMART International Ltd.
- Official IDS schema and the test files: buildingSMART IDS repository, CC BY-ND 4.0 (copied unmodified).
- `XMLSchema.xsd`, `xml.xsd`: W3C, as embedded in the audit tool (W3C software licence; the first also carries
  Microsoft portions).
- `xmllint-wasm` / libxml2: MIT. `@xmldom/xmldom`: MIT.
