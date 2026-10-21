# Y0uYuGe 的个人博客

站点：https://y0uyuge.github.io/

仓库：https://github.com/Y0uYuGe/Y0uYuGe.github.io

博客使用 Jekyll，基于 Academic Pages / Minimal Mistakes。文章、页面和图片都保存在这个仓库中。

## 文件夹说明

| 文件夹 | 用途 | 什么时候需要编辑 |
| --- | --- | --- |
| `_posts/` | 按领域组织文章与独立项目工作目录；博客只发布选定文档 | 写文章、开发项目、维护项目内发布稿 |
| `images/` | 文章配图、头像和站点图标 | 添加配图或更换头像 |
| `images/csdn/` | 迁移文章的 4,378 张配图，按年份和文章编号整理 | 修改对应迁移文章的图片 |
| `_pages/` | 首页、简历、文章列表、项目列表、分类、标签、站点地图和 404 页面 | 修改固定页面 |
| `_portfolio/` | 兼容旧项目记录；现有项目正文已迁入 `_posts/领域/项目/` | 新项目文档写在项目目录内 |
| `_publications/` | 论文记录，列表按分类和日期展示，点击标题进入正文页 | 填写论文元信息和正文 |
| `_talks/`、`_teaching/` | 演讲、教学记录 | 有实际内容时添加对应记录 |
| `_data/` | 导航菜单、界面文字、项目清单、Star 和贡献记录 | 调整菜单、项目登记和展示信息 |
| `scripts/` | 项目下载与发布文档白名单工具；不输出到网站 | 维护项目工作目录与同步规则 |
| `assets/` | 浏览器加载的 CSS、JavaScript 和图标字体 | 调整外观和交互 |
| `_sass/` | 主题样式源文件，包括布局、主题和第三方样式 | 深入修改主题样式 |
| `_includes/` | 共用组件，例如导航、侧栏、页脚、文章目录 | 修改共用页面组件 |
| `_layouts/` | 页面骨架，例如文章页和列表页 | 修改整体页面结构 |
| `local/` | 当前电脑的预览启动脚本、依赖配置和日志 | 启动或排查本地预览；不上传 GitHub |
| `_site/` | Jekyll 自动生成的网站成品，包含 HTML 和资源副本 | 自动生成，可删除后重建；不要直接编辑 |
| `.sass-cache/` | 样式编译缓存 | 自动生成，可删除后重建 |
| `.git/` | Git 版本记录和远端信息 | 由 Git 管理，保留 |

日常写博客主要使用 `_posts/` 和 `images/`。首页内容在 `_pages/about.md`，导航菜单在 `_data/navigation.yml`。

## 根目录文件说明

| 文件 | 用途 |
| --- | --- |
| `_config.yml` | 站点名称、作者信息、链接、文章规则和插件配置 |
| `_config_local.yml` | 本地预览配置，让链接使用本地地址 |
| `Gemfile` | Jekyll 和 GitHub Pages 的运行依赖 |
| `package.json` | 修改主题 JavaScript 后重建主脚本的工具配置；普通写文章无需操作 |
| `.gitignore` | 指定不上传的缓存、本地运行文件和依赖目录 |
| `LICENSE` | 主题及代码的 MIT 许可声明 |
| `README.md` | 本项目的使用说明 |

## 新建文章

在 `_posts/` 中建立领域文件夹，可以继续建立任意层子目录。网页 Blog Posts 会直接跟随实际路径，不需要另外配置栏目。目录统一使用小写英文，多个单词用连字符连接，例如 `endpoint-security`。网页目录和文章面包屑直接显示实际文件夹名称，不使用名称映射；新建目录无需修改配置文件。

例如：

```text
_posts/
├── endpoint-security/
│   ├── kernel-security/
│   │   └── study-notes/
│   │       └── 2026-10-09-my-first-post.md
│   └── reverse-engineering/
├── ai-infrastructure/
│   └── agents-and-skills/
└── embodied-ai/
    └── ros-and-robotics/
```

你也可以自行创建 `ai-security/model-security/` 等新目录。网页只显示包含已发布文章的目录；空目录和草稿不会出现在公开目录。

文件名使用 `YYYY-MM-DD-英文短名.md`。例如在 `_posts/endpoint-security/kernel-security/study-notes/` 新建 `2026-10-09-my-first-post.md`：

```markdown
---
title: "文章标题"
date: 2026-10-09
permalink: /posts/my-first-post/
tags:
  - Linux
  - Kernel
excerpt: "一句话介绍这篇文章。"
---

## 开始

这里写文章正文。
```

文章保存后会加入对应目录。文件名使用 `YYYY-MM-DD-英文短名.md`，例如 `2026-10-17-driver-security.md`；网页文章标题由顶部的 `title` 决定，标签由 `tags` 决定。标题和正文可以使用中文；标签尽量沿用已有名称，避免重复。目录由文件路径决定，不用在文章顶部重复填写目录。

网页支持：

- 桌面页面右侧固定显示 Topics、Time、Tags 筛选栏，滚动阅读时保持可用；手机通过固定的 Filters 按钮打开同一筛选栏。
- 在 Topics 浏览目录和子目录，点击上层目录查看其所有文章。目录默认收起，选择目录后自动展开对应层级。
- 按标题、摘要或标签搜索。
- 在 Tags 中跨目录按标签检索，也可以将目录、关键词和多个标签一起使用。默认显示常用标签，Find a tag 搜索全部标签，Show all tags 展开完整列表。
- 在 Time 按年份和月份筛选；可以分别使用，也可与目录、关键词、标签组合。筛选条件保存在网址中，刷新和浏览器后退会恢复；Clear filters 清除全部条件。
- 多标签同时匹配；标签大小写差异会合并检索，原文章标签保持原样。
- 在文章顶部查看所属目录，点击文章标签进入标签检索。

Blog Posts 使用统一的文章列表，所有文章按发布日期从新到旧排列。目录、关键词和标签筛选后的结果也按相同顺序显示，每页 20 篇；列表标题与摘要读取文章本身的 `title` 和 `excerpt`。

不填写 `permalink` 时，新文章的默认地址包含实际目录和文件名，例如 `/posts/endpoint-security/kernel-security/study-notes/2026-10-09-my-first-post/`。建议发布前按上面的示例填写唯一的固定 `permalink`，后续调整目录时文章地址保持稳定。现有迁移文章均已保留原有固定地址。目录筛选链接使用真实的英文路径，之前保存的中文目录筛选书签需要重新选择目录。

配图可以按文章建立文件夹，例如 `images/my-first-post/cover.png`，然后在正文中引用：

```markdown
![图片说明](/images/my-first-post/cover.png)
```

如果需要草稿，可以自行创建 `_drafts/`，或在文章顶部加入 `published: false`。附件可以按需创建 `files/`，再通过 `/files/文件名` 引用。

## 新建演讲记录（Talks）

第一次添加时先在博客根目录创建 `_talks/`，再新建 `2026-10-11-endpoint-security.md`。文件夹已经在站点配置中启用，不需要修改导航或配置。

```markdown
---
title: "终端安全技术分享"
collection: talks
date: 2026-10-11
type: "技术分享"
venue: "活动或会议名称"
location: "线上"
excerpt: "介绍这次分享的主要内容。"
---

## 分享内容

这里写详细介绍、分享要点和资料链接。
```

`/talks/` 列表自动显示标题、日期、类型、活动名称、地点和摘要；点击标题查看正文。详情页兼容旧记录的 `talk_type`，新记录只填写 `type` 即可。可选字段 `link` 用于正文页的外部链接按钮，列表标题始终打开站内正文。

图片放在 `images/`，PDF 或幻灯片可以按需放在 `files/`，在正文中写 `[查看幻灯片](/files/实际文件名.pdf)`。Talks 没有通过 `slidesurl` 自动生成下载按钮的规则，资料链接写在正文中。

## 新建教学记录（Teaching）

第一次添加时先在博客根目录创建 `_teaching/`，再新建 `2026-10-11-endpoint-security-course.md`。

```markdown
---
title: "终端安全课程"
collection: teaching
date: 2026-10-11
type: "课程"
venue: "学校或机构名称"
excerpt: "介绍课程主题、对象和主要内容。"
---

## 课程介绍

这里写课程内容、教学安排和资料链接。
```

`/teaching/` 列表自动显示标题、类型、机构、年份和摘要；点击标题查看正文。任课角色、课时、地点等其他信息可以写在正文中。附件与配图的用法和文章相同。

Talks 和 Teaching 目前按日期倒序显示为平面列表；只有 Blog Posts 将实际子文件夹显示为网页目录树，并提供目录和标签组合检索。两种记录也可以使用子文件夹存放文件，但页面不会自动生成目录树。

以上模板中的日期和内容请替换为实际记录。Talks 和 Teaching 的文件名不强制要求日期前缀，使用日期便于整理。普通新增记录只需保存 Markdown，等待本地预览重新生成后刷新对应栏目；提交并推送到 GitHub 后才会发布到线上站点。

## 新建论文记录（Publications）

在 `_publications/` 中新建 Markdown。顶部两条 `---` 之间填写元信息，第二条 `---` 下方写正文，与文章、演讲和教学记录的流程相同。

```markdown
---
title: "论文标题"
collection: publications
category: preprints
date: 2026-10-11
venue: "arXiv (preprint)"
excerpt: "论文的一句话简介。"
---

## 研究内容

这里写论文背景、方法介绍和研究记录。
```

列表保留紧凑图文格式，直接显示作者、单位、方法图、简介和下载链接；点击标题进入站内正文页。正文页自动显示 `authors`、`affiliations` 和 `method_figure`，无需在正文中重复填写它们。`link` 用于正文页的论文原文按钮；`paperurl`、`bibtexurl` 和 `slidesurl` 提供资料下载。

已有论文的 Markdown 可作为完整字段示例。未填写的可选字段会自动省略。普通新增论文不必填写 `permalink`，站点会自动生成地址；已有固定地址的记录可继续保留。论文分类与日期只控制列表分组和排序，正文内容写在元信息下方。

所有内容栏目（Publications、Talks、Teaching、Portfolio、Blog Posts）的列表标题都进入站内正文页。外部原文、视频、项目仓库与附件通过正文或独立资料链接访问。

## 新建项目（Portfolio）

完整项目位于 `_posts/领域/项目名/`，保留各自独立的 `.git` 和源码。博客发布文档也放在同一项目根目录，不必复制到另一份文章目录。例如：

```text
_posts/ai-infrastructure/sextant/
├── .git/                         # Sextant 自己的 Git
├── integrated/                   # 项目源码
├── README.md                     # 项目说明，不入博客
├── handoff.md                    # 开发交接，不入博客
└── 2026-10-20-sextant.md          # 博客发布文档
```

当前登记的 25 个独立项目工作目录见 [_data/project-workspaces.json](_data/project-workspaces.json)，包含个人仓库、学习 Fork 及 Narwhal-Lab、CloudEver-Team 的参与项目。博客本身已经是当前仓库，无需在内部再次克隆。博客仓库整目录忽略项目源码，发布工具只将明确选定的文章作为普通文件加入博客 Git，不使用子模块。新克隆博客只含公开文档；需要完整源码时在根目录运行：

```powershell
./sync-projects.ps1 -Download
```

下载只做拉取与快进更新，不推送项目代码；发现未提交修改、分支不符或文档冲突时保留现状。第三方依赖、子模块和 Git LFS 大文件不自动安装或初始化。

### 项目文章的发布条件

同时满足：在清单登记的项目**根目录**，命名为 `YYYY-MM-DD-小写英文短名.md`，顶部有非空 `title` 且明确填写 `published: true`。例如 `2026-10-20-sextant.md`。项目内部 `docs/`、依赖、README、handoff 和其他文件都不会自动收录。

开发期间使用 `published: false`，当前新建介绍默认都是草稿。普通文章目录继续沿用上方原规则；这里的显式发布开关仅针对项目工作目录。

项目文章模板：

```markdown
---
title: "My Project"
date: 2026-10-20
published: false
permalink: /portfolio/my-project/
project_page: true
layout: portfolio
project_order: 80
project_type: "Open-source tool"
project_status: "Code available"
repository: "https://github.com/你的用户名/你的仓库"
technologies:
  - Python
  - Linux
tags: [Python, Linux]
excerpt: "用一两句话说明项目解决的问题和已经实现的能力。"
---

## Background

说明使用场景和项目目标。

## Implementation

说明架构、关键设计和你的具体工作；有依据时加入源码、演示和结果。

## Usage

说明运行条件和使用方法。
```

`project_order` 从小到大决定列表顺序；`project_type`、`project_status` 和 `technologies` 是展示文字，可按项目实际情况填写。只有提纲的仓库可以标为 `README only`。没有证据的职责、性能和用户数据不要填写；现有源码链接和开发记录可作为依据。

`project_page: true` 让已发布文章同时出现在 Portfolio；Blog Posts 仍按实际领域/项目路径组织。固定 `permalink` 决定网址，搬动文件时可保持地址。原有 7 篇项目介绍已保留原 `/portfolio/.../` 地址。

Portfolio 也收录有实际提交记录的团队项目和个人学习实现，并提供 Contribution 链接指向具体提交。证据保存在 `_data/project-contributions.json`；同一项目的上游仓库与个人 Fork 合并展示，没有个人改动的学习 Fork 暂只保留在本地。私有项目的文档继续保持草稿。博客自身的项目介绍位于仓库根目录 `2026-10-21-personal-blog.md`，通过同一 `project_page` 标记加入 Portfolio。

填写 GitHub `repository` 链接后，Portfolio 列表和项目详情会显示可点击的 Star 数量。页面保留 `_data/github-stars.json` 中的已核实数量作为初始显示，并通过 GitHub 公开接口刷新；浏览器缓存一小时，请求失败时保留已有数字并等待十五分钟后再尝试。新项目尚未获取到数量时显示 `—`，不会将未知数量写成零。

正文配图放到博客已有 `images/projects/项目名/` 或 `images/portfolio/`，使用绝对站内路径；项目源码内的图片不会顺带发布。下载源码不自动发表 README 或开发笔记。

准备公开时将 `published` 改为 `true`，运行：

```powershell
./sync-projects.ps1 -Stage
./sync-projects.ps1 -Check
```

`-Stage` 只同步项目公开 Markdown 到博客暂存区，保留项目外已有暂存内容；不会提交或推送。文章在子项目的本地 `.git/info/exclude` 中精确排除，源码继续由项目自己的仓库维护。确认博客改动后，正常提交并推送博客仓库，线上才会更新。撤下文章时改为 `published: false` 并再次运行 `-Stage`。

新增、修改或撤下项目文章后，重新运行预览入口以载入白名单和最新正文；项目源码目录被排除在 Jekyll 的普通文件监听之外。清单新增仓库时，也需要将其纳入下载器的允许范围并在博客 `.gitignore` 排除其源码目录。

## 本地预览

当前 Windows 电脑已准备好 Ruby 和依赖。在博客目录的终端运行：

```powershell
./start-preview.ps1
```

打开 http://127.0.0.1:4000/ 。启动和重新生成全部文章需要几十秒。保存文章、页面或样式后会自动重新生成，浏览器刷新即可查看；修改 `_config.yml` 后需要重启预览。

根启动器会先生成 `local/project-docs-config.yml`，再加载站点、本地及项目发布配置。完整源码共处时请使用该入口；不要绕过项目白名单启动预览。`./start-preview.ps1 -BuildOnly` 仅生成站点。旧 `local/start-preview.ps1` 已代理到根入口。

本地读取器会在遍历前跳过清单中的完整源码目录，只读取白名单选中的项目文章，避免源码归档的超长路径影响 Windows 预览。发布后的文章、页面和资源还会再次接受发布边界检查。

当前 Ruby 所需的表情符号兼容处理已包含在受版本控制的根启动器中。换电脑时需安装 Ruby、Bundler 和 `Gemfile` 依赖；源码下载与文档工具本身只依赖 Ruby 标准库及 Git。

本地保存只更新当前电脑的预览；提交并推送到 GitHub 后，线上博客才会更新。

## 本次清理

| 已移除的目录或内容 | 原用途及移除原因 |
| --- | --- |
| `_drafts/` 的模板示例 | 只有占位草稿，没有真实草稿 |
| `files/` 的示例文件 | 只有示例论文、幻灯片和 BibTeX，没有个人附件 |
| `markdown_generator/` | 模板的论文和演讲批量生成工具，目前未使用 |
| 旧 `scripts/` 工具 | 已移除工作时间统计和未使用的简历转换；现保留新的项目下载及文档发布工具 |
| `.github/` | 只有模板的反馈表单，没有部署流程 |
| `.devcontainer/`、Docker 配置 | 模板提供的容器开发方式，当前使用 Windows 本地预览 |
| 论文、演讲、教学的示例内容 | 保留页面和导航，个人记录按需添加 |
| 重复的页面、集合归档页 | 文章列表、项目列表和站点地图已提供对应入口 |
| 示例作者、评论、图片和主题截图 | 模板演示内容，没有用于个人博客 |
| 旧组件、样式和脚本 | 没有页面引用或已随对应功能移除 |

## 主题来源

基于 [Academic Pages](https://github.com/academicpages/academicpages.github.io)，其源自 [Minimal Mistakes](https://github.com/mmistakes/minimal-mistakes)。原主题的版权和 MIT 许可保留在 `LICENSE` 中。

### 官方功能更新

2026-10-11 合并核对了官方 master 的 [c089e79](https://github.com/academicpages/academicpages.github.io/commit/c089e79c7bce7ff453de525bc0bb80c261400cf6)。官方来源配置为 `upstream`，个人博客仓库仍为 `origin`。

- 论文支持按 `_config.yml` 中的 `publication_category` 分组。在论文元信息中填写 `category: preprints` 可放入 Preprints；漏填或使用未配置分类的论文仍会显示在 Other Publications。
- Publications 列表采用紧凑图文布局，直接显示 `authors`（作者及单位编号）、`affiliations`（编号到单位的对应关系）、`method_figure` 缩略图、`excerpt` 简介和 PDF/BibTeX 下载链接。每个 Markdown 顶部填写元信息，下方写正文；标题进入站内正文页，`link` 用于正文页的原文按钮。这篇论文的 Markdown 可作为新论文示例，未填写的可选字段自动省略。
- Plotly 3.6 图表和 Mermaid 按需加载，MathJax 更新为 4.0；独立加载图标样式，保留本站配色和布局。
- 恢复 JSON CV 的模板支持，当前 CV 继续使用 `_pages/cv.md`；未启用示例履历或新增 CV 入口。
- 保留文章的物理目录、标签检索、固定旧地址、个人信息、七个导航栏目和本地预览脚本。

官方主题代码与本站定制需要逐项合并。不要用官方 `_config.yml`、`_pages/` 或示例内容覆盖个人文件。本次备份和核对记录位于 `local/upstream-update-20261011/`，不会上传。
