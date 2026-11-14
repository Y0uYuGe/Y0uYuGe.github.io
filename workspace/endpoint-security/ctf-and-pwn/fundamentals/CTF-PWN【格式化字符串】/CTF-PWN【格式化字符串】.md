---
title: "CTF-PWN【格式化字符串】"
date: "2023-10-15 07:35:06 +0800"
categories:
  - "二进制安全"
tags:
  - "学习"
  - "网络安全"
  - "安全"
  - "系统安全"
  - "CTF"
excerpt: "或。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/133837729"
csdn_article_id: "133837729"
migrated: true
---

{% raw %}
# 格式化字符串
CPU 通过 ebp 来访问栈上的东西
参数从右往左依次入栈
printf 函数的参数从右往左依次入栈

%[flags][width][.precision][length]specifier

说明符（specifier）用于规定输出数据的类型
标志（flags）用于规定输出样式
最小宽度（width）用于控制显示字段的宽度
```c

#include <stdio.h>
#define PAGES 931
int main() {
    printf("*%2d*\n", PAGES);         //输出的字段长度大于最小宽度，不会截断输出
    printf("*%10d*\n", PAGES);        //默认右对齐，左边补空格      
    printf("*%*d*\n", 2, PAGES);      //等价于 printf("*%2d*\n",PAGES)
    return 0;
}
  
//程序运行结果：
*931*
*       931*
*931*
```
精度（.precision）用于指定输出精度
对于整数说明符（d、i、o、u、x、X）：precision 指定了要打印的数字的最小位数。如果写入的值短于该数，结果会用前导零来填充。如果写入的值长于该数，结果不会被截断。精度为 0 意味着不写入任何字符；
对于 e、E 和 f 说明符：要在小数点后输出的小数位数；

```c
#include <stdio.h>
int main() {
    const double RENT = 3852.99;  // const-style constant
    printf("*%4.2f*\n", RENT);
    printf("*%3.1f*\n", RENT);
    printf("*%10.3f*\n", RENT);
 
    return 0;
}
  
//程序运行结果：
*3852.99*
*3853.0*
*  3852.990*
```
类型长度（length）用于控制待输出数据的数据类型长度



## 查看内存内容
在格式化参数之上，参数依次往上压入
%x 以十六进制输出

## 写入内存
%n 将已经打印的长度写入某个内存地址

```c
print("%d %n",a,&a)
```

如果 a=1234，那么 a 会变为 5，因为空格也算

## 自定义写入内存的值
```c

print("%5d%n",a,&a)
或
print("%.5d%n",a,&a)
```

## %n$p
表示格式化字符串的第 n 个参数，不算格式化字符串本身，位置往上数

推荐用 %p 来获取值

## [某个明显的字符串]%p%p%p%p……
观察 printf(s) 的结果，找到 s 是第几个参数，然后可以将其替换为某个函数的 GOT 地址，输入 got地址值%n$s 即可打印出真实地址


##  覆盖内存
某个地址 + %Nd + %A$n
将总长度（某个地址或其他东西 + N）写入第 A 个参数

### 覆盖为小数字
调换顺序：[一定长度的东西] + %A$n

### 覆盖为大数字
小端存储：低地址存放低字节
逐字节覆盖
%A$hhn：取目前已打印的总长度的最低一个字节，写入第 A 个参数
# 与 malloc 和 free 相关的格式化字符串漏洞
malloc()、calloc()、realloc() 在堆中分配空间
alloca() 在栈上分配空间

当 scanf 输入或 printf 输出的字符过多时，会调用 malloc 来处理，结束后再调用 free。
所以当输入或输出很多时，可以将 _free_hook 或 _malloc_hook 覆盖为其他函数的地址，从而调用该函数

## 格式化字符串漏洞工具
这是一个专门为 32 位程序格式化字符串漏洞输出 payload 的函数
fmtstr_payload(offset（格式化字符串在函数参数中的偏移）, {addr: value1, addr2: value2}) 用于将 value 写入 addr（常用：{printf_got}）



# 64 位
参数放在寄存器中，超过六个时放在栈上
此时 %np 中的参数序号仍然从格式化字符串之后的参数开始数
{% endraw %}
