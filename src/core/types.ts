export type SpecState = 'pass' | 'fail' | 'nothing';

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
  /** How many elements the specification applied to. */
  applicable: number;
  passed: number;
  failed: number;
  /** Why the specification as a whole failed, when that is not about one element. */
  note: string | null;
  /** At most FAILURE_CAP failing elements. */
  failures: FailingElement[];
  /** Failing elements beyond the cap. */
  failuresNotShown: number;
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
    appliedToNothing: number;
  };
  headline: string;
  allPassed: boolean;
  seconds: number;
}

export const FAILURE_CAP = 200;

export type ErrorKind =
  | 'ids-not-xml'
  | 'ids-rejected'
  | 'ifc-unreadable'
  | 'schema-mismatch'
  | 'unexpected';

export interface AppErrorInfo {
  kind: ErrorKind;
  message: string;
}
