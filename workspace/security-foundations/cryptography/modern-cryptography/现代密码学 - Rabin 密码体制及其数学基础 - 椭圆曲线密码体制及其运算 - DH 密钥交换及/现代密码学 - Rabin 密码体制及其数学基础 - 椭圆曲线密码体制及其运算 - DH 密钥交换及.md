---
title: "现代密码学 | Rabin 密码体制及其数学基础 | 椭圆曲线密码体制及其运算 | DH 密钥交换及中间人攻击"
date: "2024-12-07 21:34:36 +0800"
categories:
  - "密码学"
tags:
  - "密码学"
excerpt: "求逆元就是求同一个 x 对应的另一个 y 值。加法的结果 = 两点连线的交点。n 可以先分解成两个素数再求解。椭圆曲线 = 椭圆 + 曲线。YA 和 YB 也是公开的。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/144312168"
csdn_article_id: "144312168"
migrated: true
---

{% raw %}
# 参考
[现代密码学 | Rabin 密码体制及其数学基础](https://www.bilibili.com/video/BV1cY411b7q2?spm_id_from=333.788.videopod.sections&vd_source=a1be939c65919194c77b8a6a36c14a6e)
[现代密码学 | 椭圆曲线密码体制及其运算](https://www.bilibili.com/video/BV1nu41197LJ?spm_id_from=333.788.videopod.sections&vd_source=a1be939c65919194c77b8a6a36c14a6e)
[现代密码学 | DH 密钥交换及中间人攻击](https://www.bilibili.com/video/BV1om4y1R7HY?spm_id_from=333.788.videopod.sections&vd_source=a1be939c65919194c77b8a6a36c14a6e)

突击密码学
# Rabin 密码体制及其数学基础


![图片](./assets/csdn-144312168/image-001-2eeea5af01.png)
## 中国剩余定理
![图片](./assets/csdn-144312168/image-002-45e6220923.png)
## 二次剩余
![图片](./assets/csdn-144312168/image-003-a7d12b300a.png)

n 可以先分解成两个素数再求解
![图片](./assets/csdn-144312168/image-004-42ceae4b6b.png)
## Rabin 密码体制
![图片](./assets/csdn-144312168/image-005-79022b2622.png)
## 例题

其他三个解同理可得
![图片](./assets/csdn-144312168/image-006-a10f0e258f.png)
# 椭圆曲线密码体制及其运算
## 原理
[公钥加密技术：ECC 椭圆曲线加密算法原理](https://www.bilibili.com/video/BV1BY411M74G/?spm_id_from=333.337.search-card.all.click&vd_source=a1be939c65919194c77b8a6a36c14a6e)
 椭圆曲线 = 椭圆 + 曲线 

- 椭圆曲线关于 x 轴对称
- 通过点 G 进行变换，变换次数等于私钥的值
- 变换方法：第一次：作点 G 的切线，将交点取对称点，再把对称点与 G 连线，将新的交点取对称点；其余 N 次：再次将当前对称点与 G 连线，取得到的交点并取对称点，与 G 连线，再将新的交点取对称点
![图片](./assets/csdn-144312168/image-007-43e6bac8d7.png)


![图片](./assets/csdn-144312168/image-008-229b5fdeb4.png)

![图片](./assets/csdn-144312168/image-009-16f78c161d.png)

##  运算规则
![图片](./assets/csdn-144312168/image-010-b3f5fd77b5.png)

## 加密和解密
![图片](./assets/csdn-144312168/image-011-80c5dc237d.png)
## 例题
加法的结果 = 两点连线的交点
![图片](./assets/csdn-144312168/image-012-689c4896d5.png)
如何计算 2G
![图片](./assets/csdn-144312168/image-013-3543318dad.png)

![图片](./assets/csdn-144312168/image-014-9b2a04af36.png)
![图片](./assets/csdn-144312168/image-015-52e602dad6.png)
![图片](./assets/csdn-144312168/image-016-703b33903c.png)
![图片](./assets/csdn-144312168/image-017-51bc124517.png)
求逆元就是求同一个 x 对应的另一个 y 值
![图片](./assets/csdn-144312168/image-018-e112c46735.png)
# DH 密钥交换及中间人攻击
![图片](./assets/csdn-144312168/image-019-70d155beb0.png)


YA 和 YB 也是公开的

![图片](./assets/csdn-144312168/image-020-13379c8ea2.png)
例题
![图片](./assets/csdn-144312168/image-021-624df65363.png)
## 中间人攻击
- 相当于 Alice 与 Darth 建立了 DH 交换，Darth 又与 Bob 建立了 DH 交换
![图片](./assets/csdn-144312168/image-022-b358cef55e.png)
- Alice 发送的消息可以被 Darth 解密
- Darth 也可以构造任意消息发送给 Bob
{% endraw %}
