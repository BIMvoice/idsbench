import { describe, expect, it } from 'vitest';
import { readIds } from '../src/core/validate';

const kind = (xml: string) => { try { readIds(xml); return 'ok'; } catch (e: any) { return e.kind; } };
const IDS = 'http://standards.buildingsmart.org/IDS';

describe('readIds error kinds (real parseIDS)', () => {
  it('plain text', () => expect(kind('hello')).toBe('ids-not-xml'));
  it('unclosed tag', () => expect(kind('<ids><info>')).toBe('ids-not-xml'));
  it('empty', () => expect(kind('')).toBe('ids-not-xml'));
  it('well-formed XML that is not an IDS', () => expect(kind('<html><body/></html>')).toBe('ids-rejected'));
  it("IDS root without specifications is accepted by the library; the app then says there is nothing to check", () => expect(kind(`<ids xmlns="${IDS}"><info><title>t</title></info></ids>`)).toBe("ok"));
});
