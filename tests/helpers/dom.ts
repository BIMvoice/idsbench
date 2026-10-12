/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Node has no DOMParser; the editor's reader takes a parser and a serializer, and tests and scripts give it these.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { XmlEnv } from '../../src/core/ids/read';

export const nodeEnv: XmlEnv = {
  parse: (xml) => new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document,
  serialize: (n) => new XMLSerializer().serializeToString(n as never),
};
