# Pastebin Pages

A fast static pastebin that runs entirely on GitHub Pages and keeps paste data in the browser instead of a server.

## What it does

This app lets you:
- write or paste text in a clean editor
- save a draft locally in the browser
- generate a shareable URL from your content
- copy the resulting link or plain text
- open a paste from a shared URL without a backend

## How it works

The paste is encoded into the URL fragment (`#...`) so GitHub Pages can host it without any database or API. The site tries to compress the content before generating the link, which helps fit longer writes into a browser-friendly URL.

This follows the same general idea as `ha.mr`: reduce the payload before sending it through a URL. The difference is that this project is meant for arbitrary text, not just structured web links. Because of that, long text is still bounded by browser URL limits and the actual amount of compressible content.

## Important limitations

This is not a true short-link service:
- GitHub Pages cannot store paste data
- a short link like `example.com/abc123` requires a backend or database
- anyone who has the generated link can read the paste
- the content is compressed, but not encrypted

Do not paste passwords, tokens, private keys, API secrets, or other sensitive data.

## Expected behavior

For ordinary notes or moderately long text, this works very well. For large blocks of repetitive or code-heavy content, the browser-side compression helps a lot. Very large pastes may still exceed URL limits and should be treated as a signal to move to a real backend-backed paste service.

## Deployment

1. Push this repo to GitHub.
2. Open the repository `Settings`.
3. Go to `Pages`.
4. Choose the GitHub Actions deployment source.
5. Deploy the site from the repository root.

## Notes

This is great for:
- quick sharing
- code snippets
- notes and drafts
- small static documentation

This is not ideal for:
- private or secret content
- very large documents
- permanent paste storage
- short public URL IDs without a backend
