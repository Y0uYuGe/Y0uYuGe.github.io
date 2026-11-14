---
title: "CTF-PWN：使用 patchelf 替换 libc 和 ld 的完整详细过程"
date: "2023-11-05 20:52:01 +0800"
categories:
  - "CTF 与 Pwn"
tags:
  - "网络安全"
  - "安全"
  - "系统安全"
  - "学习"
  - "Pwn"
  - "CTF"
series: "CTF Writeup"
excerpt: "ldd 可执行文件名：第一行不用管；第二行是 libc，libc 是 C 标准库；第三行是 ld，ld 是动态链接器。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/134234465"
csdn_article_id: "134234465"
migrated: true
---

{% raw %}
# 查看当前链接情况
```bash
ldd 可执行文件名
```
![图片](./assets/csdn-134234465/image-001-029b89d32b.png)
第一行不用管
第二行是 libc，libc 是 C 标准库
第三行是 ld，ld 是动态链接器

# 查看当前 libc 和 ld 的版本
![图片](./assets/csdn-134234465/image-002-46f3e97b2c.png)

# 查看正确对应的 libc 和 ld 版本
![图片](./assets/csdn-134234465/image-003-e5eb5fd8bf.png)
是 2.31-0ubuntu9.9，与当前的不一致

# 在 glibc-all-in-one 中下载对应或相近的版本
查看是否有对应版本
![图片](./assets/csdn-134234465/image-004-b620833db8.png)
下载
![图片](./assets/csdn-134234465/image-005-3a408d802b.png)

# 使用 patchelf 修改 libc 和 ld

```bash
patchelf --set-interpreter 新的ld文件的路径 当前程序名
```

``![图片](./assets/csdn-134234465/image-006-0fae858d96.png)
ld 已修改
![图片](./assets/csdn-134234465/image-007-fde4f7a674.png)

```bash
patchelf --replace-needed 原来第二行的==>前的libc名 新的libc文件的路径
```

![图片](./assets/csdn-134234465/image-008-79f0f47da8.png)
libc 已修改
![图片](./assets/csdn-134234465/image-009-d35bdb60f4.png)
# 测试程序能否正常运行
![图片](./assets/csdn-134234465/image-010-eeaabae07c.png)
{% endraw %}
