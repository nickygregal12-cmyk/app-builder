#!/usr/bin/env python3
"""Claim the one-time enable decision, atomically, or refuse.

This is the durable half of "one decision, one attempt". The cryptographic
decision says what is authorised; this says it has not been used yet, and the
two have to reinforce each other because neither substitutes for the other.

The mechanism is `rename(2)` and the reason is that rename is atomic: two
concurrent claimants cannot both move the same file, so exactly one wins and the
loser finds the source already gone. That property is the whole protocol.

It is also why this is a program rather than a line of shell. The previous
implementation was `mv -n /etc/app-builder/... /run/app-builder-model-canary/...`
and those are different filesystems — ext4 and tmpfs. `rename(2)` across a mount
boundary fails EXDEV, so `mv` silently falls back to copy-then-unlink. That is
not atomic, and interrupting it leaves the decision present in /etc *and* copied
into /run: not spent, therefore replayable, which is the exact failure the claim
exists to prevent. `mv` reports success either way, so nothing noticed.

So this refuses EXDEV rather than working around it. A claim that cannot be made
atomically is not made at all. In practice the claim sits beside the
authoritative decision, in the same root-owned directory on the same filesystem,
which also means "spent" survives a reboot — a claim in /run would not.

Nothing here reads or prints the decision. Claiming is a rename; the contents
are the canary's business.
"""

import argparse
import errno
import os
import stat
import sys


def fail(message, code=1):
    print(f"claim-model-decision: {message}", file=sys.stderr)
    raise SystemExit(code)


def claim(source, destination):
    # The source must be a real file rather than a link to one. It lives in a
    # root-owned directory the runtime user cannot write, so this is a
    # consistency check rather than a race to win, but a symlink here would mean
    # the authority is not where it claims to be.
    try:
        st = os.lstat(source)
    except FileNotFoundError:
        fail("no authorised decision to claim")
    except OSError as error:
        fail(f"the authorised decision could not be inspected ({errno.errorcode.get(error.errno, error.errno)})")

    if stat.S_ISLNK(st.st_mode):
        fail("the authorised decision is a symbolic link; refusing to claim it")
    if not stat.S_ISREG(st.st_mode):
        fail("the authorised decision is not a regular file")
    if st.st_size == 0:
        fail("the authorised decision is empty")

    # A leftover claim means a previous run did not finish. Fail closed and let
    # somebody look, rather than silently overwriting an authorisation whose
    # fate is unknown.
    if os.path.lexists(destination):
        fail(
            f"a previous claim is still present at {destination}. "
            "A run may not have finished; inspect it, remove it deliberately, and mint a fresh decision.",
            code=2,
        )

    # Same filesystem or nothing. This is the check that the old `mv` skipped.
    if os.stat(os.path.dirname(source) or ".").st_dev != os.stat(os.path.dirname(destination) or ".").st_dev:
        fail(
            "the claim would cross a filesystem boundary, where rename is not atomic. "
            "Refusing rather than falling back to a copy: a non-atomic claim can leave the decision unspent.",
            code=3,
        )

    try:
        os.rename(source, destination)
    except OSError as error:
        if error.errno == errno.ENOENT:
            # Another claimant won the race and moved it first. This is the
            # losing side of the property, and it is a refusal, not an error.
            fail("the decision was claimed by another run", code=2)
        if error.errno == errno.EXDEV:
            fail("rename returned EXDEV; the claim must not fall back to a copy", code=3)
        fail(f"the decision could not be claimed ({errno.errorcode.get(error.errno, error.errno)})")

    print(f"claim-model-decision: claimed; {source} no longer exists")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Atomically claim the one-time model enable decision.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--destination", required=True)
    return claim(parser.parse_args(argv).source, parser.parse_args(argv).destination)


if __name__ == "__main__":
    raise SystemExit(main())
