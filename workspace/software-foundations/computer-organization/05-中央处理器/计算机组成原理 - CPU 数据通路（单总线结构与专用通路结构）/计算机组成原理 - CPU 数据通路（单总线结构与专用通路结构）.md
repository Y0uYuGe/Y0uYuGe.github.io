---
title: "计算机组成原理 - CPU 数据通路（单总线结构与专用通路结构）"
date: "2023-12-18 21:06:10 +0800"
categories:
  - "操作系统与体系结构"
tags:
  - "计算机组成原理"
excerpt: "专用数据通路有多个输入，哪个输入信号生效可以通过多路选择器控制，或者在每个输入上加一个三态门来控制。ALU 也可以什么都不做，让信号原样通过（可以理解为给数加零，结果不变）。像 C1 这样的接口连接到 CU，由 CU 发出控制信号使其有效或无效（能否通过）。第二问可以加上 (PC)+1—>PC，然后 Op(IR)—>微操作信号发生器。(PC)+1—>PC 也可以加在 (MDR)—IR 之后。MDR 与主存之间是双向的（既能读也能写）。把 IR 中的形式地址送到 MAR。把 IR 中的形式地址送到 MAR。把 IR 中的形式地址送到 MAR。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/135069833"
csdn_article_id: "135069833"
migrated: true
---

{% raw %}
# 数据通路
![图片](./assets/csdn-135069833/image-001-735eca5f20.png)

## CPU 内部单总线方式
 同一时刻，一条总线只能支持一对部件之间的数据交换
![图片](./assets/csdn-135069833/image-002-d01a9fdcc4.png)

连接 CPU 与各寄存器的 in 和 out 线，用来控制其是输入还是输出
Y 与 ALU 之间有专用数据通路

每个时钟周期，CU 发出一组控制信号来实现一个微操作
![图片](./assets/csdn-135069833/image-003-42eeb90119.png)
![图片](./assets/csdn-135069833/image-004-ad907f8287.png)
### 例题
（）括号表示取括号内所指位置中存放的内容
指令译码可以理解为把 IR 的内容送入 CU
(PC)+1—>PC 也可以加在 (MDR)—IR 之后
![图片](./assets/csdn-135069833/image-005-0efc1f9281.png)
![图片](./assets/csdn-135069833/image-006-e18042e1a0.png)
这里 MAR 中仍然是 (R0)
 ![图片](./assets/csdn-135069833/image-007-0f503cdf0c.png)
### 小结
![图片](./assets/csdn-135069833/image-008-5d65051675.png)
## 专用数据通路方式
像 C1 这样的接口连接到 CU，由 CU 发出控制信号使其有效或无效（能否通过）
![图片](./assets/csdn-135069833/image-009-02b0ac79ea.png)
### 专用数据通路方式 - 取指周期
Op 取指令的操作码部分
![图片](./assets/csdn-135069833/image-010-aae76d0331.png)
### 专用数据通路方式 - 例题
  MDR 与主存之间是双向的（既能读也能写）
  MAR 与主存之间是单向的（只传送给主存）
  ![图片](./assets/csdn-135069833/image-011-6200ae7403.png)
![图片](./assets/csdn-135069833/image-012-6be5993f06.png)
第二问可以加上 (PC)+1—>PC，然后 Op(IR)—>微操作信号发生器
![图片](./assets/csdn-135069833/image-013-a5941124d0.png)
ALU 也可以什么都不做，让信号原样通过（可以理解为给数加零，结果不变）
默认主存地址已经在 MAR 中
![图片](./assets/csdn-135069833/image-014-e6d6672409.png)
默认指令已经在 IR 中
把 IR 中的形式地址送到 MAR
![图片](./assets/csdn-135069833/image-015-b14013be6b.png)
默认指令已经在 IR 中
把 IR 中的形式地址送到 MAR
![图片](./assets/csdn-135069833/image-016-ea765d8e41.png)
默认指令已经在 IR 中
把 IR 中的形式地址送到 MAR
![图片](./assets/csdn-135069833/image-017-3d4f57c4c8.png)
### 小结
专用数据通路有多个输入，哪个输入信号生效可以通过多路选择器控制，或者在每个输入上加一个三态门来控制
![图片](./assets/csdn-135069833/image-018-6837ea713b.png)
{% endraw %}
