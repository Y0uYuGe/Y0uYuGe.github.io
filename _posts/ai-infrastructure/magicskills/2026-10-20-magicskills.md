---
title: MagicSkills
layout: portfolio
excerpt: A shared skill library for AI agents, with reusable collections, AGENTS.md synchronization, and CLI/Python
  integration.
permalink: /portfolio/magicskills/
project_order: 10
project_type: Open-source library
project_status: Code available
repository: https://github.com/Narwhal-Lab/MagicSkills
technologies: &id001
- Python
- Agent Skills
- AGENTS.md
date: '2026-10-20'
published: true
project_page: true
tags: *id001
---

## The problem

A team using several agents can accumulate many copies of the same `SKILL.md` directory. Updates then need to be repeated, each agent's available capabilities become harder to track, and framework migrations introduce another integration layer. MagicSkills, developed in [Narwhal-Lab](https://github.com/Narwhal-Lab), gives those reusable instructions and supporting files a common management workflow.

The practical goal is to maintain a skill once, select an appropriate working set for each agent, and connect that set to different runtimes. The project includes examples for agent applications and frameworks such as Codex, Cursor, LangChain, and CrewAI. See the [project overview](https://github.com/Narwhal-Lab/MagicSkills#overview-en) for the supported integration patterns.

## How the pieces fit

<figure>
  <a href="{{ '/images/portfolio/magicskills-flow.svg' | relative_url }}" title="Open full-size diagram"><img src="{{ '/images/portfolio/magicskills-flow.svg' | relative_url }}" alt="A shared skill pool feeds Skills collections, which synchronize to AGENTS.md or expose CLI and Python interfaces."></a>
  <figcaption>Skill reuse workflow, based on the repository's object model and synchronization code.</figcaption>
</figure>

**Skill discovery.** A skill is a directory containing `SKILL.md`. The implementation records its path, description, and source, allowing the content to stay in ordinary files that can be inspected and versioned.

**Collection composition.** A `Skills` instance selects the capabilities needed by one workflow. Several collections can reference the same installed directory. Lookup accepts names or explicit paths, which resolves ambiguity when two directories share a name. These operations live in the [collection implementation](https://github.com/Narwhal-Lab/MagicSkills/blob/main/src/magicskills/type/skills.py).

**Persistence and integration.** `REGISTRY` stores collection configuration and path references in `~/.magicskills/collections.json`; it does not duplicate the complete skill contents. Synchronization generates the skills section of `AGENTS.md`. Frameworks can instead call the collection's list, read, and execution interface through Python or the CLI. The [registry implementation](https://github.com/Narwhal-Lab/MagicSkills/blob/main/src/magicskills/type/skillsregistry.py) and [Python API guide](https://github.com/Narwhal-Lab/MagicSkills/blob/main/doc/python-api.md) explain these boundaries.

## Try the documented workflow

The following example uses the repository's included C-to-AST skill and a fresh collection name. It follows the [CLI documentation](https://github.com/Narwhal-Lab/MagicSkills/blob/main/doc/cli.md); Python 3.10–3.13 and Git are required.

```bash
git clone https://github.com/Narwhal-Lab/MagicSkills.git
cd MagicSkills
python -m pip install -e .
magicskills install skill_template -t ./demo-skills
magicskills addskills portfolio_demo --skill-list c_2_ast --agent-md-path ./demo-agent/AGENTS.md
magicskills syncskills portfolio_demo
magicskills skill-tool listskill --name portfolio_demo
```

Review the synchronization prompt to write the generated file. The final command lists the selected skill; reading its instructions and running its parser are separate steps. The [sample skill](https://github.com/Narwhal-Lab/MagicSkills/tree/main/skill_template/c_2_ast) provides those files. Execution uses the current working directory, so an integration must choose its working directory explicitly.

## Development history and writing

The [commit history](https://github.com/Narwhal-Lab/MagicSkills/commits/main/) and [pull requests](https://github.com/Narwhal-Lab/MagicSkills/pulls?q=is%3Apr) provide the public implementation record. For a longer explanation of the skill reuse model, see my [MagicSkills technical article]({{ '/posts/csdn-159395734/' | relative_url }}).
