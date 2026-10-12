import type { ShownGroup } from './groups';

/**
 * pass: checked, and the model meets the specification.
 * fail: checked, and the model does not meet it.
 * nothing: an optional specification that matched no element. The standard counts this as a pass.
 * unchecked: no verdict could be reached for this specification.
 */
export type SpecState = 'pass' | 'fail' | 'nothing' | 'unchecked';

/** How the applicability's minOccurs / maxOccurs read: at least one match, any number, or none allowed. */
export type SpecKind = 'required' | 'optional' | 'prohibited';

export type Verdict = 'pass' | 'fail' | 'incomplete';

export interface FailingElement {
  ifcClass: string;
  name: string | null;
  globalId: string | null;
  /** One plain-language reason per failed requirement. */
  reasons: string[];
  /**
   * Per reason, the value this element has where the reason quotes one (null where it quotes none). Present only when
   * some reason does. Elements that fail the same requirement with different values of their own are one group.
   */
  found?: (string | null)[];
  /** What to do about each reason, in the same order (an empty string where there is nothing specific to say). Absent when no reason has one. */
  toFix?: string[];
  /** The storey or space the model puts the element in. Absent when it does not say. */
  place?: string;
}

/** Elements in the model of a class beside the ones a specification names (a subtype, a supertype or a sibling), which it does not cover. */
export interface Coverage {
  /** The sentence for the row and for the CSV. */
  text: string;
  /** Those classes, most elements first, with how many elements of each the model has. */
  related: { name: string; upper: string; count: number; how: 'subtype' | 'supertype' | 'sibling' }[];
}

export interface SpecRow {
  name: string;
  state: SpecState;
  kind: SpecKind;
  /** How many elements the specification applied to. */
  applicable: number;
  passed: number;
  failed: number;
  /** One sentence giving the counts above in words. */
  summary: string;
  /** Why the specification as a whole failed or was not checked, when that is not about one element. */
  note: string | null;
  /** Set when the model's IFC version is not one the specification lists. */
  schemaNote: string | null;
  /**
   * The failing elements held in this row. A run made in the browser's worker holds only the first FAILURE_CAP here
   * (the rest went straight into the files to download, see RunResult.spilled); a run made anywhere else holds all.
   */
  failures: FailingElement[];
  /** How many elements failed, always exact, whatever `failures` holds. Absent in a row built by hand: then it is failures.length. */
  failureTotal?: number;
  /** The failing elements by reason as the page lists them (at most FAILURE_CAP elements in all), with each reason's exact count. Absent in a row built by hand. */
  groups?: ShownGroup[];
  /**
   * Set when the specification failed as a whole and not through one element: it needs at least one matching element
   * and the model has none, or it allows fewer matching elements than the model has. The reason, in a sentence.
   */
  wholeFailure?: string;
  /** What to do about a failure of the whole specification, for the CSV. */
  wholeFix?: string;
  /** Set on a row that is "Not checked" because the engine of this version would answer it wrongly for this model (see core/foldguard.ts): the sentence that says why. It is also the note of the row, a "Whole specification" row of the CSV and a field of the report. */
  withheld?: string;
  /** The specification in words (its sentence), when the page could work it out. */
  requirement?: string;
  /** How many failing elements the page does not list. Absent in a row built by hand. */
  notListed?: number;
  /** Set when the model holds elements the specification does not cover because it names their class's supertype, subtype or sibling (see core/coverage.ts). Counts and verdict are not affected by it. */
  coverage?: Coverage;
}

/** The failing elements of one specification as the text of the two downloads, kept as pieces the browser may hold on disk. */
export interface Spilled {
  /** The CSV rows, without the header. */
  csv: Blob[];
  /** The elements as JSON objects separated by commas, to go between the brackets of the "failures" list in the report. */
  failures: Blob[];
}

export interface RunResult {
  /**
   * Per specification (same order as `specs`), the complete failing elements as pieces of the two downloads. Present
   * only on a run made in the worker, where holding millions of elements would not fit; null where there are none.
   */
  spilled?: (Spilled | null)[];
  idsFile: string;
  ifcFile: string;
  schema: string;
  /** Every record of the file: elements, but also geometry, properties and relationships. */
  entityCount: number;
  /** Of those, the elements of the building (walls, doors, spaces: what has a place in the model). Absent when the IFC tables of the model's version could not be had. */
  elementCount?: number;
  specs: SpecRow[];
  counts: {
    specifications: number;
    passed: number;
    failed: number;
    notChecked: number;
    /** Included in `passed`: optional specifications that matched nothing. */
    nothingToCheck: number;
  };
  headline: string;
  verdict: Verdict;
  /** True only when every specification was checked and none failed. */
  allPassed: boolean;
  seconds: number;
}

/** How many failing elements one specification lists on the page. */
export const FAILURE_CAP = 200;

export type ErrorKind =
  | 'ids-empty'
  | 'ids-not-xml'
  | 'ids-rejected'
  | 'ids-is-ifc'
  | 'ids-namespace'
  | 'ids-old-version'
  | 'ids-invalid'
  | 'ids-unusable'
  | 'ids-no-specifications'
  | 'ifc-empty'
  | 'ifc-is-zip'
  | 'ifc-is-xml'
  | 'ifc-is-ids'
  | 'ifc-not-step'
  | 'ifc-cut-off'
  | 'ifc-schema'
  | 'ifc-unreadable'
  | 'file-unreadable'
  | 'out-of-memory'
  | 'ifc-too-large'
  | 'worker-stopped'
  | 'unexpected';

export interface AppErrorInfo {
  kind: ErrorKind;
  message: string;
  /** Set for 'ids-invalid': how many problems the Check engine found. */
  problems?: number;
}
