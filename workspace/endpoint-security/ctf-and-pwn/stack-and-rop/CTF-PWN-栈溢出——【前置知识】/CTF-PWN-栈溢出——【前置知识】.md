---
title: "CTF-PWN-栈溢出——【前置知识】"
date: "2023-11-12 16:07:15 +0800"
categories:
  - "CTF 与 Pwn"
tags:
  - "学习"
  - "Pwn"
  - "CTF"
series: "CTF Writeup"
excerpt: "64 位：前六个参数依次为 RDI RSI RDX RCX R8 R9（寄存器中的内容：字符串是指针，数字是对应的编码，字符是其对应的编码），其余的保存在栈上。（2）函数 B 在使用寄存器 %rbx 之前先保存 %rbx 的值，在返回前恢复 %rbx 原来的内容，这种策略称为被调用者保存（callee-saved）。（1）函数 A 在调用函数 B 之前保存 %rbx 的内容，在 B 执行完后恢复，这种策略称为调用者保存（caller-saved）。调用函数时，先将函数参数压栈，再将返回地址压栈，进入函数后再将函数的局部变量压栈。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/134361561"
csdn_article_id: "134361561"
migrated: true
---

{% raw %}
#  被调用者保存寄存器和调用者保存寄存器
> 函数 A 调用函数 B，而寄存器 rbx 在函数 B 中被修改了；从逻辑上讲，调用函数 B 前后 %rbx 的内容应该保持一致。
解决这个问题有两种策略：
（1）函数 A 在调用函数 B 之前保存寄存器 %rbx 的内容，在函数 B 执行完后再恢复，这种策略称为调用者保存（caller-saved）；
（2）函数 B 在使用寄存器 %rbx 之前先保存它的值，在函数 B 返回前恢复 %rbx 原来的内容，这种策略称为被调用者保存（callee-saved）。


> 对于上述两种策略，不同的寄存器被规定使用不同的策略。
使用第一种策略的寄存器是调用者保存寄存器；使用第二种策略的寄存器是被调用者保存寄存器。


> callee-saved：其实更应该叫 call-preserved，具有 const 属性，是受保护的
> %rbx ，%rbp，%r12，%r13，%r14，%r15

> caller-saved：其实更应该叫 call-clobbered，具有 volatile 属性，是可能被改变的
> %rax，%rdi，%rsi，%rdx，%rcx，%r8，%r9，%r10，%r11

# 函数调用概述
调用函数时，先将函数参数压栈，再将返回地址压栈，进入函数后再将函数的局部变量压栈。

参数从右往左压栈；先定义的局部变量先压栈

函数调用结束时，执行 leave 和 ret 指令
leave 指令将 rbp 复制给 rsp，然后弹栈到 rbp
ret 指令弹栈到 rip

# 参数上的差异
32 位：参数位于返回地址的上方
64 位：前六个参数依次为 RDI RSI RDX RCX R8 R9（寄存器中的内容：字符串是指针，数字是对应的编码，字符是其对应的编码），其余的保存在栈上。另外，内存地址不能大于 0x00007FFFFFFFFFFF，否则会抛出异常

> 表示内存地址的 64 位指针只有低 48 位有效，并符号扩展到 64 位。也就是说，其高 16 位必须全为 1 或全为 0，并且必须与低 48 位的最高位（第 47 位）一致。
{% endraw %}
