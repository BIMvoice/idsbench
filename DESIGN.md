# idsbench design

How idsbench looks and reads, and how to build a screen that belongs to it. The stylesheet is `src/styles.css`. Every component in every state is on `design/components.html` (serve the repository root with any static server and open `/design/components.html`; it is not part of the product and is not built into `dist`).

## The subject

idsbench takes one IDS file from blank to proven: Write it, Check it, Run it against a model. The people who use it are BIM coordinators and information managers. They accept or reject a delivery on what the Run screen says, so the first job of the interface is a verdict that cannot be misread.

The look comes from the paperwork of construction: the title block of a drawing, the review stamp, the inspection checklist, the print.

## Principles

1. **One loud thing.** The verdict is the only solid block of colour on a screen. Everything else is line and text.
2. **A verdict names what it judged.** The stamp is joined to a record of the two files, the IFC version and the size of the model, like the title block of a drawing. A screenshot of that block alone is a complete statement.
3. **Ruled means record, eased means pressable.** Results, records and tables have square corners and ruled lines. Anything you press has a 3 px corner. Nothing has a shadow.
4. **Dashed means waiting.** An empty file box, a button that is not available yet and an empty list all have a dashed outline. Solid means it is there.
5. **A state is a word and a box.** Pass, Fail, Nothing to check and Not checked each have their own box shape and their own word. Colour is the third signal, never the only one.
6. **A refusal is not a failure.** A file that cannot be used is framed and marked with a no-entry sign. It never takes the form of a verdict.

## The plan, as revised

**Colour.** The light theme is a whiteprint: blue-black line on cool paper. The dark theme is a blueprint: pale line on Prussian blue. The three state colours are the colours of site signs with their meanings kept: green for a safe condition, red for prohibition, yellow with dark lettering for caution. Blue is used for one thing, the action to take.

| Name | Light | Dark | Used for |
| --- | --- | --- | --- |
| Paper | `#f3f6f8` | `#0f2a4a` | the page |
| Field | `#ffffff` | `#0b2240` | where information goes: inputs, file boxes, the record, tables |
| Ink | `#14233f` | `#eaf1f9` | text, heavy rules, frames |
| Signal blue | `#0f5aa8` | `#cfe3f8` | the primary button, links, focus (light theme) |
| Sign green | `#1b7447` | same | the Pass stamp |
| Sign red | `#b3261e` | same | the Fail stamp |
| Sign yellow | `#f5b800` | same | the Incomplete stamp, the Not checked box, warnings |

**Type.** Two families, both bundled, both SIL Open Font License 1.1.

- *Atkinson Hyperlegible Next* for everything you read. It was drawn so that I, l and 1, and O and 0, cannot be mistaken for each other, which is what a GlobalId, a property name and a count need. Its zero is slashed, as on a drawing. Because of it there is no monospace face for identifiers.
- *Barlow Condensed* semibold for the four places where the interface speaks in a sign's voice: the wordmark, a screen title, a section title, and the verdict word. It is the condensed gothic of stamps and site boards.
- The system monospace face is used only for an excerpt of an IDS file, where columns must line up.

**Layout.** One left-aligned column, 66 rem wide at most, centred on the page. No side panels, no rail, no cards. The header is the wordmark and three plain tabs standing on a heavy rule. A result reads top to bottom: files, action, verdict, rows.

```
idsbench     Write   Check   Run
═══════════════════════════▀▀▀▀══════════════════════════════════

Run
Choose an IDS file and an IFC model, then run the check.

┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ┌───────────────────────────┐
  IDS file (.ids)               │ IFC model (.ifc)          │
  Drop a file here, or          │ Riverside-L02.ifc (21 KB) │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  └───────────────────────────┘
[ Run ]  [ Download report ]

┏━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ☒ Fail      ┃ 5 of 8 specifications passed. 2 failed. 1 could  ┃
┃             ┃ not be checked.                                  ┃
┣━━━━━━━━━━━━━┻━━━━━━┯━━━━━━━━━━━━━━━━━━━┯━━━━━━━┯━━━━━━┯━━━━━━━┫
┃ IDS file           │ Model             │ IFC   │ Enti-│ Check-┃
┃ Riverside-info.ids │ Riverside-L02.ifc │ IFC4  │ 297  │ 0.1 s ┃
┗━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━┷━━━━━━━┷━━━━━━┷━━━━━━━┛
Run checks the model against the IDS file as it is written. ...
─────────────────────────────────────────────────────────────────
 1  ☒ Fail              Walls have a fire rating                ⌄
                        Applied to 46 elements: 39 passed, 7 failed.
─────────────────────────────────────────────────────────────────
 2  ☑ Pass              Walls say whether they are load bearing
```

On a phone the same order holds in one column: the stamp sits above its sentence, the record folds to file names on full rows and three short cells below, and each failing element becomes a small block instead of a table row.

```
┏━━━━━━━━━━━━━━━━━━━━━━┓
┃ ☒ Fail               ┃
┣━━━━━━━━━━━━━━━━━━━━━━┫
┃ 5 of 8 specifications┃
┃ passed. 2 failed.    ┃
┣━━━━━━━━━━━━━━━━━━━━━━┫
┃ IDS file             ┃
┃ Model                ┃
┃ IFC   │ Enti- │ Chec-┃
┗━━━━━━━━━━━━━━━━━━━━━━┛
 1 ☒ Fail
   Walls have a fire rating
   Applied to 46 elements ...
```

**What was rejected as generic, and why.** The first plan had a blue button, green and red tinted pills with an icon, a verdict as a tinted banner with a coloured left edge, rounded cards for the file boxes, and a monospace face for GlobalIds. That is what any checker looks like, and it is what the old screen was. Each was replaced with something from the subject: the pill became a checklist box, the banner became the stamped cell of a title block, the card became a ruled box whose dashed or solid line says whether a file is there, and the monospace face went because the text face already tells similar characters apart. Three things were considered and left out as costume: a blueprint grid behind the page, a rotated ink stamp with a rough edge, and capital letters with wide spacing for the labels of the record (real title blocks use them; here they would be decoration). Two were in the plan and cut before building: numbers on the tabs, and a tally of states under the verdict (it would count "Nothing to check" apart from "Pass" and so could disagree with the headline, which counts it as passed). Two were built and removed after looking at the screens: a thick left bar on the notice, the excerpt and the chosen option, and a heavy rule above the list of rows, which competed with the verdict frame.

## The one-page layout (added after the tabs were removed)

idsbench is now one page around one document, the IDS file. The three tabs, and everything this file says about "Write", "Check" and "Run" as separate screens, describe the earlier layout; the tokens, the type and the components above are unchanged and are what the page is built from. This section is a short record of what the page adds. It was built for function first: the parts listed under "Left rough" have not had a design pass.

```
idsbench                                   Checks IDS 1.0 files, and IFC models against them.
══════════════════════════════════════════════════════════════════════════════════════════
┌ IDS file ─────────────────────────────┐  ┌ ─ IFC model ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ Riverside.ids (3.1 KB)                │    Optional. Add a model to check it ...
│ [Open] [New] [Download .ids]  Close   │    [Choose a model]
└───────────────────────────────────────┘  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
One line that says what to do next.

Title of the IDS                                             <- h2, the document's own title
┏━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ☒ Fail     ┃ 2 of 3 specifications passed. ...             ┃   <- or Valid / Not valid / Checking
┣━━━━━━━━━━━━┻━━━━━┯━━━━━━━━━━━━━━┯━━━━━━━┯━━━━━━┯━━━━━━━━━━┫
┃ IDS file         │ Model        │ IFC   │ Enti-│ Checked  ┃
┗━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━┷━━━━━━━┷━━━━━━┷━━━━━━━━━━┛
[Download failing elements] [Download report]
N things to fix in this IDS file                             <- only when the file has findings
 ☒ Problem   sentence. Specification 2.      [one-press fix] [Fix]
About this IDS                                        [Edit]
Specifications
 1  ☒ Fail   Walls have a fire rating                 [Edit]
             Every wall must have the property ...           <- the sentence, always there
             Applied to 4 elements: 2 passed, 2 failed.
             ⌄ Show the 2 failing elements, by reason
             (its findings; its form when it is being edited)
[Add a specification]
```

On a phone the two boxes stack, the record folds as before, and each row puts its state above its name.

**What the stamp says.** Pass, Fail and Incomplete are about a model. Valid and Not valid are about the IDS file. While a check or a run has not finished the stamp cell is dashed and says Checking; for a new, empty document it says New. Those two are not verdicts and take the dashed outline of everything that is waiting.

**New classes** (all at the end of `src/styles.css`, built from existing tokens; no colour was added):

| Component | Classes | Notes |
| --- | --- | --- |
| File box with actions | `.drop.static`, `.drop-actions` | The box is a place, not a button; it holds `.btn.small` buttons. `.btn.quiet` is an underlined text button for Close, Remove, Move, Delete. |
| Whole-page drop | `.drop-overlay` | Shown while files are dragged over the page. |
| Waiting stamp | `.verdict.waiting` | Dashed cell, soft word, no mark. |
| Record of a file check | `.record.of-file` | Four cells: IDS file, Model, IDS version, Specifications. |
| Waiting row state | `.state.waiting` | Dashed empty box with "Checking", "Waiting" or "Editing". |
| Next step | `.next` | One sentence under the file boxes. |
| To fix | `.to-fix`, `.fix-list`, `.fix-line` | One line per finding: severity, sentence, one-press fixes, Fix. |
| Undo notice | `.notice-box.undo` | After a one-press change, a move or a delete. |
| Specification row | `ol.specs.page-specs`, `.spec-head.no-state`, `.spec-words`, `.spec.editing`, `.spec-foot` | The state column exists only while a model is loaded. A row being edited has heavy rules above and below. |
| Findings in a row | `ul.findings.attached` | The Check finding row, indented under its specification. |
| Failing elements by reason | `details.more.fails`, `.fail-group`, `.group-reason` | One table per reason; the reason is the heading. |
| Pick-list | `.combo`, `.combo-list`, `.combo-option` | ARIA combobox with a list popup. |
| About | `.about`, `.section-head`, `.about-list`, `.about-form` | |
| Comparison with an earlier delivery | `section.compare`, `.compare-headline`, `.compare-files`, `ol.compare-specs`, `.change-group` | After the result's actions. A bold sentence, not a stamp: the verdict stays the one loud thing. The two files are a ruled table with name, size and SHA-256. Each row reuses the specification row; its box is the state now (ticked for Now passes and Still passes, crossed for Now fails and Still fails, yellow for Not checked in one) and its word is the change. The elements open like the failing elements, grouped by change and then by reason. |

**Fixed names of actions.** Open, New, Close, Example, Clear the example, Choose a model (Choose another model), Remove the model, Compare with an earlier delivery, Choose another earlier delivery, Remove the earlier delivery, Download the comparison, Download .ids, Download report, Download failing elements, Edit, Done, Fix, Undo, Run again, Add a specification, Add an item, Remove, Move up, Move down, Delete.

**One primary action at a time.** Nothing open: Open. Unsaved changes: Download .ids. No specifications: Add a specification. Not valid: Edit on the first specification with a problem. Valid, no model: Choose a model. Result with failures: Download failing elements. Result without: Download report.

**Left rough** (to pick up in one pass): the open specification is far taller than a screen (1,849 px with two items at 1280 x 800); the items in "Applies to" and "Must have" are plain framed boxes with a select beside each field; the To fix list and the findings under a row say the same sentence twice; the pattern list is a column of small buttons; the dark theme, the phone layout and 200% text were only checked for sideways scroll at 390 px; `design/components.html` shows none of the components above; the words "applicability" and "facet" still appear inside sentences that come from the Check engine.

## Tokens

All are CSS custom properties on `:root` in `src/styles.css`. The dark values apply under `prefers-color-scheme: dark`.

### Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` | `#f3f6f8` | `#0f2a4a` | page background |
| `--field` | `#ffffff` | `#0b2240` | inputs, file boxes, record, table, notices |
| `--ink` | `#14233f` | `#eaf1f9` | text, heavy rules, secondary button |
| `--ink-soft` | `#47566f` | `#afc0d6` | secondary text, hints, counts, disabled text |
| `--rule` | `#c3ccd8` | `#2f4e75` | fine rules between rows (decoration only) |
| `--rule-strong` | `#6f7d94` | `#7f97b5` | borders of controls, dashed outlines |
| `--tint` | `#e3ecf6` | `#17385f` | hover wash, drag-over wash |
| `--action` | `#0f5aa8` | `#cfe3f8` | primary button, links, disclosure |
| `--action-strong` | `#0b4685` | `#ffffff` | primary button hovered |
| `--on-action` | `#ffffff` | `#0f2a4a` | text on the primary button |
| `--focus` | `#0f5aa8` | `#ffffff` | focus ring, 3 px, 2 px away from the control |
| `--pass` | `#17633d` | `#7ed6a2` | Pass as text or mark on the page |
| `--pass-fill` | `#1b7447` | same | the Pass stamp, with `--on-fill` text |
| `--fail` | `#a01f18` | `#ffa69b` | Fail as text or mark, field errors, refusal frame |
| `--fail-fill` | `#b3261e` | same | the Fail stamp, with `--on-fill` text |
| `--on-fill` | `#ffffff` | same | text on a green or red stamp |
| `--flag-fill` | `#f5b800` | same | Incomplete stamp, Not checked box, warning box |
| `--on-flag` | `#14233f` | same | text on yellow |

The stamp fills are the same in both themes on purpose: a Fail must not look paler at night. The older names (`--bg`, `--text`, `--muted`, `--line`, `--accent` and the rest) still resolve, so rules written before this system keep working; do not use them in new rules.

Measured contrast: run `node design/contrast.mjs`. It reads the tokens from the stylesheet and fails if any pair is under its minimum. Lowest text pair: 5.78 to 1 (white on the Pass stamp). Lowest control border: 3.84 to 1.

### Type

| Role | Token | Size | Weight | Line height | Face |
| --- | --- | --- | --- | --- | --- |
| Verdict word | `--t-verdict` | 3.5 rem (2.75 on a phone) | 600 | 1 | display |
| Screen title, `h2` | `--t-h2` | 2.5 rem (2 on a phone) | 600 | 1.05 | display |
| Section title, `h3` | `--t-h3` | 1.5 rem | 600 | 1.15 | display |
| Wordmark | | 1.875 rem | 600 | 1 | display |
| Headline sentence | `--t-headline` | 1.25 rem | 600 | 1.4 | text |
| Lead, row name, tab, `h4` | `--t-lead` | 1.125 rem | 400, 600, 600, 700 | 1.5 (1.3 for `h4`) | text |
| Body, button, input | `--t-body` | 1 rem | 400 (600 on buttons) | 1.5 | text |
| Counts, notes, hints, table | `--t-small` | 0.9375 rem | 400 | 1.5 | text |
| Record label, column heading | `--t-label` | 0.8125 rem | 400, 600 | 1.5 | text |
| File excerpt | | 0.8125 rem | 400 | 1.6 | code |

Sentence case everywhere. No capitals for labels, no italics, no letter-spacing beyond the 0.01 em on the wordmark and identifiers. Lines of prose stop at about 46 rem.

### Space, lines, corners

- Spacing: `--s1` to `--s7` are 0.25, 0.5, 0.75, 1, 1.5, 2 and 3 rem.
- Line weights: `--w-fine` 1 px for rules between rows; `--w-control` 1.5 px for controls; `--w-heavy` 2 px for the header rule, the verdict block and a refusal.
- Corners: `--r-press` 3 px on buttons, inputs, file boxes and option rows. Zero on everything else.
- Elevation: none. No shadows, no gradients except the hatch on the Incomplete stamp.
- Breakpoint: one, at 40 em.
- Motion: the stamp lands in 0.18 s when a result arrives, the progress line moves, a chevron turns. All three are off under `prefers-reduced-motion`.

## Components

Markup is in `design/components.html`; copy it from there.

| Component | Classes | States and notes |
| --- | --- | --- |
| App header | `.top`, `.brand` | Wordmark in the display face, lower case, on a 2 px ink rule. |
| Tabs | `.tabs`, `.tab` | Selected: ink text and a 6 px ink bar on the rule. Others: soft text; a pale bar on hover. Wraps on a phone. |
| File box | `.drops`, `.drop`, `.drop-label`, `.drop-detail`, `.drop-hint` | Empty: dashed outline. `.has-file`: solid ink outline, file name in bold, size, and "Press to choose another file." `.over` (a file is dragged over it): 2 px blue outline and wash. `.invalid` (its file was refused): 2 px red outline. `.drops.single` for one box. |
| Primary button | `.btn.primary` | Solid blue. One per screen. Disabled: dashed outline, soft text. |
| Secondary button | `.btn`, `.btn.small` | Ink outline; wash on hover. `.small` for row actions. |
| Verdict | `.verdict` + `.pass` / `.fail` / `.incomplete`, `.verdict-word`, `.headline` | Pass: green cell, white word, ticked box. Fail: red cell, white word, crossed box. Incomplete: yellow hatched cell, dark word, empty box. The sentence sits beside the word on white. In React use `<Verdict state word>sentence</Verdict>` from `src/ui/Verdict.tsx`, inside the live region. A bare `.headline.pass` outside a `.verdict` still gets a frame and a coloured edge, so a screen that has not adopted the block yet reads correctly. |
| Record | `dl.meta.record` with one `div` per `dt` and `dd` | Goes directly under the verdict and joins it. Five cells at most; long file names wrap. |
| Specification row, closed | `ol.specs`, `li.spec`, `.spec-head`, `.state`, `.spec-name`, `.spec-counts`, `.note` | Number (its place in the IDS file, drawn by the stylesheet), state, name, counts. Notes line up under the name. |
| Specification row, open | `details` > `summary.spec-head` | Chevron at the right turns when open; row washes on hover; focus ring inside the row. |
| State | `.state.pass` / `.fail` / `.nothing` / `.unchecked` | Write only the word inside. The box is drawn by the stylesheet: ticked, crossed, outlined with a dash, yellow and empty. |
| Failing elements | `.table-wrap` > `table` | White table, ink rule under the headings. On a phone each row is a block: class, name, GlobalId, reason. Keep the `role` attributes on the table. `.mono` or `.ident` on an identifier. |
| Finding row (Check) | `ul.findings`, `li.finding`, `.finding-head`, `.sev.error` / `.sev.warning`, `.finding-message`, `.finding-meta`, `.finding-where`, `.finding-code` | Same row as a specification without the number. Problem: red crossed box. Warning: yellow box with an exclamation mark. |
| Source excerpt | `pre.excerpt` | White, fine frame, system monospace, scrolls sideways inside itself. |
| Form field | `.field`, `.field-label`, `input` / `textarea` / `select`, `.hint` | Label above, hint below. 1.5 px border, ink on hover. |
| Inline field error | `aria-invalid="true"` on the control, `.msg.error-msg` | 2 px red border and a red sentence with a small crossed box. `.msg.advice-msg` is the soft version for advice. |
| Checkbox | `label.check` > `input` | Square box; ink with a tick when checked. |
| Choice group | `fieldset.choice-group` > `label.radio` | Each option is a full-width row; the chosen row gets an ink frame. |
| Disclosure | `details.more` > `summary` | Underlined blue text with a chevron that turns down when open. |
| Notice | `.notice-box`, `.meta.notice` | A fact the reader should know; fine frame, or plain soft text under the record. |
| Refusal | `.error` | White, 2 px red frame, no-entry mark. For a file that cannot be used or a check that did not finish. |
| Progress | `.working` | Soft text with a moving dashed line. |
| Empty state | `.empty` | Dashed box, soft text that says what to do next. |
| Toolbar (Write) | `.actions.write-bar` with `role="toolbar"` | A row of buttons closed by a fine rule. |
| Accordion (Write) | `ul.specs.write-specs`, `.spec-head.write-spec-head`, `.spec-toggle`, `.row-actions`, `.spec-body`, `.facet` | Chevron on the toggle follows `aria-expanded`. |

## Writing

The voice is a careful colleague reading a result aloud: plain verbs, whole sentences, sentence case, no apology, no exclamation.

**Fixed names.** Use these words and no others for these things.

| Thing | Name |
| --- | --- |
| The three steps | Write, Check, Run |
| The two inputs | IDS file, IFC model ("the model" after first mention) |
| Where a file goes | the IDS box, the IFC box |
| Row states | Pass, Fail, Nothing to check, Not checked |
| Verdict words in Run | Pass, Fail, Incomplete |
| The actions | Run, Download report |
| What is listed under a failed row | failing elements |
| One rule in an IDS file | specification |

**Rules.**

- A button says what it does and keeps that name everywhere it is mentioned: the button is "Download report", so a sentence says "the downloaded report".
- A verdict sentence gives counts, not adjectives: "5 of 8 specifications passed. 2 failed."
- A refusal says what the file is, then what to do: "This file is zipped. Unzip it and choose the .ifc file inside."
- An empty state says what to do next: "No specifications yet. Add the first one to say what the model must contain."
- Never write a word a coordinator would not use at a desk: parse, schema error, null, exception, facet (say "item"), cardinality.
- Numbers use a comma for thousands. Units have a space: "0.3 s", "21.2 KB".

## Do and do not

| Do | Do not |
| --- | --- |
| Put one verdict on a screen, at the top of the result. | Colour a second block, a row background or a heading with a stamp fill. |
| Write the state word and let the stylesheet draw the box. | Use a coloured dot, a pill, or the characters ✓ and ✗. |
| Use the red frame with the no-entry mark for a refused file. | Show "Fail" for a file that could not be read. |
| Use a dashed outline for something that is not there yet. | Grey something out with opacity. |
| Keep records square and controls at 3 px. | Round a table, a verdict or a row; add a shadow. |
| Use `--pass` and `--fail` for text, the `-fill` tokens for the stamp. | Put `--pass-fill` or `--fail-fill` behind small text in the dark theme, or use them as text colours. |
| Set an identifier in the text face with `.ident`. | Reach for the monospace face outside a file excerpt. |
| Name a button by what it does: "Download report". | "Submit", "OK", "Go", an arrow after the label. |
| Say what is missing and what to do. | "Invalid input", "Something is wrong with your file". |

## Adopting it in Check and Write

1. Take `src/styles.css`, `src/fonts/` and `src/ui/Verdict.tsx` from this branch. In `styles.css` delete the block your branch appended at the end: this stylesheet already styles those class names (`.finding*`, `.sev`, `.excerpt`, `.field`, `.hint`, `.msg`, `.more`, `.check`, `.radio`, `.choice-group`, `.facet*`, `.write-bar`, `.spec-toggle`, `.spec-body`, `.row-actions`, `.value-*`, `.pair`, `.range`, `.add-menu`, `.words`, `.empty`).
2. Replace `<p className={`headline ...`}>` with `<Verdict state={...} word="...">` inside the live region. Check needs its own words; suggested: "Valid", "Not valid", and "Valid, with warnings" for the yellow state.
3. Remove any mark character or pill from a state or severity label; leave only the word.
4. Put an identifier or a rule code in the text face (`.ident`), not in a monospace face.
5. Replace an em dash that joins two labels ("Untitled.ids — unsaved changes") with words.
6. Use one `.btn.primary` per screen.
7. Run `node design/contrast.mjs` if you add a colour, and compare your screen with `design/components.html` in both themes at 1280 and 390 px.

## Fonts

| Face | Source | Licence | File | Bytes |
| --- | --- | --- | --- | --- |
| Atkinson Hyperlegible Next, variable 400 to 700, Latin | `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0, subset | SIL OFL 1.1 | `src/fonts/atkinson-hyperlegible-next-latin.woff2` | 18,464 |
| The same, Latin Extended-A and Romanian letters; fetched only when a page shows such a letter | same | SIL OFL 1.1 | `src/fonts/atkinson-hyperlegible-next-latin-ext.woff2` | 8,852 |
| Barlow Condensed 600, letters, digits and basic punctuation | `@fontsource/barlow-condensed` 5.3.0, subset | SIL OFL 1.1 | `src/fonts/barlow-condensed-600-latin.woff2` | 12,424 |

Licence texts are next to the files. Neither face has a reserved font name. All three files use `font-display: swap`: the first paint uses the system face and never waits for a font. Nothing is loaded from another site.
