---
title: GraphRAG + Llama 3.2
excerpt: "一个将 GraphRAG 检索与本地语言模型连接起来的课程项目。FastAPI 服务通过聊天 API 提供局部搜索、全局搜索以及组合搜索。"
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
tags: *id001
---

## 背景

针对一个文档集合提出的问题，可能需要不同范围的上下文。有些问题关注某个特定实体及其关系；另一些则询问贯穿整个集合的主题。这个课程项目利用 GraphRAG 产物和本地部署的语言模型，探索了这两种检索形式。

仓库记录了索引流程、提示词调优、CSV 输入配置，以及一个用于查询所生成知识图谱的 Python 应用。其 README 还列出了参考资料以及作为起点的上游 GraphRAG 示例。

## 实现

`class_project/utils/main.py` 中的应用连接了以下几个组件：

- **上下文加载：** pandas 从 Parquet 文件中读取已索引的实体、关系、文本单元、声明（claims）和社区报告。
- **语义检索：** 实体描述的嵌入向量存储在 LanceDB 中，供局部上下文构建器使用。
- **搜索模式：** 局部搜索结合实体上下文和源文本；全局搜索使用社区报告。组合模式会同时运行两者，并将答案分节呈现。
- **模型服务：** Ollama 提供 OpenAI 风格的接口。已提交的配置选用 `llama3.2-vision` 进行生成，选用 `nomic-embed-text:latest` 生成嵌入。
- **应用接口：** FastAPI 提供 `/v1/chat/completions`、`/v1/models` 以及一个基于模板的主页。

响应处理器既支持普通的 JSON 响应，也支持事件流响应，后者会将完成的检索答案逐行发送。这为研究如何将检索结果适配到聊天客户端提供了一个具体的切入点。

## 查看成果

- [应用源码](https://github.com/Y0uYuGe/Graphrag_LLama3.2-class-project/blob/master/class_project/utils/main.py)：模型配置、产物加载、上下文构建器和 API 路由。
- [流程笔记](https://github.com/Y0uYuGe/Graphrag_LLama3.2-class-project/blob/master/Readme.md)：索引命令、提示词调优和检索示例。
- [开发历史](https://github.com/Y0uYuGe/Graphrag_LLama3.2-class-project/commits/master/)：公开的实现记录。

## 运行项目

复现需要已索引的 GraphRAG 产物、与所导入 GraphRAG 模块兼容的 Python 依赖，以及一个已准备好所配置模型的 Ollama 服务。启动应用前，请将 `INPUT_DIR` 更新为本地产物目录；其配置的服务端口为 `8012`。

代码导入了 GraphRAG 的内部查询模块，因此依赖版本和产物结构需要与实现相匹配。本项目展示的是一个集成流程；检索质量仍取决于输入文档、图谱构建和模型配置。
