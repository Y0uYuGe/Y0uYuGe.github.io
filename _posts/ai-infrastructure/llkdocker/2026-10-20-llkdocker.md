---
title: llkdocker
layout: portfolio
excerpt: A Go implementation that explores container isolation, resource controls, layered filesystems, and bind-mounted
  volumes through separate Linux exercises.
permalink: /portfolio/llkdocker/
project_order: 30
project_type: Systems practice
project_status: Code available
repository: https://github.com/Y0uYuGe/llkdocker
technologies: &id001
- Go
- Linux namespaces
- cgroups
- OverlayFS
redirect_from:
- /en/portfolio/llkdocker/
date: '2026-10-20'
published: true
project_page: true
tags: *id001
---

## Background

What happens between a container command and the process running inside it? llkdocker studies that path in Go, following the *Write Your Own Docker* learning approach on Ubuntu 22.04. Separate directories preserve successive exercises, making it possible to examine isolation, filesystems, and resource controls without navigating a full container engine.

## Implementation

The [`volume_docker` exercise](https://github.com/Y0uYuGe/llkdocker/tree/main/volume_docker) brings several mechanisms together:

- **Process isolation:** the parent starts an `init` child using UTS, PID, mount, network, and IPC namespace flags.
- **Parent–child coordination:** an inherited pipe carries the requested command after the parent assigns the child to a cgroup.
- **Root filesystem:** BusyBox supplies the lower filesystem; OverlayFS combines lower, upper, work, and merged directories. The child changes its root with `pivot_root` and mounts `/proc` and `/dev`.
- **Resources and storage:** command options feed memory, CPU, and cpuset settings into cgroup handlers; `-v` maps a host directory through a bind mount.
- **Lifecycle:** the parent waits for the child, then calls volume, overlay, and cgroup cleanup routines.

<figure>
  <a href="{{ '/images/portfolio/llkdocker-flow.svg' | relative_url }}" title="Open full-size diagram"><img class="portfolio-diagram--compact" src="{{ '/images/portfolio/llkdocker-flow.svg' | relative_url }}" alt="Execution flow through the CLI, container setup, resource controls, child process, and cleanup."></a>
  <figcaption>Execution flow of the volume_docker exercise, based on its command, container, and cgroups packages.</figcaption>
</figure>

## Design and learning scope

The progression from `namespace` and `run_docker` to `pipe_docker`, `pivotroot_docker`, `overlayfs_docker`, and `volume_docker` exposes how the pieces fit together. Isolation and resource allocation remain visible as separate mechanisms. The code also makes filesystem preparation and process cleanup explicit, useful places to study failure paths and ownership of host resources.

## Environment and use

The module declares Go 1.18 and uses `urfave/cli` and Logrus. Execution requires Linux features, mount permissions, a suitable cgroup configuration, and the BusyBox root filesystem. Paths under `/home/llk/Desktop/docker/src/volume_docker` are embedded in the source and must be adapted to the local workspace.

Start by reading [`command.go`](https://github.com/Y0uYuGe/llkdocker/blob/main/volume_docker/command.go) for supported flags, then follow [`container/run.go`](https://github.com/Y0uYuGe/llkdocker/blob/main/volume_docker/container/run.go) and [`container/init.go`](https://github.com/Y0uYuGe/llkdocker/blob/main/volume_docker/container/init.go).

## Development history

[Browse the staged exercises](https://github.com/Y0uYuGe/llkdocker/tree/main) · [View repository commits](https://github.com/Y0uYuGe/llkdocker/commits/main/)
