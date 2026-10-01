# @vectorplease/mcp

MCP server for Vector, Please: bitmap in, sticker-ready SVG out, from any MCP client.

Status: pre-release. Not yet published to npm.

## Tools

| Tool             | What it does                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert_image`  | Converts a PNG, JPEG or WebP (local `path`, `https` `url`, or `base64`) into a sticker SVG. Optional `preset`, `params`, and `outputPath` to write the SVG to a file. Returns quality metrics. |
| `get_conversion` | Fetches a conversion by id, for one that was still running.                                                                                                                                    |
| `list_presets`   | Lists the presets: one starting point per kind of artwork.                                                                                                                                     |

## Running

Set `VECTORPLEASE_API_KEY`, then:

```
vectorplease-mcp          # stdio, for clients that launch the server
vectorplease-mcp --http   # streamable HTTP on http://127.0.0.1:3333/mcp (PORT, HOST to change)
```

The HTTP transport uses the server's own API key, so keep it on localhost or a trusted network.
Images are limited to 10 MB; URLs must be `https`.

## License

MIT
