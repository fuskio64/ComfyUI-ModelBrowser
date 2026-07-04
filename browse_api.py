"""API routes for ComfyUI-ModelBrowser.

GET  /modelbrowser/browse  - list a directory on the server (dirs + model files)
POST /modelbrowser/pick    - register a picked model file for this session
"""

import os
import string

from aiohttp import web

import folder_paths
from server import PromptServer

routes = PromptServer.instance.routes

# Directory names that are pointless to descend into from the picker.
_SKIP_DIRS = {"$recycle.bin", "system volume information"}


def _norm(path: str) -> str:
    return os.path.normcase(os.path.normpath(os.path.abspath(path)))


def _extensions_for(folder_name: str):
    entry = folder_paths.folder_names_and_paths.get(folder_name)
    if entry is None:
        return {e.lower() for e in folder_paths.supported_pt_extensions}
    return {e.lower() for e in entry[1]}


def _roots_response():
    """Top level listing: drive letters on Windows, filesystem root elsewhere."""
    if os.name == "nt":
        drives = [
            {"name": f"{d}:\\", "path": f"{d}:\\"}
            for d in string.ascii_uppercase
            if os.path.exists(f"{d}:\\")
        ]
        return web.json_response({"path": "", "parent": None, "dirs": drives, "files": []})
    return None  # posix: caller falls through to listing "/"


@routes.get("/modelbrowser/browse")
async def modelbrowser_browse(request):
    folder_name = request.query.get("folder_name", "")
    exts = _extensions_for(folder_name)
    path = request.query.get("path", "").strip()

    if not path or not os.path.isdir(path):
        roots = _roots_response()
        if roots is not None:
            return roots
        path = "/"

    path = os.path.abspath(path)
    dirs, files = [], []
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        if not entry.name.startswith(".") and entry.name.lower() not in _SKIP_DIRS:
                            dirs.append({"name": entry.name, "path": entry.path})
                    elif entry.is_file():
                        if os.path.splitext(entry.name)[1].lower() in exts:
                            files.append(
                                {"name": entry.name, "path": entry.path, "size": entry.stat().st_size}
                            )
                except OSError:
                    continue
    except PermissionError:
        return web.json_response({"error": f"Permission denied: {path}"}, status=403)
    except OSError as e:
        return web.json_response({"error": str(e)}, status=400)

    dirs.sort(key=lambda d: d["name"].lower())
    files.sort(key=lambda f: f["name"].lower())

    parent = os.path.dirname(path)
    if _norm(parent) == _norm(path):
        # at a drive root (Windows) or "/" (posix)
        parent = "" if os.name == "nt" else None

    return web.json_response({"path": path, "parent": parent, "dirs": dirs, "files": files})


@routes.post("/modelbrowser/pick")
async def modelbrowser_pick(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    folder_name = data.get("folder_name", "")
    file_path = data.get("path", "")

    if folder_name not in folder_paths.folder_names_and_paths:
        return web.json_response({"error": f"Unknown model folder type: {folder_name}"}, status=400)
    if not file_path or not os.path.isabs(file_path) or not os.path.isfile(file_path):
        return web.json_response({"error": f"Not a file: {file_path}"}, status=400)

    file_path = os.path.abspath(file_path)
    exts = _extensions_for(folder_name)
    if os.path.splitext(file_path)[1].lower() not in exts:
        return web.json_response(
            {"error": f"File extension not allowed for '{folder_name}' models"}, status=400
        )

    parent = os.path.dirname(file_path)
    registered = {_norm(p) for p in folder_paths.get_folder_paths(folder_name)}
    if _norm(parent) not in registered:
        # Session-only: extra search paths are never persisted by ComfyUI.
        folder_paths.add_model_folder_path(folder_name, parent)
        try:
            folder_paths.filename_list_cache.pop(folder_name, None)
        except AttributeError:
            pass  # newer ComfyUI invalidates the cache itself when paths change

    name = os.path.basename(file_path)
    resolved = folder_paths.get_full_path(folder_name, name)
    collision = resolved is None or _norm(resolved) != _norm(file_path)
    return web.json_response(
        {"name": name, "folder_name": folder_name, "collision": collision, "resolved": resolved}
    )
