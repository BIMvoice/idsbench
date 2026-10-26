/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// The hand-over for coordinators who track issues in BCF tools: the failures of a result as a BCF 2.1 file (.bcfzip),
// one topic per group of failing elements (the grouping the page shows: same specification, same reason) and one for
// each specification that failed as a whole. The elements are named by GlobalId in the viewpoint's Selection.
import { addTopicToProject, createBCFProject, createBCFTopic, generateUuid, writeBCF, type BCFTopic } from '@ifc-lite/bcf';
import { failureTotalOf } from './csv';
import { fullReason, MAX_REASONS, NO_REASON, sharedReason } from './groups';
import type { FailingElement, RunResult } from './types';

/**
 * Most components one topic names. BCF readers keep a topic's whole Selection in memory and select it in the viewer
 * in one go; a selection of tens of thousands of elements freezes many of them. The topic says how many it holds of
 * how many, and the CSV stays complete.
 */
export const BCF_SELECTION_CAP = 1000;

/** The IfcGuid attribute of BCF 2.1 (visinfo.xsd): exactly 22 characters of 0-9, A-Z, a-z, _ and $. Anything else would make the whole file invalid, so it is not written. */
const IFC_GUID = /^[0-9A-Za-z_$]{22}$/;
export const isBcfGuid = (g: string | null): g is string => g !== null && IFC_GUID.test(g);

/** One group of failing elements as the BCF file needs it: its exact count, and the first BCF_SELECTION_CAP GlobalIds. */
export interface BcfGroup {
  /** The reason the elements share (a "…" stands where each has a value of its own, as on the page). */
  reason: string;
  /** True when the elements have values of their own in the reason. */
  varies: boolean;
  /** What to do, from the first element of the group. */
  toFix: string;
  /** How many elements fail for this reason, exact. */
  total: number;
  /** The GlobalIds of the first elements (at most BCF_SELECTION_CAP), in order. */
  ids: string[];
  /** How many elements of the group have no usable GlobalId (none, or not 22 characters of the IFC alphabet), so cannot be named. */
  unnamed: number;
}

/** The groups of one specification, built one element at a time like the CSV, so that millions of failures are never held. */
export class BcfGroupAccumulator {
  private groups = new Map<string, BcfGroup & { full: string }>();
  /** Elements whose reason was not told apart because MAX_REASONS reasons were already in (the same limit the page has). */
  untold = 0;

  add(f: FailingElement): void {
    const key = sharedReason(f);
    let g = this.groups.get(key);
    if (!g) {
      if (this.groups.size >= MAX_REASONS) { this.untold++; return; }
      g = { reason: key, varies: false, toFix: (f.toFix ?? []).filter(Boolean).join('; '), total: 0, ids: [], unnamed: 0, full: fullReason(f) };
      this.groups.set(key, g);
    }
    g.total++;
    if (fullReason(f) !== g.full) g.varies = true;
    if (!isBcfGuid(f.globalId)) g.unnamed++;
    else if (g.ids.length < BCF_SELECTION_CAP) g.ids.push(f.globalId);
  }

  result(): BcfGroup[] {
    return [...this.groups.values()].map(({ full, ...g }) => ({ ...g, reason: g.varies ? g.reason : full }));
  }
}

/** The groups of a result's specification: from what the worker gathered, or (a result made elsewhere, which holds every element) by the same accumulator. */
function groupsOf(result: RunResult, i: number): { groups: BcfGroup[]; untold: number } {
  const own = result.spilled?.[i];
  if (own) return { groups: own.bcf, untold: own.bcfUntold };
  const acc = new BcfGroupAccumulator();
  for (const f of result.specs[i].failures) acc.add(f);
  return { groups: acc.result(), untold: acc.untold };
}

/** One topic of the file, before it is written. */
export interface BcfTopicPlan {
  title: string;
  description: string;
  /** The IFC GlobalIds of the Selection; empty for a specification that failed as a whole (the topic then has no viewpoint). */
  ids: string[];
  /** The IDS specification's name. */
  label: string;
}

const n = (x: number) => x.toLocaleString('en');
// XML 1.0 forbids most control characters, and names in a model are written by whoever made the model.
// eslint-disable-next-line no-control-regex
const xmlText = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
const TITLE_MAX = 250;
const clip = (s: string) => (s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 1)}…` : s);

/**
 * The topics of a result, in the order of its specifications: for each one, a topic per group of failing elements
 * (the groups of the page: same reason) and, if it failed as a whole, one topic without components. A specification
 * that was not checked has none. The title is the requirement in words (as in the CSV; the specification's name where
 * the page could not word it) and, where the specification has several groups, the reason that tells them apart.
 */
export function bcfTopicPlans(result: RunResult): BcfTopicPlan[] {
  const plans: BcfTopicPlan[] = [];
  result.specs.forEach((s, i) => {
    const requirement = s.requirement?.trim() || s.name;
    const context = `Specification: ${s.name}\nModel: ${result.ifcFile}\nIDS file: ${result.idsFile}`;
    if (s.wholeFailure) {
      plans.push({ title: clip(requirement), ids: [], label: s.name, description: [s.wholeFailure, s.wholeFix ? `What to fix: ${s.wholeFix}.` : '', 'No single element failed, so this topic names no elements.', context].filter(Boolean).join('\n\n') });
    }
    if (failureTotalOf(s) === 0) return;
    const { groups, untold } = groupsOf(result, i);
    for (const g of groups) {
      const attached = g.ids.length;
      const lines = [`Why it failed: ${g.reason}`];
      if (g.varies) lines.push('Each element has a value of its own where the reason shows "…"; the CSV has them.');
      if (g.toFix) lines.push(`What to fix: ${g.toFix}.`);
      lines.push(g.total === 1 ? '1 element fails this requirement.' : `${n(g.total)} elements fail this requirement.`);
      lines.push(g.total === attached ? `Elements attached: all ${n(g.total)}.` : g.total === attached + g.unnamed ? `Elements attached: ${n(attached)} of ${n(g.total)}.` : `Elements attached: first ${n(attached)} of ${n(g.total)}. The complete list is in the CSV.`);
      if (g.unnamed) lines.push(`${n(g.unnamed)} of them ${g.unnamed === 1 ? 'has' : 'have'} no valid GlobalId and cannot be attached.`);
      plans.push({
        title: clip(groups.length > 1 || untold > 0 ? `${requirement} — ${g.reason}` : requirement),
        description: `${lines.join('\n')}\n\n${context}`,
        ids: g.ids,
        label: s.name,
      });
    }
    if (untold > 0) {
      plans.push({ title: clip(`${requirement} — other reasons`), ids: [], label: s.name, description: `${n(untold)} more failing elements have reasons that differ from one another and from the ${n(MAX_REASONS)} above; they are in the CSV only.\n\n${context}` });
    }
  });
  return plans;
}

/** How many topics the file will hold: a topic per group of failing elements and per specification that failed as a whole. */
export const bcfTopicCount = (result: RunResult): number => bcfTopicPlans(result).length;

export const BCF_AUTHOR = 'idsbench';

/**
 * The BCF 2.1 file (.bcfzip) of a result. BCF 3.0 is not written: its visinfo.xsd makes a camera mandatory in every
 * viewpoint (an xs:choice of OrthogonalCamera and PerspectiveCamera with no minOccurs), and a made-up camera would send
 * the viewer somewhere. In 2.1 both cameras and Components are optional, so a viewpoint can be a Selection alone.
 */
export async function bcfBlob(result: RunResult, now: Date = new Date()): Promise<Blob> {
  const project = createBCFProject({ name: `idsbench: ${result.ifcFile}`, version: '2.1' });
  const date = now.toISOString();
  for (const plan of bcfTopicPlans(result)) {
    const topic: BCFTopic = {
      ...createBCFTopic({ title: xmlText(plan.title), description: xmlText(plan.description), author: BCF_AUTHOR, topicType: 'Issue', topicStatus: 'Open', labels: [xmlText(plan.label)] }),
      creationDate: date,
      header: [{ filename: xmlText(result.ifcFile), isExternal: true }],
    };
    if (plan.ids.length) {
      topic.viewpoints.push({ guid: generateUuid(), components: { selection: plan.ids.map((ifcGuid) => ({ ifcGuid })), visibility: { defaultVisibility: true, exceptions: [] } } });
    }
    addTopicToProject(project, topic);
  }
  return writeBCF(project);
}
