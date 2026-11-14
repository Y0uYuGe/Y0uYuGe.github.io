---
title: "操作系统——进程互斥的软件实现方法（单标志法、双标志先检查法、双标志后检查法、Peterson 算法）"
date: "2024-02-05 12:37:56 +0800"
categories:
  - "操作系统与体系结构"
tags:
  - "操作系统"
excerpt: "当进程 P0 的 while 循环执行到一半切换到进程 P1 时，P1 也会进入它的 while 循环；当进程 P1 的 while 循环执行到一半又切换回进程 P0 时，P0 的 while 循环仍会继续执行——就这样来回切换，但时钟都卡在各个进程的 while 循环里。这种方法会受下一个使用者的限制：如果下一个使用者一直不使用，那么当前这个也不能连续使用两次。让权等待：此时如果进程无法进入临界区，就会在 while 循环中卡住一段时间，浪费处理机资源。如果进程 A 打印到一半被切换到进程 B，那么打印的内容就会混在一起。注意 while 循环没有内容（它有一个 ;）。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/136038798"
csdn_article_id: "136038798"
migrated: true
---

{% raw %}
# 概述
![图片](./assets/csdn-136038798/image-001-709e4750cf.png)
# 如果没有进程互斥
如果进程 A 打印到一半被切换到进程 B，那么打印的内容就会混在一起。
![图片](./assets/csdn-136038798/image-002-3164cfbdbf.png)
# 单标志法
注意 while 循环没有内容（它有一个 ;）。
![图片](./assets/csdn-136038798/image-003-6752b7e2b3.png)
## 例子
小渣和老渣上厕所。

这种方法会受下一个使用者的限制：如果下一个使用者一直不使用，那么当前这个也不能连续使用两次。

![图片](./assets/csdn-136038798/image-004-eb0b970bd0.png)
# 双标志先检查法
![图片](./assets/csdn-136038798/image-005-c17157c6c1.png)
![图片](./assets/csdn-136038798/image-006-dd7e2534a9.png)
# 双标志后检查法
当进程 P0 的 while 循环执行到一半切换到进程 P1 时，P1 也会进入它的 while 循环；当进程 P1 的 while 循环执行到一半又切换回进程 P0 时，P0 的 while 循环仍会继续执行——就这样来回切换，但时钟都卡在各个进程的 while 循环里。

![图片](./assets/csdn-136038798/image-007-455d312a65.png)
# Peterson 算法
![图片](./assets/csdn-136038798/image-008-3c1f2c2f53.png)
让权等待：此时如果进程无法进入临界区，就会在 while 循环中卡住一段时间，浪费处理机资源。
![图片](./assets/csdn-136038798/image-009-87eccfa60e.png)
# 总结
![图片](./assets/csdn-136038798/image-010-302dda96c7.png)
{% endraw %}
