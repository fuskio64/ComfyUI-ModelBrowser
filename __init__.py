"""ComfyUI-ModelBrowser

Adds a "browse" button to every model dropdown so you can pick a model
file from anywhere on the machine running ComfyUI. The picked file's
folder is registered as an extra search path and persisted to
extra_paths.json so it survives server restarts.
"""

from . import browse_api  # noqa: F401  (registers the API routes on import)

browse_api.load_extra_paths()

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
