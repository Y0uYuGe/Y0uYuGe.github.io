---
title: "制作 RISC-V 操作系统 III - 编译与链接"
date: "2023-12-04 13:29:53 +0800"
categories:
  - "操作系统与体系结构"
tags:
  - "risc-v"
  - "linux"
  - "运维"
excerpt: "预处理：把 #define、#include 等以 # 开头的宏转换为标准 C。编译：C 变成机器指令。链接：把编译好的指令文件与其他库链接在一起。调试需要加入调试信息。建议亲手试一试，观察其中的差异，例如这个程序。可重定位文件：位置只有经过链接才能确定。核心转储文件：程序崩溃时的相关信息。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/134773149"
csdn_article_id: "134773149"
migrated: true
---

{% raw %}
# GCC
## GCC 简介
![图片](./assets/csdn-134773149/image-001-eff0bca772.png)
## GCC 命令格式
预处理：把 #define、#include 等以 # 开头的宏转换为标准 C
 编译：C 变成机器指令
 链接：把编译好的指令文件与其他库链接在一起
 调试需要加入调试信息

建议亲手试一试，观察其中的差异
 ![图片](./assets/csdn-134773149/image-002-ea907a7cae.png)
 例如这个程序
![图片](./assets/csdn-134773149/image-003-7afe88c9c0.png)
## gcc -E
对该文件进行预处理，并把结果输出到 .E 文件
![图片](./assets/csdn-134773149/image-004-8f4306e517.png)
打开 .E 文件
![图片](./assets/csdn-134773149/image-005-d8c0fb447d.png)
可以看到有很多代码，但最后的 main 函数没有变化。上面的代码就是把 #include<stdio.h> 转换成 C 代码的结果
## gcc -c
生成目标文件，但还没有链接
![图片](./assets/csdn-134773149/image-006-c9ac90481d.png)
![图片](./assets/csdn-134773149/image-007-bd6c029e2f.png)
## gcc -S
![图片](./assets/csdn-134773149/image-008-df3017efac.png)
打开 .S 文件查看，是汇编语言
![图片](./assets/csdn-134773149/image-009-23ae887f9e.png)
##  gcc -g 
![图片](./assets/csdn-134773149/image-010-002d895144.png)
## gcc -v
可以看到一长串相关信息
![图片](./assets/csdn-134773149/image-011-0bcda9bc7c.png)


## GCC 的主要执行步骤

> Linux mv（英文全称：move file）命令用来为文件或目录改名，或将文件或目录移入其他位置。

![图片](./assets/csdn-134773149/image-012-d86ecbc59b.png)
![图片](./assets/csdn-134773149/image-013-224ed91239.png)

cc1：预处理和编译
![图片](./assets/csdn-134773149/image-014-94259cffe4.png)
as：生成 .o 文件（机器指令）

![图片](./assets/csdn-134773149/image-015-22625ee8fc.png)
collect 中包含用于链接的 ld
把各种标准库与 .o 文件链接在一起
![图片](./assets/csdn-134773149/image-016-90c11e7d5e.png)

## GCC 涉及的文件类型
小写 s：不包含以 # 开头的代码
大写 S：仍包含以 # 开头的代码
可执行文件默认为 a.out
![图片](./assets/csdn-134773149/image-017-3af829aa71.png)
## 处理多个源文件
![图片](./assets/csdn-134773149/image-018-2a679a3ae6.png)
#  ELF
##  ELF 简介
可重定位文件：位置只有经过链接才能确定
核心转储文件：程序崩溃时的相关信息
![图片](./assets/csdn-134773149/image-019-561bd05294.png)
## ELF 文件格式
二进制
ELF Header：ELF 文件的基本信息（如运行在哪种架构上、版本号）
.text：程序的指令
.init：程序初始化的指令
4K 字节对齐
Program Header Table：运行时使用；决定哪些 section 组合成 segment，以及 segment 放在哪里
Section Header Table：section 的相关信息，如用于定位
![图片](./assets/csdn-134773149/image-020-59ea11d3b4.png)
## ELF 文件处理工具：Binutils（binary utility）
ar=tar：生成静态库时需要用到

![图片](./assets/csdn-134773149/image-021-562067d603.png)
### readlelf -h
查看文件头（ELF header）
![图片](./assets/csdn-134773149/image-022-7dfe816896.png)

 -  Magic：魔数；用处不大，只是给 ELF 一个特殊标记，以便与其他东西区分

-  Class：文件类型，64 位或 32 位
###  readelf -S 或 readelf  -SW（加 W 显示更宽）
查看 Section Header Table
PROGBITS：表示可执行
RELA：可重定位
![图片](./assets/csdn-134773149/image-023-831aff4c56.png)

### objdump -S
-S 在反汇编中显示源代码部分

此时反汇编结果中没有源代码部分
![图片](./assets/csdn-134773149/image-024-00b7bae77d.png)
用 -g 编译（生成调试信息）后再反汇编，就会发现源代码和汇编指令一起出现了
![图片](./assets/csdn-134773149/image-025-e3b16dac36.png)

# 练习 3-1
- 使用 gcc 编译代码，并使用 binutils 工具分析生成的目标文件和可执行文件（ELF 格式）。具体要求如下：
- 编写一个简单的打印 "hello world!" 的程序源文件：hello.c
在本机上编译该源文件，生成面向支持 x86_64 指令集架构处理器的目标文件 hello.o。
- 查看 hello.o 的文件头信息。
- 查看 hello.o 的 Section Header Table。
- 对 hello.o 反汇编，查看 hello.c 的 C 源代码与机器指令之间的对应关系。
# 练习 3-2
如下示例 C 代码

```c
#include <stdio.h>
int global_init = 0x11111111;
const int global_const = 0x22222222;
void main()
{
static int static_var = 0x33333333;
static int static_var_uninit;
int auto_var = 0x44444444;
printf("hello world!\n");
return;
}

```
- 编译成可执行文件后，变量 global_init、global_const、static_var、static_var_uninit、auto_var 分别存放在哪些 section 中？
- 字符串 "hello world!\n" 在哪里？尝试用工具查看并验证你的猜测
![图片](./assets/csdn-134773149/image-026-f18ee8b519.png)
![图片](./assets/csdn-134773149/image-027-019bf551d0.png)
 auto_var 变量和 "hello world!\n" 字符串在栈上，只有程序运行时才存在
 可以根据地址判断它属于哪个 section
 ![图片](./assets/csdn-134773149/image-028-ea1fc2857c.png)
![图片](./assets/csdn-134773149/image-029-6879769e4e.png)
{% endraw %}
