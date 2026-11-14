---
title: "机器学习 - 感知机 - 神经网络 - 激活函数 - 正向传播与反向传播 - 梯度消失 - Dropout"
date: "2024-12-30 18:26:05 +0800"
categories:
  - "机器学习与深度学习"
tags:
  - "机器学习"
  - "神经网络"
  - "人工智能"
series: "机器学习"
excerpt: "虽然两者都是非线性的，但 Tanh 函数在输入接近零时提供更强的非线性映射，因为它在这个区域的曲线更陡。无需自己选择特征；传统的感知机依赖手动的特征提取和选择，而深度学习中特征提取的过程是自动完成的。Sigmoid 函数的导数取值在 0 到 0.25 之间，Tanh 函数的导数取值在 0 到 1 之间，所以它们输出的值一直都很小。激活函数是一个非线性函数，它把输入数据映射为一个新的输出值，这个输出值可以作为下一层的输入。提取出的特征可以从最终输出层之前隐藏层的输出特征中看出来，它和原始输入层的特征是不同的。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/144804792"
csdn_article_id: "144804792"
migrated: true
---
{% raw %}

# 感知机

感知机是神经网络的起点
![图片](./assets/csdn-144804792/image-001-08e4567802.png)
![图片](./assets/csdn-144804792/image-002-2a0f612391.png)

## 工作流程

在感知机模型中，阶跃函数扮演的是分类决策的角色

![图片](./assets/csdn-144804792/image-003-3594656a1a.png)
学习，调整权重
![图片](./assets/csdn-144804792/image-004-1cf2879536.png)

# 神经网络

![图片](./assets/csdn-144804792/image-005-03447196e5.png)

## 区别

无需自己选择特征；传统的感知机依赖手动的特征提取和选择，而深度学习中特征提取的过程是自动完成的。你只需要喂入各种各样的数据
![图片](./assets/csdn-144804792/image-006-4198693096.png)
提取出的特征可以从最终输出层之前隐藏层的输出特征中看出来，它和原始输入层的特征是不同的
![图片](./assets/csdn-144804792/image-007-20cc2f213c.png)
可以用于多分类
![图片](./assets/csdn-144804792/image-008-5d13df92a3.png)
或者目标检测
![图片](./assets/csdn-144804792/image-009-4c1e2fc194.png)

## 各种类型的神经网络

DNN（深度神经网络；ANN 人工神经网络／MLP 多层感知机）、CNN、RNN
![图片](./assets/csdn-144804792/image-010-74fe746c5a.png)
![图片](./assets/csdn-144804792/image-011-73fbe2dea9.png)

# 激活函数

![图片](./assets/csdn-144804792/image-012-75d9c1b04c.png)
激活函数是一个非线性函数，它把输入数据映射为一个新的输出值，这个输出值可以作为下一层的输入
![图片](./assets/csdn-144804792/image-013-d2077783c2.png)

![图片](./assets/csdn-144804792/image-014-1e9dc04bdb.png)

## 激活函数的类型

![图片](./assets/csdn-144804792/image-015-f9076227af.png)

### Sigmoid 函数

![图片](./assets/csdn-144804792/image-016-56f5946cf7.png)
![图片](./assets/csdn-144804792/image-017-69302e0cf9.png)

### ReLU 函数

![图片](./assets/csdn-144804792/image-018-672fad2355.png)

### Leaky ReLU 函数

![图片](./assets/csdn-144804792/image-019-38ec3d8c5a.png)

### Tanh 函数

虽然两者都是非线性的，但 Tanh 函数在输入接近零时提供更强的非线性映射，因为它在这个区域的曲线更陡。这使得它在某些任务中能够捕捉更复杂的模式
![图片](./assets/csdn-144804792/image-020-e7db706007.png)

# 正向传播

![图片](./assets/csdn-144804792/image-021-883d5acdce.png)
![图片](./assets/csdn-144804792/image-022-5cedded768.png)

# 反向传播

![图片](./assets/csdn-144804792/image-023-accb1361b2.png)
一个神经元要承担多大的责任，就取决于它对损失值的影响有多大——这就是梯度
![图片](./assets/csdn-144804792/image-024-3eb7257318.png)
![图片](./assets/csdn-144804792/image-025-459d6ea7ca.png)
![图片](./assets/csdn-144804792/image-026-827da38c97.png)

# 梯度消失（gradient vanish）

![图片](./assets/csdn-144804792/image-027-7e90a03946.png)
![图片](./assets/csdn-144804792/image-028-4fe70c1504.png)

## 如何解决

![图片](./assets/csdn-144804792/image-029-2d04cd552a.png)
![图片](./assets/csdn-144804792/image-030-8d2f5df1c7.png)
![图片](./assets/csdn-144804792/image-031-e09fae0816.png)
![图片](./assets/csdn-144804792/image-032-0ec1e610ff.png)
Sigmoid 函数的导数取值在 0 到 0.25 之间，Tanh 函数的导数取值在 0 到 1 之间，所以它们输出的值一直都很小
![图片](./assets/csdn-144804792/image-033-3633ae8d0f.png)
![图片](./assets/csdn-144804792/image-034-46a918efb1.png)
![图片](./assets/csdn-144804792/image-035-fd13d9e397.png)

# Dropout

![图片](./assets/csdn-144804792/image-036-f3076a439c.png)
![图片](./assets/csdn-144804792/image-037-151a743982.png)
![图片](./assets/csdn-144804792/image-038-fc8ea59310.png)
消除特征之间的依赖关系：仅凭学到的一部分特征就能做出判断，而不依赖其他特征

## 用法

深度学习框架封装了一个 Dropout 层，所以只要你想随机丢弃某一层输出的一部分，直接在该层后面加一个 Dropout 层即可

手动实现如下

```python
p = 0.5  # 激活的概率。p越高，Dropout 越少。
def train_step(X):
    """ X 是输入数据 """
  
    # 第 1 层的前向传播
    H1 = np.maximum(0, np.dot(W1, X) + b1)  # ReLU 激活
    U1 = np.random.rand(*H1.shape) < p  # 随机生成 Dropout mask
    H1 *= U1  # 应用 Dropout，丢弃一些神经元
  
    # 第 2 层的前向传播
    H2 = np.maximum(0, np.dot(W2, H1) + b2)  # ReLU 激活
    U2 = np.random.rand(*H2.shape) < p  # 随机生成 Dropout mask
    H2 *= U2  # 应用 Dropout，丢弃一些神经元
  
    # 输出层
    out = np.dot(W3, H2) + b3  # 不对输出层应用 Dropout
  
    return out

```

![图片](./assets/csdn-144804792/image-039-2e3a723c67.png)
![图片](./assets/csdn-144804792/image-040-4271b612d8.png)

# PyTorch 实战神经网络算法（手写 MNIST 数字识别）

[https://pytorch.org/](https://pytorch.org/)

```python
inputs.view(-1, 28*28)
```

## view

![图片](./assets/csdn-144804792/image-041-38e2341ea4.png)

## softmax 和 log-softmax

![图片](./assets/csdn-144804792/image-042-845767fa72.png)

## 交叉熵损失

![图片](./assets/csdn-144804792/image-043-6eb2c2c8c9.png)

## nll_loss

![图片](./assets/csdn-144804792/image-044-60406c05a9.png)
![图片](./assets/csdn-144804792/image-045-8fff43cc8c.png)
![图片](./assets/csdn-144804792/image-046-cd07d12d84.png)

## batch size 的底层计算机制

[https://blog.csdn.net/weixin_44986037/article/details/144216069](https://blog.csdn.net/weixin_44986037/article/details/144216069)
{% endraw %}