"""Raw schrijven/lezen naar een Windows-schijf met exclusieve toegang.

Waarom: met een gedeelde handle op \\\\.\\PhysicalDriveN kan Windows tijdens het
schrijven de nieuwe partitie mounten. De handle wordt dan ongeldig en je krijgt
"Bad file descriptor" (os error 9). Een exclusieve handle (share mode 0)
voorkomt dat Windows de volumes aanraakt.
"""
import ctypes
import time
from ctypes import wintypes

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
OPEN_EXISTING = 3
FILE_BEGIN = 0
INVALID_HANDLE = ctypes.c_void_p(-1).value

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.CreateFileW.restype = wintypes.HANDLE
k32.CreateFileW.argtypes = [
    wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
    wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE,
]
k32.SetFilePointerEx.argtypes = [
    wintypes.HANDLE, ctypes.c_longlong, ctypes.POINTER(ctypes.c_longlong), wintypes.DWORD,
]
k32.ReadFile.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p,
]
k32.WriteFile.argtypes = k32.ReadFile.argtypes
k32.FlushFileBuffers.argtypes = [wintypes.HANDLE]
k32.CloseHandle.argtypes = [wintypes.HANDLE]


class RawDisk:
    """Exclusieve handle op een fysieke schijf of volume."""

    def __init__(self, path, writable=True, retries=15, delay=2):
        access = GENERIC_READ | (GENERIC_WRITE if writable else 0)
        last = 0
        for _ in range(retries):
            handle = k32.CreateFileW(path, access, 0, None, OPEN_EXISTING, 0, None)
            if handle not in (None, INVALID_HANDLE):
                self.handle = handle
                return
            last = ctypes.get_last_error()
            time.sleep(delay)
        raise OSError(last, f"kan {path} niet exclusief openen (Windows-fout {last})")

    def _seek(self, offset):
        new = ctypes.c_longlong(0)
        if not k32.SetFilePointerEx(self.handle, offset, ctypes.byref(new), FILE_BEGIN):
            raise OSError(ctypes.get_last_error(), "SetFilePointerEx mislukt")

    def write_at(self, offset, data):
        self._seek(offset)
        pos = 0
        while pos < len(data):
            rest = bytes(data[pos:])
            buf = ctypes.create_string_buffer(rest, len(rest))
            done = wintypes.DWORD(0)
            ok = k32.WriteFile(self.handle, buf, len(rest), ctypes.byref(done), None)
            if not ok:
                raise OSError(ctypes.get_last_error(), "WriteFile mislukt")
            if done.value == 0:
                raise OSError(ctypes.get_last_error(), "WriteFile schreef 0 bytes")
            pos += done.value

    def read_at(self, offset, size):
        self._seek(offset)
        buf = ctypes.create_string_buffer(8 * 1024 * 1024)
        out = bytearray()
        while len(out) < size:
            want = min(size - len(out), 8 * 1024 * 1024)
            done = wintypes.DWORD(0)
            if not k32.ReadFile(self.handle, buf, want, ctypes.byref(done), None):
                raise OSError(ctypes.get_last_error(), "ReadFile mislukt")
            if done.value == 0:
                break
            out += buf.raw[: done.value]
        return bytes(out)

    def flush(self):
        k32.FlushFileBuffers(self.handle)

    def close(self):
        if getattr(self, "handle", None) not in (None, INVALID_HANDLE):
            k32.CloseHandle(self.handle)
            self.handle = INVALID_HANDLE


if __name__ == "__main__":
    # Zelftest op een gewoon bestand (geen administrator nodig).
    import hashlib
    import os
    import tempfile

    path = os.path.join(tempfile.gettempdir(), "rawdisk_selftest.bin")
    with open(path, "wb") as f:
        f.write(b"\0" * (3 * 1024 * 1024))
    d = RawDisk(path)
    payload = hashlib.sha256(b"test").digest() * 4096
    d.write_at(1024 * 1024, payload)
    d.flush()
    back = d.read_at(1024 * 1024, len(payload))
    d.close()
    assert back == payload, "teruglezen komt niet overeen"
    print("RawDisk zelftest ok")
