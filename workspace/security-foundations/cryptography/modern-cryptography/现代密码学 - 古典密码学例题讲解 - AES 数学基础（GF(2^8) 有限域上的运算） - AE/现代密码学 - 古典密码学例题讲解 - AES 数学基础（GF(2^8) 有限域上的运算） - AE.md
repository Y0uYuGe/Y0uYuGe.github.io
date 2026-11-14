---
title: "现代密码学 | 古典密码学例题讲解 | AES 数学基础（GF(2^8) 有限域上的运算）| AES 加密算法"
date: "2024-11-16 20:40:13 +0800"
categories:
  - "密码学"
tags:
  - "密码学"
  - "AES"
excerpt: "注意这里明文和密文都只有 4 个字母，而 A 是 2x2 矩阵，所以每次乘法只能处理明文中的两个字母，由此得到下面的方程。我参考了一位讲得很不错的 B 站 UP 主；由于课程几乎没有作业，我就跟着 UP 主做题来学习。这里的运算规则正是 GF(2^8) 有限域上的运算。先大致了解一下总体加密过程，不过最后一轮没有列混合（MixColumns）这一步。明文分组和密钥分组都可以用一个 16 字节的矩阵表示。与子密钥矩阵（由密钥派生）做异或。根据字节变换找到对应的 x 和 y，然后进行替换。通过一定的运算由已有的密钥计算出子密钥。所乘的矩阵是固定的（已给定）。求逆元使用扩展欧几里得算法。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/143687320"
csdn_article_id: "143687320"
migrated: true
---

{% raw %}

# 古典密码学
[现代密码学｜古典密码学例题讲解](https://www.bilibili.com/video/BV1Qi4y1R7iw?spm_id_from=333.788.videopod.sections&vd_source=a1be939c65919194c77b8a6a36c14a6e)
我参考了一位讲得很不错的 B 站 UP 主；由于课程几乎没有作业，我就跟着 UP 主做题来学习

![图片](./assets/csdn-143687320/image-001-f74100ca4e.png)
## 凯撒密码与移位变换
![图片](./assets/csdn-143687320/image-002-7749c9c9e6.png)
## 仿射变换
![图片](./assets/csdn-143687320/image-003-a61481b9e8.png)
## 例题
求逆元使用扩展欧几里得算法
![图片](./assets/csdn-143687320/image-004-ad5fb3836f.png)


## 多表代换
![图片](./assets/csdn-143687320/image-005-1370ec9f59.png)
## 例题
![图片](./assets/csdn-143687320/image-006-0585af3d69.png)
注意同余的性质：两边做相同的加、减、乘运算之后，最后必须再取一次模


注意这里明文和密文都只有 4 个字母，而 A 是 2x2 矩阵，所以每次乘法只能处理明文中的两个字母，由此得到下面的方程
![图片](./assets/csdn-143687320/image-007-f9f0250911.png)

![图片](./assets/csdn-143687320/image-008-d564c76c63.png)
# AES 数学基础（GF(2^8) 有限域上的运算）
[现代密码学｜AES数学基础｜GF（2^8）有限域上的运算问题](https://www.bilibili.com/video/BV14i4y197iE?spm_id_from=333.788.videopod.sections&vd_source=a1be939c65919194c77b8a6a36c14a6e)

![图片](./assets/csdn-143687320/image-009-172caf914e.png)

## 多项式表示 | 加法 | 乘法

b 是系数
![图片](./assets/csdn-143687320/image-010-2456ec3aa0.png)
![图片](./assets/csdn-143687320/image-011-b5ef5da3ef.png) 

每次消去最高次项；最终次数不能大于或等于 8

![图片](./assets/csdn-143687320/image-012-89b6b23845.png)
## 乘以 X
  ![图片](./assets/csdn-143687320/image-013-e49791ea47.png)
## 模 x^4 + 1 乘法
  ![图片](./assets/csdn-143687320/image-014-61dc671ee8.png)
例题
![图片](./assets/csdn-143687320/image-015-3988b4fc93.png)

# AES 加密算法

[【AES加密算法】| AES加密过程详解](https://www.bilibili.com/video/BV1i341187fK/?spm_id_from=333.337.search-card.all.click&vd_source=a1be939c65919194c77b8a6a36c14a6e)

![图片](./assets/csdn-143687320/image-016-ce8387ffab.png)

![图片](./assets/csdn-143687320/image-017-fb3a6ee074.png)
明文分组和密钥分组都可以用一个 16 字节的矩阵表示
![图片](./assets/csdn-143687320/image-018-ce9fc0c3b7.png)
先大致了解一下总体加密过程；不过最后一轮没有列混合（MixColumns）这一步

![图片](./assets/csdn-143687320/image-019-3588188080.png)
## 初始变换
![图片](./assets/csdn-143687320/image-020-1612667048.png)
![图片](./assets/csdn-143687320/image-021-5d55df6697.png)
## 字节替换（SubBytes）
![图片](./assets/csdn-143687320/image-022-f0a106272c.png)
根据字节变换找到对应的 x 和 y，然后进行替换

![图片](./assets/csdn-143687320/image-023-11e494c118.png)
最终结果
![图片](./assets/csdn-143687320/image-024-2e48d8573b.png)
## 行移位（ShiftRows）
![图片](./assets/csdn-143687320/image-025-621cdcde07.png)
最终结果
![图片](./assets/csdn-143687320/image-026-5c58744160.png)
## 列混合（MixColumns）
所乘的矩阵是固定的（已给定）
  ![图片](./assets/csdn-143687320/image-027-bd7a6a0201.png)
![图片](./assets/csdn-143687320/image-028-2bca9675e6.png)

![图片](./assets/csdn-143687320/image-029-88f85e0aae.png)
这里的运算规则正是 GF(2^8) 有限域上的运算
![图片](./assets/csdn-143687320/image-030-0cd0da3863.png)


## 轮密钥加（AddRoundKey）
与子密钥矩阵（由密钥派生）做异或

![图片](./assets/csdn-143687320/image-031-eaaefce737.png)

总体流程如下
  ![图片](./assets/csdn-143687320/image-032-56117ba4de.png)
  
## 子密钥（密钥扩展）
通过一定的运算由已有的密钥计算出子密钥
![图片](./assets/csdn-143687320/image-033-835c770622.png)
![图片](./assets/csdn-143687320/image-034-c71641ee2e.png)
![图片](./assets/csdn-143687320/image-035-dbd19da442.png)
字循环
![图片](./assets/csdn-143687320/image-036-85d088f04d.png)
字节替换
![图片](./assets/csdn-143687320/image-037-85440d185c.png)


轮常量异或
 ![图片](./assets/csdn-143687320/image-038-f6b25af9cf.png)
![图片](./assets/csdn-143687320/image-039-41e9669f44.png)
## 例题
![图片](./assets/csdn-143687320/image-040-ecf61d7084.png)
![图片](./assets/csdn-143687320/image-041-cda92e5548.png)
[AES加密相关小题](https://blog.csdn.net/m0_74258307/article/details/141225240)
{% endraw %}
