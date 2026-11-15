# Final SVG output qualification

The artifact producer at source commit
`633f023d46affc185031aaf5ab7398874e067fe4` emitted twelve final SVG files:
ASCII, selected multibyte and emoji payloads at each of L/M/Q/H error-correction
levels. Inkscape independently rasterized each final file, and zxing-cpp decoded
the resulting pixels. All twelve matched the exact UTF-8 bytes, text and
requested ECC level.

This is evidence for the selected SVG output cases. It does not qualify browser
accessibility, arbitrary artwork, animation scannability, hosted services or
production behavior. The producer's own grid round trip is not the independent
image-decoding evidence.

## Repository evidence

- [production-results.json](production-results.json) binds payloads and final SVG hashes.
- [source-manifest.json](source-manifest.json) binds all twenty artifact source modules to the selected commit/tree and file hashes.
- [independent-results.json](independent-results.json) records the rasterization and decoding observations, including final PNG hashes.
- [artifacts/](artifacts/) contains the twelve SVG files and their independently rasterized PNGs.

The independent execution was recorded on 15 November 2026 using Node 24.16.0,
Inkscape 1.4 (e7c3feb100), zxing-cpp 3.1.1 and Pillow 13.0.0. The repository's
portable producer reproduced byte-identical SVGs; the matching independent
observations are retained without repeating an unchanged decoding matrix.

## Reproduction

Use the project's pinned Node toolchain. Install Inkscape and the optional
Python validation tools separately; they are not product runtime dependencies
or prerequisites for `npm test`.

```sh
python3 -m venv /tmp/anqr-svg-tools
/tmp/anqr-svg-tools/bin/pip install zxing-cpp==3.1.1 Pillow==13.0.0
node scripts/validate-svg-output.mjs /tmp/anqr-svg-results
/tmp/anqr-svg-tools/bin/python scripts/validate-svg-output.py /tmp/anqr-svg-results
```

The [producer harness](../../../scripts/validate-svg-output.mjs) records the
actual checked-out commit and verifies source bytes against that commit. The
[independent harness](../../../scripts/validate-svg-output.py) verifies SVG hashes,
uses isolated renderer profile/cache directories under the requested output
directory, and returns failure if the twelve outputs do not all match. A run
at a different source or tool version is a new observation; it does not rewrite
this snapshot.
