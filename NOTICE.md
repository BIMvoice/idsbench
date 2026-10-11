# Third-party notices

idsbench itself is licensed under the Mozilla Public License 2.0 (see `LICENSE`). The work below is by others and keeps its own licence.

## buildingSMART IDS Audit tool

The rules in `packages/check` that go beyond the schema, and the IFC tables it uses, are ported to TypeScript or generated from the sources of the [buildingSMART IDS Audit tool](https://github.com/buildingSMART/IDS-Audit-tool). idsbench is not endorsed by buildingSMART. Its licence:

```
MIT License

Copyright (c) buildingSMART International Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## IDS schema and official test files

`packages/check/schemas/` holds the IDS 1.0 schema, and `packages/check/test/fixtures/corpus/` holds unchanged copies of the official IDS examples and test cases and of the audit tool's test files, each folder with its own licence file. The files from [buildingSMART/IDS](https://github.com/buildingSMART/IDS) are under CC BY-ND 4.0 and are included unchanged, for testing only.

## Fonts

`src/fonts/` holds Atkinson Hyperlegible Next and Barlow Condensed, both under the SIL Open Font License 1.1. The licence texts are beside the font files.

## Libraries

The libraries idsbench depends on are listed in `README.md` with their licences (`@ifc-lite/parser` and `@ifc-lite/ids` under MPL-2.0; `xmllint-wasm`, `@xmldom/xmldom`, `react` and `react-dom` under MIT).
