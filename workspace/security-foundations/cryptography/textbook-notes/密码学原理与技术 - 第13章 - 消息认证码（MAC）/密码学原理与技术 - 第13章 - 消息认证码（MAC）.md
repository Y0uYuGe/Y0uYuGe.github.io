---
title: "密码学原理与技术 - 第13章 - 消息认证码（MAC）"
date: "2025-01-04 22:03:58 +0800"
categories:
  - "密码学"
tags:
  - "密码学"
  - "哈希算法"
  - "算法"
  - "哈希"
series: "密码学原理技术"
excerpt: "可以理解为对称形式的数字签名，但与数字签名之间仍有很多不同。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/144933553"
csdn_article_id: "144933553"
migrated: true
---

{% raw %}
# 概述
可以理解为对称形式的数字签名，但与数字签名之间仍有很多不同
![图片](./assets/csdn-144933553/image-001-e45fb0a586.png)

# MAC 的原理
![图片](./assets/csdn-144933553/image-002-9650c04a9b.png)

![图片](./assets/csdn-144933553/image-003-226475c802.png)

#  消息认证码的性质
![图片](./assets/csdn-144933553/image-004-c8f4c59169.png)
消息认证 = 数据源认证
# 消息认证码（MAC）的安全性
![图片](./assets/csdn-144933553/image-005-ea33bd448c.png)

# 基于哈希函数的 MAC
![图片](./assets/csdn-144933553/image-006-c1d47bd746.png)

前缀攻击：直接在原消息后面追加消息分组
![图片](./assets/csdn-144933553/image-007-dbe492dbc4.png)

后缀攻击：两个 x 产生碰撞，从而生成一个合法的消息和认证码
![图片](./assets/csdn-144933553/image-008-84b3115949.png)

#  HMAC
![图片](./assets/csdn-144933553/image-009-a9531ee12f.png)
这里的 h 是哈希函数

![图片](./assets/csdn-144933553/image-010-9e9a4535f6.png)
![图片](./assets/csdn-144933553/image-011-1380713a51.png)
这里的 h 可以理解为哈希函数中的压缩函数
# 基于分组密码的 MAC


![图片](./assets/csdn-144933553/image-012-e79cbc8d8b.png)


## CBC-MAC
![图片](./assets/csdn-144933553/image-013-f02170b11c.png)

 最后一步使用 k1 而不是 k 会更安全
 ![图片](./assets/csdn-144933553/image-014-a5971b7656.png)
![图片](./assets/csdn-144933553/image-015-291f9065bb.png)
{% endraw %}
