# Third-party notices

Treg Lens application source is released under the [MIT license](./LICENSE). Third-party software and assets retain their own licenses.

## Bundled fonts

The font files in [`src/app/fonts/`](./src/app/fonts/) are distributed under the **SIL Open Font License, Version 1.1**. The complete copyright notices and license terms are included alongside the files:

| Family | Copyright notice | Included license |
| --- | --- | --- |
| DM Sans | Copyright 2014 The DM Sans Project Authors | [dmsans-OFL.txt](./src/app/fonts/dmsans-OFL.txt) |
| Inter Tight | Copyright 2022 The Inter Project Authors | [intertight-OFL.txt](./src/app/fonts/intertight-OFL.txt) |
| IBM Plex Mono | Copyright © 2017 IBM Corp. with Reserved Font Name “Plex” | [ibmplexmono-OFL.txt](./src/app/fonts/ibmplexmono-OFL.txt) |
| Geist Pixel | Copyright 2026 The Geist Project Authors | [geistpixel-OFL.txt](./src/app/fonts/geistpixel-OFL.txt) |

These are unchanged Latin WOFF2 files obtained from Google's font distribution. DM Sans preserves its variable weight range of 100–1000; Inter Tight preserves 100–900. IBM Plex Mono includes normal weights 400 and 500; Geist Pixel includes normal weight 400. Application asset filenames describe their contents; the font binaries were not renamed internally or modified.

The [font provenance guide](./src/app/fonts/README.md) records official distribution URLs, the source repository revision for the licenses, retrieval information, and SHA-256 hashes. Keep these font files, copyright notices, and licenses together when redistributing the application. The application's MIT license does not replace the fonts' OFL terms.

## npm dependencies

Runtime and development dependencies are listed in [`package.json`](./package.json), with exact resolved versions and license metadata in [`package-lock.json`](./package-lock.json). Their upstream copyright notices and license files are installed under `node_modules` by `npm ci`. Redistributed dependencies retain those licenses and notices.

## Product names and marks

Treg, Profound, AI engine names, and their associated marks belong to their respective owners. Their appearance identifies the referenced products and integrations; it does not imply endorsement or affiliation. Treg Lens is an independent implementation inspired by Profound and powered by the Treg AEO toolkit.
