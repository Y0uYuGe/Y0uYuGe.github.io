---
title: "AI Agent 元年的重磅突破！北大开源 MagicSkills：深度解析模块化技能如何真正实现“一键复用”"
date: "2026-03-23 21:43:32 +0800"
categories:
  - "AI与大模型"
tags:
  - "人工智能"
  - "驱动开发"
  - "Agents"
  - "claudeskills"
  - "Agent框架"
  - "大语言模型"
  - "Agent"
  - "MagicSkills"
excerpt: "项目地址：https://github.com/Narwhal-Lab/MagicSkills —— 对于许多搭建多 Agent 系统的团队来说，最先失控的往往不是模型，而是技能管理。同一个 skill 目录常常既要服务于 Codex、Cursor、Claude Code 这类 Agent 应用，又要服务于 LangChain、LangGraph 等框架中创建的多个 agent。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/159395734"
csdn_article_id: "159395734"
migrated: true
---

{% raw %}
# 现实中的痛点

项目地址：https://github.com/Narwhal-Lab/MagicSkills



对于许多搭建多 Agent 系统的团队来说，最先失控的往往不是模型，而是技能管理。



同一个 skill 目录常常既要服务于 Codex、Cursor、Claude Code 这类 Agent 应用，又要服务于 LangChain、LangGraph 等框架中创建的多个 agent。



结果往往不是“复用”，而是“复制”：

同一个 skill 目录被复制进多个 Agent 项目中，一旦这个 skill 目录需要更新，就得在多个地方反复维护，很快各个副本就会出现分歧。



# MagicSkills 如何解决这个问题

MagicSkills 解决的不是“再造一个 Agent 框架”，而是为多 Agent 项目增加了一层 local-first 的技能基础设施。



用一句话概括：

构建一次 skill，供每一个 Agent 复用。



具体来说：



- MagicSkills 首先把已安装的 skill 聚合成一个统一的共享 skill 池
- 然后为每个 Agent 分别创建一个 `Skills` 集合，只暴露它真正需要的能力
- 最后根据每种 runtime 的集成方式，要么同步到 `AGENTS.md` / `CLAUDE.md`，要么把它们暴露为 `tool / function`



这里可以补充一个更底层的实现概念：

MagicSkills 把已安装的 skill 聚合成一个统一的 `Allskills` 视图，但在描述它如何向外传播时，更容易理解的说法是“共享 skill 池”。



# 一个最极端的例子

假设你现在想做一件最极端的事——最能体现 MagicSkills 价值的那种：



你想让同一个 skill 目录，在不做任何复制的情况下，同时服务于以下这些 Agent 应用，以及用各种 Agent 框架搭建的 agent：



- Codex
- Cursor
- Claude Code
- Windsurf
- Aider
- AutoGen
- CrewAI
- LangChain
- LangGraph
- Haystack
- Semantic Kernel
- smolagents
- LlamaIndex



这时，整个流程可以归纳为以下四个步骤。


## 1. 先安装 MagicSkills



```bash

git clone https://github.com/Narwhal-Lab/MagicSkills.git

cd MagicSkills

pip install -e .

```



## 2. 把需要的 skill 安装进共享 skill 池



```bash

# 方式一：从本地安装 skill

magicskills install skill_template



# 方式二：从 GitHub 安装 skill

magicskills install anthropics/skills

```



说明：



- 第一条命令从本地的 `skill_template` 安装一个 skill，例如 `c_2_ast`
- 第二条命令从 GitHub 安装更多 skill，例如 `pdf`、`docx`、`brand-guidelines`、`doc-coauthoring`、`canvas-design`
- 安装路径可以通过 `-t` 指定，也可以使用默认路径
- 无论安装在哪里，MagicSkills 都会把这些已安装的 skill 聚合进统一的共享 skill 池



## 3. 为每个 Agent 分别创建一个 `Skills` 集合



这一步是整个设计中最关键的部分。



不是直接把某个 skill 目录复制到某个 Agent 使用 skill 的目录下，
而是先为每个 Agent 创建一个命名的 `Skills` 集合，挑选它实际需要用到的 skill。



例如：



- 对于 Codex、Cursor、Claude Code、Windsurf、Aider 这类 Agent 应用，这里的每个示例默认对应一个 Agent，所以通常只需创建一个 `Skills` 集合
- 对于下面这组 `tool / function` 框架的示例，我们统一假设在每个 agent 框架内部创建了两个 agent，所以每个框架对应两个 `Skills` 集合，分别由 `agent1` 和 `agent2` 使用



```bash

# 面向读取 AGENTS.md / CLAUDE.md 的 Agent 应用

magicskills addskills codex_skills --skill-list c_2_ast docx  # 假设当前 Codex 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 codex_skills 给 Codex 使用

magicskills addskills cursor_skills --skill-list c_2_ast docx  # 假设当前 Cursor 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 cursor_skills 给 Cursor 使用

magicskills addskills claudecode --skill-list c_2_ast brand-guidelines  # 假设当前 Claude Code 需要的 skill 是 c_2_ast 和 brand-guidelines，将这两个 skill 封装为一个 Skills 集合 claudecode 给 Claude Code 使用

magicskills addskills Windsurf_skills --skill-list c_2_ast doc-coauthoring  # 假设当前 Windsurf 需要的 skill 是 c_2_ast 和 doc-coauthoring，将这两个 skill 封装为一个 Skills 集合 Windsurf_skills 给 Windsurf 使用

magicskills addskills Aider_skills --skill-list c_2_ast docx  # 假设当前 Aider 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 Aider_skills 给 Aider 使用



# 面向 tool / function 框架的 example

magicskills addskills autogen_agent1_skills --skill-list c_2_ast pdf  # 假设当前 AutoGen agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 autogen_agent1_skills 给 AutoGen agent1 使用

magicskills addskills autogen_agent2_skills --skill-list c_2_ast docx  # 假设当前 AutoGen agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 autogen_agent2_skills 给 AutoGen agent2 使用

magicskills addskills crewai_agent1_skills --skill-list c_2_ast pdf  # 假设当前 CrewAI agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 crewai_agent1_skills 给 CrewAI agent1 使用

magicskills addskills crewai_agent2_skills --skill-list c_2_ast docx  # 假设当前 CrewAI agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 crewai_agent2_skills 给 CrewAI agent2 使用

magicskills addskills langchain_agent1_skills --skill-list c_2_ast pdf  # 假设当前 LangChain agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 langchain_agent1_skills 给 LangChain agent1 使用

magicskills addskills langchain_agent2_skills --skill-list c_2_ast docx  # 假设当前 LangChain agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 langchain_agent2_skills 给 LangChain agent2 使用

magicskills addskills langgraph_agent1_skills --skill-list c_2_ast pdf  # 假设当前 LangGraph agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 langgraph_agent1_skills 给 LangGraph agent1 使用

magicskills addskills langgraph_agent2_skills --skill-list c_2_ast docx  # 假设当前 LangGraph agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 langgraph_agent2_skills 给 LangGraph agent2 使用

magicskills addskills haystack_agent1_skills --skill-list c_2_ast pdf  # 假设当前 Haystack agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 haystack_agent1_skills 给 Haystack agent1 使用

magicskills addskills haystack_agent2_skills --skill-list c_2_ast docx  # 假设当前 Haystack agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 haystack_agent2_skills 给 Haystack agent2 使用

magicskills addskills semantic_kernel_agent1_skills --skill-list c_2_ast pdf  # 假设当前 Semantic Kernel agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 semantic_kernel_agent1_skills 给 Semantic Kernel agent1 使用

magicskills addskills semantic_kernel_agent2_skills --skill-list c_2_ast docx  # 假设当前 Semantic Kernel agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 semantic_kernel_agent2_skills 给 Semantic Kernel agent2 使用

magicskills addskills smolagents_agent1_skills --skill-list c_2_ast pdf  # 假设当前 smolagents agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 smolagents_agent1_skills 给 smolagents agent1 使用

magicskills addskills smolagents_agent2_skills --skill-list c_2_ast docx  # 假设当前 smolagents agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 smolagents_agent2_skills 给 smolagents agent2 使用

magicskills addskills llamaindex_agent1_skills --skill-list c_2_ast pdf  # 假设当前 LlamaIndex agent1 需要的 skill 是 c_2_ast 和 pdf，将这两个 skill 封装为一个 Skills 集合 llamaindex_agent1_skills 给 LlamaIndex agent1 使用

magicskills addskills llamaindex_agent2_skills --skill-list c_2_ast docx  # 假设当前 LlamaIndex agent2 需要的 skill 是 c_2_ast 和 docx，将这两个 skill 封装为一个 Skills 集合 llamaindex_agent2_skills 给 LlamaIndex agent2 使用

```



这一步说明了一件极其关键的事：



共享 skill 池中的每个 skill 能力，都可以自由组合进多个不同 Agent 的 `Skills` 集合中。
也就是说，同一个 `c_2_ast` skill——在不被复制的情况下——可以同时进入 Codex、Cursor、Claude Code、LangChain、LangGraph、AutoGen 等不同系统的能力边界。



## 4. 再根据各个 runtime 的使用方式进行适配



有了各自的 `Skills` 集合之后，接下来就是 runtime 适配的事了。



对于读取 `AGENTS.md` 或 `CLAUDE.md` 的 runtime（如 Codex、Cursor、Claude Code、Windsurf、Aider），可以使用：



```bash

magicskills syncskills <skills_name> --output ./AGENTS.md -y

magicskills syncskills <skills_name> --mode cli_description --output ./AGENTS.md -y

magicskills syncskills <skills_name> --output ./CLAUDE.md -y

```



其中：



- 默认模式适用于能够直接消费 `AGENTS.md` 中 `<usage> + <available_skills>` 结构的 runtime
- `--mode cli_description` 适用于不能直接消费该结构、需要通过统一 CLI 流程 `magicskills skill-tool listskill/readskill/execskill --name <skills_name>` 来使用 skill 的 runtime
- `--output` 用于指定输出路径，所以目标文件不一定是 `AGENTS.md`，也可以按 runtime 的要求输出为 `CLAUDE.md` 或其他文件



对于 LangChain、LangGraph、AutoGen、CrewAI、Haystack、Semantic Kernel、smolagents、LlamaIndex 这类 `tool / function` 框架，你可以在代码中直接加载该框架中某个 agent 对应的 `Skills` 集合，然后把它暴露为 `tool / function`：



```python

from magicskills import REGISTRY



skills = REGISTRY.get_skills("langchain_agent1_skills")

```



之后，通过各个框架自己的 `tool / function` 机制，把 `skills.skill_tool(...)` 和 `skills.tool_description` 接入到各个 agent 中。



## 这其中最极端、也最有价值的部分是什么？



最极端的部分在于：



你不是在为每个 Agent 分别维护一份独立的 skill 副本，
而是为所有 Agent 维护同一份底层共享 skill 池，按需为每个 Agent 划分出自己的 `Skills` 集合，最后再根据 runtime 的差异进行适配。



这意味着：



- 同一个 skill，在不被复制的情况下，可以服务于上述所有 agent 系统
- skill 的维护成本被集中到一处——你只需要维护共享 skill 池中的那一份
- 每个 Agent 只能看到它真正需要的那部分能力
- 新增一种 runtime 并不需要重写整套 skill，你只需要创建一个新的集合并接入相应的适配层
{% endraw %}
