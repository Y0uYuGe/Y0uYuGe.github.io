---
layout: portfolio
title: GraphRAG + Llama 3.2
excerpt: A course project connecting GraphRAG retrieval with local language models. A FastAPI service exposes local,
  global, and combined search through a chat API.
permalink: /portfolio/graphrag-llama/
redirect_from:
- /en/portfolio/graphrag-llama/
project_order: 50
project_type: Course project
project_status: Code available
repository: https://github.com/Y0uYuGe/Graphrag_LLama3.2-class-project
technologies: &id001
- Python
- GraphRAG
- Ollama
- FastAPI
- LanceDB
date: '2026-10-20'
published: true
project_page: true
tags: *id001
---

## Background

Questions about a document collection can require different scopes of context. Some concern a particular entity and its relationships; others ask for themes across the whole collection. This course project explores both forms of retrieval using GraphRAG artifacts and a locally served language model.

The repository records the indexing workflow, prompt tuning, CSV input configuration, and a Python application for querying the resulting knowledge graph. Its README also identifies reference material and the upstream GraphRAG example used as a starting point.

## Implementation

The application in `class_project/utils/main.py` connects several components:

- **Context loading:** pandas reads indexed entities, relationships, text units, claims, and community reports from Parquet files.
- **Semantic retrieval:** entity description embeddings are stored in LanceDB and used by the local context builder.
- **Search modes:** local search combines entity context and source text; global search uses community reports. A combined mode runs both and presents the answers in separate sections.
- **Model serving:** Ollama provides an OpenAI-style endpoint. The checked-in configuration selects `llama3.2-vision` for generation and `nomic-embed-text:latest` for embeddings.
- **Application interface:** FastAPI exposes `/v1/chat/completions`, `/v1/models`, and a template-based home page.

The response handler supports ordinary JSON responses and an event-stream response that sends the completed retrieval answer in successive lines. This provides a concrete place to study how retrieval results are adapted to a chat client.

## Inspect the work

- [Application source](https://github.com/Y0uYuGe/Graphrag_LLama3.2-class-project/blob/master/class_project/utils/main.py): model configuration, artifact loading, context builders, and API routes.
- [Workflow notes](https://github.com/Y0uYuGe/Graphrag_LLama3.2-class-project/blob/master/Readme.md): indexing commands, prompt tuning, and retrieval examples.
- [Development history](https://github.com/Y0uYuGe/Graphrag_LLama3.2-class-project/commits/master/): the public implementation record.

## Running the project

Reproduction requires indexed GraphRAG artifacts, Python dependencies compatible with the imported GraphRAG modules, and an Ollama service with the configured models available. Update `INPUT_DIR` to the local artifact directory before starting the application; its configured service port is `8012`.

The code imports GraphRAG's internal query modules, so dependency versions and artifact schemas need to match the implementation. The project demonstrates an integration workflow; retrieval quality still depends on the input documents, graph construction, and model configuration.
