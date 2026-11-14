---
title: "现代密码学 | 公钥密码体制 | RSA 加密算法及其数学基础"
date: "2024-11-17 20:52:49 +0800"
categories:
  - "密码学"
tags:
  - "密码学"
  - "RSA"
excerpt: "枚举时，假设 x 之后，根据 (p+q)/2 > sqrt(a) 选取 q 的可能取值，使得当 q 等于 y 时，n=(x+y)*(x-y) 成立。如果 p-q 的绝对值较大，假设一个 p 值后需要枚举很多可能的 q 值才能找到正确的 p 和 q。低指数攻击利用中国剩余定理恢复出 m^e。不断加密，直到结果与 c 模 b 同余。共模攻击最终可以泄露明文。证明分为互素和不互素两种情况。所有情况下 e 和 n（公钥）都是已知的。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/143826008"
csdn_article_id: "143826008"
migrated: true
---

{% raw %}
   
# 公钥密码
[现代密码学 | 公钥密码体制概述](https://www.bilibili.com/video/BV1P34y1B72L?spm_id_from=333.788.videopod.sections&vd_source=a1be939c65919194c77b8a6a36c14a6e)

- 加密
   A 用 B 的公钥加密
   B 用 B 的私钥解密
   ![图片](./assets/csdn-143826008/image-001-238e2cb0a8.png)
- 认证 
A 用 A 的私钥加密
B 用 A 的公钥解密

![图片](./assets/csdn-143826008/image-002-aae8e1dda3.png)
- 加密 + 认证
 A 先用 A 的私钥加密，再用 B 的公钥加密
 B 先用 B 的私钥解密，再用 A 的公钥解密
 ![图片](./assets/csdn-143826008/image-003-bf15de9982.png)
# RSA 的数学基础
[现代密码学 | RSA 加密算法及其数学基础](https://www.bilibili.com/video/BV1gT4y117My/?spm_id_from=333.788.videopod.sections&vd_source=a1be939c65919194c77b8a6a36c14a6e)
![图片](./assets/csdn-143826008/image-004-96265389d6.png)

## 欧拉函数
![图片](./assets/csdn-143826008/image-005-17c2d6e6ea.png)
## 欧拉定理
![图片](./assets/csdn-143826008/image-006-382bd3d120.png)

## 模幂运算
![图片](./assets/csdn-143826008/image-007-7c30bf6d43.png)
![图片](./assets/csdn-143826008/image-008-d2eab9d4e8.png)


![图片](./assets/csdn-143826008/image-009-d17db16cfd.png)

![图片](./assets/csdn-143826008/image-010-dcf6622398.png)


求最大公约数
![图片](./assets/csdn-143826008/image-011-c08527bf34.png)
求乘法逆元
![图片](./assets/csdn-143826008/image-012-562f295360.png)



# RSA 加密算法

![图片](./assets/csdn-143826008/image-013-a828346b65.png)
证明

![图片](./assets/csdn-143826008/image-014-79ab92588d.png)

分为互素和不互素两种情况
![图片](./assets/csdn-143826008/image-015-f10ced5df3.png)
示例
![图片](./assets/csdn-143826008/image-016-2652c41a95.png)



# 针对 RSA 的攻击
所有情况下 e 和 n（公钥）都是已知的

枚举时，假设 x 之后，根据 (p+q)/2 > sqrt(a) 选取 q 的可能取值，使得当 q 等于 y 时，n=(x+y)*(x-y) 成立

如果 p-q 的绝对值较大，假设一个 p 值后需要枚举很多可能的 q 值，才能找到正确的 p 和 q
![图片](./assets/csdn-143826008/image-017-8f69b5286d.png)
不断加密，直到结果与 c 模 b 同余
![图片](./assets/csdn-143826008/image-018-8192bc7034.png)

共模攻击最终可以泄露明文

低指数攻击利用中国剩余定理恢复出 m^e
![图片](./assets/csdn-143826008/image-019-8e922c0f35.png)
{% endraw %}
