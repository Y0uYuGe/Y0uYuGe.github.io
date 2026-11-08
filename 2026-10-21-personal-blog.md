---
title: Personal Research Workspace
layout: portfolio
date: '2026-10-21'
published: true
project_page: true
permalink: /portfolio/personal-blog/
project_order: 200
repository: https://github.com/Y0uYuGe/Y0uYuGe.github.io
project_type: Personal website
project_status: Published
excerpt: A Jekyll research workspace connecting topic-organized articles, publications, and project records with controlled documentation publishing.
technologies:
- Jekyll
- Liquid
- JavaScript
- Ruby
tags:
- Jekyll
- Liquid
- JavaScript
- Ruby
---

## Explore the workspace

This site organizes my technical writing, publications, and engineering projects in one personal research workspace. The [article browser]({{ '/posts/' | relative_url }}) follows nested, English-named topic folders and supports text search, tags, and year/month filters. [Publications]({{ '/publications/' | relative_url }}) and [Portfolio]({{ '/portfolio/' | relative_url }}) provide separate records with source links and detail pages.

## Documentation alongside projects

Local project checkouts can live beside their publication documents without publishing the entire source tree. A project manifest and Ruby preparation scripts generate an explicit document whitelist; the local preview launcher checks Jekyll's actual article, page, and static-file inputs against those boundaries. Project code, internal notes, and repository administration files remain outside the selected publication set.

## Implementation and scope

The site builds on Academic Pages with Jekyll, Liquid templates, and browser-side JavaScript. Markdown remains the content source, and project implementations retain their own repositories. This is a static documentation and discovery interface, not an online code runner or Agent execution service.

[Source and local setup](https://github.com/Y0uYuGe/Y0uYuGe.github.io#readme)
