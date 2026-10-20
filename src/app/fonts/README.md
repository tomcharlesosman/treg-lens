# Local application fonts

These checked-in Latin WOFF2 files are loaded with `next/font/local` in [`../layout.tsx`](../layout.tsx). The application does not fetch Google Fonts during builds or from the browser. Normal setup requires no font download, conversion tool, or additional npm package.

## Files

| File | Family | Normal weights | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| [dm-sans-latin-variable.woff2](./dm-sans-latin-variable.woff2) | DM Sans | 100–1000 | 36,980 | `468d56b6b25b05b70190b6c233d773f6f1770e8579827ce022a57f03fa8002fb` |
| [geist-pixel-latin-400.woff2](./geist-pixel-latin-400.woff2) | Geist Pixel | 400 | 16,880 | `ad19ee1cf94a118a2bd005be3b2362efffbb8b1a4c106a75caec0c6d02fac917` |
| [ibm-plex-mono-latin-400.woff2](./ibm-plex-mono-latin-400.woff2) | IBM Plex Mono | 400 | 10,052 | `c36f509c0a8f9f85f29cb44bc8701d8a9e0b14c499e77a884f789ead7093a7ac` |
| [ibm-plex-mono-latin-500.woff2](./ibm-plex-mono-latin-500.woff2) | IBM Plex Mono | 500 | 10,060 | `a76f53ca6612e7b3828eec2311098675b7f9849ae4169a8bcef6302aec02a6c0` |
| [inter-tight-latin-variable.woff2](./inter-tight-latin-variable.woff2) | Inter Tight | 100–900 | 44,916 | `83d548cd73ef2e039167db3adb5ea9d7a7870466ffc8a162c9820bc348938aaf` |

Total font payload: **118,888 bytes**. DM Sans and Inter Tight contain a real `wght` variation axis; IBM Plex Mono uses the two original static weights. Geist Pixel, Treg's display face, is a single static weight used for marketing headlines. Only normal styles are bundled, matching the application configuration. No italic faces or additional scripts are bundled. Browsers may synthesize italic text and use fallback fonts for unsupported characters.

## Provenance

Retrieved: `2026-10-19T14:04:27+00:00` (Geist Pixel: `2026-10-20T09:48:50+00:00`). Files are unmodified responses from the official Google Fonts CDN. The exact URLs, Unicode ranges, axis metadata, sizes, and SHA-256 hashes are recorded in [`provenance.json`](./provenance.json).

The official CSS request was:

[Google Fonts CSS API](https://fonts.googleapis.com/css2?family=DM+Sans:wght@100..1000&family=IBM+Plex+Mono:wght@400;500&family=Inter+Tight:wght@100..900&display=swap)

Geist Pixel was added later with its own request, recorded under `additionalSources` in `provenance.json`:

[Google Fonts CSS API](https://fonts.googleapis.com/css2?family=Geist+Pixel&display=swap)

The CSS request used this full modern browser User-Agent so Google returns WOFF2 variable fonts rather than legacy static TTF files:

```text
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
```

Each WOFF2 file was selected from the CSS block labeled `/* latin */` for its family and weight. The `wOF2` signature, family metadata, variable weight ranges, and the IBM Plex Mono and Geist Pixel static weight classes were checked before vendoring. No subsetting, conversion, or binary edits were applied locally.

## Licenses

All four families use the SIL Open Font License, Version 1.1. Complete authoritative license texts were copied from the [google/fonts repository](https://github.com/google/fonts) at the recorded revision:

`47d54ca1ebb14fd864695f1d39dc734f39017c33`

- DM Sans: [dmsans-OFL.txt](./dmsans-OFL.txt) · [pinned upstream source](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/dmsans/OFL.txt) · SHA-256 `2af94f4fb533be8fa23282eb33e08ca311ddf47c2f32777e2040b282deeec65c`
- Inter Tight: [intertight-OFL.txt](./intertight-OFL.txt) · [pinned upstream source](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/intertight/OFL.txt) · SHA-256 `50240ab035cf1b6b3307940235481d515c4b6de3ab1fa843dbe59e7892cb9d58`
- Geist Pixel: [geistpixel-OFL.txt](./geistpixel-OFL.txt) · [pinned upstream source](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/geistpixel/OFL.txt) · SHA-256 `021caa749f89fecd7c2e40a50499de29e84d2bc19251659b47d499c2fbfffc17`
- IBM Plex Mono: [ibmplexmono-OFL.txt](./ibmplexmono-OFL.txt) · [pinned upstream source](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/ibmplexmono/OFL.txt) · SHA-256 `37784b44044a4ffd9256702b7c0982c37e5c8887ba90c6dca0479aea93dc898d`

License text uses LF line endings for portable checkouts; no terms or copyright notices were changed. `provenance.json` records both the original upstream hash and the hash of the checked-in license text.

See also [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md). Font licenses remain separate from the application's MIT license.

## Updating the fonts

1. Request the CSS URL above using the recorded modern browser User-Agent. Review changes to families, weights, and the `latin` blocks.
2. Download only those official `fonts.gstatic.com` WOFF2 URLs. Preserve DM Sans 100–1000, Inter Tight 100–900, IBM Plex Mono 400/500, and Geist Pixel 400; inspect the font metadata rather than inferring variable support from filenames.
3. Retrieve the families' `OFL.txt` files from a pinned `google/fonts` commit and preserve their copyright notices.
4. Update `provenance.json`, hashes in this guide, and any changed license notices. Confirm the layout still references only local files.
5. Run the project's normal validation and inspect typography after the update. Do not introduce a network download into setup or build scripts.
