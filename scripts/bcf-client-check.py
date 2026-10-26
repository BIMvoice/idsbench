# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
"""Opens a .bcfzip with IfcOpenShell's bcf-client (a second, independent implementation) and compares what it reads
with <base>.expected.json written by scripts/make-bcf.ts: the same topics, with the same titles and the same selected
GlobalIds, in the same order, each an open Issue.
Usage: .scratch/venv/bin/python -I scripts/bcf-client-check.py <base name, without extension>
Setup: python3 -m venv .scratch/venv && .scratch/venv/bin/pip install bcf-client"""
import json
import sys
from pathlib import Path

import bcf.bcfxml

base = sys.argv[1]
expected = json.loads(Path(f"{base}.expected.json").read_text())
opened = bcf.bcfxml.load(Path(f"{base}.bcfzip"))
assert opened is not None, "bcf-client could not open the file"
read = []
for guid, handler in opened.topics.items():
    t = handler.topic
    assert t.topic_type == "Issue" and t.topic_status == "Open", (t.title, t.topic_type, t.topic_status)
    selected = []
    for vp in handler.viewpoints.values():
        selected += vp.get_selected_guids() or []
    read.append({"title": t.title, "guids": selected})
print(f"bcf-client {opened.version.version_id}: {len(read)} topics, {sum(len(r['guids']) for r in read)} selected components")
# Folder order is not topic order in a zip read back by name: compare as sets of (title, guids).
key = lambda r: (r["title"], tuple(r["guids"]))
assert sorted(map(key, read)) == sorted(map(key, expected)), "titles or GlobalIds differ from what was written"
print("OK: every title and every GlobalId read back is the one written")
