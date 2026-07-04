# ComfyUI-ModelBrowser

Adds a **📂 browse** button under every model dropdown in ComfyUI (checkpoints,
LoRAs, VAEs, CLIP/text encoders, diffusion models, ControlNets, upscalers… in
core *and* custom nodes) so you can pick a model file from **anywhere on disk**
instead of only the configured models folders.

- No configuration, no extra Python dependencies.
- Works with any node automatically: model dropdowns are detected by comparing
  their option list against ComfyUI's model folders, not by hardcoding nodes.
- **Session-only override**: picking a file registers its folder as an extra
  search path in memory for the running server. Nothing is written to
  `extra_model_paths.yaml` or any config — restart ComfyUI and it's forgotten.
- Workflows saved with this extension load fine for people who don't have it
  (they'll just see a missing-model value, as with any model they don't own).

## Install

**ComfyUI Manager:** *Install via Git URL* →
`https://github.com/fuskio64/ComfyUI-ModelBrowser`

**Manual:**

```
cd ComfyUI/custom_nodes
git clone https://github.com/fuskio64/ComfyUI-ModelBrowser
```

Restart ComfyUI and reload the browser page.

## Use

1. Any node with a model dropdown gets a `📂 browse <input>` button.
2. Click it, navigate the file picker (it browses the machine ComfyUI runs on),
   double-click a model file.
3. The dropdown now shows and uses that file. Queue your prompt as usual.

## Notes & limitations

- The picker browses the **server's** filesystem. If you access ComfyUI
  remotely, you're browsing the remote machine's drives — that's where models
  must live anyway. Anyone who can reach your ComfyUI web UI can also use this
  picker to list files on that machine (same trust level as ComfyUI itself,
  which already serves your images and models).
- If a file with the **same name** already exists in the original models folder,
  the original wins (ComfyUI resolves by name in search-path order). You'll get
  a warning toast; rename the file and pick it again.
- Only files with extensions valid for that model type are shown
  (`.safetensors`, `.ckpt`, `.pt`, `.sft`, …).

## How it works

A tiny API (`/modelbrowser/browse`, `/modelbrowser/pick`) lists directories and,
on pick, calls ComfyUI's public `folder_paths.add_model_folder_path()` for the
file's parent folder. The file then appears in the normal model list, so
validation and loading work exactly like a model in your models folder — no
monkey-patching of ComfyUI internals.

## License

MIT
