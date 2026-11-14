---
title: "从零构建 RISC-V 操作系统 12 - 定时器中断"
date: "2024-04-17 22:04:35 +0800"
categories:
  - "操作系统与体系结构"
tags:
  - "risc-v"
  - "单片机"
  - "嵌入式硬件"
excerpt: "我们实现的初始化根据 hartid 给对应的 mtimecmp 设置一个初始值，然后设置一些中断使能位。mtime 按一定频率递增，当它大于等于 mtimecmp 时就会产生定时器中断。通过读取当前时间和此时的 tick 值计算出最新的当前时间。MTIP 是 mip 中 M 模式下表示当前是否正在发送定时器中断的位。硬件定时器的周期：多久触发一次定时器中断。MTIE 是 mie 中 M 模式的定时器中断使能位。类似计数器，按照硬件对应的固定频率递增。上电后自动复位为 0，由硬件自动完成。产生软件中断和定时器中断。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/137860421"
csdn_article_id: "137860421"
migrated: true
---

{% raw %}

# CLINT
产生软件中断和定时器中断
![图片](./assets/csdn-137860421/image-001-75c092d92c.png)
# 定时器中断

![图片](./assets/csdn-137860421/image-002-a4d828436a.png)
# mtime
类似计数器，按照硬件对应的固定频率递增

上电后自动复位为 0，由硬件自动完成
![图片](./assets/csdn-137860421/image-003-5170eb1d7b.png)

# mtimecmp
 需要手动设置，同样是 64 位
我们实现的初始化根据 hartid 给对应的 mtimecmp 设置一个初始值，然后设置一些中断使能位
![图片](./assets/csdn-137860421/image-004-cf0e44121a.png)
# 机制
mtime 按一定频率递增，当它大于等于 mtimecmp 时，就会产生定时器中断

MTIE 是 mie 中 M 模式的定时器中断使能位
MTIP 是 mip 中 M 模式下表示当前是否正在发送定时器中断的位
![图片](./assets/csdn-137860421/image-005-b40b5c229e.png)
# 总体框架流程
![图片](./assets/csdn-137860421/image-006-7ab2e7b7b6.png)
# 时钟节拍（Time Tick）
硬件定时器的周期：多久触发一次定时器中断
![图片](./assets/csdn-137860421/image-007-61406e1269.png)
# 系统时钟
通过读取当前时间和此时的 tick 值，计算出最新的当前时间
![图片](./assets/csdn-137860421/image-008-d96fdc942a.png)

# 代码

[https://github.com/FULLK/risllkos/tree/main/Fullkenerl7](https://github.com/FULLK/risllkos/tree/main/Fullkenerl7)
{% endraw %}
