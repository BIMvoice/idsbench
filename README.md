# idsbench

A local, private workbench for IDS (Information Delivery Specifications). The goal is one place to **create, edit, run and validate** IDS files.

**What works today:** auditing. Drop in an IDS file and it shows you exactly what is wrong and where, in a clean interface. Creating, editing and running an IDS against an IFC model are planned and not built yet.

Formerly published as `bimvoice-ids-auditor`.

It runs entirely on your own machine. Your files never leave your computer, which matters when your IDS files are confidential.

> This is a convenience interface on top of the official **buildingSMART [IDS audit tool](https://github.com/buildingSMART/IDS-Audit-tool)** (MIT licensed). All the actual auditing is done by that tool. This project just gives it a friendly, local, private UI.

It checks whether an **IDS file itself is valid** against the buildingSMART IDS schema. It does **not** validate IFC models against an IDS (that is a different job, done by tools like IfcTester).

## Why use it

- **Local and private.** Online checkers require uploading your IDS to a third party. This does not.
- **Clear results.** Errors with line number, position, message, and the rule that failed.
- **Simple.** Drop a file, click audit, read the result.

## Requirements

- Python 3.9+
- A way to run the buildingSMART ids-tool, one of:
  - the **ids-tool** command on your PATH, installed via:
    `dotnet tool install --global ids-tool.CommandLine`
    (requires the .NET runtime), or
  - a built `ids-tool.dll`, pointed to with the `IDS_TOOL` environment variable.

## Setup

```bash
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5005 and drop in an `.ids` file.

If you are pointing at a built dll instead of the global tool:

```bash
IDS_TOOL="/path/to/ids-tool.dll" python app.py
```

### macOS one-click launch

Double-click `run.command`. It starts the engine and opens the tool in your browser. Close the Terminal window to stop it. (First time: right-click → Open, to get past Gatekeeper.)

## How it works

A tiny Flask server serves the page and, on upload, runs the buildingSMART ids-tool audit on the file, parses the output, and returns the results to the browser. Nothing is sent anywhere else.

## Credits

- Auditing engine: [buildingSMART IDS-Audit-tool](https://github.com/buildingSMART/IDS-Audit-tool) and ids-lib (MIT, © buildingSMART International / Claudio Benghi).
- Interface and wrapper: BIMvoice.

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

Provided as is, no warranty, no support promised. Always confirm critical results with the official buildingSMART tooling.
