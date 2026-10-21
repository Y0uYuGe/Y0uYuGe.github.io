---
title: glibc-chunk-poc-basic
layout: portfolio
excerpt: Small C examples and allocator notes covering glibc heap behavior, bin manipulation, and version-specific
  exploitation techniques.
permalink: /portfolio/glibc-chunk-poc/
project_order: 20
project_type: Security practice
project_status: Code available
repository: https://github.com/Y0uYuGe/glibc-chunk-poc-basic
technologies: &id001
- C
- glibc
- GDB
- patchelf
date: '2026-10-20'
published: true
project_page: true
tags: *id001
---

## Background

glibc allocator behavior becomes easier to reason about when a technique is reduced to a small allocation sequence. This repository collects C proof-of-concept programs alongside notes on chunk metadata, allocator checks, and debugging. The README credits the existing heap exploitation material used throughout the collection.

## Implementation and coverage

The source tree organizes examples by technique, including `unlink`, fastbin double free, unsorted and large bins, overlapping chunks, and tcache manipulation. Further directories explore IO structures, exit handling, and related control-flow targets.

Two compact examples illustrate the approach:

| Example | What the code makes visible |
| --- | --- |
| [`fastbin_double_free/2.23.c`](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/fastbin_double_free/2.23.c) | A repeated free sequence and subsequent allocations, with an address comparison at the end. |
| [`tcache_poisoning/2.27.c`](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/tcache_poisoning/2.27.c) | Modification of a freed entry followed by allocations and printed destination addresses. |

The examples keep the allocation sequence close to the behavior being studied. This supports reading allocator source and inspecting memory in a debugger, rather than hiding the mechanism behind a larger target program.

## Environment and reproduction

Version labels are part of the examples' context. A program written for glibc 2.23 or 2.27 should be examined with the intended allocator and dynamic loader; behavior on the host's default libc may differ.

The [`tcache_poisoning/start`](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/tcache_poisoning/start) script compiles with GCC debugging information, changes the libc dependency and interpreter using `patchelf`, then opens GDB. Its absolute `/home/llk/...` paths require local equivalents. The README also describes adding allocator source and debug information.

## Development history and notes

[Read the allocator notes and references](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/README.md) · [Browse all examples](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/tree/main) · [View repository commits](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/commits/main/)
