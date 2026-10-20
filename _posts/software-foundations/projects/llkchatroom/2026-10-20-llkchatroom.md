---
layout: portfolio
title: llkchatroom
excerpt: An Android chat client and Java socket server for text and file exchange on a local network. Separate connections
  handle messages and binary transfers.
permalink: /portfolio/llkchatroom/
redirect_from:
- /en/portfolio/llkchatroom/
project_order: 60
project_type: Networking practice
project_status: Code available
repository: https://github.com/Y0uYuGe/llkchatroom
technologies: &id001
- Java
- Android
- TCP sockets
- Gradle
date: '2026-10-20'
published: true
project_page: true
tags: *id001
---

## Background

A small chat application makes network programming tangible: a user action becomes a message, a server forwards it, and another device updates its interface. llkchatroom explores that path through an Android client and a Java server, including text and file exchange over a local network.

The repository contains the Android application under `app/`, the socket server under `server/`, and a README explaining the communication flow with code examples.

## Implementation

The server opens two TCP listeners: port `8848` for messages and port `18848` for file transfers. Each accepted connection is assigned a worker thread. The message worker reads text lines and forwards them to connected message clients; the file worker receives file metadata and bytes, stores the transfer, and relays it to file clients.

On Android, `ClientThread` and `FileThread` manage the two connections. Handlers and Loopers carry work between the interface and network threads, while a RecyclerView displays sent and received messages. The login screen records a display name and the device's local address. Text records include those fields alongside the message content.

File transfers use a separate path with a filename, a declared length, byte-stream operations, and an end marker. Pictures, video, and audio travel through this generic file mechanism. The implementation provides a compact case study in message framing, connection handling, and coordinating network work with an Android interface.

## Inspect the work

- [Android client](https://github.com/Y0uYuGe/llkchatroom/tree/main/app/src/main/java/com/example/chatroom): activities, message model, adapter, and socket threads.
- [Server implementation](https://github.com/Y0uYuGe/llkchatroom/tree/main/server): listeners and message/file relay workers.
- [Protocol walkthrough](https://github.com/Y0uYuGe/llkchatroom/blob/main/README.md): setup steps and explanations of the client/server code.
- [Development history](https://github.com/Y0uYuGe/llkchatroom/commits/main/): changes recorded in the repository.

## Running the project

Use Android Studio and the repository's Gradle project for the client, plus a Java environment for the server. The checked-in Android configuration uses compile/target SDK `34` and minimum SDK `21`.

Start the server on a reachable computer, set the server address in both Android connection classes, and place the devices on the same network. Adjust the server's file-storage path for the host machine and permit access to the two listening ports. The README describes a phone-and-computer hotspot setup for trying the application.
