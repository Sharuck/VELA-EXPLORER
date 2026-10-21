use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::{
    ffi::OsStr,
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_symlink: bool,
    size: u64,
    modified: Option<u64>,
    kind: String,
    extension: String,
    hidden: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Place {
    id: String,
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    home: String,
    username: String,
    places: Vec<Place>,
    volumes: Vec<Place>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Preview {
    preview_type: String,
    content: String,
    truncated: bool,
}

fn str_path(path: &Path) -> String { path.to_string_lossy().into_owned() }
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/Users"))
}
fn extension(path: &Path) -> String {
    path.extension().and_then(OsStr::to_str).unwrap_or("").to_ascii_lowercase()
}
fn kind_of(path: &Path, is_dir: bool) -> String {
    if is_dir { return "Folder".into(); }
    match extension(path).as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "heic" | "webp" | "svg" | "tiff" | "bmp" => "Image",
        "mp4" | "mov" | "mkv" | "avi" | "webm" => "Video",
        "mp3" | "wav" | "flac" | "aac" | "m4a" => "Audio",
        "pdf" => "PDF Document",
        "doc" | "docx" | "pages" | "rtf" | "odt" => "Document",
        "xls" | "xlsx" | "numbers" | "csv" => "Spreadsheet",
        "ppt" | "pptx" | "key" => "Presentation",
        "zip" | "rar" | "7z" | "tar" | "gz" | "dmg" => "Archive",
        "app" => "Application",
        "rs" | "js" | "jsx" | "ts" | "tsx" | "py" | "go" | "swift" | "html" | "css" | "json" | "toml" | "yaml" | "yml" => "Source Code",
        "txt" | "md" | "log" => "Text Document",
        "" => "File",
        s => return format!("{} File", s.to_uppercase()),
    }.into()
}

fn file_entry(path: &Path) -> Result<FileEntry, String> {
    let lmeta = fs::symlink_metadata(path).map_err(err)?;
    // Metadata follows a symlink so folder aliases remain navigable.
    let meta = fs::metadata(path).unwrap_or(lmeta.clone());
    let is_dir = meta.is_dir() && extension(path) != "app";
    let name = path.file_name().unwrap_or(path.as_os_str()).to_string_lossy().into_owned();
    let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs());
    Ok(FileEntry {
        hidden: name.starts_with('.'), kind: kind_of(path, is_dir),
        extension: extension(path), name, path: str_path(path),
        is_dir, is_symlink: lmeta.file_type().is_symlink(),
        size: if is_dir { 0 } else { meta.len() }, modified,
    })
}

fn ensure_dir(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_dir() { return Err(format!("Not a directory: {path}")); }
    Ok(p)
}

// Keep a prototype file manager from operating on critical macOS paths.
// Note: OS filesystem permissions remain the ultimate access boundary.
fn protected_location(path: &Path) -> bool {
    let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let home = home_dir().canonicalize().unwrap_or_else(|_| home_dir());
    if path == home { return true; }
    ["/", "/System", "/Library", "/Applications", "/Users", "/Volumes",
     "/private", "/bin", "/sbin", "/usr", "/dev", "/etc", "/var", "/tmp"]
        .iter().any(|root| path == Path::new(root))
}

#[tauri::command]
fn bootstrap() -> Bootstrap {
    let home = home_dir();
    let username = home.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Mac".into());
    let places = [
        ("home", "Home", home.clone()),
        ("desktop", "Desktop", home.join("Desktop")),
        ("documents", "Documents", home.join("Documents")),
        ("downloads", "Downloads", home.join("Downloads")),
        ("pictures", "Pictures", home.join("Pictures")),
        ("music", "Music", home.join("Music")),
        ("movies", "Movies", home.join("Movies")),
        ("applications", "Applications", PathBuf::from("/Applications")),
    ].into_iter().filter(|(_, _, path)| path.is_dir())
    .map(|(id, name, path)| Place { id: id.into(), name: name.into(), path: str_path(&path) }).collect();
    let mut volumes = vec![Place { id: "root".into(), name: "Macintosh HD".into(), path: "/".into() }];
    if let Ok(entries) = fs::read_dir("/Volumes") {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.file_name().and_then(OsStr::to_str).unwrap_or("") != "Macintosh HD" {
                let name = entry.file_name().to_string_lossy().into_owned();
                volumes.push(Place { id: name.clone(), name, path: str_path(&p) });
            }
        }
    }
    Bootstrap { home: str_path(&home), username, places, volumes }
}

#[tauri::command]
fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let p = ensure_dir(&path)?;
    let mut out = Vec::new();
    for item in fs::read_dir(p).map_err(err)? {
        let item = match item { Ok(v) => v, Err(_) => continue };
        if let Ok(file) = file_entry(&item.path()) {
            if show_hidden || !file.hidden { out.push(file); }
        }
    }
    Ok(out)
}

fn search_walk(dir: &Path, needle: &str, show_hidden: bool, depth: u8, out: &mut Vec<FileEntry>) {
    if depth > 7 || out.len() >= 350 { return; }
    let Ok(read_dir) = fs::read_dir(dir) else { return; };
    for entry in read_dir.flatten() {
        if out.len() >= 350 { break; }
        let path = entry.path();
        let Ok(item) = file_entry(&path) else { continue; };
        if !show_hidden && item.hidden { continue; }
        if item.name.to_lowercase().contains(needle) { out.push(item.clone()); }
        // Never recurse into symlinks: prevents filesystem cycles.
        if item.is_dir && !item.is_symlink { search_walk(&path, needle, show_hidden, depth + 1, out); }
    }
}

#[tauri::command]
fn search_files(root: String, query: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let root = ensure_dir(&root)?;
    let q = query.trim().to_lowercase();
    if q.is_empty() { return Ok(Vec::new()); }
    let mut out = Vec::new();
    search_walk(&root, &q, show_hidden, 0, &mut out);
    Ok(out)
}

fn valid_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\0') {
        return Err("Choose a valid name without '/' or a null character.".into());
    }
    Ok(name)
}

#[tauri::command]
fn create_folder(parent: String, name: String) -> Result<String, String> {
    let p = ensure_dir(&parent)?.join(valid_name(&name)?);
    if fs::symlink_metadata(&p).is_ok() { return Err("An item with this name already exists.".into()); }
    fs::create_dir(&p).map_err(err)?;
    Ok(str_path(&p))
}

#[tauri::command]
fn rename_item(path: String, new_name: String) -> Result<String, String> {
    let src = PathBuf::from(path);
    if fs::symlink_metadata(&src).is_err() { return Err("Item no longer exists.".into()); }
    if protected_location(&src) { return Err("For safety, protected system and home folders cannot be renamed.".into()); }
    let target = src.parent().ok_or("Cannot rename a filesystem root.")?.join(valid_name(&new_name)?);
    if target == src { return Ok(str_path(&src)); }
    if fs::symlink_metadata(&target).is_ok() { return Err("An item with this name already exists.".into()); }
    fs::rename(&src, &target).map_err(err)?;
    Ok(str_path(&target))
}

fn unique_destination(dir: &Path, name: &OsStr) -> PathBuf {
    let first = dir.join(name);
    if fs::symlink_metadata(&first).is_err() { return first; }
    let path = Path::new(name);
    let stem = path.file_stem().unwrap_or(name).to_string_lossy();
    let ext = path.extension().map(|s| format!(".{}", s.to_string_lossy())).unwrap_or_default();
    for i in 1..10000 {
        let label = if i == 1 { format!("{stem} copy{ext}") } else { format!("{stem} copy {i}{ext}") };
        let next = dir.join(label);
        if fs::symlink_metadata(&next).is_err() { return next; }
    }
    first
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(src).map_err(err)?;
    if meta.file_type().is_symlink() {
        #[cfg(unix)]
        {
            let target = fs::read_link(src).map_err(err)?;
            std::os::unix::fs::symlink(target, dst).map_err(err)?;
        }
        #[cfg(not(unix))]
        { return Err("Copying symlinks is not supported on this platform.".into()); }
    } else if meta.is_dir() {
        fs::create_dir(dst).map_err(err)?;
        for entry in fs::read_dir(src).map_err(err)? {
            let entry = entry.map_err(err)?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
    } else {
        fs::copy(src, dst).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
fn transfer_items(paths: Vec<String>, destination: String, cut: bool) -> Result<u32, String> {
    let dest = ensure_dir(&destination)?.canonicalize().map_err(err)?;
    let mut transferred = 0u32;
    for path in paths {
        let src = PathBuf::from(&path);
        let src_meta = fs::symlink_metadata(&src).map_err(err)?;
        if protected_location(&src) { return Err("Protected macOS locations cannot be copied or moved directly.".into()); }
        let src_canon = src.canonicalize().map_err(err)?;
        // Can't copy or move a real folder into itself (or a subdirectory).
        if src_meta.is_dir() && dest.starts_with(&src_canon) {
            return Err(format!("Cannot place '{}' inside itself.", str_path(&src)));
        }
        if cut && src.parent().and_then(|p| p.canonicalize().ok()).as_ref() == Some(&dest) {
            continue;
        }
        let name = src.file_name().ok_or("Cannot transfer a filesystem root.")?;
        let target = unique_destination(&dest, name);
        if cut {
            // Cross-volume moves fail safely rather than deleting the original before copy completes.
            fs::rename(&src, &target).map_err(|e| format!("Could not move '{}': {}. For cross-volume moves, copy then delete the source.", str_path(&src), e))?;
        } else {
            if let Err(copy_error) = copy_recursive(&src, &target) {
                // Clean up any incomplete new copy. Source is never touched by copy.
                if target.is_dir() { let _ = fs::remove_dir_all(&target); }
                else { let _ = fs::remove_file(&target); }
                return Err(format!("Could not copy '{}': {}", str_path(&src), copy_error));
            }
        }
        transferred += 1;
    }
    Ok(transferred)
}

#[tauri::command]
fn trash_items(paths: Vec<String>) -> Result<u32, String> {
    let mut deleted = 0u32;
    for s in paths {
        let p = PathBuf::from(s);
        if protected_location(&p) { return Err("For safety, system roots and your home folder cannot be moved to Trash.".into()); }
        trash::delete(&p).map_err(err)?;
        deleted += 1;
    }
    Ok(deleted)
}

#[tauri::command]
fn open_item(path: String, reveal: bool) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.exists() { return Err("Item no longer exists.".into()); }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        if reveal { cmd.arg("-R"); }
        cmd.arg(p).spawn().map_err(err)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let target = if reveal { p.parent().unwrap_or(&p).to_path_buf() } else { p };
        Command::new("xdg-open").arg(target).spawn().map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
fn quick_look(path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if fs::symlink_metadata(&p).is_err() { return Err("Item no longer exists.".into()); }
    #[cfg(target_os = "macos")]
    {
        // Quick Look's command-line preview is a separate native macOS window.
        Command::new("/usr/bin/qlmanage")
            .arg("-p").arg(&p)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn().map_err(err)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        Command::new("xdg-open").arg(p).spawn().map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
fn read_preview(path: String) -> Result<Preview, String> {
    let p = PathBuf::from(path);
    if !p.is_file() { return Err("Previews are only available for files.".into()); }
    let ext = extension(&p);
    let image_mime = match ext.as_str() {
        "png" => Some("image/png"), "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"), "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"), "bmp" => Some("image/bmp"), _ => None,
    };
    let meta = fs::metadata(&p).map_err(err)?;
    if let Some(mime) = image_mime {
        if meta.len() > 6 * 1024 * 1024 { return Ok(Preview { preview_type: "unavailable".into(), content: String::new(), truncated: false }); }
        let bytes = fs::read(p).map_err(err)?;
        return Ok(Preview { preview_type: "image".into(), content: format!("data:{mime};base64,{}", STANDARD.encode(bytes)), truncated: false });
    }
    let text = ["txt", "md", "json", "rs", "toml", "yaml", "yml", "csv", "log", "xml", "html", "css", "js", "jsx", "ts", "tsx", "py", "go", "swift", "sh", "gitignore", "env"];
    if text.contains(&ext.as_str()) || ext.is_empty() {
        let f = fs::File::open(p).map_err(err)?;
        let mut bytes = Vec::new();
        f.take(64 * 1024).read_to_end(&mut bytes).map_err(err)?;
        if bytes.iter().any(|b| *b == 0) { return Ok(Preview { preview_type: "unavailable".into(), content: String::new(), truncated: false }); }
        return Ok(Preview { preview_type: "text".into(), content: String::from_utf8_lossy(&bytes).into_owned(), truncated: meta.len() > 64 * 1024 });
    }
    Ok(Preview { preview_type: "unavailable".into(), content: String::new(), truncated: false })
}


// Space Cleaner is a read-only, bounded scan. It never removes files.
// All cleaning is routed through trash_items, after an explicit UI confirmation.
const MAX_SCAN_ENTRIES: u64 = 250_000;
const MAX_SCAN_RESULTS: usize = 500;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LargeFile {
    name: String,
    path: String,
    size: u64,
    modified: Option<u64>,
    category: String,
    extension: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpaceCategory {
    name: String,
    bytes: u64,
    count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanReport {
    root: String,
    scanned_files: u64,
    scanned_bytes: u64,
    matching_files: u64,
    matching_bytes: u64,
    unreadable: u64,
    limited: bool,
    drive_total: Option<u64>,
    drive_available: Option<u64>,
    categories: Vec<SpaceCategory>,
    files: Vec<LargeFile>,
}

fn space_category(ext: &str) -> &'static str {
    match ext {
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v" => "Videos",
        "jpg" | "jpeg" | "png" | "heic" | "raw" | "cr2" | "nef" | "arw" | "tif" | "tiff" | "psd" | "webp" => "Images",
        "zip" | "rar" | "7z" | "tar" | "gz" | "dmg" | "iso" | "pkg" => "Archives",
        "mp3" | "wav" | "flac" | "aac" | "aiff" | "m4a" => "Audio",
        "pdf" | "docx" | "doc" | "pptx" | "ppt" | "xlsx" | "xls" | "pages" | "key" | "numbers" => "Documents",
        _ => "Other",
    }
}

fn scan_space_sync(root: &Path, min_size_mb: u64, include_hidden: bool) -> Result<ScanReport, String> {
    if !root.is_dir() { return Err("Choose an accessible folder to scan.".into()); }
    let root = root.canonicalize().map_err(err)?;
    // Skip the user Library during a general home scan, unless the user selects Library itself.
    let library = home_dir().join("Library");
    let skip_library = !root.starts_with(&library);
    let mut folders = vec![root.clone()];
    let mut files = Vec::<LargeFile>::new();
    let mut scanned_files = 0u64;
    let mut scanned_bytes = 0u64;
    let mut matching_files = 0u64;
    let mut matching_bytes = 0u64;
    let mut unreadable = 0u64;
    let mut visited = 0u64;
    let mut limited = false;
    let mut categories = BTreeMap::<String, (u64, u64)>::new();
    let min_bytes = min_size_mb.saturating_mul(1024 * 1024);
    while let Some(dir) = folders.pop() {
        let listing = match fs::read_dir(&dir) {
            Ok(v) => v,
            Err(_) => { unreadable += 1; continue; }
        };
        for result in listing {
            visited += 1;
            if visited > MAX_SCAN_ENTRIES { limited = true; break; }
            let entry = match result { Ok(e) => e, Err(_) => { unreadable += 1; continue; } };
            let name = entry.file_name().to_string_lossy().into_owned();
            if !include_hidden && name.starts_with('.') { continue; }
            let path = entry.path();
            if skip_library && path.starts_with(&library) { continue; }
            let meta = match fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(_) => { unreadable += 1; continue; }
            };
            // Never follow symlinks, including to another volume, or traverse app bundles.
            if meta.file_type().is_symlink() { continue; }
            if meta.is_dir() {
                if name.ends_with(".app") || name.ends_with(".bundle") || name.ends_with(".framework") { continue; }
                folders.push(path);
                continue;
            }
            if !meta.is_file() { continue; }
            let size = meta.len();
            scanned_files += 1;
            scanned_bytes = scanned_bytes.saturating_add(size);
            let ext = extension(&path);
            let category = space_category(&ext).to_string();
            let bucket = categories.entry(category.clone()).or_insert((0, 0));
            bucket.0 = bucket.0.saturating_add(size);
            bucket.1 += 1;
            if size >= min_bytes {
                matching_files += 1;
                matching_bytes = matching_bytes.saturating_add(size);
                files.push(LargeFile {
                    name,
                    path: str_path(&path),
                    size,
                    modified: meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()),
                    extension: ext,
                    category,
                });
            }
        }
        if limited { break; }
    }
    files.sort_unstable_by(|a,b| b.size.cmp(&a.size).then_with(|| a.path.cmp(&b.path)));
    files.truncate(MAX_SCAN_RESULTS);
    let mut groups: Vec<_> = categories.into_iter().map(|(name, (bytes, count))| SpaceCategory {name,bytes,count}).collect();
    groups.sort_by(|a,b| b.bytes.cmp(&a.bytes));
    Ok(ScanReport {
        root: str_path(&root), scanned_files, scanned_bytes, matching_files, matching_bytes,
        unreadable, limited, drive_total: fs2::total_space(&root).ok(),
        drive_available: fs2::available_space(&root).ok(), categories: groups, files,
    })
}

#[tauri::command]
fn trash_scanned_files(files: Vec<LargeFile>) -> Result<u32, String> {
    if files.is_empty() { return Ok(0); }
    // Preflight EVERY selected file. Refuse to trash content changed since scanning.
    // This is an extra safeguard against stale selections, not a permanent-delete API.
    for file in &files {
        let path = Path::new(&file.path);
        if protected_location(path) { return Err("Protected locations cannot be moved to Trash.".into()); }
        let meta = fs::symlink_metadata(path).map_err(|_| format!("File no longer exists: {}", file.name))?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != file.size {
            return Err(format!("{} has changed since scanning. Scan again before cleaning.", file.name));
        }
        let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs());
        if modified != file.modified {
            return Err(format!("{} has changed since scanning. Scan again before cleaning.", file.name));
        }
    }
    let mut moved = 0;
    for file in files {
        trash::delete(&file.path).map_err(|e| format!("Moved {moved} file(s), then failed on {}: {e}", file.name))?;
        moved += 1;
    }
    Ok(moved)
}

#[tauri::command]
async fn scan_space(root: String, min_size_mb: u64, include_hidden: bool) -> Result<ScanReport, String> {
    // Disk enumeration happens on a blocking pool, never the UI main thread.
    tauri::async_runtime::spawn_blocking(move || {
        scan_space_sync(Path::new(&root), min_size_mb.clamp(1, 1024 * 1024), include_hidden)
    }).await.map_err(err)?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            bootstrap, list_directory, search_files, create_folder, rename_item,
            transfer_items, trash_items, open_item, quick_look, read_preview, scan_space, trash_scanned_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vela Explorer");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_names() {
        assert!(valid_name("..").is_err());
        assert!(valid_name("bad/name").is_err());
        assert_eq!(valid_name("good.txt").unwrap(), "good.txt");
    }
    #[test]
    fn types_are_classified() {
        assert_eq!(kind_of(Path::new("photo.png"), false), "Image");
        assert_eq!(kind_of(Path::new("hello.rs"), false), "Source Code");
    }
    #[test]
    fn cleaner_categories() {
        assert_eq!(space_category("mov"), "Videos");
        assert_eq!(space_category("dmg"), "Archives");
        assert_eq!(space_category("pdf"), "Documents");
    }
    #[test]
    fn cleaner_rejects_non_directory() {
        assert!(scan_space_sync(Path::new("/this/path/should/not/exist/vela"), 100, false).is_err());
    }
    #[test]
    fn protects_critical_folders() {
        assert!(protected_location(Path::new("/")));
        assert!(protected_location(&home_dir()));
    }
}
