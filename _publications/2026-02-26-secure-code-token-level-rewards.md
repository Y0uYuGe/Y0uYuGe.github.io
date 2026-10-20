---
title: "Learning to Generate Secure Code via Token-Level Rewards"
collection: publications
category: preprints
permalink: /publication/2026-02-26-secure-code-token-level-rewards/
date: 2026-02-26
venue: "arXiv (preprint)"
excerpt: "Secure code generation with LLMs through vulnerability-derived training data and token-level reinforcement learning rewards. The work introduces Vul2Safe, PrimeVul+, and SRCode."
link: "https://arxiv.org/abs/2602.23407"
paperurl: "https://arxiv.org/pdf/2602.23407"
bibtexurl: "/assets/publications/2602.23407.bib"
authors:
  - name: "Jiazheng Quan"
    affiliations: [1, 2]
  - name: "Xiaodong Li"
    affiliations: [2]
  - name: "Bin Wang"
    affiliations: [3]
  - name: "Guo An"
    affiliations: [4]
  - name: "Like Liu"
    affiliations: [3]
    highlight: true
  - name: "Degen Huang"
    affiliations: [1]
  - name: "Lin Liu"
    affiliations: [4]
  - name: "Chengbin Hou"
    affiliations: [1]
affiliations:
  "1": "Fuyao University of Science and Technology"
  "2": "Xiamen University"
  "3": "Peking University"
  "4": "Huawei"
method_figure:
  image: "/images/publications/2602.23407/method-overview.png"
  alt: "Method overview of Vul2Safe data construction, PrimeVul+ curriculum tasks, and SRCode training with token-level rewards."
  width: 1784
  height: 988
  caption: "Figure 1. Vul2Safe builds secure repair data; PrimeVul+ organizes detection, repair, and generation tasks into a curriculum; SRCode combines supervised fine-tuning with token-level reinforcement learning."
  source: "https://arxiv.org/pdf/2602.23407v1#page=4"
---

## Overview

This work studies secure code generation with large language models. Vul2Safe constructs vulnerability repair data, PrimeVul+ provides training examples, and SRCode applies reinforcement learning rewards at the token level to improve code security.

The method connects three components:

- **Vul2Safe** builds secure repair data from vulnerable code.
- **PrimeVul+** organizes detection, repair, and generation tasks into a training curriculum.
- **SRCode** combines supervised fine-tuning with token-level reinforcement learning.
