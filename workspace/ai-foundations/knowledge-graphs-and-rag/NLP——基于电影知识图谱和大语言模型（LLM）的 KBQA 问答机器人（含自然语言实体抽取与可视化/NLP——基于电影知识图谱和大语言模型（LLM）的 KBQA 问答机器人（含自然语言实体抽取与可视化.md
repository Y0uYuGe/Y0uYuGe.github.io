---
title: "NLP——基于电影知识图谱和大语言模型（LLM）的 KBQA 问答机器人（含自然语言实体抽取与可视化）"
date: "2024-12-16 11:44:55 +0800"
categories:
  - "NLP"
tags:
  - "自然语言处理"
  - "知识图谱"
  - "语言模型"
  - "LLM"
  - "NLP"
excerpt: "数据库：MySQL（存储聊天、用户和帖子信息）、Neo4j（存储图谱信息）。后端：Flask 蓝图。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/144499744"
csdn_article_id: "144499744"
migrated: true
---

{% raw %}

# 参考
[https://github.com/Xiaoheizi2023/NLP_KBQA](https://github.com/Xiaoheizi2023/NLP_KBQA)

# 可视化逻辑
- 抽取出实体后，在 Neo4j 中搜索与实体相关的图谱，然后返回数据进行可视化。
- 可视化工具：cytoscape.js
- 实体抽取逻辑：分词后与关键词进行比对。


# 运行
数据库：MySQL（存储聊天、用户和帖子信息）    Neo4j（存储图谱信息）
后端：Flask 蓝图
前端：经典三件套（HTML/CSS/JavaScript）


```bash
pip install -r requirements.txt
 
启动neo4j 和mysql，记得改用户名和密码

建立图谱和建立关键词表

flask-sqlalchemy通过命令行初始化生成mysql数据库

运行Flask服务器
```

# 演示

[video(video-BWGhm7aC-1734320640826)(type-csdn)(url-https://live.csdn.net/v/embed/439037)(image-https://i-blog.csdnimg.cn/img_convert/e997847ec3415f3cad0c6b611ef2c424.jpeg)(title-演示视频)]
{% endraw %}
