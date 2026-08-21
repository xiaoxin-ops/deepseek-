# dsh-blue-whale

Bridge plugin for the 「蓝鲸鱼」(Blue Whale) desktop client — the native desktop channel for the DeepSeek Harness web GUI.

Everything is a plugin: the desktop shell (Electron) contains no Harness-private logic, only process hosting and native UI; **every desktop capability comes from this plugin**, installed through the official plugin channel (`dsh plugin`) and composed seamlessly with the official ecosystem.

See [README.zh.md](./README.zh.md) for the Chinese guide (structure, install, wire protocol, development).
