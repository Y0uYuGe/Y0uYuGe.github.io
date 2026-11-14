---
title: "密码学原理与技术 - 第 7 章 - RSA 密码体制"
date: "2024-12-31 22:55:05 +0800"
categories:
  - "密码学"
tags:
  - "密码学"
  - "服务器"
  - "运维"
  - "RSA"
series: "密码学原理技术"
excerpt: "示例。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/144847661"
csdn_article_id: "144847661"
migrated: true
---

{% raw %}
# 总结
![图片](./assets/csdn-144847661/image-001-7934fa3e6a.png)

# RSA 密码体制
![图片](./assets/csdn-144847661/image-002-d4e580d9b5.png)
## 加密与解密
![图片](./assets/csdn-144847661/image-003-12a9a7baa6.png)
## 示例：小数字的 RSA

![图片](./assets/csdn-144847661/image-004-d89a03bf27.png)

## 密钥生成

![图片](./assets/csdn-144847661/image-005-be7c8b0e73.png)

# 实现方面
![图片](./assets/csdn-144847661/image-006-3f559b0667.png)
## 平方-乘算法（Square-and-Multiply）
![图片](./assets/csdn-144847661/image-007-6484e8ed6f.png)
![图片](./assets/csdn-144847661/image-008-a8f05ad64b.png)
示例
![图片](./assets/csdn-144847661/image-009-377125b955.png)

![图片](./assets/csdn-144847661/image-010-981b3b748f.png)
## 平方-乘算法的复杂度
![图片](./assets/csdn-144847661/image-011-5515ccf2c2.png)
![图片](./assets/csdn-144847661/image-012-6ce0124aca.png)
## 使用小公钥指数快速加密
![图片](./assets/csdn-144847661/image-013-221e1a56c1.png)

## 使用 CRT 快速解密
![图片](./assets/csdn-144847661/image-014-e23ad7c95a.png)
###  基于 CRT 的模幂运算的基本原理
![图片](./assets/csdn-144847661/image-015-703c2b3431.png)

![图片](./assets/csdn-144847661/image-016-8799b4a635.png)
####  CRT：第 1 步 – 变换
![图片](./assets/csdn-144847661/image-017-45705ee23a.png)
#### CRT：第 2 步 – 模幂运算
![图片](./assets/csdn-144847661/image-018-0820a01e8b.png)
#### CRT：第 3 步 – 逆变换
![图片](./assets/csdn-144847661/image-019-4df3547d1d.png)

### CRT 的复杂度
![图片](./assets/csdn-144847661/image-020-670520f436.png)
![图片](./assets/csdn-144847661/image-021-246ad05840.png)

# 寻找大素数

![图片](./assets/csdn-144847661/image-022-8f4e58e36d.png)
## 素性测试
![图片](./assets/csdn-144847661/image-023-f8440d8e21.png)
### 费马素性测试
![图片](./assets/csdn-144847661/image-024-d57153cc40.png)

### Miller-Rabin 测试
[https://zh.wikipedia.org/wiki/%E7%B1%B3%E5%8B%92-%E6%8B%89%E5%AE%BE%E6%A3%80%E9%AA%8C](https://zh.wikipedia.org/wiki/%E7%B1%B3%E5%8B%92-%E6%8B%89%E5%AE%BE%E6%A3%80%E9%AA%8C)

![图片](./assets/csdn-144847661/image-025-76013e8a06.png)
![图片](./assets/csdn-144847661/image-026-6b397d2fa6.png)


# 实践中的 RSA：填充
教科书式 RSA 不安全的方面
![图片](./assets/csdn-144847661/image-027-ad3cadc02e.png)
![图片](./assets/csdn-144847661/image-028-e8a5012ef2.png)
![图片](./assets/csdn-144847661/image-029-d251730694.png)
![图片](./assets/csdn-144847661/image-030-fa823bc695.png)


![图片](./assets/csdn-144847661/image-031-b00408e330.png)


实践中的 RSA
![图片](./assets/csdn-144847661/image-032-29977978e0.png)

最优非对称加密填充（OAEP）示例
![图片](./assets/csdn-144847661/image-033-7f15bd4b18.png)

 
![图片](./assets/csdn-144847661/image-034-d53ec5747b.png)

![图片](./assets/csdn-144847661/image-035-453fbdf180.png)


# 攻击与对策
针对密码体制的攻击有两种不同类型：

- 分析攻击试图破解 RSA 所依赖的数学难题的结构。
- 实现攻击针对现实中的实现，利用 RSA 在软件或硬件中实现方式所固有的弱点。

## 分析攻击

![图片](./assets/csdn-144847661/image-036-19d04de080.png)

![图片](./assets/csdn-144847661/image-037-d721fa1a2a.png)
![图片](./assets/csdn-144847661/image-038-3ae500a2f6.png)


## 实现攻击

![图片](./assets/csdn-144847661/image-039-5e8f1b9737.png)
![图片](./assets/csdn-144847661/image-040-04e1c335f0.png)
{% endraw %}
