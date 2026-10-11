/**
 * The IDS version rule, kept apart from the engine so that code which only needs to say "this file is not IDS 1.0"
 * (the Write tab, when it opens a file) can use the very same decision and sentence without loading the engine.
 */
const NS = 'http://standards.buildingsmart.org/IDS';
/** The only schema location idsbench accepts. */
export const LOCATION_1_0 = `${NS} ${NS}/1.0/ids.xsd`;

/** The IDS version a schema location names, for example `0.9.7` or `1.1`; undefined when it names none. */
export function declaredVersion(location: string): string | undefined {
  const dir = /\/IDS\/(\d+(?:\.\d+)*)\/ids\.xsd/i.exec(location);
  if (dir) return dir[1];
  const file = /ids_(\d)(\d)(\d)?\.xsd/i.exec(location); // old drafts: ids_09.xsd
  return file ? [file[1], file[2], file[3]].filter(Boolean).join('.') : undefined;
}

/** True when `a` is a later version than `b` (numeric, part by part). */
function isLater(a: string, b: string): boolean {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * Why a file whose `xsi:schemaLocation` is `location` is not accepted as IDS 1.0, or null when it is.
 * `named` is the version the location names, when it names one.
 */
export function versionProblem(location: string): { named: string | undefined; message: string } | null {
  if (location === LOCATION_1_0) return null;
  const named = declaredVersion(location);
  let message: string;
  if (named && named !== '1.0') {
    message = `This file is IDS ${named}. idsbench works with IDS 1.0 only. ${
      isLater(named, '1.0') ? 'Save the file as IDS 1.0' : 'Update the file to version 1.0'
    } and check it again.`;
  } else if (location) {
    message = `The schema location '${location}' is not the IDS 1.0 location; use xsi:schemaLocation="${LOCATION_1_0}".`;
  } else {
    message = `The <ids> element has no xsi:schemaLocation, so the IDS version is unknown; add xsi:schemaLocation="${LOCATION_1_0}".`;
  }
  return { named, message };
}
