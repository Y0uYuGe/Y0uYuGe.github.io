---
title: cs408-operating-systems
layout: portfolio
date: '2026-10-20'
published: true
project_page: true
permalink: /portfolio/cs408-operating-systems/
repository: https://github.com/Y0uYuGe/cs408-operating-systems
project_type: Teaching system
project_status: Runnable teaching system
project_order: 105
technologies:
- Python
tags:
- Operating Systems
- CS408
excerpt: AtlasOS teaches operating-system mechanisms through executable programs, scheduling, blocking IPC, paging, persistent files, and restartable checkpoints.
---

## Overview

AtlasOS is a user-space teaching kernel implemented in Python. Programs pass through an interpreter and process scheduler, interact through blocking pipes, access paged memory, and save files in an inode-based teaching filesystem. Checkpoints preserve execution state across separate host processes, making scheduling and persistence observable throughout a complete workflow.

## Run a complete workflow

With Python 3.11+, execute these commands in the repository:

```console
python -m atlasos --home .atlasos install-examples
python -m atlasos --home .atlasos run /programs/pipeline.atl
python -m atlasos --home .atlasos cat /sum.txt
```

The producer/consumer example writes its calculated result into the teaching filesystem. The [course and README](https://github.com/Y0uYuGe/cs408-operating-systems#readme) cover scheduling, synchronization, memory, storage, original questions, and failure-recovery tests.

## Current scope

Files and checkpoints persist on the host, while CPU privilege, page frames, interrupts, and disk tracks are explicit models. The course explains these boundaries and maps implemented mechanisms and theory topics to the source.

## Source

[GitHub repository](https://github.com/Y0uYuGe/cs408-operating-systems)
