---
title: "从零构建 RISC-V 操作系统 第2部分 - RISC-V 指令集架构简介"
date: "2023-12-02 21:58:22 +0800"
categories:
  - "操作系统与体系结构"
tags:
  - "risc-v"
excerpt: "接口规范：可以理解为一种标准。微架构：指令集架构的一种硬件实现；例如，如果两种硬件架构都能实现 x86，那么这两种硬件架构都可以称为微架构。CISC：X86。RISC：图中除此之外的全部。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/134757050"
csdn_article_id: "134757050"
migrated: true
---

{% raw %}
# ISA 基础介绍
## 什么是 ISA
接口规范：可以理解为一种标准
微架构：指令集架构的一种硬件实现；例如，如果两种硬件架构都能实现 x86，那么这两种硬件架构都可以称为微架构
![图片](./assets/csdn-134757050/image-001-633860245e.png)
##  为什么要设计 ISA
为上层软件提供一种抽象，建立规则与约束，使程序员不必关心具体的电路结构，也不必担心引发硬件故障
## CISC 与 RISC
![图片](./assets/csdn-134757050/image-002-f5338e49f3.png)
## ISA 的位宽
![图片](./assets/csdn-134757050/image-003-b528816910.png)
ISA 的位宽与指令的位宽无关（即不能说 32 位机器的指令必然是 32 位的）

## 知名 ISA 简介
![图片](./assets/csdn-134757050/image-004-579dd5ea11.png)
CISC：X86
RISC：图中除此之外的全部
# RISC-V 的历史与特点
![图片](./assets/csdn-134757050/image-005-7980018494.png)

![图片](./assets/csdn-134757050/image-006-a9d8a248d7.png)![图片](./assets/csdn-134757050/image-007-31ab825d49.png)

# RISC-V 的发展
![图片](./assets/csdn-134757050/image-008-7b0028ee2d.png)
![图片](./assets/csdn-134757050/image-009-fde31c808d.png)

# RISC-V ISA 命名规则
![图片](./assets/csdn-134757050/image-010-ac71522707.png)
RV32IMA：32 位，I 模块，M 模块，A 模块
# 模块化 ISA
![图片](./assets/csdn-134757050/image-011-8b1ed699e7.png)
![图片](./assets/csdn-134757050/image-012-dde93b2895.png)
无论是 32 位还是 64 位 RISC-V，指令都是 32 位的，而使用压缩指令集时指令为 16 位
![图片](./assets/csdn-134757050/image-013-7a0c51f0f8.png)
# 通用寄存器
![图片](./assets/csdn-134757050/image-014-9a601a9792.png)
# Hart
一个 CU：一条指令流
一个 Hart 相当于一条指令流
![图片](./assets/csdn-134757050/image-015-69d9e641d4.png)
# 特权级别
![图片](./assets/csdn-134757050/image-016-cd0666211c.png)
# 控制状态寄存器（CSR）
![图片](./assets/csdn-134757050/image-017-629fd0b34a.png)
# 内存管理与保护
Lock：无法使用
![图片](./assets/csdn-134757050/image-018-b072a9f8bf.png)
# 异常与中断
异常会跳转到异常处理程序，执行结束后返回继续执行原来的指令
中断同样会跳转到中断处理程序，执行结束后返回执行原指令的下一条指令
![图片](./assets/csdn-134757050/image-019-15bde5bfbf.png)
{% endraw %}
