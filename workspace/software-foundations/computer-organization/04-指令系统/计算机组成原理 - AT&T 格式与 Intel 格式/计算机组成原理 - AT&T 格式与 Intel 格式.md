---
title: "计算机组成原理 - AT&T 格式与 Intel 格式"
date: "2023-12-14 12:27:55 +0800"
categories:
  - "操作系统与体系结构"
tags:
  - "计算机组成原理"
excerpt: "在 Intel 格式中，从主存地址取内容时若未指定长度，默认为 32 位，对应下图第四行右侧的指令。x86 汇编语言使用 Intel 格式，另一种汇编语言格式是 AT&T。它可以用来访问结构体数组中某个结构体元素内的一个成员。百分号、美元符号、括号。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/134961857"
csdn_article_id: "134961857"
migrated: true
---

{% raw %}
x86 汇编语言使用 Intel 格式，另一种汇编语言格式是 AT&T
## AT&T 格式与 Intel 格式
![图片](./assets/csdn-134961857/image-001-816ca10471.png)
在 Intel 格式中，从主存地址取内容时若未指定长度，默认为 32 位，对应下图第四行右侧的指令
百分号、美元符号、括号
   ![图片](./assets/csdn-134961857/image-002-8ebe6daf5e.png)
   它可以用来访问结构体数组中某个结构体元素内的一个成员
![图片](./assets/csdn-134961857/image-003-3e7af6dd41.png)
{% endraw %}
