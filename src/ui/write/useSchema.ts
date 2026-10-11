import { useEffect, useState } from 'react';
import type { SchemaData, IfcVersion } from '@idsbench/check/ifc';
import { IFC_VERSIONS } from '../../core/ids/model';

/** The IFC version whose names a specification's pick-lists offer: the first it lists, or IFC4. */
export function versionFor(listed: string[]): IfcVersion {
  return (listed.find((v) => (IFC_VERSIONS as readonly string[]).includes(v)) ?? 'IFC4') as IfcVersion;
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
