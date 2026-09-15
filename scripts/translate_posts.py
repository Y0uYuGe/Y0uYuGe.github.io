#!/usr/bin/env python3
"""Generate Simplified Chinese Jekyll posts from English source posts.

English posts ending in ``-en.md`` are the source of truth. The generated
Chinese sibling drops the ``-en`` suffix, ``lang`` and ``permalink`` fields.
Protected Markdown fragments (code, URLs, Liquid tags, and math) are restored
byte-for-byte after translation.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable


DEFAULT_MODEL = "gpt-5.6-luna"
DEFAULT_API_BASE = "https://api.openai.com/v1"
REPO_ROOT = Path(__file__).resolve().parents[1]
ENGLISH_SUFFIX = "-en.md"
FRONT_MATTER_BOUNDARY = re.compile(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)", re.DOTALL)
TOP_LEVEL_KEY = re.compile(r"^[A-Za-z0-9_-]+\s*:")
PLACEHOLDER_PATTERN = re.compile(r"ZXQPROTECTED\d{6}QXZ")


@dataclass(frozen=True)
class PostParts:
    front_matter: list[str]
    body: str
    title: str
    excerpt: str
    categories: list[str]
    tags: list[str]


@dataclass(frozen=True)
class Translation:
    title: str
    excerpt: str
    categories: list[str]
    tags: list[str]
    body: str


class MarkdownProtector:
    """Replace content that a translation model must not modify."""

    def __init__(self) -> None:
        self._values: list[str] = []

    def _store(self, value: str) -> str:
        token = f"ZXQPROTECTED{len(self._values):06d}QXZ"
        self._values.append(value)
        return token

    def _protect_fenced_code(self, text: str) -> str:
        lines = text.splitlines(keepends=True)
        output: list[str] = []
        index = 0
        while index < len(lines):
            opening = re.match(r"^[ \t]{0,3}(`{3,}|~{3,})", lines[index])
            if not opening:
                output.append(lines[index])
                index += 1
                continue

            fence = opening.group(1)
            fence_char = re.escape(fence[0])
            closing = re.compile(rf"^[ \t]{{0,3}}{fence_char}{{{len(fence)},}}[ \t]*(?:\r?\n)?$")
            block = [lines[index]]
            index += 1
            while index < len(lines):
                block.append(lines[index])
                if closing.match(lines[index]):
                    index += 1
                    break
                index += 1
            output.append(self._store("".join(block)))
        return "".join(output)

    def _protect_pattern(self, text: str, pattern: re.Pattern[str]) -> str:
        def replace(match: re.Match[str]) -> str:
            value = match.group(0)
            # A previous, broader protection rule may already have replaced a
            # fragment inside this match. Never wrap placeholders recursively.
            if PLACEHOLDER_PATTERN.search(value):
                return value
            return self._store(value)

        return pattern.sub(replace, text)

    def protect(self, text: str) -> str:
        text = self._protect_fenced_code(text)
        patterns = (
            re.compile(r"{%\s*highlight\b.*?%}.*?{%\s*endhighlight\s*%}", re.DOTALL | re.IGNORECASE),
            re.compile(r"<(script|style|pre)\b[^>]*>.*?</\1\s*>", re.DOTALL | re.IGNORECASE),
            re.compile(r"<!--.*?-->", re.DOTALL),
            re.compile(r"\$\$.*?\$\$", re.DOTALL),
            re.compile(r"\\\[.*?\\\]", re.DOTALL),
            re.compile(r"\\\(.*?\\\)", re.DOTALL),
            re.compile(r"(?<!\\)\$(?!\$)(?:\\.|[^$\n\\])+(?<!\\)\$"),
            re.compile(r"(`+)(?!`)([^\n]*?)(?<!`)\1"),
            re.compile(r"{%.*?%}|{{.*?}}", re.DOTALL),
            re.compile(r"<[^>]+>", re.DOTALL),
            re.compile(r"(?<=\]\()<?[^)\s>]+>?"),
            re.compile(r"https?://[^\s<>)\]]+"),
        )
        for pattern in patterns:
            text = self._protect_pattern(text, pattern)
        return text

    def restore_fields(self, fields: dict[str, Any]) -> dict[str, Any]:
        strings: list[str] = []
        for value in fields.values():
            if isinstance(value, str):
                strings.append(value)
            elif isinstance(value, list):
                strings.extend(item for item in value if isinstance(item, str))
        combined = "\n".join(strings)

        expected = {f"ZXQPROTECTED{i:06d}QXZ" for i in range(len(self._values))}
        found = PLACEHOLDER_PATTERN.findall(combined)
        unknown = set(found) - expected
        missing = expected - set(found)
        duplicated = {token for token in found if found.count(token) != 1}
        if unknown or missing or duplicated:
            raise ValueError(
                "Translation changed protected placeholders "
                f"(missing={sorted(missing)}, unknown={sorted(unknown)}, "
                f"duplicated={sorted(duplicated)})"
            )

        def restore(value: str) -> str:
            for index, protected in enumerate(self._values):
                value = value.replace(f"ZXQPROTECTED{index:06d}QXZ", protected)
            return value

        restored: dict[str, Any] = {}
        for key, value in fields.items():
            if isinstance(value, str):
                restored[key] = restore(value)
            elif isinstance(value, list):
                restored[key] = [restore(item) for item in value]
            else:
                restored[key] = value
        return restored


def decode_yaml_scalar(raw: str) -> str:
    raw = raw.strip()
    if not raw or raw in {"null", "Null", "NULL", "~"}:
        return ""
    if raw.startswith('"') and raw.endswith('"'):
        try:
            return str(json.loads(raw))
        except json.JSONDecodeError:
            return raw[1:-1]
    if raw.startswith("'") and raw.endswith("'"):
        return raw[1:-1].replace("''", "'")
    return raw


def yaml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def find_scalar(lines: list[str], key: str) -> tuple[int | None, str]:
    pattern = re.compile(rf"^{re.escape(key)}\s*:\s*(.*)$")
    for index, line in enumerate(lines):
        match = pattern.match(line)
        if match:
            return index, decode_yaml_scalar(match.group(1))
    return None, ""


def find_list(lines: list[str], key: str) -> tuple[int | None, int | None, list[str]]:
    start_pattern = re.compile(rf"^{re.escape(key)}\s*:\s*$")
    for start, line in enumerate(lines):
        if not start_pattern.match(line):
            continue
        end = start + 1
        while end < len(lines):
            candidate = lines[end]
            if candidate and not candidate[0].isspace() and TOP_LEVEL_KEY.match(candidate):
                break
            end += 1
        values: list[str] = []
        for item in lines[start + 1 : end]:
            match = re.match(r"^\s*-\s*(.*?)\s*$", item)
            if match:
                values.append(decode_yaml_scalar(match.group(1)))
        return start, end, values
    return None, None, []


def parse_post(text: str) -> PostParts:
    match = FRONT_MATTER_BOUNDARY.match(text)
    if not match:
        raise ValueError("Post must start with YAML front matter delimited by ---")
    front_matter = match.group(1).splitlines()
    body = text[match.end() :]
    _, title = find_scalar(front_matter, "title")
    _, excerpt = find_scalar(front_matter, "excerpt")
    _, _, categories = find_list(front_matter, "categories")
    _, _, tags = find_list(front_matter, "tags")
    if not title:
        raise ValueError("Post front matter must contain a non-empty title")
    return PostParts(front_matter, body, title, excerpt, categories, tags)


def replace_scalar(lines: list[str], key: str, value: str) -> list[str]:
    index, _ = find_scalar(lines, key)
    if index is not None:
        lines[index] = f"{key}: {yaml_quote(value)}"
    return lines


def replace_list(lines: list[str], key: str, values: list[str]) -> list[str]:
    start, end, _ = find_list(lines, key)
    if start is None or end is None:
        return lines
    replacement = [f"{key}:"] + [f"  - {yaml_quote(value)}" for value in values]
    return lines[:start] + replacement + lines[end:]


def build_chinese_post(
    source: PostParts,
    translation: Translation,
    source_path: str,
    model: str,
) -> str:
    if len(translation.categories) != len(source.categories):
        raise ValueError("Translation changed the number of categories")
    if len(translation.tags) != len(source.tags):
        raise ValueError("Translation changed the number of tags")
    if not translation.title.strip() or not translation.body.strip():
        raise ValueError("Translation returned an empty title or body")

    remove_keys = {"lang", "permalink", "translation_source", "translation_model"}
    lines = [
        line
        for line in source.front_matter
        if not (
            (match := TOP_LEVEL_KEY.match(line))
            and match.group(0).split(":", 1)[0].strip() in remove_keys
        )
    ]
    lines = replace_scalar(lines, "title", translation.title.strip())
    lines = replace_scalar(lines, "excerpt", translation.excerpt.strip())
    lines = replace_list(lines, "categories", translation.categories)
    lines = replace_list(lines, "tags", translation.tags)
    while lines and not lines[-1].strip():
        lines.pop()
    lines.extend(
        [
            f"translation_source: {yaml_quote(source_path)}",
            f"translation_model: {yaml_quote(model)}",
        ]
    )
    body = translation.body.strip("\n") + "\n"
    return "---\n" + "\n".join(lines) + "\n---\n\n" + body


def output_text(response: dict[str, Any]) -> str:
    chunks: list[str] = []
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    if not chunks:
        raise RuntimeError(
            "OpenAI response did not contain output text; "
            f"status={response.get('status')}, error={response.get('error')}, "
            f"incomplete_details={response.get('incomplete_details')}"
        )
    return "".join(chunks)


def call_openai(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    base_url = os.environ.get("OPENAI_BASE_URL", DEFAULT_API_BASE).rstrip("/")
    timeout = int(os.environ.get("OPENAI_TRANSLATION_TIMEOUT", "600"))
    attempts = int(os.environ.get("OPENAI_TRANSLATION_ATTEMPTS", "3"))
    request = urllib.request.Request(
        f"{base_url}/responses",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")[:2000]
            retryable = error.code == 429 or 500 <= error.code < 600
            if not retryable or attempt == attempts:
                raise RuntimeError(f"OpenAI API returned HTTP {error.code}: {details}") from error
        except urllib.error.URLError as error:
            if attempt == attempts:
                raise RuntimeError(f"Could not reach the OpenAI API: {error}") from error
        delay = min(30, 2 ** (attempt - 1))
        print(f"OpenAI request failed; retrying in {delay}s ({attempt}/{attempts})", file=sys.stderr)
        time.sleep(delay)
    raise AssertionError("unreachable")


def translate_post(
    source: PostParts,
    model: str,
    api_key: str,
    api_call: Callable[[dict[str, Any], str], dict[str, Any]] = call_openai,
) -> Translation:
    protector = MarkdownProtector()
    protected = {
        "title": protector.protect(source.title),
        "excerpt": protector.protect(source.excerpt),
        "categories": [protector.protect(value) for value in source.categories],
        "tags": [protector.protect(value) for value in source.tags],
        "body": protector.protect(source.body),
    }
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "title": {"type": "string"},
            "excerpt": {"type": "string"},
            "categories": {"type": "array", "items": {"type": "string"}},
            "tags": {"type": "array", "items": {"type": "string"}},
            "body": {"type": "string"},
        },
        "required": ["title", "excerpt", "categories", "tags", "body"],
    }
    payload = {
        "model": model,
        "instructions": (
            "Translate the supplied English technical blog post into natural Simplified Chinese. "
            "Be complete and faithful: do not summarize, omit, add, or explain anything. Preserve "
            "Markdown structure and line breaks where practical. Keep product names and established "
            "technical terms accurate. Every token matching ZXQPROTECTEDddddddQXZ is an immutable "
            "placeholder: reproduce each exactly once, in the same field and relative position. "
            "Translate title, excerpt, category names, tag names, headings, prose, table text, and "
            "image alt text. Return only data matching the requested JSON schema. Keep category and "
            "tag array lengths and order unchanged."
        ),
        "input": json.dumps(protected, ensure_ascii=False),
        "reasoning": {"effort": "none"},
        "max_output_tokens": int(os.environ.get("OPENAI_TRANSLATION_MAX_OUTPUT_TOKENS", "120000")),
        "store": False,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "translated_post",
                "strict": True,
                "schema": schema,
            }
        },
    }
    raw = api_call(payload, api_key)
    parsed = json.loads(output_text(raw))
    for key in ("title", "excerpt", "body"):
        if not isinstance(parsed.get(key), str):
            raise ValueError(f"Translation field {key!r} is not a string")
    for key in ("categories", "tags"):
        if not isinstance(parsed.get(key), list) or not all(
            isinstance(item, str) for item in parsed[key]
        ):
            raise ValueError(f"Translation field {key!r} is not an array of strings")

    for key in ("title", "excerpt", "body"):
        if PLACEHOLDER_PATTERN.findall(protected[key]) != PLACEHOLDER_PATTERN.findall(parsed[key]):
            raise ValueError(f"Translation moved or reordered a protected fragment in {key!r}")
    for key in ("categories", "tags"):
        if len(protected[key]) != len(parsed[key]):
            raise ValueError(f"Translation changed the number of {key}")
        for source_value, translated_value in zip(protected[key], parsed[key]):
            if PLACEHOLDER_PATTERN.findall(source_value) != PLACEHOLDER_PATTERN.findall(
                translated_value
            ):
                raise ValueError(f"Translation moved or reordered a protected fragment in {key!r}")

    restored = protector.restore_fields(parsed)
    return Translation(
        title=restored["title"],
        excerpt=restored["excerpt"],
        categories=restored["categories"],
        tags=restored["tags"],
        body=restored["body"],
    )


def is_english_post(path: str) -> bool:
    candidate = PurePosixPath(path)
    return (
        not candidate.is_absolute()
        and ".." not in candidate.parts
        and len(candidate.parts) == 2
        and candidate.parts[0] == "_posts"
        and candidate.name.endswith(ENGLISH_SUFFIX)
    )


def chinese_path(path: str) -> str:
    if not is_english_post(path):
        raise ValueError(f"Not an English post path: {path}")
    return path[: -len(ENGLISH_SUFFIX)] + ".md"


def git_changes(from_ref: str, to_ref: str) -> list[tuple[str, str]]:
    if re.fullmatch(r"0+", from_ref):
        from_ref = subprocess.run(
            ["git", "hash-object", "-t", "tree", "/dev/null"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    result = subprocess.run(
        [
            "git",
            "diff",
            "--no-renames",
            "--name-status",
            from_ref,
            to_ref,
            "--",
            "_posts",
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    changes: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        status, separator, path = line.partition("\t")
        if separator and status in {"A", "M", "D"} and is_english_post(path):
            changes.append((status, path))
    return changes


def missing_changes() -> list[tuple[str, str]]:
    changes: list[tuple[str, str]] = []
    for path in sorted((REPO_ROOT / "_posts").glob(f"*{ENGLISH_SUFFIX}")):
        relative = path.relative_to(REPO_ROOT).as_posix()
        if not (REPO_ROOT / chinese_path(relative)).exists():
            changes.append(("A", relative))
    return changes


def unique_changes(changes: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    by_path: dict[str, str] = {}
    for status, path in changes:
        if not is_english_post(path):
            raise ValueError(f"Only _posts/*-en.md files are supported: {path}")
        by_path[path] = status
    return [(status, path) for path, status in sorted(by_path.items())]


def process_changes(changes: Iterable[tuple[str, str]], model: str, api_key: str) -> int:
    changed_outputs = 0
    for status, source_path in unique_changes(changes):
        output_path = chinese_path(source_path)
        source_file = REPO_ROOT / source_path
        output_file = REPO_ROOT / output_path

        if status == "D":
            if output_file.exists():
                output_file.unlink()
                changed_outputs += 1
                print(f"Deleted generated translation: {output_path}")
            continue

        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is required. Add it as the repository Actions secret "
                "named OPENAI_API_KEY."
            )
        if not source_file.is_file():
            raise FileNotFoundError(f"English source does not exist: {source_path}")

        print(f"Translating {source_path} with {model} ...", flush=True)
        source = parse_post(source_file.read_text(encoding="utf-8"))
        translation = translate_post(source, model, api_key)
        generated = build_chinese_post(source, translation, source_path, model)
        previous = output_file.read_text(encoding="utf-8") if output_file.exists() else None
        if previous == generated:
            print(f"Already up to date: {output_path}")
            continue
        output_file.write_text(generated, encoding="utf-8")
        changed_outputs += 1
        print(f"Generated: {output_path}")
    return changed_outputs


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--changed-from",
        metavar="GIT_REF",
        help="Translate English posts changed since this Git ref (requires --changed-to)",
    )
    source.add_argument(
        "--missing",
        action="store_true",
        help="Translate English posts that do not have a Chinese sibling",
    )
    source.add_argument(
        "--files",
        nargs="+",
        metavar="PATH",
        help="Translate one or more explicit _posts/*-en.md files",
    )
    parser.add_argument("--changed-to", default="HEAD", help="End Git ref for --changed-from")
    parser.add_argument(
        "--model",
        default=os.environ.get("OPENAI_TRANSLATION_MODEL", DEFAULT_MODEL),
        help=f"OpenAI model (default: OPENAI_TRANSLATION_MODEL or {DEFAULT_MODEL})",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.changed_from:
        changes = git_changes(args.changed_from, args.changed_to)
    elif args.missing:
        changes = missing_changes()
    else:
        changes = [("M", path) for path in args.files]

    changes = unique_changes(changes)
    if not changes:
        print("No English posts need translation.")
        return 0
    api_key = os.environ.get("OPENAI_API_KEY", "")
    count = process_changes(changes, args.model, api_key)
    print(f"Changed {count} Chinese post(s).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
