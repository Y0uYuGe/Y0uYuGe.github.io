---
title: "密码学原理与技术 - 第三章 - 数据加密标准（DES）"
date: "2024-12-27 23:51:39 +0800"
categories:
  - "密码学"
tags:
  - "密码学"
  - "AES"
series: "密码学原理技术"
excerpt: "从 20 世纪 70 年代中期到 90 年代中期，DES 一直是主流的对称加密算法。由于 DES 使用的 56 位密钥已不再安全，后来研发出了高级加密标准（AES）来取代它。AES 使用更长的密钥（128、192、256 位），安全性更高。使用 56 位密钥的标准 DES 现在可以很容易地被“穷举密钥搜索”破解。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/144753308"
csdn_article_id: "144753308"
migrated: true
---

{% raw %}
# DES 的基本信息
DES 是一种对称分组密码
![图片](./assets/csdn-144753308/image-001-8789bc2b16.png)

# 分组密码的基本原理：混淆与扩散
![图片](./assets/csdn-144753308/image-002-f0a1c85c5a.png)
# 乘积密码
![图片](./assets/csdn-144753308/image-003-a88c77a17c.png)

# DES 算法
![图片](./assets/csdn-144753308/image-004-d337342b9c.png)
## DES 的 Feistel 网络

加密和解密的代码大部分相同；只需要把密钥编排中子密钥的顺序反过来即可
![图片](./assets/csdn-144753308/image-005-86018f97ee.png)
![图片](./assets/csdn-144753308/image-006-86ba2e8b7a.png)


在加密的最后阶段，第 16 轮结束后，左右两半（L16 和 R16）会再交换一次，交换后的结果再送入末置换（FP）
![图片](./assets/csdn-144753308/image-007-093c3230cf.png)

# 内部结构
## 初始置换与末置换
![图片](./assets/csdn-144753308/image-008-ab79398ed2.png)
![图片](./assets/csdn-144753308/image-009-63f57c3dba.png)
## f 函数
![图片](./assets/csdn-144753308/image-010-a64c3a42c3.png)
### 扩展函数 E
增强扩散性，因为单个比特的值可能出现在多个位置，对后续阶段的影响更大
![图片](./assets/csdn-144753308/image-011-7990a95ed5.png)
### 轮密钥加
![图片](./assets/csdn-144753308/image-012-cce876bb6a.png)
### DES 的 S 盒
非线性，并且能抵抗差分密码分析
非线性，并且能强力抵抗差分密码分析。无法分析明文与密文之间的关系，因为非线性的东西很难分析

这是一个增强混淆性的操作，使得明文与密文之间的关系无法被分析
![图片](./assets/csdn-144753308/image-013-047a650295.png)
![图片](./assets/csdn-144753308/image-014-72c81b328b.png)

### 置换 P
这同样增强了扩散性
![图片](./assets/csdn-144753308/image-015-acdfd7514c.png)
![图片](./assets/csdn-144753308/image-016-9604863bc0.png)

![图片](./assets/csdn-144753308/image-017-2c70a752b5.png)
## 密钥生成
![图片](./assets/csdn-144753308/image-018-956a6c4683.png)
![图片](./assets/csdn-144753308/image-019-f7f1b295df.png)

![图片](./assets/csdn-144753308/image-020-0ce9a765a5.png)
![图片](./assets/csdn-144753308/image-021-78eaa14732.png)

# 解密
![图片](./assets/csdn-144753308/image-022-6497cc1d81.png)

![图片](./assets/csdn-144753308/image-023-0feb153f09.png)

DES 的核心是 Feistel 网络

![图片](./assets/csdn-144753308/image-024-773a656fdb.png)
![图片](./assets/csdn-144753308/image-025-15b3867771.png)
在加密结束时，R 和 L 会在应用置换之前交换，所以再次加密时，此时进入 f 函数的是 L
![图片](./assets/csdn-144753308/image-026-f2afc90ff4.png)

# DES 的安全性
2 的 56 次方

![图片](./assets/csdn-144753308/image-027-440e877e3b.png)
## 三重 DES
遗留应用
![图片](./assets/csdn-144753308/image-028-1da09add9b.png)


##  DES 的替代方案
![图片](./assets/csdn-144753308/image-029-52281f9877.png)

# 总结

- 从 20 世纪 70 年代中期到 90 年代中期，DES 一直是主流的对称加密算法。
由于 DES 使用的 56 位密钥已不再安全，后来研发出了高级加密标准（AES）来取代它。AES 使用更长的密钥（128、192、256 位），安全性更高。
- 使用 56 位密钥的标准 DES 现在可以很容易地被“穷举密钥搜索”破解
- DES 对已知的分析攻击（如差分密码分析和线性密码分析）有相当强的抵抗力
- 为了增强 DES 的安全性，可以对数据连续应用三次 DES 加密，这被称为三重 DES（3DES）
3DES 提供了更高的安全性，目前尚没有已知的实用攻击能够有效破解 3DES。3DES 仍在某些对安全性要求很高的系统中使用，但它比 AES 慢
- 默认的对称加密算法：AES
 如今，“默认”的对称加密算法通常是 AES，因为它更安全、更高效
除了 AES 之外，当年进入 AES 评选最后一轮的其他几种候选算法（如 Serpent、Twofish 等）也被认为非常安全和高效
{% endraw %}
