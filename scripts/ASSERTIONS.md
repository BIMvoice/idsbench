# Browser assertions: what became of each one

The tabbed app had two browser scripts: `scripts/browser-check.mjs` with 121 assertions and `scripts/write-check.mjs` with 51. Both were rewritten for the one page. Every one of the 172 is listed here with what became of it:

- **kept**: still asserted against the one-page app (the selectors and sometimes the wording of the title changed; the behaviour asserted is the same);
- **replaced**: the behaviour changed shape with the page, and the named assertion covers what it protected;
- **retired**: the behaviour no longer exists; the reason is given.

| | kept | replaced | retired | total |
| --- | --- | --- | --- | --- |
| browser-check (121) | 80 | 31 | 10 | 121 |
| write-check (51) | 44 | 4 | 3 | 51 |
| both | 124 | 35 | 13 | 172 |

The scripts now hold 150 assertions (browser-check) and 70 (write-check), 220 in all. 71 of them are new: they are not named in the tables below and are listed at the end. A third script, `scripts/review-check.mjs`, holds 56 more; two more, `scripts/scale-check.mjs` (25) and `scripts/proof-check.mjs` (20), come after it. Four assertions of the first round changed wording because the behaviour they describe was changed on purpose (see "Changed on purpose" at the end).

Several old assertions can point at one new one (two tabs asserted the same thing about the same file), which is why the numbers of kept and replaced do not add up to the number of assertions that carry them.

## scripts/browser-check.mjs (121 before)

| # | Assertion on the tabbed app | Outcome | On the one page |
| --- | --- | --- | --- |
| 1 | three tabs present | retired | There are no tabs: the page is one. The opposite is asserted ("one page: no tabs"). |
| 2 | Write opens an editor (its own check is scripts/write-check.mjs) | replaced | empty page: Open, New and Try an example are offered; nothing else to press but Choose a model |
| 3 | Check tab has its drop zone and no longer says it is not built | replaced | empty page: two file boxes, IDS file and IFC model |
| 4 | Run disabled with no files | retired | There is no Run button: a valid IDS file and a model run by themselves (see "a valid IDS file and a model run by themselves"). |
| 5 | a live region for announcements exists before any run, and is empty | kept | same title |
| 6 | pass pair headline | kept | same title |
| 7 | pass pair row state Pass | kept | same title |
| 8 | file names and sizes shown in the boxes | kept | same title |
| 9 | result names both files | kept | same title |
| 10 | result says the IDS file was checked first and is valid, and no longer says it was not verified | kept | result says the IDS file was checked first and is valid |
| 11 | headline sits inside the live region | kept | same title |
| 12 | report download is JSON with specs | kept | report download is JSON with the check and the run |
| 13 | fail pair headline | kept | same title |
| 14 | fail pair row state Fail | kept | same title |
| 15 | failing element listed | kept | same title |
| 16 | IFC2X3 specification on an IFC4 model is checked and passes | kept | same title |
| 17 | the row says the model version is not one the specification lists | kept | same title |
| 18 | IFC2X3 specification that fails on an IFC4 model fails for its own reason | kept | same title |
| 19 | states headline counts passed, failed and unchecked separately | kept | same title |
| 20 | states headline is styled as a failure | kept | same title |
| 21 | required and met shows Pass | kept | same title |
| 22 | required and broken shows Fail with counts | kept | same title |
| 23 | required with nothing matching shows Fail and why | kept | same title |
| 24 | optional with nothing matching shows Nothing to check | kept | same title |
| 25 | prohibited and none found shows Pass | kept | same title |
| 26 | prohibited and found shows Fail and never "2 passed" | kept | same title |
| 27 | an unsafe pattern shows Not checked and what to do | kept | same title |
| 28 | IFC2X3 specification shows Pass with the version note | kept | same title |
| 29 | every state has a word and a mark, not colour alone | kept | same title |
| 30 | prohibited and found lists the elements that must not be there | kept | prohibited and found lists the elements that must not be there, under the reason said once |
| 31 | no jargon in the states page | kept | same title |
| 32 | one pass and one unchecked is not "all passed" | kept | same title |
| 33 | IFC with a valid header and a cut-off body: plain sentence, no verdict | kept | IFC with a valid header and a cut-off body: plain sentence, no verdict on the model |
| 34 | zipped IFC named .ifc: plain sentence, no verdict | kept | zipped IFC named .ifc: plain sentence, no verdict on the model |
| 35 | ifcXML named .ifc: plain sentence, no verdict | kept | ifcXML named .ifc: plain sentence, no verdict on the model |
| 36 | empty IFC file: plain sentence, no verdict | kept | empty IFC file: plain sentence, no verdict on the model |
| 37 | IFC with a header and no data: plain sentence, no verdict | kept | IFC with a header and no data: plain sentence, no verdict on the model |
| 38 | IFC2X2 model: plain sentence, no verdict | kept | IFC2X2 model: plain sentence, no verdict on the model |
| 39 | text file named .ifc: plain sentence, no verdict | kept | text file named .ifc: plain sentence, no verdict on the model |
| 40 | IDS file in the IFC box: plain sentence, no verdict | replaced | IDS file in the IFC box: recognised as the IDS file and opened as that |
| 41 | IFC model in the IDS box: plain sentence, no verdict | replaced | IFC model in the IDS box: recognised as the model |
| 42 | both files in the wrong boxes: plain sentence, no verdict | replaced | both files in the wrong boxes: each goes where it belongs and the pair runs |
| 43 | IDS that is not XML: plain sentence, no verdict | kept | IDS that is not XML: plain sentence, no verdict, no rows, no report |
| 44 | IDS cut off: plain sentence, no verdict, and Show them in Check offered | replaced | IDS cut off: Not valid, its problems listed on the page, and the model is not run |
| 45 | empty IDS file: plain sentence, no verdict | kept | empty IDS file: plain sentence, no verdict, no rows, no report |
| 46 | IDS with the wrong namespace: plain sentence, no verdict, and Show them in Check offered | replaced | IDS with the wrong namespace: Not valid, its problems listed on the page, and the model is not run |
| 47 | IDS with no specifications: plain sentence, no verdict, and Show them in Check offered | replaced | IDS with no specifications: Not valid, its problems listed on the page, and the model is not run |
| 48 | IDS 0.9.7 (refused: idsbench reads IDS 1.0 only): plain sentence, no verdict, and Show them in Check offered | replaced | IDS 0.9.7 (refused: idsbench reads IDS 1.0 only): Not valid, its problems listed on the page, and the model is not run |
| 49 | HTML page named .ids: plain sentence, no verdict | kept | HTML page named .ids: plain sentence, no verdict, no rows, no report |
| 50 | IFC with a UTF-8 byte order mark is checked | kept | same title |
| 51 | IFC written as one long line is checked, all 3,000 walls | kept | same title |
| 52 | first pair passes | kept | same title |
| 53 | choosing another file removes the previous result at once | kept | same title |
| 54 | second pair shows its own result under its own names | kept | same title |
| 55 | Run is disabled while a check is in progress | replaced | while a run is in progress the stamp cell is not a verdict: it says Checking, with what is being done |
| 56 | changing a file during a run stops it: no progress text, Run available again | replaced | changing a file during a run stops it: nothing of the first pair remains |
| 57 | the stopped run never shows a result under the new file name | kept | same title |
| 58 | a run after a stopped run gives the new pair its own result | kept | same title |
| 59 | clicking Run twice starts one check, not two | replaced | typing three times in a row started one run, not three |
| 60 | a crashed worker gives a plain sentence and no result | kept | same title |
| 61 | Run works again after a crash | kept | Run again works after a crash |
| 62 | Tab order: tabs, IDS box, IFC box, Run | replaced | keyboard: Open is the first stop, and both files are taken with Enter or Space |
| 63 | both boxes take a file with Enter or Space | replaced | keyboard: Open is the first stop, and both files are taken with Enter or Space |
| 64 | after Run: Download report, then each row that has elements to show | replaced | keyboard: after the result come Download failing elements, Download report, About, then the rows |
| 65 | a row opens and closes from the keyboard | kept | same title |
| 66 | focus is visible on the focused row | kept | same title |
| 67 | the engine rejects the official invalid file, with a position | kept | same title |
| 68 | Check tab, nothing chosen: no result, no button, the privacy line is there | replaced | empty page: no verdict, no rows, no report, no fake content / the privacy line is on the page from the start |
| 69 | Check tab: one drop zone, labelled as in Run | replaced | empty page: two file boxes, IDS file and IFC model |
| 70 | valid file: headline in words, no extra button pressed | kept | same title |
| 71 | valid file: version found is shown, no rows | kept | same title |
| 72 | valid file: report is one JSON file named after the IDS file | kept | same title |
| 73 | invalid official file: headline counts the engine's errors | kept | same title |
| 74 | invalid official file: one row per engine finding | kept | same title |
| 75 | first row: message, position and short code | kept | same title |
| 76 | rows start closed | kept | same title |
| 77 | excerpt marks the engine's line and shows that line of the file | kept | same title |
| 78 | excerpt has two lines of context each side (when the file has them) | kept | same title |
| 79 | excerpt is monospaced, scrolls sideways, and is plain text | kept | same title |
| 80 | report holds the same findings as the engine | kept | same title |
| 81 | not an XML file: one plain sentence, no rows, no report | kept | IDS that is not XML: plain sentence, no verdict, no rows, no report |
| 82 | an IFC model dropped by mistake: one plain sentence, no rows, no report | replaced | IFC model in the IDS box: recognised as the model |
| 83 | an empty file: one plain sentence, no rows, no report | kept | empty IDS file: plain sentence, no verdict, no rows, no report |
| 84 | an XML file that is not an IDS: one plain sentence, no rows, no report | kept | HTML page named .ids: plain sentence, no verdict, no rows, no report |
| 85 | XML cut off: a sentence says what to do and one row points at the break | kept | same title |
| 86 | choosing another file removes the old rows, headline and report at once | kept | same title |
| 87 | of three files chosen in a row, only the last one shows a result | kept | same title |
| 88 | keyboard: arrow to the Check tab, then its drop zone, a row, the excerpt and Download report are all reachable | replaced | keyboard: after the result come Download failing elements, Download report, About, then the rows / keyboard: Edit opens the form, a pick-list is a combobox with a list (arrows, Enter), and the change gives a new result |
| 89 | keyboard: the focused row shows a focus ring | replaced | focus is visible on the focused row |
| 90 | Run with an invalid IDS: refusal sentence with the count, no verdict, no result | replaced | a model with an IDS file that is not valid: the model waits, one sentence says the file comes first, nothing is run |
| 91 | keyboard: Show them in Check is reachable by Tab | retired | The button is gone: the problems are listed on the same page, under the stamp and at their specification. |
| 92 | Show them in Check switches to the Check tab and moves focus there | retired | There is no other tab to switch to. |
| 93 | ...with the same file already loaded and the same findings | replaced | ...with its findings on the same page, one row per engine finding, and the list of things to fix |
| 94 | back in Run, the refusal is still shown for that file | retired | There is no tab to come back to; the findings never leave the page. |
| 95 | choosing another IDS file in Run clears the refusal and its button | replaced | opening a valid IDS file after one that was not valid clears the problems and runs the waiting model |
| 96 | Run with a valid pair still works after a refusal | replaced | opening a valid IDS file after one that was not valid clears the problems and runs the waiting model |
| 97 | large IDS (2,000 specifications): valid, and the page stayed responsive (no freeze over 500 ms) | kept | large IDS (2,000 specifications): valid, every specification on the page, and the page stayed responsive (no freeze over 500 ms) |
| 98 | integration: an opened file edited in Write is unsaved | kept | an opened file that is edited is unsaved, and the page heading follows the title |
| 99 | integration: Write -> Use this IDS in Run switches to Run with the file in the IDS box | retired | No hand-off exists: the document being edited is the IDS file the model is run against. |
| 100 | integration: the file from Write passes Run's Check gate and gives a result | replaced | the page checks and runs again by itself after the pause: the new result is of the changed file |
| 101 | integration: a dropped IDS replaces the handed one and clears its result at once | replaced | choosing another file removes the previous result at once |
| 102 | integration: the run after the replacement is for the dropped file only | replaced | second pair shows its own result under its own names |
| 103 | integration: Check holds nothing from this (Run only hands a file over when it refuses it) | retired | There is no separate Check screen that could hold a file of its own. |
| 104 | integration: switching tabs keeps the Write draft, name and unsaved mark | retired | There are no tabs to switch between; the draft across a reload is still asserted in write-check. |
| 105 | integration: handing the same file over again replaces the dropped one and leaves no result | retired | No hand-off exists. |
| 106 | integration: storage holds only Write's sessionStorage draft | kept | storage holds only the sessionStorage draft |
| 107 | integration: the form lets an unknown IFC class through (it has no IFC tables) | replaced | an unknown IFC class: the engine's finding is on the page at its specification, and Download .ids is off with the engine's sentence |
| 108 | integration: Download is refused by the engine, with its sentence, and no file is saved | replaced | an unknown IFC class: the engine's finding is on the page at its specification, and Download .ids is off with the engine's sentence |
| 109 | integration: Use this IDS in Run is refused the same way and stays on Write | retired | No hand-off exists; a model with an IDS file that is not valid waits (see "a model with an IDS file that is not valid"). |
| 110 | integration: Write -> Show them in Check shows that file and the same problem | replaced | an unknown IFC class: the engine's finding is on the page at its specification, and Download .ids is off with the engine's sentence |
| 111 | integration: Write's Open and Check give the identical sentence for an IDS 0.9.7 file | replaced | an IDS 0.9.7 file: one sentence, the engine's own, and it cannot be edited here |
| 112 | integration: opening the Write tab at first paint loads neither the Check engine, nor the IFC parser (worker), nor the IFC tables | kept | first paint of the empty page loads neither the Check engine, nor the IFC parser (worker), nor the IFC tables |
| 113 | scale: every wall fails one specification | kept | same title |
| 114 | scale: the page lists 200 rows | kept | same title |
| 115 | scale: the page says how many are not shown and where they are | kept | same title |
| 116 | scale: the downloaded report holds every failing element | kept | same title |
| 117 | scale: reasons are readable | kept | same title |
| 118 | nothing stored: localStorage, sessionStorage, cookies, indexedDB, caches, service workers | kept | nothing stored when nothing is unsaved: localStorage, sessionStorage, cookies, indexedDB, caches, service workers |
| 119 | no cookies in the browser context | kept | same title |
| 120 | no request to anywhere but the local server | kept | same title |
| 121 | no uncaught page errors | kept | same title |

## scripts/write-check.mjs (51 before)

| # | Assertion on the tabbed app | Outcome | On the one page |
| --- | --- | --- | --- |
| 1 | empty editor invites the first action | kept | same title |
| 2 | top bar: New, Open…, Download .ids, Use this IDS in Run | replaced | the IDS box holds Open, New and Download .ids |
| 3 | shows the file name and no unsaved mark on a blank document | kept | same title |
| 4 | says where the draft is kept in one sentence | kept | says where unsaved work is kept in one sentence |
| 5 | Download is off on a blank document, with a reason in words | kept | same title |
| 6 | Use this IDS in Run is off too | retired | The button is gone: there is no hand-off. |
| 7 | nothing is stored while nothing is written | kept | same title |
| 8 | a bad email address gets a message beside the field | kept | same title |
| 9 | a good email address clears it | kept | same title |
| 10 | an unsaved mark appears | kept | same title |
| 11 | a new specification opens in place with its Name field focused | kept | same title |
| 12 | Download stays off while something is missing, and says what | kept | same title |
| 13 | a pattern that is not valid gets a message beside the field | kept | same title |
| 14 | and Download is off with the reason | kept | same title |
| 15 | a valid pattern clears it | kept | same title |
| 16 | "In words" line for the specification | kept | same title |
| 17 | opening a new specification closes the other (accordion) | kept | same title |
| 18 | only the inputs the choice needs are shown (text length) | kept | same title |
| 19 | Download is on once nothing is missing | kept | same title |
| 20 | the downloaded file is valid against the official IDS 1.0 schema (xmllint) | kept | same title |
| 21 | the file name comes from the title | kept | same title |
| 22 | the file holds two specifications | kept | same title |
| 23 | facet kinds in the file: entity, property, attribute, classification | kept | same title |
| 24 | restriction kinds in the file: list, pattern and length | kept | same title |
| 25 | after download the unsaved mark is gone | kept | same title |
| 26 | Use this IDS in Run switches to the Run tab with the file in the IDS box | retired | No hand-off exists: the model is added on the same page. |
| 27 | Run shows the first specification as Pass and the second as Fail | kept | with a model, the first specification is Pass and the second is Fail |
| 28 | opening a file shows its name and no unsaved mark | kept | same title |
| 29 | editing marks the file unsaved | kept | same title |
| 30 | only the one changed value differs between the example and the download | kept | same title |
| 31 | the edited example is valid against the schema | kept | same title |
| 32 | the download keeps the opened file name | kept | same title |
| 33 | opening an IDS 0.9.7 file is refused with one plain sentence | replaced | an IDS 0.9.7 file is Not valid with one plain sentence, the engine's own |
| 34 | and the document in the editor is untouched | replaced | a file that is not an IDS file is refused beside the document, which stays as it was, unsaved changes and all (browser-check). A 0.9.7 file is an IDS file with a problem, so it is shown, after the question about unsaved changes. |
| 35 | at 390 px wide the page does not scroll sideways | kept | at 390 px wide the page does not scroll sideways: empty, with a result, and with a form open |
| 36 | arrow keys reach the Write tab | retired | There are no tabs. |
| 37 | Tab reaches the Title field | replaced | Tab reaches New / Enter starts a new IDS with the keyboard in the Title field |
| 38 | Tab reaches "Add a specification" | kept | same title |
| 39 | Enter adds a specification and focus lands in its Name field | kept | same title |
| 40 | Tab reaches "Add an item to Applies to" | kept | same title |
| 41 | Enter opens the list of kinds with focus on the first | kept | same title |
| 42 | choosing a kind puts focus in the new item | kept | same title |
| 43 | Tab reaches Download .ids, now on | kept | same title |
| 44 | the file made without the mouse is valid against the schema | kept | same title |
| 45 | and holds the typed values | kept | same title |
| 46 | the draft is in sessionStorage only | kept | same title |
| 47 | reloading the tab restores the draft | kept | same title |
| 48 | closing the tab with unsaved changes asks first (beforeunload) | kept | same title |
| 49 | New clears the draft | kept | same title |
| 50 | no request to anywhere but the local server | kept | same title |
| 51 | no uncaught page errors | kept | same title |

## New assertions

In `scripts/browser-check.mjs` (49):

- one page: no tabs
- empty page says what to do next in one line
- empty page: one primary action, Open
- a valid IDS file and a model run by themselves: no button was pressed, one worker started
- pass: one primary action, Download report; and the next step is said
- fail: one primary action, Download failing elements
- every specification row reads as a sentence
- files dragged over the page: the whole page says it takes them
- both files dropped at once anywhere on the page: told apart by content, and run
- Try an example: a bundled IDS file and model give a mixed result at once
- the example is marked as an example and can be cleared in one press
- clearing the example gives the empty page back
- failing elements are grouped by reason: each reason once, with its count, and the counts add up to the engine's number
- the reason is not repeated on every row
- Download failing elements: a CSV named after the model, UTF-8 with a byte order mark, CRLF, one row per failing element
- CSV: commas and quotes are quoted, letters outside ASCII are kept
- valid file, no model: the stamp is about the file (Valid), never Pass, and the rows carry no state
- valid file, no model: the next step and the one primary action are the model
- findings are attached to the specification they concern
- an unedited file is checked on its own text: the excerpt is the file's line, character for character
- a one-press fix is offered on the line, beside Fix
- pressing it makes the file valid, the list goes, and the waiting model runs by itself
- the result names what was judged: the file with unsaved changes
- the fix can be undone: nothing is applied silently
- Undo brings the file back as it was opened: Not valid again, no unsaved changes, the result gone
- a problem with no known answer has Fix and no one-press button
- not valid: the one primary action is Edit on the specification with the problem
- Fix opens that specification and puts the keyboard in the field concerned, marked with the problem's sentence
- typing the correction and choosing it from the pick-list makes the file valid, and the model is run
- a row being edited does not show its result as its state; the other parts of the result stay
- the sentence of the row follows the form as it is typed
- after a change the previous result is gone at once and the page says it is checking again
- a change made while a run is in flight stops that run: only the result of the last version ever appears
- the report says the IDS that was run holds unsaved changes
- unsaved changes: the one primary action is Download .ids
- an unedited file: the finding is at the position in the file as opened (line 1), and the excerpt is the file's own text
- once it is edited the position is in the file as it will be saved, and the record says so
- taking the change back returns to the file as opened: line 1 again, no unsaved changes
- an unedited file is run from the opened file itself: every read is of that file at its own size, byte order mark and all
- moving a specification with a result on screen: the rows change place and the result is made again for the new order
- deleting a specification with a result on screen: no dialog, the row goes, the result is made again for the seven left, and Undo is offered
- Undo puts the deleted specification back where it was
- opening another IDS file over unsaved changes asks first
- a name one letter away from a real one: the engine's suggestion is in the sentence, and no button applies the guess
- ...and the engine's own suggestion is offered as a one-press fix (now asserted for a class written in other letters, IfcWall for IFCWALL; it was asserted for IFCWALLL, which is a guess and is no longer one press)
- after the fix the file is valid, Download .ids works, and the saved file is one the engine accepts
- scale: the group says the full count, not the number listed
- scale: the CSV holds every failing element, not only the 200 on the page
- at no moment of this whole script did the page show a result made for another version of the document

In `scripts/write-check.mjs` (18):

- a new document is not judged before there is something to judge: no verdict, the stamp cell says New
- New puts the keyboard in the Title field, and About this IDS asks for the title only
- a specification starts from a pattern: five common shapes, or an empty one
- the IFC class comes from a pick-list with type-ahead: plain name beside the technical one
- choosing the class narrows the property sets offered to those of that class
- the property set and the property come from pick-lists; the property list is that set's
- choosing a standard property fills in its data type
- plain words on screen: no "facet", "applicability", "cardinality", "restriction" or "how to match" in the form
- the form shows what the common case needs; the rest is behind More options
- a pattern arrives complete: it reads as a sentence and has nothing to fix
- while writing, the page checks the file by itself: it is Valid, with nothing pressed
- what the pick-lists wrote is the technical form, and the Check engine accepts the file
- Done closes the form and the row shows its own result again
- and it is not opened in the forms: no Edit, no Fix, and the page says to correct it in the tool that made it
- changing "fire rating" to "acoustic rating" is one pick: no name is typed in its technical form
- Enter opens the list of patterns with focus on the first
- Tab reaches "An empty specification"
- the pick-list is worked with the keyboard alone: type, Enter

Three assertions of `scripts/browser-check.mjs` changed what they expect, because the page changed:

- "a one-press fix is offered on the line, beside Fix" and "the fix can be undone": the button says how many items it removes ("Remove the 1 "Must have" item").
- "once it is edited the position is in the file as it will be saved, and the record says so": only the changed specification is written anew, so the finding is on line 4 of the saved text, not on a line of a file rewritten in full. The assertion now also reads the marked line of the excerpt and checks it is the line the position names.
- "an unedited file is run from the opened file itself": the page reads the opened file as bytes (to honour its encoding), so whole reads as bytes are counted with whole reads as text.

## scripts/review-check.mjs (56, all new)

- each of the 319 valid official IDS files, opened and not changed, is downloaded byte for byte as it was opened
- a change to a specification that holds a comment says, before Download, that this comment is not kept and that the rest of the file is
- one change to one specification: every character before and after that specification is the opened file's own
- ...the comments at the top, above each specification and in the untouched ones are still there, and the engine accepts the file
- after the download the page shows the saved file: no unsaved changes, no note
- a change typed back: the page shows the opened file again, with no unsaved mark and no note
- ...and Download gives the opened file byte for byte
- a file with a byte order mark and CRLF line ends keeps both after a change, in the changed specification too
- an attribute and an element the standard does not know: the fix offered is to write that specification again
- ...one press makes the file valid, it can be undone, and the saved file is one the engine accepts
- a file written in ISO-8859-1 is read in that encoding: its letters are on the page, the run compares them with the model's, and the page says a change is saved as UTF-8
- ...not changed, it is downloaded as its own bytes
- ...changed, it is saved as UTF-8 and says so in its first line, with every letter intact
- a file that says UTF-8 and is not: refused with the reason, never opened with letters replaced
- Undo is withdrawn once something is typed after the one-press change, so it cannot take that typing with it
- three specifications, two walls named Waldo: Pass, Fail, Pass, each row with the state of its own specification
- moving a specification: the result follows the specification, not the place
- ...and the saved file holds the specifications in the new order, each with the comment written above it, and nothing rewritten
- deleting the specification whose failing elements are open: its result goes with it and the two left keep theirs
- while typing, the row being edited shows no result and the stamp is not a verdict of the older text
- quick typing in several fields: the result that appears is of the last text (the first specification now fails)
- replacing the model during a run: the result that appears is of the second model, named in the record
- replacing the IDS file during a run: only the result of the second file appears
- closing and loading the example during a run: the result is the example's, under the example's names
- a large model (36 MB when measured), the IDS edited while it is being read: the one result that appears is of the edited text and that model
- the large model replaced by a small one during its run: the small model's result appears and is not overwritten when the large one would have finished
- an edit that makes the IDS file not valid with a model loaded: no Pass or Fail stays on the page, every row waits, and nothing is run
- ...and made valid again: the model is run again by itself, without being chosen again
- reloading in the middle of a change with a model loaded: the change is back, and the page says the model has to be chosen again, by name
- storage holds the draft and nothing else
- ...and the file downloaded after the reload still holds everything outside the changed specification as it was opened, comments and all
- choosing the model again after the reload gives its result
- a stored draft that is cut off: the page loads, says the changes could not be restored, and works
- a stored draft that is of another shape (a specification without its lists): the page loads, says the changes could not be restored, and works
- a stored draft that is with a value that is not a value: the page loads, says the changes could not be restored, and works
- a draft stored by the build before this one (without the opened text) is restored
- New and Close over unsaved changes each ask first, and answering no keeps the work
- both files dropped at once, the model first or the IDS file first: the same result
- two IDS files dropped at once: the first is opened and the page says by name that the other was not
- an IDS file and two models dropped at once: the first model is checked and the second is named as not taken
- the same file chosen twice: no question, no change, still not marked unsaved
- a 0-byte file is refused with the reason and the document on the page stays
- a 300 MB file given as the IDS file is refused in words without being read, and the document on the page stays
- the report states which IDS file and which model it describes: name, size in bytes and SHA-256 of each, equal to those of the files on disk
- ...and for a changed document the hash in the report is the hash of the file Download then saves
- CSV: a name that a spreadsheet would run as a formula (=, +, -, @) is written with an apostrophe in front; other names, long ones and letters outside ASCII are as in the model; an element with no name and no GlobalId has empty cells
- six walls that fail one requirement, each with a name of its own, are one group with the reason said once and each wall's own value in its row; the wall with no name is a group of its own; the counts add up to the seven that failed
- a required specification that matches nothing: Fail, and the page does not say "Nothing failed"
- J1 by keyboard alone: open the IDS file, choose the model, download the failing elements
- J2 by keyboard alone: open a file that is not valid, apply the fix, download a file the engine accepts
- J2 by keyboard alone, no one-press fix: Fix puts the keyboard in the class field, typing "wall" and Enter corrects it, and the download is valid
- J3 by keyboard alone: New, a title, two specifications from patterns, download a file the engine accepts
- at no moment of this script did the page show a result of another text, of another model, or a row with another specification's state
- no request to anywhere but the local server
- no uncaught page errors
- ...and the CSV holds that specification as a row marked "Whole specification", with the reason and no element

## scripts/scale-check.mjs (25, all new)

Large models, the model kept between runs, a worker that goes silent or is ended, models too large to open. Models are generated by `scripts/make-large-model.mjs` and deleted at the end; the file over 1 GB is sparse and takes no disk, the one of 9.4 million walls is a real file of about 620 MB (its entities are counted over the whole file).

- the two models of the kept-copy test have the same name and the same size
- 1,400,000 walls that all fail: the result is Fail and the page listed 200 rows
- the page stayed responsive (no freeze over 500 ms)
- the worker said that it was alive while it read the model, not only before and after
- the page says how many are not listed and that the files hold them all
- the summary has the exact count
- the CSV holds all 1,400,000 failing elements, each marked "Element", and the header
- the report holds all 1,400,000 failing elements and says so in the count
- the run after an edit did not read the model again (the page never said it was reading)
- the result after the edit is the same pass, for the same model
- a changed model file (same name and size, other content) is read again and its own result shown, not the kept copy's
- choosing the first file again gives the first file's result
- the report names the model by the SHA-256 of the bytes that were checked, not of what the file holds when the report is made
- with a large model of which little applies, the run after an edit is much faster than the first
- a worker that stops answering: after 30 seconds the page says so and offers "Stop and try again"
- "Stop and try again" ends the stuck worker and the run gives its result
- a worker that is ended with no word: the page says so in one sentence, at once
- a model that was saved again after it was chosen: the page says that it could not be read and to choose it again, not that something went wrong
- a model of 1.1 GB is refused by its size before it is read, with what to do
- a model of 9.4 million walls is refused before it is parsed, with its exact count, what the browser reports for the computer and what a tab was measured to hold
- neither refusal offers "Run again" (the same file would be refused again)
- after a refusal the page still checks the next model
- no request to anything but the local server
- storage holds nothing but the draft
- no error on the page

## scripts/proof-check.mjs (20, all new)

- a specification for IfcWall says in one calm line that it is IfcWall only
- the run agrees: it applied to the 1 IfcWall and not to the IfcWallStandardCase
- the action adds the subtypes as a list: the line is gone and the sentence names them
- and the run now applies to both walls
- the page offers to undo it
- Undo puts the single class and its line back
- with only IFC2X3 ticked the line names the one subtype that version has
- and its action names it
- with IFC2X3 and IFC4 ticked the action adds only the subtype both versions have, and the line says which one is left out and why
- a specification for an abstract class says that it applies to nothing as written, and the run agrees
- its action puts the concrete subtypes in its place: the line is gone, the file is valid, and the run applies to the wall and the standard-case wall
- a Pset_ name that the standard does not define is flagged beside the field
- and Download is off, with the reason
- a standard name takes the flag away and Download is on
- 25 presses with no pause: each press that fitted in the queue of 12 gave its file, and the others were answered with a sentence
- 12 presses, a third of a second apart: a file for each
- and after 8 in a minute a sentence says what the browser may do and what to do
- 8 presses and then a change to the document: the presses whose turn came after the change gave no file of the document as it was, and a sentence says to press again
- no request to anything but the local server
- no error on the page

## New in scripts/write-check.mjs (4)

- the Must have group has its own "More options", closed while there is no description
- the description of the requirements is in the file, as the description attribute of the requirements element, and the file is valid
- a file with a description of its requirements shows it in the form, open, and it can be edited back to nothing
- emptying it removes the attribute from the file

## Changed on purpose

- browser-check, "Download failing elements: a CSV named after the model...": the file has a first column, "Row about", whose value is "Element" on every row of an element (a specification that failed as a whole has its own row, "Whole specification"); the header and the first cell of each row changed, nothing else.
- browser-check, "CSV: commas and quotes are quoted...": the same first cell.
- browser-check, "typing three times in a row started one run, not three" and the two assertions that count runs: a run is now counted when the page asks the worker for it (the page keeps one worker between runs, so that a model it has read is not read again), not when a worker starts.
- browser-check, the keyboard journey to the first pick-list: a class with subtypes has the action that adds them between the results and the row, one more stop.
- review-check, the note before Download: it now reads "Writing specification 2 ("...") again will leave out: 1 comment. The rest of the file is saved as it was opened."
- review-check, the CSV of 7 columns: 8, with "Element" first; "a required specification that matches nothing" now has a CSV with one row of its own.
- scale-check, "a model of over 9.3 million entities is refused before it is parsed, with its count and what fits": the model is now a real file of 9.4 million walls (the entities are counted over the whole file, so a file that is dense only at its two ends no longer passes for one), and the sentence reads "This model has 9,400,000 entities. This browser reports 8 GB of memory or more for this computer, and a browser tab was measured to hold about 9.3 million entities that have a name or an identifier of their own. So the model was not read and no result was made. ..." It no longer says "This computer can hold": nothing was measured on the reader's computer.
- tests/limits.test.ts, the same sentence; and "estimates those of a large file from its first and last megabyte, within 5 percent" became "counts those of a large file exactly too".
- tests/subtypes.test.ts, "counts the subtypes of every ticked version": with IFC2X3 and IFC4 ticked, IfcSlabElementedCase and IfcSlabStandardCase (IFC4 only) are still named in the line but are no longer in the list the action adds; the list holds what every ticked version has.


## Walk-through fixes (first-time user): new, and changed on purpose

New in scripts/write-check.mjs (9, now 81 in all):
- the empty page says in one sentence what an IDS file is, with an example, and what the page does
- a new specification is named from what it says, is optional, and ticks all three IFC versions
- the choice "If the model has no space" (that is fine / that is a failure / none may exist) is in plain view
- while the name is the generated one it follows the content (changing the class changes it); once a name is typed it is never touched
- typing "number" for a space offers Reference with its plain meaning, and the field with text in it never says "Fill this in"
- a property that is not in the standard set is said at the field before it is left, in plain words, and after it is left
- after Done the row says what changed, in one line ("Now fails: 1 element"), next to it and in view
- keyboard: the choice "That is fine" is reached with Tab and "That is a failure" with an arrow key, then Download is on

New in scripts/browser-check.mjs (1, now 151): opened, a finding row shows the engine's own sentence beside the plain one.
New in scripts/proof-check.mjs (now 21): a new "every wall" lists IfcWall and the subtype every version has, and the run applies to both walls; an abstract class chosen in a new specification is replaced by its concrete subtypes.
scripts/replay-job3.mjs (new, not an assertion script): the walk-through's third job from an empty page, run against three models, with the number of actions.

Expectations changed because a default or a wording changed on purpose:
- write-check, the five starting shapes: "Elements must be named a certain way" is now "Elements must have a name" (it no longer carries the pattern L[0-9]{2}.*).
- write-check, "In words" for the specification: a new wall specification is "Every wall, including wall standard case, must ..." and, being optional by default, has no "The model must contain at least one wall." sentence. A pattern's sentence "Every door must have a classification in Uniclass 2015." likewise.
- write-check, "what the pick-lists wrote": the class is the list IFCWALL, IFCWALLSTANDARDCASE (two enumeration values), not one simpleValue.
- write-check, the pick-lists: the first line of an option is the pick; a property people look for by meaning carries its plain meaning on a second line.
- write-check, keyboard journey: "Walls exist" now needs the choice "That is a failure" (a new specification is optional and an optional one needs a requirement).
- write-check, the 0.9.7 file, and browser-check the same: the line is a plain sentence ("This file is IDS 0.9.7, an older draft. ..."); the engine's own sentence is behind Details.
- write-check, acoustic rating: the sentence starts "Every wall, including wall standard case, must have ...".
- browser-check, Download failing elements and the CSV cell checks: the CSV has 11 columns (Row about, Specification, Requirement, Why it failed, What to fix, IFC class, Name, GlobalId, Storey or space, Model, IDS file).
- browser-check, "Fix opens that specification ..." and "a name one letter away": the sentences are the plain ones ("IFCRABBIT is not an IFC class in IFC4. ...", "Did you mean IFCWALL?").
- browser-check, "invalid official file, first row": the row shows the plain sentence and a Details word; opening it shows the engine's sentence and the lines of the file. The list of things to fix shows the same lines once: the file-level list that repeated them is gone, and Details holds the position, the code and the excerpt (made when opened, so "rows start closed" still holds).
- browser-check, "scale: reasons are readable": "The property "FireRating" is missing: the property set "Pset_WallCommon" is not on this element." replaces "Property set ... not found".
- browser-check, "scale: the CSV holds every failing element": the GlobalId is the fourth cell from the end.
- review-check, the CSV of 8 columns: 11; names are in the seventh column; the whole-specification row carries the specification's sentence and what to do.
- proof-check, exact classes: the exact-class assertions first narrow a new specification with "Include the subtypes" and tick IFC4 only; the abstract-class specification is for IFC4 only (IfcBuildingElement is not a class of IFC4X3) and is replaced at once by its subtypes; a typed text that matches no list entry is left with Tab, not Escape (Escape puts the text back).
- tests/helpers/ids.ts, tests/run.test.ts, tests/picks-patterns.test.ts, scripts/picklists.ts: the specifications they build say what the opened file's default says (required, IFC4), as before; a specification made by newSpecification() is now optional with three versions.
- tests/patterns-run.test.ts: the five shapes start optional, so the existence sentence is only in the choices that make the specification required; the "name" shape starts as "must have a name"; a pattern is a choice after the start.
- tests/ids-words.test.ts, tests/subtypes.test.ts: the listing says "type of element wall" (plain name) and a list of classes reads "wall, including wall elemented case and wall standard case".
- tests/groups-csv.test.ts, tests/handover.test.ts, tests/whole-spec.test.ts, scripts/handover.ts: the new CSV columns.
- tests/picks-patterns.test.ts, "choosing a property set narrows the properties": FireRating also carries its meaning and search words.
