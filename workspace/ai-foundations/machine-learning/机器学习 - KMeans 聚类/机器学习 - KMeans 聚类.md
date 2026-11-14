---
title: "机器学习 - KMeans 聚类"
date: "2024-12-24 21:20:33 +0800"
categories:
  - "机器学习与深度学习"
tags:
  - "机器学习"
  - "kmeans"
  - "聚类"
series: "机器学习"
excerpt: "聚类完成后，只需看新数据离哪个聚类中心最近，就能判断它属于哪一组。数据点被划分为 K 个不同的组；如果不知道 K 的取值，可以逐个尝试，效果最好的就是合适的 K。像素被划分为不同的簇（特征值高度相似的像素构成一个簇）。依然是基于特征，不同的对象也有不同形式的特征表示。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/144678864"
csdn_article_id: "144678864"
migrated: true
---

{% raw %}

# KMeans 聚类

![图片](./assets/csdn-144678864/image-001-d3deac1c17.png)
## 图像分割
像素被划分为不同的簇（特征值高度相似的像素构成一个簇）。

![图片](./assets/csdn-144678864/image-002-beba2fd9dc.png)
## 社交网络分析与推荐系统
依然是基于特征，不同的对象也有不同形式的特征表示。
![图片](./assets/csdn-144678864/image-003-cc2cd436cd.png)
## 详细过程
数据点被划分为 K 个不同的组；如果不知道 K 的取值，可以逐个尝试，效果最好的就是合适的 K。

![图片](./assets/csdn-144678864/image-004-759cd127c1.png)
# 效果与用途
聚类完成后，只需看新数据离哪个聚类中心最近，就能判断它属于哪一组。
![图片](./assets/csdn-144678864/image-005-4bbd147c5c.png)
{% endraw %}
