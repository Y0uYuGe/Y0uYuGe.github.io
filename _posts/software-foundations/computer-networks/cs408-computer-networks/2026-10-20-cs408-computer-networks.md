---
title: cs408-computer-networks
layout: portfolio
date: '2026-10-20'
published: true
project_page: true
permalink: /portfolio/cs408-computer-networks/
repository: https://github.com/Y0uYuGe/cs408-computer-networks
project_type: Teaching system
project_status: Runnable teaching system
project_order: 102
technologies:
- Python
- TCP/UDP
- PCAP
tags:
- Computer Networks
- CS408
excerpt: AtlasNet teaches computer networking through a persistent file service, reliable UDP transfers, packet encoding, and routing experiments.
---

## Overview

AtlasNet connects 408 networking concepts to a working file-transfer system. Its Python implementation includes a TCP file service, authenticated uploads, persistent storage, and a custom reliable UDP protocol with retransmission, reordering, and whole-file integrity checks. Packet encoders produce standard-format PCAP files, while routing and transport models make protocol decisions inspectable.

## Start learning

With Python 3.11+, follow the [README](https://github.com/Y0uYuGe/cs408-computer-networks#readme) to run the server and client in separate terminals. Start with a real upload/download, then introduce packet loss and compare the recovered file. The repository includes a staged Chinese course, original questions, and tests for protocol behavior and failure handling.

## Current scope

The file transfers use real sockets. Packet captures are synthesized, while routing, TCP control, and congestion behavior are explored through teaching models. The course maps these mechanisms to source files, experiments, and tests.

## Source

[GitHub repository](https://github.com/Y0uYuGe/cs408-computer-networks)
