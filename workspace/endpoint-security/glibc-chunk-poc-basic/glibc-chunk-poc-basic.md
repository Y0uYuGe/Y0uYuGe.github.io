---
title: glibc-chunk-poc-basic
excerpt: "通过简短的 C 语言示例和分配器笔记，介绍 glibc 堆行为、bin 操作以及不同版本的利用技术。"
project_type: 安全实践
project_status: 代码已公开
repository: https://github.com/Y0uYuGe/glibc-chunk-poc-basic
technologies: &id001
- C
- glibc
- GDB
- patchelf
date: '2026-10-20'
tags: *id001
---

## 背景

将一种技术简化为短小的分配序列，更容易理解 glibc 分配器的行为。本仓库收集了 C 语言概念验证程序，以及有关 chunk 元数据、分配器检查和调试的笔记。README 中注明了整个示例集所参考的已有堆利用资料。

## 实现与覆盖范围

源码目录按技术分类，包括 `unlink`、fastbin 双重释放、unsorted bin 和 large bin、堆块重叠，以及 tcache 操作。其他目录还研究了 IO 结构、退出处理及相关控制流目标。

下面两个简短示例展示了这种研究方式：

| 示例 | 代码展示的行为 |
| --- | --- |
| [`fastbin_double_free/2.23.c`](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/fastbin_double_free/2.23.c) | 重复释放及后续分配的序列，最后通过地址比较观察结果。 |
| [`tcache_poisoning/2.27.c`](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/tcache_poisoning/2.27.c) | 修改已释放的条目，然后进行分配并打印目标地址。 |

示例使分配序列紧贴所研究的行为，便于对照分配器源码阅读，并在调试器中检查内存，不会将机制隐藏在更大的目标程序中。

## 环境与复现

版本标签是理解示例所需的背景。针对 glibc 2.23 或 2.27 编写的程序，应在对应的分配器和动态加载器环境中分析；宿主机默认 libc 的行为可能不同。

[`tcache_poisoning/start`](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/tcache_poisoning/start) 脚本使用 GCC 调试信息编译，通过 `patchelf` 修改 libc 依赖和解释器，然后打开 GDB。脚本中的绝对路径 `/home/llk/...` 需要替换为本地对应路径。README 还介绍了如何添加分配器源码和调试信息。

## 开发历史与笔记

[阅读分配器笔记与参考资料](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/blob/main/README.md) · [浏览全部示例](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/tree/main) · [查看仓库提交记录](https://github.com/Y0uYuGe/glibc-chunk-poc-basic/commits/main/)
