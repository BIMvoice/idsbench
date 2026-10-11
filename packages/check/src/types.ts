export type Finding = {
  severity: 'error' | 'warning';
  /** Short stable identifier, for example `entity-unknown-class`. */
  code: string;
  /** One plain-English sentence saying what is wrong and what is expected. */
  message: string;
  line?: number;
  column?: number;
  /** Position of the element in the document, for example `ids/specifications/specification[2]/applicability/entity/name`. */
  path?: string;
};

export type CheckResult = {
  valid: boolean;
  /** The IDS version the file declares in `xsi:schemaLocation` (for example `1.0`, or `0.9.7` for a file that is refused); absent when it names none. */
  idsVersion?: string;
  findings: Finding[];
};
