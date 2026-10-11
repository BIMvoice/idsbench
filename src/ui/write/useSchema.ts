import { useEffect, useMemo, useState } from 'react';
import type { SchemaData, IfcVersion } from '@idsbench/check/ifc';
import { IFC_VERSIONS } from '../../core/ids/model';
import { listsFor, type Lists } from '../../core/picks';

/** The IFC versions a specification's pick-lists have to hold for: those it lists that IDS knows, or IFC4 when it lists none. */
export function versionsFor(listed: string[]): IfcVersion[] {
  const known = IFC_VERSIONS.filter((v) => listed.includes(v)) as IfcVersion[];
  return known.length ? known : ['IFC4'];
}

/** The IFC tables for one version, from the Check engine's own data. Loaded when first asked for; null until then. */
export function useSchema(version: IfcVersion | null): SchemaData | null {
  const [got, setGot] = useState<SchemaData | null>(null);
  useEffect(() => {
    if (!version) return;
    let live = true;
    import('@idsbench/check/ifc').then((m) => m.loadSchema(version)).then((s) => { if (live) setGot(s); }, (e) => console.error(e));
    return () => { live = false; };
  }, [version]);
  return got && got.version === version ? got : null;
}

/**
 * The pick-lists of a specification: the names every IFC version it ticks defines. Null until the tables of all of
 * them have loaded, so a list is never shown for fewer versions than are ticked.
 */
export function useLists(listed: string[]): Lists | null {
  const schemas = useSchemas(listed);
  return useMemo(() => (schemas ? listsFor(schemas) : null), [schemas]);
}

/** The IFC tables of every version a specification lists (those IDS knows), in the order ticked; null until all have loaded. */
export function useSchemas(listed: string[]): SchemaData[] | null {
  const key = versionsFor(listed).join(' ');
  const [got, setGot] = useState<{ key: string; schemas: SchemaData[] } | null>(null);
  useEffect(() => {
    let live = true;
    loadSchemas(key.split(' ') as IfcVersion[]).then((schemas) => { if (live) setGot({ key, schemas }); }, (e) => console.error(e));
    return () => { live = false; };
  }, [key]);
  return got && got.key === key ? got.schemas : null;
}

/** The IFC tables of these versions, from the Check engine's own data. */
export async function loadSchemas(versions: IfcVersion[]): Promise<SchemaData[]> {
  const m = await import('@idsbench/check/ifc');
  return Promise.all(versions.map((v) => m.loadSchema(v)));
}

/** A class as the standard writes it ("IfcWall") from its name in capitals, in any of these tables; undefined when no table has it. */
export function classNameIn(schemas: Iterable<SchemaData | undefined>): (upper: string) => string | undefined {
  const all = [...schemas].filter((s): s is SchemaData => !!s);
  return (upper) => all.map((s) => s.classes.get(upper)?.name).find(Boolean);
}

/**
 * The IFC tables for the given versions, loaded as they are asked for and kept. `map` holds those loaded so far; a
 * specification looks up the versions it ticks and shows nothing until all of them are there.
 */
export function useSchemaMap(versions: IfcVersion[]): Partial<Record<IfcVersion, SchemaData>> {
  const [map, setMap] = useState<Partial<Record<IfcVersion, SchemaData>>>({});
  const wanted = [...new Set(versions)].sort().join(' ');
  useEffect(() => {
    let live = true;
    const missing = (wanted ? (wanted.split(' ') as IfcVersion[]) : []).filter((v) => !map[v]);
    if (missing.length === 0) return;
    import('@idsbench/check/ifc').then((m) => Promise.all(missing.map((v) => m.loadSchema(v))))
      .then((loaded) => { if (live) setMap((prev) => ({ ...prev, ...Object.fromEntries(loaded.map((sc, i) => [missing[i], sc])) })); }, (e) => console.error(e));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  return map;
}
