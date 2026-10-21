# Vela Explorer for macOS

A Windows 11 File Explorer–inspired macOS desktop file manager, with a **Rust filesystem engine** and a React/TypeScript UI rendered in **Tauri 2**. Version **0.3** adds an animated Apple-inspired glass mode and a local Space Cleaner that finds large files without deleting anything automatically.

### 0.3 design direction

- Familiar Windows Explorer productivity: sidebar, tabbed folders, context menus, multi-selection, toolbar and details pane.
- Apple-inspired translucent navigation and controls with subtle depth, shadows and fluid easing. **This is CSS-based styling inside Tauri WebView, not native Apple `Liquid Glass` from SwiftUI/AppKit.**
- Switch between Glass and Classic looks; light/dark mode. Respects macOS **Reduce motion** preference with CSS `prefers-reduced-motion`.
- Motion is decorative only; navigating, selecting, scanning and cleaning work without animations.

### Space Cleaner — actual Rust functionality

1. Open **Space Cleaner** in the sidebar. Select a minimum size (50 MB, 100 MB, 500 MB, 1 GB).
2. Click **Scan for large files** to scan Home (or **Choose folder** to scan any accessible folder). This reads filesystem metadata on a background Rust worker.
3. Review scanned bytes, matching file totals, disk capacity, and file-type breakdown (Videos, Archives, Images, Audio, Documents, Other).
4. Search, filter, sort and inspect large files. **Quick Look** and **Show in Finder** use native macOS tools.
5. Select only unwanted files, click **Review & move to Trash**, inspect the confirmation and confirm. The app uses macOS Trash; **never permanent erase or auto-clean.**

**Scan boundaries:** ignores hidden items by default; skips symlinks and application bundles; excludes `~/Library` during a general Home scan (choose Library directly to inspect it). A scan stops after 250,000 entries and returns up to the 500 largest matching files. A report flags incomplete scans and unreadable locations. The category totals describe the scanned content, not the whole drive. Disk used/free comes from the filesystem. macOS filesystem permissions are still respected. Large scans might take time; progress indicates the scan is running, not a percentage complete.



## What works

| Feature | Detail |
|---|---|
| Browse files/folders | Real filesystem via Rust, user home, standard Mac locations, volumes |
| Multi-tab explorer | Tabs, back/forward/up navigation, editable path bar, native folder chooser |
| Explore visually | Details list, grid view, file icons, folders-first sorting |
| Search | Case-insensitive recursive filename search (up to depth 7, 350 results) |
| File management | Create folder, rename, copy, cut/move, paste, duplicate, Trash (reversible) |
| Selections | Single selection, Cmd-select, Shift-range-select, Cmd+A |
| Context menu | Open, Quick Look, reveal in Finder, copy/cut, duplicate, rename, pin, Trash |
| Sidebar | Home, Desktop, Documents, Downloads, Pictures, Music, Movies, Applications, mounted volumes |
| Preview | File metadata, PNG/JPEG/GIF/WebP/SVG/BMP images under 6MB, source/text snippets, native macOS Quick Look |
| Preferences | Hidden files toggle, pinned favourites persisted locally, light/dark styles |
| Drag and drop | Internal item-to-folder drops; **copy by default**, Shift+drop to move |
| Space Cleaner | Local Rust scanner, large-file table, file categories, disk usage, explicit Trash review |
| Updated appearance | Glass/Classic switch, layered translucent navigation, motion with reduced-motion support |

The **web demo** (`npm run dev`) deliberately uses *sample data* when opened outside Tauri, so it won't accidentally alter real files. The installed desktop app performs actual operations. 

**Offline design preview:** double-click `preview.html` (or `OPEN_PREVIEW.command`). It needs no dependency installation and supports simulated navigation, search, list/grid views, selection, new folders, rename and Trash, plus the new interactive Space Cleaner dashboard. **All preview files and storage numbers are fictional.** This is an independent static demonstration; the actual Tauri interface lives in `src/App.tsx`.

### Fastest route: build your own Mac app

1. On a Mac with **Xcode Command Line Tools**, **Rust** and **Node.js 22** installed, extract the project ZIP.
2. Double-click `BUILD_ON_MAC.command` (or run `bash BUILD_ON_MAC.command` in Terminal).
3. Find the `.dmg` in `src-tauri/target/release/bundle/dmg` and open it to install Vela Explorer.

The script compiles on your Mac. **The downloaded ZIP is source, not a precompiled `.app` or `.dmg`.** This source project has not yet passed native Mac compilation and runtime validation. For a build without owning a Mac, upload the project to a GitHub repository and run the included **Build Vela Explorer (macOS)** GitHub Actions workflow; it has separate Apple Silicon and Intel jobs.

### macOS setup (Apple Silicon or Intel)

1. Install Xcode Command Line Tools and [Rust](https://rustup.rs/):

   ```bash
   xcode-select --install
   # Install Rust from https://rustup.rs if not installed.
   rustup update stable
   ```

2. Install Node.js 20.19+ (Node 22 recommended).
3. In Terminal, enter the extracted folder and install JS dependencies:

   ```bash
   cd vela-explorer
   npm install
   ```

4. Run the *actual desktop app* in development mode:

   ```bash
   npm run tauri dev
   ```

5. Build the signed-locally/unsigned-release `.app` and `.dmg` on your Mac:

   ```bash
   npm run tauri build
   ```

   Look in `src-tauri/target/release/bundle/macos/` and `src-tauri/target/release/bundle/dmg/`.
   For distributing to other Macs, Apple Developer ID signing and notarization are recommended. Apple's Gatekeeper may warn about unsigned builds.

### Preview UI without Rust

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:1420`. A yellow banner indicates browser-demo mode. You **must** launch through `npm run tauri dev` to browse real Mac files.

## Keyboard shortcuts

| Shortcut | Function |
|---|---|
| `⌘ T` / `⌘ W` | New tab / close tab |
| `⌘ [` / `⌘ ]` | Back / forward |
| `⌘ L` | Edit location/path |
| `⌘ F` | Search folder |
| `⌘ ⇧ N` | Create folder |
| `⌘ A` | Select all |
| `⌘ C` / `⌘ X` / `⌘ V` | Copy / cut / paste **within Vela** |
| `F2` | Rename selected item |
| `⌘ Delete` | Move selection to macOS Trash |
| `⌘ R` | Refresh |
| `⌘ D` | Duplicate selected item(s) |
| `⌘ I` | Toggle details pane |
| `⌘ ⇧ .` | Toggle hidden files |
| `Space` | Native Quick Look (selected item) |
| `Enter` | Open selected file/folder |

## Important limitations (v0.2 prototype)

- This is a **functional starter app**, not a complete Finder replacement. Native Quick Look opens an external macOS preview window (`qlmanage -p`); there is no embedded Quick Look framework integration. It doesn't include Finder extensions, iCloud sync status, thumbnails for HEIC, Spotlight indexing, disk-usage analysis, network share discovery, or OS clipboard interoperability.
- Cut/copy/paste operates **inside Vela only**, not between Finder and Vela.
- Cross-volume moves return an error instead of risking an incomplete move. Use copy, verify, then Trash the original. Failed copy operations attempt to clean up incomplete targets.
- The Rust engine refuses to rename, move or Trash selected macOS system root directories and the user's home directory. Individual files within user directories can still be managed, subject to filesystem access permissions.
- Folder search is **not indexed**, so it can be slow for enormous folders; returns up to 350 matches and explores at most eight nested levels.
- macOS privacy controls may require granting Desktop/Documents/Downloads access under **System Settings → Privacy & Security**. Tauri apps run unsandboxed by default, but macOS still governs protected locations.
- In-app drag/drop handles **Vela files into Vela folders**; external Finder drops are not implemented. Always copy critical data before testing a file manager prototype.
- Rust commands are filesystem-capable by design; keep the Tauri WebView local-only and do not load untrusted websites into the app.
- No native macOS `.dmg` was compiled in the creation environment, which is Linux and lacks a macOS Rust target/toolchain. You should **build and verify on a Mac** before trusting it with important files.

## Architecture

```text
src/
  App.tsx          Explorer UI, events, tabs, commands, modal dialogs
  api.ts           Typed bridge to Rust commands + sample browser UI data
  style.css        Windows-inspired responsive design
src-tauri/
  src/lib.rs       Actual file browsing + operations, previews, search
  src/main.rs      Entry point
  capabilities/    Limited JS API permission for native folder picker
  icons/           App icons (PNG, ICNS, ICO)
.github/workflows/ GitHub Actions macOS build workflow
```

Built with Tauri 2 and Rust; intended for macOS 12.0+ (newer versions recommended).

## Optional GitHub macOS build

The repository includes `.github/workflows/macos-build.yml`. If you push the folder contents (not the outer ZIP) to the root of a GitHub repository, choose **Actions → Build Vela Explorer (macOS) → Run workflow**. A successful run publishes a downloadable build artifact. This CI workflow is included but has not been executed here; it also checks frontend types and runs Rust unit tests.

## Troubleshooting

- **`cargo: command not found`**: install Rust from rustup, then reopen Terminal.
- **Xcode tool errors**: `xcode-select --install` and ensure you accept the license.
- **Permission denied**: in System Settings → Privacy & Security, grant the necessary folder permissions or choose another folder.
- **App won't open on someone else's Mac**: distribute a notarized/signature-verified build rather than telling people to bypass Gatekeeper.
