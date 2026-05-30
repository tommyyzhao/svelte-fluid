#!/usr/bin/env bash
set -euo pipefail

provider="agent"

while [ "$#" -gt 0 ]; do
	case "$1" in
		--provider)
			if [ "$#" -lt 2 ]; then
				echo "missing value for --provider" >&2
				exit 2
			fi
			provider="$2"
			shift 2
			;;
		--provider=*)
			provider="${1#--provider=}"
			shift
			;;
		*)
			echo "unknown argument: $1" >&2
			exit 2
			;;
	esac
done

provider="$(printf '%s' "$provider" | tr -c '[:alnum:]_.-' '-')"
provider="${provider:-agent}"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
memory_dir="$repo_root/.agents/memories/fluid-sessions"

mkdir -p "$memory_dir"
tmp="$(mktemp "$memory_dir/.pending.XXXXXX")"

cleanup() {
	rm -f "$tmp"
}
trap cleanup EXIT

cat > "$tmp"

if [ ! -s "$tmp" ]; then
	echo "refusing to save an empty session memory" >&2
	exit 1
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
dest="$memory_dir/$timestamp-$provider.md"
suffix=1

while [ -e "$dest" ]; do
	dest="$memory_dir/$timestamp-$provider-$suffix.md"
	suffix=$((suffix + 1))
done

mv "$tmp" "$dest"
trap - EXIT
chmod 600 "$dest" 2>/dev/null || true

ln -sfn "$(basename "$dest")" "$memory_dir/latest.md"
printf '%s\n' "$dest"
