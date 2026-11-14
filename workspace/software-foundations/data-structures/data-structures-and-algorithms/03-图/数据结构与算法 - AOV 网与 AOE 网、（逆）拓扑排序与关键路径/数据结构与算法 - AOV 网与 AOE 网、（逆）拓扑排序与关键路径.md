---
title: "数据结构与算法 - AOV 网与 AOE 网、（逆）拓扑排序与关键路径"
date: "2023-12-17 16:49:19 +0800"
categories:
  - "项目笔记"
tags:
  - "数据结构"
  - "算法"
excerpt: "然后开始出栈，直到栈空为止；每个出栈的顶点保存到输出数组中，把它所指向的顶点的入度减 1，并在此过程中把入度变为零的顶点压入栈中。所有活动的最迟发生时间必须由活动的执行时间和所有事件的最迟发生时间推导得出。所有事件的最迟发生时间并不等于所有活动的最迟发生时间。缩短到一定程度之后，再继续缩短就无法再缩短整个工程的工期了。所有事件的最早发生时间就是所有活动的最早发生时间。如果当前网中不存在没有前驱的顶点，则说明存在环。它必须是 DAG（有向无环图）；先把入度为 0 的顶点压入栈中。沿着关键路径反向推导。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/135045109"
csdn_article_id: "135045109"
migrated: true
---

{% raw %}
# AOV 网
它必须是 DAG（有向无环图）
![图片](./assets/csdn-135045109/image-001-def1b272eb.png)
# 拓扑排序
![图片](./assets/csdn-135045109/image-002-0bb89bea3c.png)
![图片](./assets/csdn-135045109/image-003-17ae014c8a.png)
排序后的序列并不唯一
如果当前网中不存在没有前驱的顶点，则说明存在环
![图片](./assets/csdn-135045109/image-004-5b5901dd0d.png)
![图片](./assets/csdn-135045109/image-005-f6a5aa85d5.png)
# 代码实现
这里使用邻接表进行存储
先把入度为 0 的顶点压入栈中
然后开始出栈，直到栈空为止；每个出栈的顶点保存到输出数组中，把它所指向的顶点的入度减 1，并在此过程中把入度变为零的顶点压入栈中 
![图片](./assets/csdn-135045109/image-006-cd1dd201de.png)
## 时间复杂度
![图片](./assets/csdn-135045109/image-007-48463e55e4.png)
# 逆拓扑排序
![图片](./assets/csdn-135045109/image-008-62ba4cd31e.png)
## 实现
逆邻接表
![图片](./assets/csdn-135045109/image-009-a17b996c4c.png)
## 用 DFS 算法实现逆拓扑排序
 ![图片](./assets/csdn-135045109/image-010-e767023061.png)
![图片](./assets/csdn-135045109/image-011-901f50e168.png)
## 总结
![图片](./assets/csdn-135045109/image-012-7429f15560.png)
# AOE 网
![图片](./assets/csdn-135045109/image-013-c9ebbb9df5.png)
![图片](./assets/csdn-135045109/image-014-7d5a4fa0c2.png)
## 关键路径
下图中用红色标出了关键路径
![图片](./assets/csdn-135045109/image-015-78c3b3f42f.png)
![图片](./assets/csdn-135045109/image-016-1b2dd3509b.png)
沿着关键路径反向推导
![图片](./assets/csdn-135045109/image-017-d72076592b.png)
![图片](./assets/csdn-135045109/image-018-969ab8057a.png)
## 求关键路径
所有事件的最早发生时间就是所有活动的最早发生时间
所有事件的最迟发生时间并不等于所有活动的最迟发生时间
所有活动的最迟发生时间必须由活动的执行时间和所有事件的最迟发生时间推导得出
![图片](./assets/csdn-135045109/image-019-4e24fe4045.png)
### 求事件的最早发生时间
![图片](./assets/csdn-135045109/image-020-45421bd09f.png)
### 求事件的最迟发生时间
![图片](./assets/csdn-135045109/image-021-2b1979f2db.png)
### 求活动的最早发生时间
![图片](./assets/csdn-135045109/image-022-9fdcf4e261.png)
### 求活动的最迟发生时间
![图片](./assets/csdn-135045109/image-023-8691684e74.png)
### 求活动的时间余量
![图片](./assets/csdn-135045109/image-024-a918e9d633.png)
## 关键活动与关键路径的性质

缩短到一定程度之后，再继续缩短就无法再缩短整个工程的工期了

![图片](./assets/csdn-135045109/image-025-eeb8856592.png)
![图片](./assets/csdn-135045109/image-026-5fc2319aad.png)
## 总结
![图片](./assets/csdn-135045109/image-027-98e6c8cb0e.png)
![图片](./assets/csdn-135045109/image-028-c07a032bbf.png)
{% endraw %}
