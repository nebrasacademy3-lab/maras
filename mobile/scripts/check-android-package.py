"""Inspect the actual APK, not only source settings. No signing/private keys needed."""
import argparse
import json
import struct
import zipfile
from pathlib import Path


def inspect(path: Path) -> dict:
    checked = []
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            if not entry.filename.startswith("lib/") or not entry.filename.endswith(".so"):
                continue
            if entry.file_size > 160 * 1024 * 1024:
                raise ValueError("Unexpected native library size")
            data = archive.read(entry)
            if data[:4] != b"\x7fELF" or data[5] != 1:
                raise ValueError("Unexpected native library format: " + entry.filename)
            if data[4] == 2:
                offset = struct.unpack_from("<Q", data, 32)[0]
                size, count = struct.unpack_from("<HH", data, 54)
                align_offset, align_format = 48, "<Q"
            elif data[4] == 1:
                offset = struct.unpack_from("<I", data, 28)[0]
                size, count = struct.unpack_from("<HH", data, 42)
                align_offset, align_format = 28, "<I"
            else:
                raise ValueError("Invalid ELF class")
            if not size or count > 1000 or offset + size * count > len(data):
                raise ValueError("Invalid ELF program headers")
            alignments = []
            for index in range(count):
                header = offset + index * size
                if struct.unpack_from("<I", data, header)[0] == 1:
                    alignment = struct.unpack_from(align_format, data, header + align_offset)[0]
                    if alignment < 16384:
                        raise ValueError("Native library is not 16 KB aligned: " + entry.filename)
                    alignments.append(alignment)
            if not alignments:
                raise ValueError("No loadable segments in " + entry.filename)
            checked.append({"path": entry.filename, "minimum_alignment": min(alignments)})
    if not checked:
        raise ValueError("No native libraries found")
    return {"apk": path.name, "native_libraries": len(checked), "elf_16kb_aligned": True, "libraries": checked, "store_signed": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    args = parser.parse_args()
    print(json.dumps(inspect(args.apk), indent=2))
