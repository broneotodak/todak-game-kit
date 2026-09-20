#!/usr/bin/env bash
# Todak Workbench installer — Mac and Linux. Demonstrator, not the kit.
# What it does: checks Node and VS Code, installs the three editor extensions and the Todak sidebar,
# finds or downloads Godot 4.7.2 with the web export templates, and writes the environment the kit needs.
set -euo pipefail
KIT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "Todak Workbench installer · kit at $KIT"
command -v node >/dev/null || { echo "Node 18+ is required (https://nodejs.org)"; exit 1; }
command -v code >/dev/null || { echo "VS Code's 'code' command is required (VS Code → Command Palette → Shell Command: Install 'code' command)"; exit 1; }
for ext in anthropic.claude-code openai.chatgpt geequlim.godot-tools; do code --install-extension "$ext" --force >/dev/null && echo "  extension: $ext"; done
if ls "$KIT"/workbench/todak-sidebar/*.vsix >/dev/null 2>&1; then code --install-extension "$KIT"/workbench/todak-sidebar/*.vsix --force >/dev/null && echo "  extension: Todak sidebar"; else echo "  (Todak sidebar .vsix not built yet; see workbench/todak-sidebar/README.md)"; fi
# Godot 4.7.2
OS="$(uname -s)"; GODOT_DIR="$HOME/.todak/godot"; mkdir -p "$GODOT_DIR"
if [ -z "${GODOT_BIN:-}" ]; then
  if [ "$OS" = "Darwin" ]; then
    [ -x "$GODOT_DIR/Godot.app/Contents/MacOS/Godot" ] || { echo "  downloading Godot 4.7.2 for Mac…"; curl -sL -o /tmp/godot.zip https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_macos.universal.zip && unzip -oq /tmp/godot.zip -d "$GODOT_DIR" && rm /tmp/godot.zip; }
    GODOT_BIN="$GODOT_DIR/Godot.app/Contents/MacOS/Godot"; T="$HOME/Library/Application Support/Godot/export_templates/4.7.2.stable"
  else
    [ -x "$GODOT_DIR/Godot_v4.7.2-stable_linux.x86_64" ] || { echo "  downloading Godot 4.7.2 for Linux…"; curl -sL -o /tmp/godot.zip https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_linux.x86_64.zip && unzip -oq /tmp/godot.zip -d "$GODOT_DIR" && rm /tmp/godot.zip; }
    GODOT_BIN="$GODOT_DIR/Godot_v4.7.2-stable_linux.x86_64"; T="$HOME/.local/share/godot/export_templates/4.7.2.stable"
  fi
fi
[ "$OS" = "Darwin" ] && T="$HOME/Library/Application Support/Godot/export_templates/4.7.2.stable" || T="${T:-$HOME/.local/share/godot/export_templates/4.7.2.stable}"
if [ ! -f "$T/web_nothreads_release.zip" ]; then
  echo "  downloading the web export templates (about 1 GB, one time)…"; mkdir -p "$T"
  curl -sL -o /tmp/tpz.zip https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz
  unzip -oq -j /tmp/tpz.zip "templates/web_*" "templates/version.txt" -d "$T"; rm /tmp/tpz.zip
fi
echo "  Godot: $GODOT_BIN"
# environment for the desks and the kit
ENVF="$HOME/.todak/workbench.env"; mkdir -p "$HOME/.todak"
{ echo "export GODOT_BIN=\"$GODOT_BIN\""; echo "export TGK_KIT=\"$KIT\""; echo "export PATH=\"$KIT/bin:\$PATH\""; } > "$ENVF"
ln -sf "$KIT/bin/tgk.mjs" "$KIT/bin/tgk" 2>/dev/null || true
grep -q 'todak/workbench.env' "$HOME/.zshrc" 2>/dev/null || echo "[ -f \"$ENVF\" ] && source \"$ENVF\"" >> "$HOME/.zshrc"
grep -q 'todak/workbench.env' "$HOME/.bashrc" 2>/dev/null || echo "[ -f \"$ENVF\" ] && source \"$ENVF\"" >> "$HOME/.bashrc"
echo "Done. Open a new terminal, then: tgk new pong my-pong --student <name> --week 3 && code my-pong"
echo "Import the profile once: VS Code → Profiles → Import → $KIT/workbench/profile/todak-workbench.code-profile.json"
