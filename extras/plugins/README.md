# Plugins made by others

Plugins written by people outside the studio and given to it, shipped here as their authors made them. None of them runs until you install it: `extras/plugins/install.sh NAME` copies it into `user/plugins/NAME` with a Python environment of its own, and the Refiner shows its steps after a reload of the page. Run it again to bring the plugin up to date (its environment stays); delete `user/plugins/NAME` to take it away. Each plugin keeps its author's licence, in its own folder.

| plugin | by | licence | what it does |
|---|---|---|---|
| [`basic-pitch/`](basic-pitch/README.md) | Steven Altsman ([manchuwook](https://github.com/manchuwook)) | MIT ([LICENSE](basic-pitch/LICENSE)) | **To MIDI**: Spotify's [Basic Pitch](https://github.com/spotify/basic-pitch) (Apache-2.0) on a set of stems, one `.mid` per stem that has notes, pitch bends kept, and a `report.csv` of each stem's notes. Best on one voice or instrument at a time; on the CPU, an eight-stem set of a 2:25 song in 30 s. Its environment takes about 600 MB (ONNX Runtime). |

**The studio's own example.** [`example-node/`](example-node/README.md) (CC0, copy it freely): two small steps written to be copied, «Tilt and width» that changes the sound and «Width meter» that only looks, with a check that runs without the studio. The start of a node of your own: [`docs/PLUGINS.md`](../../docs/PLUGINS.md), «Your first node».

**Where each one comes from.** `basic-pitch/` is his [null-angel/ruach-basic-pitch-plugin](https://github.com/null-angel/ruach-basic-pitch-plugin) at commit `cc5472071e09` (01.11.2026), every file as he gave it but its own CI workflow. A newer version is taken in as a new snapshot here; its issues and ideas go to its own repository.

**A plugin of yours** can stand here too: say it in the repository's [Discussions](https://github.com/igrbible/Ruach_Studio/discussions). How a plugin is made: [`docs/PLUGINS.md`](../../docs/PLUGINS.md).
