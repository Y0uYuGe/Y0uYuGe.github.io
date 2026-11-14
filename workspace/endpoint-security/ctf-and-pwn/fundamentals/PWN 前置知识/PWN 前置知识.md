---
title: "PWN 前置知识"
date: "2023-10-19 23:55:17 +0800"
categories:
  - "CTF 与 Pwn"
tags:
  - "网络安全"
  - "安全"
  - "系统安全"
  - "学习"
  - "Pwn"
series: "CTF Writeup"
excerpt: "这说明字符串是按从左到右、地址从低到高的顺序存储的；gdb 显示的是经过小端序转换后的编码。字符串 \"\\x41\" 会直接以 41 存储在对应位置，即该位置的内容编码为 41。2f：是 / 的 ASCII 码。62：是 b 的 ASCII 码。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/133937275"
csdn_article_id: "133937275"
migrated: true
---

{% raw %}
# 发送后编码的存储方式

> 对于某个地址
在 gdb 中执行：
x/30xg 0x603290
0x6032c0：0x0068732f6e69622f   /bin/sh
2f：是 / 的 ASCII 码
然后执行：
x/30xg 0x6032c1
0x6032c1:	0x000068732f6e6962  bin/sh
62：是 b 的 ASCII 码

> 这说明字符串是按从左到右、地址从低到高的顺序存储的；gdb 显示的是经过小端序转换后的编码

> 字符串 "\x41" 会直接以 41 存储在对应位置，即该位置的内容编码为 41

# exp 脚本

```python
 导入模块
 根据个人情况
 
 context(os='linux', arch='amd64', log_level='debug')
 即设置运行该脚本的操作系统为linux，架构为64为，log_level设置日志输出的等级为debug,会显示交互中的输入与输出
 
 连接
 remote("主机名",端口号)远程
 process("文件位置")本地
 
 elf文件
 e=ELF（文件位置）
 e.address 
 e,symbols[]
 e.got[]
 e.plt[]
 e.search()._next_()
 搜索一个字符串并返回其所在地址 python3里字符串前面必须加上b''
 
 数据处理
 p32/p64: 处理一个整数,将其转变为十六进制 为32或64位 
 u32/u64: 处理字节为32位或64位,将其转变为整数
 
 u64(data.split(b"\n")[0].ljust(8, b"\x00"))
 ljust是左对齐，shellcode后面用A来填充垃圾数据，记得如果ljust是对字节操作记得加 b
 发送接受
 send sendline sendafter sendlineafter 
 recv recvline recvuntilb 都是先用字符串做参数吧(字符串"\x41"直接41存储在对应的位置，即该位置的内容编码位41)

 cyclic 
 生成字符串 查找得位置

 shellcraft.sh() shellcode的汇编形式
 asm(shellcraft.sh()) shellcode的二进制码
```
{% endraw %}
