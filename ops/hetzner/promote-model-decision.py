#!/usr/bin/env python3
"""Promote a staged enable decision across the privilege boundary, safely.

The signer is unprivileged and writes into a directory it owns. Root then
publishes the result. That handoff is the whole attack surface, because a
process sharing the signer's UID can replace the staged file between the moment
it is written and the moment root reads it.

The previous implementation was `install -m 0600 staging/decision.json dest`.
`install` dereferences its source, so replacing the staged file with a symlink
made root copy *the target* — turning a promotion step into a root file-read
oracle. `/var/lib/systemd/credential.secret` is root-only and is the key every
encrypted credential on the host is sealed with, so that primitive defeated the
entire design it was meant to establish.

The fix is not a better sequence of path-based checks. Any `test path; stat
path; copy path` sequence re-resolves the name each time and can observe a
different file each time. So this program resolves the name exactly once:

    fd = open(source, O_RDONLY | O_NOFOLLOW)   <- a symlink here is ELOOP
    st = fstat(fd)                             <- describes what was opened
    data = read(fd)                            <- the same object, no re-lookup

Every validation is against `st`, and the bytes come from `fd`. There is no
second name resolution for an attacker to win, so validation and read cannot
observe different files.

Publication is equally deliberate: the temporary file is created inside the
destination directory with O_EXCL through a directory descriptor opened
O_NOFOLLOW, written, fsynced, and only then renamed. A partial write is never
reachable under the authoritative name, and the destination cannot be reached
through a symlink somebody planted.

Nothing here prints file contents. A failure names the reason, never the bytes.
"""

import argparse
import errno
import os
import stat
import sys

# A decision is a small JSON document. Anything larger is not one, and reading
# an unbounded amount from a file an attacker may have chosen is how a check
# becomes a denial of service.
MAX_DECISION_BYTES = 256 * 1024


def fail(message):
    """Refuse, naming the reason and never the content."""
    print(f"promote-model-decision: {message}", file=sys.stderr)
    raise SystemExit(1)


def open_staged(source, expected_uid):
    """Open the staged decision and validate the descriptor, not the path."""
    # O_NONBLOCK matters as much as O_NOFOLLOW here, and for a different attack.
    # O_NOFOLLOW refuses a symlink, but a FIFO is not a symlink: opening one
    # read-only blocks until somebody opens the write end, so a staged FIFO
    # would hang this program — as root, holding the boundary open — for as long
    # as the attacker liked. With O_NONBLOCK the open returns immediately and
    # `fstat` below refuses it for what it is. (This repository's own regression
    # test found that by hanging.)
    try:
        fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as error:
        if error.errno in (errno.ELOOP, errno.EMLINK):
            fail("the staged decision is a symbolic link; refusing to follow it")
        if error.errno == errno.ENOENT:
            fail("no staged decision was produced")
        fail(f"the staged decision could not be opened ({errno.errorcode.get(error.errno, error.errno)})")

    try:
        st = os.fstat(fd)

        # A FIFO would block this program forever; a device could return
        # anything at all; a directory or socket is simply not a decision.
        if not stat.S_ISREG(st.st_mode):
            fail("the staged decision is not a regular file")

        # A hardlink means a second name for these bytes exists somewhere the
        # signer does not control, so the file root is about to publish is not
        # necessarily the file the signer wrote.
        if st.st_nlink != 1:
            fail("the staged decision has more than one link")

        if expected_uid is not None and st.st_uid != expected_uid:
            fail(f"the staged decision is owned by uid {st.st_uid}, not the signer")

        # The signer runs with UMask=0077, so anything group- or
        # world-accessible was not written by the unit as configured.
        if st.st_mode & 0o077:
            fail(f"the staged decision has mode {st.st_mode & 0o777:04o}; it must not be group or world accessible")

        if st.st_size == 0:
            fail("the staged decision is empty")
        if st.st_size > MAX_DECISION_BYTES:
            fail(f"the staged decision is {st.st_size} bytes; a decision is not that large")

        data = b""
        while len(data) <= MAX_DECISION_BYTES:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            data += chunk
        if not data:
            fail("the staged decision read as empty")
        if len(data) > MAX_DECISION_BYTES:
            fail("the staged decision grew beyond the permitted size while being read")
        return data
    finally:
        os.close(fd)


def publish(data, destination, become_root):
    """Write the decision under a temporary name, then rename it into place."""
    directory = os.path.dirname(destination) or "."
    name = os.path.basename(destination)

    # The destination directory is resolved once too, and must be a real
    # directory rather than a link into somewhere else.
    try:
        dir_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError:
        fail(f"the destination directory {directory} could not be opened as a directory")

    temporary = f".{name}.incoming"
    try:
        try:
            os.unlink(temporary, dir_fd=dir_fd)
        except FileNotFoundError:
            pass

        # O_EXCL so this cannot be pointed at an existing file, and 0600 from
        # creation rather than chmod'd afterwards.
        out = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=dir_fd)
        try:
            if become_root:
                os.fchown(out, 0, 0)
            os.fchmod(out, 0o600)
            written = 0
            while written < len(data):
                written += os.write(out, data[written:])
            # The decision must survive a crash between the write and the
            # rename, or the authoritative name could point at nothing.
            os.fsync(out)
        finally:
            os.close(out)

        # Atomic: the authoritative name is either the previous decision or the
        # complete new one, never a partial write.
        os.rename(temporary, name, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
        os.fsync(dir_fd)
    except Exception:
        try:
            os.unlink(temporary, dir_fd=dir_fd)
        except OSError:
            pass
        raise
    finally:
        os.close(dir_fd)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Promote a staged model enable decision.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--signer-uid", type=int, default=None)
    arguments = parser.parse_args(argv)

    data = open_staged(arguments.source, arguments.signer_uid)
    publish(data, arguments.destination, become_root=os.geteuid() == 0)
    # Deliberately says nothing about the content.
    print(f"promote-model-decision: published {len(data)} bytes to {arguments.destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
