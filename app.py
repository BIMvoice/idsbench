"""idsbench - local backend.

A small local web app that audits IDS files using the buildingSMART
IDS audit tool (ids-tool, MIT licensed). Files never leave your machine.

Usage:
    pip install -r requirements.txt
    python app.py
    open http://127.0.0.1:5005

The audit engine (ids-tool) is resolved in this order:
    1. env IDS_TOOL  -> path to ids-tool.dll, run via `dotnet --roll-forward Major`
    2. `ids-tool` on PATH (installed via `dotnet tool install --global ids-tool.CommandLine`)
See README for setup.
"""
import os, re, shutil, subprocess, tempfile
from flask import Flask, request, jsonify, send_from_directory

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "5005"))
DOTNET = shutil.which("dotnet")
IDS_TOOL_DLL = os.environ.get("IDS_TOOL")            # optional: path to ids-tool.dll
IDS_TOOL_BIN = shutil.which("ids-tool")              # optional: global dotnet tool

app = Flask(__name__)

LINE_RE = re.compile(r"at line (\d+), position (\d+)")
CODE_RE = re.compile(r"\bError (\d+)\b")
SCHEMA_RE = re.compile(r"file schema version is:\s*(\S+)")
ELEMENTS_RE = re.compile(r"Completed reading (\d+) xml elements")
STATUS_RE = re.compile(r"Completed with status:\s*(\S+)")


def audit_command(ids_path):
    if IDS_TOOL_DLL:
        if not DOTNET:
            raise RuntimeError("dotnet not found on PATH but IDS_TOOL is set.")
        return [DOTNET, "--roll-forward", "Major", IDS_TOOL_DLL, "audit", ids_path]
    if IDS_TOOL_BIN:
        return [IDS_TOOL_BIN, "audit", ids_path]
    raise RuntimeError(
        "ids-tool not found. Either install it (dotnet tool install --global "
        "ids-tool.CommandLine) or set the IDS_TOOL env var to ids-tool.dll. See README."
    )


def clean(line):
    line = re.sub(r"^(info|fail|warn|error|crit)\s*:\s*\S+\s*", "", line.strip())
    return line.replace("`", "")


def count_specifications(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return len(re.findall(r"<(?:\w+:)?specification[ >]", f.read()))
    except Exception:
        return 0


def run_audit(path):
    proc = subprocess.run(audit_command(path), capture_output=True, text=True, timeout=120)
    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    schema = elements = status = None
    issues = []
    for raw in out.splitlines():
        low = raw.strip().lower()
        if (m := SCHEMA_RE.search(raw)): schema = m.group(1)
        if (m := ELEMENTS_RE.search(raw)): elements = int(m.group(1))
        if (m := STATUS_RE.search(raw)): status = m.group(1)
        if low.startswith(("fail:", "error:", "warn:")):
            sev = "warn" if low.startswith("warn:") else "error"
            loc = LINE_RE.search(raw); code = CODE_RE.search(raw)
            issues.append({
                "sev": sev,
                "line": int(loc.group(1)) if loc else None,
                "pos": int(loc.group(2)) if loc else None,
                "code": ("Error " + code.group(1)) if code else "",
                "msg": clean(raw),
            })
    errors = [i for i in issues if i["sev"] == "error"]
    return {
        "valid": len(errors) == 0,
        "status": status or "Unknown",
        "schema": schema or "n/a",
        "specifications": count_specifications(path),
        "elements": elements if elements is not None else "n/a",
        "issues": issues,
    }


@app.route("/")
def index():
    return send_from_directory(HERE, "index.html")


@app.route("/audit", methods=["POST"])
def audit():
    f = request.files.get("ids")
    if not f:
        return jsonify({"error": "No IDS file uploaded."}), 400
    with tempfile.NamedTemporaryFile(suffix=".ids", delete=False) as tmp:
        f.save(tmp.name); path = tmp.name
    try:
        return jsonify(run_audit(path))
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Audit timed out."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try: os.unlink(path)
        except Exception: pass


if __name__ == "__main__":
    print(f"idsbench running at http://127.0.0.1:{PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=False)
