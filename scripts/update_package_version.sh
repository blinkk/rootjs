#!/bin/bash
#
# Script to manually bump package versions.
# Usage: ./update_package_version.sh 1.2.3

if [ -z "$1" ]; then
  echo "Usage: $0 <new_version>"
  exit 1
fi

NEW_VERSION=$1

# Define the list of package.json files to update
FILES=(
  "./packages/create-root/package.json"
  "./packages/rds/package.json"
  "./packages/root/package.json"
  "./packages/root-cms/package.json"
  "./packages/root-password-protect/package.json"
)

for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    echo "Updating version in $FILE to $NEW_VERSION"
    if command -v jq &> /dev/null; then
      TMP_FILE=$(mktemp)
      jq --arg v "$NEW_VERSION" '.version = $v' "$FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$FILE"
    else
      sed -i.bak -E "s/\"version\": \"[^\"]+\"/\"version\": \"$NEW_VERSION\"/" "$FILE"
      rm "${FILE}.bak"
    fi
  else
    echo "Warning: File not found - $FILE"
  fi
done

echo "Done. Updated package.json files to version $NEW_VERSION."
