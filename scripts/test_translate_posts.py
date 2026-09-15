#!/usr/bin/env python3

import importlib.util
import json
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("translate_posts.py")
SPEC = importlib.util.spec_from_file_location("translate_posts", MODULE_PATH)
assert SPEC and SPEC.loader
translate_posts = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = translate_posts
SPEC.loader.exec_module(translate_posts)


class TranslatePostsTests(unittest.TestCase):
    def test_all_existing_english_posts_parse_and_protect(self) -> None:
        repo_root = MODULE_PATH.parents[1]
        files = sorted((repo_root / "_posts").glob("*-en.md"))
        self.assertGreater(len(files), 0)
        for file in files:
            source = translate_posts.parse_post(file.read_text(encoding="utf-8"))
            protector = translate_posts.MarkdownProtector()
            protected = {
                "title": protector.protect(source.title),
                "excerpt": protector.protect(source.excerpt),
                "categories": [protector.protect(value) for value in source.categories],
                "tags": [protector.protect(value) for value in source.tags],
                "body": protector.protect(source.body),
            }
            self.assertEqual(
                protector.restore_fields(protected),
                {
                    "title": source.title,
                    "excerpt": source.excerpt,
                    "categories": source.categories,
                    "tags": source.tags,
                    "body": source.body,
                },
                file,
            )

    def test_english_to_chinese_path(self) -> None:
        self.assertEqual(
            translate_posts.chinese_path("_posts/2026-09-15-example-en.md"),
            "_posts/2026-09-15-example.md",
        )
        with self.assertRaises(ValueError):
            translate_posts.chinese_path("../outside-en.md")

    def test_parse_and_build_chinese_post(self) -> None:
        source_text = """---
layout: "single"
title: "Hello"
date: "2026-09-15 10:00:00 +0800"
categories:
  - "Systems"
tags:
  - "Linux"
excerpt: "A short introduction."
lang: en
permalink: "/en/systems/hello/"
---

# Hello

Body.
"""
        source = translate_posts.parse_post(source_text)
        result = translate_posts.Translation(
            title="你好",
            excerpt="简短介绍。",
            categories=["系统"],
            tags=["Linux"],
            body="# 你好\n\n正文。",
        )
        output = translate_posts.build_chinese_post(
            source,
            result,
            "_posts/2026-09-15-example-en.md",
            "test-model",
        )
        self.assertIn('title: "你好"', output)
        self.assertIn('categories:\n  - "系统"', output)
        self.assertIn('translation_model: "test-model"', output)
        self.assertNotIn("lang: en", output)
        self.assertNotIn("permalink:", output)
        self.assertTrue(output.endswith("正文。\n"))

    def test_protected_markdown_is_restored_byte_for_byte(self) -> None:
        source = """Read `git status`, $x^2$, [a local link](../notes/page.html), and https://example.com/a?q=1.

```python
print("do not translate")
```

{% include example.html %}
"""
        protector = translate_posts.MarkdownProtector()
        protected = protector.protect(source)
        translated = protected.replace("Read", "阅读").replace("and", "以及")
        restored = protector.restore_fields({"body": translated})["body"]
        self.assertIn('`git status`', restored)
        self.assertIn("$x^2$", restored)
        self.assertIn("[a local link](../notes/page.html)", restored)
        self.assertIn("https://example.com/a?q=1", restored)
        self.assertIn('print("do not translate")', restored)
        self.assertIn("{% include example.html %}", restored)

    def test_missing_or_duplicated_placeholder_fails(self) -> None:
        protector = translate_posts.MarkdownProtector()
        protected = protector.protect("Use `git status`.")
        with self.assertRaises(ValueError):
            protector.restore_fields({"body": protected.replace("ZXQPROTECTED000000QXZ", "")})

    def test_translate_post_uses_structured_output(self) -> None:
        source = translate_posts.parse_post(
            """---
title: "Hello `world`"
excerpt: "Intro"
categories:
  - "Systems"
tags:
  - "Linux"
lang: en
---
Body with `code`.
"""
        )

        def fake_api(payload, api_key):
            self.assertEqual(api_key, "test-key")
            self.assertFalse(payload["store"])
            supplied = json.loads(payload["input"])
            translated = {
                "title": supplied["title"].replace("Hello", "你好"),
                "excerpt": "介绍",
                "categories": ["系统"],
                "tags": supplied["tags"],
                "body": supplied["body"].replace("Body with", "正文包含"),
            }
            return {
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": json.dumps(translated, ensure_ascii=False)}
                        ],
                    }
                ],
            }

        result = translate_posts.translate_post(source, "test-model", "test-key", fake_api)
        self.assertEqual(result.title, "你好 `world`")
        self.assertEqual(result.body, "正文包含 `code`.\n")


if __name__ == "__main__":
    unittest.main()
