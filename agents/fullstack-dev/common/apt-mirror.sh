#!/bin/sh
# Points apt at another Ubuntu mirror while an image stage installs packages, and back to Ubuntu's own sources at
# the end of the stage, so the image keeps them. The Dockerfile mounts it during the build; it is not in the image.
#
#   apt-mirror.sh use MIRROR   replace archive.ubuntu.com and security.ubuntu.com with MIRROR (does nothing when empty)
#   apt-mirror.sh restore      put the original sources back and drop the package lists fetched from the mirror
#
# CI passes http://azure.archive.ubuntu.com/ubuntu for amd64, since Ubuntu's own servers are often slow from GitHub's
# runners. Local builds pass nothing and use Ubuntu's own sources.
set -eu

sources=/etc/apt/sources.list.d/ubuntu.sources
backup=/var/tmp/ubuntu.sources.before-mirror

case "${1:-}" in
  use)
    mirror="${2:-}"
    [ -n "${mirror}" ] || exit 0
    cp "${sources}" "${backup}"
    sed -i \
      -e "s|http://archive.ubuntu.com/ubuntu|${mirror}|g" \
      -e "s|http://security.ubuntu.com/ubuntu|${mirror}|g" \
      "${sources}"
    echo "apt uses ${mirror} for this stage"
    ;;
  restore)
    [ -f "${backup}" ] || exit 0
    mv "${backup}" "${sources}"
    rm -rf /var/lib/apt/lists/*
    echo "apt uses Ubuntu's own sources again"
    ;;
  *)
    echo "usage: apt-mirror.sh use MIRROR | restore" >&2
    exit 2
    ;;
esac
