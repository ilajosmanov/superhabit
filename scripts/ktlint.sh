#!/usr/bin/env sh
# Runs a pinned ktlint on our Kotlin sources (not nitrogen output). Rules live in .editorconfig.
set -eu

version=1.8.0
sha256=369ad2b789f95a011f807e1fcb690ccef80bd7cd014fd139e73ae82dcc0baeab
jar="node_modules/.cache/ktlint/ktlint-cli-$version-all.jar"

if [ ! -f "$jar" ]; then
  mkdir -p "$(dirname "$jar")"
  curl -sSfL -o "$jar.tmp" "https://repo1.maven.org/maven2/com/pinterest/ktlint/ktlint-cli/$version/ktlint-cli-$version-all.jar"
  echo "$sha256  $jar.tmp" | sha256sum -c --quiet - || { rm -f "$jar.tmp"; exit 1; }
  mv "$jar.tmp" "$jar"
fi

exec java -jar "$jar" --relative "$@" 'modules/*/android/src/**/*.kt'
