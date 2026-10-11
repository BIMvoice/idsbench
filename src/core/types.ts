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
  /** Every failing element. The page lists the first FAILURE_CAP; the downloaded report holds all of them. */
  failures: FailingElement[];
}

export interface RunResult {
  idsFile: string;
  ifcFile: string;
  schema: string;
  entityCount: number;
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
  /** What this result does not cover. */
  notice: string;
  seconds: number;
}

/** How many failing elements one specification lists on the page. */
export const FAILURE_CAP = 200;

export const IDS_NOT_VERIFIED =
  'Run checks the model against the IDS file as it is written. It does not check that the IDS file itself is valid.';

export type ErrorKind =
  | 'ids-empty'
  | 'ids-not-xml'
  | 'ids-rejected'
  | 'ids-is-ifc'
  | 'ids-namespace'
  | 'ids-old-version'
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
  | 'unexpected';

export interface AppErrorInfo {
  kind: ErrorKind;
  message: string;
}
