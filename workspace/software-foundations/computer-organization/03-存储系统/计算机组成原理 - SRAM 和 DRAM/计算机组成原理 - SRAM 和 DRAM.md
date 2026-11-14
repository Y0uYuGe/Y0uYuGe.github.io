---
title: "计算机组成原理 - SRAM 和 DRAM"
date: "2023-11-08 12:57:10 +0800"
categories:
  - "操作系统与体系结构"
tags:
  - "学习"
excerpt: "DRAM 已被淘汰，现在的主存主要使用 SDRAM。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/134286252"
csdn_article_id: "134286252"
migrated: true
---

{% raw %}
  
# DRAM：动态随机存取存储器 Dynamic Random Access Merrory（主存）
#  SRAM：静态随机存取存储器 Static Random Access Memory（Cache）
# 两者的区别 
   
   ![图片](./assets/csdn-134286252/image-001-ce6d335386.png)![图片](./assets/csdn-134286252/image-002-f473149f51.png)
# 行地址和列地址
  地址的前半部分送入行地址译码器
  地址的后半部分送入列地址译码器
  这样可以减少连线数量
![图片](./assets/csdn-134286252/image-003-a5b0161daa.png)

# 刷新

破坏性读出：DRAM 存储元被读取时，信号会变为 0，原信号被破坏。SRAM 没有这个问题
易失性：DRAM 需要刷新（刷新周期为 2ms，以行为单位，每次刷新一行存储单元，与读写周期相同），因为电容会漏电。SRAM 不需要，因为只要供电，数据就不会改变

DRAM 的刷新由存储器独立完成，不需要 CPU 参与  
![图片](./assets/csdn-134286252/image-004-cdfa3a5201.png)
# DRAM 地址线复用
SRAM：行地址和列地址同时送出（集成度低）
DRAM：分两次送出（地址线和地址引脚数减半）
![图片](./assets/csdn-134286252/image-005-91ac5c6cdc.png)
# 总结
DRAM 已被淘汰，现在的主存主要使用 SDRAM
![图片](./assets/csdn-134286252/image-006-47e1d5d1bd.png)
{% endraw %}
