---
title: cs408-data-structures
layout: portfolio
date: '2026-10-20'
published: true
project_page: true
permalink: /portfolio/cs408-data-structures/
repository: https://github.com/Y0uYuGe/cs408-data-structures
project_type: Teaching system
project_status: Runnable teaching system
project_order: 104
technologies:
- Python
- C
- C++
tags:
- Data Structures
- Algorithms
- CS408
excerpt: AtlasSearch puts data structures to work in a persistent local document search engine with Boolean queries, phrase matching, suggestions, and graph exploration.
---

## Overview

AtlasSearch is a local document-search engine that gives core data structures practical responsibilities. Inverted indexes support Boolean retrieval, KMP checks phrases, a Trie provides prefix suggestions, and an AVL tree supports document-length ranges. Graph algorithms explore document relationships, while Huffman coding and checked snapshots support backup and recovery.

## Search your own notes

With Python 3.11+, run these commands in the repository:

```console
python -m atlas_search --db .atlas init
python -m atlas_search --db .atlas index examples/corpus
python -m atlas_search --db .atlas search "tree AND NOT graph"
```

Replace the sample corpus with your own UTF-8 notes. The [README](https://github.com/Y0uYuGe/cs408-data-structures#readme) links the course, original exercises, algorithm implementations, and verification commands.

## Current scope

The engine persists documents and indexes, with integrity checks and recovery behavior. Tokenization and ranking follow explicit teaching rules. The course topic map separates implemented algorithms from theory material.

## Source

[GitHub repository](https://github.com/Y0uYuGe/cs408-data-structures)
