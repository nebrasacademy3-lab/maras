"""Server-generated HTML only. No browser/JS, network, exec or URL file access."""
import base64
import ctypes
import errno
import json
import logging
import os
import re
import resource
import sys

MAX_INPUT = 4 * 1024 * 1024
MAX_OUTPUT = 20 * 1024 * 1024


def harden():
    if sys.platform != "linux" or os.geteuid() == 0:
        raise ValueError("PDF_PRIVILEGE_ISOLATION_REQUIRED")
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    # libseccomp automatically sets no_new_privs. This tightens the host filter;
    # it does not require SYS_ADMIN, user namespaces or a privileged container.
    lib = ctypes.CDLL("libseccomp.so.2")
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    lib.seccomp_rule_add.restype = ctypes.c_int
    lib.seccomp_load.argtypes = [ctypes.c_void_p]
    lib.seccomp_load.restype = ctypes.c_int
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    context = lib.seccomp_init(0x7FFF0000)  # SCMP_ACT_ALLOW
    if not context:
        raise ValueError("PDF_ISOLATION_UNAVAILABLE")
    try:
        for name in ("socket", "socketpair", "connect", "bind", "listen", "accept", "accept4",
                     "sendto", "sendmsg", "sendmmsg", "recvfrom", "recvmsg", "recvmmsg",
                     "execve", "execveat", "fork", "vfork", "ptrace"):
            number = lib.seccomp_syscall_resolve_name(name.encode("ascii"))
            if number >= 0 and lib.seccomp_rule_add(context, 0x00050000 | errno.EPERM, number, 0) != 0:
                raise ValueError("PDF_ISOLATION_UNAVAILABLE")
        # Font layout needs threads, not child processes. Returning ENOSYS for
        # clone3 makes libc use clone, where flags are inspectable by seccomp.
        class Compare(ctypes.Structure):
            _fields_ = [("arg", ctypes.c_uint), ("op", ctypes.c_uint),
                        ("mask", ctypes.c_uint64), ("value", ctypes.c_uint64)]
        lib.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint, ctypes.POINTER(Compare)]
        lib.seccomp_rule_add_array.restype = ctypes.c_int
        clone3 = lib.seccomp_syscall_resolve_name(b"clone3")
        if clone3 >= 0 and lib.seccomp_rule_add(context, 0x00050000 | errno.ENOSYS, clone3, 0) != 0:
            raise ValueError("PDF_ISOLATION_UNAVAILABLE")
        comparison = Compare(0, 7, 0x00010000, 0)  # SCMP_CMP_MASKED_EQ / CLONE_THREAD
        clone = lib.seccomp_syscall_resolve_name(b"clone")
        if clone < 0 or lib.seccomp_rule_add_array(context, 0x00050000 | errno.EPERM, clone, 1, ctypes.byref(comparison)) != 0:
            raise ValueError("PDF_ISOLATION_UNAVAILABLE")
        if lib.seccomp_load(context) != 0:
            raise ValueError("PDF_ISOLATION_UNAVAILABLE")
    finally:
        lib.seccomp_release(context)


def main():
    harden()
    logging.disable(logging.CRITICAL)  # No private document content/paths in logs.
    from weasyprint import HTML
    blocked = []

    def fetch_asset(url, *args, **kwargs):
        # The sole URL asset is the server-owned PNG logo, embedded by Node.
        match = re.fullmatch(r"data:image/png;base64,([A-Za-z0-9+/=]+)", url)
        if not match or len(match[1]) > 3 * 1024 * 1024:
            blocked.append(True)
            raise ValueError("PDF_ASSET_INVALID")
        data = base64.b64decode(match[1], validate=True)
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            blocked.append(True)
            raise ValueError("PDF_ASSET_INVALID")
        return {"string": data, "mime_type": "image/png"}

    raw = sys.stdin.buffer.read(MAX_INPUT + 1)
    if len(raw) > MAX_INPUT or not raw.startswith(b"<!doctype html>"):
        raise ValueError("PDF_INPUT_INVALID")
    doc = HTML(string=raw.decode("utf-8"), url_fetcher=fetch_asset).render()
    if blocked:
        raise ValueError("PDF_ASSET_INVALID")
    if not 1 <= len(doc.pages) <= 120:
        raise ValueError("PDF_OUTPUT_LIMIT")
    output = doc.write_pdf()
    if blocked or len(output) > MAX_OUTPUT or not output.startswith(b"%PDF-"):
        raise ValueError("PDF_OUTPUT_INVALID")
    sys.stdout.buffer.write(output)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error) if re.fullmatch(r"PDF_[A-Z_]+", str(error)) else "PDF_RENDER_UNAVAILABLE"
        sys.stderr.write(json.dumps({"code": code}, separators=(",", ":")) + "\n")
        sys.exit(1)
