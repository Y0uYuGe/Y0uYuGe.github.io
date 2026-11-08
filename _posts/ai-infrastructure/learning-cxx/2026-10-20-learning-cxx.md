---
title: learning-cxx
layout: portfolio
date: '2026-10-20'
published: true
project_page: true
permalink: /portfolio/learning-cxx/
repository: https://github.com/Y0uYuGe/learning-cxx
project_type: Learning implementation
project_status: Exercise implementations
project_order: 110
technologies: [C++, xmake]
tags: [C++, Programming, Learning]
excerpt: A learning fork of the LearningInfiniTensor C++ curriculum, with exercise implementations and notes on object lifetimes, templates, containers, and smart pointers.
---

## Overview

This personal fork follows the LearningInfiniTensor C++ curriculum. It contains exercise implementations covering core language features and standard-library facilities, including object lifetimes, templates, containers, and smart pointers.

## Implementation

The historical [C++ exercise commit](https://github.com/Y0uYuGe/learning-cxx/commit/06ac0678f2395ad76cab73f945d9cbd3ac01d930) changes 34 exercise source files. For example, the accumulation exercise uses `std::accumulate` to calculate a tensor's byte size. These changes belong to the learning fork; they are not presented as accepted upstream contributions.

## Verification

The source README describes the xmake build and exercise runner. Some verification assertions in the smart-pointer exercise are currently commented out, and generated build files were included in the historical commit. Restoring those checks and cleaning the generated artifacts remain follow-up work; the repository is not described as having passed every exercise.

## Source

[GitHub repository](https://github.com/Y0uYuGe/learning-cxx)
