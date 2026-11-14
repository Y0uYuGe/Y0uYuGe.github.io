---
title: "Git 相关问题及解决方法的持续记录"
date: "2024-10-09 10:53:53 +0800"
categories:
  - "工具与环境配置"
tags:
  - "git"
  - "代理"
  - "RSA"
excerpt: "确保你的 GitHub 账户没有启用双因素认证（2FA），或者如果启用了 2FA，确保已经生成 SSH 密钥并正确添加到 GitHub。登录 GitHub，进入账户设置，找到“SSH and GPG keys”部分，点击“New SSH key”。给 SSH 密钥起一个描述性的标题，把公钥内容粘贴到 key 字段中，然后点击“Add SSH key”。确保你已经生成了 SSH 密钥并添加到了 GitHub 账户。确保 SSH 代理正在运行，并且私钥已经添加到代理中。"
source: "CSDN"
original_url: "https://blog.csdn.net/llovewuzhengzi/article/details/142781181"
csdn_article_id: "142781181"
migrated: true
---

{% raw %}
# git@ssh.github.com: Permission denied (publickey)
遇到 `git@ssh.github.com: Permission denied (publickey)` 错误时，通常意味着 GitHub 无法使用你提供的 SSH 密钥对你进行身份验证。下面是一些排查步骤，可以帮助你诊断并解决这个问题：

### 1. 检查 SSH 密钥

确保你已经生成了 SSH 密钥并添加到了 GitHub 账户。

#### 生成新的 SSH 密钥

如果还没有生成 SSH 密钥，可以用以下命令生成：

```sh
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

按照提示操作，通常会生成两个文件：`id_rsa`（私钥）和 `id_rsa.pub`（公钥）。

#### 将 SSH 密钥添加到 GitHub

1. 打开生成的公钥文件：

   ```sh
   cat ~/.ssh/id_rsa.pub
   ```

2. 复制公钥内容。

3. 登录 GitHub，进入账户设置，找到“SSH and GPG keys”部分，点击“New SSH key”。

4. 给 SSH 密钥起一个描述性的标题，把公钥内容粘贴到 key 字段中，然后点击“Add SSH key”。

### 2. 配置 SSH 代理

确保 SSH 代理正在运行，并且私钥已经添加到代理中。

#### 启动 SSH 代理

```sh
eval "$(ssh-agent -s)"
```

#### 将私钥添加到 SSH 代理

```sh
ssh-add ~/.ssh/id_rsa
```

### 3. 检查 SSH 配置文件

确保 SSH 配置文件 `~/.ssh/config` 中没有错误的配置。可以添加以下内容来确保使用正确的密钥：

```sh
Host github.com
  HostName ssh.github.com
  User git
  IdentityFile ~/.ssh/id_rsa
  Port 443
```

### 4. 测试 SSH 连接

再次测试 SSH 连接，确保能够成功连接到 GitHub：

```sh
ssh -T git@github.com
```

### 5. 检查防火墙和网络设置

确保防火墙和网络设置没有阻止 SSH 连接。可以尝试换一个网络环境（如家庭网络或移动数据）进行测试。

### 6. 检查 GitHub 账户设置

确保你的 GitHub 账户没有启用双因素认证（2FA），或者如果启用了 2FA，确保已经生成 SSH 密钥并正确添加到 GitHub。

### 详细步骤

1. **生成新的 SSH 密钥**：
   ```sh
   ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
   ```

2. **将 SSH 密钥添加到 GitHub**：
   - 打开公钥文件：
     ```sh
     cat ~/.ssh/id_rsa.pub
     ```
   - 复制公钥内容。
   - 登录 GitHub，进入账户设置，找到“SSH and GPG keys”部分，点击“New SSH key”。
   - 给 SSH 密钥起一个描述性的标题，把公钥内容粘贴到 key 字段中，然后点击“Add SSH key”。

3. **启动 SSH 代理并添加私钥**：
   ```sh
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_rsa
   ```

4. **检查 SSH 配置文件**：
   - 编辑 `~/.ssh/config` 文件：
     ```sh
     nano ~/.ssh/config
     ```
   - 添加以下内容：
     ```sh
     Host github.com
       HostName ssh.github.com
       User git
       IdentityFile ~/.ssh/id_rsa
       Port 443
     ```

5. **测试 SSH 连接**：
   ```sh
   ssh -T git@github.com
   ```

通过这些步骤，你应该能够解决 `Permission denied (publickey)` 错误并成功连接到 GitHub。如果问题仍然存在，可以查阅 GitHub 的文档和社区支持获取更多帮助。



# Updates were rejected because the tip of your current branch is behind its remote counterpart

```bash
To github.com:FULLK/glibc-chunk-poc-basic.git
! [rejected] main -> main (non-fast-forward)
error: 无法推送一些引用到 'git@github.com:FULLK/glibc-chunk-poc-basic.git'
提示：更新被拒绝，因为您当前分支的最新提交落后于其对应的远程分支。
提示：再次推送前，先与远程变更合并（如 'git pull ...'）。详见
提示：'git push --help' 中的 'Note about fast-forwards' 小节。
```

你遇到的错误信息表明，本地分支 `main` 落后于远程仓库的 `main` 分支。这种情况下 Git 会拒绝推送，因为推送可能会覆盖远程仓库中的更新。解决这个问题的正确做法是先把本地代码与远程仓库的代码同步。

下面是几种解决方案的详细步骤：

### 1. 使用 `git pull --rebase`

要解决这个问题，建议先使用 `git pull --rebase`，它会把你的本地提交应用到远程仓库的变更之上，而不会产生额外的合并提交（避免不必要的 merge commit）。

```bash
git pull --rebase origin main
```

该命令会执行以下操作：

- 从远程仓库获取最新的 `main` 分支。
- 把你的本地提交重新应用到远程分支之上。
- 如果有冲突，需要手动解决，然后用 `git rebase --continue` 继续。

`git pull --rebase` 完成后，继续推送：

```bash
git push -u origin main
```

### 2. 手动合并远程分支

如果不想使用 `rebase`，也可以通过手动合并来解决。

首先，从远程仓库拉取最新的变更：

```bash
git pull origin main
```

如果没有冲突，Git 会自动把远程的 `main` 分支与本地的 `main` 分支合并。

如果有冲突，Git 会告诉你哪些文件存在冲突。你需要编辑这些文件并解决冲突。解决之后，运行以下命令完成合并：

```bash
git add <解决了冲突的文件>
git commit
```

然后可以再次尝试推送：

```bash
git push -u origin main
```

### 3. 强制推送（不推荐）

如果你确定远程仓库中的变更可以被覆盖（例如你是唯一的贡献者，或者远程 `main` 分支的更新并不重要），可以使用强制推送。不过这种做法可能会丢失远程的历史记录，请谨慎使用。

```bash
git push -f origin main
```

### 强制推送的副作用：
- **覆盖远程历史**。如果其他人基于远程 `main` 分支做了工作，强制推送可能会导致他们的工作丢失或产生冲突。
- **无法撤销**。一旦强制推送，远程仓库的历史就被改写了，想要恢复远程仓库的状态会非常困难。

因此，除非你完全确定远程分支的状态可以忽略，否则建议不要使用强制推送。

---

### 总结

1. **推荐方法：** 使用 `git pull --rebase origin main` 同步远程分支和本地分支，然后再推送。
2. **合并方法：** 使用 `git pull origin main` 合并远程的变更。
3. **强制推送（不推荐）：** 如果远程的变更不重要或可以被覆盖，可以使用 `git push -f` 强制推送。

总的来说，前两种方法更安全，是推荐的做法。

# git lfs installError: Failed to call git rev-parse --git-dir: exit status 128 Git LFS initialized.
[https://blog.csdn.net/weixin_44740756/article/details/132103949](https://blog.csdn.net/weixin_44740756/article/details/132103949)

进入仓库目录

```bash
git lfs install
```


### 1. 跟踪大文件

告诉 Git LFS 你想跟踪哪些文件。例如，可以指定所有 `.tar.gz` 文件都由 Git LFS 管理：

```sh
git lfs track "*.tar.gz"
```

这会在仓库根目录下创建或更新一个 `.gitattributes` 文件，内容如下：

```
*.tar.gz filter=lfs diff=lfs merge=lfs -text
```

### 2. 添加 `.gitattributes` 文件

把 `.gitattributes` 文件添加到 Git 仓库：

```sh
git add .gitattributes
```

### 3. 添加大文件

把大文件添加到 Git 仓库：

```sh
git add glibc/debug_glibc-master.tar.gz
```

### 4. 提交变更

提交这些变更：

```sh
git commit -m "Add large file using Git LFS"
```

### 5. 推送变更

把变更推送到远程仓库：

```sh
git push origin main
```

### 6. 验证

确保该文件由 Git LFS 正确管理，而不是直接存储在 Git 仓库中。可以检查远程仓库中的 `.gitattributes` 文件和 `glibc/debug_glibc-master.tar.gz` 文件，确认 `glibc/debug_glibc-master.tar.gz` 已被替换为指向 Git LFS 的指针文件。

### 7. 其他注意事项

- **克隆仓库**：如果你的仓库已经使用了 Git LFS，其他用户在克隆仓库时需要安装 Git LFS，并使用 `git lfs pull` 命令下载大文件。
- **迁移已有的大文件**：如果仓库中已经包含大文件，可以使用 `git lfs migrate` 命令把这些文件迁移到 Git LFS。

### 迁移已有的大文件

如果仓库中已经包含大文件，可以用以下命令把它们迁移到 Git LFS：

```sh
git lfs migrate import --include="*.tar.gz" --include-ref=refs/heads/main
```

这会把指定的文件迁移到 Git LFS，并改写历史记录以使用 Git LFS 指针文件。

### 示例

假设你的仓库中已经有一个大文件 `glibc/debug_glibc-master.tar.gz`，可以按照以下步骤操作：

1. **安装 Git LFS**（这一步你已经完成了）：
    ```sh
    git lfs install
    ```

2. **跟踪大文件**：
    ```sh
    git lfs track "*.tar.gz"
    ```

3. **添加 `.gitattributes` 文件**：
    ```sh
    git add .gitattributes
    ```

4. **添加大文件**：
    ```sh
    git add glibc/debug_glibc-master.tar.gz
    ```

5. **提交变更**：
    ```sh
    git commit -m "Add large file using Git LFS"
    ```

6. **推送变更**：
    ```sh
    git push origin main
    ```


# 更多问题遇到时再记录...
{% endraw %}
