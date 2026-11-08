---
title: cs408-computer-organization
layout: portfolio
date: '2026-10-20'
published: true
project_page: true
permalink: /portfolio/cs408-computer-organization/
repository: https://github.com/Y0uYuGe/cs408-computer-organization
project_type: Teaching system
project_status: Runnable teaching system
project_order: 103
technologies:
- Python
- RISC-V
tags:
- Computer Organization
- CS408
excerpt: AtlasMachine connects computer-organization concepts through an assembler, instruction execution, a five-stage pipeline, caches, and device models.
---

## Overview

AtlasMachine is a Python teaching computer built around an assembler, executable instruction bytes, RAM, caches, a five-stage pipeline, and memory-mapped devices. Its statistics program reads input, computes results, and transfers them to a disk-image file, connecting data representation and CPU execution to observable outputs.

## Try the machine

Using Python 3.11+, run this command from the repository directory:

```console
python -m atlas run examples/statistics.s --input examples/numbers.txt --pipeline
```

The [README and course](https://github.com/Y0uYuGe/cs408-computer-organization#readme) explain debugging, pipeline traces, numeric experiments, and original assessment questions. Source and tests expose the mechanisms behind the output.

## Current scope

The execution environment uses a documented subset of RISC-V instruction encodings with custom teaching devices. Pipeline timing treats cache accesses as one cycle. The topic map distinguishes implemented mechanisms from theory material.

## Source

[GitHub repository](https://github.com/Y0uYuGe/cs408-computer-organization)
