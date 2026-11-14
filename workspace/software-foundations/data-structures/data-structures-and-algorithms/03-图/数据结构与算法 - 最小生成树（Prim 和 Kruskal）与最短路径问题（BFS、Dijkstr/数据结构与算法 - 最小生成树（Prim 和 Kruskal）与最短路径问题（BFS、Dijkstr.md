---
title: "数据结构与算法 - 最小生成树（Prim 和 Kruskal）与最短路径问题（BFS、Dijkstra 和 Floyd）"
date: "2023-12-17 14:33:34 +0800"
categories:
  - "项目笔记"
tags:
  - "算法"
  - "数据结构"
  - "广度优先搜索"
excerpt: "先找到代价最低的节点；每有一个节点加入树中，都需要更新各个节点加入树的最低代价（即把原来的代价与各节点和新加入节点之间的代价比较）。比如 v2 到 v3 是基于经过 v1 中转的，但在允许经过 v2 中转的这一轮中，就把它视为连通的。然后顶点 6 出队，更新其邻接节点，并把各邻接节点入队。然后顶点 1 出队，其邻接节点入队，并更新各邻接节点。先访问顶点 2，然后是更新其邻接顶点后的结果。允许在 v0 v1 v2 v3 v4 中转。已经是基于之前在 v0 v1 中转的结果了。允许在 v0 v1 v2 v3 中转。同一个图的最小生成树可能不唯一。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/135039877"
csdn_article_id: "135039877"
migrated: true
---

{% raw %}
# 最小生成树
## 概述
![图片](./assets/csdn-135039877/image-001-1fde210a5b.png)
## 生成树
![图片](./assets/csdn-135039877/image-002-e760e7d80a.png)
## 广度优先生成树
![图片](./assets/csdn-135039877/image-003-398b78cec4.png)

## 深度优先生成树
![图片](./assets/csdn-135039877/image-004-108718ed6a.png)
## 最小生成树
适用于带权连通图
![图片](./assets/csdn-135039877/image-005-ebd1f461d0.png)
![图片](./assets/csdn-135039877/image-006-440f7e9496.png)
![图片](./assets/csdn-135039877/image-007-d6dfdf4507.png)
## Prim 算法
同一个图的最小生成树可能不唯一

从城市 P 出发
![图片](./assets/csdn-135039877/image-008-cd8e12a977.png)
![图片](./assets/csdn-135039877/image-009-11e25f78dc.png)

从农场出发也是一样
![图片](./assets/csdn-135039877/image-010-0b7f9b9d75.png)
## Kruskal 算法
![图片](./assets/csdn-135039877/image-011-157ab00866.png)
## Prim 与 Kruskal 对比
![图片](./assets/csdn-135039877/image-012-7a3e58803a.png)
### Prim 的实现
先找到代价最低的节点；每有一个节点加入树中，都需要更新各个节点加入树的最低代价（即把原来的代价与各节点和新加入节点之间的代价比较）
![图片](./assets/csdn-135039877/image-013-a8732c04c8.png)

### Kruskal 的实现
查找并查集的根（如果用二叉树实现）需要 log2E
![图片](./assets/csdn-135039877/image-014-3da74641fa.png)
## 小结
![图片](./assets/csdn-135039877/image-015-f31ecddf55.png)
# 最短路径问题
![图片](./assets/csdn-135039877/image-016-570241421c.png)

## 单源最短路径问题
### BFS 求无权图的单源最短路径
先访问顶点 2，然后是更新其邻接顶点后的结果
![图片](./assets/csdn-135039877/image-017-c5839f9521.png)
然后顶点 1 出队，其邻接节点入队，并更新各邻接节点
![图片](./assets/csdn-135039877/image-018-9c5d38a02c.png)
然后顶点 6 出队，更新其邻接节点，并把各邻接节点入队
![图片](./assets/csdn-135039877/image-019-5102d324aa.png)
顶点 5 没有邻接节点
所以接着处理顶点 3
![图片](./assets/csdn-135039877/image-020-92a709a550.png)
处理顶点 7
![图片](./assets/csdn-135039877/image-021-dc41fdf159.png)
顶点 4 和 8 的邻接节点都已被访问过，所以不做处理
### 小结
![图片](./assets/csdn-135039877/image-022-813e70e876.png)

### Dijkstra 算法
BFS 的局限性（默认每条路径长度相同）
![图片](./assets/csdn-135039877/image-023-61d82637c2.png)
初始化之后，即更新初始节点及其邻接节点
![图片](./assets/csdn-135039877/image-024-cda1a50320.png)
第一轮之后
![图片](./assets/csdn-135039877/image-025-41ea325500.png)
第二轮之后
![图片](./assets/csdn-135039877/image-026-44ccbd1e50.png)

第三轮之后
![图片](./assets/csdn-135039877/image-027-4b9c6aa0e3.png)
第四轮之后

![图片](./assets/csdn-135039877/image-028-c7bc238506.png)
求两个顶点之间的最短路径
![图片](./assets/csdn-135039877/image-029-80c7aeda9b.png) 
#### 算法时间复杂度
![图片](./assets/csdn-135039877/image-030-8990a17436.png)

![图片](./assets/csdn-135039877/image-031-5e3632e5ce.png)
#### 不适用的情况
![图片](./assets/csdn-135039877/image-032-5336b6aaee.png)


## 各顶点间的最短路径问题
![图片](./assets/csdn-135039877/image-033-903f28f519.png)

### Floyd 算法
初始时
![图片](./assets/csdn-135039877/image-034-abf0a6a015.png)
  允许在 v0 中转
  ![图片](./assets/csdn-135039877/image-035-b7d7ce2ec0.png)
  允许在 v0 v1 中转
![图片](./assets/csdn-135039877/image-036-297dc2309c.png)
允许在 v0 v1 v2 中转
![图片](./assets/csdn-135039877/image-037-1384fbbb01.png)
#### 求两个顶点之间的最短路径
![图片](./assets/csdn-135039877/image-038-d46ef46cd4.png)
#### 核心代码
空间复杂度为 n*n 的矩阵那么多
![图片](./assets/csdn-135039877/image-039-d5fb4b07d6.png)
#### 例子
初始状态
![图片](./assets/csdn-135039877/image-040-ab32cda70c.png)
允许在 v0 中转
发现没有变化
从图中可以看出 v0 没有入边，所以自然无法作为中转点
![图片](./assets/csdn-135039877/image-041-c1e6069c40.png)
允许在 v0 v1 中转
![图片](./assets/csdn-135039877/image-042-6e3fd23abd.png)
允许在 v0 v1 v2 中转
已经是基于之前在 v0 v1 中转的结果了
比如 v2 到 v3 是基于经过 v1 中转的，但在允许经过 v2 中转的这一轮中，就把它视为连通的
![图片](./assets/csdn-135039877/image-043-e314b9ceb5.png)
![图片](./assets/csdn-135039877/image-044-bc9d2bec15.png)
允许在 v0 v1 v2 v3 中转

![图片](./assets/csdn-135039877/image-045-874fb4345d.png)
允许在 v0 v1 v2 v3 v4 中转
![图片](./assets/csdn-135039877/image-046-6f5e0f565d.png)
#### 求两个顶点之间的最短路径
![图片](./assets/csdn-135039877/image-047-0a8859231c.png)
#### Floyd 用于负权图
 
![图片](./assets/csdn-135039877/image-048-52c1f2f462.png)
#### 无法解决的问题
回路越多，路径越短

![图片](./assets/csdn-135039877/image-049-61188b758d.png)
### 小结
BFS 用邻接矩阵是 V 的平方，用邻接表是 V+E
![图片](./assets/csdn-135039877/image-050-c9a9d40666.png)
{% endraw %}
