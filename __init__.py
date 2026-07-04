"""ComfyUI-ModelBrowser

Adds a "browse" button to every model dropdown so you can pick a model
file from anywhere on the machine running ComfyUI. The picked file's
folder is registered as an extra search path for the current server
session only - nothing is written to disk or config files.
"""

from . import browse_api  # noqa: F401  (registers the API routes on import)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
